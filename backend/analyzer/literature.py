"""
Literature retrieval: queries multiple free academic APIs, merges,
deduplicates, and ranks the results.

Source strategy:
  - Semantic Scholar + OpenAlex are queried concurrently as the primary
    pair -- different indexes and different coverage gaps, worth paying
    for both round trips rather than picking one.
  - arXiv is added only when the detected research domain looks
    CS/ML-adjacent -- querying it for e.g. a biology paper spends a
    request on a corpus unlikely to return anything relevant.
  - CrossRef is a fallback, queried only if the primary pair returns
    fewer than MIN_RESULTS_BEFORE_FALLBACK papers combined.
  - Results are deduplicated by normalized title (keeping whichever
    duplicate has the higher citation count) and ranked by citation
    count, capped at MAX_PAPERS.

Every source call is wrapped so a single source failing (timeout, auth
error, malformed response) never takes down the whole search -- it just
contributes zero papers and one entry in the returned errors list,
consistent with the graceful-degradation contract the rest of the
pipeline follows. This function itself never raises.

Every source call and the top-level search are instrumented with
@traceable so LangSmith shows the full literature retrieval tree:
  literature_search_impl
    |- semantic_scholar_search (query 1)
    |- semantic_scholar_search (query 2)
    |- openalex_search (query 1)
    |- openalex_search (query 2)
    |- arxiv_search          (CS/ML domains only)
    |- crossref_search       (fallback only)
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import xml.etree.ElementTree as ET

import httpx
from langsmith import traceable

from .rate_limit import SEMANTIC_SCHOLAR_LIMITER

logger = logging.getLogger(__name__)

MAX_PAPERS = 20
MIN_RESULTS_BEFORE_FALLBACK = 3
PER_SOURCE_LIMIT = 15
REQUEST_TIMEOUT = 10.0
MAX_QUERIES_USED = 3  # of the up to 5 generated -- balances recall against latency/request volume

CS_ML_DOMAIN_HINTS = (
    "computer science", "machine learning", "artificial intelligence",
    "deep learning", "natural language processing", "computer vision",
    "robotics", "data mining", "software engineering", "information retrieval",
    "reinforcement learning", "neural network", "nlp", "ml", "ai",
)

_ARXIV_NS = {"atom": "http://www.w3.org/2005/Atom"}


def _looks_cs_ml_adjacent(domain: str) -> bool:
    d = (domain or "").lower()
    return any(hint in d for hint in CS_ML_DOMAIN_HINTS)


def _normalize_title(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (title or "").lower()).strip()


def _source_failure_message(source: str, query: str, exc: BaseException) -> str:
    """Sanitized, user-facing message for a failed literature-source call.
    Same principle as resilience.py's `_user_facing_message` -- log the
    real exception, never put its repr (library names, raw status text) in
    front of an end user -- but worded for a literature database rather
    than an LLM provider, since reusing that helper's "analysis provider"
    phrasing here would be misleading."""
    response = getattr(exc, "response", None)
    status_code = getattr(response, "status_code", None)
    if status_code in (401, 403):
        reason = "requires an API key that isn't configured"
    elif status_code == 409:
        reason = "rejected the request (often a missing or expired API key)"
    elif status_code == 429:
        reason = "rate-limited this search"
    elif isinstance(status_code, int) and status_code >= 500:
        reason = "is temporarily unavailable"
    elif isinstance(exc, httpx.HTTPError):
        reason = "could not be reached"
    else:
        reason = "returned an unexpected response"
    logger.warning("literature_search: %s failed for %r: %r", source, query, exc)
    return f"{source}: {reason}. Results from this source were skipped."


@traceable(
    name="semantic_scholar_search",
    run_type="retriever",
    tags=["literature", "semantic_scholar"],
)
async def _search_semantic_scholar(client: httpx.AsyncClient, query: str) -> tuple[list[dict], str | None]:
    headers = {}
    key = os.environ.get("SEMANTIC_SCHOLAR_KEY")
    if key:
        headers["x-api-key"] = key

    max_retries = 2
    for attempt in range(max_retries + 1):
        try:
            # Semantic Scholar's stated limit is 1 req/sec, cumulative across
            # every endpoint. literature_search_impl fires several of these
            # concurrently via asyncio.gather -- acquire() here is what keeps
            # that from becoming a burst of simultaneous requests; the
            # TokenBucket's internal lock serializes concurrent callers
            # correctly rather than letting them all through at once.
            await SEMANTIC_SCHOLAR_LIMITER.acquire()
            resp = await client.get(
                "https://api.semanticscholar.org/graph/v1/paper/search",
                params={
                    "query": query,
                    "limit": PER_SOURCE_LIMIT,
                    "fields": "title,year,authors,citationCount,externalIds,url",
                },
                headers=headers,
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            papers = [
                {
                    "title": p.get("title") or "",
                    "authors": [a.get("name", "") for a in (p.get("authors") or [])],
                    "year": p.get("year"),
                    "source": "semantic_scholar",
                    "citation_count": p.get("citationCount"),
                    "url": p.get("url"),
                }
                for p in data.get("data", []) or []
                if p.get("title")
            ]
            return papers, None
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429 and attempt < max_retries:
                wait = 2 ** (attempt + 1)  # 2s, 4s
                logger.info("semantic_scholar: 429 on attempt %d, retrying in %ds", attempt + 1, wait)
                await asyncio.sleep(wait)
                continue
            return [], _source_failure_message("semantic_scholar", query, exc)
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            return [], _source_failure_message("semantic_scholar", query, exc)
    return [], None  # unreachable, but keeps type checkers happy


@traceable(
    name="openalex_search",
    run_type="retriever",
    tags=["literature", "openalex"],
)
async def _search_openalex(client: httpx.AsyncClient, query: str) -> tuple[list[dict], str | None]:
    key = os.environ.get("OPENALEX_API_KEY")
    if not key:
        # OpenAlex has required an API key on every request since Feb 13,
        # 2026 (per their published changelog) -- unauthenticated calls
        # burn a small daily trial-credit allowance and then get a 409.
        # Skipping the call entirely when the key is missing avoids a
        # guaranteed-to-fail network round trip on every single analysis
        # run and gives a specific, actionable message instead of the
        # generic one a 409 would otherwise produce below.
        logger.warning("literature_search: openalex skipped, OPENALEX_API_KEY is not set")
        return [], "openalex: OPENALEX_API_KEY is not set (required by OpenAlex since Feb 2026). Results from this source were skipped."
    params: dict = {"search": query, "per_page": PER_SOURCE_LIMIT, "api_key": key}
    try:
        resp = await client.get("https://api.openalex.org/works", params=params, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        papers = []
        for w in data.get("results", []) or []:
            authorships = w.get("authorships") or []
            title = w.get("title") or w.get("display_name") or ""
            if not title:
                continue
            papers.append({
                "title": title,
                "authors": [
                    (a.get("author") or {}).get("display_name", "")
                    for a in authorships
                ],
                "year": w.get("publication_year"),
                "source": "openalex",
                "citation_count": w.get("cited_by_count"),
                "url": w.get("id"),
            })
        return papers, None
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        return [], _source_failure_message("openalex", query, exc)


def _parse_arxiv_atom(xml_text: str) -> list[dict]:
    root = ET.fromstring(xml_text)
    papers = []
    for entry in root.findall("atom:entry", _ARXIV_NS):
        title_el = entry.find("atom:title", _ARXIV_NS)
        title = (title_el.text or "").strip().replace("\n", " ") if title_el is not None else ""
        if not title:
            continue
        published = entry.find("atom:published", _ARXIV_NS)
        year = None
        if published is not None and published.text and len(published.text) >= 4:
            try:
                year = int(published.text[:4])
            except ValueError:
                year = None
        authors = [
            (a.findtext("atom:name", default="", namespaces=_ARXIV_NS) or "").strip()
            for a in entry.findall("atom:author", _ARXIV_NS)
        ]
        link_el = entry.find("atom:id", _ARXIV_NS)
        papers.append({
            "title": title,
            "authors": authors,
            "year": year,
            "source": "arxiv",
            "citation_count": None,
            "url": link_el.text if link_el is not None else None,
        })
    return papers


@traceable(
    name="arxiv_search",
    run_type="retriever",
    tags=["literature", "arxiv"],
)
async def _search_arxiv(client: httpx.AsyncClient, query: str) -> tuple[list[dict], str | None]:
    try:
        resp = await client.get(
            "https://export.arxiv.org/api/query",
            params={"search_query": f"all:{query}", "max_results": PER_SOURCE_LIMIT},
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        return _parse_arxiv_atom(resp.text), None
    except (httpx.HTTPError, ET.ParseError) as exc:
        return [], _source_failure_message("arxiv", query, exc)


@traceable(
    name="crossref_search",
    run_type="retriever",
    tags=["literature", "crossref", "fallback"],
)
async def _search_crossref(client: httpx.AsyncClient, query: str) -> tuple[list[dict], str | None]:
    params = {"query": query, "rows": PER_SOURCE_LIMIT}
    contact = os.environ.get("CONTACT_EMAIL")
    headers = {"User-Agent": f"Marginal/1.0 (mailto:{contact})" if contact else "Marginal/1.0"}
    try:
        resp = await client.get(
            "https://api.crossref.org/works", params=params, headers=headers, timeout=REQUEST_TIMEOUT
        )
        resp.raise_for_status()
        data = resp.json()
        papers = []
        for item in data.get("message", {}).get("items", []) or []:
            titles = item.get("title") or []
            if not titles:
                continue
            authors = [
                " ".join(filter(None, [a.get("given"), a.get("family")]))
                for a in (item.get("author") or [])
            ]
            year = None
            date_parts = (item.get("issued") or {}).get("date-parts")
            if date_parts and date_parts[0]:
                year = date_parts[0][0]
            papers.append({
                "title": titles[0],
                "authors": authors,
                "year": year,
                "source": "crossref",
                "citation_count": item.get("is-referenced-by-count"),
                "url": item.get("URL"),
            })
        return papers, None
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        return [], _source_failure_message("crossref", query, exc)


def _dedupe_and_rank(papers: list[dict]) -> list[dict]:
    seen: dict[str, dict] = {}
    for p in papers:
        key = _normalize_title(p.get("title", ""))
        if not key:
            continue
        existing = seen.get(key)
        if existing is None or (p.get("citation_count") or 0) > (existing.get("citation_count") or 0):
            seen[key] = p
    return sorted(seen.values(), key=lambda p: p.get("citation_count") or 0, reverse=True)


def _dedupe_errors(errors: list[str]) -> list[str]:
    """Collapse duplicate error messages (e.g. multiple 'semantic_scholar:
    rate-limited' from concurrent per-query calls) into a single entry."""
    seen: set[str] = set()
    unique: list[str] = []
    for e in errors:
        if e not in seen:
            seen.add(e)
            unique.append(e)
    return unique


@traceable(
    name="literature_search_impl",
    run_type="retriever",
    tags=["literature", "pipeline"],
)
async def literature_search_impl(
    client: httpx.AsyncClient, queries: list[str], research_domain: str
) -> tuple[list[dict], list[str]]:
    """
    Runs the source strategy described in the module docstring.
    Returns (papers, errors). Never raises.
    """
    if not queries:
        return [], []

    errors: list[str] = []
    used_queries = queries[:MAX_QUERIES_USED]
    is_cs_ml = _looks_cs_ml_adjacent(research_domain)

    primary_calls = [
        *(_search_semantic_scholar(client, q) for q in used_queries),
        *(_search_openalex(client, q) for q in used_queries),
    ]
    results = await asyncio.gather(*primary_calls)

    all_papers: list[dict] = []
    for papers, err in results:
        all_papers.extend(papers)
        if err:
            errors.append(err)

    if is_cs_ml:
        arxiv_papers, arxiv_err = await _search_arxiv(client, used_queries[0])
        all_papers.extend(arxiv_papers)
        if arxiv_err:
            errors.append(arxiv_err)

    if len(all_papers) < MIN_RESULTS_BEFORE_FALLBACK:
        crossref_papers, crossref_err = await _search_crossref(client, used_queries[0])
        all_papers.extend(crossref_papers)
        if crossref_err:
            errors.append(crossref_err)

    ranked = _dedupe_and_rank(all_papers)
    final = ranked[:MAX_PAPERS]

    logger.info(
        "literature_search_impl: domain=%r cs_ml=%s queries=%d raw_papers=%d final=%d errors=%d",
        research_domain, is_cs_ml, len(used_queries), len(all_papers), len(final), len(errors),
    )
    return final, _dedupe_errors(errors)
