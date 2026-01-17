import json
import re
from typing import Any, Tuple

from config import GRAPHICS_MAX_MARKUP_CHARS, GRAPHICS_ALLOWED_KINDS, GRAPHICS_DEFAULT_KIND


_SVG_BLOCKLIST = (
    "<script",
    "</script",
    "onload=",
    "onerror=",
    "onclick=",
    "onmouseover=",
    "onmouseenter=",
    "onmouseleave=",
    "javascript:",
)

_MERMAID_STARTERS = (
    "graph",
    "flowchart",
    "sequenceDiagram",
    "classDiagram",
    "stateDiagram",
    "stateDiagram-v2",
    "erDiagram",
    "journey",
    "gantt",
    "pie",
    "mindmap",
    "gitGraph",
    "c4Context",
    "timeline",
    "quadrantChart",
    "xychart",
    "sankey",
    "requirementDiagram",
    "block-beta",
    "zenuml",
)

_MARKUP_LABELS = {"mermaid", "plantuml", "svg"}


def _strip_code_fences(text: str) -> str:
    stripped = (text or "").strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if len(lines) >= 3 and lines[0].startswith("```") and lines[-1].startswith("```"):
            return "\n".join(lines[1:-1]).strip()
    return stripped


def _extract_fenced_blocks(text: str) -> list[str]:
    if not text:
        return []
    # Find all code blocks, ignoring any language tag after ```
    matches = re.findall(r"```[^\n]*\n(.*?)```", text, re.DOTALL)
    return [m.strip() for m in matches if m.strip()]


def _extract_labeled_fenced_blocks(text: str) -> list[tuple[str, str]]:
    if not text:
        return []
    matches = re.findall(r"```([^\n]*)\n(.*?)```", text, re.DOTALL)
    blocks = []
    for label, body in matches:
        label_clean = (label or "").strip().lower()
        body_clean = (body or "").strip()
        if body_clean:
            blocks.append((label_clean, body_clean))
    return blocks


def _find_json_block(text: str) -> str | None:
    if not text:
        return None
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    return text[start : end + 1]


def _extract_mermaid_code(text: str) -> str | None:
    """
    Scans text lines to find the start of a Mermaid diagram.
    Returns the text starting from that line, or None if not found.
    Handles preceding comments (%%) correctly.
    """
    lines = (text or "").splitlines()
    start_index = -1
    
    # We look for the first line that is either a comment or a valid starter.
    # But strictly speaking, a mermaid diagram starts with the graph definition.
    # Comments *can* precede it, but usually the 'graph TD' is what defines the block.
    # However, sometimes users put comments first.
    # Strategy: Find the first line that matches a starter. 
    # Everything before it is preamble, UNLESS it's a comment block attached to it.
    # Simpler approach: Just find the first line that is a starter. 
    # The renderer typically ignores text before the graph def if passed cleanly, 
    # but we want to strip the chatty preamble.
    
    for i, line in enumerate(lines):
        sline = line.strip()
        if not sline:
            continue
        
        # If it's a comment, we could include it, but finding the *actual* type declaration is safer.
        # But wait, if we skip comments, we might miss them in the output.
        # Let's try to find the first line that IS a starter.
        lower = sline.lower()
        start_offset = None
        for starter in _MERMAID_STARTERS:
            match = re.search(rf"(?:^|\s|[\"'`])({re.escape(starter)})\b", lower)
            if match:
                start_offset = match.start(1)
                break
        if start_offset is not None:
            start_index = i
            break
            
    if start_index != -1:
        # We found the starter. 
        # Optionally we could include preceding comments if they are contiguous.
        # For now, let's just return from the starter line.
        # To be safer, let's look backwards from start_index for contiguous comments.
        curr = start_index - 1
        while curr >= 0:
            if lines[curr].strip().startswith("%%"):
                start_index = curr
                curr -= 1
            else:
                break
        if start_index != -1 and start_index < i:
            start_offset = 0
        if start_offset:
            lines[start_index] = lines[start_index][start_offset:]
        extracted_lines = lines[start_index:]
        while extracted_lines and extracted_lines[-1].strip().startswith("```"):
            extracted_lines.pop()
        return "\n".join(extracted_lines).strip()
        
    return None


