import json
from typing import Iterable, Dict, Any, List, Optional

from modules.db.core import get_conn


def insert_chat_session(mode: str, title: str, content: str) -> int:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO chat_sessions (mode, title, created_at, content)
            VALUES (?, ?, datetime('now'), ?)
            """,
            (mode, title, content),
        )
        conn.commit()
        return cur.lastrowid


def list_chat_sessions() -> List[Dict[str, Any]]:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, mode, title, created_at
            FROM chat_sessions
            ORDER BY datetime(created_at) DESC
            """
        )
        rows = cur.fetchall()

    return [
        {
            "id": r["id"],
            "mode": r["mode"],
            "title": r["title"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def get_chat_session(chat_id: int) -> Optional[Dict[str, Any]]:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, mode, title, created_at, content
            FROM chat_sessions
            WHERE id = ?
            """,
            (chat_id,),
        )
        row = cur.fetchone()

    if row is None:
        return None

    return {
        "id": row["id"],
        "mode": row["mode"],
        "title": row["title"],
        "created_at": row["created_at"],
        "content": row["content"],
    }


def delete_chat_session(chat_id: int) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM chat_sessions WHERE id = ?", (chat_id,))
        conn.commit()


def clear_chat_chunks_for_chat(chat_id: int) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM chat_chunks WHERE chat_id = ?", (chat_id,))
        conn.commit()


def update_chat_session_title(chat_id: int, new_title: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE chat_sessions SET title = ? WHERE id = ?",
            (new_title, chat_id),
        )
        conn.execute(
            "UPDATE chat_chunks SET title = ? WHERE chat_id = ?",
            (new_title, chat_id),
        )
        conn.commit()


def insert_chat_chunks(chunks: Iterable[Dict[str, Any]]) -> None:
    to_insert = []
    for ch in chunks:
        to_insert.append(
            (
                int(ch["chat_id"]),
                ch["title"],
                int(ch["msg_index"]),
                ch["text"],
                json.dumps(ch["embedding"]),
            )
        )

    if not to_insert:
        return

    with get_conn() as conn:
        conn.executemany(
            """
            INSERT INTO chat_chunks (chat_id, title, msg_index, text, embedding)
            VALUES (?, ?, ?, ?, ?)
            """,
            to_insert,
        )
        conn.commit()


def get_all_chat_chunks() -> List[Dict[str, Any]]:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, chat_id, title, msg_index, text, embedding FROM chat_chunks"
        )
        rows = cur.fetchall()

    return [
        {
            "id": r["id"],
            "chat_id": r["chat_id"],
            "title": r["title"],
            "msg_index": r["msg_index"],
            "text": r["text"],
            "embedding": json.loads(r["embedding"]),
        }
        for r in rows
    ]
