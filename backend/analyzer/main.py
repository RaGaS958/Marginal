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

PERSISTENCE: this ships with LangGraph's InMemorySaver, matching the
documented dev default -- it loses every run on restart. That's a known,
explicitly-flagged gap (see the Backend Schema doc's Postgres migration
design), not an oversight; swap `InMemorySaver()` for an `AsyncPostgresSaver`
instance before this runs anywhere persistent.

RATE LIMITING: per-IP cooldown + a global concurrency cap, both in-process.
This only works correctly with exactly one backend process. See the
Implementation Plan's Phase 1a for the Redis-backed replacement required
before running more than one instance.
"""
from __future__ import annotations

import asyncio
import json
import time
from collections import defaultdict
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import logging

logger = logging.getLogger(__name__)
from fastapi.responses import StreamingResponse
from langgraph.checkpoint.memory import InMemorySaver
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

COOLDOWN_SECONDS = 5.0
MAX_CONCURRENT_RUNS = 20

_last_request_at: dict[str, float] = defaultdict(float)
_active_runs = 0
_active_runs_lock = asyncio.Lock()


def send_notification_email(email: str, request_id: str, title: str, novelty_score: str | float | None):
    smtp_server = os.getenv("SMTP_SERVER")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")

    subject = f"Your Marginal Analysis is Complete!"
    body = f"""
    <html>
    <body>
        <h2>Your analysis for "{title}" is finished.</h2>
        <p><strong>Novelty Score:</strong> {novelty_score}/10</p>
        <p>View your full report in your Marginal dashboard!</p>
    </body>
    </html>
    """

    if not all([smtp_server, smtp_user, smtp_password]):
        print(f"\n--- MOCK EMAIL DISPATCH TO {email} ---\nSubject: {subject}\n{body}\n-----------------------------------\n")
        return True, "Mock email dispatched"

    try:
        msg = MIMEMultipart()
        msg['From'] = smtp_user
        msg['To'] = email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'html'))
        
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
            
        print(f"Successfully sent email notification to {email}")
        return True, "Email sent successfully"
    except Exception as e:
        logger.error(f"Failed to send email to {email}: {e}")
        return False, str(e)


class AnalyzeRequest(BaseModel):
    title: str = Field(..., max_length=300)
    abstract: str = Field(..., max_length=4000)
    workflow: str = Field(default="", max_length=2000)
    request_id: str | None = Field(
        default=None,
        description=(
            "Optional client-generated ID. If supplied, becomes the canonical "
            "request/thread ID, so a later GET for a saved or revisited URL "
            "resolves to this run instead of 404ing."
        ),
    )
    user_email: str | None = Field(default=None)
    notify_on_completion: bool = Field(default=False)

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
    # See module docstring -- swap for AsyncPostgresSaver in production.
    app.state.checkpointer = InMemorySaver()
    app.state.graph = build_graph().compile(checkpointer=app.state.checkpointer)
    try:
        yield
    finally:
        await app.state.http_client.aclose()


app = FastAPI(title="Marginal analysis API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to the deployed frontend origin before shipping
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
        },
        "errors": values.get("errors", []),
    }


@app.post("/analyze")
async def analyze(payload: AnalyzeRequest, request: Request, background_tasks: BackgroundTasks):
    await _acquire_run_slot(_client_ip(request))

    initial_state = build_initial_state(
        title=payload.title.strip(),
        abstract=payload.abstract.strip(),
        workflow=payload.workflow.strip(),
        request_id=payload.request_id,
    )
    config = {
        "configurable": {
            "thread_id": initial_state["request_id"],
            "checkpoint_ns": "",
            "http_client": request.app.state.http_client,
        }
    }

    async def event_stream():
        released = False
        try:
            async for update in request.app.state.graph.astream(initial_state, config, stream_mode="updates"):
                for node_name in update:
                    yield _sse({"type": "progress", "node": node_name})

            final_state = await request.app.state.graph.aget_state(config)
            result_payload = _build_analysis_payload(initial_state["request_id"], final_state.values)
            
            yield _sse({"type": "result", **result_payload})
            
            if payload.notify_on_completion and payload.user_email:
                try:
                    success, msg = await asyncio.to_thread(
                        send_notification_email,
                        payload.user_email,
                        initial_state["request_id"],
                        payload.title,
                        result_payload.get("novelty_score")
                    )
                    yield _sse({
                        "type": "email_notification", 
                        "success": success, 
                        "message": msg, 
                        "email": payload.user_email
                    })
                except Exception as e:
                    yield _sse({
                        "type": "email_notification", 
                        "success": False, 
                        "message": str(e), 
                        "email": payload.user_email
                    })
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