def _looks_like_markup(text: str) -> bool:
    stripped = (text or "").lstrip()
    if not stripped:
        return False
    lowered = stripped.lower()
    
    if "<svg" in lowered:
        return True
    if "@startuml" in lowered:
        return True
    
    # Check for Mermaid using the robust extractor
    if _extract_mermaid_code(text):
        return True
        
    return False


def _strip_markup_label(markup: str) -> str:
    lines = [line.rstrip() for line in (markup or "").splitlines()]
    while lines and not lines[0].strip():
        lines.pop(0)
    if lines and lines[0].strip().lower() in _MARKUP_LABELS:
        lines.pop(0)
    return "\n".join(lines).strip()


def _unescape_jsonish_string(text: str) -> str:
    if not text:
        return text
    if "\\\"" not in text and "\\n" not in text and "\\t" not in text and "\\\\" not in text:
        return text
    # Handle common JSON-style escapes that show up when the model returns raw strings.
    return (
        text.replace("\\\\", "\\")
        .replace("\\\"", "\"")
        .replace("\\n", "\n")
        .replace("\\t", "\t")
    )


def parse_graphics_payload(raw_text: str) -> dict:
    cleaned = _strip_code_fences(raw_text)
    candidate = cleaned
    
    # 1. Try JSON parsing on the full cleaned text (or extracted JSON block)
    try:
        payload = json.loads(candidate)
        if isinstance(payload, dict):
            return payload
    except json.JSONDecodeError:
        pass

    json_cand = _find_json_block(cleaned)
    if json_cand:
        try:
            payload = json.loads(json_cand)
            if isinstance(payload, dict):
                return payload
        except json.JSONDecodeError:
            pass

    # 2. Try to find fenced code blocks (with labels first)
    labeled_blocks = _extract_labeled_fenced_blocks(raw_text)
    for label, block in labeled_blocks:
        if label in {"mermaid", "mmd"}:
            return {
                "type": "graphics",
                "kind": "mermaid",
                "markup": block,
                "_label_hint": "mermaid",
            }
        if label in {"plantuml", "puml"}:
            return {
                "type": "graphics",
                "kind": "plantuml",
                "markup": block,
                "_label_hint": "plantuml",
            }
        if label in {"svg", "image/svg+xml"}:
            return {
                "type": "graphics",
                "kind": "svg",
                "markup": block,
                "_label_hint": "svg",
            }

    blocks = _extract_fenced_blocks(cleaned)
    for block in blocks:
        if _looks_like_markup(block):
            return {"type": "graphics", "markup": block}

    # 3. Last resort: check if the raw text itself contains markup (chatty LLM without fences)
    if _looks_like_markup(cleaned):
        return {"type": "graphics", "markup": cleaned}

    raise ValueError("Risposta non valida: JSON mancante.")


def _normalize_kind(payload: dict) -> str:
    raw_kind = (payload.get("kind") or payload.get("format") or "").strip().lower()
    markup = (payload.get("markup") or "").lstrip()

    if "<svg" in markup.lower():
        return "svg"
    if "@startuml" in markup.lower():
        return "plantuml"

    # Use extractor to check for Mermaid
    if _extract_mermaid_code(markup):
        return "mermaid"

    if raw_kind in GRAPHICS_ALLOWED_KINDS:
        return raw_kind

    return raw_kind or GRAPHICS_DEFAULT_KIND


