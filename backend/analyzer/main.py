"""
FastAPI application: exposes the novelty-analysis pipeline over HTTP.

Endpoints:
  POST /analyze              -- runs a fresh analysis, streamed as SSE
  GET  /analyze/{request_id} -- re-fetches a completed (or in-progress) analysis
  GET  /health                -- liveness check

One shared httpx.AsyncClient and one compiled graph are created once at
process startup (see `lifespan` below) and reused across requests -- this
avoids per-request connection-pool churn and is what makes the literature
layer trivially mockable in tests (inject a fake client, or monkeypatch
`nodes.literature_search_impl` directly, as test_smoke.py does).

PERSISTENCE: when DATABASE_URL is set in the environment the app uses
`AsyncPostgresSaver` (backed by Supabase or any Postgres-compatible host)
so every run is persisted across restarts and the GET /analyze/{request_id}
endpoint works indefinitely.  When DATABASE_URL is absent (local dev without
a DB) we fall back to `InMemorySaver` and log a warning -- no crashes, but
runs are lost on restart, matching the previous behaviour.

RATE LIMITING: per-IP cooldown + a global concurrency cap, both in-process.
This only works correctly with exactly one backend process. For multi-instance
deployments replace with a Redis-backed implementation.
"""
from __future__ import annotations

import sys
import asyncio

if sys.platform == "win32":
    # psycopg3 requires SelectorEventLoop on Windows.
    # We set this at module import time so Uvicorn picks it up locally.
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import itertools
import json
import time
from collections import defaultdict
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import os
import logging

logger = logging.getLogger(__name__)
from fastapi.responses import StreamingResponse
from langchain_core.tracers import LangChainTracer
from langgraph.checkpoint.memory import InMemorySaver
try:
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    _POSTGRES_AVAILABLE = True
except ImportError:
    _POSTGRES_AVAILABLE = False
from pydantic import BaseModel, Field, field_validator

# MUST run before `from .graph import build_graph` below: that import chain
# (graph -> nodes -> llm_clients) constructs ChatGroq/ChatMistralAI at
# MODULE IMPORT TIME, and both read their API keys from the process
# environment right then. Nothing else in this codebase loaded `.env`
# automatically -- `cp .env.example .env` alone did nothing, since neither
# a bare `uvicorn analyzer.main:app` nor Python itself reads a `.env` file
# on its own. Confirmed the failure mode directly: without this call (and
# without GROQ_API_KEY/MISTRAL_API_KEY otherwise exported), importing this
# module raises `groq.GroqError` before uvicorn ever binds the port, which
# looks like a frontend/backend connection problem but is actually the
# backend never starting at all. `load_dotenv()` is a no-op if the vars are
# already set in the real environment (e.g. in production), so this is
# safe everywhere.
load_dotenv()

from .graph import build_graph
from .state import build_initial_state
from .extractor import extract_paper_details

COOLDOWN_SECONDS = 5.0
MAX_CONCURRENT_RUNS = 20

_last_request_at: dict[str, float] = defaultdict(float)
_active_runs = 0
_active_runs_lock = asyncio.Lock()

# Monotonically-increasing counter: gives every analysis run a unique
# LangSmith project name (Marginal_RUN_0, Marginal_RUN_1, …) so each
# run is isolated in its own project and easy to compare side-by-side.
_run_counter = itertools.count(0)


class AnalyzeRequest(BaseModel):
    title: str = Field(..., max_length=300)
    abstract: str = Field(..., max_length=4000)
    workflow: str = Field(default="", max_length=5000)
    conclusion: str = Field(default="", max_length=4000)
    request_id: str | None = Field(
        default=None,
        description=(
            "Optional client-generated ID. If supplied, becomes the canonical "
            "request/thread ID, so a later GET for a saved or revisited URL "
            "resolves to this run instead of 404ing."
        ),
    )
    user_email: str | None = Field(default=None)

    @field_validator("title")
    @classmethod
    def _title_length(cls, v: str) -> str:
        if len(v.strip()) <= 3:
            raise ValueError("title must be longer than 3 characters")
        return v

    @field_validator("abstract")
    @classmethod
    def _abstract_length(cls, v: str) -> str:
        if len(v.strip()) < 40:
            raise ValueError("abstract must be at least 40 characters")
        return v


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http_client = httpx.AsyncClient()

    database_url = os.getenv("DATABASE_URL", "").strip()

    if database_url and _POSTGRES_AVAILABLE:
        logger.info("DATABASE_URL found — using AsyncPostgresSaver (Postgres/Supabase).")
        # AsyncPostgresSaver.from_conn_string() sets up an async connection pool
        # and automatically creates the LangGraph checkpoint tables on first run.
        async with AsyncPostgresSaver.from_conn_string(database_url) as checkpointer:
            await checkpointer.setup()  # idempotent: creates tables if they don't exist
            app.state.checkpointer = checkpointer
            app.state.graph = build_graph().compile(checkpointer=checkpointer)
            try:
                yield
            finally:
                await app.state.http_client.aclose()
    else:
        if not database_url:
            logger.warning(
                "DATABASE_URL is not set. Using InMemorySaver — analysis runs will be "
                "lost on restart. Add DATABASE_URL to your .env to enable persistence."
            )
        elif not _POSTGRES_AVAILABLE:
            logger.warning(
                "langgraph-checkpoint-postgres is not installed. "
                "Falling back to InMemorySaver."
            )
        app.state.checkpointer = InMemorySaver()
        app.state.graph = build_graph().compile(checkpointer=app.state.checkpointer)
        try:
            yield
        finally:
            await app.state.http_client.aclose()


