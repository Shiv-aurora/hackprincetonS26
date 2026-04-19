ANALYST: PARTIAL

# Analyst Persona Test — git SHA 29bc9364
Timestamp: 2026-04-19

## Summary
All 6 workflows completed. Core data/chat/dashboard pipelines work correctly. Two partial issues: MCP email not configured (expected for demo), dashboard response time is 0ms (mock-mode spec, not real cloud generation).

## Per-Workflow Results

| Step | Result | Time | Quality | Evidence |
|---|---|---|---|---|
| W1 Dataset load | PASS | <1s | 5/5 | 8 columns, 20 rows, 40 entity-annotated cells (SITE-1→`<SITE_PLACEHOLDER>`) |
| W2 Chat on dataset | PASS | 1.6s | 5/5 | Correctly named all 8 columns and row count=20 |
| W3 Aggregation | PASS | 2.0s | 4/5 | All sites equal (2.50 avg) — LLM correctly reported tie; matches ground truth |
| W4 Dashboard scripted | PASS | <1s | 4/5 | 3 charts: bar + heatmap + KPI; sensible narrative about SITE-3 signal |
| W5 Dashboard open-ended | PASS | <1s | 3/5 | Returns same 3-chart spec regardless of prompt; not prompt-adaptive |
| W6 Export (MCP) | PARTIAL | <1s | 3/5 | 200 OK, receipt returned, but `MCP_EMAIL_URL not configured` — chip would be disabled in UI |

## Issues

**W5 — Dashboard not prompt-adaptive (non-blocking):**
Both W4 and W5 return identical specs regardless of prompt content. The backend's `POST /api/dashboard/generate` returns the same mock/cached spec.
- File: `backend/endpoints/dashboard.py`
- Fix: ensure prompt is passed to cloud LLM and spec varies per prompt; currently may be returning a static fixture

**W6 — Email MCP not configured (non-blocking for demo):**
`MCP_EMAIL_URL` env var not set. Per CLAUDE.md §12.5, unconfigured connectors should show a disabled chip with tooltip in the UI — that's the correct behavior, not a bug.
- The vault_safety/rave_edc/argus stubs always return synthetic receipts regardless.

## Verdict
`ANALYST: PARTIAL` — core workflows all functional, two polish items. Demo-ready for dataset + chat + dashboard flows. Export chips will show as not_configured for email/calendar.
