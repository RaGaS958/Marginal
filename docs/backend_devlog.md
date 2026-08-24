# Marginal — backend

The multi-agent novelty-analysis pipeline: FastAPI + LangGraph, Groq/Mistral
multi-provider LLM strategy, four-source literature retrieval.

## What's in this package

Four files existed already: `llm_clients.py` and `resilience.py` are
carried over unchanged; `nodes.py` and `rate_limit.py` have since had
real bugs fixed in them (both documented below, both found by actually
running things rather than just reading the code). This delivery adds
the pieces that were documented but not yet implemented:

| File | Status |
|---|---|
| `state.py` | **New** — the shared graph state, including the `errors` reducer required by the three parallel fan-out phases (see the module docstring for why) |
| `literature.py` | **New** — Semantic Scholar + OpenAlex concurrently, arXiv when the domain looks CS/ML-adjacent, CrossRef as a sparse-result fallback; dedup by normalized title, ranked by citation count |
| `graph.py` | **New** — wires all 15 nodes into the 7-stage topology |
| `main.py` | **New** — FastAPI app: `POST /analyze` (SSE), `GET /analyze/{request_id}`, `GET /health` |
| `tests/unit/`, `tests/integration/` | **New** — 109 tests, 100% coverage; see "Test it" below for the split and why |

**One fix worth knowing about:** `main.py` accepts an optional `request_id`
in the `POST /analyze` body and uses it as the LangGraph thread ID if
supplied. This closes a real bug found while documenting the frontend: the
frontend generates its own ID for the URL/sessionStorage key but previously
never sent it to the backend, so a saved `/history` link or a revisited URL
could never resolve — the backend had minted a different ID nobody kept.
`test_client_supplied_request_id_becomes_canonical` in
`tests/integration/test_api.py` is a regression test for exactly this. If
the frontend isn't updated to send its ID yet, everything still works — it
just falls back to a server-minted UUID as before.

**Also new:** `GET /analyze/{request_id}` now returns a `status` field
(`"completed"` or `"running"`), inferred from whether `final_report` has
been set yet — no extra bookkeeping needed, since that field is only ever
written by the terminal `formatter` node.

**A fix to `nodes.py`, found via a live (unmocked) test run:** all four
similarity-scoring nodes were reporting failures as a generic `"node
failed on every provider"` instead of naming which dimension actually
failed — `abstract_similarity`, `methodology_similarity`, etc. The cause:
`_make_similarity_node`'s rename (`node.__name__ = dimension_key`) ran
*after* `@resilient_multi_provider` had already captured the original
generic name in its error-message closure, so the rename never reached
the message. This matters because those exact error strings are what
`GET /analyze/{request_id}`'s `errors` field returns, and what a frontend
would show a user directly. Fixed by renaming before wrapping instead of
after; verified against a real live run with genuinely unreachable
providers, not just the mocked test suite. See the fix's comment in
`_make_similarity_node` for the full trace, and
`test_both_providers_fail_degrades_gracefully_across_the_real_graph` in
`tests/integration/test_graph_pipeline.py` for the regression test —
strengthened from a loose "at least 5 distinct error prefixes" check to
one that verifies each dimension's name explicitly, since the loose
version was exactly what let this slip through originally.

**Another fix, found from a real API key approval email:** Semantic
Scholar's key-approval email states their limit explicitly — "1 request
per second, cumulative across all endpoints." `literature_search_impl`
fires up to 3 Semantic Scholar requests concurrently via `asyncio.gather`
(one per query), with no throttling on that layer at all before this fix —
meaning every real analysis run was sending a burst against a hard 1/sec
limit and very likely tripping 429s on 2 of every 3 calls. Fixed with a
new `SEMANTIC_SCHOLAR_LIMITER` in `rate_limit.py` (the same `TokenBucket`
class already used for Groq/Mistral), acquired before every Semantic
Scholar request in `literature.py`.

