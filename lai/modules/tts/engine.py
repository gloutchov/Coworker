# -*- coding: utf-8 -*-
"""Funzioni di supporto per la generazione audio (text-to-speech) locale."""

from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path
from typing import Tuple

from config import (
    BASE_DIR,
    TTS_ALLOWED_FORMATS,
    TTS_COQUI_DEFAULT_MODEL,
    TTS_COQUI_SPEAKER,
    TTS_COQUI_SPEAKER_WAV,
    TTS_COQUI_SPEAKER_WAVS,
    TTS_COQUI_TOS_AGREED,
    TTS_COQUI_USE_GPU,
    TTS_DEFAULT_OUTPUT_FORMAT,
    TTS_FFMPEG_BINARY,
    TTS_MAX_TEXT_CHARS,
    TTS_TRUNCATE_AT_BREAK,
)

_COQUI_TTS = None
_COQUI_MODEL_NAME = None
_COQUI_TOS_LOGGED = False


class TTSError(RuntimeError):
    """Errore applicativo durante la generazione TTS."""


def _resolve_server_path(value: str) -> str:
    if not value:
        return value
    path = Path(value)
    if path.is_absolute():
        return str(path)
    return str(BASE_DIR / path)


def _allowlist_coqui_torch_globals() -> None:
    """Allowlist Coqui XTTS config for torch.load weights_only mode (PyTorch >= 2.6)."""
    try:
        import torch
        import inspect
    except Exception:
        return

    allowlist = []
    for module_path in (
        "TTS.tts.configs.xtts_config",
        "TTS.tts.models.xtts",
        "TTS.config.shared_configs",
    ):
        try:
            module = __import__(module_path, fromlist=["*"])
        except Exception:
            continue

        for _, item in inspect.getmembers(module, inspect.isclass):
            if item.__module__ == module_path:
                allowlist.append(item)

    add_safe_globals = getattr(torch.serialization, "add_safe_globals", None)
    if callable(add_safe_globals):
        if allowlist:
            add_safe_globals(allowlist)


def _normalize_text(raw_text: str) -> str:
    text = (raw_text or "").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    lines = [line.strip() for line in text.split("\n")]
    cleaned: list[str] = []
    for line in lines:
        if line:
            cleaned.append(line)
        elif cleaned and cleaned[-1] != "":
            cleaned.append("")
    return "\n".join(cleaned).strip()


def _trim_text(text: str) -> Tuple[str, bool]:
    if len(text) <= TTS_MAX_TEXT_CHARS:
        return text, False
    truncated = True
    trimmed = text[:TTS_MAX_TEXT_CHARS]
    if TTS_TRUNCATE_AT_BREAK:
        last_break = max(trimmed.rfind("\n\n"), trimmed.rfind(". "))
        if last_break > int(TTS_MAX_TEXT_CHARS * 0.6):
            trimmed = trimmed[: last_break + 1]
    return trimmed.strip(), truncated


def _safe_download_name(preferred_name: str | None, fmt: str) -> str:
    base = preferred_name or "documento"
    base = re.sub(r"[^0-9a-zA-Z_-]+", "-", base).strip("-").lower()
    if not base:
        base = "documento"
    return f"{base}.{fmt}"


def _convert_audio_format(source_path: Path, target_format: str) -> Path:
    import shutil
    import subprocess

    binary_path = shutil.which(TTS_FFMPEG_BINARY)
    if not binary_path:
        raise TTSError(
            f"Binario '{TTS_FFMPEG_BINARY}' non trovato. Installare ffmpeg e impostare FFMPEG_BIN "
            "oppure selezionare il formato WAV."
        )

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{target_format}")
    tmp.close()
    dest_path = Path(tmp.name)

    cmd = [
        binary_path,
        "-y",
        "-i",
        str(source_path),
        "-vn",
    ]
    if target_format == "mp3":
        cmd += ["-codec:a", "libmp3lame", "-qscale:a", "2"]
    cmd.append(str(dest_path))

    try:
        subprocess.run(cmd, check=True, capture_output=True)
    except subprocess.CalledProcessError as exc:
        dest_path.unlink(missing_ok=True)
        stderr = (exc.stderr or b"").decode("utf-8", errors="ignore").strip()
        raise TTSError(f"Errore durante la conversione in {target_format}: {stderr or exc}") from exc
    finally:
        source_path.unlink(missing_ok=True)

    return dest_path


