import json
import time
from modules.db.core import get_conn


def load_cache(query: str, ttl_seconds: int):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT results_json, timestamp FROM web_cache WHERE query = ?",
            (query,),
        )
        row = cur.fetchone()

    if not row:
        return None

    results_json, ts = row
    age = time.time() - ts

    if age > ttl_seconds:
        print("[WEB_CACHE] Scaduta, ignoro.")
        return None

    print("[WEB_CACHE] Risposta trovata in cache.")
    return json.loads(results_json)


def save_cache(query: str, results):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT OR REPLACE INTO web_cache (query, results_json, timestamp)
            VALUES (?, ?, ?)
            """,
            (query, json.dumps(results), int(time.time()))
        )
        conn.commit()

    print("[WEB_CACHE] Risultati salvati in cache.")
