"""
Unit tests for resilience.py -- the decorator pair the entire reliability
story rests on. Tested here with plain fake async functions and a fake
rate limiter, deliberately with no LangChain/LLM involved at all, so a
failure here can only mean the decorator logic itself is wrong.
"""
from __future__ import annotations

import pytest
from pydantic import BaseModel, ValidationError

from analyzer.resilience import resilient, resilient_multi_provider

pytestmark = pytest.mark.asyncio


class _Boom(BaseModel):
    x: int


def _validation_error():
    try:
        _Boom(x="not an int" if False else object())  # forced construction error
    except ValidationError as exc:
        return exc
    raise AssertionError("expected pydantic to raise")


# ---------------------------------------------------------------------
# @resilient -- single provider
# ---------------------------------------------------------------------

async def test_resilient_returns_value_on_first_success():
    calls = []

    @resilient(fallback={"x": "fallback"})
    async def fn():
        calls.append(1)
        return {"x": "real value"}

    result = await fn()
    assert result == {"x": "real value"}
    assert len(calls) == 1


async def test_resilient_retries_transient_failures_then_succeeds(monkeypatch):
    import asyncio
    monkeypatch.setattr(asyncio, "sleep", lambda _s: _instant())

    attempts = {"n": 0}

    @resilient(fallback={"x": "fallback"}, attempts=3, base_delay=0.01)
    async def fn():
        attempts["n"] += 1
        if attempts["n"] < 3:
            raise ConnectionError("transient")
        return {"x": "real value"}

    result = await fn()
    assert result == {"x": "real value"}
    assert attempts["n"] == 3


async def _instant():
    return None


async def test_resilient_returns_fallback_after_exhausting_retries(monkeypatch):
    import asyncio
    monkeypatch.setattr(asyncio, "sleep", lambda _s: _instant())

    attempts = {"n": 0}

    @resilient(fallback={"x": "fallback"}, attempts=3, base_delay=0.01)
    async def fn():
        attempts["n"] += 1
        raise TimeoutError("still down")

    result = await fn()
    assert result["x"] == "fallback"
    assert "errors" in result
    assert "fn" in result["errors"][0], "should still identify which node degraded"
    assert "TimeoutError" not in result["errors"][0], "exception class name must not leak to the user-facing message"
    assert "still down" not in result["errors"][0], "raw exception text must not leak to the user-facing message"
    assert attempts["n"] == 3, "should retry exactly `attempts` times, not more"


async def test_resilient_fails_fast_on_non_retryable_exception(monkeypatch):
    import asyncio
    monkeypatch.setattr(asyncio, "sleep", lambda _s: _instant())

    attempts = {"n": 0}

    @resilient(fallback={"x": "fallback"}, attempts=3, base_delay=0.01)
    async def fn():
        attempts["n"] += 1
        raise ValueError("a bug, not a transient failure")

    result = await fn()
    assert result["x"] == "fallback"
    assert attempts["n"] == 1, "a non-retryable exception should not be retried at all"


async def test_resilient_never_raises_regardless_of_wrapped_exception(monkeypatch):
    import asyncio
    monkeypatch.setattr(asyncio, "sleep", lambda _s: _instant())

    @resilient(fallback={"x": "fallback"})
    async def fn():
        raise RuntimeError("anything at all")

    # the entire point of the decorator: this must not raise
    result = await fn()
    assert result["x"] == "fallback"


async def test_resilient_treats_validation_error_as_retryable(monkeypatch):
    import asyncio
    monkeypatch.setattr(asyncio, "sleep", lambda _s: _instant())

    attempts = {"n": 0}

    @resilient(fallback={"x": "fallback"}, attempts=2, base_delay=0.01)
    async def fn():
        attempts["n"] += 1
        raise _validation_error()

    result = await fn()
    assert attempts["n"] == 2  # retried, not failed fast
    assert result["x"] == "fallback"


# ---------------------------------------------------------------------
# @resilient_multi_provider -- provider stack
# ---------------------------------------------------------------------

class _FakeLimiter:
    def __init__(self):
        self.acquire_count = 0

    async def acquire(self):
        self.acquire_count += 1


def _provider(name, behavior):
    """behavior: a callable(call_number) -> value or raises."""
    calls = {"n": 0}

    async def llm_stub():
        calls["n"] += 1
        return behavior(calls["n"])

    llm_stub.name = name
    llm_stub.calls = calls
    return llm_stub


