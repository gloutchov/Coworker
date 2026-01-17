# -*- coding: utf-8 -*-
"""Utility per rilevare la lingua e scegliere la voce TTS corretta."""

from __future__ import annotations

import re
from typing import Optional

from langdetect import DetectorFactory, LangDetectException, detect

from config import TTS_COQUI_DEFAULT_MODEL, TTS_COQUI_LANGUAGE_MODELS

# Rendiamo deterministica la rilevazione
DetectorFactory.seed = 0


def detect_language_code(text: str) -> Optional[str]:
    """Rileva la lingua (codice ISO 639-1) dal testo, se possibile."""
    if not text:
        return None

    normalized = re.sub(r"\s+", " ", text).strip()
    if len(normalized) < 20:
        return None

    snippet = normalized[:4000]
    try:
        code = detect(snippet)
    except LangDetectException:
        return None

    return code.lower() if code else None


def pick_coqui_model_for_language(lang_code: Optional[str]) -> str:
    """Restituisce il modello Coqui da usare per la lingua indicata."""
    normalized = (lang_code or "").strip().lower()
    candidates: list[str] = []
    if normalized:
        candidates.append(normalized)
        if "-" in normalized:
            candidates.append(normalized.split("-")[0])

    for candidate in candidates:
        model = TTS_COQUI_LANGUAGE_MODELS.get(candidate)
        if model:
            return model
    return TTS_COQUI_DEFAULT_MODEL
