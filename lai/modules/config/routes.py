from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from config import (
    DOCS_DIR,
    MODEL_PATH,
    MODELS_DIR,
    DB_PATH,
    SERVER_HOST,
    SERVER_PORT,
    CORS_ALLOWED_ORIGINS,
    UI_CLICK_GUARD_MS,
    LLM_N_CTX,
    LLM_MIN_N_CTX,
    LLM_VERBOSE,
    LLM_TEMPERATURE,
    LLM_TOP_P,
    LLM_MAX_TOKENS,
    LLM_DYNAMIC_MAX_N_CTX,
    LLM_CONTEXT_CHAR_PER_TOKEN,
    LLM_DYNAMIC_TRIGGER_RATIO,
    LLM_RESPONSE_TOKENS_MIN,
    LLM_RESPONSE_TOKENS_MAX,
    LLM_RESPONSE_TOKENS_MARGIN,
    EMBEDDING_NORMALIZE,
    RAG_TOP_K_DEFAULT,
    RAG_CHUNK_MAX_CHARS,
    RAG_CHUNK_OVERLAP,
    RAG_CHUNK_MAX_LINES,
    RAG_CHUNK_OVERLAP_LINES,
    RAG_EXCEL_CSV_MAX_ROWS,
    RAG_EXCEL_CSV_MAX_COLS,
    RAG_MIN_KEYWORD_LEN,
    WEB_SEARCH_ENABLED,
    WEB_SEARCH_MAX_RESULTS,
    WEB_SEARCH_CACHE_TTL,
    WIKIPEDIA_API_ENDPOINT,
    WEB_SEARCH_USER_MAIL,
    WEB_SEARCH_USER_AGENT,
    WEB_SEARCH_TIMEOUT,
    WEB_SEARCH_VERIFY_SSL,
    PROMPT_CHAT_SYSTEM,
    PROMPT_RAG_DOCS_SYSTEM,
    PROMPT_RAG_DOCS_USER_TEMPLATE,
    PROMPT_RAG_CHATS_SYSTEM,
    PROMPT_RAG_CHATS_USER_TEMPLATE,
    PROMPT_CHAT_WEB_SYSTEM,
    PROMPT_CHAT_WEB_USER_TEMPLATE,
    PROMPT_CHAT_WEB_FALLBACK,
    PROMPT_GRAPHICS_SYSTEM,
    PROMPT_GRAPHICS_USER_TEMPLATE,
    WHISPER_MODEL_PATH,
    WHISPER_DEVICE,
    WHISPER_COMPUTE_TYPE,
    MCP_ENABLED,
    MCP_DEFAULT_TIMEOUT,
    MCP_SERVICES,
    TTS_VOICES_DIR,
    TTS_COQUI_DEFAULT_MODEL,
    TTS_COQUI_LANGUAGE_MODELS,
    TTS_COQUI_SPEAKER,
    TTS_COQUI_SPEAKER_WAV,
    TTS_COQUI_SPEAKER_WAVS,
    TTS_COQUI_USE_GPU,
    TTS_COQUI_TOS_AGREED,
    TTS_MAX_TEXT_CHARS,
    TTS_TRUNCATE_AT_BREAK,
    TTS_ALLOWED_FORMATS,
    TTS_DEFAULT_OUTPUT_FORMAT,
    TTS_FFMPEG_BINARY,
    LLM_STREAMING_MODE,
    LLM_STREAMING_CHUNK_SIZE,
    LLM_MODEL_DEFAULT_ID,
    EDIT_MODELS,
    EDIT_MODEL_POSITION,
    SYSTEM_SPECS,
    SUGGESTED_BASE,
    SUGGESTED_MAX,
    GRAPHICS_RENDER_PNG_DEFAULT,
    GRAPHICS_DEFAULT_KIND,
    GRAPHICS_ALLOWED_KINDS,
    GRAPHICS_RENDER_PNG_DEFAULT,
    GRAPHICS_TOP_K_DEFAULT,
    GRAPHICS_MAX_MARKUP_CHARS,
    GRAPHICS_BRAND_COLORS,
)
from modules.config.utils import rel_path
from modules.config.preferences import (
    get_user_preferences,
    get_streaming_mode_options,
    get_docs_dir_override,
    get_docs_dir,
    get_models_dir_override,
    get_models_dir,
    get_mcp_services_extra,
    get_mcp_services_all,
    update_docs_dir,
    update_models_dir,
    get_user_info,
    update_user_info,
    get_llm_model_id,
    get_llm_model_vision_id,
    get_llm_model_thinking_id,
    get_llm_model_graphics_id,
    is_llm_thinking_enabled,
    update_llm_model_id,
    update_llm_model_vision_id,
    update_llm_model_thinking_id,
    update_llm_model_graphics_id,
    update_llm_thinking_mode,
    add_llm_custom_model,
    remove_llm_custom_model,
    update_llm_custom_model,
    get_llm_model_catalog,
    update_llm_streaming_mode,
    update_dynamic_context,
    update_dynamic_max_tokens,
    get_excel_limits,
    update_excel_limits,
    update_graphics_render_png,
    update_graphics_preferred_kind,
    update_llm_thoughts_visibility,
    update_api_provider,
    get_web_search_user_mail,
    get_web_search_user_agent,
    update_web_search_user_mail,
    update_mcp_services_extra,
    resolve_models_path,
)
from modules.utils.i18n import get_prompt_text, normalize_language


