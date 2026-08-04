"""
Integration tests for the FastAPI app: real HTTP request/response cycles
over ASGITransport (in-process, no real network), exercising routing,
validation, the SSE contract, and the checkpointer-backed GET together --
none of which a unit test touching main.py's helper functions in isolation
would catch.
"""
import json

import pytest
from httpx import ASGITransport, AsyncClient

from ..conftest import FAKE_PAPERS as _FAKE_PAPERS

pytestmark = pytest.mark.asyncio


async def test_sse_endpoint_and_companion_get(patch_all_providers, patch_literature):
    patch_all_providers()

    from analyzer.main import app, lifespan

    # ASGITransport does not trigger FastAPI's lifespan on its own -- drive
    # it explicitly so app.state.http_client / .graph get initialized the
    # same way they would under a real uvicorn process.
    async with lifespan(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            events = []
            async with client.stream("POST", "/analyze", json={
                "title": "A Two-Stage Detector for Small Objects",
                "abstract": "We propose a two-stage detector that adds a learned attention gate. " * 3,
                "workflow": "Input -> Backbone -> Attention Gate -> Head",
            }) as response:
                assert response.status_code == 200
                assert response.headers["content-type"].startswith("text/event-stream")
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        events.append(line[len("data: "):])

            assert events[-1] == "[DONE]"

            parsed = [json.loads(e) for e in events if e != "[DONE]"]
            progress_events = [e for e in parsed if e["type"] == "progress"]
            result_events = [e for e in parsed if e["type"] == "result"]

            assert len(progress_events) == 15, "all 15 graph nodes should report a progress event"
            assert len(result_events) == 1
            request_id = result_events[0]["request_id"]
            assert result_events[0]["final_report"]

            get_response = await client.get(f"/analyze/{request_id}")
            assert get_response.status_code == 200
            body = get_response.json()
            assert body["status"] == "completed"
            assert body["final_report"]
            assert body["novelty_score"] is not None
            assert body["errors"] == []

            missing_response = await client.get("/analyze/does-not-exist")
            assert missing_response.status_code == 404


async def test_progress_events_arrive_in_graph_order(patch_all_providers, patch_literature):
    """Phase 1's five nodes may interleave with each other (real parallel
    fan-out), but phase ordering overall (extraction before search,
    search before scoring, scoring before review, review before format)
    should hold -- this is what lets the frontend's ProgressTimeline trust
    node-completion order at all."""
    patch_all_providers()

    from analyzer.main import app, lifespan

    async with lifespan(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            nodes_seen = []
            async with client.stream("POST", "/analyze", json={
                "title": "A Two-Stage Detector for Small Objects",
                "abstract": "We propose a two-stage detector that adds a learned attention gate. " * 3,
                "workflow": "Input -> Backbone -> Attention Gate -> Head",
            }) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: ") and line != "data: [DONE]":
                        payload = json.loads(line[len("data: "):])
                        if payload["type"] == "progress":
                            nodes_seen.append(payload["node"])

    assert nodes_seen.index("generate_search_queries") > nodes_seen.index("detect_research_domain")
    assert nodes_seen.index("literature_search") > nodes_seen.index("generate_search_queries")
    assert nodes_seen.index("novelty_score") > nodes_seen.index("abstract_similarity")
    assert nodes_seen.index("formatter") > nodes_seen.index("reviewer_agent")
    assert nodes_seen.index("formatter") > nodes_seen.index("improvement_agent")
    assert nodes_seen[-1] == "formatter"


async def test_client_supplied_request_id_becomes_canonical(patch_all_providers, patch_literature):
    """
    Regression test for the App Flow finding: the frontend generates a
    request_id client-side for the URL/sessionStorage key, but previously
    had no way to make the backend actually use it, so a later GET for
    that same URL could never find the run. If the client supplies
    request_id, the backend must adopt it as the thread_id so the two
    IDs never diverge.
    """
    patch_all_providers()

    from analyzer.main import app, lifespan

    client_chosen_id = "client-generated-abc123"

    async with lifespan(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            async with client.stream("POST", "/analyze", json={
                "title": "A Two-Stage Detector for Small Objects",
                "abstract": "We propose a two-stage detector that adds a learned attention gate. " * 3,
                "workflow": "",
                "request_id": client_chosen_id,
            }) as response:
                async for _ in response.aiter_lines():
                    pass  # drain the stream

            get_response = await client.get(f"/analyze/{client_chosen_id}")
            assert get_response.status_code == 200
            assert get_response.json()["status"] == "completed"


async def test_omitting_request_id_still_works_via_server_minted_id(patch_all_providers, patch_literature):
    """Backward compatibility: a frontend that hasn't been updated to send
    request_id yet must keep working exactly as before."""
    patch_all_providers()

    from analyzer.main import app, lifespan

    async with lifespan(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            events = []
            async with client.stream("POST", "/analyze", json={
                "title": "A Two-Stage Detector for Small Objects",
                "abstract": "We propose a two-stage detector that adds a learned attention gate. " * 3,
                "workflow": "",
            }) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: ") and line != "data: [DONE]":
                        events.append(json.loads(line[len("data: "):]))

            result_event = next(e for e in events if e["type"] == "result")
            assert result_event["request_id"]  # server minted one

            get_response = await client.get(f"/analyze/{result_event['request_id']}")
            assert get_response.status_code == 200


@pytest.mark.parametrize("bad_payload,expected_status", [
    ({"title": "ok", "abstract": "too short", "workflow": ""}, 422),
    ({"title": "ab", "abstract": "A" * 100, "workflow": ""}, 422),
    ({"title": "A Valid Title", "abstract": "A" * 5000, "workflow": ""}, 422),
])
async def test_analyze_rejects_invalid_payloads(bad_payload, expected_status):
    from analyzer.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/analyze", json=bad_payload)
    assert response.status_code == expected_status


async def test_analyze_enforces_per_ip_cooldown(patch_all_providers, patch_literature):
    """The full-stack version of the unit-level cooldown test -- verified
    here through the real ASGI request path, including how FastAPI
    surfaces the HTTPException raised inside the endpoint."""
    patch_all_providers()

    from analyzer.main import app, lifespan

    async with lifespan(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {
                "title": "A Two-Stage Detector for Small Objects",
                "abstract": "We propose a two-stage detector that adds a learned attention gate. " * 3,
                "workflow": "",
            }
            first = await client.post("/analyze", json=payload)
            assert first.status_code == 200

            second = await client.post("/analyze", json=payload)
            assert second.status_code == 429


async def test_infra_level_failure_yields_error_event_not_a_crash(monkeypatch):
    """
    Every node guarantees it never raises (see resilience.py), so this
    path is specifically for failures outside any single node's control
    -- a checkpointer outage, a bad config, etc. Simulated here by making
    the compiled graph's astream itself raise.
    """
    from analyzer.main import app, lifespan

    async with lifespan(app):
        async def _broken_astream(*_args, **_kwargs):
            raise RuntimeError("simulated checkpointer outage")
            yield  # pragma: no cover -- makes this an async generator function

        monkeypatch.setattr(app.state.graph, "astream", _broken_astream)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            events = []
            async with client.stream("POST", "/analyze", json={
                "title": "A Two-Stage Detector for Small Objects",
                "abstract": "We propose a two-stage detector that adds a learned attention gate. " * 3,
                "workflow": "",
            }) as response:
                assert response.status_code == 200  # the stream itself opens fine
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        events.append(line[len("data: "):])

    assert events[-1] == "[DONE]", "the stream must still terminate cleanly"
    parsed = [json.loads(e) for e in events if e != "[DONE]"]
    error_events = [e for e in parsed if e["type"] == "error"]
    assert len(error_events) == 1
    assert "simulated checkpointer outage" in error_events[0]["message"]


async def test_result_includes_structured_similar_papers_and_similarity_breakdown(patch_all_providers, patch_literature):
    """
    Regression test for the contract extension: SimilarityConstellation
    and PaperCard need real structured data, not just the markdown
    report, and the delivered frontend renders strengths/weaknesses as
    separate lists rather than parsing them out of prose. Both the SSE
    result event and the GET response should carry all of it.
    """
    patch_all_providers()

    from analyzer.main import app, lifespan

    async with lifespan(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            events = []
            async with client.stream("POST", "/analyze", json={
                "title": "A Two-Stage Detector for Small Objects",
                "abstract": "We propose a two-stage detector that adds a learned attention gate. " * 3,
                "workflow": "",
            }) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: ") and line != "data: [DONE]":
                        events.append(json.loads(line[len("data: "):]))

            result_event = next(e for e in events if e["type"] == "result")
            assert result_event["similar_papers"] == _FAKE_PAPERS
            assert result_event["recommendation"] == "Minor Revision"
            assert result_event["strengths"] == [
                "Clear problem framing", "Reasonable baselines", "Ablation included",
            ]
            assert result_event["weaknesses"] == [
                "Limited dataset diversity", "No failure-case analysis", "Missing compute budget",
            ]
            assert result_event["reviewer_comments"] == "A solid incremental contribution."
            assert result_event["improvement_suggestions"] == (
                "Broaden evaluation to a second dataset and report inference latency."
            )
            for dim in ("abstract", "methodology", "workflow", "keyword"):
                assert result_event["similarity_breakdown"][dim]["score"] == 42.0
                assert result_event["similarity_breakdown"][dim]["rationale"]

            get_response = await client.get(f"/analyze/{result_event['request_id']}")
            body = get_response.json()
            assert body["similar_papers"] == _FAKE_PAPERS
            assert body["strengths"] == result_event["strengths"]
            assert body["similarity_breakdown"]["abstract"]["score"] == 42.0


async def test_analyze_accepts_abstract_at_exactly_the_minimum_boundary(patch_all_providers, patch_literature):
    """Zod's schema on the frontend uses min(40), which is inclusive --
    an abstract of exactly 40 characters must be accepted, not rejected."""
    patch_all_providers()

    from analyzer.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        exactly_40_chars = "x" * 40
        assert len(exactly_40_chars) == 40
        response = await client.post("/analyze", json={
            "title": "A Valid Title",
            "abstract": exactly_40_chars,
            "workflow": "",
        })
    assert response.status_code == 200


async def test_health_check():
    from analyzer.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
