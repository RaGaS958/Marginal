"""
Unit tests for literature.py's pure/isolated pieces: title normalization,
dedup-and-rank, the CS/ML domain heuristic, and the arXiv Atom-XML parser.
The network-calling source functions (_search_semantic_scholar etc.) are
exercised indirectly through the integration tests via a mocked HTTP
client -- see tests/integration/test_literature_sources.py.
"""
from analyzer.literature import (
    _dedupe_and_rank,
    _looks_cs_ml_adjacent,
    _normalize_title,
    _parse_arxiv_atom,
)

# ---------------------------------------------------------------------
# _normalize_title
# ---------------------------------------------------------------------

def test_normalize_title_lowercases():
    assert _normalize_title("A Study Of Widgets") == "a study of widgets"


def test_normalize_title_strips_punctuation():
    assert _normalize_title("Widgets: A Survey (2023)!") == "widgets a survey 2023"


def test_normalize_title_collapses_whitespace_variants():
    assert _normalize_title("Widgets\n\tA   Survey") == "widgets a survey"


def test_normalize_title_handles_empty_and_none():
    assert _normalize_title("") == ""
    assert _normalize_title(None) == ""


def test_normalize_title_treats_near_duplicates_as_equal():
    a = _normalize_title("Widget Detection: A Survey")
    b = _normalize_title("widget detection - a survey!!")
    assert a == b


# ---------------------------------------------------------------------
# _looks_cs_ml_adjacent
# ---------------------------------------------------------------------

def test_cs_ml_domain_detected():
    assert _looks_cs_ml_adjacent("Computer Vision") is True
    assert _looks_cs_ml_adjacent("Natural Language Processing") is True
    assert _looks_cs_ml_adjacent("machine learning") is True


def test_non_cs_ml_domain_not_detected():
    assert _looks_cs_ml_adjacent("Marine Biology") is False
    assert _looks_cs_ml_adjacent("Organic Chemistry") is False


def test_cs_ml_detection_handles_empty_domain():
    assert _looks_cs_ml_adjacent("") is False
    assert _looks_cs_ml_adjacent(None) is False


# ---------------------------------------------------------------------
# _dedupe_and_rank
# ---------------------------------------------------------------------

def test_dedupe_collapses_near_identical_titles():
    papers = [
        {"title": "Widget Detection: A Survey", "citation_count": 10},
        {"title": "widget detection - a survey", "citation_count": 25},
    ]
    result = _dedupe_and_rank(papers)
    assert len(result) == 1
    assert result[0]["citation_count"] == 25, "the higher-cited duplicate should win"


def test_dedupe_keeps_distinct_titles():
    papers = [
        {"title": "Widget Detection", "citation_count": 10},
        {"title": "Gadget Detection", "citation_count": 5},
    ]
    result = _dedupe_and_rank(papers)
    assert len(result) == 2


def test_rank_sorts_by_citation_count_descending():
    papers = [
        {"title": "Low Citations", "citation_count": 2},
        {"title": "High Citations", "citation_count": 100},
        {"title": "Mid Citations", "citation_count": 40},
    ]
    result = _dedupe_and_rank(papers)
    assert [p["title"] for p in result] == ["High Citations", "Mid Citations", "Low Citations"]


def test_rank_treats_missing_citation_count_as_zero():
    papers = [
        {"title": "No Count", "citation_count": None},
        {"title": "Has Count", "citation_count": 3},
    ]
    result = _dedupe_and_rank(papers)
    assert [p["title"] for p in result] == ["Has Count", "No Count"]


def test_dedupe_skips_papers_with_blank_titles():
    papers = [
        {"title": "", "citation_count": 999},
        {"title": "Real Paper", "citation_count": 1},
    ]
    result = _dedupe_and_rank(papers)
    assert len(result) == 1
    assert result[0]["title"] == "Real Paper"


# ---------------------------------------------------------------------
# _parse_arxiv_atom
# ---------------------------------------------------------------------

_SAMPLE_ATOM = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2301.00001v1</id>
    <title>A Study of Widget Detection Methods</title>
    <published>2023-01-15T00:00:00Z</published>
    <author><name>Jane Researcher</name></author>
    <author><name>John Scholar</name></author>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2302.00002v1</id>
    <title>
      Widgets at Scale: A Follow-Up Study
    </title>
    <published>2023-06-01T00:00:00Z</published>
    <author><name>Solo Author</name></author>
  </entry>
</feed>
"""


def test_parse_arxiv_atom_extracts_all_entries():
    papers = _parse_arxiv_atom(_SAMPLE_ATOM)
    assert len(papers) == 2


def test_parse_arxiv_atom_extracts_fields_correctly():
    papers = _parse_arxiv_atom(_SAMPLE_ATOM)
    first = papers[0]
    assert first["title"] == "A Study of Widget Detection Methods"
    assert first["year"] == 2023
    assert first["authors"] == ["Jane Researcher", "John Scholar"]
    assert first["source"] == "arxiv"
    assert first["citation_count"] is None
    assert first["url"] == "http://arxiv.org/abs/2301.00001v1"


def test_parse_arxiv_atom_strips_whitespace_from_multiline_titles():
    papers = _parse_arxiv_atom(_SAMPLE_ATOM)
    assert papers[1]["title"] == "Widgets at Scale: A Follow-Up Study"


def test_parse_arxiv_atom_handles_empty_feed():
    empty_feed = '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>'
    assert _parse_arxiv_atom(empty_feed) == []
