import re
import requests
import urllib3

from modules.db.cache import load_cache, save_cache
from config import (
    WEB_SEARCH_CACHE_TTL,
    WIKIPEDIA_API_ENDPOINT,
    WEB_SEARCH_TIMEOUT,
    WEB_SEARCH_VERIFY_SSL,
)
from modules.config.preferences import get_web_search_user_agent

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def web_search_wikipedia(query: str, max_results: int = 5):
    endpoint = WIKIPEDIA_API_ENDPOINT
    params = {
        "action": "query",
        "format": "json",
        "list": "search",
        "srsearch": query,
        "srlimit": max_results,
        "utf8": 1,
    }

    headers = {
        "User-Agent": get_web_search_user_agent(),
        "Accept": "application/json",
    }

    try:
        resp = requests.get(
            endpoint, params=params, headers=headers,
            timeout=WEB_SEARCH_TIMEOUT, verify=WEB_SEARCH_VERIFY_SSL
        )
        print(f"[WEB_WIKI] HTTP status: {resp.status_code}")
        resp.raise_for_status()
    except Exception as e:
        print(f"[WEB_WIKI] Errore richiesta: {e}")
        return []

    try:
        data = resp.json()
    except Exception:
        print("[WEB_WIKI] Errore nel parsing JSON")
        return []

    search_results = data.get("query", {}).get("search", []) or []
    results = []

    for item in search_results:
        title = item.get("title")
        raw_snippet = item.get("snippet", "")
        snippet = re.sub(r"<.*?>", "", raw_snippet)
        url = f"https://it.wikipedia.org/wiki/{title.replace(' ', '_')}"

        results.append({
            "title": title,
            "snippet": snippet,
            "url": url,
            "source": "wikipedia",
        })

    return results[:max_results]


def web_search(query: str, max_results: int = 5):
    query_norm = query.strip().lower()

    cached = load_cache(query_norm, WEB_SEARCH_CACHE_TTL)
    if cached:
        return cached

    results = web_search_wikipedia(query_norm, max_results=max_results)

    if results:
        save_cache(query_norm, results)

    return results
