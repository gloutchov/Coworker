import sqlite3
from contextlib import contextmanager

from config import DB_PATH


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.row_factory = sqlite3.Row
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    """Crea le tabelle se non esistono."""
    with get_conn() as conn:
        cur = conn.cursor()

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                text TEXT NOT NULL,
                embedding TEXT NOT NULL
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
                file TEXT PRIMARY KEY,
                mtime REAL NOT NULL,
                size INTEGER NOT NULL
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mode TEXT NOT NULL,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                content TEXT NOT NULL
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                msg_index INTEGER NOT NULL,
                text TEXT NOT NULL,
                embedding TEXT NOT NULL
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS web_cache (
                query TEXT PRIMARY KEY,
                results_json TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
            )
            """
        )

        conn.commit()
