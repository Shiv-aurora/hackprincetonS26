# NGSP Backend

FastAPI server wrapping the NGSP research pipeline. Exposes REST endpoints consumed by the frontend.

## Prerequisites

Python 3.11+, dependencies installed via `pip install -e .` from the repo root.

## Run

```bash
# from repo root
cp .env.example .env          # set ANTHROPIC_API_KEY (or leave as sk-ant-mock for offline)
uvicorn backend.main:app --reload --port 8000
```

## Endpoints

### Core endpoints

| Method | Path               | Description                                               |
|--------|--------------------|-----------------------------------------------------------|
| GET    | `/api/health`      | Liveness check — returns mock_mode flag                   |
| POST   | `/api/analyze`     | Detect + classify entities (PHI / IP / MNPI)              |
| POST   | `/api/proxy`       | Build proxy text + entity_map + position_mapping          |
| POST   | `/api/route`       | Route a document: abstract_extractable / dp_tolerant / local_only |
| POST   | `/api/complete`    | Full pipeline: proxy → cloud LLM → rehydrate              |
| GET    | `/api/audit`       | Session stats + audit log + ε budget (no raw content)     |
| POST   | `/api/audit/reset` | Clear audit log and reset ε budget                        |

### New endpoints

| Method | Path                       | Description                                               |
|--------|----------------------------|-----------------------------------------------------------|
| POST   | `/api/timeline/assemble`   | Parse SAE narrative into a structured multi-track timeline |
| POST   | `/api/signal/cluster`      | Detect AE clusters in a study window + cloud hypothesis   |
| GET    | `/api/dataset/schema`      | Column schema + row count for synthetic clinical dataset  |
| POST   | `/api/dataset/query`       | Filter, sort, paginate with entity annotations            |
| POST   | `/api/dashboard/generate`  | Generate a chart-grid spec from a natural-language prompt |
| POST   | `/api/mcp/dispatch`        | Route an action to an MCP connector (email/calendar/stubs)|

## Modes

**Offline / mock mode** (default): set `OPENAI_API_KEY=sk-openai-mock` or `NGSP_SKIP_LOCAL_MODEL=1`. All endpoints return deterministic synthetic responses. No network calls.

**Online mode**: set a real `OPENAI_API_KEY`. Calls the OpenAI API via `RemoteClient`.

## Tests

```bash
pytest backend/tests -q       # all tests pass
```

## Curl examples (offline / mock mode)

```bash
# Health check
curl -s http://localhost:8000/api/health | python -m json.tool

# Timeline assembly
curl -s -X POST http://localhost:8000/api/timeline/assemble \
  -H "Content-Type: application/json" \
  -d '{"document": "A 55-year-old male at Site 3 received 50mg on day 1. Grade 3 AE on 15-Jan-2024."}' \
  | python -m json.tool

# Signal cluster detection
curl -s -X POST http://localhost:8000/api/signal/cluster \
  -H "Content-Type: application/json" \
  -d '{"study_id": "STUDY-001", "current_case_id": "CASE-003", "window_days": 30}' \
  | python -m json.tool

# Dataset schema
curl -s http://localhost:8000/api/dataset/schema | python -m json.tool

# Dataset query (paginated)
curl -s -X POST http://localhost:8000/api/dataset/query \
  -H "Content-Type: application/json" \
  -d '{"page_size": 5}' \
  | python -m json.tool

# Dashboard generation
curl -s -X POST http://localhost:8000/api/dashboard/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Show AE grade distribution by site"}' \
  | python -m json.tool

# MCP dispatch — Argus stub (always returns synthetic receipt)
curl -s -X POST http://localhost:8000/api/mcp/dispatch \
  -H "Content-Type: application/json" \
  -d '{"connector": "argus", "action": "file_case", "payload": {"case_id": "CASE-001"}}' \
  | python -m json.tool

# MCP dispatch — email (not_configured without MCP_EMAIL_URL)
curl -s -X POST http://localhost:8000/api/mcp/dispatch \
  -H "Content-Type: application/json" \
  -d '{"connector": "email", "action": "send", "payload": {"to": "monitor@site.org"}}' \
  | python -m json.tool

# Audit log with ε budget
curl -s http://localhost:8000/api/audit | python -m json.tool

# Audit reset
curl -s -X POST http://localhost:8000/api/audit/reset | python -m json.tool
```

## Architecture notes

- All new endpoints pass content through the NGSP pipeline before any cloud call.
- Cloud receives only abstract, anonymised descriptions — never raw document text or entity values.
- Every endpoint writes a hashed audit line to `experiments/results/audit.jsonl`. Raw inputs and outputs are never logged.
- Canary scan is enforced by `RemoteClient` before any outbound traffic.
- The ε budget is process-wide and monotone; `POST /api/audit/reset` creates a fresh budget.

## Entity detection

The backend uses two layers:

1. **Safe Harbor regex** — 18 HIPAA identifier patterns from `src/ngsp/safe_harbor.py`.
2. **Clinical supplement** — 15 additional regex patterns for clinical trial-specific entities: DD-MMM-YYYY dates, subject IDs (`NN-NNNN`), site names, ages, compound codes, doses, AE grades, study-day/cycle timing, ORR/efficacy values, DSMB references, protocol amendments.

Entities are categorized into three tiers and replaced with typed placeholders: `<SUBJECT_N>`, `<COMPOUND_N>`, `<EFFICACY_N>`, etc.