app = FastAPI(title="Marginal analysis API", lifespan=lifespan)

# ALLOWED_ORIGINS: comma-separated list of permitted front-end origins.
# In production set this to your Vercel URL, e.g.:
#   https://marginal.vercel.app,https://www.yourdomain.com
# Leave unset (or set to "*") for local development.
_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
_allow_origins: list[str] = (
    [o.strip() for o in _raw_origins.split(",") if o.strip()]
    if _raw_origins != "*"
    else ["*"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=_raw_origins != "*",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _acquire_run_slot(ip: str) -> None:
    now = time.monotonic()
    if now - _last_request_at[ip] < COOLDOWN_SECONDS:
        raise HTTPException(status_code=429, detail="Too many requests -- please wait a few seconds and try again.")
    _last_request_at[ip] = now

    global _active_runs
    async with _active_runs_lock:
        if _active_runs >= MAX_CONCURRENT_RUNS:
            raise HTTPException(status_code=503, detail="The analyzer is at capacity -- please try again shortly.")
        _active_runs += 1


async def _release_run_slot() -> None:
    global _active_runs
    async with _active_runs_lock:
        _active_runs = max(0, _active_runs - 1)


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _build_analysis_payload(request_id: str, values: dict) -> dict:
    """
    Shared shape for both the SSE `result` event and the `GET` endpoint.

    The markdown report has always contained this information as
    formatted text, but nothing in the API exposed it as structured data
    -- which meant SimilarityConstellation and PaperCard (both already
    written on the frontend) had no real data to render, only a report
    string with no principled way to parse it back apart, and the
    reviewer's strengths/weaknesses could only be read as prose, not
    rendered as the separate lists the UI actually shows. This exposes
    the same fields the formatter node already has in `state` directly,
    so the frontend renders real data instead of re-deriving it from
    prose or showing placeholder text.
    """
    final_report = values.get("final_report", "")
    status = "completed" if final_report else "running"

    def _dimension(key: str) -> dict:
        return {
            "score": values.get(f"{key}_similarity"),
            "rationale": values.get(f"{key}_similarity_rationale"),
        }

    return {
        "request_id": request_id,
        "status": status,
        "final_report": final_report or None,
        "novelty_score": values.get("novelty_score"),
        "recommendation": values.get("recommendation") or None,
        "strengths": values.get("strengths", []),
        "weaknesses": values.get("weaknesses", []),
        "reviewer_comments": values.get("reviewer_comments") or None,
        "improvement_suggestions": values.get("improvement_suggestions") or None,
        "similar_papers": values.get("similar_papers", []),
        "similarity_breakdown": {
            "abstract": _dimension("abstract"),
            "methodology": _dimension("methodology"),
            "workflow": _dimension("workflow"),
            "keyword": _dimension("keyword"),
            "conclusion": _dimension("conclusion"),
        },
        "errors": values.get("errors", []),
    }


@app.post("/analyze")
async def analyze(payload: AnalyzeRequest, request: Request, background_tasks: BackgroundTasks):
    await _acquire_run_slot(_client_ip(request))

    # Each run gets its own LangSmith project so traces never mix.
    # Naming: Marginal_RUN_0, Marginal_RUN_1, …
    run_index = next(_run_counter)
    run_project = f"Marginal_RUN_{run_index}"
    tracer = LangChainTracer(project_name=run_project)
    logger.info("Starting run %s (LangSmith project: %s)", run_index, run_project)

    initial_state = build_initial_state(
        title=payload.title.strip(),
        abstract=payload.abstract.strip(),
        workflow=payload.workflow.strip(),
        conclusion=payload.conclusion.strip(),
        request_id=payload.request_id,
    )
    config = {
        "configurable": {
            "thread_id": initial_state["request_id"],
            "checkpoint_ns": "",
            "http_client": request.app.state.http_client,
        },
        # LangChainTracer here means every LLM call and every LangGraph
        # node inside this single run is grouped under run_project.
        "callbacks": [tracer],
    }

    async def event_stream():
        released = False
        try:
            async for update in request.app.state.graph.astream(initial_state, config, stream_mode="updates"):
                for node_name in update:
                    yield _sse({"type": "progress", "node": node_name})

            final_state = await request.app.state.graph.aget_state(config)
            result_payload = _build_analysis_payload(initial_state["request_id"], final_state.values)
            # Surface the LangSmith project name so the frontend / callers
            # can link directly to smith.langchain.com for this run.
            result_payload["langsmith_project"] = run_project
            yield _sse({"type": "result", **result_payload})
        except Exception as exc:
            # Every node guarantees it never raises (see resilience.py) --
            # this guards the FastAPI layer around the graph itself: a bad
            # request shape, a checkpointer outage, that kind of thing.
            yield _sse({"type": "error", "message": str(exc)})
        finally:
            yield "data: [DONE]\n\n"
            if not released:
                await _release_run_slot()
                released = True

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/analyze/{request_id}")
async def get_analysis(request_id: str, request: Request):
    config = {"configurable": {"thread_id": request_id, "checkpoint_ns": ""}}
    state = await request.app.state.graph.aget_state(config)

    if not state.values:
        raise HTTPException(status_code=404, detail="No analysis found for this ID.")

    return _build_analysis_payload(request_id, state.values)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/extract")
async def extract_file(file: UploadFile = File(...)):
    if not file.filename.lower().endswith((".pdf", ".docx")):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported.")
        
    try:
        content = await file.read()
        extracted_data = await extract_paper_details(content, file.filename)
        return extracted_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error extracting file: {e}")
        raise HTTPException(status_code=500, detail="Failed to extract document.")
