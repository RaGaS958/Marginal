# Marginal Architecture & Agentic Workflow

This document explains the core architecture of Marginal and how the LLM "agents" (nodes) interact within the system.

## 1. System Overview
Marginal is a dual-stack application:
- **Frontend (React + Vite + TailwindCSS)**: Handles user input (manual text entry or file uploads), presents loading states via Server-Sent Events (SSE), and renders final analytical reports (Novelty score, Reviewer feedback).
- **Backend (FastAPI + LangGraph)**: Exposes endpoints for file extraction and running the analysis. The core analytical engine is powered by an asynchronous state machine built with LangGraph.

## 2. The LangGraph State Machine
The analysis process is modeled as a Directed Acyclic Graph (DAG) in `backend/analyzer/graph.py`. When a request is submitted, it flows through several nodes:

1. **Extraction (Parallel)**: Extracts metadata like problem statement, methodology, workflow, keywords, and research domain from the raw text.
2. **Feasibility & Literature (Parallel)**: 
   - Uses the extracted metadata to search real-world literature via Semantic Scholar (`search_literature`).
   - Assesses the general feasibility of the proposed research (`check_general_feasibility`).
3. **Synthesis (Sequential)**: 
   - `analyze_critical_gaps`: Identifies weaknesses in the proposal based on the literature context.
   - `assess_novelty`: Evaluates the novelty of the idea against prior art.
4. **Formatting**: Generates the final reviewer prose and standardizes the output.

## 3. LLM Providers & Resilience
To ensure stability and keep costs manageable, Marginal splits requests across different LLM tiers (defined in `backend/analyzer/llm_clients.py`):
- **FAST_PROVIDERS**: Used for simple extractions (e.g., keyword extraction).
- **CORE_PROVIDERS**: Used for mid-level tasks (e.g., methodology extraction).
- **JUDGMENT_PROVIDERS**: Used for deep reasoning tasks (e.g., novelty assessment).

We use a custom `@resilient_multi_provider` decorator. If an API call fails (due to rate limits or network issues), the system automatically retries and falls back to alternative providers in the stack without crashing the pipeline.

## 4. File Extraction
The system supports extracting text from uploaded `.pdf` and `.docx` files via `backend/analyzer/extractor.py`. To prevent overwhelming the LLM's token context window, the extractor intelligently slices long documents (extracting the beginning and end) before parsing it using a FAST_PROVIDER model.

## 5. Adding New Features
To add a new capability or analysis node:
1. Define the state field in `backend/analyzer/state.py`.
2. Create the node function in `backend/analyzer/nodes.py`, decorating it with the appropriate resilience decorator.
3. Wire the node into the pipeline in `backend/analyzer/graph.py`.
4. Update the frontend UI to display the new state field.
