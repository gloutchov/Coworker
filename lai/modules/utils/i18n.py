from __future__ import annotations

from typing import Iterable

DEFAULT_LANGUAGE = "it"
SUPPORTED_LANGUAGES = {"it", "en"}

LANGUAGE_LABELS = {
  "it": {
    "name": "italiano",
    "english_name": "Italian",
    "instruction": "Rispondi in italiano.",
  },
  "en": {
    "name": "inglese",
    "english_name": "English",
    "instruction": "Answer in English.",
  },
}

INSTRUCTION_CLAUSES = {
  "mcp_sources": {
    "it": "cita la fonte MCP quando usi quei contenuti",
    "en": "cite the MCP source when you use that content",
  },
  "note_style": {
    "it": "mantieni lo stile e la coerenza della nota",
    "en": "preserve the note's structure and tone",
  },
}


def normalize_language(value: str | None) -> str:
  if not value:
    return DEFAULT_LANGUAGE
  normalized = value.strip().lower()
  if normalized in SUPPORTED_LANGUAGES:
    return normalized
  return DEFAULT_LANGUAGE


def get_prompt_text(prompt_map, language: str) -> str:
  if isinstance(prompt_map, dict):
    return prompt_map.get(language) or prompt_map.get(DEFAULT_LANGUAGE) or ""
  return prompt_map or ""


def join_clauses(language: str, clauses: Iterable[str]) -> str:
  parts = [clause for clause in clauses if clause]
  if not parts:
    return ""
  separator = " e " if language == "it" else " and "
  return separator.join(parts)


def build_response_instruction(language: str, clause_keys: Iterable[str] | None = None) -> str:
  lang = normalize_language(language)
  base = LANGUAGE_LABELS.get(lang, LANGUAGE_LABELS[DEFAULT_LANGUAGE])["instruction"]
  clauses = []
  if clause_keys:
    for key in clause_keys:
      clause = INSTRUCTION_CLAUSES.get(key, {}).get(lang)
      if clause:
        clauses.append(clause)
  if not clauses:
    return base
  glue = " " if lang == "it" else " "
  return f"{base.rstrip('.')}{glue}{join_clauses(lang, clauses)}."
