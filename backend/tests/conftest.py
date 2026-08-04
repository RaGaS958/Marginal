"""
Shared fixtures and test doubles.

Kept in one place so unit tests (which need a subset -- e.g. just the fake
papers) and integration tests (which need the full fake-provider stack)
draw from the same source of truth instead of two copies drifting apart.
"""
from __future__ import annotations

import pytest

from analyzer import nodes

# ---------------------------------------------------------------------
# Fakes standing in for a ChatGroq / ChatMistralAI instance
# ---------------------------------------------------------------------

class FakeStructured:
    def __init__(self, factory, fail: bool):
        self._factory = factory
        self._fail = fail

    async def ainvoke(self, _prompt):
        if self._fail:
            raise ConnectionError("simulated provider outage")
        return self._factory()


class FakeLLM:
    """Dispatches on the Pydantic model class passed to with_structured_output,
    exactly like a real ChatGroq/ChatMistralAI instance would be asked to."""

    def __init__(self, response_map: dict, fail: bool = False):
        self._response_map = response_map
        self._fail = fail

    def with_structured_output(self, model, method: str = "function_calling"):
        return FakeStructured(self._response_map[model], self._fail)


class NoOpLimiter:
    """Stands in for rate_limit.TokenBucket without the real timing behavior --
    rate_limit.py's own timing is covered directly in tests/unit/test_rate_limit.py."""

    def __init__(self):
        self.acquire_count = 0

    async def acquire(self) -> None:
        self.acquire_count += 1


def default_response_map() -> dict:
    return {
        nodes._Domain: lambda: nodes._Domain(domain="Computer Vision"),
        nodes._ProblemStatement: lambda: nodes._ProblemStatement(
            problem_statement="Existing detectors struggle on small, occluded objects."
        ),
        nodes._Methodology: lambda: nodes._Methodology(
            methodology="A two-stage detector with a learned attention gate."
        ),
        nodes._ProposedWorkflow: lambda: nodes._ProposedWorkflow(
            proposed_workflow="Input -> Backbone -> Attention Gate -> Head"
        ),
        nodes._Keywords: lambda: nodes._Keywords(keywords=[
            "object detection", "attention", "small objects", "cnn", "benchmark",
            "real-time", "transformer", "coco", "yolo", "accuracy",
        ]),
        nodes._SearchQueries: lambda: nodes._SearchQueries(queries=[
            "small object detection", "attention gated detector",
            "real-time object detection benchmark", "cnn attention mechanism",
            "transformer object detection",
        ]),
        nodes._SimilarityResult: lambda: nodes._SimilarityResult(
            score=42.0, rationale="Related but differs on the attention mechanism."
        ),
        nodes._ReviewerFeedback: lambda: nodes._ReviewerFeedback(
            strengths=["Clear problem framing", "Reasonable baselines", "Ablation included"],
            weaknesses=["Limited dataset diversity", "No failure-case analysis", "Missing compute budget"],
            overall_comments="A solid incremental contribution.",
            recommendation="Minor Revision",
        ),
        nodes._ImprovementSuggestions: lambda: nodes._ImprovementSuggestions(
            suggestions="Broaden evaluation to a second dataset and report inference latency."
        ),
    }


def make_stack(response_map: dict, primary_fails: bool = False, secondary_fails: bool = False) -> list:
    primary = FakeLLM(response_map, fail=primary_fails)
    secondary = FakeLLM(response_map, fail=secondary_fails)
    return [(primary, NoOpLimiter()), (secondary, NoOpLimiter())]


FAKE_PAPERS = [
    {"title": "A Prior Approach to Widget Detection", "authors": ["A. Author"], "year": 2023,
     "source": "semantic_scholar", "citation_count": 42, "url": None},
    {"title": "Widgets Revisited", "authors": ["B. Author"], "year": 2022,
     "source": "openalex", "citation_count": 11, "url": None},
]


def sample_state(**overrides):
    from analyzer.state import build_initial_state
    defaults = {
        "title": "A Two-Stage Detector for Small Objects",
        "abstract": "We propose a two-stage detector that adds a learned attention gate. " * 3,
        "workflow": "Input -> Backbone -> Attention Gate -> Head",
    }
    defaults.update(overrides)
    return build_initial_state(**defaults)


def sample_config(request_id: str = "test-thread"):
    """literature_search reads config["configurable"]["http_client"]; the
    object only needs to exist since literature_search_impl is monkeypatched
    in every test that reaches this node."""
    return {"configurable": {"thread_id": request_id, "checkpoint_ns": "", "http_client": object()}}


# ---------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------

@pytest.fixture
def patch_literature(monkeypatch):
    """Explicit, not autouse -- unit tests that don't touch the graph
    shouldn't pay for or depend on this."""
    async def _fake(_client, _queries, _domain):
        return FAKE_PAPERS, []
    monkeypatch.setattr(nodes, "literature_search_impl", _fake)
    return _fake


@pytest.fixture
def patch_all_providers(monkeypatch):
    """Returns a callable so a test can choose failure modes per tier call,
    e.g. patch_all_providers(primary_fails=True)."""
    def _patch(*, primary_fails: bool = False, secondary_fails: bool = False):
        response_map = default_response_map()
        from analyzer import llm_clients
        for tier in ("FAST_PROVIDERS", "CORE_PROVIDERS", "JUDGMENT_PROVIDERS"):
            monkeypatch.setattr(
                llm_clients, tier,
                make_stack(response_map, primary_fails=primary_fails, secondary_fails=secondary_fails),
            )
    return _patch


@pytest.fixture(autouse=True)
def _openalex_api_key_present(monkeypatch):
    """
    literature.py's _search_openalex deliberately skips the request (no
    network call at all) when OPENALEX_API_KEY is unset, since OpenAlex
    has required a key on every request since Feb 2026 and calling
    without one is guaranteed to fail. Tests that mock the actual HTTP
    response therefore need a key present to reach that mocked response
    at all -- same reasoning as GROQ_API_KEY/MISTRAL_API_KEY needing to be
    set for the suite to run, just via a fixture instead of the shell
    environment since this one is safe to default in test-only.
    Individual tests can still `monkeypatch.delenv("OPENALEX_API_KEY", ...)`
    to specifically exercise the "key missing" path.
    """
    monkeypatch.setenv("OPENALEX_API_KEY", "test-openalex-key")


@pytest.fixture(autouse=True)
def _reset_rate_limiter_state():
    """
    main.py's cooldown/concurrency guards and rate_limit.py's
    SEMANTIC_SCHOLAR_LIMITER are deliberately module-level, persistent,
    in-process state (that's what makes them work in production -- see
    main.py's module docstring and rate_limit.py's SEMANTIC_SCHOLAR_LIMITER
    comment). Tests share these singletons, so without resetting between
    tests: (a) a later test's POST can get rejected with 429 because an
    earlier test's request is still inside the cooldown window, and
    (b) a test that deliberately drains the Semantic Scholar limiter to
    prove throttling behavior would otherwise leave it drained for every
    test that runs after it. This runs for every test in the suite
    (harmless for tests that never touch either) so nobody has to
    remember to request it.
    """
    from analyzer import main as main_module
    from analyzer.rate_limit import SEMANTIC_SCHOLAR_LIMITER

    def _reset():
        main_module._last_request_at.clear()
        main_module._active_runs = 0
        SEMANTIC_SCHOLAR_LIMITER.tokens = SEMANTIC_SCHOLAR_LIMITER.capacity

    _reset()
    yield
    _reset()
