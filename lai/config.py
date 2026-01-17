# -*- coding: utf-8 -*-

from pathlib import Path
import os

# ==============================================================================
# 1. PERCORSI DI BASE
# ==============================================================================

# Cartella base del progetto
BASE_DIR = Path(__file__).resolve().parent

# Cartella modelli locali
MODELS_DIR = BASE_DIR / "models"

# Percorso del modello GGUF locale
MODEL_PATH = MODELS_DIR / "qwen2.5-3b-instruct-q4_k_m.gguf"

# Catalogo modelli LLM locali disponibili (ora gestito dal database)
LLM_MODEL_DEFAULT_ID = "qwen2.5-3b-instruct"
LLM_MODEL_CATALOG = [
    {
        "id": "qwen2.5-3b-instruct",
        "label": "Qwen2.5 3B Instruct",
        "description": "Modello di default generalista (3B) per chat, analisi numeriche e logica locale.",
        "path": "@lai/models/qwen2.5-3b-instruct-q4_k_m.gguf",
        "context_max": 16384,
        "max_tokens": 2048,
        "capabilities": {
            "vision": False,
            "thinking": True,
            "coding": True,
            "ocr": False,
            "audio": False,
            "analysis": True,
        },
    },
]

# Abilita la modifica dei modelli LLM via UI (ON/OFF)
_EDIT_MODELS_DEFAULT = os.environ.get("EDIT_MODELS", "OFF").strip().upper()
EDIT_MODELS = _EDIT_MODELS_DEFAULT if _EDIT_MODELS_DEFAULT in {"ON", "OFF"} else "OFF"

# Abilita la modifica del percorso modelli via UI (ON/OFF)
_EDIT_MODEL_POSITION_DEFAULT = os.environ.get("EDIT_MODEL_POSITION", "OFF").strip().upper()
EDIT_MODEL_POSITION = (
    _EDIT_MODEL_POSITION_DEFAULT
    if _EDIT_MODEL_POSITION_DEFAULT in {"ON", "OFF"}
    else "OFF"
)

# Cartella dei documenti da indicizzare per il RAG
DOCS_DIR = BASE_DIR / "documents"

# Percorso del database SQLite per indice RAG, chat, cache, etc.
DB_PATH = BASE_DIR / "rag_index.db"


# ==============================================================================
# 2. SERVER WEB (FastAPI / Uvicorn)
# ==============================================================================

# Indirizzo e porta del server. NOTA: allinea API_BASE in app/app.js!
SERVER_HOST = "127.0.0.1"
SERVER_PORT = 8001

# Origini consentite per le richieste CORS. Usa ["*"] per sviluppo locale.
CORS_ALLOWED_ORIGINS = ["*"]

# ==============================================================================
# 2B. UI (Frontend)
# ==============================================================================

# Finestra anti doppio-click per azioni UI (in millisecondi).
UI_CLICK_GUARD_MS = int(os.environ.get("UI_CLICK_GUARD_MS", "400") or "400")
if UI_CLICK_GUARD_MS < 0:
    UI_CLICK_GUARD_MS = 0


# ==============================================================================
# 3. MODELLO LLM (Llama-cpp-python)
# ==============================================================================

# Rilevamento Hardware
try:
    from modules.utils.hardware_info import get_system_specs, suggest_context_limits
    SYSTEM_SPECS = get_system_specs()
    SUGGESTED_BASE, SUGGESTED_MAX = suggest_context_limits(SYSTEM_SPECS)
    print(f"[Config] Hardware rilevato: {SYSTEM_SPECS['ram_gb']}GB RAM, Arch: {SYSTEM_SPECS['arch']}")
    print(f"[Config] Limiti contesto suggeriti: Base={SUGGESTED_BASE}, Max={SUGGESTED_MAX}")
except ImportError:
    # Fallback se modules non e ancora importabile (es. prima installazione)
    SYSTEM_SPECS = {"ram_gb": 8}
    SUGGESTED_BASE, SUGGESTED_MAX = 2048, 4096

