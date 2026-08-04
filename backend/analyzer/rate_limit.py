"""
Client-side token-bucket rate limiting.

Free tiers are rate-limited, not budget-limited — the right response is to
never send the request that would trip the limit, not to send it and react
to a 429. This throttles BEFORE the call, per provider, since Groq and
Mistral each have their own separate pool (this is also why splitting load
across both providers roughly doubles usable throughput instead of sharing
one pool).

Numbers below are deliberately conservative relative to what's publicly
documented (Groq ~30 RPM org-wide; Mistral's free tier no longer publishes
exact numbers). Tune down further if you see 429s in practice — the
provider's response headers (x-ratelimit-remaining-requests on Groq) are
the source of truth, this is just a safety margin in front of them.
"""
import asyncio
import time


class TokenBucket:
    def __init__(self, rate_per_minute: float):
        self.capacity = rate_per_minute
        self.tokens = rate_per_minute
        self.rate_per_second = rate_per_minute / 60.0
        self.updated_at = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self):
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self.updated_at
            self.tokens = min(self.capacity, self.tokens + elapsed * self.rate_per_second)
            self.updated_at = now
            if self.tokens < 1:
                wait = (1 - self.tokens) / self.rate_per_second
                await asyncio.sleep(wait)
                self.tokens = 0
            else:
                self.tokens -= 1


# Stay comfortably under Groq's documented ~30 RPM (org-wide, shared by every
# node and every concurrent user of this app).
GROQ_LIMITER = TokenBucket(rate_per_minute=22)

# Mistral's free tier doesn't publish an exact number anymore -- conservative
# default, tune after checking the Admin Console for your actual account.
MISTRAL_LIMITER = TokenBucket(rate_per_minute=12)

# Semantic Scholar's API key approval email states this explicitly and
# without ambiguity: "1 request per second, cumulative across all
# endpoints... Please set your rate limit to below this threshold to
# avoid rejected requests." Unlike the Groq/Mistral numbers above (both
# estimated against partial/unpublished docs), this one is a confirmed,
# stated hard limit -- 50 RPM leaves a real margin under the 60/min
# ceiling implied by "1/sec" rather than shaving it thin. Every call site
# MUST acquire this before hitting api.semanticscholar.org, including
# concurrent calls fired via asyncio.gather -- the internal asyncio.Lock
# in TokenBucket.acquire() serializes them correctly even when several
# callers ask at once, which is exactly the shape literature.py's
# concurrent per-query fan-out produces.
SEMANTIC_SCHOLAR_LIMITER = TokenBucket(rate_per_minute=50)
