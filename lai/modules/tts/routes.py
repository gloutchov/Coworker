# -*- coding: utf-8 -*-
"""Endpoint FastAPI per la generazione audio locale."""

from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from modules.tts.engine import TTSError, synthesize_text_to_file
from modules.tts.lang import (
    detect_language_code,
    pick_coqui_model_for_language,
)
from rag import AUDIO_SUFFIXES, extract_text_from_file

router = APIRouter()


def _media_type(fmt: str | None) -> str:
    fmt = (fmt or "wav").lower()
    if fmt in {"wav", "wave"}:
        return "audio/wav"
    if fmt in {"mp3"}:
        return "audio/mpeg"
    if fmt in {"ogg"}:
        return "audio/ogg"
    return "application/octet-stream"


class TextSynthesisPayload(BaseModel):
    text: str
    format: str | None = None
    title: str | None = None
    language: str | None = None


def _build_tts_response(
    audio_path: Path,
    meta: dict,
    language: str | None,
    fallback_voice: str | None,
    background_tasks: BackgroundTasks,
):
    """Restituisce la risposta HTTP e pianifica la pulizia del file temporaneo."""
    background_tasks.add_task(audio_path.unlink, missing_ok=True)
    output_format = (meta.get("format") or "wav").lower()

    headers = {
        "X-Text-Truncated": "1" if meta.get("truncated") else "0",
        "X-Text-Chars": str(meta.get("char_count", 0)),
        "X-Suggested-Filename": meta.get("filename", f"documento.{output_format}"),
        "X-Detected-Language": language or "",
        "X-Voice-Used": meta.get("voice") or (fallback_voice or ""),
        "X-Output-Format": output_format,
    }

    return FileResponse(
        path=audio_path,
        media_type=_media_type(output_format),
        filename=meta.get("filename"),
        headers=headers,
        background=background_tasks,
    )


@router.post("/tts/from-text")
async def create_audio_from_text(
    payload: TextSynthesisPayload,
    background_tasks: BackgroundTasks,
):
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Inserisci del testo da convertire in audio.")

    requested_format = (payload.format or "").strip().lower() or None
    language = (payload.language or "").strip().lower() or detect_language_code(text)
    voice_name = pick_coqui_model_for_language(language)

    try:
        audio_path, meta = synthesize_text_to_file(
            text,
            preferred_name=payload.title,
            voice_name=voice_name,
            output_format=requested_format,
            language_code=language,
        )
    except TTSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return _build_tts_response(audio_path, meta, language, voice_name, background_tasks)


@router.post("/tts/from-file")
async def create_audio_from_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    format: str = Form("wav"),
):
    filename = (file.filename or "documento").strip() or "documento"
    suffix = Path(filename).suffix.lower() or ".tmp"
    if suffix in AUDIO_SUFFIXES:
        raise HTTPException(status_code=400, detail="Seleziona un documento testuale (non un file audio).")

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        temp_path = Path(tmp.name)

    try:
        extracted_text = extract_text_from_file(temp_path)
    finally:
        temp_path.unlink(missing_ok=True)

    if not extracted_text or not extracted_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Impossibile estrarre testo utile dal file selezionato.",
        )

    language = detect_language_code(extracted_text)
    voice_name = pick_coqui_model_for_language(language)
    target_format = (format or "").strip().lower() or None

    try:
        audio_path, meta = synthesize_text_to_file(
            extracted_text,
            preferred_name=Path(filename).stem,
            voice_name=voice_name,
            output_format=target_format,
            language_code=language,
        )
    except TTSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return _build_tts_response(audio_path, meta, language, voice_name, background_tasks)
