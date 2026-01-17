#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Scarica in anticipo un modello Coqui TTS per evitare download a runtime."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys

# --- TEMP: bypass SSL verification ONLY for this run (use at your own risk) ---
import warnings
import requests
from urllib3.exceptions import InsecureRequestWarning

warnings.simplefilter("ignore", InsecureRequestWarning)

_old_get = requests.get

def _insecure_get(*args, **kwargs):
    kwargs.setdefault("verify", False)  # disable cert verification
    return _old_get(*args, **kwargs)

requests.get = _insecure_get
# --- END TEMP ---

def _load_default_model() -> str:
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root))
    try:
        import config  # type: ignore
    except Exception as exc:
        raise RuntimeError(f"Impossibile leggere config.py: {exc}") from exc

    model_name = (getattr(config, "TTS_COQUI_DEFAULT_MODEL", "") or "").strip()
    if not model_name:
        raise RuntimeError("TTS_COQUI_DEFAULT_MODEL non configurato in config.py.")
    return model_name


def main() -> int:
    parser = argparse.ArgumentParser(description="Warm-up Coqui TTS (download modello).")
    parser.add_argument(
        "--model",
        help="Nome del modello Coqui (es. tts_models/multilingual/multi-dataset/xtts_v2).",
    )
    parser.add_argument("--accept-tos", action="store_true", help="Accetta automaticamente la TOS Coqui.")
    args = parser.parse_args()

    if args.accept_tos:
        os.environ["COQUI_TOS_AGREED"] = "1"

    model_name = (args.model or "").strip() or _load_default_model()

    try:
        from TTS.api import TTS
    except ImportError as exc:
        print("Modulo 'TTS' non installato. Esegui: pip install TTS", file=sys.stderr)
        return 1

    print(f"[TTS] Download modello: {model_name}")
    TTS(model_name=model_name, progress_bar=True, gpu=False)
    print("[TTS] Modello pronto.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
