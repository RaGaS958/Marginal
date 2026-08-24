import pytest
from unittest.mock import patch, MagicMock

from analyzer.extractor import extract_text_from_pdf, extract_text_from_docx, extract_paper_details

def test_extract_text_from_pdf():
    with patch("analyzer.extractor.PdfReader") as mock_pdf_reader:
        mock_instance = mock_pdf_reader.return_value
        
        mock_page1 = MagicMock()
        mock_page1.extract_text.return_value = "Page 1 Text"
        mock_page2 = MagicMock()
        mock_page2.extract_text.return_value = "Page 2 Text"
        
        mock_instance.pages = [mock_page1, mock_page2]
        
        result = extract_text_from_pdf(b"dummy pdf bytes")
        
        assert "Page 1 Text" in result
        assert "Page 2 Text" in result

def test_extract_text_from_docx():
    with patch("analyzer.extractor.docx.Document") as mock_doc:
        mock_instance = mock_doc.return_value
        
        mock_p1 = MagicMock()
        mock_p1.text = "Para 1 Text"
        mock_p2 = MagicMock()
        mock_p2.text = "Para 2 Text"
        
        mock_instance.paragraphs = [mock_p1, mock_p2]
        
        result = extract_text_from_docx(b"dummy docx bytes")
        
        assert "Para 1 Text" in result
        assert "Para 2 Text" in result

@pytest.mark.asyncio
async def test_extract_paper_details_pdf():
    with patch("analyzer.extractor.extract_text_from_pdf", return_value="Dummy PDF Text"), \
         patch("analyzer.extractor._extract_with_llm") as mock_llm:
        
        mock_llm.return_value = {"title": "Mock Title", "abstract": "Mock Abstract", "methodology": "", "conclusion": ""}
        
        result = await extract_paper_details(b"dummy", "test.pdf")
        
        assert result["title"] == "Mock Title"
        mock_llm.assert_called_once_with("Dummy PDF Text")

@pytest.mark.asyncio
async def test_extract_paper_details_docx():
    with patch("analyzer.extractor.extract_text_from_docx", return_value="Dummy DOCX Text"), \
         patch("analyzer.extractor._extract_with_llm") as mock_llm:
        
        mock_llm.return_value = {"title": "Mock Title", "abstract": "Mock Abstract", "methodology": "", "conclusion": ""}
        
        result = await extract_paper_details(b"dummy", "test.docx")
        
        assert result["title"] == "Mock Title"
        mock_llm.assert_called_once_with("Dummy DOCX Text")

@pytest.mark.asyncio
async def test_extract_paper_details_unsupported():
    with pytest.raises(ValueError, match="Unsupported file format"):
        await extract_paper_details(b"dummy", "test.txt")

@pytest.mark.asyncio
async def test_extract_paper_details_empty_text():
    with patch("analyzer.extractor.extract_text_from_pdf", return_value="   "):
        with pytest.raises(ValueError, match="Could not extract any text"):
            await extract_paper_details(b"dummy", "test.pdf")