# Dimensione massima del contesto del modello (Base)
LLM_MIN_N_CTX = int(os.environ.get("LLM_MIN_N_CTX", "1024") or "1024")
if LLM_MIN_N_CTX < 256:
    LLM_MIN_N_CTX = 256

LLM_N_CTX = int(os.environ.get("LLM_N_CTX", str(SUGGESTED_BASE)))
if LLM_N_CTX < LLM_MIN_N_CTX:
    LLM_N_CTX = LLM_MIN_N_CTX

# Livello di verbosità di llama-cpp-python (True o False)
LLM_VERBOSE = False

# Parametri di generazione del testo
LLM_TEMPERATURE = 0.3  # Più basso = più deterministico
LLM_TOP_P = 0.9        # Nucleus sampling
LLM_MAX_TOKENS = 1024   # Massimo numero di token da generare

# Limiti dinamici per il numero di token di risposta
LLM_RESPONSE_TOKENS_MIN = int(os.environ.get("LLM_RESPONSE_TOKENS_MIN", "192") or "192")
LLM_RESPONSE_TOKENS_MAX = int(os.environ.get("LLM_RESPONSE_TOKENS_MAX", str(LLM_MAX_TOKENS)) or str(LLM_MAX_TOKENS))
LLM_RESPONSE_TOKENS_MARGIN = int(os.environ.get("LLM_RESPONSE_TOKENS_MARGIN", "96") or "96")
if LLM_RESPONSE_TOKENS_MIN < 32:
    LLM_RESPONSE_TOKENS_MIN = 32
if LLM_RESPONSE_TOKENS_MAX < LLM_RESPONSE_TOKENS_MIN:
    LLM_RESPONSE_TOKENS_MAX = LLM_RESPONSE_TOKENS_MIN

# Streaming della risposta del modello (default disattivato)
_STREAMING_DEFAULT = os.environ.get("LLM_STREAMING_MODE", "off").strip().lower()
_STREAMING_ALLOWED = {"off", "tokens", "chunks"}
LLM_STREAMING_MODE = _STREAMING_DEFAULT if _STREAMING_DEFAULT in _STREAMING_ALLOWED else "off"

# Numero minimo di caratteri da accumulare prima di inviare un chunk
LLM_STREAMING_CHUNK_SIZE = int(os.environ.get("LLM_STREAMING_CHUNK_SIZE", "80") or "80")
if LLM_STREAMING_CHUNK_SIZE < 20:
    LLM_STREAMING_CHUNK_SIZE = 20

# Gestione dinamica della finestra di contesto (Max)
LLM_DYNAMIC_MAX_N_CTX = int(os.environ.get("LLM_DYNAMIC_MAX_N_CTX", str(SUGGESTED_MAX)))
if LLM_DYNAMIC_MAX_N_CTX < LLM_N_CTX:
    LLM_DYNAMIC_MAX_N_CTX = LLM_N_CTX
if LLM_DYNAMIC_MAX_N_CTX < LLM_MIN_N_CTX:
    LLM_DYNAMIC_MAX_N_CTX = LLM_MIN_N_CTX

# Heuristics per stimare i token a partire dai caratteri (approx 4 char per token)
LLM_CONTEXT_CHAR_PER_TOKEN = float(os.environ.get("LLM_CONTEXT_CHAR_PER_TOKEN", "4.0") or "4.0")
# Soglia oltre la quale conviene passare alla finestra dinamica (percentuale del contesto base)
LLM_DYNAMIC_TRIGGER_RATIO = float(os.environ.get("LLM_DYNAMIC_TRIGGER_RATIO", "0.85") or "0.85")
# Se normalizzare o meno i vettori di embedding
EMBEDDING_NORMALIZE = True


# ==============================================================================
# 4. RAG (Retrieval-Augmented Generation)
# ==============================================================================

# Numero di chunk più rilevanti da passare al modello come contesto
RAG_TOP_K_DEFAULT = 5

# --- Parametri per la suddivisione in chunk (chunking) ---

# Numero massimo di caratteri per chunk di testo
RAG_CHUNK_MAX_CHARS = 800
# Numero di caratteri di sovrapposizione tra chunk (se si spezza a caratteri)
RAG_CHUNK_OVERLAP = 200

