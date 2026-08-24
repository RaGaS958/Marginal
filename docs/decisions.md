# Architecture Decision Records (ADRs)

This document tracks significant technical decisions made throughout the development of the Marginal platform.

## 1. Use of LangGraph for State Management
**Decision**: We use LangGraph to orchestrate the backend analysis pipeline.
**Rationale**: Evaluating research papers is a multi-step process. We need to extract data, query external databases (Semantic Scholar), and use those results to evaluate novelty. LangGraph allows us to define this process as a clear DAG, handle parallel execution easily, and stream progress (checkpoints) to the frontend.

## 2. Server-Sent Events (SSE) for Real-time Feedback
**Decision**: We stream progress from the backend to the frontend using SSE instead of WebSockets.
**Rationale**: SSE is natively supported by browsers (via `EventSource` or streaming `fetch`), fits perfectly with LangGraph's update streaming, and is simpler to scale than WebSockets since it's unidirectional (server -> client).

## 3. Decorator-based LLM Fallbacks
**Decision**: We built a custom `@resilient_multi_provider` decorator.
**Rationale**: Relying on a single LLM provider (like Groq or Mistral) can lead to failures due to rate limiting or temporary outages. The decorator allows every node to transparently failover to a different provider without littering business logic with `try/except` blocks.

## 4. Removal of Email Notifications
**Decision**: We removed the SMTP/Mailercloud email notification system for completed analyses.
**Rationale**: Provider constraints and sender-identity verification complexities caused unreliability. Instead of forcing users to rely on email, the app focuses on an immediate, real-time in-browser experience.

## 5. File Upload & Auto-Extraction
**Decision**: Added support for `.pdf` and `.docx` uploads that pre-fill the analysis form.
**Rationale**: Users do not want to manually copy-paste massive blocks of text from their manuscripts. By parsing the document directly and using a lightweight LLM (`pypdf` + `python-docx` + `FAST_PROVIDERS`), we dramatically improve the UX and accessibility of the platform.

## 6. Frontend Testing Framework
**Decision**: Adopted Vitest and React Testing Library instead of Jest.
**Rationale**: Since the project uses Vite for its build tool, Vitest integrates seamlessly with the existing configuration, offering significantly faster startup times and out-of-the-box TypeScript support compared to Jest.
