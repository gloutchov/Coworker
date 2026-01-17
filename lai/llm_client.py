from typing import Generator, List, Dict, Any, Optional, Union
from pathlib import Path
from llama_cpp import Llama
from llama_cpp.llama_chat_format import ChatFormatterResponse
try:
    from llama_cpp.llama_chat_format import Llava15ChatHandler, Llava16ChatHandler, Qwen25VLChatHandler
except ImportError:
    try:
        from llama_cpp.llama_chat_format import Llava15ChatHandler
        Llava16ChatHandler = None
        Qwen25VLChatHandler = None
    except ImportError:
        Llava15ChatHandler = None
        Llava16ChatHandler = None
        Qwen25VLChatHandler = None

from config import (
    MODEL_PATH,
    LLM_VERBOSE,
    LLM_TEMPERATURE,
    LLM_TOP_P,
    LLM_MAX_TOKENS,
    EMBEDDING_NORMALIZE,
    LLM_DYNAMIC_MAX_N_CTX,
)
from modules.config.preferences import get_llm_model_info, resolve_models_path
from modules.config.preferences import get_api_provider_settings, is_api_provider_enabled_for_mode
from modules.providers.openai_compat import (
    chat_completion as openai_chat_completion,
    stream_chat_completion as openai_stream_chat_completion,
)


_llm: Llama | None = None
_llm_model_id: str | None = None
_llm_mmproj_path: str | None = None

# --- Custom Handler per Gemma 3 / PaliGemma ---
# Gemma 3 Vision e PaliGemma si aspettano che i token dell'immagine siano
# inseriti prima del testo, spesso con un placeholder <image>.
class Gemma3ChatHandler(Llava15ChatHandler):
    """
    Handler personalizzato per Gemma 3 Vision / PaliGemma.
    Adatta il comportamento di Llava15ChatHandler per posizionare correttamente
    l'embedding dell'immagine (spesso richiesto all'inizio o con template specifico).
    """
    def __call__(
        self,
        *,
        messages: List[Dict[str, Any]],
        **kwargs: Any,
    ) -> ChatFormatterResponse:
        # Intercetta i messaggi per assicurarsi che il formato sia gradito a Gemma 3
        # Molti modelli PaliGemma/Gemma3 preferiscono: <image>\nUser Prompt
        # Invece che il default di LLaVA che a volte lo mette alla fine.
        
        # Nota: La logica interna di Llava15ChatHandler in llama-cpp-python
        # gestisce già il caricamento di clip_model. 
        # Qui forziamo solo il prompt template se necessario, ma per ora
        # ci affidiamo alla sua logica di base, sperando che il binding C++
        # gestisca i token <image> correttamente se glieli passiamo.
        
        # Se necessario, potremmo riscrivere completamente la formattazione qui.
        # Per ora, usiamo l'ereditarietà diretta che spesso basta se il modello C++ 
        # è caricato con il giusto mmproj.
        return super().__call__(messages=messages, **kwargs)


def get_llm(model_id: str | None = None) -> Llama:
    """
    Inizializza (lazy) e restituisce l'istanza Llama condivisa.
    Se model_id e specificato, prova a caricare quel modello (se diverso da quello attuale).
    """
    global _llm
    global _llm_model_id
    global _llm_mmproj_path
    
    model_info = get_llm_model_info(model_id)
    target_id = str(model_info.get("id") or "").lower()
    
    # Se il modello richiesto e diverso da quello caricato, ricarichiamo.
    if _llm is None or _llm_model_id != target_id:
        # Nota: Qui si potrebbe ottimizzare tenendo piu modelli in memoria se la RAM lo permette,
        # ma per sicurezza ricarichiamo (scaricando il precedente).
        if _llm:
            print(f"Cambio modello: {(_llm_model_id or 'unknown')} -> {target_id}")
            # Dereference old model to help GC
            _llm = None
            
        model_path = resolve_models_path(model_info.get("path")) or MODEL_PATH
        mmproj_path = resolve_models_path(model_info.get("mmproj_path"))

        if model_path:
            model_path = str(Path(model_path).resolve())
        if mmproj_path:
            mmproj_path = str(Path(mmproj_path).resolve())
        mmproj_str = str(mmproj_path) if mmproj_path else ""
        
        print(f"Carico il modello da: {model_path}")
        # Resolve to absolute path to avoid CWD issues with llama.cpp
        abs_model_path = str(Path(model_path).resolve())
        handler = None
        if mmproj_path:
            try:
                if Path(mmproj_path).exists():
                    # Selezione dinamica del ChatHandler in base al modello
                    print(f"Configurazione supporto visione per modello: {target_id}")
                    if "qwen" in target_id and Qwen25VLChatHandler:
                        print("Usando Qwen25VLChatHandler")
                        handler = Qwen25VLChatHandler(clip_model_path=str(mmproj_path), verbose=LLM_VERBOSE)
                    elif "gemma" in target_id:
                        # Usa il custom handler per Gemma 3
                        print("Usando Gemma3ChatHandler (custom inheritance from Llava15)")
                        if Llava15ChatHandler:
                             handler = Gemma3ChatHandler(clip_model_path=str(mmproj_path), verbose=LLM_VERBOSE)
                        elif Llava16ChatHandler:
                             print("Gemma3ChatHandler non disponibile (manca Llava15), provo Llava16")
                             handler = Llava16ChatHandler(clip_model_path=str(mmproj_path), verbose=LLM_VERBOSE)
                    elif Llava15ChatHandler:
                        print("Usando Llava15ChatHandler (fallback standard)")
                        handler = Llava15ChatHandler(clip_model_path=str(mmproj_path), verbose=LLM_VERBOSE)
                    else:
                        print("Nessun ChatHandler compatibile trovato.")
            except TypeError as e:
                print(f"Errore inizializzazione ChatHandler: {e}")
                handler = None
            except Exception as e:
                print(f"Errore generico ChatHandler: {e}")
                handler = None
                
        _llm = Llama(
            model_path=abs_model_path,
            n_ctx=LLM_DYNAMIC_MAX_N_CTX,
            embedding=True,
            verbose=LLM_VERBOSE,
            chat_handler=handler,
        )
        _llm_model_id = target_id
        _llm_mmproj_path = mmproj_str
        
    return _llm


