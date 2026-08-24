"""
Multi-provider LLM clients for the free-tier stack: Groq (primary, fast
LPU inference) + Mistral (secondary — different rate-limit pool entirely,
which is the point).

A few things that shape this file, found by checking rather than assuming:

- Groq's native `json_schema` structured-output mode is documented as
  having "limited model support" — only specific models support it, and
  using it on an unsupported one raises rather than degrading gracefully.
  `method="function_calling"` (tool-calling under the hood) is far more
  broadly supported across Groq's open-model catalog and is LangChain's
  own default for both ChatGroq and ChatMistralAI — used everywhere below
  instead of forcing json_schema like the Claude version did.
- Groq's free tier is ~30 RPM SHARED ACROSS THE WHOLE ORG — every node,
  every concurrent user, one pool. Mistral's free "Experiment" tier no
  longer publishes exact numbers at all. Both are throttled client-side by
  rate_limit.py rather than hoping not to hit 429s.
- Splitting nodes across both providers isn't just "the second one is a
  fallback" — it's two separate rate-limit pools, which is closer to
  doubling real throughput than any single-provider trick can get you on
  free tiers.

Model choice: Llama 3.1 8B (Groq) for high-volume/low-complexity nodes,
Llama 3.3 70B (Groq) and Mistral Small (Mistral) for anything needing real
reasoning quality. Swap freely — nothing else in the codebase assumes a
specific model string.
"""
from langchain_groq import ChatGroq
from langchain_mistralai import ChatMistralAI

from .rate_limit import GROQ_LIMITER, MISTRAL_LIMITER

# Per-attempt ceiling for a single LLM call, in seconds. Every client below
# passes this EXPLICITLY rather than leaving `timeout` unset.
#
# This matters more than it looks: ChatGroq's `request_timeout` field
# defaults to a bare Python `None`, and that `None` is forwarded verbatim
# into the underlying `groq` SDK client. The SDK only substitutes its own
# sane default (connect=5s / read=60s) when the `timeout` kwarg is left out
# entirely (checked via an internal "was anything given?" sentinel) — an
# explicit `None` counts as "given" and is passed straight through to
# httpx, and `httpx.Client(timeout=None)` means "no timeout, wait forever".
# Confirmed directly against the installed `groq` package rather than
# assumed. A single unset timeout here is enough to let one hung node
# freeze the entire analysis indefinitely, since the retry/failover logic
# in resilience.py can only act after an exception is actually raised.
LLM_TIMEOUT_SECONDS = 20

# max_retries=0 on every client below is deliberate, not an oversight:
# ChatGroq defaults to 2 internal retries and ChatMistralAI defaults to 5
# (with exponential backoff), both happening *underneath* and invisibly to
# resilient_multi_provider's own attempts_per_provider retry loop. Left
# alone, a single unreachable provider can silently stack SDK-level
# retries on top of our own, which is exactly what turned one degraded
# analysis run into an 81-second stall with zero UI feedback during
# testing. resilient_multi_provider is the one place that should own
# retry/backoff decisions, so every inner loop is turned off here.

# --- Groq: fast tier (extraction, classification, keyword-style nodes) ---
GROQ_FAST = ChatGroq(
    model="llama3-8b-8192",
    temperature=0,
    max_tokens=1024,
    timeout=LLM_TIMEOUT_SECONDS,
    max_retries=0,
)

# --- Groq: core tier (needs more reasoning depth, still on Groq's speed) ---
GROQ_CORE = ChatGroq(
    model="llama3-70b-8192",
    temperature=0,
    max_tokens=2048,
    timeout=LLM_TIMEOUT_SECONDS,
    max_retries=0,
)

# --- Mistral: used both as the fallback pool AND as the primary for the
# two most judgment-heavy nodes (reviewer/improvement), since spreading the
# heaviest, least-tolerant-of-being-wrong calls across providers de-risks
# a Groq-only outage the most where it'd hurt the most.
MISTRAL_FAST = ChatMistralAI(
    model="ministral-8b-latest",
    temperature=0,
    max_tokens=1024,
    timeout=LLM_TIMEOUT_SECONDS,
    max_retries=0,
)
MISTRAL_CORE = ChatMistralAI(
    model="mistral-small-latest",
    temperature=0,
    max_tokens=2048,
    timeout=LLM_TIMEOUT_SECONDS,
    max_retries=0,
)

# (llm, rate_limiter) stacks — each node picks one of these tiers and gets
# automatic cross-provider fallback via resilient_multi_provider.
FAST_PROVIDERS = [(GROQ_FAST, GROQ_LIMITER), (MISTRAL_FAST, MISTRAL_LIMITER)]
CORE_PROVIDERS = [(GROQ_CORE, GROQ_LIMITER), (MISTRAL_CORE, MISTRAL_LIMITER)]
# Judgment-heavy nodes: try Mistral Small first (generally stronger
# reasoning-per-call than Llama 8B/70B at similar latency budgets), Groq
# as the fallback pool.
JUDGMENT_PROVIDERS = [(MISTRAL_CORE, MISTRAL_LIMITER), (GROQ_CORE, GROQ_LIMITER)]