# Numero massimo di righe per chunk (per la suddivisione basata su righe)
RAG_CHUNK_MAX_LINES = 6
# Numero di righe di sovrapposizione tra chunk (per la suddivisione a righe)
RAG_CHUNK_OVERLAP_LINES = 1

# --- Parametri per il parsing di file strutturati ---

# Numero massimo di righe da leggere da file Excel e CSV
RAG_EXCEL_CSV_MAX_ROWS = 300
# Numero massimo di colonne da leggere da file Excel e CSV
RAG_EXCEL_CSV_MAX_COLS = 15

# --- Parametri per la ricerca semantica ---

# Lunghezza minima di una parola per essere considerata "parola chiave" nel bonus lessicale
RAG_MIN_KEYWORD_LEN = 4


# ==============================================================================
# 5. RICERCA WEB
# ==============================================================================

# Abilita/disabilita la funzione di ricerca web
WEB_SEARCH_ENABLED = True

# Numero massimo di risultati da recuperare
WEB_SEARCH_MAX_RESULTS = 5

# Durata della cache per i risultati della ricerca web (in secondi)
# Default: 48 ore (60 * 60 * 24 * 2)
WEB_SEARCH_CACHE_TTL = 172800

# Endpoint API di Wikipedia (o altro motore di ricerca)
WIKIPEDIA_API_ENDPOINT = "https://it.wikipedia.org/w/api.php"

# Contatto email usato per la ricerca web (default vuoto, personalizzabile)
WEB_SEARCH_USER_MAIL = os.environ.get("WEB_SEARCH_USER_MAIL", "").strip()

# Template User-Agent per le richieste API (usa la mail impostata)
WEB_SEARCH_USER_AGENT_TEMPLATE = (
    "Coworker-LocalLLM/0.2 "
    "(demo LLM locale; contatto: {email})"
)

# Stringa User-Agent da usare per le richieste API (default)
WEB_SEARCH_USER_AGENT = WEB_SEARCH_USER_AGENT_TEMPLATE.format(email=WEB_SEARCH_USER_MAIL)

# Timeout in secondi per le richieste web
WEB_SEARCH_TIMEOUT = 10

# Se verificare o meno i certificati SSL (impostare a True in produzione)
WEB_SEARCH_VERIFY_SSL = False


# ==============================================================================
# 6. PROMPT E TEMPLATE
# ==============================================================================

# --- Modalità Chat AI ---
PROMPT_CHAT_SYSTEM = {
    "it": (
        "Sei un assistente focalizzato e preciso. Rispondi SEMPRE in italiano, "
        "usa frasi brevi, evita ripetizioni e non ricopia le domande dell'utente. "
        "Quando non hai dati attendibili dichiara chiaramente il limite."
    ),
    "en": (
        "You are a focused and precise assistant. Answer in English, "
        "use short sentences, avoid repetition, and do not restate the user's questions. "
        "When you lack reliable data, clearly state the limitation."
    ),
}

# --- Modalità RAG su Documenti ---
PROMPT_RAG_DOCS_SYSTEM = {
    "it": """Sei un assistente che combina gli estratti dei documenti locali
con la cronologia della conversazione corrente (domande, risposte e trascrizioni).

Istruzioni operative:
- Per domande sui documenti usa sempre tutti gli estratti forniti.
- Per domande che richiamano chiaramente la cronologia o le trascrizioni (es. \"questo audio\", \"come detto sopra\")
  basati prima su quelle informazioni.
- Quando i dati non sono presenti né negli estratti né nella cronologia dichiaralo apertamente.
- Mantieni le risposte concise e senza ripetere la domanda.
- Non elencare manualmente i nomi dei file o dei chunk: l'interfaccia mostrerà i badge delle fonti.
""",
    "en": """You are an assistant that combines excerpts from local documents
with the current conversation history (questions, answers, and transcripts).

Operational guidelines:
- For document-related questions, always use all provided excerpts.
- For questions that clearly reference the history or transcripts (e.g., \"this audio\", \"as said above\"),
  rely on those sources first.
- When data is not present in the excerpts or history, say so explicitly.
- Keep answers concise and do not repeat the question.
- Do not list file names or chunk IDs manually: the UI will show source badges.
""",
}

