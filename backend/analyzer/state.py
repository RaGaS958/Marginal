"""
Shared graph state for the novelty-analysis pipeline.

WHY `errors` CARRIES A REDUCER:

Three phases in this graph run multiple nodes concurrently in the same
superstep (5-way extraction, 4-way similarity, 2-way review). Every one of
those nodes is wrapped in `resilient_multi_provider` (see resilience.py),
whose entire contract is that a node never raises -- on final failure it
returns its fallback dict merged with an `errors` key instead.

That's airtight at the single-node level, but it creates a graph-level
requirement the node layer cannot satisfy on its own: if two or more nodes
in the *same* fan-out both hit their fallback path in the same run, they
both attempt to write to the shared `errors` key in the same step. Without
a reducer, LangGraph raises `InvalidUpdateError: At key 'errors': Can
receive only one value per step` -- which would crash the entire run from
inside the exact mechanism that exists to guarantee a node can never take
its siblings down with it.

`operator.add` (list concatenation) is the fix: every fallback path
contributes its one-item list, and the reducer merges them instead of
colliding. Do not simplify this back to a plain `list[str]`.
"""
from __future__ import annotations

import operator
import uuid
from typing import Annotated, TypedDict


class ResearchPaperState(TypedDict):
    # --- input, set once at submission ---
    request_id: str
    title: str
    abstract: str
    workflow: str

    # --- Phase 1: parallel extraction (5-way fan-out from START) ---
    research_domain: str
    problem_statement: str
    methodology: str
    proposed_workflow: str
    keywords: list[str]

    # --- Phase 2: merge -> search queries ---
    search_queries: list[str]

    # --- Phase 3: literature search ---
    similar_papers: list[dict]

    # --- Phase 4: parallel similarity (4-way fan-out) ---
    abstract_similarity: float | None
    abstract_similarity_rationale: str | None
    methodology_similarity: float | None
    methodology_similarity_rationale: str | None
    workflow_similarity: float | None
    workflow_similarity_rationale: str | None
    keyword_similarity: float | None
    keyword_similarity_rationale: str | None

    # --- Phase 5: novelty score (pure function) ---
    novelty_score: float | None

    # --- Phase 6: parallel review (2-way fan-out) ---
    strengths: list[str]
    weaknesses: list[str]
    reviewer_comments: str
    recommendation: str
    improvement_suggestions: str

    # --- Phase 7: formatter (pure function) ---
    final_report: str

    # --- cross-cutting -- see module docstring, this reducer is not optional ---
    errors: Annotated[list[str], operator.add]


def build_initial_state(
    title: str,
    abstract: str,
    workflow: str,
    request_id: str | None = None,
) -> ResearchPaperState:
    """
    Seeds a fresh state for one analysis run.

    `request_id` becomes the LangGraph thread_id (see graph.py / main.py).
    Accepts a caller-supplied ID rather than always minting one here, so a
    client-generated ID can become the single canonical ID end-to-end --
    the frontend's own client-generated ID was previously never sent to
    the backend, which meant a later GET for a saved/revisited URL could
    never find the run the backend actually created. Passing it through
    here and using it as the thread_id (see main.py) closes that gap.
    Falls back to a fresh UUID4 if the caller doesn't supply one.
    """
    return ResearchPaperState(
        request_id=request_id or str(uuid.uuid4()),
        title=title,
        abstract=abstract,
        workflow=workflow,
        research_domain="",
        problem_statement="",
        methodology="",
        proposed_workflow="",
        keywords=[],
        search_queries=[],
        similar_papers=[],
        abstract_similarity=None,
        abstract_similarity_rationale=None,
        methodology_similarity=None,
        methodology_similarity_rationale=None,
        workflow_similarity=None,
        workflow_similarity_rationale=None,
        keyword_similarity=None,
        keyword_similarity_rationale=None,
        novelty_score=None,
        strengths=[],
        weaknesses=[],
        reviewer_comments="",
        recommendation="",
        improvement_suggestions="",
        final_report="",
        errors=[],
    )
