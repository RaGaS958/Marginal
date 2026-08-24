"""
Graph wiring for the novelty-analysis pipeline.

Topology (7 stages, three fan-out points, three merge points):

    START
      +-> detect_research_domain    -+
      +-> extract_problem_statement -+
      +-> extract_methodology       -+-> generate_search_queries -> literature_search
      +-> extract_workflow          -+
      +-> extract_keywords          -+
                                          +-> abstract_similarity    -+
                                          +-> methodology_similarity -+-> novelty_score
                                          +-> workflow_similarity    -+
                                          +-> keyword_similarity     -+
                                          +-> conclusion_similarity  -+
                                                                          +-> reviewer_agent    -+
                                                                          +-> improvement_agent -+-> formatter -> END

Every fan-out is a plain multi-edge (LangGraph runs all targets of a
shared source node in the same superstep); every merge is implicit --
a node with multiple incoming edges only fires once all of them have
completed. See analyzer/state.py for why `errors` needs a reducer given
three separate fan-out phases can each independently write to it.
"""
from langgraph.graph import END, START, StateGraph

from . import nodes
from .state import ResearchPaperState

EXTRACTION_NODES = (
    "detect_research_domain",
    "extract_problem_statement",
    "extract_methodology",
    "extract_workflow",
    "extract_keywords",
)

SIMILARITY_NODES = (
    "abstract_similarity",
    "methodology_similarity",
    "workflow_similarity",
    "keyword_similarity",
    "conclusion_similarity",
)

REVIEW_NODES = (
    "reviewer_agent",
    "improvement_agent",
)


def build_graph() -> StateGraph:
    """Returns the uncompiled StateGraph. Callers compile it with whichever
    checkpointer fits their environment (see main.py)."""
    workflow = StateGraph(ResearchPaperState)

    # Phase 1-2: extraction fan-out into the merge node
    for name in EXTRACTION_NODES:
        workflow.add_node(name, getattr(nodes, name))
        workflow.add_edge(START, name)
        workflow.add_edge(name, "generate_search_queries")
    workflow.add_node("generate_search_queries", nodes.generate_search_queries)

    # Phase 3: literature search
    workflow.add_node("literature_search", nodes.literature_search)
    workflow.add_edge("generate_search_queries", "literature_search")

    # Phase 4-5: similarity fan-out into the novelty score merge node
    for name in SIMILARITY_NODES:
        workflow.add_node(name, getattr(nodes, name))
        workflow.add_edge("literature_search", name)
        workflow.add_edge(name, "novelty_score")
    workflow.add_node("novelty_score", nodes.novelty_score)

    # Phase 6-7: review fan-out into the formatter merge node
    for name in REVIEW_NODES:
        workflow.add_node(name, getattr(nodes, name))
        workflow.add_edge("novelty_score", name)
        workflow.add_edge(name, "formatter")
    workflow.add_node("formatter", nodes.formatter)

    workflow.add_edge("formatter", END)

    return workflow
