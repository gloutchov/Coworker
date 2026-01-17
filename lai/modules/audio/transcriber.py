# -*- coding: utf-8 -*-
"""
Funzioni di trascrizione audio basate su faster-whisper.
Restituisce testo e segmenti con timestamp per consentire il merge dialogico lato frontend.
"""

from typing import Optional, Dict, Any
from faster_whisper import WhisperModel

from config import WHISPER_MODEL_PATH, WHISPER_DEVICE, WHISPER_COMPUTE_TYPE

_whisper_model_instance: Optional[WhisperModel] = None


def get_whisper_model() -> Optional[WhisperModel]:
    """Inizializza (lazy) e restituisce l'istanza singleton del modello Whisper."""
    global _whisper_model_instance
    if _whisper_model_instance:
        return _whisper_model_instance
    try:
        print(f"[Whisper] Inizializzazione modello da: {WHISPER_MODEL_PATH}")
        _whisper_model_instance = WhisperModel(
            str(WHISPER_MODEL_PATH),
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE_TYPE
        )
        print("[Whisper] Modello inizializzato con successo.")
        return _whisper_model_instance
    except Exception as e:
        print(f"[Whisper] ERRORE: Impossibile inizializzare il modello: {e}")
        return None


def transcribe_audio_file(filepath: str) -> Optional[Dict[str, Any]]:
    """
    Trascrive un file audio usando l'istanza singleton.

    Returns:
        {"text": str, "segments": [{"start": float, "end": float, "text": str}, ...]}
        oppure None in caso di errore.
    """
    model = get_whisper_model()
    if not model:
        print("[Whisper] ERRORE: Trascrizione saltata, modello non disponibile.")
        return None

    try:
        print(f"[Whisper] Trascrizione del file: {filepath}")
        # Tenere i silenzi per preservare gli offset
        segments, _ = model.transcribe(filepath)

        seg_list = []
        for seg in segments:
            seg_text = (seg.text or "").strip()
            if not seg_text:
                continue
            seg_list.append({
                "start": float(seg.start) if seg.start is not None else 0.0,
                "end": float(seg.end) if seg.end is not None else 0.0,
                "text": seg_text
            })

        full_text = " ".join(s["text"] for s in seg_list)

        print(f"[Whisper] Trascrizione completata per: {filepath}")
        return {"text": full_text, "segments": seg_list}
    except Exception as e:
        print(f"[Whisper] ERRORE durante la trascrizione di {filepath}: {e}")
        return None
