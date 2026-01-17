from __future__ import annotations

from pathlib import Path
from threading import Lock
from typing import Any, Dict, List

from config import (
    LLM_STREAMING_MODE,
    LLM_STREAMING_CHUNK_SIZE,
    LLM_N_CTX,
    LLM_DYNAMIC_MAX_N_CTX,
    MODEL_PATH,
    MODELS_DIR,
    LLM_MODEL_CATALOG,
    LLM_MODEL_DEFAULT_ID,
    RAG_EXCEL_CSV_MAX_ROWS,
    RAG_EXCEL_CSV_MAX_COLS,
    GRAPHICS_RENDER_PNG_DEFAULT,
    GRAPHICS_DEFAULT_KIND,
    GRAPHICS_ALLOWED_KINDS,
    DOCS_DIR,
    MCP_SERVICES,
    BASE_DIR,
    WEB_SEARCH_USER_AGENT_TEMPLATE,
)
from modules.db.config_store import get_all_config, get_config_value, set_config_value

STREAMING_MODE_OFF = "off"
STREAMING_MODE_TOKENS = "tokens"
STREAMING_MODE_CHUNKS = "chunks"

STREAMING_MODE_OPTIONS: List[Dict[str, str]] = [
    {
        "value": STREAMING_MODE_OFF,
        "label": "Risposta completa solo a fine elaborazione",
        "description": "Mostra la risposta quando il modello ha terminato l'elaborazione.",
    },
    {
        "value": STREAMING_MODE_CHUNKS,
        "label": "Streaming a blocchi",
        "description": "Aggiorna il testo in blocchi di frasi, utile per la lettura sequenziale.",
    },
    {
        "value": STREAMING_MODE_TOKENS,
        "label": "Streaming token-by-token",
        "description": "Mostra ogni token non appena viene generato (modalità più reattiva).",
    },
]

EXCEL_ROW_LIMIT_CAP = max(RAG_EXCEL_CSV_MAX_ROWS, 2000)
EXCEL_COL_LIMIT_CAP = max(RAG_EXCEL_CSV_MAX_COLS, 50)

_DEFAULT_PREFERENCES: Dict[str, Any] = {
    "docs_dir_override": None,
    "models_dir_override": None,
    "user_info_enabled": False,
    "user_info_name": None,
    "user_info_role": None,
    "user_info_personal": None,
    "user_info_professional": None,
    "user_info_tone": None,
    "llm_model_id": LLM_MODEL_DEFAULT_ID,
    "llm_model_vision_id": None,
    "llm_model_thinking_id": None,
    "llm_model_graphics_id": None,
    "llm_thinking_mode": False,
    "llm_streaming_mode": LLM_STREAMING_MODE,
    "llm_dynamic_context": False,
    "llm_dynamic_max_tokens": False,
    "llm_show_thoughts": False,
    "rag_excel_csv_max_rows": None,
    "rag_excel_csv_max_cols": None,
    "graphics_render_png": GRAPHICS_RENDER_PNG_DEFAULT,
    "graphics_preferred_kind": GRAPHICS_DEFAULT_KIND,
    "api_provider_enabled": False,
    "api_provider_type": "ollama",
    "api_base_url": "http://127.0.0.1:11434/v1",
    "api_model": None,
    "api_api_key": None,
    "api_allow_chat": True,
    "api_allow_rag": True,
    "api_allow_history": True,
    "api_supports_vision": False,
    "api_supports_ocr": False,
    "api_supports_thinking": False,
    "web_search_user_mail": "",
    "mcp_services_extra": [],
}

_runtime_preferences: Dict[str, Any] = dict(_DEFAULT_PREFERENCES)
_prefs_lock = Lock()

LLM_CUSTOM_MODELS_KEY = "llm_custom_models"


