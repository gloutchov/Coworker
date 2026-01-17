import re
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import (
    PROMPT_CHAT_SYSTEM,
    PROMPT_CHAT_WEB_SYSTEM, PROMPT_CHAT_WEB_USER_TEMPLATE, PROMPT_CHAT_WEB_FALLBACK,
    WEB_SEARCH_MAX_RESULTS, RAG_TOP_K_DEFAULT,
    PROMPT_RAG_CHATS_SYSTEM, PROMPT_RAG_CHATS_USER_TEMPLATE,
)
from modules.db.chats import (
    insert_chat_session,
    list_chat_sessions,
    get_chat_session,
    delete_chat_session,
    clear_chat_chunks_for_chat,
    update_chat_session_title,
)
from rag import index_chat_session_for_rag, get_relevant_chat_chunks
from modules.websearch.search import web_search
from modules.mcp.schemas import MCPContextBlock
from modules.mcp.manager import execute_service, is_enabled as mcp_is_enabled
from modules.llm.context_window import prepare_history_window, adjust_retrieval_top_k
from modules.llm.streaming import build_llm_response
from modules.config.preferences import (
    apply_user_info_to_system_prompt,
    get_llm_model_info,
    is_llm_thinking_enabled,
    get_llm_model_id,
    get_llm_model_vision_id,
    get_llm_model_thinking_id,
    get_api_provider_settings,
    is_api_provider_enabled_for_mode,
    is_llm_thoughts_visible,
)
from modules.utils.i18n import normalize_language, build_response_instruction, get_prompt_text

NOTE_CONTEXT_MAX_CHARS = 8000
MAX_IMAGE_COUNT = 4
MAX_IMAGE_BASE64_CHARS = 8_000_000


class ChatRequest(BaseModel):
    prompt: str
    history: Optional[List[dict]] = None
    mcp_context: Optional[List[MCPContextBlock]] = None
    note_context: Optional[str] = None
    images: Optional[List[str]] = None
    image_mode: Optional[str] = None
    thinking_mode: Optional[bool] = None
    language: Optional[str] = None


class ChatSessionCreate(BaseModel):
    mode: str
    title: str
    content: str


class ChatSessionSummary(BaseModel):
    id: int
    mode: str
    title: str
    created_at: str


class ChatSessionDetail(ChatSessionSummary):
    content: str


class ChatUpdateTitle(BaseModel):
    title: str


class AskChatsRequest(BaseModel):
    question: str
    top_k: int = RAG_TOP_K_DEFAULT
    history: Optional[List[dict]] = None
    language: Optional[str] = None


router = APIRouter()


def _prepare_mcp_context(blocks: Optional[List[MCPContextBlock]]):
    if not blocks:
        return "", []

    parts: List[str] = []
    sources: List[dict] = []
    for block in blocks:
        content = (block.content or "").strip()
        title = block.title or block.client
        parts.append(f"[Servizio @{block.client} - {title}]\n{content}")
        sources.append(
            {
                "source": "mcp",
                "client": block.client,
                "title": title,
                "description": block.description,
                "content": content,
            }
        )
    return "\n\n".join(parts), sources


