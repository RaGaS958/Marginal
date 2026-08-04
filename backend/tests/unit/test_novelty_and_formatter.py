"""
Unit tests for the two pure, non-LLM functions in nodes.py. No mocking
needed here at all -- these are plain functions over plain state dicts.
"""
from analyzer.nodes import formatter, novelty_score


def _full_similarity_state(**overrides):
    state = {
        "title": "A Two-Stage Detector for Small Objects",
        "abstract_similarity": 80.0,
        "methodology_similarity": 60.0,
        "workflow_similarity": 50.0,
        "keyword_similarity": 70.0,
    }
    state.update(overrides)
    return state


# ---------------------------------------------------------------------
# novelty_score
# ---------------------------------------------------------------------

def test_novelty_score_with_all_dimensions_present():
    result = novelty_score(_full_similarity_state())
    # weights: abstract .30, methodology .30, workflow .25, keyword .15
    expected = (
        (100 - 80.0) * 0.30 + (100 - 60.0) * 0.30 + (100 - 50.0) * 0.25 + (100 - 70.0) * 0.15
    )
    assert result["novelty_score"] == round(expected, 2)
    assert "errors" not in result


def test_novelty_score_is_inverse_of_similarity():
    """Higher similarity to existing work should mean lower novelty."""
    high_similarity = novelty_score(_full_similarity_state(
        abstract_similarity=95.0, methodology_similarity=95.0,
        workflow_similarity=95.0, keyword_similarity=95.0,
    ))
    low_similarity = novelty_score(_full_similarity_state(
        abstract_similarity=5.0, methodology_similarity=5.0,
        workflow_similarity=5.0, keyword_similarity=5.0,
    ))
    assert high_similarity["novelty_score"] < low_similarity["novelty_score"]


def test_novelty_score_renormalizes_when_a_dimension_is_missing():
    state = _full_similarity_state(workflow_similarity=None)
    result = novelty_score(state)

    remaining_weight = 0.30 + 0.30 + 0.15  # abstract + methodology + keyword
    expected = (
        (100 - 80.0) * 0.30 + (100 - 60.0) * 0.30 + (100 - 70.0) * 0.15
    ) / remaining_weight
    assert result["novelty_score"] == round(expected, 2)
    assert "errors" in result
    assert "workflow_similarity" in result["errors"][0]
    assert "3/4" in result["errors"][0]


def test_novelty_score_renormalizes_over_multiple_missing_dimensions():
    state = _full_similarity_state(workflow_similarity=None, keyword_similarity=None)
    result = novelty_score(state)

    remaining_weight = 0.30 + 0.30  # abstract + methodology only
    expected = ((100 - 80.0) * 0.30 + (100 - 60.0) * 0.30) / remaining_weight
    assert result["novelty_score"] == round(expected, 2)
    assert "2/4" in result["errors"][0]
    # both missing names should be reported, sorted
    assert "keyword_similarity" in result["errors"][0]
    assert "workflow_similarity" in result["errors"][0]


def test_novelty_score_none_when_no_dimensions_available():
    state = _full_similarity_state(
        abstract_similarity=None, methodology_similarity=None,
        workflow_similarity=None, keyword_similarity=None,
    )
    result = novelty_score(state)

    assert result["novelty_score"] is None
    assert "no similarity dimensions available" in result["errors"][0]


def test_novelty_score_handles_zero_similarity_boundary():
    """0 similarity (fully novel) should score close to 100, not raise
    or divide oddly at the boundary."""
    state = _full_similarity_state(
        abstract_similarity=0.0, methodology_similarity=0.0,
        workflow_similarity=0.0, keyword_similarity=0.0,
    )
    result = novelty_score(state)
    assert result["novelty_score"] == 100.0


# ---------------------------------------------------------------------
# formatter
# ---------------------------------------------------------------------

def _full_report_state(**overrides):
    state = {
        "title": "A Two-Stage Detector for Small Objects",
        "novelty_score": 62.5,
        "recommendation": "Minor Revision",
        "abstract_similarity": 80.0, "abstract_similarity_rationale": "Close overlap on the core claim.",
        "methodology_similarity": 60.0, "methodology_similarity_rationale": "Different attention mechanism.",
        "workflow_similarity": 50.0, "workflow_similarity_rationale": "Similar pipeline shape.",
        "keyword_similarity": 70.0, "keyword_similarity_rationale": "Overlapping keyword set.",
        "similar_papers": [
            {"title": "A Prior Approach to Widget Detection", "year": 2023},
            {"title": "Widgets Revisited", "year": 2022},
        ],
        "strengths": ["Clear problem framing", "Reasonable baselines"],
        "weaknesses": ["Limited dataset diversity"],
        "reviewer_comments": "A solid incremental contribution.",
        "improvement_suggestions": "Broaden evaluation to a second dataset.",
        "errors": [],
    }
    state.update(overrides)
    return state


def test_formatter_includes_all_core_sections():
    result = formatter(_full_report_state())
    report = result["final_report"]

    assert "# Novelty analysis: A Two-Stage Detector for Small Objects" in report
    assert "62.5/100" in report
    assert "Minor Revision" in report
    assert "Clear problem framing" in report
    assert "Limited dataset diversity" in report
    assert "A solid incremental contribution." in report
    assert "Broaden evaluation to a second dataset." in report
    assert "A Prior Approach to Widget Detection (2023)" in report


def test_formatter_omits_notes_section_when_no_errors():
    result = formatter(_full_report_state(errors=[]))
    assert "## Notes" not in result["final_report"]


def test_formatter_includes_notes_section_when_errors_present():
    result = formatter(_full_report_state(errors=["abstract_similarity failed on every provider: TimeoutError()"]))
    report = result["final_report"]
    assert "## Notes" in report
    assert "abstract_similarity failed on every provider" in report


def test_formatter_shows_not_available_for_missing_dimension():
    result = formatter(_full_report_state(abstract_similarity=None, abstract_similarity_rationale=None))
    assert "**Abstract similarity:** not available" in result["final_report"]


def test_formatter_shows_unavailable_score_when_novelty_score_is_none():
    result = formatter(_full_report_state(novelty_score=None))
    assert "unavailable (see notes below)" in result["final_report"]


def test_formatter_handles_empty_strengths_and_weaknesses():
    result = formatter(_full_report_state(strengths=[], weaknesses=[]))
    report = result["final_report"]
    assert "_none recorded_" in report


def test_formatter_handles_no_similar_papers_found():
    result = formatter(_full_report_state(similar_papers=[]))
    assert "_none found_" in result["final_report"]


def test_formatter_caps_similar_papers_list_at_eight():
    many_papers = [{"title": f"Paper {i}", "year": 2020 + i} for i in range(12)]
    result = formatter(_full_report_state(similar_papers=many_papers))
    report = result["final_report"]
    assert "Paper 0" in report
    assert "Paper 7" in report
    assert "Paper 8" not in report
