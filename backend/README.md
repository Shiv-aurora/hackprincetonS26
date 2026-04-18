# NGSP Backend

FastAPI server wrapping the NGSP research pipeline. Exposes five REST endpoints consumed by the frontend.

## Prerequisites

Python 3.11+, dependencies installed via `pip install -e .` from the repo root.

## Run

```bash
# from repo root
cp .env.example .env          # set ANTHROPIC_API_KEY (or leave as sk-ant-mock for offline)
uvicorn backend.main:app --reload --port 8000
```

## Endpoints

| Method | Path              | Description                                              |
|--------|-------------------|----------------------------------------------------------|
| GET    | `/api/health`     | Liveness check — returns mock_mode flag                  |
| POST   | `/api/analyze`    | Detect + classify entities (PHI / IP / MNPI)             |
| POST   | `/api/proxy`      | Build proxy text + entity_map + position_mapping         |
| POST   | `/api/route`      | Route a document: abstract_extractable / dp_tolerant / local_only |
| POST   | `/api/complete`   | Full pipeline: proxy → cloud LLM → rehydrate             |
| GET    | `/api/audit`      | Session stats + audit log (no raw content)               |
| POST   | `/api/audit/reset`| Clear audit log (used by `scripts/reset-demo.sh`)        |

## Modes

**Offline / mock mode** (default): set `ANTHROPIC_API_KEY=sk-ant-mock` or omit it. `/api/complete` returns a dynamically constructed ICH E2B response using the actual proxy placeholders, fully rehydrated. No network calls.

**Online mode**: set a real `ANTHROPIC_API_KEY`. Calls `claude-opus-4` via the Anthropic Python SDK.

## Tests

```bash
pytest backend/tests -q       # 27 passed
```

## Entity detection

The backend uses two layers:

1. **Safe Harbor regex** — 18 HIPAA identifier patterns from `src/ngsp/safe_harbor.py`.
2. **Clinical supplement** — 15 additional regex patterns for clinical trial-specific entities: DD-MMM-YYYY dates, subject IDs (`NN-NNNN`), site names, ages, compound codes, doses, AE grades, study-day/cycle timing, ORR/efficacy values, DSMB references, protocol amendments.

Entities are categorized into three tiers and replaced with typed placeholders: `<SUBJECT_N>`, `<COMPOUND_N>`, `<EFFICACY_N>`, etc.