PROMPT_RAG_DOCS_USER_TEMPLATE = {
    "it": """Ti fornisco alcuni estratti di documenti locali (ogni blocco è etichettato con il file e il chunk) e la cronologia corrente.

COMPITO:
1) Se la domanda riguarda trascrizioni o messaggi precedenti, usa la cronologia.
2) Se riguarda i documenti, usa tutti gli estratti utili.
3) Se non trovi l'informazione, spiega che non è disponibile.
4) Non creare riferimenti testuali ai file: la UI mostra già i badge delle fonti.

ESTRATTI DOCUMENTI:

{context_text}

DOMANDA: {question}

Rispondi in italiano con una spiegazione chiara e sintetica.""",
    "en": """I am providing excerpts from local documents (each block is labeled with file and chunk) and the current history.

TASK:
1) If the question refers to transcripts or previous messages, use the history.
2) If it refers to documents, use all relevant excerpts.
3) If you cannot find the information, say it is not available.
4) Do not add textual references to files: the UI shows source badges.

DOCUMENT EXCERPTS:

{context_text}

QUESTION: {question}

Answer in English with a clear, concise explanation.""",
}


# --- Modalità RAG su Chat Storiche ---
PROMPT_RAG_CHATS_SYSTEM = {
    "it": """Sei un assistente che usa gli estratti delle chat storiche e la conversazione corrente.
- Confronta la domanda con gli estratti: se contengono la risposta usali tutti.
- Se la domanda riguarda solo questa sessione, usa la cronologia corrente.
- Non inventare contenuti estranei alle chat fornite.
- Non citare manualmente ID o titoli: la posizione sarà mostrata dai badge.""",
    "en": """You are an assistant that uses excerpts from past chats and the current conversation.
- Compare the question with the excerpts: if they contain the answer, use them all.
- If the question concerns only this session, use the current history.
- Do not invent content outside the provided chats.
- Do not manually cite IDs or titles: the UI will show source badges.""",
}

PROMPT_RAG_CHATS_USER_TEMPLATE = {
    "it": """Ti fornisco estratti di chat salvate e la cronologia corrente.

Indicazioni:
1) Riutilizza tutti gli estratti pertinenti.
2) Se nulla copre la domanda, dichiaralo.
3) Non elencare manualmente ID o titoli: l'interfaccia mostra già le fonti.

ESTRATTI CHAT:

{context_text}

DOMANDA: {question}

Rispondi in italiano con un testo chiaro e non ripetitivo.""",
    "en": """I am providing excerpts from saved chats and the current history.

Guidelines:
1) Reuse all relevant excerpts.
2) If nothing covers the question, say so.
3) Do not list IDs or titles manually: the UI shows source badges.

CHAT EXCERPTS:

{context_text}

QUESTION: {question}

Answer in English with clear, non-repetitive text.""",
}

# --- Modalità Chat con Ricerca Web ---
PROMPT_CHAT_WEB_SYSTEM = {
    "it": """Sei un assistente che risponde sempre in italiano e sintetizza risultati web verificati.
- Usa i contenuti forniti come fonte principale.
- Spiega eventuali dubbi o assenza di dati.
- Non creare riferimenti numerici ai risultati: la UI mostrerà i badge.""",
    "en": """You are an assistant that answers in English and summarizes verified web results.
- Use the provided content as the primary source.
- Explain any uncertainty or missing data.
- Do not add numeric references to results: the UI will show source badges.""",
}

PROMPT_CHAT_WEB_USER_TEMPLATE = {
    "it": """Hai a disposizione alcuni risultati di ricerca web.
Usali come base principale e, se non trovi un dato, dichiara che non è presente.

RISULTATI WEB:

{context}

DOMANDA:
{question}

Rispondi in italiano in modo conciso e senza citare manualmente i risultati (i badge gestiranno le fonti).""",
    "en": """You have access to some web search results.
Use them as the primary source and, if you cannot find a detail, say it is not present.

WEB RESULTS:

{context}

QUESTION:
{question}

Answer in English concisely and do not manually cite the results (badges will handle sources).""",
}

