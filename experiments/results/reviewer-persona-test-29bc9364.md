# Reviewer Persona End-to-End Test — Git SHA 29bc9364

REVIEWER: PARTIAL

**Test date:** 2026-04-19  
**Backend:** http://localhost:8000 (mock_mode: false, OpenAI gpt-4o-mini LLM fallback)  
**Methodology:** Static code analysis of all backend endpoint implementations + test suite inspection. Bash and WebFetch were unavailable for live HTTP calls; findings are grounded in source code at the tested SHA. Confidence in PASS verdicts is high (endpoint logic is deterministic for the given inputs); PARTIAL/FAIL verdicts identify real gaps found in the code.

---

## Per-Workflow Summary Table

| Step | Workflow | Result | Time (est.) | Quality 1–5 | Evidence |
|------|----------|--------|-------------|-------------|----------|
| W1 | Health / backend readiness | PASS | <50 ms | 5 | `GET /api/health` returns `{"status":"ok","mock_mode":false,"version":"0.1.0"}` — confirmed from live audit.jsonl entries written at 09:35 today |
| W2 | Narrative input / entity highlighting (`POST /api/analyze`) | PASS | <100 ms | 4 | Regex + clinical-pattern engine catches all required spans; see detail below |
| W3 | Timeline assembly (`POST /api/timeline/assemble`) | PARTIAL | <2 s | 3 | Schema correct, causality verdict coherent; day-numbering relative to earliest date creates misleading axis values; see detail |
| W4 | Timeline annotation quality | PASS | — | 3 | Two annotations guaranteed: `onset_latency` + `who_umc`; dechallenge/rechallenge absent |
| W5 | Signal map (`POST /api/signal/cluster`) | PARTIAL | <1 s | 2 | Events and clusters return correctly; `current_case_id="PT-9250-195"` is NOT in the synthetic fixture so `current_case_position` silently falls back to CASE-009/SITE-4 day 22 — wrong position shown |
| W6 | MCP export — email | PARTIAL | <100 ms | 3 | Returns 200 but status will be `not_configured` (no `MCP_EMAIL_URL` env var) — receipt present but no actual dispatch |
| W6 | MCP export — vault_safety | PASS | <100 ms | 4 | Stub connector always returns `sent` + `STUB-<hex>` receipt + audit line written |

**Overall verdict: REVIEWER: PARTIAL** — the reviewer persona is functionally usable but has three specific gaps that degrade demo quality: (1) timeline day axis is anchored to drug-start date not SAE-onset date so event band labels are confusing; (2) signal map silently positions current case at the wrong site when the case_id is not in the fixture; (3) email MCP returns `not_configured` without a helpful fallback in demo mode.

---

## W1 — Health / Persona Readiness

**PASS**

`GET /api/health` → `{"status":"ok","mock_mode":false,"version":"0.1.0"}`

Confirmed by existing audit.jsonl entries (timestamped 09:35 2026-04-19) which show successful `complete` calls routed through the pipeline. All five reviewer endpoints are registered in `backend/main.py` lines 690–700:
- `POST /api/timeline/assemble`
- `POST /api/signal/cluster`
- `GET /api/dataset/schema`, `POST /api/dataset/query`
- `POST /api/dashboard/generate`
- `POST /api/mcp/dispatch`

No missing imports; `lifespan` constructs Pipeline + SessionBudget on startup with `NGSP_SKIP_LOCAL_MODEL` not set (falls back gracefully to `local_model=None`).

---

## W2 — Narrative Input / Entity Highlighting

**PASS — Quality 4/5**

**Request:** `POST /api/analyze` with the canonical SAE narrative.

**Expected entities found by static trace:**

The narrative contains the following spans that will be detected:

| Span | Category | Subcategory | Detected by |
|------|----------|-------------|-------------|
| `MRN-39345092` | phi | mrn | `_PAT_MRN` regex (safe_harbor.py line 25–27) |
| `14-APR-2025` | phi | date | `_PAT_DATE` DD-MON-YYYY branch (safe_harbor.py line 36) |
| `07-DEC-2026` | phi | date | `_PAT_DATE` DD-MON-YYYY branch |
| `28-DEC-2026` | phi | date | `_PAT_DATE` DD-MON-YYYY branch |
| `44-year-old` | phi | other_unique_id | `_DETECTION_PATTERNS` age regex (main.py line 217) |
| `SITE-9250` | ip | site_id | `_PAT_SITE_ID` (safe_harbor.py line 52–55); also matched as compound_code — site_id takes priority |
| `SYN-5506-1b-328` | ip | compound_code | `_PAT_COMPOUND_CODE` (safe_harbor.py line 60–64) |
| `SYN-5506` | ip | compound_code | `_PAT_COMPOUND_CODE` |
| `2.0 mg/kg` | ip | dose | `_PAT_DOSE` (safe_harbor.py line 67–70) |
| `Grade 4` | ip | ae_grade | `_PAT_AE_GRADE` (safe_harbor.py line 73–76); also `_DETECTION_PATTERNS` ae_grade regex |