def _auto_mcp_from_prompt(prompt: Optional[str]):
    if not prompt:
        return None
    if not mcp_is_enabled():
        return None
    stripped = prompt.strip()
    if not stripped.startswith("@"):
        return None
    match = re.match(r"^@([^\s:]+)[:\s]+([\s\S]+)$", stripped)
    if not match:
        return None
    client = match.group(1).strip().lower()
    payload = (match.group(2) or "").strip()
    if not client or not payload:
        return None
    try:
        result = execute_service(client, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    block = MCPContextBlock(
        client=result.get("client") or client,
        title=result.get("title") or client,
        description=result.get("description") or "",
        content=result.get("content") or payload,
    )
    return payload, [block]


@router.get("/chats", response_model=List[ChatSessionSummary])
def api_list_chats():
    return list_chat_sessions()


@router.get("/chats/{chat_id}", response_model=ChatSessionDetail)
def api_get_chat(chat_id: int):
    sess = get_chat_session(chat_id)
    if sess is None:
        raise HTTPException(status_code=404, detail="Chat non trovata.")
    return sess


@router.post("/chats", response_model=ChatSessionSummary)
def api_create_chat(req: ChatSessionCreate):
    chat_id = insert_chat_session(req.mode, req.title, req.content)
    sess = get_chat_session(chat_id)
    if sess is None:
        raise HTTPException(status_code=500, detail="Impossibile leggere la chat appena salvata.")
    index_chat_session_for_rag(chat_id=sess["id"], title=sess["title"], content_json=sess["content"])
    return ChatSessionSummary(**sess)


@router.delete("/chats/{chat_id}")
def api_delete_chat(chat_id: int):
    sess = get_chat_session(chat_id)
    if sess is None:
        raise HTTPException(status_code=404, detail="Chat non trovata.")
    clear_chat_chunks_for_chat(chat_id)
    delete_chat_session(chat_id)
    return {"status": "ok"}


@router.patch("/chats/{chat_id}", response_model=ChatSessionSummary)
def api_update_chat_title(chat_id: int, req: ChatUpdateTitle):
    sess = get_chat_session(chat_id)
    if sess is None:
        raise HTTPException(status_code=404, detail="Chat non trovata.")
    new_title = (req.title or "").strip() or "Chat senza titolo"
    update_chat_session_title(chat_id, new_title)
    updated = get_chat_session(chat_id)
    if updated is None:
        raise HTTPException(status_code=500, detail="Errore durante la lettura della chat aggiornata.")
    return ChatSessionSummary(**updated)


@router.post("/chat")
def chat(req: ChatRequest):
    effective_language = normalize_language(req.language)
    system = apply_user_info_to_system_prompt(
        get_prompt_text(PROMPT_CHAT_SYSTEM, effective_language)
    )
    use_external = is_api_provider_enabled_for_mode("chat")
    provider_settings = get_api_provider_settings() if use_external else {}
    if use_external:
        if not provider_settings.get("api_base_url") or not provider_settings.get("api_model"):
            raise HTTPException(
                status_code=400,
                detail="Configura base URL e modello nel pannello API per usare il provider esterno.",
            )
    
    # 1. Risoluzione del modello di destinazione
    default_id = get_llm_model_id()
    vision_id = get_llm_model_vision_id()
    thinking_id = get_llm_model_thinking_id()
    
    target_model_id = default_id
    
    # Priorità: 
    # 1. Se ci sono immagini -> Vision Model (se configurato)
    # 2. Se thinking è richiesto -> Thinking Model (se configurato)
    # 3. Altrimenti -> Default Model
    
    has_images = req.images and len(req.images) > 0
    # Thinking attivo se richiesto esplicitamente nel payload o globalmente
    req_thinking = req.thinking_mode if req.thinking_mode is not None else is_llm_thinking_enabled()
    
    if not use_external:
        if has_images and vision_id:
            target_model_id = vision_id
        elif req_thinking and thinking_id:
            target_model_id = thinking_id
        
    # Recuperiamo info sul modello target per verificare capabilities
    if use_external:
        model_info = {
            "capabilities": {
                "vision": bool(provider_settings.get("api_supports_vision")),
                "ocr": bool(provider_settings.get("api_supports_ocr")),
                "thinking": bool(provider_settings.get("api_supports_thinking")),
            }
        }
        target_model_id = provider_settings.get("api_model") or target_model_id
    else:
        model_info = get_llm_model_info(target_model_id)
    
    # Verifica capability "vision" se ci sono immagini
    if has_images and not model_info.get("capabilities", {}).get("vision"):
        # Se siamo caduti qui, significa che non c'è un vision model specifico 
        # oppure il vision model scelto non ha capability vision (errore config?)
        # Proviamo a vedere se il default ha vision
        if use_external:
            raise HTTPException(status_code=400, detail="Il provider selezionato non supporta immagini.")
        fallback_info = get_llm_model_info(default_id)
        if fallback_info.get("capabilities", {}).get("vision"):
            target_model_id = default_id
            model_info = fallback_info
        else:
            raise HTTPException(status_code=400, detail="Il modello selezionato non supporta immagini.")

    show_thoughts = is_llm_thoughts_visible()

    # Verifica capability "thinking" se richiesto
    thinking_enabled = False
    if req_thinking:
        if model_info.get("capabilities", {}).get("thinking"):
            thinking_enabled = True
        elif not use_external and target_model_id == thinking_id:
            # Se ho selezionato specificamente il thinking model ma il config dice no thinking?
            # Fidiamoci del flag capability
            pass
        else:
            # Fallback thinking? Se l'utente vuole thinking ma il modello corrente non lo fa...
            # Se non abbiamo un thinking model specifico, amen.
            pass

    if thinking_enabled:
        if show_thoughts:
            system = (
                f"{system}\n\nModalita thinking attiva: se utile, racchiudi il ragionamento tra <think>...</think> "
                "e poi fornisci una risposta finale completa e separata, senza tag."
            )
        else:
            system = (
                f"{system}\n\nModalita thinking attiva: ragiona internamente e fornisci solo la risposta finale, "
                "senza mostrare i passaggi."
            )

    history_messages: List[dict] = []
    if req.history:
        for m in req.history:
            q, a = (m.get("question") or "").strip(), (m.get("answer") or "").strip()
            if q:
                history_messages.append({"role": "user", "content": q})
            if a:
                history_messages.append({"role": "assistant", "content": a})
    user_prompt = req.prompt
    image_urls = [img for img in (req.images or []) if isinstance(img, str) and img.strip()]
    
    if image_urls:
        if len(image_urls) > MAX_IMAGE_COUNT:
            raise HTTPException(status_code=400, detail=f"Numero massimo di immagini: {MAX_IMAGE_COUNT}.")
        for image_url in image_urls:
            if not image_url.startswith("data:image/"):
                raise HTTPException(status_code=400, detail="Formato immagine non supportato (usa data URL).")
            if len(image_url) > MAX_IMAGE_BASE64_CHARS:
                raise HTTPException(status_code=400, detail="Immagine troppo grande.")
        image_mode = (req.image_mode or "").strip().lower()
        if image_mode == "ocr":
            if not model_info.get("capabilities", {}).get("ocr"):
                # Non bloccante, ma avviso? O fallback? Per ora exception come prima
                raise HTTPException(status_code=400, detail="Il modello selezionato non supporta OCR.")
            user_prompt = (
                f"{user_prompt}\n\nSe l'immagine contiene testo, estrailo fedelmente e riportalo in modo chiaro."
            )
        else:
            user_prompt = f"{user_prompt}\n\nDescrivi l'immagine in modo conciso e utile."
            
    context_blocks = req.mcp_context or []
    if not context_blocks:
        auto = _auto_mcp_from_prompt(user_prompt)
        if auto:
            user_prompt, context_blocks = auto

    context_text, extra_sources = _prepare_mcp_context(context_blocks)
    note_context = (req.note_context or "").strip()
    if note_context:
        note_context = note_context[:NOTE_CONTEXT_MAX_CHARS]
    else:
        note_context = ""
    base_question = user_prompt

    context_sections: List[str] = []
    extra_context_texts: List[str] = []
    has_mcp_context = False

    if context_text:
        has_mcp_context = True
        context_sections.append(
            "Hai ricevuto i seguenti dati provenienti da servizi MCP configurati.\n"
            "Considerali affidabili e se contengono gia la risposta, riportala direttamente citando la fonte MCP.\n"
            f"{context_text}"
        )
        extra_context_texts.append(context_text)

    if note_context:
        context_sections.append(
            "Nota corrente dell'utente (mantieni stile, struttura e terminologia quando la estendi o la modifichi):\n"
            f"{note_context}"
        )
        extra_context_texts.append(note_context)

    final_prompt = base_question
    if context_sections:
        clause_keys: List[str] = []
        if has_mcp_context:
            clause_keys.append("mcp_sources")
        if note_context:
            clause_keys.append("note_style")
        instructions_text = build_response_instruction(effective_language, clause_keys)
        final_prompt = (
            "\n\n".join(context_sections)
            + "\n\n"
            f"Domanda: {base_question}\n"
            f"{instructions_text}"
        )
    else:
        final_prompt = f"{base_question}\n\n{build_response_instruction(effective_language)}"
    trimmed_history, context_plan = prepare_history_window(
        base_question,
        history_messages,
        extra_context_texts,
    )

    return build_llm_response(
        system,
        final_prompt,
        trimmed_history,
        response_field="response",
        extra_sources=extra_sources,
        extra_payload={"context_plan": context_plan, "model_id": target_model_id},
        max_tokens_override=context_plan.get("response_tokens_budget"),
        image_urls=image_urls,
        strip_thoughts=thinking_enabled and not show_thoughts,
        model_id=target_model_id,
        request_mode="chat",
    )


@router.post("/ask-chats")
def ask_chats(req: AskChatsRequest):
    use_external = is_api_provider_enabled_for_mode("history")
    effective_language = normalize_language(req.language)
    provider_settings = get_api_provider_settings() if use_external else {}
    if use_external:
        if not provider_settings.get("api_base_url") or not provider_settings.get("api_model"):
            raise HTTPException(
                status_code=400,
                detail="Configura base URL e modello nel pannello API per usare il provider esterno.",
            )
    effective_top_k = adjust_retrieval_top_k(req.top_k, RAG_TOP_K_DEFAULT)
    top_chunks = get_relevant_chat_chunks(req.question, effective_top_k)
    if not top_chunks:
        return {"error": "Nessuna chat indicizzata o nessun messaggio rilevante nelle chat salvate."}

    parts, sources = [], []
    for rec in top_chunks:
        header = (
            f"=== CHAT ID: {rec['chat_id']} – {rec['title']} "
            f"(messaggio {rec['msg_index']}) ==="
        )
        parts.append(f"{header}\n{rec['text']}")
        sources.append(
            {
                "chat_id": rec["chat_id"],
                "title": rec["title"],
                "msg_index": rec["msg_index"],
            }
        )

    context_text = "\n\n".join(parts)
    user_prompt = get_prompt_text(PROMPT_RAG_CHATS_USER_TEMPLATE, effective_language).format(
        context_text=context_text,
        question=req.question,
    )
    user_prompt = f"{user_prompt}\n\n{build_response_instruction(effective_language)}"
    system = apply_user_info_to_system_prompt(
        get_prompt_text(PROMPT_RAG_CHATS_SYSTEM, effective_language)
    )
    
    # Logic for model selection (thinking priority)
    default_id = get_llm_model_id()
    thinking_id = get_llm_model_thinking_id()
    
    # In ask-chats we don't have images, so we only check thinking
    req_thinking = is_llm_thinking_enabled() # TODO: add thinking_mode to AskChatsRequest if needed?
    # For now, stick to global preference for ask-chats, or check if we want to enable override here too.
    # The user request "La stessa cosa potrebbe avvenire in Chat Documenti" (RAG/docs) but didn't explicitly mention History.
    # However, for consistency, let's use the thinking model if global pref is on.
    
    target_model_id = default_id
    if not use_external and req_thinking and thinking_id:
        target_model_id = thinking_id

    if use_external:
        model_info = {
            "capabilities": {
                "thinking": bool(provider_settings.get("api_supports_thinking")),
            }
        }
        target_model_id = provider_settings.get("api_model") or target_model_id
    else:
        model_info = get_llm_model_info(target_model_id)
    show_thoughts = is_llm_thoughts_visible()
    thinking_enabled = bool(req_thinking and model_info.get("capabilities", {}).get("thinking"))

    if thinking_enabled:
        if show_thoughts:
            system = (
                f"{system}\n\nModalita thinking attiva: se utile, racchiudi il ragionamento tra <think>...</think> "
                "e poi fornisci una risposta finale completa e separata, senza tag."
            )
        else:
            system = (
                f"{system}\n\nModalita thinking attiva: ragiona internamente e fornisci solo la risposta finale, "
                "senza mostrare i passaggi."
            )

    history_messages: list[dict] = []
    if req.history:
        for m in req.history:
            q = (m.get("question") or "").strip()
            a = (m.get("answer") or "").strip()
            if q:
                history_messages.append({"role": "user", "content": q})
            if a:
                history_messages.append({"role": "assistant", "content": a})

    trimmed_history, context_plan = prepare_history_window(
        req.question,
        history_messages,
        [context_text],
    )

    return build_llm_response(
        system,
        user_prompt,
        trimmed_history,
        response_field="answer",
        extra_sources=sources,
        extra_payload={"context_plan": context_plan},
        max_tokens_override=context_plan.get("response_tokens_budget"),
        strip_thoughts=thinking_enabled and not show_thoughts,
        model_id=target_model_id,
        request_mode="history",
    )


@router.post("/chat-web")
def chat_with_web(req: ChatRequest):
    print(f"[API] Richiesta a /api/chat-web per: '{req.prompt[:70]}...'")
    effective_language = normalize_language(req.language)
    system = apply_user_info_to_system_prompt(
        get_prompt_text(PROMPT_CHAT_WEB_SYSTEM, effective_language)
    )
    use_external = is_api_provider_enabled_for_mode("chat")
    provider_settings = get_api_provider_settings() if use_external else {}
    if use_external:
        if not provider_settings.get("api_base_url") or not provider_settings.get("api_model"):
            raise HTTPException(
                status_code=400,
                detail="Configura base URL e modello nel pannello API per usare il provider esterno.",
            )
    
    # 1. Risoluzione del modello di destinazione
    default_id = get_llm_model_id()
    vision_id = get_llm_model_vision_id()
    thinking_id = get_llm_model_thinking_id()
    
    target_model_id = default_id
    
    has_images = req.images and len(req.images) > 0
    req_thinking = req.thinking_mode if req.thinking_mode is not None else is_llm_thinking_enabled()
    
    if not use_external:
        if has_images and vision_id:
            target_model_id = vision_id
        elif req_thinking and thinking_id:
            target_model_id = thinking_id
        
    if use_external:
        model_info = {
            "capabilities": {
                "vision": bool(provider_settings.get("api_supports_vision")),
                "ocr": bool(provider_settings.get("api_supports_ocr")),
                "thinking": bool(provider_settings.get("api_supports_thinking")),
            }
        }
        target_model_id = provider_settings.get("api_model") or target_model_id
    else:
        model_info = get_llm_model_info(target_model_id)
    
    # Fallback Vision
    if has_images and not model_info.get("capabilities", {}).get("vision"):
        if use_external:
            raise HTTPException(status_code=400, detail="Il provider selezionato non supporta immagini.")
        fallback_info = get_llm_model_info(default_id)
        if fallback_info.get("capabilities", {}).get("vision"):
            target_model_id = default_id
            model_info = fallback_info
        else:
            raise HTTPException(status_code=400, detail="Il modello selezionato non supporta immagini.")

    show_thoughts = is_llm_thoughts_visible()

    # Thinking check
    thinking_enabled = False
    if req_thinking and model_info.get("capabilities", {}).get("thinking"):
        thinking_enabled = True

    if thinking_enabled:
        if show_thoughts:
            system = (
                f"{system}\n\nModalita thinking attiva: se utile, racchiudi il ragionamento tra <think>...</think> "
                "e poi fornisci una risposta finale completa e separata, senza tag."
            )
        else:
            system = (
                f"{system}\n\nModalita thinking attiva: ragiona internamente e fornisci solo la risposta finale, "
                "senza mostrare i passaggi."
            )
    history_messages: List[dict] = []
    if req.history:
        for m in req.history:
            q, a = (m.get("question") or "").strip(), (m.get("answer") or "").strip()
            if q:
                history_messages.append({"role": "user", "content": q})
            if a:
                history_messages.append({"role": "assistant", "content": a})
    context_blocks = req.mcp_context or []
    req_prompt_clean = req.prompt
    image_urls = [img for img in (req.images or []) if isinstance(img, str) and img.strip()]
    if image_urls:
        if len(image_urls) > MAX_IMAGE_COUNT:
            raise HTTPException(status_code=400, detail=f"Numero massimo di immagini: {MAX_IMAGE_COUNT}.")
        for image_url in image_urls:
            if not image_url.startswith("data:image/"):
                raise HTTPException(status_code=400, detail="Formato immagine non supportato (usa data URL).")
            if len(image_url) > MAX_IMAGE_BASE64_CHARS:
                raise HTTPException(status_code=400, detail="Immagine troppo grande.")
        image_mode = (req.image_mode or "").strip().lower()
        if image_mode == "ocr":
            if not model_info.get("capabilities", {}).get("ocr"):
                raise HTTPException(status_code=400, detail="Il modello selezionato non supporta OCR.")
            req_prompt_clean = (
                f"{req_prompt_clean}\n\nSe l'immagine contiene testo, estrailo fedelmente e riportalo in modo chiaro."
            )
        else:
            req_prompt_clean = f"{req_prompt_clean}\n\nDescrivi l'immagine in modo conciso e utile."
    if not context_blocks:
        auto_context = _auto_mcp_from_prompt(req.prompt)
        if auto_context:
            req_prompt_clean, context_blocks = auto_context

    mcp_text, mcp_sources = _prepare_mcp_context(context_blocks)
    note_context = (req.note_context or "").strip()
    if note_context:
        note_context = note_context[:NOTE_CONTEXT_MAX_CHARS]
    else:
        note_context = ""

    results = web_search(req_prompt_clean, max_results=WEB_SEARCH_MAX_RESULTS)
    if not results:
        fallback_prompt = get_prompt_text(
            PROMPT_CHAT_WEB_FALLBACK,
            effective_language,
        ).format(question=req_prompt_clean)
        clause_keys: List[str] = []
        if mcp_text:
            fallback_prompt = (
                "Hai ricevuto anche i seguenti dati MCP considerati affidabili. "
                "Se contengono gia la risposta, riportala direttamente citando MCP.\n"
                f"{mcp_text}\n\n"
                f"{fallback_prompt}"
            )
            clause_keys.append("mcp_sources")
        if note_context:
            fallback_prompt = (
                f"{fallback_prompt}\n\n"
                "Nota corrente dell'utente (mantieni stile e coerenza se devi proseguire o correggere il testo):\n"
                f"{note_context}"
            )
            clause_keys.append("note_style")
        fallback_prompt = f"{fallback_prompt}\n\n{build_response_instruction(effective_language, clause_keys)}"
        extra_contexts: List[str] = []
        if mcp_text:
            extra_contexts.append(mcp_text)
        if note_context:
            extra_contexts.append(note_context)
        trimmed_history, context_plan = prepare_history_window(
            req_prompt_clean,
            history_messages,
            extra_contexts,
        )

        return build_llm_response(
            system,
            fallback_prompt,
            trimmed_history,
            response_field="response",
            extra_sources=mcp_sources,
            extra_payload={"context_plan": context_plan, "model_id": target_model_id},
            max_tokens_override=context_plan.get("response_tokens_budget"),
            image_urls=image_urls,
            strip_thoughts=thinking_enabled and not show_thoughts,
            model_id=target_model_id,
            request_mode="chat",
        )
    parts = []
    for idx, r in enumerate(results, start=1):
        title, snippet, url = r.get("title", ""), r.get("snippet", ""), r.get("url", "")
        parts.append(f"[RISULTATO {idx}]\nTITOLO: {title}\nURL: {url}\nTESTO:\n{snippet}\n")
    context = "\n\n".join(parts)
    user_prompt = get_prompt_text(
        PROMPT_CHAT_WEB_USER_TEMPLATE,
        effective_language,
    ).format(context=context, question=req_prompt_clean)
    if mcp_text:
        user_prompt = (
            f"{user_prompt}\n\nDati MCP disponibili (trattali come affidabili e se contengono gia la risposta, riportala direttamente citando MCP):\n{mcp_text}"
        )
    clause_keys: List[str] = []
    if mcp_text:
        clause_keys.append("mcp_sources")
    if note_context:
        user_prompt = (
            f"{user_prompt}\n\nNota corrente dell'utente (mantieni stile, struttura e terminologia quando continui o riscrivi il testo):\n{note_context}"
        )
        clause_keys.append("note_style")
    user_prompt = f"{user_prompt}\n\n{build_response_instruction(effective_language, clause_keys)}"
    combined_sources = list(results)
    if mcp_sources:
        combined_sources.extend(mcp_sources)

    extra_contexts = [context]
    if mcp_text:
        extra_contexts.append(mcp_text)
    if note_context:
        extra_contexts.append(note_context)

    trimmed_history, context_plan = prepare_history_window(
        req_prompt_clean,
        history_messages,
        extra_contexts,
    )

    return build_llm_response(
        system,
        user_prompt,
        trimmed_history,
        response_field="response",
        extra_sources=combined_sources,
        extra_payload={"context_plan": context_plan, "model_id": target_model_id},
        max_tokens_override=context_plan.get("response_tokens_budget"),
        image_urls=image_urls,
        strip_thoughts=thinking_enabled and not show_thoughts,
        model_id=target_model_id,
        request_mode="chat",
    )
