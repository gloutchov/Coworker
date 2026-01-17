import json
from typing import Any, Dict

from modules.db.core import get_conn


def _serialize(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False)
    except TypeError:
        return json.dumps(str(value), ensure_ascii=False)


def _deserialize(raw: str) -> Any:
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def get_all_config() -> Dict[str, Any]:
    with get_conn() as conn:
        rows = conn.execute("SELECT key, value FROM config").fetchall()
    data: Dict[str, Any] = {}
    for row in rows:
        data[row["key"]] = _deserialize(row["value"])
    return data


def get_config_value(key: str, default: Any = None) -> Any:
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM config WHERE key = ?", (key,)).fetchone()
    if row is None:
        return default
    return _deserialize(row["value"])


def set_config_value(key: str, value: Any) -> None:
    value_json = _serialize(value)
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO config (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
            """,
            (key, value_json),
        )
        conn.commit()