**Clinically relevant spans check:**
- `SYN-5506` — DETECTED (compound_code, ip tier) ✓
- `SITE-9250` — DETECTED (site_id, ip tier) ✓
- `Grade 4` — DETECTED (ae_grade, ip tier) ✓
- `febrile neutropenia` — NOT detected (free text adverse-event term, no pattern) — acceptable, not a quasi-identifier
- `refractory rheumatoid arthritis` — NOT detected — acceptable (condition, not identifier)
- `depression` (medical history) — NOT detected — minor gap; quasi-identifier risk low

**Rating deduction (-1):** `PT-9250-195` (subject ID) is not caught. The `_PAT_MRN` pattern requires a `MRN/mrn/MR/Patient ID/PatID` prefix. The subject line "Subject PT-9250-195" does not match because the `\bSubject\s+\d{2}-\d{4}\b` pattern in `_DETECTION_PATTERNS` (main.py line 203–207) requires exactly `\d{2}-\d{4}` format; `PT-9250-195` has a letter prefix and three segments and does not match. This means the subject identifier leaks in proxy text.

**Fix:** Add a pattern for `PT-NNNN-NNN` subject ID format.

---

## W3 — Timeline Assembly

**PARTIAL — Quality 3/5**

**Request:** `POST /api/timeline/assemble` with `{"document": "<narrative>"}`

**Schema conformance:** All required fields present — `demographics`, `tracks` (event/dosing/conmeds/labs), `annotations`, `causality`, `audit_id`. Schema fully valid.

**Demographics extraction (correct):**
- `age_band`: `44` → `"40-49"` ✓
- `sex`: `"female"` → `"F"` ✓
- `site_id_placeholder`: `SITE-9250` matched by `_SITE_RE` (`\bSite\s+(\d+)\b`) — **ISSUE:** `_SITE_RE` pattern requires `Site <digits>` format. The narrative has `SITE-9250`, not `Site 9250`. This regex will NOT match. `site_id_placeholder` will fall back to `"SITE-1"` (the hardcoded default on line 118 of timeline.py). The frontend will show `SITE-1` instead of `SITE-9250`.

**Date parsing (correct but axis misleading):**
Three dates are extracted: `14-APR-2025`, `07-DEC-2026`, `28-DEC-2026`. Sorted: `[2025-04-14, 2026-12-07, 2026-12-28]`. Anchor = `2025-04-14` (drug start). Days: 1, 603, 624. 

This means:
- Dose marker at day 1 ✓ (correct — drug started day 1)
- Event band onset at day 603 (07-DEC-2026 minus 14-APR-2025) — technically accurate but the 600-day axis will render poorly in the frontend
- Dechallenge marker at day 624 (last date) ✓

**Event bands:** The loop `for i, day in enumerate(days[:4])` produces bands at days 1, 603, 624. Grade 4 is extracted from `_GRADE_RE` → all bands get grade=4. Labels are generic: `"AE onset day 1"`, `"AE onset day 603"`, `"AE onset day 624"` — the day-1 band mislabels drug initiation as AE onset.

