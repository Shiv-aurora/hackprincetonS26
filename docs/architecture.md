# Architecture

This document describes the end-to-end data flow of the product build. It covers
three layers — the research pipeline (already implemented, not modified in the
product build), the FastAPI backend (scaffolded in Step 2), and the Vite +
React frontend (moved into the tree in Step 0). It also explains the
Anthropic-primary / Gemini-optional model selector, which is the reason the
FRONTEND's `@google/genai` dependency is retained.

## Layer 1 — Research pipeline (`src/ngsp/`, `src/attacks/`, `src/data/`)

The research pipeline is **unchanged** in the product build. All changes to the
scientific core were finalized on `research-shiv` and merged to `main` before
this branch was cut. The pieces relevant to the product are:

- `src/ngsp/safe_harbor.py` — deterministic regex stripper for the 18 HIPAA
  identifiers. Returns `(stripped_text, spans, entity_map)`.
- `src/ngsp/entity_extractor.py` — neural extractor for quasi-identifiers and
  MNPI spans (`compound_code`, `site_id`, `dose`, `indication`, `ae_grade`,
  `timing`, `efficacy_value`, `amendment_rationale`, `regulatory_question`,
  `interim_result`).
- `src/ngsp/router.py` — classifies the stripped input into one of three paths:
  `abstract_extractable`, `dp_tolerant`, `local_only`.
- `src/ngsp/query_synthesizer.py` — generates a self-contained abstract query
  for `abstract_extractable` documents.
- `src/ngsp/dp_mechanism.py` — L2-clipped Gaussian noise with a Rényi-DP
  accountant; used by `dp_tolerant`.
- `src/ngsp/proxy_decoder.py` — noisy-hidden-state → paraphrase with
  quasi-identifier placeholder substitution pre-pass.
- `src/ngsp/remote_client.py` — thin Anthropic SDK wrapper with a `mock_mode`
  path (canned response when `ANTHROPIC_API_KEY=sk-ant-mock`).
- `src/ngsp/pipeline.py` — top-level orchestration the backend will call.

The backend imports from this layer. It does **not** reimplement any of it.

## Layer 2 — FastAPI backend (`backend/`)

Scaffolded in Step 2. The backend is a thin adapter: it exposes REST endpoints
that the frontend calls, and each endpoint delegates to the research pipeline.
Planned endpoints (per FINALIZE_PLAN.md):

- `POST /api/analyze` — strip + extract, returns tier-labeled entities.
- `POST /api/proxy` — full strip + substitute, returns original, proxy,
  `entity_map`, and `position_mapping`.
- `POST /api/route` — routing decision + rationale.
- `POST /api/complete` — model selector (`claude-opus-4 | gpt-5 | gemini-2`)
  that calls the remote provider with the proxy text. The backend owns the
  Anthropic key via `.env`; Gemini calls may be proxied through here or
  performed directly from the browser via `@google/genai` (see model-selector
  note below).
- `GET /api/health` — liveness probe.

`BACKEND_PORT` (default `8000`) is read from the repo-root `.env`. Uvicorn
binds to `0.0.0.0:$BACKEND_PORT`. CORS will allow the Vite dev server at
`http://localhost:3000`.

## Layer 3 — Frontend (`frontend/`, Vite + React + TS + Tailwind v4)

The live UI replaces the static `docs/stitch-mockup.html` that FINALIZE_PLAN
originally assumed. Stack and structure:

- `package.json` — Vite 6, React 19, TypeScript 5.8, Tailwind v4, Lucide
  icons, Motion for animations, `@google/genai` for the optional Gemini path,
  `dotenv` + `tsx` (kept for any node-side helpers the submission might ship).
  `express` and `@types/express` were in the original FRONTEND drop but are
  unused — they were removed in Step 1.