PROMPT_CHAT_WEB_FALLBACK = {
    "it": """L'utente ha chiesto:
{question}

Non ho potuto recuperare risultati dal web. Fornisci comunque la risposta migliore possibile, spiegando che potresti non essere aggiornato.""",
    "en": """The user asked:
{question}

I could not retrieve web results. Provide the best possible answer anyway, explaining that it may be out of date.""",
}

# --- Modalità Grafica (SVG/Mermaid/PlantUML) ---
GRAPHICS_DEFAULT_KIND = "svg"
GRAPHICS_ALLOWED_KINDS = ["svg", "mermaid", "plantuml"]
GRAPHICS_RENDER_PNG_DEFAULT = True
GRAPHICS_TOP_K_DEFAULT = RAG_TOP_K_DEFAULT
GRAPHICS_MAX_MARKUP_CHARS = 120000
GRAPHICS_BRAND_COLORS = {
    "primary": "#00a0e3",
    "primary_dark": "#0084ba",
    "primary_light": "#e6f7ff",
}

PROMPT_GRAPHICS_SYSTEM = {
    "it": f"""Sei un assistente grafico. Devi produrre solo JSON valido (senza markdown).
La risposta deve essere un oggetto JSON con questa forma:
{{
  "type": "graphics",
  "title": "Titolo breve",
  "kind": "svg" | "mermaid" | "plantuml",
  "markup": "contenuto grafico"
}}

Regole:
- Rispondi sempre in italiano, ma nel JSON inserisci solo il contenuto richiesto.
- Se viene indicata una PREFERENZA FORMATO, rispettala. In assenza di preferenze, usa SVG.
- SVG: usa palette coerente con il brand (blu {GRAPHICS_BRAND_COLORS["primary"]}, blu scuro {GRAPHICS_BRAND_COLORS["primary_dark"]}, azzurro {GRAPHICS_BRAND_COLORS["primary_light"]}).
- SVG: includi viewBox, testo leggibile, niente immagini esterne o script.
- Mantieni layout chiaro e ordinato, con margini e spaziatura regolari.
""",
    "en": f"""You are a graphics assistant. You must output only valid JSON (no markdown).
The response must be a JSON object with this shape:
{{
  "type": "graphics",
  "title": "Short title",
  "kind": "svg" | "mermaid" | "plantuml",
  "markup": "graphics content"
}}

Rules:
- Answer in English, but include only the required content in the JSON.
- If a FORMAT PREFERENCE is provided, respect it. Otherwise, use SVG.
- SVG: use a brand-consistent palette (blue {GRAPHICS_BRAND_COLORS["primary"]}, dark blue {GRAPHICS_BRAND_COLORS["primary_dark"]}, light blue {GRAPHICS_BRAND_COLORS["primary_light"]}).
- SVG: include viewBox, readable text, no external images or scripts.
- Keep the layout clear and orderly, with regular margins and spacing.
""",
}

PROMPT_GRAPHICS_USER_TEMPLATE = {
    "it": """BRIEF:
{question}

PREFERENZA FORMATO:
{preferred_kind}

CONTESTO (solo se utile):
{context_text}

Genera la grafica richiesta restituendo esclusivamente il JSON richiesto.""",
    "en": """BRIEF:
{question}

FORMAT PREFERENCE:
{preferred_kind}

CONTEXT (only if useful):
{context_text}

Generate the requested graphic and return only the required JSON.""",
}

# ==============================================================================
# 7. TRASCRIZIONE AUDIO (Faster-Whisper)
# ==============================================================================

# Percorso della cartella del modello Faster Whisper locale
WHISPER_MODEL_PATH = MODELS_DIR / "faster-whisper-small"

# Device da usare per la trascrizione ("cpu", "cuda", etc.)
WHISPER_DEVICE = "cpu"

