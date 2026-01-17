import json
from typing import Iterable, Dict, Any, List

from modules.db.core import get_conn


def clear_chunks() -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM chunks")
        conn.commit()


def clear_documents() -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM documents")
        conn.commit()


def insert_chunks(chunks: Iterable[Dict[str, Any]]) -> None:
    to_insert = []
    for ch in chunks:
        to_insert.append(
            (
                ch["file"],
                int(ch["chunk_index"]),
                ch["text"],
                json.dumps(ch["embedding"]),
            )
        )

    if not to_insert:
        return

    with get_conn() as conn:
        conn.executemany(
            """
            INSERT INTO chunks (file, chunk_index, text, embedding)
            VALUES (?, ?, ?, ?)
            """,
            to_insert,
        )
        conn.commit()


def upsert_documents(docs: Iterable[Dict[str, Any]]) -> None:
    to_insert = []
    for d in docs:
        to_insert.append((d["file"], float(d["mtime"]), int(d["size"])))

    if not to_insert:
        return

    with get_conn() as conn:
        conn.executemany(
            """
            INSERT INTO documents (file, mtime, size)
            VALUES (?, ?, ?)
            ON CONFLICT(file) DO UPDATE SET
                mtime = excluded.mtime,
                size = excluded.size
            """,
            to_insert,
        )
        conn.commit()


def get_all_chunks() -> List[Dict[str, Any]]:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, file, chunk_index, text, embedding FROM chunks")
        rows = cur.fetchall()

    chunks: List[Dict[str, Any]] = []
    for r in rows:
        chunks.append(
            {
                "id": r["id"],
                "file": r["file"],
                "chunk_index": r["chunk_index"],
                "text": r["text"],
                "embedding": json.loads(r["embedding"]),
            }
        )
    return chunks


def get_all_documents() -> List[Dict[str, Any]]:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT file, mtime, size FROM documents")
        rows = cur.fetchall()

    docs: List[Dict[str, Any]] = []
    for r in rows:
        docs.append(
            {
                "file": r["file"],
                "mtime": r["mtime"],
                "size": r["size"],
            }
        )
    return docs


def delete_document_from_rag(file: str) -> None:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM chunks WHERE file = ?", (file,))
        cur.execute("DELETE FROM documents WHERE file = ?", (file,))
        conn.commit()
