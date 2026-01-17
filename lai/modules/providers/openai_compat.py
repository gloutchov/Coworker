import json
from typing import Any, Dict, Generator, Iterable, Optional

import httpx


DEFAULT_TIMEOUT = 60.0


def _build_headers(api_key: Optional[str]) -> Dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _build_payload(
    model: str,
    messages: list[dict],
    *,
    temperature: float,
    top_p: float,
    max_tokens: int,
    stream: bool,
) -> Dict[str, Any]:
    return {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "top_p": top_p,
        "max_tokens": max_tokens,
        "stream": stream,
    }


def chat_completion(
    base_url: str,
    api_key: Optional[str],
    model: str,
    messages: list[dict],
    *,
    temperature: float,
    top_p: float,
    max_tokens: int,
    timeout: float = DEFAULT_TIMEOUT,
) -> str:
    url = f"{base_url.rstrip('/')}/chat/completions"
    payload = _build_payload(
        model,
        messages,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
        stream=False,
    )
    headers = _build_headers(api_key)
    with httpx.Client(timeout=timeout) as client:
        resp = client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    return message.get("content") or ""


def stream_chat_completion(
    base_url: str,
    api_key: Optional[str],
    model: str,
    messages: list[dict],
    *,
    temperature: float,
    top_p: float,
    max_tokens: int,
    timeout: float = DEFAULT_TIMEOUT,
) -> Iterable[str]:
    url = f"{base_url.rstrip('/')}/chat/completions"
    payload = _build_payload(
        model,
        messages,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
        stream=True,
    )
    headers = _build_headers(api_key)

    with httpx.Client(timeout=timeout) as client:
        with client.stream("POST", url, json=payload, headers=headers) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line:
                    continue
                if line.startswith("data:"):
                    data = line[5:].strip()
                else:
                    data = line.strip()
                if not data:
                    continue
                if data == "[DONE]":
                    break
                try:
                    payload = json.loads(data)
                except json.JSONDecodeError:
                    continue
                choices = payload.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                content = delta.get("content")
                if content:
                    yield content