def _build_messages(
    system_prompt: str,
    user_prompt: str,
    history: Optional[List[Dict[str, str]]] = None,
    image_urls: Optional[List[str]] = None,
) -> List[Dict[str, str]]:
    messages: List[Dict[str, str]] = [
        {"role": "system", "content": system_prompt},
    ]
    if history:
        messages.extend(history)
    if image_urls:
        content = [{"type": "text", "text": user_prompt}]
        for image_url in image_urls:
            content.append({"type": "image_url", "image_url": {"url": image_url}})
        messages.append({"role": "user", "content": content})
    else:
        messages.append({"role": "user", "content": user_prompt})
    return messages


def chat_completion(
    system_prompt: str,
    user_prompt: str,
    history: Optional[List[Dict[str, str]]] = None,
    *,
    max_tokens: Optional[int] = None,
    image_urls: Optional[List[str]] = None,
    model_id: Optional[str] = None,
    request_mode: Optional[str] = None,
) -> str:
    messages = _build_messages(system_prompt, user_prompt, history, image_urls)
    target_max = max_tokens if max_tokens and max_tokens > 0 else LLM_MAX_TOKENS
    if request_mode and is_api_provider_enabled_for_mode(request_mode):
        settings = get_api_provider_settings()
        base_url = settings.get("api_base_url")
        model = settings.get("api_model") or model_id
        if not base_url or not model:
            raise RuntimeError("Configurazione API incompleta: base URL o modello mancante.")
        return openai_chat_completion(
            base_url,
            settings.get("api_api_key"),
            model,
            messages,
            temperature=LLM_TEMPERATURE,
            top_p=LLM_TOP_P,
            max_tokens=target_max,
        )
    llm = get_llm(model_id)
    result: Dict[str, Any] = llm.create_chat_completion(
        messages=messages,
        temperature=LLM_TEMPERATURE,
        top_p=LLM_TOP_P,
        max_tokens=target_max,
    )
    return result["choices"][0]["message"]["content"]


def stream_chat_completion(
    system_prompt: str,
    user_prompt: str,
    history: Optional[List[Dict[str, str]]] = None,
    *,
    max_tokens: Optional[int] = None,
    image_urls: Optional[List[str]] = None,
    model_id: Optional[str] = None,
    request_mode: Optional[str] = None,
) -> Generator[str, None, None]:
    messages = _build_messages(system_prompt, user_prompt, history, image_urls)
    target_max = max_tokens if max_tokens and max_tokens > 0 else LLM_MAX_TOKENS
    if request_mode and is_api_provider_enabled_for_mode(request_mode):
        settings = get_api_provider_settings()
        base_url = settings.get("api_base_url")
        model = settings.get("api_model") or model_id
        if not base_url or not model:
            raise RuntimeError("Configurazione API incompleta: base URL o modello mancante.")
        for token in openai_stream_chat_completion(
            base_url,
            settings.get("api_api_key"),
            model,
            messages,
            temperature=LLM_TEMPERATURE,
            top_p=LLM_TOP_P,
            max_tokens=target_max,
        ):
            yield token
        return
    llm = get_llm(model_id)
    stream = llm.create_chat_completion(
        messages=messages,
        temperature=LLM_TEMPERATURE,
        top_p=LLM_TOP_P,
        max_tokens=target_max,
        stream=True,
    )
    for part in stream:
        choices = part.get("choices") or []
        if not choices:
            continue
        delta = choices[0].get("delta") or {}
        content = delta.get("content")
        if not content:
            continue
        yield content


def get_embedding(text: str) -> list[float]:
    """
    Restituisce un singolo vettore embedding per il testo dato.
    Replica la tua logica attuale:
    - se emb è una lista di float => la ritorna
    - se è lista di liste (per token) => fa la media sui token
    """
    llm = get_llm()

    emb = llm.embed(text, normalize=EMBEDDING_NORMALIZE)

    if not emb:
        return []

    first = emb[0]

    # Caso: vettore 1D (lista di float)
    if isinstance(first, (float, int)):
        return [float(x) for x in emb]

    # Caso: lista di vettori (uno per token) -> facciamo la media
    num_tokens = len(emb)
    dim = len(emb[0])
    avg = [0.0] * dim

    for vec in emb:
        for i, v in enumerate(vec):
            avg[i] += float(v)

    if num_tokens > 0:
        avg = [v / num_tokens for v in avg]

    return avg
