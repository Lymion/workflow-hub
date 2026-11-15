"""The only door to Claude: claude-haiku-5-5, behind a hard RM10 monthly cap.

Rules (CLAUDE.md, spec "Monthly API cost estimate"):
- One model, fixed in config.HAIKU_MODEL. No setting picks another.
- Before every call: count the prompt's tokens (must be under 20K), add the call's
  worst-case cost (input + max_tokens of output) to this month's spend; if that would
  pass the cap the call is BLOCKED, not sent.
- Every call is logged in llm_calls (feature, tokens in/out, cost USD + RM, status).
- Answers are cached by key; a cache hit costs nothing and is logged as 'cached'.
- At most one retry per call (SDK max_retries=1), so a bug cannot loop calls.
- The API key comes from the OS keychain (or ANTHROPIC_API_KEY for development).
"""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Callable

from . import db
from .config import DEFAULT_RM_PER_USD, HAIKU_MODEL, MONTHLY_CAP_RM
from .hub import Hub

# Claude Haiku 5.5, prompts up to 100K tokens (USD per token). Prompts are kept under 20K.
PRICE_IN = 0.10 / 1_000_000
PRICE_OUT = 0.50 / 1_000_000
PRICE_CACHE_READ = PRICE_IN * 0.1
PRICE_CACHE_WRITE = PRICE_IN * 1.25
MAX_PROMPT_TOKENS = 20_000
WARN_LEVELS = (0.7, 0.9)
KEYRING_SERVICE = "workflow-hub"
KEYRING_USER = "anthropic-api-key"


# ---------- key ----------

def get_api_key() -> str | None:
    try:
        import keyring

        key = keyring.get_password(KEYRING_SERVICE, KEYRING_USER)
        if key:
            return key
    except Exception:  # no keychain backend on this machine
        pass
    return os.environ.get("ANTHROPIC_API_KEY") or None


def set_api_key(key: str | None) -> None:
    import keyring

    if key:
        keyring.set_password(KEYRING_SERVICE, KEYRING_USER, key)
    else:
        try:
            keyring.delete_password(KEYRING_SERVICE, KEYRING_USER)
        except Exception:
            pass


def key_source() -> str:
    try:
        import keyring

        if keyring.get_password(KEYRING_SERVICE, KEYRING_USER):
            return "keychain"
    except Exception:
        pass
    return "env" if os.environ.get("ANTHROPIC_API_KEY") else "none"


# ---------- spend ----------

def rm_per_usd(hub: Hub) -> float:
    try:
        return float(db.get_setting(hub.conn, "rm_per_usd", str(DEFAULT_RM_PER_USD)))
    except ValueError:
        return DEFAULT_RM_PER_USD


def month_start() -> str:
    return date.today().replace(day=1).isoformat()


def month_spend_rm(hub: Hub) -> float:
    row = hub.query_one("SELECT COALESCE(SUM(cost_rm), 0) AS rm FROM llm_calls WHERE date(created_at, 'localtime') >= ?", (month_start(),))
    return float(row["rm"])


def spend_report(hub: Hub) -> dict:
    start = month_start()
    rows = hub.query(
        "SELECT feature, status, COUNT(*) AS n, COALESCE(SUM(cost_rm), 0) AS rm, COALESCE(SUM(tokens_in), 0) AS tin, COALESCE(SUM(tokens_out), 0) AS tout "
        "FROM llm_calls WHERE date(created_at, 'localtime') >= ? GROUP BY feature, status",
        (start,),
    )
    features: dict[str, dict] = {}
    for r in rows:
        f = features.setdefault(r["feature"], {"feature": r["feature"], "calls": 0, "rm": 0.0, "cached": 0, "blocked": 0})
        if r["status"] in ("sent", "error"):
            f["calls"] += r["n"]
            f["rm"] += r["rm"]
        elif r["status"] == "cached":
            f["cached"] += r["n"]
        elif r["status"] == "blocked":
            f["blocked"] += r["n"]
    total = sum(f["rm"] for f in features.values())
    level = "ok" if total < MONTHLY_CAP_RM * WARN_LEVELS[0] else "warn" if total < MONTHLY_CAP_RM * WARN_LEVELS[1] else "high"
    if total >= MONTHLY_CAP_RM:
        level = "capped"
    return {
        "month": start[:7],
        "spent_rm": round(total, 4),
        "cap_rm": MONTHLY_CAP_RM,
        "left_rm": round(max(0.0, MONTHLY_CAP_RM - total), 4),
        "level": level,
        "rm_per_usd": rm_per_usd(hub),
        "model": HAIKU_MODEL,
        "features": sorted(features.values(), key=lambda f: -f["rm"]),
        "cache_hits": sum(f["cached"] for f in features.values()),
    }


def log_call(hub: Hub, feature: str, status: str, tokens_in: int = 0, tokens_out: int = 0, cost_usd: float = 0.0) -> None:
    with hub.tx() as c:
        c.execute(
            "INSERT INTO llm_calls(feature, model, tokens_in, tokens_out, cost_usd, cost_rm, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (feature, HAIKU_MODEL, tokens_in, tokens_out, cost_usd, cost_usd * rm_per_usd(hub), status),
        )