class AllConfigs(BaseModel):
    model_config = {'protected_namespaces': ()}
    model_path: str
    models_dir: str
    llm_models: list[dict]
    llm_model_default_id: str
    edit_models: str
    edit_model_position: str
    docs_dir: str
    db_path: str
    server_host: str
    server_port: int
    cors_allowed_origins: list[str]
    ui_click_guard_ms: int
    llm_n_ctx: int
    llm_min_n_ctx: int
    llm_verbose: bool
    llm_temperature: float
    llm_top_p: float
    llm_max_tokens: int
    llm_dynamic_max_n_ctx: int
    llm_context_char_per_token: float
    llm_dynamic_trigger_ratio: float
    llm_response_tokens_min: int
    llm_response_tokens_max: int
    llm_response_tokens_margin: int
    llm_streaming_mode: str
    llm_streaming_chunk_size: int
    llm_system_specs: dict[str, str | int]
    llm_suggested_base_ctx: int
    llm_suggested_max_ctx: int
    embedding_normalize: bool
    rag_top_k_default: int
    rag_chunk_max_chars: int
    rag_chunk_overlap: int
    rag_chunk_max_lines: int
    rag_chunk_overlap_lines: int
    rag_excel_csv_max_rows: int
    rag_excel_csv_max_cols: int
    rag_min_keyword_len: int
    web_search_enabled: bool
    web_search_max_results: int
    web_search_cache_ttl: int
    wikipedia_api_endpoint: str
    web_search_user_mail: str
    web_search_user_agent: str
    web_search_timeout: int
    web_search_verify_ssl: bool
    prompt_chat_system: str
    prompt_rag_docs_system: str
    prompt_rag_docs_user_template: str
    prompt_rag_chats_system: str
    prompt_rag_chats_user_template: str
    prompt_chat_web_system: str
    prompt_chat_web_user_template: str
    prompt_chat_web_fallback: str
    prompt_graphics_system: str
    prompt_graphics_user_template: str
    whisper_model_path: str
    whisper_device: str
    whisper_compute_type: str
    mcp_enabled: bool
    mcp_default_timeout: int
    mcp_services: list[dict]
    tts_voices_dir: str
    tts_coqui_default_model: str
    tts_coqui_language_models: dict[str, str]
    tts_coqui_speaker: str
    tts_coqui_speaker_wav: str
    tts_coqui_speaker_wavs: dict[str, str]
    tts_coqui_use_gpu: bool
    tts_coqui_tos_agreed: str
    tts_max_text_chars: int
    tts_truncate_at_break: bool
    tts_allowed_formats: list[str]
    tts_default_output_format: str
    tts_ffmpeg_binary: str
    graphics_default_kind: str
    graphics_allowed_kinds: list[str]
    graphics_render_png_default: bool
    graphics_top_k_default: int
    graphics_max_markup_chars: int
    graphics_brand_colors: dict[str, str]


