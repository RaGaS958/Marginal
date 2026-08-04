"""
Regression guard for the "stuck on Analysis" root cause found in audit:
ChatGroq/ChatMistralAI were constructed with no explicit timeout, which
(for ChatGroq specifically) does NOT fall back to a sane SDK default --
an explicit Python `None` is forwarded straight through langchain-groq's
`request_timeout` field into the `groq` SDK, which only substitutes its
own DEFAULT_TIMEOUT when the `timeout` kwarg is omitted entirely (checked
via an internal "was anything given?" sentinel, not `is None`). An
explicit `None` counts as "given", so it reached httpx as
`timeout=None` -- httpx's documented way to say "wait forever".

This is exactly the kind of thing the project's own pre-existing test
suite could NOT have caught: every test in this suite talks to a FakeLLM
double (see conftest.py), never a real ChatGroq/ChatMistralAI instance,
so 100% line coverage of the retry/fallback *logic* said nothing about
whether the *configuration* passed to the real clients was safe. These
tests import the real classes from llm_clients.py specifically to close
that gap -- if someone removes `timeout=`/`max_retries=` from a client
constructor in the future (e.g. while adding a new provider or bumping a
model string), this fails immediately instead of only showing up as an
81-second stall discovered by a person.
"""
from analyzer import llm_clients

ALL_GROQ_CLIENTS = {
    "GROQ_FAST": llm_clients.GROQ_FAST,
    "GROQ_CORE": llm_clients.GROQ_CORE,
}
ALL_MISTRAL_CLIENTS = {
    "MISTRAL_FAST": llm_clients.MISTRAL_FAST,
    "MISTRAL_CORE": llm_clients.MISTRAL_CORE,
}


def test_every_groq_client_has_a_real_finite_timeout():
    for name, client in ALL_GROQ_CLIENTS.items():
        timeout = client.request_timeout
        assert timeout is not None, (
            f"{name}: request_timeout is None -- this is NOT 'use the SDK default', "
            f"it is forwarded verbatim into the groq SDK and becomes "
            f"httpx.Client(timeout=None), i.e. no timeout at all. See this "
            f"module's docstring."
        )
        assert isinstance(timeout, (int, float)) and timeout > 0
        assert timeout <= 60, (
            f"{name}: timeout of {timeout}s is unusually high for an interactive "
            f"analysis pipeline -- confirm this is intentional, not a copy-paste "
            f"of a batch-job value"
        )


def test_every_mistral_client_has_a_real_finite_timeout():
    for name, client in ALL_MISTRAL_CLIENTS.items():
        timeout = client.timeout
        assert timeout is not None
        assert isinstance(timeout, (int, float)) and timeout > 0
        assert timeout <= 60, f"{name}: timeout of {timeout}s is unusually high"


def test_no_llm_client_relies_on_its_sdk_internal_retry_loop():
    """
    ChatGroq defaults to max_retries=2, ChatMistralAI defaults to
    max_retries=5 (with exponential backoff) -- both internal to the SDK,
    both invisible to and stacking underneath resilience.py's own
    attempts_per_provider retry loop. resilient_multi_provider is meant to
    be the single place that owns retry/backoff decisions; every client
    must opt out of its own inner loop so that contract actually holds.
    """
    for name, client in {**ALL_GROQ_CLIENTS, **ALL_MISTRAL_CLIENTS}.items():
        assert client.max_retries == 0, (
            f"{name}: max_retries={client.max_retries}, expected 0. A nonzero value "
            f"here means a single unreachable provider retries internally on top of "
            f"resilience.py's own retries, multiplying worst-case latency in a way "
            f"that's invisible to and untunable from the resilience layer."
        )
