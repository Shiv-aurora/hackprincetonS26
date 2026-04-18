# Product Build Changelog

Per `CLAUDE.md §11`, every product-build change gets a dated entry here. One
section per FINALIZE_PLAN step. The research code (`src/`, `tests/`,
`experiments/`, `paper/`) is frozen on this branch and is not listed here.

---

## 2026-04-18 — Step 0: branch + frontend import

- Confirmed `main` already contains the merged `research-shiv` commits
  (HEAD = `6270322`, merge of PR #1). Branched `product-build` directly from
  `main`.
- Renamed the untracked `FRONTEND/` drop to `frontend/` (lowercase) via a
  two-step `mv` to work around the case-insensitive macOS filesystem.
- Brought `FINALIZE_PLAN.md` under version control on this branch.
- Added `docs/demo-document.md` with the canonical SAE narrative (Subject
  04-0023 / BMS-986253-301 / Amendment 4 / 34% ORR) used for the demo, test
  fixtures, and screen recording.
- Divergence from the written plan: the provided `FRONTEND/` is a live
  Vite 6 + React 19 + TypeScript + Tailwind v4 app, not the static
  `docs/stitch-mockup.html` the plan assumed. The HTML mockup is dropped;
  the live scaffold replaces it and the rest of the plan is adapted
  accordingly.
- Validation: `pytest -q` still reports `57 passed, 3 skipped`.
- Commit: `[step-0] branch product-build off main; import FRONTEND as frontend; add demo-document`.

## 2026-04-18 — Step 1: repo restructuring for product build

- Created empty `backend/` (with `.gitkeep`) and `product-build/` folders.
  `backend/` will be populated in Step 2.
- `pyproject.toml`: added `fastapi>=0.115`, `uvicorn[standard]>=0.30`, and
  `httpx>=0.27` to `dependencies`.
- Root `.env.example`: added `BACKEND_PORT=8000` and
  `VITE_API_URL=http://localhost:8000`.
- `frontend/.env.example`: rewritten to keep the optional
  `GEMINI_API_KEY` slot and add `VITE_API_URL`. Dropped the AI-Studio-specific
  `APP_URL`.
- `frontend/package.json`: removed unused `express` and `@types/express`
  dependencies. `npm install` resolves cleanly (133 packages, 0
  vulnerabilities). The node 18 → node 20+ engine warnings are cosmetic and
  will be addressed when we pin a node version for the final submission.
- `docs/architecture.md`: one-page prose + ASCII diagram covering the
  research pipeline, FastAPI backend, Vite frontend, and the
  Anthropic-primary / Gemini-optional model selector.
- `CLAUDE.md`: appended §11 "Product build phase" restating the do-not-touch
  rules, `pytest -q` baseline, CHANGELOG requirement, per-step commit rule,
  secret-scan invariant, stack lock, and model-selector policy.
- `README.md`: rewritten from the old stub into a full overview with
  research-quick-start, product-build-quick-start, and repository map.
- `.gitignore`: added `node_modules/`, `frontend/dist/`, `frontend/.vite/`,
  and `frontend/.env*` (with `!frontend/.env.example` allow rule).
- `FINALIZE_PLAN.md`: Steps 0 and 1 marked DONE with status + date lines.
- Validation:
  - `pytest -q` → `57 passed, 3 skipped`.
  - `cd frontend && npm install` → 133 packages, no errors.
  - CI secret-scan regex (`sk-ant-[a-zA-Z0-9]{20}|hf_[a-zA-Z0-9]{30}|sk-proj-[a-zA-Z0-9]{20}|AKIA[A-Z0-9]{16}`) → zero matches on tracked files.
- Commit: `[step-1] restructure repo for product build (backend/docs/product-build folders, deps, env, docs, CHANGELOG)`.

## 2026-04-18 — Step 2: FastAPI backend scaffold

- `backend/__init__.py`: package marker.
- `backend/schemas.py`: Pydantic models for all five endpoints — AnalyzeRequest/Response,
  ProxyRequest/Response (with PositionMapping), RouteRequest/Response,
  CompleteRequest/Response, AuditLogEntry/Response, HealthResponse.
- `backend/main.py`: FastAPI app with CORS (localhost:3000/5173/4173),
  six endpoints — `GET /api/health`, `POST /api/analyze`, `POST /api/proxy`,
  `POST /api/route`, `POST /api/complete`, `GET /api/audit`.
  Detection uses regex Safe Harbor layer (`extract_regex_spans`) plus 15
  clinical-trial-specific patterns covering DD-MMM-YYYY dates, subject IDs,
  site names, ages, compound codes, doses, AE grades, study-day timing,
  ORR/efficacy values, DSMB references, protocol amendments. Offline/mock
  mode auto-detected from `ANTHROPIC_API_KEY`; mock path returns a
  dynamically constructed ICH E2B narrative using the actual entity_map
  placeholders, then fully rehydrated. In-memory audit log resets on restart
  (no raw content stored).
- `backend/tests/conftest.py`: shared path setup + DEMO_DOC fixture.
- `backend/tests/test_analyze.py`, `test_proxy.py`, `test_route.py`,
  `test_complete.py`, `test_audit.py`: 27 pytest tests covering all endpoints.
- `frontend/tsconfig.json`: added `"types": ["vite/client"]` so
  `import.meta.env` is typed correctly.
- Validation:
  - `pytest backend/tests -q` → `27 passed`.
  - `pytest -q` (research suite) → `57 passed, 3 skipped` (unchanged).
  - `curl http://localhost:8000/api/health` → `{"status":"ok","mock_mode":true,...}`.
  - Demo document: 20 entities detected (6 PHI, 9 IP, 5 MNPI); routes to
    `dp_tolerant`; proxy contains zero raw identifiers; rehydrated response
    has zero unrehydrated tokens.
- Commit: `[step-2] backend scaffold (FastAPI, schemas, 5 endpoints, 27 tests)`.

## 2026-04-18 — Step 3: frontend wired to backend

- `frontend/src/lib/api.ts`: typed API client using native `fetch` for all
  five backend endpoints (`analyzeDocument`, `proxyDocument`, `routeDocument`,
  `completeRequest`, `fetchAudit`, `checkHealth`). Base URL from
  `VITE_API_URL` env var with `http://localhost:8000` fallback.
- `frontend/src/lib/demoDocument.ts`: `DEMO_DOCUMENT` constant (the canonical
  SAE narrative) and `DEMO_PROMPT` ("Rewrite this in ICH E2B format.") for
  pre-fill on load.
- `frontend/src/App.tsx`: loads entity analysis and proxy on mount via
  `Promise.all([analyzeDocument, proxyDocument])`; polls `/api/audit` every
  5 s; owns `hoveredPlaceholder` shared hover state; shows a backend-error
  banner if the server is unreachable; passes data down to `Workspace` and
  `AssistantPanel`.
- `frontend/src/components/Workspace.tsx`: replaced hardcoded text with
  dynamic rendering. Document pane renders original text with colored
  underlines per tier (phi=`text-phi`, ip=`text-ip`, mnpi=`text-mnpi`).
  Proxy pane renders placeholder tokens as styled badges. Hovering an entity
  in either pane activates synchronized highlight via `hoveredPlaceholder`.
  Tooltip on hover shows subcategory and tier.
- `frontend/src/components/AssistantPanel.tsx`: full message-state chat UI.
  Sends to `/api/complete` on Send button or ⌘↵. Pre-filled with
  `DEMO_PROMPT`. Shows routing badge (Abstract/DP/Local) and entity count
  on each assistant response. Loading spinner while in flight. Backend-error
  state shown inline.
- `frontend/src/components/TitleBar.tsx`: added privacy pill — live entity
  tier counts (PHI/IP/MNPI) from loaded document, plus total request count
  from audit stats.
- Validation:
  - `tsc --noEmit` → zero errors.
  - `pytest -q` → `57 passed, 3 skipped` (unchanged).
  - `pytest backend/tests -q` → `27 passed` (unchanged).
- Commit: `[step-3] frontend wired to backend (api client, dynamic workspace, chat, privacy pill)`.