class StreamingModeOption(BaseModel):
    value: str
    label: str
    description: str


class UserPreferencesResponse(BaseModel):
    docs_dir: str
    docs_dir_override: str | None
    models_dir: str
    models_dir_override: str | None
    user_info_enabled: bool
    user_info_name: str | None
    user_info_role: str | None
    user_info_personal: str | None
    user_info_professional: str | None
    user_info_tone: str | None
    llm_model_id: str
    llm_model_vision_id: str | None
    llm_model_thinking_id: str | None
    llm_model_graphics_id: str | None
    llm_thinking_mode: bool
    llm_streaming_mode: str
    streaming_modes: list[StreamingModeOption]
    llm_dynamic_context: bool
    llm_dynamic_max_tokens: bool
    llm_show_thoughts: bool
    rag_excel_csv_max_rows: int
    rag_excel_csv_max_cols: int
    rag_excel_csv_max_rows_override: int | None
    rag_excel_csv_max_cols_override: int | None
    graphics_render_png: bool
    graphics_preferred_kind: str
    mcp_services_extra: list[dict]
    web_search_user_mail: str
    web_search_user_agent: str
    api_provider_enabled: bool
    api_provider_type: str
    api_base_url: str | None
    api_model: str | None
    api_api_key_set: bool
    api_allow_chat: bool
    api_allow_rag: bool
    api_allow_history: bool
    api_supports_vision: bool
    api_supports_ocr: bool
    api_supports_thinking: bool


class UserPreferencesUpdate(BaseModel):
    docs_dir: str | None = None
    models_dir: str | None = None
    user_info_enabled: bool | None = None
    user_info_name: str | None = None
    user_info_role: str | None = None
    user_info_personal: str | None = None
    user_info_professional: str | None = None
    user_info_tone: str | None = None
    llm_model_id: str | None = None
    llm_model_vision_id: str | None = None
    llm_model_thinking_id: str | None = None
    llm_model_graphics_id: str | None = None
    llm_thinking_mode: bool | None = None
    llm_streaming_mode: str | None = None
    llm_dynamic_context: bool | None = None
    llm_dynamic_max_tokens: bool | None = None
    llm_show_thoughts: bool | None = None
    rag_excel_csv_max_rows: int | None = None
    rag_excel_csv_max_cols: int | None = None
    graphics_render_png: bool | None = None
    graphics_preferred_kind: str | None = None
    mcp_services_extra: list[dict] | None = None
    web_search_user_mail: str | None = None
    api_provider_enabled: bool | None = None
    api_provider_type: str | None = None
    api_base_url: str | None = None
    api_model: str | None = None
    api_api_key: str | None = None
    api_allow_chat: bool | None = None
    api_allow_rag: bool | None = None
    api_allow_history: bool | None = None
    api_supports_vision: bool | None = None
    api_supports_ocr: bool | None = None
    api_supports_thinking: bool | None = None


router = APIRouter()


class LlmModelPayload(BaseModel):
    id: str
    label: str | None = None
    description: str | None = None
    path: str
    mmproj_path: str | None = None
    capabilities: dict | None = None
    context_max: int | None = None
    max_tokens: int | None = None


def _rel_path_if_set(value: str) -> str:
    if not value:
        return value
    try:
        return rel_path(Path(value))
    except Exception:
        return value


def _rel_path_dict(values: dict) -> dict:
    if not isinstance(values, dict):
        return {}
    return {key: _rel_path_if_set(val) if isinstance(val, str) else val for key, val in values.items()}


