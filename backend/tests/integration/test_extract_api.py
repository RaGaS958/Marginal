import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
import io

from analyzer.main import app

client = TestClient(app)

def test_extract_api_invalid_file_type():
    response = client.post(
        "/extract", 
        files={"file": ("test.txt", io.BytesIO(b"hello"), "text/plain")}
    )
    assert response.status_code == 400
    assert "Only PDF and DOCX files are supported" in response.text

def test_extract_api_success():
    with patch("analyzer.main.extract_paper_details", new_callable=AsyncMock) as mock_extract:
        mock_extract.return_value = {
            "title": "Mock API Title",
            "abstract": "Mock API Abstract",
            "methodology": "Mock API Methodology",
            "conclusion": "Mock API Conclusion"
        }
        
        response = client.post(
            "/extract", 
            files={"file": ("test.pdf", io.BytesIO(b"dummy bytes"), "application/pdf")}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Mock API Title"
        assert data["abstract"] == "Mock API Abstract"
        assert data["methodology"] == "Mock API Methodology"
        assert data["conclusion"] == "Mock API Conclusion"
        
        mock_extract.assert_called_once()
        args, kwargs = mock_extract.call_args
        assert args[0] == b"dummy bytes"
        assert args[1] == "test.pdf"

def test_extract_api_extraction_error():
    with patch("analyzer.main.extract_paper_details", new_callable=AsyncMock) as mock_extract:
        mock_extract.side_effect = ValueError("Could not extract any text from the file.")
        
        response = client.post(
            "/extract", 
            files={"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")}
        )
        
        assert response.status_code == 400
        assert "Could not extract any text" in response.text