def _resolve_coqui_model(model_name: str | None) -> str:
    selected = (model_name or "").strip() or TTS_COQUI_DEFAULT_MODEL
    if not selected:
        raise TTSError(
            "Modello Coqui non configurato. Imposta COQUI_TTS_MODEL o "
            "configura TTS_COQUI_LANGUAGE_MODELS in config.py."
        )
    return selected


def _get_coqui_tts(model_name: str):
    global _COQUI_TTS, _COQUI_MODEL_NAME, _COQUI_TOS_LOGGED
    if _COQUI_TTS is not None and _COQUI_MODEL_NAME == model_name:
        return _COQUI_TTS

    try:
        from TTS.api import TTS
    except ImportError as exc:
        raise TTSError(
            "Modulo 'TTS' non installato. Installa Coqui TTS con 'pip install TTS'."
        ) from exc

    if TTS_COQUI_TOS_AGREED:
        os.environ["COQUI_TOS_AGREED"] = TTS_COQUI_TOS_AGREED
        if not _COQUI_TOS_LOGGED:
            print("[TTS] COQUI_TOS_AGREED impostato (modalità non interattiva).")
            _COQUI_TOS_LOGGED = True

    _allowlist_coqui_torch_globals()
    _COQUI_TTS = TTS(model_name=model_name, progress_bar=False, gpu=TTS_COQUI_USE_GPU)
    _COQUI_MODEL_NAME = model_name
    return _COQUI_TTS


def _synthesize_with_coqui(
    text: str,
    model_name: str | None,
    output_path: Path,
    language_code: str | None,
) -> str:
    selected_model = _resolve_coqui_model(model_name)

    speaker_wav = ""
    if language_code:
        speaker_wav = (TTS_COQUI_SPEAKER_WAVS.get(language_code.lower()) or "").strip()
    if not speaker_wav:
        speaker_wav = (TTS_COQUI_SPEAKER_WAV or "").strip()
    if speaker_wav:
        speaker_wav = _resolve_server_path(speaker_wav)
        if not Path(speaker_wav).exists():
            raise TTSError(f"Speaker WAV non trovato: {speaker_wav}")

    tts = _get_coqui_tts(selected_model)

    tts_kwargs = {
        "text": text,
        "file_path": str(output_path),
    }
    if language_code:
        tts_kwargs["language"] = language_code
    if TTS_COQUI_SPEAKER:
        tts_kwargs["speaker"] = TTS_COQUI_SPEAKER
    if speaker_wav:
        tts_kwargs["speaker_wav"] = speaker_wav

    try:
        tts.tts_to_file(**tts_kwargs)
    except Exception as exc:
        output_path.unlink(missing_ok=True)
        raise TTSError(f"Errore durante l'esecuzione di Coqui TTS: {exc}") from exc

    return selected_model


def synthesize_text_to_file(
    text: str,
    preferred_name: str | None = None,
    voice_name: str | None = None,
    output_format: str | None = None,
    language_code: str | None = None,
) -> Tuple[Path, dict]:
    """
    Genera un file audio a partire dal testo fornito.
    Restituisce il percorso del file audio temporaneo e metadati aggiuntivi.
    """
    normalized = _normalize_text(text)
    normalized, truncated = _trim_text(normalized)

    if not normalized:
        raise TTSError("Nessun testo utile da convertire in audio.")

    requested_format = (output_format or TTS_DEFAULT_OUTPUT_FORMAT or "wav").lower()
    if requested_format not in TTS_ALLOWED_FORMATS:
        raise TTSError(
            f"Formato audio '{requested_format}' non supportato. Formati disponibili: {', '.join(TTS_ALLOWED_FORMATS)}"
        )

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    tmp.close()
    output_path = Path(tmp.name)

    voice_label = _synthesize_with_coqui(
        normalized,
        voice_name,
        output_path,
        language_code,
    )

    final_path = output_path
    if requested_format != "wav":
        final_path = _convert_audio_format(output_path, requested_format)

    meta = {
        "truncated": truncated,
        "char_count": len(normalized),
        "filename": _safe_download_name(preferred_name, requested_format),
        "voice": voice_label,
        "format": requested_format,
    }
    return final_path, meta
