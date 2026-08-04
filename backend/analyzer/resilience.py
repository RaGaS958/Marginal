"""
Resilience for graph nodes.

WHY THIS EXISTS INSTEAD OF LangGraph's RetryPolicy/error_handler:

RetryPolicy's retry counting works fine in isolation (verified). But
error_handler — the mechanism meant to let a node fail without crashing its
siblings — does NOT reliably prevent the exception from propagating out of
`invoke`/`ainvoke` when the failing node has parallel siblings in the same
superstep (tested against langgraph==1.2.8, both with a plain-dict return
and with Command(update=..., goto=...); reproducible with zero LLM calls
involved — see the repro at the bottom of this file's docstring). Since
almost every node in this graph runs as part of a parallel fan-out, relying
on error_handler for the core "don't crash the whole run" guarantee is not
safe in this version.

What IS verified to work: a node that never raises — because it retries and
catches internally — behaves exactly as expected even when its siblings are
failing in the same superstep. That's what `resilient` below does. If you
upgrade langgraph and want to re-check whether error_handler's parallel
behavior has changed, the three repro scripts referenced in
docs/known_issues.md are a 30-second way to confirm before relying on it.
"""
import asyncio
import logging
import random
from functools import wraps

import httpx
from pydantic import ValidationError

logger = logging.getLogger(__name__)

# Transient/worth-retrying: network blips, timeouts, and structured-output
# validation misses (the model sometimes just doesn't follow the schema on
# a given sample — asking again is usually enough).
#
# httpx.TransportError (covers ConnectError, ConnectTimeout, ReadTimeout,
# PoolTimeout, RemoteProtocolError, ...) is included deliberately: it is
# NOT a subclass of the builtin ConnectionError/TimeoutError/OSError below
# (confirmed directly against the installed httpx/groq packages — their
# exception hierarchies are independently rooted at plain `Exception`), so
# without it, every genuine network failure from either provider's
# httpx-based client fell straight through to the non-retryable branch and
# this tuple's "retries transient network blips" contract never actually
# applied to a network blip.
#
# Deliberately NOT included: HTTP-status-based SDK errors such as
# AuthenticationError/PermissionDeniedError (401/403) or RateLimitError
# (429). Retrying those against the SAME provider wastes the attempt
# budget on something that won't change; failing straight through to the
# next provider in the stack (a different rate-limit pool, a different set
# of credentials) is the more useful behavior and is what already happens
# via the `except Exception: break` branch below.
RETRYABLE_EXCEPTIONS = (ConnectionError, TimeoutError, ValidationError, OSError, httpx.TransportError)


def _status_code_of(exc: BaseException) -> int | None:
    """Best-effort HTTP status code extraction that works across both
    exception shapes used by the providers in llm_clients.py: Groq's
    Stainless-generated classes (`exc.status_code` directly) and plain
    httpx-style errors such as `httpx.HTTPStatusError` (`exc.response.status_code`).
    Returns None rather than guessing when neither is present."""
    code = getattr(exc, "status_code", None)
    if isinstance(code, int):
        return code
    code = getattr(getattr(exc, "response", None), "status_code", None)
    return code if isinstance(code, int) else None


def _user_facing_message(fn_name: str, exc: BaseException) -> str:
    """Turn an internal exception into something safe to put in front of an
    end user on the Analysis page — no hostnames, provider/library names,
    or exception class names. The full exception still goes to the server
    log via `logger.warning` below; only the API-facing string is
    sanitized, since `errors` entries used to be `f"...{exc!r}"` verbatim
    (e.g. "PermissionDeniedError('Host not in allowlist: api.groq.com...')"),
    which leaked internal infrastructure details straight into the UI."""
    status = _status_code_of(exc)
    if status in (401, 403):
        reason = "an authentication issue with one of the analysis providers"
    elif status == 429:
        reason = "a rate limit on one of the analysis providers"
    elif status is not None and status >= 500:
        reason = "an upstream provider outage"
    elif isinstance(exc, (ConnectionError, TimeoutError, OSError, httpx.TransportError)):
        reason = "a network issue reaching an analysis provider"
    elif isinstance(exc, ValidationError):
        reason = "an unexpected response format from an analysis provider"
    else:
        reason = "an unexpected error"
    logger.warning("%s degraded: %r", fn_name, exc)
    return f"{fn_name} failed: {reason}. This section may be incomplete."


def resilient(fallback: dict, *, attempts: int = 3, base_delay: float = 1.0):
    """
    Decorator for async graph node functions with a SINGLE provider.

    - Retries RETRYABLE_EXCEPTIONS up to `attempts` times with exponential
      backoff + jitter.
    - Any other exception fails fast (no point retrying a bug).
    - On final failure, ALWAYS returns `fallback` merged with an `errors`
      entry — the node never raises, so it can never take a parallel
      sibling down with it.
    """
    def decorator(fn):
        @wraps(fn)
        async def wrapped(*args, **kwargs):
            last_exc = None
            for attempt in range(attempts):
                try:
                    return await fn(*args, **kwargs)
                except RETRYABLE_EXCEPTIONS as exc:
                    last_exc = exc
                    if attempt < attempts - 1:
                        delay = base_delay * (2 ** attempt) + random.random() * 0.5
                        await asyncio.sleep(delay)
                except Exception as exc:
                    last_exc = exc
                    break
            result = dict(fallback)
            result["errors"] = [_user_facing_message(fn.__name__, last_exc)]
            return result
        return wrapped
    return decorator


def resilient_multi_provider(fallback: dict, providers, *, attempts_per_provider: int = 2, base_delay: float = 1.0):
    """
    Like `resilient`, but for a *stack* of free-tier providers instead of
    one. Tries each `(llm, rate_limiter)` pair, in order, retrying
    transient failures within a provider before moving to the next one on
    sustained failure (rate-limit exhaustion, repeated validation misses).
    Provider fallback IS just another kind of retry — same never-raises,
    same guaranteed-fallback contract as `resilient`.

    `providers` is a zero-arg CALLABLE returning the list, not the list
    itself — looked up fresh on every call rather than captured once at
    decoration time. This isn't just testability: a plain list gets closed
    over at import time, so nothing later (a test's monkeypatch, or a
    future admin endpoint that swaps providers based on live rate-limit
    health) can actually change what an already-decorated node uses. Pass
    e.g. `lambda: llm_clients.CORE_PROVIDERS` (referencing the module, not
    the list) so each call re-reads the current value.

    The wrapped function must accept `(state, llm)` — the decorator injects
    whichever provider's client is currently being tried.
    """
    def decorator(fn):
        @wraps(fn)
        async def wrapped(state, *args, **kwargs):
            last_exc = None
            for llm, limiter in providers():
                for attempt in range(attempts_per_provider):
                    try:
                        await limiter.acquire()
                        return await fn(state, llm, *args, **kwargs)
                    except RETRYABLE_EXCEPTIONS as exc:
                        last_exc = exc
                        if attempt < attempts_per_provider - 1:
                            delay = base_delay * (2 ** attempt) + random.random() * 0.5
                            await asyncio.sleep(delay)
                    except Exception as exc:
                        last_exc = exc
                        break  # non-retryable on this provider -- try the next provider, not another attempt here
            result = dict(fallback)
            result["errors"] = [_user_facing_message(fn.__name__, last_exc)]
            return result
        return wrapped
    return decorator
