"""
extractor.py

Handles the parsing and extraction of key research details (Title, Abstract, Methodology, Conclusion)
from uploaded user documents (.pdf and .docx). It uses a fast LLM provider to structure the unstructured text.

Every stage — PDF/DOCX parsing, LLM structuring — is traced as a separate
child span in LangSmith under the parent `extract_paper_details` span,
so you can see parse time vs. LLM time and catch extraction failures precisely.
"""
import io
from pydantic import BaseModel, Field
from pypdf import PdfReader
import docx
from langsmith import traceable

from analyzer.resilience import resilient_multi_provider
from analyzer.llm_clients import FAST_PROVIDERS


class ExtractedPaperDetails(BaseModel):
    title: str = Field(description="The full title of the paper or manuscript")
    abstract: str = Field(description="The abstract of the paper")
    methodology: str = Field(description="A brief description of the methodology or workflow used. Empty string if none.")
    conclusion: str = Field(description="A summary of the conclusion or key findings. Empty string if none.")


@traceable(
    name="extract_text_from_pdf",
    run_type="tool",
    tags=["extractor", "pdf"],
)
def extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    Extracts raw text from a PDF file.
    To prevent token limits from blowing up, it reads the first and last few pages
    of long PDFs (which typically covers the abstract, introduction, and conclusion).
    """
    reader = PdfReader(io.BytesIO(file_bytes))
    text = ""
    # Extract only the first 5 pages and last 2 pages to stay within token limits
    num_pages = len(reader.pages)
    if num_pages <= 7:
        for page in reader.pages:
            text += page.extract_text() + "\n"
    else:
        for i in range(5):
            text += reader.pages[i].extract_text() + "\n"
        text += "\n...[middle pages omitted]...\n"
        for i in range(num_pages - 2, num_pages):
            text += reader.pages[i].extract_text() + "\n"
    return text


@traceable(
    name="extract_text_from_docx",
    run_type="tool",
    tags=["extractor", "docx"],
)
def extract_text_from_docx(file_bytes: bytes) -> str:
    """
    Extracts raw text from a DOCX file.
    If the document is extremely long, it slices the first and last ~5000 words.
    """
    doc = docx.Document(io.BytesIO(file_bytes))
    full_text = []
    for para in doc.paragraphs:
        full_text.append(para.text)
    text = '\n'.join(full_text)
    # truncate if it's too long (roughly > 10k words)
    words = text.split()
    if len(words) > 10000:
        return ' '.join(words[:5000]) + "\n...[middle omitted]...\n" + ' '.join(words[-5000:])
    return text


@resilient_multi_provider(fallback={"title": "", "abstract": "", "methodology": "", "conclusion": ""}, providers=lambda: FAST_PROVIDERS)
@traceable(
    name="extract_with_llm",
    run_type="llm",
    tags=["extractor", "llm_structuring"],
)
async def _extract_with_llm(text: str, _client=None) -> dict:
    """
    Internal helper to prompt the LLM for structured extraction of the paper details.
    Wrapped with @resilient_multi_provider to automatically retry or fallback across models.
    """
    structured_llm = _client.with_structured_output(ExtractedPaperDetails)
    prompt = f"""
    Extract the following details from the research paper text below:
    - Title
    - Abstract
    - Methodology (brief summary of how they did it)
    - Conclusion (brief summary of findings)
    
    If any section is missing or unclear, extract as much as you can or leave it empty.
    
    TEXT:
    {text[:30000]}
    """
    
    result = await structured_llm.ainvoke(prompt)
    return result.model_dump()


@traceable(
    name="extract_paper_details",
    run_type="tool",
    tags=["extractor", "pipeline"],
)
async def extract_paper_details(file_bytes: bytes, filename: str) -> dict:
    """
    Main entry point for file extraction.
    Determines the file type, parses the raw text, and invokes the LLM for structuring.
    
    Args:
        file_bytes: The raw bytes of the uploaded file.
        filename: The original filename (used to infer the extension).
        
    Returns:
        dict: A dictionary matching the ExtractedPaperDetails schema.
    """
    text = ""
    if filename.lower().endswith(".pdf"):
        text = extract_text_from_pdf(file_bytes)
    elif filename.lower().endswith(".docx"):
        text = extract_text_from_docx(file_bytes)
    else:
        raise ValueError("Unsupported file format. Must be PDF or DOCX.")
        
    if not text.strip():
        raise ValueError("Could not extract any text from the file.")
        
    return await _extract_with_llm(text)