def _normalize_llm_model_entry(entry: Dict[str, Any]) -> Dict[str, Any] | None:
    if not isinstance(entry, dict):
        return None
    model_id = str(entry.get("id") or "").strip()
    if not model_id:
        return None
    label = str(entry.get("label") or model_id).strip() or model_id
    raw_path = entry.get("path")
    if not raw_path:
        return None
    path_value = _store_path_value(str(raw_path))
    mmproj_raw = entry.get("mmproj_path")
    mmproj_value = _store_path_value(str(mmproj_raw)) if mmproj_raw else None
    caps_raw = entry.get("capabilities") if isinstance(entry.get("capabilities"), dict) else {}
    capabilities = {
        "vision": bool(caps_raw.get("vision")),
        "thinking": bool(caps_raw.get("thinking")),
        "coding": bool(caps_raw.get("coding")),
        "ocr": bool(caps_raw.get("ocr")),
        "audio": bool(caps_raw.get("audio")),
        "analysis": bool(caps_raw.get("analysis")),
    }
    context_max = entry.get("context_max")
    max_tokens = entry.get("max_tokens")
    try:
        context_max_val = int(context_max) if context_max is not None else None
    except (TypeError, ValueError):
        context_max_val = None
    try:
        max_tokens_val = int(max_tokens) if max_tokens is not None else None
    except (TypeError, ValueError):
        max_tokens_val = None
    if capabilities.get("thinking") and (max_tokens_val is None or max_tokens_val < 2048):
        max_tokens_val = 2048
    description = entry.get("description")
    if description is not None:
        description = str(description).strip() or None
    return {
        "id": model_id,
        "label": label,
        "description": description,
        "capabilities": capabilities,
        "context_max": context_max_val,
        "max_tokens": max_tokens_val,
        "path": path_value,
        "mmproj_path": mmproj_value,
    }


def _get_default_llm_model_entry() -> Dict[str, Any]:
    for model in LLM_MODEL_CATALOG:
        if model.get("id") == LLM_MODEL_DEFAULT_ID:
            return model
    return {
        "id": LLM_MODEL_DEFAULT_ID,
        "label": LLM_MODEL_DEFAULT_ID,
        "description": None,
        "capabilities": {
            "vision": False,
            "thinking": False,
            "coding": False,
            "ocr": False,
            "audio": False,
        },
        "context_max": None,
        "max_tokens": None,
        "path": MODEL_PATH,
        "mmproj_path": None,
    }