def _format_models_display(path: Path | None, fallback: str | None = None) -> str:
    if path:
        try:
            base = get_models_dir()
            try:
                rel = path.resolve().relative_to(base.resolve())
                return f"models/{rel.as_posix()}"
            except Exception:
                return rel_path(path)
        except Exception:
            return str(path)
    return str(fallback or "")


@router.get("/config", response_model=AllConfigs)
def get_config(lang: str | None = None):
    default_lang = normalize_language(lang)
    llm_models = []
    for model in get_llm_model_catalog():
        model_path = model.get("path")
        mmproj_path = model.get("mmproj_path")
        available = False
        resolved_model_path = resolve_models_path(model_path)
        resolved_mmproj_path = resolve_models_path(mmproj_path)
        if resolved_model_path:
            available = resolved_model_path.exists()
        path_display = _format_models_display(resolved_model_path, model_path)
        mmproj_display = _format_models_display(resolved_mmproj_path, mmproj_path) if mmproj_path else None
        llm_models.append(
            {
                "id": model.get("id"),
                "label": model.get("label"),
                "description": model.get("description"),
                "capabilities": model.get("capabilities", {}),
                "context_max": model.get("context_max") or LLM_DYNAMIC_MAX_N_CTX,
                "context_max_raw": model.get("context_max"),
                "max_tokens": model.get("max_tokens") or LLM_MAX_TOKENS,
                "max_tokens_raw": model.get("max_tokens"),
                "path": path_display,
                "mmproj_path": mmproj_display,
                "available": available,
                "removable": model.get("id") != LLM_MODEL_DEFAULT_ID,
            }
        )
    return AllConfigs(
        model_path=rel_path(MODEL_PATH),
        models_dir=rel_path(MODELS_DIR),
        llm_models=llm_models,
        llm_model_default_id=LLM_MODEL_DEFAULT_ID,
        edit_models=EDIT_MODELS,
        edit_model_position=EDIT_MODEL_POSITION,
        docs_dir=rel_path(DOCS_DIR),
        db_path=rel_path(DB_PATH),
        server_host=SERVER_HOST,
        server_port=SERVER_PORT,
        cors_allowed_origins=CORS_ALLOWED_ORIGINS,
        ui_click_guard_ms=UI_CLICK_GUARD_MS,
        llm_n_ctx=LLM_N_CTX,
        llm_min_n_ctx=LLM_MIN_N_CTX,
        llm_verbose=LLM_VERBOSE,
        llm_temperature=LLM_TEMPERATURE,
        llm_top_p=LLM_TOP_P,
        llm_max_tokens=LLM_MAX_TOKENS,
        llm_dynamic_max_n_ctx=LLM_DYNAMIC_MAX_N_CTX,
        llm_context_char_per_token=LLM_CONTEXT_CHAR_PER_TOKEN,
        llm_dynamic_trigger_ratio=LLM_DYNAMIC_TRIGGER_RATIO,
        llm_response_tokens_min=LLM_RESPONSE_TOKENS_MIN,
        llm_response_tokens_max=LLM_RESPONSE_TOKENS_MAX,
        llm_response_tokens_margin=LLM_RESPONSE_TOKENS_MARGIN,
        llm_streaming_mode=LLM_STREAMING_MODE,
        llm_streaming_chunk_size=LLM_STREAMING_CHUNK_SIZE,
        llm_system_specs=SYSTEM_SPECS,
        llm_suggested_base_ctx=SUGGESTED_BASE,
        llm_suggested_max_ctx=SUGGESTED_MAX,
        embedding_normalize=EMBEDDING_NORMALIZE,
        rag_top_k_default=RAG_TOP_K_DEFAULT,
        rag_chunk_max_chars=RAG_CHUNK_MAX_CHARS,
        rag_chunk_overlap=RAG_CHUNK_OVERLAP,
        rag_chunk_max_lines=RAG_CHUNK_MAX_LINES,
        rag_chunk_overlap_lines=RAG_CHUNK_OVERLAP_LINES,
        rag_excel_csv_max_rows=RAG_EXCEL_CSV_MAX_ROWS,
        rag_excel_csv_max_cols=RAG_EXCEL_CSV_MAX_COLS,
        rag_min_keyword_len=RAG_MIN_KEYWORD_LEN,
        web_search_enabled=WEB_SEARCH_ENABLED,
        web_search_max_results=WEB_SEARCH_MAX_RESULTS,
        web_search_cache_ttl=WEB_SEARCH_CACHE_TTL,
        wikipedia_api_endpoint=WIKIPEDIA_API_ENDPOINT,
        web_search_user_mail=WEB_SEARCH_USER_MAIL,
        web_search_user_agent=WEB_SEARCH_USER_AGENT,
        web_search_timeout=WEB_SEARCH_TIMEOUT,
        web_search_verify_ssl=WEB_SEARCH_VERIFY_SSL,
        prompt_chat_system=get_prompt_text(PROMPT_CHAT_SYSTEM, default_lang),
        prompt_rag_docs_system=get_prompt_text(PROMPT_RAG_DOCS_SYSTEM, default_lang),
        prompt_rag_docs_user_template=get_prompt_text(PROMPT_RAG_DOCS_USER_TEMPLATE, default_lang),
        prompt_rag_chats_system=get_prompt_text(PROMPT_RAG_CHATS_SYSTEM, default_lang),
        prompt_rag_chats_user_template=get_prompt_text(PROMPT_RAG_CHATS_USER_TEMPLATE, default_lang),
        prompt_chat_web_system=get_prompt_text(PROMPT_CHAT_WEB_SYSTEM, default_lang),
        prompt_chat_web_user_template=get_prompt_text(PROMPT_CHAT_WEB_USER_TEMPLATE, default_lang),
        prompt_chat_web_fallback=get_prompt_text(PROMPT_CHAT_WEB_FALLBACK, default_lang),
        prompt_graphics_system=get_prompt_text(PROMPT_GRAPHICS_SYSTEM, default_lang),
        prompt_graphics_user_template=get_prompt_text(PROMPT_GRAPHICS_USER_TEMPLATE, default_lang),
        whisper_model_path=rel_path(WHISPER_MODEL_PATH),
        whisper_device=WHISPER_DEVICE,
        whisper_compute_type=WHISPER_COMPUTE_TYPE,
        mcp_enabled=MCP_ENABLED,
        mcp_default_timeout=MCP_DEFAULT_TIMEOUT,
        mcp_services=MCP_SERVICES,
        tts_voices_dir=rel_path(TTS_VOICES_DIR),
        tts_coqui_default_model=TTS_COQUI_DEFAULT_MODEL,
        tts_coqui_language_models=TTS_COQUI_LANGUAGE_MODELS,
        tts_coqui_speaker=TTS_COQUI_SPEAKER,
        tts_coqui_speaker_wav=_rel_path_if_set(TTS_COQUI_SPEAKER_WAV),
        tts_coqui_speaker_wavs=_rel_path_dict(TTS_COQUI_SPEAKER_WAVS),
        tts_coqui_use_gpu=TTS_COQUI_USE_GPU,
        tts_coqui_tos_agreed=TTS_COQUI_TOS_AGREED,
        tts_max_text_chars=TTS_MAX_TEXT_CHARS,
        tts_truncate_at_break=TTS_TRUNCATE_AT_BREAK,
        tts_allowed_formats=TTS_ALLOWED_FORMATS,
        tts_default_output_format=TTS_DEFAULT_OUTPUT_FORMAT,
        tts_ffmpeg_binary=TTS_FFMPEG_BINARY,
        graphics_default_kind=GRAPHICS_DEFAULT_KIND,
        graphics_allowed_kinds=GRAPHICS_ALLOWED_KINDS,
        graphics_render_png_default=GRAPHICS_RENDER_PNG_DEFAULT,
        graphics_top_k_default=GRAPHICS_TOP_K_DEFAULT,
        graphics_max_markup_chars=GRAPHICS_MAX_MARKUP_CHARS,
        graphics_brand_colors=GRAPHICS_BRAND_COLORS,
    )


