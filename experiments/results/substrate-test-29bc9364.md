SUBSTRATE: GO

**Git SHA:** 29bc9364
**Timestamp:** 2026-04-19T09:35:00Z
**Tester:** substrate-tester subagent (re-run)
**Backend:** http://localhost:8000  |  mock_mode: false  |  version: 0.1.0
**Python env:** .venv (requests installed)

---

## Field-name corrections found via /openapi.json

| Endpoint | Field used in test spec | Actual field per OpenAPI schema |
|---|---|---|
| `/api/analyze` | `document` | `text` |
| `/api/proxy` | `document` | `text` |
| `/api/route` | `document` | `text` |
| `/api/complete` | `response` | `response_rehydrated` |
| `/api/audit` | assumed list | dict with keys `session_stats`, `log`, `epsilon_spent`, `epsilon_cap` |

Audit log was reset (`POST /api/audit/reset`) before the test sequence to establish a clean baseline.

---

## Per-test results

| # | Test | Result | Time (ms) | Evidence |
|---|------|--------|-----------|----------|
| T1 | GET /api/health | **PASS** | 4 | `status=ok`, `mock_mode=false`, `version=0.1.0` |
| T2 | POST /api/analyze | **PASS** | 2 | `entities_count=12`, `counts` key present; sample entities: `PT-9250-195`, `MRN MRN-39345092`, `44-year-old` |
| T3 | POST /api/proxy | **PASS** | 1 | `proxy_len=673`, differs from input, `entity_map_size=12`, zero verbatim leaks of `SYN-5506`/`SITE-9250`/`PT-9250` |
| T4 | POST /api/route | **PASS** | 1 | `path=abstract_extractable`, `rationale_len=97`: *"Document contains PHI or IP quasi-identifiers but no MNPI; query intent can be safely abstracted."* |
| T5 | POST /api/complete | **PASS** | 2386 | HTTP 200, elapsed=2386 ms (>500 ms ✓), `response_rehydrated` len=359, `audit_id=a804b8ad6d494e6ea21711a1731917ed` |
| T6 | GET /api/audit (audit_id + PHI check) | **PASS** | 4 | T5 `audit_id` found in `log`; zero occurrences of `SYN-5506`/`PT-9250`/`SITE-9250` in full audit JSON |
| T7 | POST /api/complete (canary CANARY_test12345) | **PASS** | 4 | HTTP 400, `error=canary_leak`, `message="Canary token detected in proxy text — outbound call blocked."`, `audit_id=2c6867722ebc4f3da5603a672c9a9457` |
| T8 | Audit counter: 3 calls → 3 new entries | **PASS** | 2 | `before=2`, `after=5`, `delta=3` — exact match |
| SA | GET /api/dataset/schema | **PASS** | 3 | HTTP 200, `columns_count=8`; columns: `doc_id`, `site` (category, has_entities=true), `subject` (string, has_entities=true), ... |
| SB | POST /api/dataset/query (`{}`) | **PASS** | 2 | HTTP 200, `rows_count=20`, `rows` key present |
| SC | POST /api/dashboard/generate | **PASS** | 6 | HTTP 200, `charts_count=3`, `charts` key present |

**All 11 tests PASS.**

---

## T5 — Request / Response detail

**Request:**
```json
{
  "document": "CONFIDENTIAL — SAE NARRATIVE (synthetic test data)\n\nSubject PT-9250-195 (MRN MRN-39345092)...",
  "prompt": "Rewrite this narrative in two sentences."
}
```

**Response (key fields):**
```json
{
  "routing": {
    "path": "abstract_extractable",
    "rationale": "Document contains PHI or IP quasi-identifiers but no MNPI; query intent can be safely abstracted."
  },
  "proxy_sent": "<proxied text — no raw PHI>",
  "response_raw": "<cloud response with placeholders>",
  "response_rehydrated": "Subject PT-9250-195 experienced a serious adverse event of febrile neutropenia on 07-DEC-2026, 21 days after initiating SYN-5506 at a dose of 2.0 mg/kg IV Q2W on 14-APR-2025, which required hospitalization...",
  "entities_proxied": 12,
  "entities_blocked": 0,
  "audit_id": "a804b8ad6d494e6ea21711a1731917ed"
}
```

---

## T7 — Canary detection request / response

**Request:**
```json
{
  "document": "CONFIDENTIAL — SAE NARRATIVE...\nCANARY_test12345",
  "prompt": "Summarize."
}
```

**Response (HTTP 400):**
```json
{
  "error": "canary_leak",
  "message": "Canary token detected in proxy text — outbound call blocked.",
  "audit_id": "2c6867722ebc4f3da5603a672c9a9457"
}
```

Outbound API call correctly blocked. ✓

---

## Audit schema note

`GET /api/audit` returns:
```json
{
  "session_stats": { "total_requests": N, "proxied": N, "local_only": N, "blocked": N },
  "log": [ { "audit_id": "...", "timestamp": "...", "route": "...", "entities_count": N, "blocked": false } ],
  "epsilon_spent": 0.0,
  "epsilon_cap": 3.0
}
```
Raw inputs, raw outputs, and entity map contents are absent from all log entries — invariant holds.
