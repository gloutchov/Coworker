from __future__ import annotations

import json
from typing import Iterable, List, Optional

from fastapi.responses import StreamingResponse

from llm_client import chat_completion, stream_chat_completion
from modules.config.preferences import (
    STREAMING_MODE_CHUNKS,
    STREAMING_MODE_OFF,
    STREAMING_MODE_TOKENS,
    get_llm_streaming_mode,
    get_streaming_chunk_size,
)


def _format_sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _strip_thought_blocks(text: str) -> str:
    if not text:
        return ""
    while True:
        start = text.find("<think>")
        if start == -1:
            break
        end = text.find("</think>", start + 7)
        if end == -1:
            text = text[:start]
            break
        text = text[:start] + text[end + 8 :]
    return text


def _filter_stream_thoughts(tokens: Iterable[str]) -> Iterable[str]:
    start_tag = "<think>"
    end_tag = "</think>"
    buffer = ""
    in_thought = False
    keep_tail = len(start_tag) - 1

    for token in tokens:
        if not token:
            continue
        buffer += token
        while buffer:
            if in_thought:
                end_idx = buffer.find(end_tag)
                if end_idx == -1:
                    buffer = ""
                    break
                buffer = buffer[end_idx + len(end_tag) :]
                in_thought = False
                continue
            start_idx = buffer.find(start_tag)
            if start_idx == -1:
                if len(buffer) > keep_tail:
                    yield buffer[:-keep_tail]
                    buffer = buffer[-keep_tail:]
                break
            if start_idx > 0:
                yield buffer[:start_idx]
            buffer = buffer[start_idx + len(start_tag) :]
            in_thought = True

    if not in_thought and buffer:
        yield buffer


def _build_streaming_generator(
    tokens: Iterable[str],
    streaming_mode: str,
    response_field: str,
    extra_sources: Optional[List[dict]] = None,
    extra_payload: Optional[dict] = None,
    strip_thoughts: bool = False,
):
    chunk_size = get_streaming_chunk_size()
    collected: List[str] = []
    chunk_buffer: List[str] = []
    chunk_length = 0

    token_stream = _filter_stream_thoughts(tokens) if strip_thoughts else tokens

    yield _format_sse({"type": "start", "streaming_mode": streaming_mode})

    try:
        for token in token_stream:
            if not token:
                continue
            collected.append(token)

            if streaming_mode == STREAMING_MODE_TOKENS:
                yield _format_sse({"type": "token", "content": token})
            else:
                chunk_buffer.append(token)
                chunk_length += len(token)
                if chunk_length >= chunk_size:
                    chunk_text = "".join(chunk_buffer)
                    yield _format_sse({"type": "chunk", "content": chunk_text})
                    chunk_buffer = []
                    chunk_length = 0

        if streaming_mode == STREAMING_MODE_CHUNKS and chunk_buffer:
            yield _format_sse({"type": "chunk", "content": "".join(chunk_buffer)})

        final_text = "".join(collected)
        payload = {
            "type": "end",
            "content": final_text,
            "response_field": response_field,
        }
        if extra_sources:
            payload["sources"] = extra_sources
        if extra_payload:
            payload.update(extra_payload)
        yield _format_sse(payload)
    except Exception as exc:  # pragma: no cover - log via client
        yield _format_sse({"type": "error", "error": str(exc)})
        raise


def build_llm_response(
    system_prompt: str,
    user_prompt: str,
    history: Optional[List[dict]] = None,
    *,
    response_field: str = "response",
    extra_sources: Optional[List[dict]] = None,
    extra_payload: Optional[dict] = None,
    max_tokens_override: Optional[int] = None,
    image_urls: Optional[List[str]] = None,
    strip_thoughts: bool = False,
    model_id: Optional[str] = None,
    request_mode: Optional[str] = None,
):
    streaming_mode = get_llm_streaming_mode()

    if streaming_mode == STREAMING_MODE_OFF:
        text = chat_completion(
            system_prompt,
            user_prompt,
            history=history,
            max_tokens=max_tokens_override,
            image_urls=image_urls,
            model_id=model_id,
            request_mode=request_mode,
        )
        if strip_thoughts:
            text = _strip_thought_blocks(text)
        payload = {response_field: text}
        if extra_sources:
            payload["sources"] = extra_sources
        if extra_payload:
            payload.update(extra_payload)
        return payload

    token_stream = stream_chat_completion(
        system_prompt,
        user_prompt,
        history=history,
        max_tokens=max_tokens_override,
        image_urls=image_urls,
        model_id=model_id,
        request_mode=request_mode,
    )
    generator = _build_streaming_generator(
        token_stream,
        streaming_mode=streaming_mode,
        response_field=response_field,
        extra_sources=extra_sources,
        extra_payload=extra_payload,
        strip_thoughts=strip_thoughts,
    )
    return StreamingResponse(generator, media_type="text/event-stream")
