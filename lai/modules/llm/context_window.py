from __future__ import annotations

from typing import Iterable, List, Tuple

from config import (
    LLM_CONTEXT_CHAR_PER_TOKEN,
    LLM_DYNAMIC_TRIGGER_RATIO,
    LLM_MAX_TOKENS,
    LLM_RESPONSE_TOKENS_MIN,
    LLM_RESPONSE_TOKENS_MAX,
    LLM_RESPONSE_TOKENS_MARGIN,
)
from modules.config.preferences import (
    get_context_limits,
    is_dynamic_context_enabled,
    is_dynamic_max_tokens_enabled,
)
from modules.utils.hardware_info import get_system_specs, suggest_context_limits


SYSTEM_PROMPT_BUDGET_TOKENS = 128
MIN_HISTORY_RATIO = 0.25


def _estimate_tokens_from_text(text: str | None) -> int:
    if not text:
        return 0
    chars = len(text)
    ratio = LLM_CONTEXT_CHAR_PER_TOKEN if LLM_CONTEXT_CHAR_PER_TOKEN > 0 else 4.0
    return max(1, int(chars / ratio) + 1)


def _estimate_history_tokens(history: Iterable[dict]) -> int:
    total = 0
    for msg in history or []:
        total += _estimate_tokens_from_text(msg.get("content") or "")
    return total


def _trim_history_to_budget(history: List[dict], max_tokens: int) -> Tuple[List[dict], int]:
    if max_tokens <= 0 or not history:
        return [], len(history or [])

    trimmed: List[dict] = []
    consumed = 0
    dropped = 0

    for msg in reversed(history):
        text = msg.get("content") or ""
        msg_tokens = _estimate_tokens_from_text(text)
        if trimmed and consumed + msg_tokens > max_tokens:
            dropped += 1
            continue
        consumed += msg_tokens
        trimmed.append(msg)

    trimmed.reverse()
    dropped = len(history) - len(trimmed)
    return trimmed, dropped


def prepare_history_window(
    latest_user_prompt: str,
    history_messages: List[dict] | None,
    extra_texts: List[str] | None = None,
) -> Tuple[List[dict], dict]:
    """
    Restituisce una versione potenzialmente ridotta della history e un piano
    che descrive la finestra di contesto effettiva utilizzata.
    """
    history_messages = history_messages or []
    extra_texts = extra_texts or []

    # Recupera i limiti configurati e quelli suggeriti dall'hardware
    config_base, config_max = get_context_limits()
    specs = get_system_specs()
    hw_base, hw_max = suggest_context_limits(specs)
    
    # Usa il massimo consentito tra config e hardware, ma non superare mai l'hardware
    # Se l'utente ha forzato un limite basso in config, lo rispettiamo.
    # Se ha messo un limite alto ma l'hardware non ce la fa, limitiamo.
    # Tuttavia, config_max è già inizializzato con i limiti HW in config.py, 
    # quindi qui è una doppia sicurezza.
    
    base_limit = min(config_base, hw_base)
    # Se dynamic context è abilitato, il limite superiore è quello dinamico
    dynamic_max_limit = min(config_max, hw_max)

    threshold_tokens = int(base_limit * LLM_DYNAMIC_TRIGGER_RATIO)

    prompt_tokens = SYSTEM_PROMPT_BUDGET_TOKENS + _estimate_tokens_from_text(latest_user_prompt)
    context_tokens = sum(_estimate_tokens_from_text(txt) for txt in extra_texts if txt)
    history_tokens = _estimate_history_tokens(history_messages)

    total_without_history = prompt_tokens + context_tokens
    target_limit = base_limit
    dynamic_used = False
    dynamic_pref = is_dynamic_context_enabled()

    # Logica di espansione contesto
    if dynamic_pref:
        # Se solo il prompt+contesto supera la soglia, o se aggiungendo la storia superiamo
        if total_without_history >= threshold_tokens or (total_without_history + history_tokens >= threshold_tokens):
            # Calcola quanto serve realmente
            needed = total_without_history + history_tokens + LLM_RESPONSE_TOKENS_MIN
            
            if needed > base_limit:
                # Espandi fino al necessario o al massimo
                target_limit = min(needed + 512, dynamic_max_limit) # +512 buffer
                dynamic_used = True

    history_budget = max(
        target_limit - total_without_history,
        int(base_limit * MIN_HISTORY_RATIO),
    )

    trimmed_history, dropped = _trim_history_to_budget(history_messages, history_budget)
    history_tokens_after = _estimate_history_tokens(trimmed_history)
    total_after_history = total_without_history + history_tokens_after

    response_budget_default = LLM_MAX_TOKENS
    response_dynamic_used = False
    if is_dynamic_max_tokens_enabled():
        available = max(
            target_limit - total_after_history - LLM_RESPONSE_TOKENS_MARGIN,
            LLM_RESPONSE_TOKENS_MIN,
        )
        dynamic_budget = min(LLM_RESPONSE_TOKENS_MAX, available)
        if dynamic_budget != response_budget_default:
            response_budget = max(LLM_RESPONSE_TOKENS_MIN, dynamic_budget)
            response_dynamic_used = response_budget != response_budget_default
        else:
            response_budget = response_budget_default
    else:
        response_budget = response_budget_default

    plan = {
        "dynamic_context_enabled": dynamic_pref,
        "dynamic_used": dynamic_used,
        "target_limit_tokens": target_limit,
        "prompt_tokens": prompt_tokens,
        "context_tokens": context_tokens,
        "history_tokens_before": history_tokens,
        "history_tokens_after": history_tokens_after,
        "history_messages_retained": len(trimmed_history),
        "history_messages_dropped": dropped,
        "response_tokens_budget": response_budget,
        "response_tokens_dynamic": response_dynamic_used,
        "hw_info": f"{specs['ram_gb']}GB RAM",
    }
    return trimmed_history, plan


def adjust_retrieval_top_k(current_value: int, default_value: int, max_value: int = 12) -> int:
    """
    Se il contesto dinamico è attivo e l'utente non ha personalizzato il top_k,
    aumenta leggermente il numero di chunk considerati per sfruttare la finestra più ampia.
    """
    if current_value != default_value:
        return current_value
    if not is_dynamic_context_enabled():
        return current_value
    boosted = min(max_value, default_value + 3)
    return max(default_value, boosted)
