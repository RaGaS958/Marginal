"""
Unit tests for rate_limit.TokenBucket, in isolation from everything else.

asyncio.sleep is patched to a no-op that records the requested duration
rather than actually waiting -- these tests assert on the *computed* wait
time, not on wall-clock time, so the suite doesn't take minutes to run.
"""
from __future__ import annotations

import asyncio

import pytest

from analyzer.rate_limit import TokenBucket

pytestmark = pytest.mark.asyncio


async def test_starts_full():
    bucket = TokenBucket(rate_per_minute=60)
    assert bucket.tokens == 60
    assert bucket.capacity == 60


async def test_acquire_consumes_one_token_when_available():
    bucket = TokenBucket(rate_per_minute=60)
    await bucket.acquire()
    assert bucket.tokens == pytest.approx(59, abs=0.01)


async def test_acquire_does_not_sleep_when_tokens_available(monkeypatch):
    bucket = TokenBucket(rate_per_minute=60)
    sleep_calls = []

    async def _fake_sleep(seconds):
        sleep_calls.append(seconds)

    monkeypatch.setattr(asyncio, "sleep", _fake_sleep)
    await bucket.acquire()

    assert sleep_calls == []


async def test_acquire_sleeps_when_bucket_is_empty(monkeypatch):
    bucket = TokenBucket(rate_per_minute=60)  # 1 token/sec
    bucket.tokens = 0
    sleep_calls = []

    async def _fake_sleep(seconds):
        sleep_calls.append(seconds)

    monkeypatch.setattr(asyncio, "sleep", _fake_sleep)
    await bucket.acquire()

    assert len(sleep_calls) == 1
    # 0 tokens at 1 token/sec -> need to wait ~1 second for a full token
    assert sleep_calls[0] == pytest.approx(1.0, abs=0.05)


async def test_acquire_resets_tokens_to_zero_after_forced_wait(monkeypatch):
    bucket = TokenBucket(rate_per_minute=60)
    bucket.tokens = 0

    async def _fake_sleep(_seconds):
        return None

    monkeypatch.setattr(asyncio, "sleep", _fake_sleep)
    await bucket.acquire()

    # after waiting out the deficit, the bucket should be at exactly 0
    # (the token that was waited for is the one just consumed) --
    # never negative.
    assert bucket.tokens == 0


async def test_refill_is_capped_at_capacity(monkeypatch):
    """Simulates a long idle period by advancing the internal clock
    directly -- refilling should never exceed `capacity`, even after an
    enormous elapsed gap."""
    bucket = TokenBucket(rate_per_minute=10)
    bucket.tokens = 3
    bucket.updated_at -= 10_000  # pretend a huge amount of time has passed

    await bucket.acquire()

    # capacity is 10; one token was just consumed by this acquire() call
    assert bucket.tokens == pytest.approx(9, abs=0.01)


async def test_partial_refill_between_acquires():
    """Two consecutive acquires with no time passing between them should
    consume tokens roughly 1-for-1, with only microseconds of real refill
    happening in between -- assert a tight tolerance rather than an exact
    value, since real wall-clock time (however small) does pass."""
    bucket = TokenBucket(rate_per_minute=60)
    await bucket.acquire()
    await bucket.acquire()
    assert bucket.tokens == pytest.approx(58, abs=0.01)


async def test_concurrent_acquires_are_serialized_by_the_lock():
    """The bucket is protected by an internal asyncio.Lock -- N concurrent
    acquire() calls against a bucket with >= N tokens should all succeed
    and leave the bucket with capacity - N tokens, never double-spent."""
    bucket = TokenBucket(rate_per_minute=600)  # plenty of headroom
    await asyncio.gather(*[bucket.acquire() for _ in range(10)])
    assert bucket.tokens == pytest.approx(590, abs=0.5)
