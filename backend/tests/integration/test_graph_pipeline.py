import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from analyzer.graph import build_graph
from analyzer.state import build_initial_state
from langgraph.checkpoint.memory import InMemorySaver
import httpx

# A factory to create a mock LLM that returns a specific pydantic model instance
def create_mock_llm():
    mock_llm = MagicMock()
    mock_structured = MagicMock()
    
    async def side_effect(*args, **kwargs):
        class CatchAll:
            def __getattr__(self, name):
                if name in ["keywords", "literature_context"]:
                    return ["mock"]
                elif name in ["feasibility_score", "novelty_score"]:
                    return 85
                return "Mocked Value"
        return CatchAll()

    mock_structured.ainvoke = AsyncMock(side_effect=side_effect)
    mock_llm.with_structured_output.return_value = mock_structured
    return mock_llm

@pytest.mark.asyncio
async def test_full_graph_execution():
    checkpointer = InMemorySaver()
    graph = build_graph().compile(checkpointer=checkpointer)
    initial_state = build_initial_state("Mock Title", "Mock Abstract", "Mock Method", "req123")
    config = {"configurable": {"thread_id": "req123", "checkpoint_ns": ""}}
    
    mock_llm = create_mock_llm()
    
    with patch("analyzer.nodes.llm_clients.FAST_PROVIDERS", [mock_llm]), \
         patch("analyzer.nodes.llm_clients.CORE_PROVIDERS", [mock_llm]), \
         patch("analyzer.nodes.llm_clients.JUDGMENT_PROVIDERS", [mock_llm]), \
         patch("analyzer.literature.httpx.AsyncClient.get") as mock_get:
        
        # Mock Semantic Scholar API response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [
                {"title": "Prior Art 1", "abstract": "Similar stuff", "year": 2022},
                {"title": "Prior Art 2", "abstract": "More similar stuff", "year": 2023}
            ]
        }
        mock_get.return_value = mock_response

        # Execute graph
        updates = []
        async for update in graph.astream(initial_state, config, stream_mode="updates"):
            updates.append(update)
            
        assert len(updates) > 0
        
        # Validate that the final state contains expected fields
        final_state = graph.get_state(config).values
        assert "research_domain" in final_state
        assert "novelty_score" in final_state
        assert final_state["status"] == "complete"
