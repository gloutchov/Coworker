import os
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import (
    PROMPT_GRAPHICS_SYSTEM,
    PROMPT_GRAPHICS_USER_TEMPLATE,
    GRAPHICS_TOP_K_DEFAULT,
    GRAPHICS_RENDER_PNG_DEFAULT,
)
from llm_client import chat_completion
from rag import get_relevant_chunks
from modules.llm.context_window import prepare_history_window, adjust_retrieval_top_k
from modules.rag.routes import _get_temp_doc, _rank_temp_chunks
from modules.config.preferences import (
    is_graphics_render_png_enabled,
    get_graphics_preferred_kind,
    get_llm_model_graphics_id,
    get_llm_model_id,
)
from modules.graphics.validation import parse_graphics_payload, validate_graphics_payload
from modules.graphics.render import render_svg_to_png
from modules.config.preferences import apply_user_info_to_system_prompt
from modules.utils.i18n import normalize_language, get_prompt_text


class GraphicsRequest(BaseModel):
    prompt: str
    mode: str = "chat"
    top_k: int = GRAPHICS_TOP_K_DEFAULT
    history: Optional[List[dict]] = None
    render_png: Optional[bool] = None
    preferred_kind: Optional[str] = None
    temp_doc_id: Optional[str] = None
    model_id: Optional[str] = None
    language: Optional[str] = None


router = APIRouter()

_GRAPHICS_DEBUG_OUTPUT = os.environ.get("GRAPHICS_DEBUG_OUTPUT", "").strip().lower() in {
    "1",
    "true",
    "yes",
}
GRAPHICS_GENERATION_MAX_ATTEMPTS = 2
GRAPHICS_RETRY_HINT = (
    "ATTENZIONE: la risposta precedente non rispettava il formato JSON richiesto. "
    "Rispondi ora esclusivamente con l'oggetto JSON specificato (type, title, kind, markup) "
    "oppure con il markup puro in formato {preferred_kind}, senza testo extra o commenti."
)


def _build_history(history: Optional[List[dict]]) -> List[dict]:
    history_messages: List[dict] = []
    if not history:
        return history_messages
    for m in history:
        q = (m.get("question") or "").strip()
        a = (m.get("answer") or "").strip()
        if q:
            history_messages.append({"role": "user", "content": q})
        if a:
            history_messages.append({"role": "assistant", "content": a})
    return history_messages


@router.post("/graphics")
def generate_graphics(req: GraphicsRequest):
    prompt = (req.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt grafico mancante.")

    effective_language = normalize_language(req.language)
    mode = (req.mode or "chat").strip().lower()
    if mode not in {"chat", "rag"}:
        raise HTTPException(status_code=400, detail="Modalita' grafica non supportata.")

    context_text = ""
    sources: List[dict] = []
    extra_contexts: List[str] = []

    if mode == "rag":
        effective_top_k = adjust_retrieval_top_k(req.top_k, GRAPHICS_TOP_K_DEFAULT)
        top_chunks = get_relevant_chunks(prompt, effective_top_k)
        if not top_chunks:
            return {"error": "Indice documenti vuoto o nessun chunk rilevante. Chiama prima /api/reindex."}

        parts = []
        for rec in top_chunks:
            parts.append(
                f"=== FILE: {rec['file']} (chunk {rec['chunk_index']}) ===\n{rec['text']}"
            )
            sources.append({"file": rec["file"], "chunk_index": rec["chunk_index"]})

        context_text = "\n\n".join(parts)
        extra_contexts.append(context_text)
    elif mode == "chat" and req.temp_doc_id:
        doc = _get_temp_doc(req.temp_doc_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Documento temporaneo non trovato o scaduto.")

        effective_top_k = adjust_retrieval_top_k(req.top_k, GRAPHICS_TOP_K_DEFAULT)
        top_chunks = _rank_temp_chunks(prompt, doc.get("chunks") or [], effective_top_k)
        if not top_chunks:
            return {"error": "Nessun contenuto rilevante trovato nel documento caricato."}

        parts = []
        for rec in top_chunks:
            parts.append(
                f"=== FILE TEMPORANEO: {doc['name']} (chunk {rec['chunk_index']}) ===\n{rec['text']}"
            )
            sources.append(
                {
                    "file": doc["name"],
                    "chunk_index": rec["chunk_index"],
                    "temp_doc_id": req.temp_doc_id,
                }
            )

        context_text = "\n\n".join(parts)
        extra_contexts.append(context_text)

    history_messages = _build_history(req.history)

    preferred_kind = (req.preferred_kind or get_graphics_preferred_kind()).strip().lower()
    requested_model_id = (req.model_id or "").strip()
    if not requested_model_id:
        requested_model_id = get_llm_model_graphics_id()
    if not requested_model_id:
        requested_model_id = get_llm_model_id()
    empty_context_label = (
        "Nessun estratto disponibile."
        if effective_language == "it"
        else "No excerpts available."
    )
    user_prompt = get_prompt_text(PROMPT_GRAPHICS_USER_TEMPLATE, effective_language).format(
        question=prompt,
        context_text=context_text or empty_context_label,
        preferred_kind=preferred_kind,
    )

    trimmed_history, context_plan = prepare_history_window(
        prompt,
        history_messages,
        extra_contexts,
    )

    system_prompt = apply_user_info_to_system_prompt(
        get_prompt_text(PROMPT_GRAPHICS_SYSTEM, effective_language)
    )
    sanitized = None
    warnings: List[str] = []
    raw_text: str = ""
    last_error: ValueError | None = None

    for attempt in range(GRAPHICS_GENERATION_MAX_ATTEMPTS):
        retry_suffix = ""
        if attempt > 0:
            retry_suffix = "\n\n" + GRAPHICS_RETRY_HINT.replace(
                "{preferred_kind}", preferred_kind or "svg"
            )
        augmented_prompt = user_prompt + retry_suffix
        raw_text = chat_completion(
            system_prompt,
            augmented_prompt,
            history=trimmed_history,
            max_tokens=context_plan.get("response_tokens_budget"),
            model_id=requested_model_id,
        )
        try:
            if not (raw_text or "").strip():
                raise ValueError("Risposta non valida: output vuoto dal modello.")
            payload = parse_graphics_payload(raw_text)
            sanitized, warnings = validate_graphics_payload(payload)
            break
        except ValueError as exc:
            last_error = exc
            if attempt == GRAPHICS_GENERATION_MAX_ATTEMPTS - 1:
                break

    if sanitized is None:
        detail = str(last_error) if last_error else "Risposta non valida: generazione grafica fallita."
        snippet = (raw_text or "").strip().replace("\n", "\\n")
        if len(snippet) > 400:
            snippet = f"{snippet[:400]}..."
        if snippet:
            detail = f"{detail} Output: {snippet}"
        if _GRAPHICS_DEBUG_OUTPUT and snippet:
            print(f"[graphics] parse error: {detail}.")
        raise HTTPException(status_code=422, detail=detail)

    png_base64 = None
    render_warnings: List[str] = []
    render_png = req.render_png
    if render_png is None:
        render_png = is_graphics_render_png_enabled()

    if render_png and sanitized["kind"] == "svg":
        png_base64, render_warning = render_svg_to_png(sanitized["markup"])
        if render_warning:
            render_warnings.append(render_warning)

    return {
        **sanitized,
        "warnings": warnings + render_warnings,
        "png_base64": png_base64,
        "sources": sources,
        "context_plan": context_plan,
    }
