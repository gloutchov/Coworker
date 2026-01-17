import base64
import logging
from typing import Tuple

logger = logging.getLogger(__name__)


def render_svg_to_png(svg_text: str) -> Tuple[str | None, str | None]:
    try:
        import cairosvg
    except (ImportError, OSError) as exc:
        logger.warning("CairoSVG non disponibile per il rendering PNG: %s", exc)
        return None, "Rendering PNG non disponibile: installa Cairo e CairoSVG sul sistema."

    try:
        png_bytes = cairosvg.svg2png(bytestring=svg_text.encode("utf-8"))
    except Exception as exc:  # pragma: no cover - depends on Cairo runtime
        logger.warning("Rendering PNG fallito: %s", exc)
        return None, "Rendering PNG fallito: verifica l'installazione di Cairo."

    encoded = base64.b64encode(png_bytes).decode("ascii")
    return encoded, None