def _merge_model_entries(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    if not override:
        return dict(base)
    result = dict(base)
    for key, value in override.items():
        if value is None:
            continue
        if key == "capabilities" and isinstance(value, dict):
            merged_caps = dict(result.get("capabilities") or {})
            for cap_key, cap_val in value.items():
                merged_caps[cap_key] = bool(cap_val)
            result["capabilities"] = merged_caps
        elif key in {"context_max", "max_tokens"}:
            try:
                result[key] = int(value)
            except (TypeError, ValueError):
                continue
        elif isinstance(value, str):
            if value.strip():
                result[key] = value.strip()
        else:
            result[key] = value
    return result


def _seed_llm_custom_models_if_missing() -> list[dict]:
    stored = get_config_value(LLM_CUSTOM_MODELS_KEY, None)
    if stored is not None:
        if isinstance(stored, list):
            normalized = [_normalize_llm_model_entry(item) for item in stored]
            return [item for item in normalized if item]
        return []
    presets = [model for model in LLM_MODEL_CATALOG]
    normalized = [_normalize_llm_model_entry(item) for item in presets]
    seeded = [item for item in normalized if item]
    set_config_value(LLM_CUSTOM_MODELS_KEY, seeded)
    return list(seeded)


def get_llm_custom_models() -> list[dict]:
    models = list(_seed_llm_custom_models_if_missing())
    has_default = any((item.get("id") == LLM_MODEL_DEFAULT_ID) for item in models)
    if not has_default:
        default_source = None
        for entry in LLM_MODEL_CATALOG:
            if entry.get("id") == LLM_MODEL_DEFAULT_ID:
                default_source = entry
                break
        if not default_source:
            default_source = _get_default_llm_model_entry()
        normalized_default = _normalize_llm_model_entry(default_source)
        if normalized_default:
            models.append(normalized_default)
            set_config_value(LLM_CUSTOM_MODELS_KEY, models)
    return list(models)


def get_llm_model_catalog() -> list[dict]:
    default_model = _normalize_llm_model_entry(_get_default_llm_model_entry())
    custom_models = get_llm_custom_models()
    seen: set[str] = set()
    catalog: list[dict] = []
    override_default = None
    filtered_custom: list[dict] = []
    for model in custom_models:
        model_id = model.get("id")
        if not model_id:
            continue
        if model_id == LLM_MODEL_DEFAULT_ID:
            override_default = model
        else:
            filtered_custom.append(model)
    if default_model:
        if override_default:
            default_model = _merge_model_entries(default_model, override_default)
        seen.add(default_model["id"])
        catalog.append(default_model)
    for model in filtered_custom:
        model_id = model.get("id")
        if not model_id or model_id in seen:
            continue
        seen.add(model_id)
        catalog.append(model)
    return catalog


def add_llm_custom_model(entry: Dict[str, Any]) -> list[dict]:
    model = _normalize_llm_model_entry(entry)
    if not model:
        raise ValueError("Definizione modello non valida.")
    existing = get_llm_custom_models()
    updated = [item for item in existing if item.get("id") != model["id"]]
    updated.append(model)
    set_config_value(LLM_CUSTOM_MODELS_KEY, updated)
    return list(updated)


def remove_llm_custom_model(model_id: str) -> list[dict]:
    if not model_id:
        return get_llm_custom_models()
    normalized_id = str(model_id).strip()
    if normalized_id == LLM_MODEL_DEFAULT_ID:
        raise ValueError("Il modello di default non puo essere rimosso.")
    existing = get_llm_custom_models()
    updated = [item for item in existing if item.get("id") != normalized_id]
    if len(updated) == len(existing):
        return list(existing)
    set_config_value(LLM_CUSTOM_MODELS_KEY, updated)
    updates: Dict[str, Any] = {}
    with _prefs_lock:
        if _runtime_preferences.get("llm_model_id") == normalized_id:
            updates["llm_model_id"] = LLM_MODEL_DEFAULT_ID
        if _runtime_preferences.get("llm_model_vision_id") == normalized_id:
            updates["llm_model_vision_id"] = None
        if _runtime_preferences.get("llm_model_thinking_id") == normalized_id:
            updates["llm_model_thinking_id"] = None
        if updates:
            _runtime_preferences.update(updates)
    for key, value in updates.items():
        set_config_value(key, value)
    return list(updated)


def update_llm_custom_model(model_id: str, entry: Dict[str, Any]) -> list[dict]:
    if not model_id:
        raise ValueError("ID modello mancante.")
    normalized_id = str(model_id).strip()
    model = _normalize_llm_model_entry(entry)
    if not model:
        raise ValueError("Definizione modello non valida.")
    if normalized_id == LLM_MODEL_DEFAULT_ID and model["id"] != normalized_id:
        raise ValueError("Il modello di default non puo cambiare ID.")

    existing = get_llm_custom_models()
    if model["id"] != normalized_id:
        for item in existing:
            item_id = item.get("id")
            if item_id and item_id == model["id"]:
                raise ValueError("ID modello gia esistente.")

    found = False
    updated: list[dict] = []
    for item in existing:
        item_id = item.get("id")
        if item_id == normalized_id:
            found = True
            updated.append(model)
        else:
            updated.append(item)

    if not found:
        raise ValueError("Modello non trovato.")

    set_config_value(LLM_CUSTOM_MODELS_KEY, updated)

    if model["id"] != normalized_id:
        updates: Dict[str, Any] = {}
        with _prefs_lock:
            if _runtime_preferences.get("llm_model_id") == normalized_id:
                updates["llm_model_id"] = model["id"]
            if _runtime_preferences.get("llm_model_vision_id") == normalized_id:
                updates["llm_model_vision_id"] = model["id"]
            if _runtime_preferences.get("llm_model_thinking_id") == normalized_id:
                updates["llm_model_thinking_id"] = model["id"]
            if updates:
                _runtime_preferences.update(updates)
        for key, value in updates.items():
            set_config_value(key, value)

    return list(updated)


def _normalize_streaming_mode(value: str | None) -> str:
    if not value:
        return LLM_STREAMING_MODE
    value = value.strip().lower()
    allowed = {STREAMING_MODE_OFF, STREAMING_MODE_TOKENS, STREAMING_MODE_CHUNKS}
    return value if value in allowed else LLM_STREAMING_MODE


def _normalize_llm_model_id(value: str | None) -> str:
    if not value:
        return LLM_MODEL_DEFAULT_ID
    value = str(value).strip()
    allowed = {model.get("id") for model in get_llm_model_catalog()}
    return value if value in allowed else LLM_MODEL_DEFAULT_ID


def _normalize_optional_llm_model_id(value: str | None) -> str | None:
    if not value:
        return None
    value = str(value).strip()
    allowed = {model.get("id") for model in get_llm_model_catalog()}
    return value if value in allowed else None


def _normalize_provider_type(value: str | None) -> str:
    allowed = {"ollama", "lmstudio", "openai_compatible"}
    if not value:
        return "ollama"
    raw = str(value).strip().lower()
    return raw if raw in allowed else "openai_compatible"


def _normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    raw = str(value).strip()
    return raw if raw else None


def _normalize_mcp_services(value: Any) -> list[dict]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _normalize_api_base_url(base_url: Any, provider_type: str | None) -> str | None:
    normalized = _normalize_text(base_url)
    if not normalized:
        return None
    provider = _normalize_provider_type(provider_type)
    if provider in {"ollama", "lmstudio"}:
        if normalized.endswith("/api"):
            normalized = normalized[:-4] + "/v1"
        elif "/v1" not in normalized.rstrip("/"):
            normalized = normalized.rstrip("/") + "/v1"
    return normalized


def _normalize_preferences(data: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(_DEFAULT_PREFERENCES)
    normalized.update(data)
    docs_override = data.get("docs_dir_override")
    if isinstance(docs_override, str):
        docs_override = docs_override.strip() or None
    elif docs_override is not None:
        docs_override = str(docs_override)
    normalized["docs_dir_override"] = docs_override
    models_override = data.get("models_dir_override")
    if isinstance(models_override, str):
        models_override = models_override.strip() or None
    elif models_override is not None:
        models_override = str(models_override)
    normalized["models_dir_override"] = models_override
    normalized["user_info_enabled"] = bool(data.get("user_info_enabled", False))
    for key in [
        "user_info_name",
        "user_info_role",
        "user_info_personal",
        "user_info_professional",
        "user_info_tone",
    ]:
        raw = data.get(key)
        if isinstance(raw, str):
            raw = raw.strip() or None
        elif raw is not None:
            raw = str(raw).strip() or None
        normalized[key] = raw
    normalized["user_info_tone"] = raw
    normalized["llm_model_id"] = _normalize_llm_model_id(data.get("llm_model_id"))

    # Vision & Thinking models (optional)
    vis_id = data.get("llm_model_vision_id")
    normalized["llm_model_vision_id"] = _normalize_optional_llm_model_id(vis_id)

    thk_id = data.get("llm_model_thinking_id")
    normalized["llm_model_thinking_id"] = _normalize_optional_llm_model_id(thk_id)

    graphics_id = data.get("llm_model_graphics_id")
    normalized["llm_model_graphics_id"] = _normalize_optional_llm_model_id(graphics_id)

    normalized["llm_thinking_mode"] = bool(data.get("llm_thinking_mode", False))
    normalized["llm_streaming_mode"] = _normalize_streaming_mode(data.get("llm_streaming_mode"))
    normalized["llm_dynamic_context"] = bool(data.get("llm_dynamic_context"))
    normalized["llm_dynamic_max_tokens"] = bool(data.get("llm_dynamic_max_tokens"))
    normalized["llm_show_thoughts"] = bool(data.get("llm_show_thoughts", False))
    normalized["rag_excel_csv_max_rows"] = _sanitize_excel_limit(
        data.get("rag_excel_csv_max_rows"),
        EXCEL_ROW_LIMIT_CAP,
    )
    normalized["rag_excel_csv_max_cols"] = _sanitize_excel_limit(
        data.get("rag_excel_csv_max_cols"),
        EXCEL_COL_LIMIT_CAP,
    )
    normalized["graphics_render_png"] = bool(
        data.get("graphics_render_png", GRAPHICS_RENDER_PNG_DEFAULT)
    )
    preferred_kind = str(data.get("graphics_preferred_kind", GRAPHICS_DEFAULT_KIND)).strip().lower()
    if preferred_kind not in GRAPHICS_ALLOWED_KINDS:
        preferred_kind = GRAPHICS_DEFAULT_KIND
    normalized["graphics_preferred_kind"] = preferred_kind
    normalized["api_provider_enabled"] = bool(data.get("api_provider_enabled", False))
    normalized["api_provider_type"] = _normalize_provider_type(data.get("api_provider_type"))
    normalized["api_base_url"] = (
        _normalize_api_base_url(data.get("api_base_url"), normalized["api_provider_type"])
        or _DEFAULT_PREFERENCES["api_base_url"]
    )
    normalized["api_model"] = _normalize_text(data.get("api_model"))
    normalized["api_api_key"] = _normalize_text(data.get("api_api_key"))
    normalized["api_allow_chat"] = bool(data.get("api_allow_chat", True))
    normalized["api_allow_rag"] = bool(data.get("api_allow_rag", True))
    normalized["api_allow_history"] = bool(data.get("api_allow_history", True))
    normalized["api_supports_vision"] = bool(data.get("api_supports_vision", False))
    normalized["api_supports_ocr"] = bool(data.get("api_supports_ocr", False))
    normalized["api_supports_thinking"] = bool(data.get("api_supports_thinking", False))
    normalized["web_search_user_mail"] = _normalize_text(data.get("web_search_user_mail"))
    normalized["mcp_services_extra"] = _normalize_mcp_services(data.get("mcp_services_extra"))
    return normalized


def load_user_preferences() -> Dict[str, Any]:
    stored = get_all_config()
    normalized = _normalize_preferences(stored)
    with _prefs_lock:
        _runtime_preferences.clear()
        _runtime_preferences.update(normalized)
    return dict(_runtime_preferences)


def get_user_preferences() -> Dict[str, Any]:
    with _prefs_lock:
        return dict(_runtime_preferences)


def _resolve_server_path(raw_path: str) -> Path:
    path = Path(raw_path).expanduser()
    if path.is_absolute():
        return path
    return BASE_DIR / path


def _store_path_value(raw_path: str) -> str:
    expanded = Path(raw_path).expanduser()
    if expanded.is_absolute():
        return str(expanded.resolve())
    return str(Path(raw_path))


def get_mcp_services_extra() -> list[dict]:
    with _prefs_lock:
        value = _runtime_preferences.get("mcp_services_extra")
    return list(value) if isinstance(value, list) else []


def get_mcp_services_all() -> list[dict]:
    return list(MCP_SERVICES or []) + get_mcp_services_extra()


def get_web_search_user_mail() -> str:
    with _prefs_lock:
        value = _runtime_preferences.get("web_search_user_mail")
    if isinstance(value, str):
        return value.strip()
    return ""


def get_web_search_user_agent() -> str:
    email = get_web_search_user_mail()
    return WEB_SEARCH_USER_AGENT_TEMPLATE.format(email=email)


def get_docs_dir_override() -> str | None:
    with _prefs_lock:
        value = _runtime_preferences.get("docs_dir_override")
    return value if isinstance(value, str) and value.strip() else None


def get_docs_dir() -> Path:
    override = get_docs_dir_override()
    if override:
        path = _resolve_server_path(override)
        if path.exists() and path.is_dir():
            return path.resolve()
    return DOCS_DIR


def get_models_dir_override() -> str | None:
    with _prefs_lock:
        value = _runtime_preferences.get("models_dir_override")
    return value if isinstance(value, str) and value.strip() else None


def get_models_dir() -> Path:
    override = get_models_dir_override()
    if override:
        path = _resolve_server_path(override)
        if path.exists() and path.is_dir():
            return path.resolve()
    return MODELS_DIR


def resolve_models_path(raw_path: str | None) -> Path | None:
    if not raw_path:
        return None
    raw = str(raw_path).strip()
    if not raw:
        return None
    if raw.startswith("@lai"):
        rel_part = raw[len("@lai"):].lstrip("/\\")
        return (BASE_DIR / rel_part).resolve()
    normalized = raw.replace("\\", "/")
    path_obj = Path(normalized).expanduser()
    if path_obj.is_absolute():
        return path_obj.resolve()
    rel = normalized
    if rel.startswith("models/"):
        rel = rel[len("models/"):]
    return (get_models_dir() / rel).resolve()


def get_user_info() -> Dict[str, Any]:
    with _prefs_lock:
        return {
            "user_info_enabled": bool(_runtime_preferences.get("user_info_enabled", False)),
            "user_info_name": _runtime_preferences.get("user_info_name"),
            "user_info_role": _runtime_preferences.get("user_info_role"),
            "user_info_personal": _runtime_preferences.get("user_info_personal"),
            "user_info_professional": _runtime_preferences.get("user_info_professional"),
            "user_info_tone": _runtime_preferences.get("user_info_tone"),
        }


def build_user_info_prompt() -> str:
    info = get_user_info()
    if not info.get("user_info_enabled"):
        return ""
    lines = []
    if info.get("user_info_name"):
        lines.append(f"Nome: {info['user_info_name']}")
    if info.get("user_info_role"):
        lines.append(f"Ruolo lavorativo: {info['user_info_role']}")
    if info.get("user_info_personal"):
        lines.append(f"Informazioni personali: {info['user_info_personal']}")
    if info.get("user_info_professional"):
        lines.append(f"Informazioni professionali: {info['user_info_professional']}")
    if info.get("user_info_tone"):
        lines.append(f"Tono preferito nelle risposte: {info['user_info_tone']}")
    if not lines:
        return ""
    return (
        "Informazioni utente (usa queste informazioni come contesto, senza inventare dettagli mancanti "
        "e senza citarle se non richiesto):\n"
        + "\n".join(lines)
    )


def apply_user_info_to_system_prompt(system_prompt: str) -> str:
    base = (system_prompt or "").strip()
    suffix = build_user_info_prompt()
    if not suffix:
        return base
    if not base:
        return suffix
    return f"{base}\n\n{suffix}"


def get_llm_streaming_mode() -> str:
    with _prefs_lock:
        value = _runtime_preferences.get("llm_streaming_mode", LLM_STREAMING_MODE)
    return _normalize_streaming_mode(value)


def is_llm_thoughts_visible() -> bool:
    with _prefs_lock:
        return bool(_runtime_preferences.get("llm_show_thoughts", False))


def get_llm_model_id() -> str:
    with _prefs_lock:
        value = _runtime_preferences.get("llm_model_id", LLM_MODEL_DEFAULT_ID)
    return _normalize_llm_model_id(value)


def get_llm_model_vision_id() -> str | None:
    with _prefs_lock:
        return _runtime_preferences.get("llm_model_vision_id")


def get_llm_model_thinking_id() -> str | None:
    with _prefs_lock:
        return _runtime_preferences.get("llm_model_thinking_id")


def get_llm_model_graphics_id() -> str | None:
    with _prefs_lock:
        value = _runtime_preferences.get("llm_model_graphics_id")
    return _normalize_optional_llm_model_id(value)


def is_llm_thinking_enabled() -> bool:
    with _prefs_lock:
        return bool(_runtime_preferences.get("llm_thinking_mode", False))


def get_streaming_chunk_size() -> int:
    return LLM_STREAMING_CHUNK_SIZE


def update_llm_streaming_mode(new_mode: str) -> Dict[str, Any]:
    normalized = _normalize_streaming_mode(new_mode)
    set_config_value("llm_streaming_mode", normalized)
    with _prefs_lock:
        _runtime_preferences["llm_streaming_mode"] = normalized
        snapshot = dict(_runtime_preferences)
    return snapshot


def update_llm_thoughts_visibility(enabled: bool) -> Dict[str, Any]:
    value = bool(enabled)
    set_config_value("llm_show_thoughts", value)
    with _prefs_lock:
        _runtime_preferences["llm_show_thoughts"] = value
        snapshot = dict(_runtime_preferences)
    return snapshot


def update_llm_model_id(new_id: Any) -> Dict[str, Any]:
    normalized = _normalize_llm_model_id(str(new_id) if new_id is not None else None)
    set_config_value("llm_model_id", normalized)
    with _prefs_lock:
        _runtime_preferences["llm_model_id"] = normalized
        snapshot = dict(_runtime_preferences)
    return snapshot


def update_llm_model_vision_id(new_id: Any) -> Dict[str, Any]:
    val = str(new_id) if new_id else None
    # Verify it exists in catalog or is None
    normalized = _normalize_optional_llm_model_id(val)
        
    set_config_value("llm_model_vision_id", normalized)
    with _prefs_lock:
        _runtime_preferences["llm_model_vision_id"] = normalized
        snapshot = dict(_runtime_preferences)
    return snapshot


def update_llm_model_thinking_id(new_id: Any) -> Dict[str, Any]:
    val = str(new_id) if new_id else None
    normalized = _normalize_optional_llm_model_id(val)

    set_config_value("llm_model_thinking_id", normalized)
    with _prefs_lock:
        _runtime_preferences["llm_model_thinking_id"] = normalized
        snapshot = dict(_runtime_preferences)
    return snapshot


def update_llm_model_graphics_id(new_id: Any) -> Dict[str, Any]:
    val = str(new_id) if new_id else None
    normalized = _normalize_optional_llm_model_id(val)

    set_config_value("llm_model_graphics_id", normalized)
    with _prefs_lock:
        _runtime_preferences["llm_model_graphics_id"] = normalized
        snapshot = dict(_runtime_preferences)
    return snapshot

def update_llm_thinking_mode(enabled: bool) -> Dict[str, Any]:
    value = bool(enabled)
    set_config_value("llm_thinking_mode", value)
    with _prefs_lock:
        _runtime_preferences["llm_thinking_mode"] = value
        snapshot = dict(_runtime_preferences)
    return snapshot


def get_llm_model_info(model_id: str | None = None) -> Dict[str, Any]:
    target_id = model_id or get_llm_model_id()
    for model in get_llm_model_catalog():
        if model.get("id") == target_id:
            return model
    # Fallback to default if not found
    for model in get_llm_model_catalog():
        if model.get("id") == LLM_MODEL_DEFAULT_ID:
            return model
    catalog = get_llm_model_catalog()
    return catalog[0] if catalog else {}


def update_docs_dir(new_path: Any) -> Dict[str, Any]:
    value = None
    if new_path is not None:
        raw = str(new_path).strip()
        if raw:
            path = _resolve_server_path(raw)
            if not path.exists() or not path.is_dir():
                raise ValueError("Cartella documenti non valida o non accessibile.")
            value = _store_path_value(raw)
    set_config_value("docs_dir_override", value)
    with _prefs_lock:
        _runtime_preferences["docs_dir_override"] = value
        snapshot = dict(_runtime_preferences)
    return snapshot


def update_models_dir(new_path: Any) -> Dict[str, Any]:
    value = None
    if new_path is not None:
        raw = str(new_path).strip()
        if raw:
            path = _resolve_server_path(raw)
            if not path.exists() or not path.is_dir():
                raise ValueError("Cartella modelli non valida o non accessibile.")
            value = _store_path_value(raw)
    set_config_value("models_dir_override", value)
    with _prefs_lock:
        _runtime_preferences["models_dir_override"] = value
        snapshot = dict(_runtime_preferences)
    return snapshot


def update_mcp_services_extra(raw_services: Any) -> Dict[str, Any]:
    services = _normalize_mcp_services(raw_services)
    set_config_value("mcp_services_extra", services)
    with _prefs_lock:
        _runtime_preferences["mcp_services_extra"] = services
        snapshot = dict(_runtime_preferences)
    return snapshot


def update_user_info(fields: Dict[str, Any]) -> Dict[str, Any]:
    updates: Dict[str, Any] = {}
    if "user_info_enabled" in fields:
        updates["user_info_enabled"] = bool(fields.get("user_info_enabled"))
    for key in [
        "user_info_name",
        "user_info_role",
        "user_info_personal",
        "user_info_professional",
        "user_info_tone",
    ]:
        if key in fields:
            raw = fields.get(key)
            if raw is None:
                updates[key] = None
            else:
                value = str(raw).strip()
                updates[key] = value if value else None
    if not updates:
        return get_user_preferences()

    for key, value in updates.items():
        set_config_value(key, value)
    with _prefs_lock:
        _runtime_preferences.update(updates)
        snapshot = dict(_runtime_preferences)
    return snapshot


def update_web_search_user_mail(new_mail: Any) -> Dict[str, Any]:
    value = _normalize_text(new_mail)
    set_config_value("web_search_user_mail", value)
    with _prefs_lock:
        _runtime_preferences["web_search_user_mail"] = value or ""
        snapshot = dict(_runtime_preferences)
    return snapshot


def get_streaming_mode_options() -> List[Dict[str, str]]:
    return list(STREAMING_MODE_OPTIONS)


def is_dynamic_context_enabled() -> bool:
    with _prefs_lock:
        return bool(_runtime_preferences.get("llm_dynamic_context"))


def update_dynamic_context(enabled: bool) -> Dict[str, Any]:
    value = bool(enabled)
    set_config_value("llm_dynamic_context", value)
    with _prefs_lock:
        _runtime_preferences["llm_dynamic_context"] = value
        snapshot = dict(_runtime_preferences)
    return snapshot


def get_context_limits() -> tuple[int, int]:
    return LLM_N_CTX, LLM_DYNAMIC_MAX_N_CTX


def is_dynamic_max_tokens_enabled() -> bool:
    with _prefs_lock:
        return bool(_runtime_preferences.get("llm_dynamic_max_tokens"))


def update_dynamic_max_tokens(enabled: bool) -> Dict[str, Any]:
    value = bool(enabled)
    set_config_value("llm_dynamic_max_tokens", value)
    with _prefs_lock:
        _runtime_preferences["llm_dynamic_max_tokens"] = value
        snapshot = dict(_runtime_preferences)
    return snapshot


def _sanitize_excel_limit(value: Any, cap: int) -> int | None:
    if value is None:
        return None
    try:
        as_int = int(value)
    except (TypeError, ValueError):
        return None
    if as_int <= 0:
        return None
    return min(cap, as_int)


def get_excel_limits() -> tuple[int, int]:
    with _prefs_lock:
        rows_override = _runtime_preferences.get("rag_excel_csv_max_rows")
        cols_override = _runtime_preferences.get("rag_excel_csv_max_cols")
    rows = rows_override if isinstance(rows_override, int) and rows_override > 0 else RAG_EXCEL_CSV_MAX_ROWS
    cols = cols_override if isinstance(cols_override, int) and cols_override > 0 else RAG_EXCEL_CSV_MAX_COLS
    return rows, cols


def update_excel_limits(rows: Any = None, cols: Any = None) -> Dict[str, Any]:
    new_rows = _sanitize_excel_limit(rows, EXCEL_ROW_LIMIT_CAP) if rows is not None else None
    new_cols = _sanitize_excel_limit(cols, EXCEL_COL_LIMIT_CAP) if cols is not None else None

    if rows is not None:
        set_config_value("rag_excel_csv_max_rows", new_rows)
    if cols is not None:
        set_config_value("rag_excel_csv_max_cols", new_cols)

    with _prefs_lock:
        if rows is not None:
            _runtime_preferences["rag_excel_csv_max_rows"] = new_rows
        if cols is not None:
            _runtime_preferences["rag_excel_csv_max_cols"] = new_cols
        snapshot = dict(_runtime_preferences)
    return snapshot


def is_graphics_render_png_enabled() -> bool:
    with _prefs_lock:
        value = _runtime_preferences.get("graphics_render_png", GRAPHICS_RENDER_PNG_DEFAULT)
    return bool(value)


def update_graphics_render_png(enabled: bool) -> Dict[str, Any]:
    value = bool(enabled)
    set_config_value("graphics_render_png", value)
    with _prefs_lock:
        _runtime_preferences["graphics_render_png"] = value
        snapshot = dict(_runtime_preferences)
    return snapshot


def get_graphics_preferred_kind() -> str:
    with _prefs_lock:
        value = _runtime_preferences.get("graphics_preferred_kind", GRAPHICS_DEFAULT_KIND)
    value = str(value).strip().lower()
    return value if value in GRAPHICS_ALLOWED_KINDS else GRAPHICS_DEFAULT_KIND


def update_graphics_preferred_kind(kind: str) -> Dict[str, Any]:
    normalized = str(kind).strip().lower()
    if normalized not in GRAPHICS_ALLOWED_KINDS:
        normalized = GRAPHICS_DEFAULT_KIND
    set_config_value("graphics_preferred_kind", normalized)
    with _prefs_lock:
        _runtime_preferences["graphics_preferred_kind"] = normalized
        snapshot = dict(_runtime_preferences)
    return snapshot


def get_api_provider_settings() -> Dict[str, Any]:
    with _prefs_lock:
        return {
            "api_provider_enabled": bool(_runtime_preferences.get("api_provider_enabled", False)),
            "api_provider_type": _runtime_preferences.get("api_provider_type"),
            "api_base_url": _runtime_preferences.get("api_base_url"),
            "api_model": _runtime_preferences.get("api_model"),
            "api_api_key": _runtime_preferences.get("api_api_key"),
            "api_allow_chat": bool(_runtime_preferences.get("api_allow_chat", True)),
            "api_allow_rag": bool(_runtime_preferences.get("api_allow_rag", True)),
            "api_allow_history": bool(_runtime_preferences.get("api_allow_history", True)),
            "api_supports_vision": bool(_runtime_preferences.get("api_supports_vision", False)),
            "api_supports_ocr": bool(_runtime_preferences.get("api_supports_ocr", False)),
            "api_supports_thinking": bool(_runtime_preferences.get("api_supports_thinking", False)),
        }


def is_api_provider_enabled_for_mode(mode: str) -> bool:
    settings = get_api_provider_settings()
    if not settings.get("api_provider_enabled"):
        return False
    mode = (mode or "").strip().lower()
    if mode == "chat":
        return bool(settings.get("api_allow_chat", True))
    if mode == "rag":
        return bool(settings.get("api_allow_rag", True))
    if mode == "history":
        return bool(settings.get("api_allow_history", True))
    return False


def update_api_provider(fields: Dict[str, Any]) -> Dict[str, Any]:
    updates: Dict[str, Any] = {}
    if "api_provider_enabled" in fields:
        updates["api_provider_enabled"] = bool(fields.get("api_provider_enabled"))
    if "api_provider_type" in fields:
        updates["api_provider_type"] = _normalize_provider_type(fields.get("api_provider_type"))
    if "api_base_url" in fields:
        provider = updates.get("api_provider_type") or _normalize_provider_type(
            fields.get("api_provider_type")
        )
        updates["api_base_url"] = _normalize_api_base_url(fields.get("api_base_url"), provider)
    if "api_model" in fields:
        updates["api_model"] = _normalize_text(fields.get("api_model"))
    if "api_api_key" in fields:
        updates["api_api_key"] = _normalize_text(fields.get("api_api_key"))
    if "api_allow_chat" in fields:
        updates["api_allow_chat"] = bool(fields.get("api_allow_chat"))
    if "api_allow_rag" in fields:
        updates["api_allow_rag"] = bool(fields.get("api_allow_rag"))
    if "api_allow_history" in fields:
        updates["api_allow_history"] = bool(fields.get("api_allow_history"))
    if "api_supports_vision" in fields:
        updates["api_supports_vision"] = bool(fields.get("api_supports_vision"))
    if "api_supports_ocr" in fields:
        updates["api_supports_ocr"] = bool(fields.get("api_supports_ocr"))
    if "api_supports_thinking" in fields:
        updates["api_supports_thinking"] = bool(fields.get("api_supports_thinking"))

    if not updates:
        return get_user_preferences()

    for key, value in updates.items():
        set_config_value(key, value)
    with _prefs_lock:
        _runtime_preferences.update(updates)
        snapshot = dict(_runtime_preferences)
    return snapshot