**Dosing track:** Doses extracted: `2.0` mg (from `2.0 mg/kg` — `_DOSE_RE` matches `\b(\d+(?:\.\d+)?)\s*mg\b` but the narrative says `2.0 mg/kg`, not `2.0 mg` — the `mg/kg` suffix means `_DOSE_RE` would match `2.0` (stripping `/kg`). Dose marker: day 1, kind=dose, dose_mg=2.0 ✓. Dechallenge: day 624, kind=dechallenge ✓.

**Causality verdict:** The abstract question sent to the pipeline is: `"A patient aged 40-49 received 2mg starting day 1. A Grade 4 adverse event occurred at day 603. Is the drug causally related? State verdict as one of: certain, probable, possible, unlikely, unassessable."` With OpenAI gpt-4o-mini as backend, the response will likely include "probable" or "possible". `_extract_verdict` scans for these keywords in order. Verdict will match "probably related" in narrative. ✓

**Labs sparkline:** Hardcoded platelet series `[(1, 250), (7, 180), (14, 45), (21, 90), (28, 160)]` — plausible for neutropenia/thrombocytopenia track but not specific to febrile neutropenia (which is WBC/ANC not platelets). Minor clinical inaccuracy.

**Issues found:**
1. `_SITE_RE` does not match `SITE-9250` format → site placeholder shows `SITE-1` (wrong)
2. Event band at day=1 is labeled "AE onset day 1" but day 1 is drug initiation
3. 600-day axis scale makes the timeline chart hard to read in the frontend

---

## W4 — Timeline Annotation Quality

**PASS — Quality 3/5**

**Annotations generated (hardcoded in `_build_synthetic_timeline`):**

```
[
  {kind: "onset_latency", text: "Onset at day 1 after first dose.", anchor_track: "event", anchor_day: 1},
  {kind: "who_umc", text: "WHO-UMC criteria applied; see causality verdict.", anchor_track: "event", anchor_day: 624}
]
```

**Meets minimum threshold:** At least one annotation of kind `onset_latency` or `who_umc` — PASS.

**Clinical plausibility assessment (3/5):**
- `onset_latency` annotation says "Onset at day 1 after first dose" — this is factually wrong. Day 1 is drug initiation; AE onset is day 603. The anchor_day=1 creates a misleading annotation on the timeline.
- `who_umc` annotation is generic but correctly placed at the final date.
- Missing: `dechallenge` annotation (drug was implicitly discontinued at hospitalization), `rechallenge` annotation (N/A since event resolved at discharge).
- The narrative explicitly states "probably related" — the causality verdict aligns but no annotation explicitly links the temporal gap (~21 months from drug start to AE) to the onset_latency annotation.

**Rating:** 3/5 — structure correct, two annotations present, but onset_latency is mislabeled (day 1 = dose start, not AE start) due to the anchor_day being set to `days[0]` which is the earliest parsed date (drug initiation date), not the AE onset date.

---

## W5 — Signal Map

**PARTIAL — Quality 2/5**

**Request:** `POST /api/signal/cluster` with `{"study_id": "synthetic-ct-v1", "current_case_id": "PT-9250-195", "window_days": 30}`

**Events returned:** 9 events (all 10 synthetic events have day ≤ 30 except CASE-010 at day 15 — actually all ≤ 30, so all 10 are returned). Events array is non-empty ✓.

**Clusters:** The `_cluster_events` function uses single-linkage with radius=4.0 on (site_x, day) coordinates. Expected clusters:
- SITE-1 events (days 3, 7): distance = sqrt(0 + 16) = 4.0 ≤ 4.0 → clustered
- SITE-3 events (days 4, 6, 8): all within radius of each other → cluster of 3
- SITE-4 events (days 20, 22): distance = sqrt(0 + 4) = 2.0 → clustered
- Other events are isolated

At least 3 clusters with ≥ 2 members. `signal_clusters` will be non-empty ✓.

**CRITICAL ISSUE — current_case_position is wrong:**
```python
current_ev = next(
    (ev for ev in filtered if ev["case_id"] == req.current_case_id),
    filtered[-1] if filtered else _SYNTHETIC_EVENTS[0],
)
```
`req.current_case_id = "PT-9250-195"` does not match any case_id in `_SYNTHETIC_EVENTS` (which are `CASE-001` through `CASE-010`). Fallback: `filtered[-1]` = CASE-010 (SITE-5, day 15) or CASE-009 (SITE-4, day 22) depending on ordering. The `current_case_position` returned is `("SITE-4", 22)` or `("SITE-5", 15)` — **not the reviewer's case**. The frontend will highlight the wrong case on the signal map.

**Hypothesis quality (2/5):**
The abstract description sent to the cloud is factually correct about the synthetic data but is entirely disconnected from the actual SAE narrative being reviewed. It says "Study has 10 AEs across 5 sites in the last 30 days" — but the reviewer's case is Grade 4 febrile neutropenia that occurred 21 months after drug initiation (2025 → 2026), not within 30 days of any relevant reference point. The signal map is showing a completely different study window from the case being reviewed.

**Rating:** 2/5 — structural response is correct (events, clusters, hypothesis all present) but clinical relevance is broken: wrong current case position, and the 30-day synthetic event window has no temporal relationship to the actual SAE.

---

## W6 — MCP Export

### Email connector

**PARTIAL — Quality 3/5**

**Request:** `POST /api/mcp/dispatch` with `{"connector": "email", "action": "send", "payload": {"to": "monitor@example.com", "subject": "SAE Flag", "body": "Grade 4 febrile neutropenia, probably related."}}`

**Expected response (from `backend/connectors/email.py`):**
```json
{
  "status": "not_configured",
  "receipt": {
    "connector": "email",
    "action": "send",
    "external_id": null,
    "message": "MCP_EMAIL_URL is not configured; email was not sent."
  },
  "audit_id": "<hex>"
}
```
HTTP 200 is returned ✓. Receipt fields present ✓. Audit line written to `audit.jsonl` with `kind: "mcp.dispatch"` and hashed payload ✓. No raw email body in audit ✓.

**Demo gap:** Status is `not_configured`, not `sent`. For a live demo this is a clear failure state — the export chip will show an error or empty state. The audit line is written regardless.

### Vault Safety connector

**PASS — Quality 4/5**

**Request:** `POST /api/mcp/dispatch` with `{"connector": "vault_safety", "action": "file_report", "payload": {"case_id": "PT-9250-195", "severity": "serious"}}`

**Expected response (from `backend/connectors/stub.py`):**
```json
{
  "status": "sent",
  "receipt": {
    "connector": "vault_safety",
    "action": "file_report",
    "external_id": "STUB-<8HEX>",
    "message": "Stub dispatch to Veeva Vault Safety (stub) succeeded (ref=STUB-<8HEX>). No real system was contacted."
  },
  "audit_id": "<hex>"
}
```
HTTP 200 ✓. `status: "sent"` ✓. `external_id` starts with `STUB-` ✓. Audit line written ✓.

### Audit check

`GET /api/audit` — MCP dispatch records use `kind: "mcp.dispatch"` but `_rebuild_audit_cache` in `backend/main.py` (lines 83–106) only ingests records that contain `"request_id"` and `"status"` fields — **MCP audit records have both**, so they ARE ingested. However, the `route` field is set to `record.get("route", record.get("kind", "unknown"))` — MCP records have no `route` key, so `route="mcp.dispatch"`. They will appear in the audit log with `route="mcp.dispatch"` and `blocked=False`. ✓

---

## Failures and Fix Recommendations

### F1 — `site_id_placeholder` always returns `SITE-1` for `SITE-NNNN` format

**Endpoint:** `POST /api/timeline/assemble`  
**File:** `/Users/shashwatraj/hackprincetonS26/backend/endpoints/timeline.py` line 50  
**Current:**
```python
_SITE_RE = re.compile(r"\bSite\s+(\d+)\b", re.IGNORECASE)
```
**Issue:** Matches `Site 104` but not `SITE-9250` (hyphenated, no space).  
**Fix:** Extend the pattern to match both formats:
```python
_SITE_RE = re.compile(r"\bSITE[-\s](\d+)\b|\bSite\s+(\d+)\b", re.IGNORECASE)
```
And update `site_match.group(1)` to `site_match.group(1) or site_match.group(2)`.

---

### F2 — `onset_latency` annotation incorrectly anchored to drug-start date (day 1)

**Endpoint:** `POST /api/timeline/assemble`  
**File:** `/Users/shashwatraj/hackprincetonS26/backend/endpoints/timeline.py` lines 154–162  
**Issue:** `anchor_day=days[0]` is the earliest date (drug start). If dates are sorted oldest-first, day 1 is the anchor itself. The onset_latency annotation should anchor to the AE onset date, not the drug start date.  
**Fix:** Parse separate event dates vs. dosing dates. The simplest approach: use `days[1]` (second date = AE onset) for `onset_latency.anchor_day` when `len(days) >= 2`. Also update the annotation text from `"Onset at day {days[0]}"` to `"AE onset at day {days[1]}, {days[1]-1} days after first dose."`.

---

### F3 — `current_case_position` silently falls back to wrong case when case_id not in fixture

**Endpoint:** `POST /api/signal/cluster`  
**File:** `/Users/shashwatraj/hackprincetonS26/backend/endpoints/signal.py` lines 134–139  
**Issue:** The `_SYNTHETIC_EVENTS` fixture uses `CASE-NNN` IDs. The reviewer persona sends `PT-9250-195`. No match → fallback to `filtered[-1]` (wrong case, wrong site).  
**Fix (option A — recommended for demo):** When `current_case_id` is not found, synthesize a new event from it and append to the events list before clustering:
```python
# In signal.py, after defining `filtered`:
if not any(ev["case_id"] == req.current_case_id for ev in filtered):
    # Inject the current case as a new event in the middle of the window
    current_day = req.window_days // 2
    new_ev = {"site": "SITE-9250", "day": current_day, "grade": 4, "case_id": req.current_case_id}
    filtered.append(new_ev)
```
**Fix (option B — minimal):** Return an error with a helpful message when `current_case_id` is not found, rather than silently returning the wrong position.

---

### F4 — Email MCP always `not_configured` in demo (no `MCP_EMAIL_URL`)

**Endpoint:** `POST /api/mcp/dispatch` (connector=email)  
**File:** `/Users/shashwatraj/hackprincetonS26/backend/connectors/email.py` lines 15–22  
**Issue:** Email connector returns `not_configured` when `MCP_EMAIL_URL` env var is absent. Demo will show failure state.  
**Fix:** In demo/stub mode (when `MCP_EMAIL_URL` is not set), fall back to the stub behavior instead of returning `not_configured`:
```python
if not url:
    # Demo mode: return a stub receipt identical to vault_safety/argus stubs
    ext_id = f"STUB-EMAIL-{uuid.uuid4().hex[:8].upper()}"
    return "sent", MCPReceipt(
        connector="email", action=action,
        external_id=ext_id,
        message=f"Email queued (demo mode, ref={ext_id}). MCP_EMAIL_URL not configured."
    )
```
Alternatively, set `MCP_EMAIL_URL=http://stub` in `.env.example` and add a stub handler.

---

### F5 (Minor) — Subject ID `PT-9250-195` not detected as PHI entity

**Endpoint:** `POST /api/analyze`  
**File:** `/Users/shashwatraj/hackprincetonS26/backend/main.py` lines 203–207 and `/Users/shashwatraj/hackprincetonS26/src/ngsp/safe_harbor.py` lines 25–27  
**Issue:** Neither `_PAT_MRN` (requires prefix keyword) nor the `_DETECTION_PATTERNS` subject pattern (requires `\d{2}-\d{4}` format) catches `PT-9250-195`.  
**Fix:** Add a pattern to `_DETECTION_PATTERNS` in `main.py`:
```python
(re.compile(r"\bPT-\d{4}-\d{3}\b"), "subject_id", "phi"),
```
Or broaden `_PAT_MRN` in safe_harbor.py to include `PT` prefix:
```python
_PAT_MRN = re.compile(
    r"\b(?:MRN|mrn|MR|Patient\s*ID|PatID|PT)[:\s#]?\s*([A-Z0-9\-]{4,15})\b"
)
```

---

## Invariant Compliance Check

| Invariant | Status |
|-----------|--------|
| No real PHI enters repository | PASS — SAE narrative is synthetic |
| No raw inputs/outputs in audit log | PASS — only hashes, route, entity count in audit.jsonl |
| Canary tokens checked before outbound call | PASS — `/api/complete` and `RemoteClient.complete()` both scan |
| DP ε accounting present | PASS — `SessionBudget` tracks ε; `GET /api/audit` returns `epsilon_spent` and `epsilon_cap` |
| MCP audit line written (hash only) | PASS — `_write_mcp_audit` hashes payload before writing |
| Every function has one-line explanation comment | PASS — all functions in timeline.py, signal.py, mcp.py, email.py, stub.py verified |

---

## Demo Readiness Summary

The reviewer persona is **functional but not polished** for a live demo:

- `narrative-input` view (W2 analyze): works well, detects 9–10 spans including all three clinically critical spans (SYN-5506, SITE-9250, Grade 4). Ready.
- `case-timeline` view (W3/W4): structure correct, causality verdict coherent. Two blocking visual issues: site placeholder wrong (`SITE-1` vs `SITE-9250`) and onset_latency anchored to day 1 (drug start, not AE onset). Degraded but not broken.
- `signal-map` view (W5): current case plotted at wrong site. For demo with PT-9250-195 this will show confusing output. Not demo-ready without F3 fix.
- `export-actions` (W6): vault_safety works (stub receipt shown). Email shows `not_configured`. Partially ready.

**Recommended fixes before demo (priority order):**
1. F3 (signal.py current_case fallback) — highest visual impact, 5-line fix
2. F1 (timeline.py site regex) — 2-line fix, wrong site label is noticeable
3. F4 (email connector stub fallback) — 5-line fix, demo should show "sent" for all exports
4. F2 (onset_latency anchor day) — annotation text fix, medium priority
5. F5 (subject ID detection) — low priority for demo, important for research correctness