# ---------- cache ----------

def cache_key(*parts: Any) -> str:
    return hashlib.sha256(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()


def cache_get(hub: Hub, key: str) -> Any | None:
    row = hub.query_one("SELECT value FROM cache WHERE key = ?", (key,))
    return json.loads(row["value"]) if row else None


def cache_put(hub: Hub, key: str, value: Any) -> None:
    with hub.tx() as c:
        c.execute("INSERT OR REPLACE INTO cache(key, value) VALUES (?, ?)", (key, json.dumps(value)))


# ---------- the call ----------

@dataclass
class Result:
    status: str                      # 'sent' | 'cached' | 'blocked' | 'no_key' | 'error' | 'refused'
    data: Any = None                 # parsed JSON (structured output) or text
    message: str = ""                # one-line explanation for the UI when not 'sent'/'cached'
    cost_rm: float = 0.0
    tokens_in: int = 0
    tokens_out: int = 0
    extra: dict = field(default_factory=dict)


class Haiku:
    """Small, guarded wrapper. `client_factory` is swappable for tests."""

    def __init__(self, hub: Hub, client_factory: Callable[[str], Any] | None = None):
        self.hub = hub
        self._factory = client_factory or self._default_factory

    @staticmethod
    def _default_factory(api_key: str):
        import anthropic

        return anthropic.Anthropic(api_key=api_key, max_retries=1, timeout=60.0)

    def count(self, client, system: str, messages: list[dict]) -> int:
        try:
            return int(client.messages.count_tokens(model=HAIKU_MODEL, system=system, messages=messages).input_tokens)
        except Exception:
            text = system + json.dumps(messages)
            return int(len(text) / 3.2)  # conservative fallback (overestimates)

    def ask(
        self,
        feature: str,
        system: str,
        user: str,
        *,
        max_tokens: int = 1500,
        schema: dict | None = None,
        effort: str = "low",
        key: str | None = None,
    ) -> Result:
        hub = self.hub
        if key is not None:
            hit = cache_get(hub, key)
            if hit is not None:
                log_call(hub, feature, "cached")
                return Result("cached", data=hit, message="Answered from cache. No call made.")
        api_key = get_api_key()
        if not api_key:
            return Result("no_key", message="Add your Anthropic API key in Settings to use Haiku. Everything else works without it.")
        client = self._factory(api_key)
        messages = [{"role": "user", "content": user}]
        tokens = self.count(client, system, messages)
        if tokens > MAX_PROMPT_TOKENS:
            log_call(hub, feature, "blocked", tokens_in=tokens)
            return Result("blocked", message=f"Prompt is {tokens:,} tokens, over the {MAX_PROMPT_TOKENS:,} limit. Ask a narrower question.", tokens_in=tokens)
        worst_usd = tokens * PRICE_IN + max_tokens * PRICE_OUT
        worst_rm = worst_usd * rm_per_usd(hub)
        spent = month_spend_rm(hub)
        if spent + worst_rm > MONTHLY_CAP_RM:
            log_call(hub, feature, "blocked", tokens_in=tokens)
            return Result("blocked", message=f"Monthly Haiku cap reached (RM{spent:.2f} of RM{MONTHLY_CAP_RM:.0f}). Free features still work; it resets on the 1st.")
        params: dict[str, Any] = {
            "model": HAIKU_MODEL,
            "max_tokens": max_tokens,
            "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            "messages": messages,
            "output_config": {"effort": effort, **({"format": {"type": "json_schema", "schema": schema}} if schema else {})},
        }
        try:
            resp = client.messages.create(**params)
        except Exception as exc:  # SDK already retried once
            log_call(hub, feature, "error", tokens_in=tokens)
            return Result("error", message=f"Haiku call failed ({type(exc).__name__}). Check your connection and API key, then try again.")
        u = resp.usage
        cache_read = getattr(u, "cache_read_input_tokens", 0) or 0
        cache_write = getattr(u, "cache_creation_input_tokens", 0) or 0
        tin = (u.input_tokens or 0) + cache_read + cache_write
        tout = u.output_tokens or 0
        cost = (u.input_tokens or 0) * PRICE_IN + cache_read * PRICE_CACHE_READ + cache_write * PRICE_CACHE_WRITE + tout * PRICE_OUT
        if resp.stop_reason == "refusal":
            log_call(hub, feature, "error", tin, tout, cost)
            return Result("refused", message="Haiku declined this request. Try rephrasing it.", cost_rm=cost * rm_per_usd(hub))
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        if resp.stop_reason == "max_tokens" and not text:
            log_call(hub, feature, "error", tin, tout, cost)
            return Result("error", message="The answer was cut off. Try again, or ask a narrower question.", cost_rm=cost * rm_per_usd(hub))
        data: Any = text
        if schema:
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                log_call(hub, feature, "error", tin, tout, cost)
                return Result("error", message="Haiku returned an answer the hub couldn't read. Try again.")
        log_call(hub, feature, "sent", tin, tout, cost)
        if key is not None:
            cache_put(hub, key, data)
        return Result("sent", data=data, cost_rm=cost * rm_per_usd(hub), tokens_in=tin, tokens_out=tout)
