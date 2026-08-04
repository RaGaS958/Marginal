"""
Integration tests: the full 15-node graph wired together and executed via
graph.ainvoke(), exercising real inter-node data flow (not just individual
functions). LLM providers and literature search are still mocked -- these
tests verify the *pipeline's* behavior (provider fallback across real node
boundaries, error aggregation across real parallel fan-outs), not external
services.
"""
import pytest

from analyzer.graph import build_graph

from ..conftest import default_response_map, make_stack, sample_config, sample_state

pytestmark = pytest.mark.asyncio


async def test_happy_path_completes_with_no_errors(patch_all_providers, patch_literature):
    patch_all_providers()

    graph = build_graph().compile()
    result = await graph.ainvoke(sample_state(), sample_config())

    assert result["errors"] == []
    assert result["novelty_score"] is not None
    assert result["recommendation"] == "Minor Revision"
    assert "Novelty analysis" in result["final_report"]
    assert "not available" not in result["final_report"]


async def test_all_fifteen_state_keys_are_populated_on_success(patch_all_providers, patch_literature):
    """A regression guard for the graph wiring itself -- if a node were
    accidentally disconnected from the graph, its output key would stay
    at its build_initial_state default instead of being overwritten."""
    patch_all_providers()

    graph = build_graph().compile()
    result = await graph.ainvoke(sample_state(), sample_config())

    assert result["research_domain"] == "Computer Vision"
    assert result["problem_statement"]
    assert result["methodology"]
    assert result["proposed_workflow"]
    assert len(result["keywords"]) == 10
    assert len(result["search_queries"]) == 5
    assert len(result["similar_papers"]) == 2
    for dim in ("abstract_similarity", "methodology_similarity", "workflow_similarity", "keyword_similarity"):
        assert result[dim] == 42.0
    assert result["novelty_score"] is not None
    assert len(result["strengths"]) == 3
    assert len(result["weaknesses"]) == 3
    assert result["improvement_suggestions"]
    assert result["final_report"]


async def test_primary_failover_across_the_real_graph_leaves_no_errors(patch_all_providers, patch_literature):
    """Failover is exercised here through real node boundaries -- every
    node in every fan-out phase independently hits its own primary-fails
    path, all within the same graph run."""
    patch_all_providers(primary_fails=True)

    graph = build_graph().compile()
    result = await graph.ainvoke(sample_state(), sample_config())

    assert result["errors"] == []
    assert result["novelty_score"] is not None
    assert result["final_report"]


async def test_both_providers_fail_degrades_gracefully_across_the_real_graph(patch_all_providers, patch_literature):
    """This is the specific scenario resilience.py and state.py's `errors`
    reducer exist for: multiple nodes across three separate parallel
    fan-outs (5-way, 4-way, 2-way) all fail in the same run. If the
    reducer were missing, this would raise InvalidUpdateError instead of
    completing."""
    patch_all_providers(primary_fails=True, secondary_fails=True)

    graph = build_graph().compile()
    result = await graph.ainvoke(sample_state(), sample_config())

    assert len(result["errors"]) > 0
    assert result["final_report"], "a report must still ship even when every LLM call degrades"
    assert "## Notes" in result["final_report"]

    # errors should show contributions from more than one fan-out phase,
    # confirming the reducer actually merged concurrent writes rather than
    # only the last one winning (which is what you'd see if a plain list
    # silently overwrote instead of raising).
    node_names_in_errors = {e.split(" failed")[0] for e in result["errors"]}
    assert len(node_names_in_errors) >= 5, (
        "expected failures from multiple distinct nodes across multiple "
        "fan-out phases, not just one"
    )

    # Regression guard: the four similarity nodes are all built from the
    # same _make_similarity_node factory and previously all reported the
    # same generic "node failed..." message regardless of which dimension
    # actually failed (a closure-timing bug -- the rename happened after
    # the decorator had already captured the original name). A set-based
    # "at least N distinct prefixes" check doesn't catch four different
    # nodes collapsing onto one shared generic name, so assert each
    # dimension's own name explicitly instead.
    for dimension in ("abstract_similarity", "methodology_similarity", "workflow_similarity", "keyword_similarity"):
        assert any(e.startswith(f"{dimension} failed") for e in result["errors"]), (
            f"expected an error entry attributed to {dimension} specifically, "
            f"not a generic 'node failed' message -- got: {result['errors']}"
        )
    assert not any(e.startswith("node failed") for e in result["errors"]), (
        "found a generic 'node failed' error -- a similarity node's name "
        "isn't reaching the error message"
    )


async def test_literature_search_failure_still_allows_the_run_to_complete(patch_all_providers, monkeypatch):
    """literature_search uses the single-provider `resilient` (not
    `resilient_multi_provider`) -- verify a literature-layer failure
    degrades the same way an LLM-layer failure does, not differently."""
    patch_all_providers()

    from analyzer import nodes

    async def _always_fails(_client, _queries, _domain):
        raise ConnectionError("literature APIs unreachable")

    monkeypatch.setattr(nodes, "literature_search_impl", _always_fails)

    graph = build_graph().compile()
    result = await graph.ainvoke(sample_state(), sample_config())

    assert result["similar_papers"] == []
    assert any("literature_search" in e for e in result["errors"])
    assert result["final_report"], "similarity nodes should still run (against an empty paper list) and the run should still complete"


async def test_no_search_queries_short_circuits_literature_search_without_erroring(patch_all_providers, monkeypatch):
    """nodes.literature_search has an explicit early return with its own
    informational error when search_queries is empty -- verify that path
    specifically, since it's a plain-resilient node's own logic, not the
    decorator's fallback path."""
    patch_all_providers()

    from analyzer import llm_clients, nodes

    # force generate_search_queries to return an empty list by pointing
    # its response factory at an empty-queries result
    empty_queries_map = default_response_map()
    empty_queries_map[nodes._SearchQueries] = lambda: nodes._SearchQueries(queries=[])
    monkeypatch.setattr(llm_clients, "FAST_PROVIDERS", make_stack(empty_queries_map))
    monkeypatch.setattr(llm_clients, "CORE_PROVIDERS", make_stack(empty_queries_map))
    monkeypatch.setattr(llm_clients, "JUDGMENT_PROVIDERS", make_stack(empty_queries_map))

    async def _fake_literature(_client, queries, _domain):
        assert queries == []
        return [], []

    monkeypatch.setattr(nodes, "literature_search_impl", _fake_literature)

    graph = build_graph().compile()
    result = await graph.ainvoke(sample_state(), sample_config())

    assert any("no search queries were generated" in e for e in result["errors"])
    assert result["final_report"]
