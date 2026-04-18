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
