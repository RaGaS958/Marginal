# Marginal — frontend (wired to the real backend)

This is the AI-Studio-scaffolded frontend, with its five `BACKEND INTEGRATION
POINT` placeholders replaced by real calls to the Marginal analysis backend
(FastAPI + LangGraph), and one real bug found and fixed along the way.

## What changed

| File | What happened |
|---|---|
| `src/lib/api.ts`, `src/lib/types.ts` | **New.** SSE-consuming API client and types matching the backend's exact response shape. |
| `src/vite-env.d.ts` | **New.** Standard Vite client-types reference; needed for `import.meta.env.VITE_API_BASE_URL` to typecheck (wasn't present before). |
| `src/store/history.ts` | **Extended**, not replaced — `AnalysisRequest` gained the real result fields (`recommendation`, `strengths`, `weaknesses`, `similarPapers`, `similarityBreakdown`, `finalReport`, `errors`, `errorMessage`) alongside the existing ones. `History.tsx` needed no changes; it already read reactively from this store. |
| `src/pages/Analyze.tsx` | **Minor.** The submission logic was already correct (stash the pending request, navigate with `?fresh=1`); only the stale placeholder comment describing a different integration approach was replaced with one describing what's actually implemented. |
| `src/pages/Analysis.tsx` | **Rewritten.** Real SSE consumption on a fresh submission, real polling (`GET /analyze/{id}`, using its `status` field) for a revisited or not-yet-finished run, a `failed` state that didn't exist in the render logic before, real per-phase progress instead of a hardcoded animation, and real strengths/weaknesses/recommendation/similar-papers rendering instead of static placeholder text. |
| `.env.example` | Replaced the unused `GEMINI_API_KEY`/`APP_URL` (this app never imports `@google/genai` — confirmed by grep) with `VITE_API_BASE_URL`, which is what actually matters now. |
| `src/pages/Login.tsx`, `src/pages/SignUp.tsx` | **Not wired to anything.** The backend has no auth. Left as UI-only, matching their own `BACKEND INTEGRATION POINT` comments, which I didn't touch. |

## A backend bug found via a live, unmocked test — and fixed

Every one of my backend's 107 tests uses mocked LLM providers. Wiring this
frontend up was the first time anything in this delivery ran the pipeline
against providers that were *actually* unreachable (this sandbox has no
network access to Groq or Mistral) — so I ran the real server as a live
process and sent it a real request rather than trusting the mocks alone.

The result surfaced a real bug: all four similarity-scoring nodes
(`abstract_similarity`, `methodology_similarity`, `workflow_similarity`,
`keyword_similarity`) were reporting their failures as a generic `"node
failed on every provider"` instead of naming which dimension actually
failed. The cause was a closure-timing issue in `nodes.py`'s
`_make_similarity_node`: the line renaming the node (`node.__name__ =
dimension_key`) ran *after* `@resilient_multi_provider` had already
captured the original generic name in its error-message closure, so the
rename never reached the message actually shown to users.

This mattered specifically *because* of this integration — `Analysis.tsx`'s
new degraded-run banner renders `request.errors` directly, so a user would
have seen four unhelpful, indistinguishable "node failed" lines instead of
knowing which parts of the analysis actually degraded. Fixed in
`analyzer/nodes.py`, verified against a second live run (all four dimension
names now appear correctly), and the test that should have caught this the
first time was strengthened — it previously only checked for "at least 5
distinct error prefixes," which four nodes collapsing onto one shared
generic prefix could still satisfy.

See the companion backend delivery's `analyzer/nodes.py` and
`tests/integration/test_graph_pipeline.py` for the fix and the
strengthened regression test.

## Known, disclosed, non-blocking TypeScript issues

`npm run lint` (`tsc --noEmit`) reports two remaining errors, both
pre-existing in the uploaded scaffold, in `MagicBento.tsx` and
`StackingCards.tsx`: TypeScript's checker folds `key` into the props-type
check for a component with a required `children` prop plus several
explicit JSX props, which shouldn't happen (`key` is a special JSX
attribute, not a real prop) and doesn't happen at runtime. This project has
no `@types/react` package — it relies on React 19's own built-in types —
and this looks like a rough edge specific to that combination with
TypeScript 5.8.3. I fixed four other pre-existing errors of a similar
shape (`React.FormEvent`/`React.CSSProperties`/`React.RefObject` used
without an import, in `Login.tsx`, `SignUp.tsx`, and elsewhere in
`MagicBento.tsx`) using the same pattern successfully; a `@ts-expect-error`
attempt at these last two didn't land cleanly on the multi-line JSX and I
chose not to keep fighting a type-checker quirk in decorative,
non-critical components. **Confirmed non-blocking:** `npm run build`
succeeds regardless, since Vite's build uses esbuild for transpilation and
doesn't type-check.

## Setup

```bash
npm install
cp .env.example .env.local   # set VITE_API_BASE_URL if not using the default
npm run dev                    # served on :3000 per this project's own script
```

Run the companion backend (`uvicorn analyzer.main:app --port 8000`) for
anything past the static pages to do something real.

## Verified before delivery

- `npm install` — 0 vulnerabilities.
- `npm run lint` (`tsc --noEmit`) — clean except the two disclosed, non-blocking issues above.
- `npm run build` — succeeds.
- The real backend was started as a live `uvicorn` process (not the mocked test suite) and sent a real `POST /analyze` request against genuinely unreachable LLM providers — confirmed the full 15-node graph executes, degrades gracefully, and produces a complete report end to end, and confirmed the error-message bug fix against that same live path.
- CORS confirmed working for `http://localhost:3000` (this project's actual dev port) against a live backend instance — preflight and real requests both return the expected `access-control-allow-origin` header.

## Still not done (unchanged from the Implementation Plan)

Real-time reconnect to a live SSE stream for a revisited/still-running
analysis (the polling fallback here is deliberate and honest, not a
placeholder for something more automatic) needs the Redis pub/sub work
already scoped in the Implementation Plan. Auth (`Login.tsx`/`SignUp.tsx`)
needs the backend auth work in Implementation Plan Phase 2 before it can be
wired to anything real.