# Tipo di calcolo ("int8", "float16", etc.)
WHISPER_COMPUTE_TYPE = "int8"


# ==============================================================================
# 8. MODEL CONTEXT PROTOCOL (MCP)
# ==============================================================================

# Abilita/disabilita il client MCP nell'interfaccia.
MCP_ENABLED = True

# Timeout massimo (in secondi) per una chiamata verso un servizio MCP.
MCP_DEFAULT_TIMEOUT = 25

# Elenco dei servizi MCP disponibili. Ogni elemento può definire:
# - name: identificativo da usare con @nome nel prompt
# - label: titolo mostrato in interfaccia
# - description: breve spiegazione del servizio
# - type: "echo", "http" oppure "command"
# - endpoint/method/headers: per servizi HTTP
# - command/env/prompt_mode/prompt_arg: per servizi eseguiti via processo locale
# - instructions: testo mostrato nella dashboard MCP
MCP_SERVICES = [
    # Esempio:
     {
         "name": "demo",
         "label": "Servizio dimostrativo",
         "description": "Ripete il testo passato come input.",
         "type": "echo",
         "instructions": "Scrivi @demo seguito dalla tua richiesta.",
     },
]


# ==============================================================================
# 9. TEXT-TO-SPEECH (Coqui)
# ==============================================================================

# Directory con i campioni voce per XTTS (speaker_wav)
TTS_VOICES_DIR = MODELS_DIR / "voices"

# --- Coqui TTS (usa modelli scaricati automaticamente) ---
# Modello di default (multilingua)
TTS_COQUI_DEFAULT_MODEL = os.environ.get(
    "COQUI_TTS_MODEL",
    "tts_models/multilingual/multi-dataset/xtts_v2",
).strip()

# Mappatura lingua -> modello Coqui (se diversa dal default).
# Popolare con i modelli effettivamente disponibili.
TTS_COQUI_LANGUAGE_MODELS = {
    # "it": "tts_models/it/mai_female/vits",
    # "en": "tts_models/en/vctk/vits",
}

# Speaker opzionali per modelli multi-speaker (es. XTTS)
TTS_COQUI_SPEAKER = os.environ.get("COQUI_TTS_SPEAKER", "").strip()
TTS_COQUI_SPEAKER_WAV = os.environ.get("COQUI_TTS_SPEAKER_WAV", "").strip()
TTS_COQUI_SPEAKER_WAVS = {
    "it": str(TTS_VOICES_DIR / "it.wav"),
    "en": str(TTS_VOICES_DIR / "en.wav"),
    "de": str(TTS_VOICES_DIR / "de.wav"),
    "fr": str(TTS_VOICES_DIR / "fr.wav"),
    "es": str(TTS_VOICES_DIR / "es.wav"),
}

# Abilita GPU se disponibile (in genere False su Mac, True su Windows con CUDA)
_COQUI_GPU_RAW = os.environ.get("COQUI_TTS_USE_GPU", "false").strip().lower()
TTS_COQUI_USE_GPU = _COQUI_GPU_RAW in {"1", "true", "yes", "on"}

# Accettazione TOS Coqui in modalità non interattiva ("1" per confermare)
TTS_COQUI_TOS_AGREED = os.environ.get("COQUI_TOS_AGREED", "1").strip()

# Limiti di sicurezza per input molto lunghi
TTS_MAX_TEXT_CHARS = 20000
TTS_TRUNCATE_AT_BREAK = True  # quando possibile tronca al termine di una frase

# Formati di output supportati e binario ffmpeg (necessario per MP3)
TTS_ALLOWED_FORMATS = ["wav", "mp3"]
TTS_DEFAULT_OUTPUT_FORMAT = os.environ.get("TTS_DEFAULT_AUDIO_FORMAT", "wav").lower()
if TTS_DEFAULT_OUTPUT_FORMAT not in TTS_ALLOWED_FORMATS:
    TTS_DEFAULT_OUTPUT_FORMAT = TTS_ALLOWED_FORMATS[0]
TTS_FFMPEG_BINARY = os.environ.get("FFMPEG_BIN", "ffmpeg")