def sanitize_svg(svg_text: str) -> Tuple[str, list[str]]:
    warnings: list[str] = []
    # Find the actual SVG tag start/end
    lower = svg_text.lower()
    start = lower.find("<svg")
    end = lower.rfind("</svg>")
    
    if start == -1:
        raise ValueError("SVG non valido: tag <svg> non trovato.")

    if end == -1:
        cleaned = svg_text[start:].strip() + "\n</svg>"
        warnings.append("SVG senza tag di chiusura: chiuso automaticamente.")
    else:
        cleaned = svg_text[start : end + 6].strip()
    # Ensure xmlns is present for consistent rendering (e.g., <img> preview)
    tag_end = cleaned.find(">")
    if tag_end != -1:
        svg_tag = cleaned[: tag_end + 1]
        if "xmlns=" not in svg_tag.lower():
            svg_tag = svg_tag[:-1] + ' xmlns="http://www.w3.org/2000/svg">'
            cleaned = svg_tag + cleaned[tag_end + 1 :]
            warnings.append("SVG senza xmlns: aggiunto automaticamente.")
    lowered = cleaned.lower()
    
    for token in _SVG_BLOCKLIST:
        if token in lowered:
            raise ValueError("SVG non valido: contiene elementi o attributi non consentiti.")
            
    if len(cleaned) > GRAPHICS_MAX_MARKUP_CHARS:
        raise ValueError("SVG troppo lungo.")
    if "viewbox" not in lowered:
        warnings.append("SVG senza viewBox: ridimensionamento meno prevedibile.")
    return cleaned, warnings


def validate_graphics_payload(payload: dict) -> Tuple[dict, list[str]]:
    if payload.get("type") != "graphics":
        # Auto-correction if type is missing but markup is present
        if payload.get("markup"):
            payload["type"] = "graphics"
        else:
            raise ValueError("Risposta non valida: tipo grafica mancante.")

    title = (payload.get("title") or "Grafica").strip()
    
    # Initial cleanup
    markup = _strip_code_fences(payload.get("markup") or "")
    markup = _strip_markup_label(markup)
    markup = _unescape_jsonish_string(markup)

    kind = _normalize_kind(payload)
    warnings: list[str] = []

    if kind == "svg":
        markup, warnings = sanitize_svg(markup)
        
    elif kind == "plantuml":
        # Extract purely the @startuml ... @enduml part
        start = markup.find("@startuml")
        end = markup.find("@enduml")
        if start == -1 or end == -1:
             raise ValueError("PlantUML non valido: mancano @startuml o @enduml.")
        markup = markup[start : end + 7]
        
        if len(markup) > GRAPHICS_MAX_MARKUP_CHARS:
            raise ValueError("Markup PlantUML troppo lungo.")
            
    elif kind == "mermaid":
        # Extract the mermaid code, dropping preamble
        extracted = _extract_mermaid_code(markup)
        if not extracted:
            if payload.get("_label_hint") == "mermaid" and markup.strip():
                warnings.append("Mermaid senza header riconosciuto: markup lasciato invariato.")
            else:
                raise ValueError("Mermaid non valido: header non riconosciuto.")
        else:
            markup = extracted

        # Fix common PlantUML-style endings in Mermaid output.
        if markup:
            lines = markup.splitlines()
            while lines and not lines[-1].strip():
                lines.pop()
            if lines and re.match(r"^@end(uml)?$", lines[-1].strip(), re.IGNORECASE):
                lines.pop()
                warnings.append("Mermaid: rimosso terminatore @end/@enduml non valido.")
                markup = "\n".join(lines).rstrip()
        
        if len(markup) > GRAPHICS_MAX_MARKUP_CHARS:
            raise ValueError("Markup Mermaid troppo lungo.")
            
    else:
        # Unknown kind, but if markup exists we pass it through carefully?
        # No, better strictly validate.
        pass

    sanitized = {
        "type": "graphics",
        "title": title,
        "kind": kind,
        "markup": markup,
    }
    return sanitized, warnings