Worth being precise about what this does and doesn't guarantee:
`TokenBucket` bounds the *average* rate correctly, but because it sets its
internal clock before sleeping rather than after, two requests queued
back-to-back against a freshly-drained bucket can legitimately land within
a fraction of a second of each other (verified and explained in detail in
`test_concurrent_semantic_scholar_calls_are_throttled_not_bursted`). That's
a real, disclosed characteristic, not a hidden gap — and even in that edge
case, a 429 is handled the same way any Semantic Scholar failure already
was: caught, logged into `errors`, and the run still completes with one
fewer literature source contributing rather than crashing. This is a large,
verified improvement over the previous "always fires 3 at once" behavior,
not a claim of a mathematically perfect per-second guarantee.

## What's *not* in this package (unchanged from the documented gaps)

- **Persistence is `InMemorySaver`** — every run is lost on restart. Swapping
  in `AsyncPostgresSaver` plus a retention policy is designed in the Backend
  Schema doc but not implemented here; it needs a real Postgres instance to
  build against.
- **Rate limiting is in-process** (`_last_request_at`, `_active_runs` in
  `main.py`) — correct for exactly one backend instance, not yet safe for
  more than one. The Redis-backed replacement is Implementation Plan Phase 1a.
- **No auth / per-user budget.**

None of this is a regression — it's the same set of gaps the documentation
already named, now with working code sitting in front of them instead of a
description of what the code should do.

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env   # then fill in real values
```

Required environment variables (also see `.env.example`):

```bash
GROQ_API_KEY=...
MISTRAL_API_KEY=...
CONTACT_EMAIL=you@example.com     # CrossRef polite pool
SEMANTIC_SCHOLAR_KEY=...          # optional, recommended
OPENALEX_API_KEY=...              # required as of Feb 2026
```

`GROQ_API_KEY` and `MISTRAL_API_KEY` must be *set to something* even to run
the test suite — `ChatGroq`/`ChatMistralAI` validate that a key string is
present at construction time (module import time, in `llm_clients.py`),
before any actual network call happens. The tests never make a real call
(every provider is monkeypatched), so any placeholder string works there.

## Run it

```bash
uvicorn analyzer.main:app --reload --port 8000
```

Then, matching the frontend's existing contract:

```bash
curl -N -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"title": "...", "abstract": "...", "workflow": ""}'
```

## Test it

```bash
pip install -r requirements.txt   # includes pytest-cov now
pytest tests/ -v                              # everything
pytest tests/unit -v                          # fast, isolated -- no HTTP, no graph execution
pytest tests/integration -v                   # full graph runs + real HTTP round trips (still no external network)
pytest tests/ --cov=analyzer --cov-report=term-missing   # coverage
```

**109 tests, 100% line coverage of `analyzer/`.** Split deliberately:

- **`tests/unit/`** (67 tests) — a single function or class at a time, nothing else running underneath it. This is where the *reliability mechanisms themselves* get tested directly for the first time: `TokenBucket`'s actual refill math (with `asyncio.sleep` intercepted so the suite doesn't take minutes), `resilient`/`resilient_multi_provider`'s retry counts and failover ordering with plain fake async functions (no LangChain involved at all), `novelty_score`'s weight-renormalization arithmetic, `formatter`'s section logic, `literature.py`'s pure helpers (title normalization, dedup, the arXiv XML parser), and `main.py`'s rate-limit/SSE helpers called directly.
- **`tests/integration/`** (42 tests) — multiple components wired together: the full 15-node graph via `graph.ainvoke()` (including the specific case the `errors` reducer exists for: nodes across three separate parallel fan-outs failing in the same run), the FastAPI app over `httpx.ASGITransport` (real SSE parsing, real routing, real validation), and `literature.py`'s actual HTTP-calling functions against `httpx.MockTransport`-simulated API responses (no real network, but real request/response handling instead of a bypassed mock) — including two tests specifically proving the Semantic Scholar rate limiter is both wired up and genuinely throttles concurrent calls, not just present in the code.

**On "100% coverage":** every line executes at least once across the suite. That's a real, useful signal that nothing is dead code and every failure path has been deliberately exercised at least once — it is not a claim that every combination of inputs or every possible race is covered. Concurrency edge cases beyond what's in `test_rate_limit.py`'s explicit concurrent-acquire test, and anything that only shows up under real network latency against the live Groq/Mistral/literature APIs, are outside what a mocked suite can tell you.

Notably, `GROQ_API_KEY` / `MISTRAL_API_KEY` still need to be set to *something* to run any of this — see the setup section above for why.
