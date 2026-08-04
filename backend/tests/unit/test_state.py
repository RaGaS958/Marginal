"""
Unit tests for state.build_initial_state.
"""
import uuid

from analyzer.state import build_initial_state


def test_sets_input_fields_verbatim():
    state = build_initial_state(title="My Title", abstract="My abstract text.", workflow="A -> B")
    assert state["title"] == "My Title"
    assert state["abstract"] == "My abstract text."
    assert state["workflow"] == "A -> B"


def test_generates_a_request_id_when_none_supplied():
    state = build_initial_state(title="T", abstract="A", workflow="")
    # should be a valid UUID string, not empty/None
    assert state["request_id"]
    uuid.UUID(state["request_id"])  # raises ValueError if not a valid UUID


def test_uses_caller_supplied_request_id_verbatim():
    state = build_initial_state(title="T", abstract="A", workflow="", request_id="client-chosen-id-123")
    assert state["request_id"] == "client-chosen-id-123"


def test_two_calls_without_request_id_get_different_ids():
    a = build_initial_state(title="T", abstract="A", workflow="")
    b = build_initial_state(title="T", abstract="A", workflow="")
    assert a["request_id"] != b["request_id"]


def test_all_phase_output_fields_start_empty_or_none():
    state = build_initial_state(title="T", abstract="A", workflow="")

    assert state["research_domain"] == ""
    assert state["problem_statement"] == ""
    assert state["methodology"] == ""
    assert state["proposed_workflow"] == ""
    assert state["keywords"] == []
    assert state["search_queries"] == []
    assert state["similar_papers"] == []

    for dim in ("abstract_similarity", "methodology_similarity", "workflow_similarity", "keyword_similarity"):
        assert state[dim] is None
        assert state[f"{dim}_rationale"] is None

    assert state["novelty_score"] is None
    assert state["strengths"] == []
    assert state["weaknesses"] == []
    assert state["reviewer_comments"] == ""
    assert state["recommendation"] == ""
    assert state["improvement_suggestions"] == ""
    assert state["final_report"] == ""
    assert state["errors"] == []


def test_returned_lists_are_independent_between_calls():
    """A shared mutable default would be a classic bug -- verify mutating
    one call's state never leaks into another's."""
    a = build_initial_state(title="T", abstract="A", workflow="")
    b = build_initial_state(title="T", abstract="A", workflow="")

    a["errors"].append("something went wrong in run a")
    a["keywords"].append("leaked-keyword")

    assert b["errors"] == []
    assert b["keywords"] == []