async def test_multi_provider_uses_first_provider_when_it_succeeds():
    limiter_a, limiter_b = _FakeLimiter(), _FakeLimiter()
    provider_a = _provider("a", lambda n: {"x": "from-a"})
    provider_b = _provider("b", lambda n: {"x": "from-b"})

    providers = [(provider_a, limiter_a), (provider_b, limiter_b)]

    @resilient_multi_provider(fallback={"x": "fallback"}, providers=lambda: providers)
    async def fn(state, llm):
        return await llm()

    result = await fn({})
    assert result == {"x": "from-a"}
    assert limiter_a.acquire_count == 1
    assert limiter_b.acquire_count == 0, "second provider should never be touched"


async def test_multi_provider_fails_over_to_second_provider(monkeypatch):
    import asyncio
    monkeypatch.setattr(asyncio, "sleep", lambda _s: _instant())

    limiter_a, limiter_b = _FakeLimiter(), _FakeLimiter()

    def a_behavior(n):
        raise ConnectionError("provider a is down")

    provider_a = _provider("a", a_behavior)
    provider_b = _provider("b", lambda n: {"x": "from-b"})
    providers = [(provider_a, limiter_a), (provider_b, limiter_b)]

    @resilient_multi_provider(fallback={"x": "fallback"}, providers=lambda: providers, attempts_per_provider=2)
    async def fn(state, llm):
        return await llm()

    result = await fn({})
    assert result == {"x": "from-b"}
    assert provider_a.calls["n"] == 2, "should retry provider a attempts_per_provider times before moving on"
    assert limiter_b.acquire_count == 1


async def test_multi_provider_returns_fallback_when_every_provider_fails(monkeypatch):
    import asyncio
    monkeypatch.setattr(asyncio, "sleep", lambda _s: _instant())

    def always_fails(n):
        raise TimeoutError("down")

    provider_a = _provider("a", always_fails)
    provider_b = _provider("b", always_fails)
    providers = [(provider_a, _FakeLimiter()), (provider_b, _FakeLimiter())]

    @resilient_multi_provider(fallback={"x": "fallback"}, providers=lambda: providers, attempts_per_provider=2)
    async def fn(state, llm):
        return await llm()

    result = await fn({})
    assert result["x"] == "fallback"
    assert "fn" in result["errors"][0], "should still identify which node degraded"
    assert "TimeoutError" not in result["errors"][0], "exception class name must not leak to the user-facing message"
    assert "provider" in result["errors"][0], "should still give a category of what went wrong"


async def test_multi_provider_non_retryable_error_moves_to_next_provider_immediately(monkeypatch):
    import asyncio
    monkeypatch.setattr(asyncio, "sleep", lambda _s: _instant())

    def a_behavior(n):
        raise ValueError("a bug on provider a, not transient")

    provider_a = _provider("a", a_behavior)
    provider_b = _provider("b", lambda n: {"x": "from-b"})
    providers = [(provider_a, _FakeLimiter()), (provider_b, _FakeLimiter())]

    @resilient_multi_provider(fallback={"x": "fallback"}, providers=lambda: providers, attempts_per_provider=3)
    async def fn(state, llm):
        return await llm()

    result = await fn({})
    assert result == {"x": "from-b"}
    assert provider_a.calls["n"] == 1, "non-retryable failure should try the next provider, not retry the same one"


async def test_multi_provider_re_reads_providers_callable_on_every_call():
    """This is the documented reason `providers` is a zero-arg callable
    instead of a captured list -- verify a mid-test swap is actually
    picked up on the next call."""
    limiter_a, limiter_b = _FakeLimiter(), _FakeLimiter()
    provider_a = _provider("a", lambda n: {"x": "from-a"})
    provider_b = _provider("b", lambda n: {"x": "from-b"})

    current = {"providers": [(provider_a, limiter_a)]}

    @resilient_multi_provider(fallback={"x": "fallback"}, providers=lambda: current["providers"])
    async def fn(state, llm):
        return await llm()

    first = await fn({})
    assert first == {"x": "from-a"}

    current["providers"] = [(provider_b, limiter_b)]  # swap, simulating a live provider-list change

    second = await fn({})
    assert second == {"x": "from-b"}, "the decorator must re-read providers(), not use a stale reference"
