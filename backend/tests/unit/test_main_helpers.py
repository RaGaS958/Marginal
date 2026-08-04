"""
Unit tests for main.py's small helper functions -- rate limiting and SSE
formatting -- tested directly rather than only indirectly through a full
HTTP round trip. GROQ_API_KEY / MISTRAL_API_KEY must be set (even to a
placeholder) before this module is importable, since llm_clients.py
constructs the provider clients at import time -- see conftest.py /
pytest.ini or the README for how the suite sets this.
"""
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from analyzer import main as main_module
from analyzer.main import (
    MAX_CONCURRENT_RUNS,
    _acquire_run_slot,
    _client_ip,
    _release_run_slot,
    _sse,
)


def _make_request(headers: dict | None = None, client_host: str = "1.2.3.4") -> Request:
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
        "client": (client_host, 12345),
    }
    return Request(scope)


# ---------------------------------------------------------------------
# _client_ip
# ---------------------------------------------------------------------

def test_client_ip_uses_x_forwarded_for_when_present():
    request = _make_request(headers={"x-forwarded-for": "9.9.9.9, 10.0.0.1"}, client_host="127.0.0.1")
    assert _client_ip(request) == "9.9.9.9"


def test_client_ip_falls_back_to_request_client_host():
    request = _make_request(client_host="5.5.5.5")
    assert _client_ip(request) == "5.5.5.5"


def test_client_ip_strips_whitespace_from_forwarded_header():
    request = _make_request(headers={"x-forwarded-for": "  9.9.9.9  ,10.0.0.1"})
    assert _client_ip(request) == "9.9.9.9"


# ---------------------------------------------------------------------
# _acquire_run_slot / _release_run_slot
# ---------------------------------------------------------------------

async def test_acquire_run_slot_succeeds_for_a_fresh_ip():
    await _acquire_run_slot("10.0.0.1")
    assert main_module._active_runs == 1


async def test_acquire_run_slot_rejects_repeat_request_within_cooldown():
    await _acquire_run_slot("10.0.0.2")
    with pytest.raises(HTTPException) as exc_info:
        await _acquire_run_slot("10.0.0.2")
    assert exc_info.value.status_code == 429


async def test_acquire_run_slot_allows_different_ips_independently():
    await _acquire_run_slot("10.0.0.3")
    await _acquire_run_slot("10.0.0.4")  # a different IP -- should not be cooled down
    assert main_module._active_runs == 2


async def test_acquire_run_slot_rejects_when_at_concurrency_cap():
    for i in range(MAX_CONCURRENT_RUNS):
        await _acquire_run_slot(f"10.1.0.{i}")

    with pytest.raises(HTTPException) as exc_info:
        await _acquire_run_slot("10.1.0.999")
    assert exc_info.value.status_code == 503


async def test_release_run_slot_decrements_active_count():
    await _acquire_run_slot("10.0.0.5")
    assert main_module._active_runs == 1
    await _release_run_slot()
    assert main_module._active_runs == 0


async def test_release_run_slot_never_goes_negative():
    assert main_module._active_runs == 0
    await _release_run_slot()
    await _release_run_slot()
    assert main_module._active_runs == 0


# ---------------------------------------------------------------------
# _sse
# ---------------------------------------------------------------------

def test_sse_formats_with_data_prefix_and_double_newline():
    formatted = _sse({"type": "progress", "node": "detect_research_domain"})
    assert formatted.startswith("data: ")
    assert formatted.endswith("\n\n")


def test_sse_payload_round_trips_through_json():
    import json
    payload = {"type": "result", "request_id": "abc-123", "final_report": "# Report\n\nBody"}
    formatted = _sse(payload)
    raw = formatted[len("data: "):-2]  # strip "data: " prefix and trailing "\n\n"
    assert json.loads(raw) == payload