- `src/App.tsx` — assembles the three-pane layout.
- `src/components/TitleBar.tsx` — app chrome.
- `src/components/ActivityBar.tsx` — left rail.
- `src/components/SideBar.tsx` — document list / navigation.
- `src/components/Workspace.tsx` — main editor pane where the SAE narrative
  from `docs/demo-document.md` will be pasted; renders tier-colored highlights
  (PHI red / IP amber / MNPI violet) once wired to `/api/analyze`.
- `src/components/AssistantPanel.tsx` — right rail, shows the proxy text,
  routing decision, and the remote model's response.
- `src/components/StatusBar.tsx` — bottom bar (ε spent, path chosen, mock mode
  indicator).

`VITE_API_URL` is read at build time via `import.meta.env.VITE_API_URL` and
drives every `fetch` against the FastAPI backend.

## Model selector — Anthropic primary, Gemini optional

The `/api/complete` endpoint accepts a `model` field. Claude (Anthropic) is
the primary provider: it runs in `mock_mode` offline for the demo, or against
the real API when `ANTHROPIC_API_KEY` is set to a live key. Gemini is retained
as a secondary option because the FRONTEND drop already included
`@google/genai` and a `GEMINI_API_KEY` slot. When the frontend chooses
`gemini-2` it may call Gemini directly from the browser (using the
browser-safe genai SDK) or route through `/api/complete`. Neither path is
required for the pitch — Anthropic mock-mode suffices — but leaving the
optional path in place costs nothing and broadens the demo.

Hard rule: all other sensitive work (strip, extract, route, DP noise, proxy
decode) stays **local**. Only the final proxy text ever leaves the machine.

## Data flow

```
+---------------------+                +--------------------+                +-------------------------+
|   Vite frontend     |   fetch JSON   |   FastAPI backend  |   function    |   Research pipeline     |
|  (frontend/, :3000) | -------------> |  (backend/, :8000) | call --------> |  (src/ngsp/*)           |
|                     |                |                    |                |  Safe Harbor strip      |
|  paste SAE          |                |  /api/analyze ----------> strip + extract -> tier-labeled    |
|  narrative          | <------------- |  200 OK (entities) | <------------- |  spans                  |
|                     |                |                    |                |                         |
|  click "Sanitize"   |                |  /api/proxy ------------> strip + substitute + decode_proxy |
|                     | <------------- |  200 OK            | <------------- |  original, proxy,       |
|                     |                |                    |                |  entity_map, mapping    |
|                     |                |                    |                |                         |
|  click "Route"      |                |  /api/route ------------> router.classify ---------------->   |
|                     | <------------- |  200 OK (path)     | <------------- |  abstract / dp / local  |
|                     |                |                    |                |                         |
|  click "Ask Claude" |                |  /api/complete ---------> remote_client.complete ---------->  |
|                     |                |   if model=claude-* ------> Anthropic (or mock_mode canned)   |
|                     |                |   if model=gemini-2 ------> Gemini (optional; may also be     |
|                     |                |                              called directly from browser)    |
|                     | <------------- |  200 OK (answer)   | <------------- |                         |
+---------------------+                +--------------------+                +-------------------------+
          |                                                                            |
          v                                                                            v
  [ all raw PHI/IP/MNPI                                                       [ ε accountant ticks;   ]
    stays in the browser                                                      [ session budget in     ]
    and in the FastAPI                                                        [ audit log             ]
    process; only the                                                         [                       ]
    proxy text is sent                                                        [ no raw input logged   ]
    to a remote LLM ]
```

## Why it is split this way

- **Research code stays pure.** The `src/ngsp/*` modules have no HTTP
  dependencies and are covered by the `pytest -q` suite (57 passed, 3
  skipped). The backend is a thin wrapper so that test suite remains the
  source of truth for privacy correctness.
- **Frontend is decoupled.** Vite can be replaced or embedded (e.g. a
  Cloudflare Worker serving a static build) without touching the research
  code, because the only coupling is `VITE_API_URL` + JSON over HTTP.
- **Model selector is an adapter in the backend.** The frontend does not know
  which provider is live; it only knows which model string to request. This
  keeps the Anthropic key on the server and keeps the research layer
  provider-agnostic.
