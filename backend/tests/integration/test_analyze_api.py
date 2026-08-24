import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, AsyncMock

from analyzer.main import app

client = TestClient(app)

def test_analyze_endpoint_missing_fields():
    response = client.post("/analyze", json={"title": "foo"})
    assert response.status_code == 422 # Pydantic validation error

def test_analyze_endpoint_sse():
    # We will mock the compile output of build_graph
    with patch("analyzer.main.build_graph") as mock_build_graph:
        mock_graph = MagicMock()
        
        async def dummy_stream(*args, **kwargs):
            yield {"node1": {"some": "update"}}
            yield {"node2": {"other": "update"}}
            
        mock_graph.astream = dummy_stream
        mock_graph.get_state.return_value = MagicMock(values={"novelty_score": 99, "status": "complete"})
        
        # mock compile to return our mock_graph
        mock_compiled = MagicMock()
        mock_compiled.astream = dummy_stream
        mock_compiled.get_state.return_value = MagicMock(values={"novelty_score": 99, "status": "complete"})
        mock_build_graph.return_value.compile.return_value = mock_compiled
        
        payload = {
            "title": "Valid Title",
            "abstract": "Valid Abstract that is long enough to pass validation in the AnalyzeRequest model.",
            "workflow": "Valid Methodology",
            "conclusion": "Valid Conclusion",
            "request_id": "req123"
        }
        
        # We need to bypass the client IP rate limiting
        with patch("analyzer.main._acquire_run_slot", new_callable=AsyncMock) as mock_acquire, \
             patch("analyzer.main._release_run_slot", new_callable=AsyncMock) as mock_release:
            
            response = client.post("/analyze", json=payload)
            assert response.status_code == 200
            
            # The client.post will buffer the whole SSE stream and return it as text
            content = response.text
            
            assert 'data: {"type": "progress", "node": "node1"}' in content
            assert 'data: {"type": "progress", "node": "node2"}' in content
            assert 'data: {"type": "result"' in content
            assert '"novelty_score": 99' in content
