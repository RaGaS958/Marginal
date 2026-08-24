import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from analyzer.nodes import (
    detect_research_domain,
    extract_problem_statement,
    extract_methodology,
    extract_workflow,
    extract_keywords,
    check_general_feasibility,
    analyze_critical_gaps,
    assess_novelty
)

# A factory to create a mock LLM that returns a specific pydantic model instance
def create_mock_llm(return_value):
    mock_llm = MagicMock()
    mock_structured = MagicMock()
    
    # ainvoke is async
    mock_ainvoke = AsyncMock(return_value=return_value)
    mock_structured.ainvoke = mock_ainvoke
    
    mock_llm.with_structured_output.return_value = mock_structured
    return mock_llm

@pytest.fixture
def dummy_state():
    return {
        "title": "Test Title",
        "abstract": "Test Abstract",
        "conclusion": "Test Conclusion",
        "workflow": "Test Workflow"
    }

@pytest.mark.asyncio
async def test_detect_research_domain(dummy_state):
    class MockDomain:
        domain = "Computer Science - AI"
        
    mock_llm = create_mock_llm(MockDomain())
    
    with patch("analyzer.nodes.llm_clients.FAST_PROVIDERS", [mock_llm]):
        result = await detect_research_domain(dummy_state)
        assert result == {"research_domain": "Computer Science - AI"}
        mock_llm.with_structured_output.assert_called_once()

@pytest.mark.asyncio
async def test_extract_problem_statement(dummy_state):
    class MockProblem:
        problem_statement = "Test Problem"
        
    mock_llm = create_mock_llm(MockProblem())
    
    with patch("analyzer.nodes.llm_clients.CORE_PROVIDERS", [mock_llm]):
        result = await extract_problem_statement(dummy_state)
        assert result == {"problem_statement": "Test Problem"}

@pytest.mark.asyncio
async def test_extract_methodology(dummy_state):
    class MockMethodology:
        methodology = "Test Methodology"
        
    mock_llm = create_mock_llm(MockMethodology())
    
    with patch("analyzer.nodes.llm_clients.CORE_PROVIDERS", [mock_llm]):
        result = await extract_methodology(dummy_state)
        assert result == {"methodology": "Test Methodology"}

@pytest.mark.asyncio
async def test_extract_workflow(dummy_state):
    class MockWorkflow:
        proposed_workflow = "Test Workflow Details"
        
    mock_llm = create_mock_llm(MockWorkflow())
    
    with patch("analyzer.nodes.llm_clients.CORE_PROVIDERS", [mock_llm]):
        result = await extract_workflow(dummy_state)
        assert result == {"proposed_workflow": "Test Workflow Details"}

@pytest.mark.asyncio
async def test_extract_keywords(dummy_state):
    class MockKeywords:
        keywords = ["k1", "k2", "k3"]
        
    mock_llm = create_mock_llm(MockKeywords())
    
    with patch("analyzer.nodes.llm_clients.FAST_PROVIDERS", [mock_llm]):
        result = await extract_keywords(dummy_state)
        assert result == {"keywords": ["k1", "k2", "k3"]}

@pytest.mark.asyncio
async def test_check_general_feasibility(dummy_state):
    class MockFeasibility:
        feasibility_score = 85
        feasibility_rationale = "Looks feasible"
        
    mock_llm = create_mock_llm(MockFeasibility())
    
    with patch("analyzer.nodes.llm_clients.JUDGMENT_PROVIDERS", [mock_llm]):
        result = await check_general_feasibility(dummy_state)
        assert result == {"feasibility_score": 85, "feasibility_rationale": "Looks feasible"}

@pytest.mark.asyncio
async def test_analyze_critical_gaps(dummy_state):
    class MockGaps:
        critical_gaps = "Missing datasets"
        
    mock_llm = create_mock_llm(MockGaps())
    
    with patch("analyzer.nodes.llm_clients.JUDGMENT_PROVIDERS", [mock_llm]):
        result = await analyze_critical_gaps(dummy_state)
        assert result == {"critical_gaps": "Missing datasets"}

@pytest.mark.asyncio
async def test_assess_novelty(dummy_state):
    class MockNovelty:
        novelty_score = 90
        novelty_rationale = "Very novel"
        
    mock_llm = create_mock_llm(MockNovelty())
    dummy_state["literature_context"] = "Some prior work."
    
    with patch("analyzer.nodes.llm_clients.JUDGMENT_PROVIDERS", [mock_llm]):
        result = await assess_novelty(dummy_state)
        assert result == {"novelty_score": 90, "novelty_rationale": "Very novel"}