def _ensure_edit_models_enabled():
    if EDIT_MODELS != "ON":
        raise HTTPException(status_code=403, detail="Modifica modelli disabilitata nella configurazione.")

def _ensure_edit_model_position_enabled():
    if EDIT_MODEL_POSITION != "ON":
        raise HTTPException(status_code=403, detail="Modifica percorso modelli disabilitata nella configurazione.")


@router.post("/config/llm-models")
def add_llm_model(req: LlmModelPayload):
    _ensure_edit_models_enabled()
    try:
        models = add_llm_custom_model(req.dict())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok", "count": len(models)}


@router.delete("/config/llm-models/{model_id}")
def delete_llm_model(model_id: str):
    _ensure_edit_models_enabled()
    if not model_id:
        raise HTTPException(status_code=400, detail="ID modello mancante.")
    try:
        models = remove_llm_custom_model(model_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok", "count": len(models)}


@router.put("/config/llm-models/{model_id}")
def update_llm_model(model_id: str, req: LlmModelPayload):
    _ensure_edit_models_enabled()
    if not model_id:
        raise HTTPException(status_code=400, detail="ID modello mancante.")
    try:
        models = update_llm_custom_model(model_id, req.dict())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok", "count": len(models)}


@router.get("/config/llm-models/files")
def list_llm_model_files():
    models_dir = get_models_dir()
    if not models_dir.exists() or not models_dir.is_dir():
        return {"files": []}
    files = []
    for path in models_dir.rglob("*"):
        if path.is_file() and path.suffix.lower() == ".gguf":
            try:
                rel = path.resolve().relative_to(models_dir.resolve()).as_posix()
            except Exception:
                rel = path.name
            files.append(f"models/{rel}")
    files.sort()
    return {"files": files}


def _build_user_preferences_payload() -> UserPreferencesResponse:
    prefs = get_user_preferences()
    user_info = get_user_info()
    rows_effective, cols_effective = get_excel_limits()
    options = [StreamingModeOption(**opt) for opt in get_streaming_mode_options()]
    return UserPreferencesResponse(
        docs_dir=str(get_docs_dir()),
        docs_dir_override=get_docs_dir_override(),
        models_dir=str(get_models_dir()),
        models_dir_override=get_models_dir_override(),
        user_info_enabled=bool(user_info.get("user_info_enabled", False)),
        user_info_name=user_info.get("user_info_name"),
        user_info_role=user_info.get("user_info_role"),
        user_info_personal=user_info.get("user_info_personal"),
        user_info_professional=user_info.get("user_info_professional"),
        user_info_tone=user_info.get("user_info_tone"),
        llm_model_id=prefs.get("llm_model_id", get_llm_model_id()),
        llm_model_vision_id=prefs.get("llm_model_vision_id", get_llm_model_vision_id()),
        llm_model_thinking_id=prefs.get("llm_model_thinking_id", get_llm_model_thinking_id()),
        llm_model_graphics_id=prefs.get("llm_model_graphics_id", get_llm_model_graphics_id()),
        llm_thinking_mode=bool(prefs.get("llm_thinking_mode", is_llm_thinking_enabled())),
        llm_streaming_mode=prefs.get("llm_streaming_mode", LLM_STREAMING_MODE),
        streaming_modes=options,
        llm_dynamic_context=bool(prefs.get("llm_dynamic_context", False)),
        llm_dynamic_max_tokens=bool(prefs.get("llm_dynamic_max_tokens", False)),
        llm_show_thoughts=bool(prefs.get("llm_show_thoughts", False)),
        rag_excel_csv_max_rows=rows_effective,
        rag_excel_csv_max_cols=cols_effective,
        rag_excel_csv_max_rows_override=prefs.get("rag_excel_csv_max_rows"),
        rag_excel_csv_max_cols_override=prefs.get("rag_excel_csv_max_cols"),
        graphics_render_png=bool(prefs.get("graphics_render_png", GRAPHICS_RENDER_PNG_DEFAULT)),
        graphics_preferred_kind=str(prefs.get("graphics_preferred_kind", GRAPHICS_DEFAULT_KIND)),
        mcp_services_extra=get_mcp_services_extra(),
        web_search_user_mail=get_web_search_user_mail(),
        web_search_user_agent=get_web_search_user_agent(),
        api_provider_enabled=bool(prefs.get("api_provider_enabled", False)),
        api_provider_type=str(prefs.get("api_provider_type", "ollama")),
        api_base_url=prefs.get("api_base_url"),
        api_model=prefs.get("api_model"),
        api_api_key_set=bool(prefs.get("api_api_key")),
        api_allow_chat=bool(prefs.get("api_allow_chat", True)),
        api_allow_rag=bool(prefs.get("api_allow_rag", True)),
        api_allow_history=bool(prefs.get("api_allow_history", True)),
        api_supports_vision=bool(prefs.get("api_supports_vision", False)),
        api_supports_ocr=bool(prefs.get("api_supports_ocr", False)),
        api_supports_thinking=bool(prefs.get("api_supports_thinking", False)),
    )


@router.get("/config/user", response_model=UserPreferencesResponse)
def api_get_user_preferences() -> UserPreferencesResponse:
    return _build_user_preferences_payload()


@router.post("/config/user", response_model=UserPreferencesResponse)
async def api_update_user_preferences(req: UserPreferencesUpdate, request: Request) -> UserPreferencesResponse:
    updated = False
    if req.docs_dir is not None:
        try:
            update_docs_dir(req.docs_dir)
            updated = True
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if req.models_dir is not None:
        _ensure_edit_model_position_enabled()
        try:
            update_models_dir(req.models_dir)
            updated = True
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    user_info_fields = {
        "user_info_enabled": req.user_info_enabled,
        "user_info_name": req.user_info_name,
        "user_info_role": req.user_info_role,
        "user_info_personal": req.user_info_personal,
        "user_info_professional": req.user_info_professional,
        "user_info_tone": req.user_info_tone,
    }
    if any(value is not None for value in user_info_fields.values()):
        update_user_info({k: v for k, v in user_info_fields.items() if v is not None})
        updated = True
    if req.llm_model_id is not None:
        update_llm_model_id(req.llm_model_id)
        updated = True
    if req.llm_model_vision_id is not None:
        update_llm_model_vision_id(req.llm_model_vision_id)
        updated = True
    if req.llm_model_thinking_id is not None:
        update_llm_model_thinking_id(req.llm_model_thinking_id)
        updated = True
    if req.llm_model_graphics_id is not None:
        update_llm_model_graphics_id(req.llm_model_graphics_id)
        updated = True
    if req.llm_thinking_mode is not None:
        update_llm_thinking_mode(req.llm_thinking_mode)
        updated = True
    if req.llm_streaming_mode is not None:
        update_llm_streaming_mode(req.llm_streaming_mode)
        updated = True
    if req.llm_dynamic_context is not None:
        update_dynamic_context(req.llm_dynamic_context)
        updated = True
    if req.llm_dynamic_max_tokens is not None:
        update_dynamic_max_tokens(req.llm_dynamic_max_tokens)
        updated = True
    if req.llm_show_thoughts is not None:
        update_llm_thoughts_visibility(req.llm_show_thoughts)
        updated = True
    if req.rag_excel_csv_max_rows is not None:
        update_excel_limits(rows=req.rag_excel_csv_max_rows)
        updated = True
    if req.rag_excel_csv_max_cols is not None:
        update_excel_limits(cols=req.rag_excel_csv_max_cols)
        updated = True
    if req.graphics_render_png is not None:
        update_graphics_render_png(req.graphics_render_png)
        updated = True
    if req.graphics_preferred_kind is not None:
        update_graphics_preferred_kind(req.graphics_preferred_kind)
        updated = True
    if req.mcp_services_extra is not None:
        update_mcp_services_extra(req.mcp_services_extra)
        updated = True
    if req.web_search_user_mail is not None:
        update_web_search_user_mail(req.web_search_user_mail)
        updated = True
    api_fields = {
        "api_provider_enabled": req.api_provider_enabled,
        "api_provider_type": req.api_provider_type,
        "api_base_url": req.api_base_url,
        "api_model": req.api_model,
        "api_api_key": req.api_api_key,
        "api_allow_chat": req.api_allow_chat,
        "api_allow_rag": req.api_allow_rag,
        "api_allow_history": req.api_allow_history,
        "api_supports_vision": req.api_supports_vision,
        "api_supports_ocr": req.api_supports_ocr,
        "api_supports_thinking": req.api_supports_thinking,
    }
    if any(value is not None for value in api_fields.values()):
        update_api_provider({k: v for k, v in api_fields.items() if v is not None})
        updated = True
    if not updated:
        try:
            raw = await request.json()
        except Exception:
            raw = {}
        if "docs_dir" in raw:
            try:
                update_docs_dir(raw.get("docs_dir"))
                updated = True
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
        if "models_dir" in raw:
            try:
                update_models_dir(raw.get("models_dir"))
                updated = True
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
        user_keys = [
            "user_info_enabled",
            "user_info_name",
            "user_info_role",
            "user_info_personal",
            "user_info_professional",
            "user_info_tone",
        ]
        if any(key in raw for key in user_keys):
            update_user_info({k: raw.get(k) for k in user_keys if k in raw})
            updated = True
        if "llm_model_id" in raw:
            update_llm_model_id(raw.get("llm_model_id"))
            updated = True
        if "llm_model_vision_id" in raw:
            update_llm_model_vision_id(raw.get("llm_model_vision_id"))
            updated = True
        if "llm_model_thinking_id" in raw:
            update_llm_model_thinking_id(raw.get("llm_model_thinking_id"))
            updated = True
        if "llm_model_graphics_id" in raw:
            update_llm_model_graphics_id(raw.get("llm_model_graphics_id"))
            updated = True
        if "llm_thinking_mode" in raw:
            update_llm_thinking_mode(raw.get("llm_thinking_mode"))
            updated = True
        if "llm_show_thoughts" in raw:
            update_llm_thoughts_visibility(raw.get("llm_show_thoughts"))
            updated = True
        if "graphics_render_png" in raw:
            update_graphics_render_png(bool(raw["graphics_render_png"]))
            updated = True
        if "graphics_preferred_kind" in raw:
            update_graphics_preferred_kind(str(raw["graphics_preferred_kind"]))
            updated = True
        if "mcp_services_extra" in raw:
            update_mcp_services_extra(raw.get("mcp_services_extra"))
            updated = True
        if "web_search_user_mail" in raw:
            update_web_search_user_mail(raw.get("web_search_user_mail"))
            updated = True
        api_keys = [
            "api_provider_enabled",
            "api_provider_type",
            "api_base_url",
            "api_model",
            "api_api_key",
            "api_allow_chat",
            "api_allow_rag",
            "api_allow_history",
            "api_supports_vision",
            "api_supports_ocr",
            "api_supports_thinking",
        ]
        if any(key in raw for key in api_keys):
            update_api_provider({k: raw.get(k) for k in api_keys if k in raw})
            updated = True
    if not updated:
        raise HTTPException(status_code=400, detail="Nessun parametro aggiornato.")
    return _build_user_preferences_payload()
