import os
from pathlib import Path
from config import BASE_DIR


def rel_path(path: Path) -> str:
    try:
        return os.path.relpath(path, BASE_DIR)
    except Exception:
        return str(path)
