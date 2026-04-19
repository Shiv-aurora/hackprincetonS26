# test-campaign.md — NGSP end-to-end test orchestration

Paste this into Claude Code (Sonnet 4.6 is fine for this; no need for Opus) when
you want to verify the system is demo-ready. Run the stages in order. Within each
stage, dispatch the listed subagents in parallel where noted.

This campaign is a **gated cascade**: each stage has a go/no-go verdict. If a stage
fails, stop, fix, and re-run that stage before proceeding. Do not run downstream
stages against a broken substrate — you will waste agent cycles on misleading
failures.

---

## Situation

The NGSP clinical privacy workspace is partway through Phases 5-7. The shell, the
activity bar, and the dataset preview render. The forensic status bar at the bottom
shows "No cloud calls yet · ε 0.00" which means no real cloud integration has been
exercised yet through the UI.

This campaign answers two questions in order:
  (1) Is the substrate — backend endpoints, NGSP routing, cloud integration,
      forensic audit — actually wired up and producing correct output?
  (2) Does each persona's workflow produce demo-quality results?

Each question has its own stage. Do not conflate them.

---

## Stage 0 — pre-flight (manual, 5 min)

Before any agent runs, confirm these three things yourself at the terminal:

```bash
# Backend is running and healthy
curl -s http://localhost:8000/api/health | jq

# Frontend is running
curl -s http://localhost:5173 | head -5

# ANTHROPIC_API_KEY is set and is NOT sk-ant-mock or sk-ant-REPLACE_ME
grep ANTHROPIC_API_KEY .env
```

If any of these three fail, fix them before dispatching any agent. None of the test
agents will be able to diagnose a dead backend or a missing key.

Record the git SHA and current branch: every test output should reference it.

---

## Stage 1 — substrate check (one agent, serial)

**Dispatch `substrate-tester` and wait for its verdict before proceeding.**

This stage answers: "does anything at all work end-to-end through the real cloud?"
It runs alone because every downstream stage depends on its result. If substrate is
broken, six parallel agents would all report the same root cause six different ways.

### Task: dispatch `substrate-tester`

> You are the `substrate-tester` subagent. Read CLAUDE.md for project context and
> `docs/test-campaign.md` for your place in the campaign. Your job is to verify
> that every backend endpoint responds correctly, that the NGSP pipeline actually
> calls the cloud when the key is real, that the forensic audit fires on every
> cloud call, and that no raw content leaks into the audit log.
>
> You are a gate, not a feature tester. Your output determines whether downstream
> stages run at all.
>
> **Preconditions (verify before running tests):**
>   - Backend running at `http://localhost:8000`.
>   - `ANTHROPIC_API_KEY` in `.env` is a real key (not `sk-ant-mock`, not
>     `sk-ant-REPLACE_ME`).
>   - Backend has been restarted since the key was set.
>
> If any precondition fails, stop and report.
>
> **Test list:**
>
> 1. `GET /api/health` → expect 200, `mock_mode: false`, `status: "ok"`.
>
> 2. `POST /api/analyze` with the canonical demo SAE narrative → expect:
>    - `entities` array non-empty
>    - at least one entity per tier (phi, ip, mnpi)
>    - `counts` sums match the array length
>
> 3. `POST /api/proxy` with the same narrative → expect:
>    - `proxy` text differs from `original`
>    - `entity_map` has at least one entry
>    - every placeholder in `entity_map` appears in `proxy`
>    - `position_mapping` length matches `entity_map` size
>    - no real entity value from the original appears in `proxy` text
>
> 4. `POST /api/route` with the same narrative → expect:
>    - `path` is one of the three documented values
>    - `rationale` is non-empty
>
> 5. `POST /api/complete` with `prompt: "Rewrite this narrative in two sentences."` →
>    expect:
>    - response takes > 500 ms (real cloud call, not mock)
>    - `response_raw` is coherent English, not an error message
>    - `response_rehydrated` contains at least one real entity value from the input
>      (e.g. the actual subject ID, not `<SUBJECT_1>`)
>    - `audit_id` is a non-empty string
>
> 6. `GET /api/audit` immediately after step 5 → expect:
>    - `session_stats.total_requests` incremented by exactly 1
>    - the new audit entry appears in `log` with matching `audit_id`
>    - audit entry contains NO raw prompt text, NO raw response text — only hashes
>      and metadata (grep the JSON for any word from the narrative; must not appear)
>
> 7. **Canary leak test.** Take a narrative and append `CANARY_test12345`. Call
>    `/api/complete` → expect a 4xx or 5xx with an error indicating canary
>    detection. Then check `/api/audit` → expect a new audit line with
>    `status: "canary_leak"`. This is the hardest privacy invariant; it MUST work.
>
> 8. Make three more `/api/complete` calls in a row and watch `/api/audit/session_stats`.
>    Expect `total_requests` to be exactly `prior + 3`. This verifies the audit
>    counter isn't double-counting or dropping calls.
>
> **Deliverable:** Write `experiments/results/substrate-test.md` with:
>   - Git SHA and timestamp.
>   - Per-test row: test number, pass/fail, evidence (curl response excerpt,
>     response time, any anomaly).
>   - A final go/no-go verdict in the first line: either `SUBSTRATE: GO` or
>     `SUBSTRATE: NO-GO` followed by the first failure's test number.
>
> **Hand-off:**
>   - If `GO`: notify top-level, Stage 2 can begin.
>   - If `NO-GO`: stop. Diagnose the first failure. Do not continue with other
>     tests — they will all be misleading.

---

## Stage 2 — persona workflows (two agents, parallel after Stage 1 passes)

**Only run Stage 2 if Stage 1 reported `SUBSTRATE: GO`.**

The two persona-testing agents run in parallel. They exercise disjoint code paths at
runtime (different views, different endpoints) and have no shared state beyond the
backend's session store, which is safe for independent reads.

### Task: dispatch `analyst-tester` and `reviewer-tester` in parallel

> You are the `analyst-tester` subagent. Read CLAUDE.md and `docs/test-campaign.md`.
> Your job is to drive the Analyst persona through its three-pane workflow as an
> end user would, and report on the quality of each workflow step.
>
> You do not run unit tests. You test the whole product from the user's perspective,
> using the real frontend + real backend + real cloud. Use Playwright (install if
> needed) or, if Playwright is not available, drive the HTTP endpoints directly in
> the same sequence a user would and render the responses yourself to assess
> quality.
>
> **Workflow under test (must complete in order; later steps depend on earlier):**
>
> **W1. Dataset load.** Switch to Analyst persona (VITALS icon). Dataset preview
> appears in the left pane. Expect:
>   - Table renders within 3 seconds of persona switch.
>   - At least 30 rows visible without scrolling.
>   - Column headers are readable.
>   - Entity-bearing cells have a visible highlight (underline or tooltip).
>
> **W2. Chat on dataset.** Type in the main pane: "What's in this dataset? Just
> tell me the columns and row count." Expect:
>   - Response within 10 seconds.
>   - Response correctly names the columns and row count (verify against
>     `/api/dataset/schema`).
>   - Forensic dock shows one new cloud call.
>
> **W3. Chat with aggregation.** Type: "Which site has the highest average AE
> grade?" Expect:
>   - Response within 15 seconds.
>   - Response identifies a specific site.
>   - You independently verify the answer by calling `/api/dataset/query` with the
>     same aggregation and comparing.
>   - **If the answer disagrees with ground truth by more than one rank position,
>     this is a critical bug** — the NGSP aggregation is over-stripping or the
>     cloud is hallucinating.
>
> **W4. Dashboard, scripted prompt.** In the right pane, type: "Show AE grade
> distribution by site as a bar chart." Click Generate. Expect:
>   - Response within 20 seconds.
>   - Dashboard renders at least one chart.
>   - Chart has readable axes, a title, and data that corresponds to a sensible
>     aggregation of the dataset.
>   - If the response is an error or the chart is empty: the dashboard is the
>     riskiest feature; document exactly what the backend returned (the
>     `DashboardSpec` JSON) so the team can see whether the failure is in spec
>     generation or spec rendering.
>
> **W5. Dashboard, open-ended prompt.** Type: "Summarize safety signals in this
> trial." Click Generate. This tests whether the dashboard handles prompts that
> are not explicit chart requests. Expect:
>   - Either a dashboard with sensible charts + narrative summary, OR
>   - A graceful fallback showing a narrative-only response.
>   - Not acceptable: a crash, an empty spec, or an obviously wrong chart
>     (e.g. a single-value bar chart).
>
> **W6. Export action.** Beneath any dashboard output, click an export chip (e.g.
> "Email to CMO"). Expect:
>   - MCP dispatch fires.
>   - Visible receipt (toast or inline confirmation).
>   - Forensic dock shows the dispatch.
>   - If the MCP connector is not configured, the chip should be disabled with a
>     tooltip, not throw an error.
>
> **Deliverable:** Write `experiments/results/analyst-persona-test.md` with:
>   - Per-workflow row: step, pass/fail/partial, wall-clock time, screenshot or
>     response excerpt, quality rating 1-5.
>   - A final persona verdict: `ANALYST: DEMO-READY`, `ANALYST: PARTIAL`, or
>     `ANALYST: NOT-READY` with the first blocking failure.
>   - A specific recommendation for each failed workflow: what to fix, at what
>     file path, with what change.

---

> You are the `reviewer-tester` subagent. Read CLAUDE.md and `docs/test-campaign.md`.
> Your job is to drive the Reviewer persona through its three-pane workflow as a
> pharmacovigilance reviewer would.
>
> Same rules as `analyst-tester`: test the whole product end-to-end, use real cloud,
> verify output quality, not just "does it render without crashing."
>
> **Workflow under test:**
>
> **W1. Persona switch.** Click the RECORDS icon. Expect:
>   - Layout switches to narrative-input (left) + case-timeline (main) + signal-map
>     (right).
>   - Layout switch completes in under 500 ms.
>   - Any prior layout state is preserved when switching back to Analyst and then
>     back to Reviewer.
>
> **W2. Narrative input.** Paste the canonical demo SAE narrative into the left
> pane. Expect:
>   - Sensitive-span underlines appear within 2 seconds.
>   - Hovering an underline shows the category tag.
>
> **W3. Timeline assembly.** Click "Process narrative" (or equivalent primary
> action). Expect:
>   - Timeline in the main pane begins assembling within 3 seconds.
>   - All four tracks (event, dosing, conmeds, labs) populate within 8 seconds.
>   - System-generated annotations (onset latency, dechallenge, rechallenge,
>     WHO-UMC causality) appear within 12 seconds.
>   - The final state is readable and clinically coherent: dose markers are at
>     plausible days, the event band onset matches the narrative, the causality
>     callout matches what the narrative implies.
>   - Forensic dock shows the two cloud calls the timeline assembly makes (one for
>     causality reasoning, one for the clinical annotations).
>
> **W4. Timeline inspection.** Hover an annotation. Expect:
>   - A grounding trace: the source phrase in the narrative on the left briefly
>     highlights.
>   - This is the trust-building moment; if it's missing, the reviewer will not
>     believe the system read her text.
>
> **W5. Signal map.** The right pane should populate after the timeline assembles,
> showing the current case as a ringed dot plus any cross-case patterns. Expect:
>   - At least one cluster visible (the seeded fixture should include a cluster
>     that contains the current case).
>   - Clicking the cluster opens a side panel with a cloud-generated hypothesis.
>   - The hypothesis is clinically plausible — not "this cluster is a cluster."
>     Rate 1-5 on how useful a real PV reviewer would find it.
>
> **W6. Export action.** Click "Flag to medical monitor" or equivalent. Expect:
>   - MCP calendar + email dispatch fires.
>   - Visible receipt.
>   - Forensic dock shows the dispatch.
>
> **Deliverable:** Write `experiments/results/reviewer-persona-test.md` with the
> same structure as the analyst tester's report. Verdict: `REVIEWER: DEMO-READY`,
> `PARTIAL`, or `NOT-READY`.

---

## Stage 3 — forensic + privacy audit (one agent, serial after Stage 2)

**Only run Stage 3 if both Stage 2 agents reported at least `PARTIAL`.**

This stage audits what the first two stages produced. It runs alone because it
reads the forensic log accumulated during Stage 2 and needs a stable view of it.

### Task: dispatch `forensic-auditor`

> You are the `forensic-auditor` subagent. Read CLAUDE.md (especially §7 invariants
> and §11.4 forensic dock) and `docs/test-campaign.md`. Your job is to verify that
> the forensic dock and audit log are accurate, complete, and privacy-preserving
> for every cloud call made during Stages 1 and 2.
>
> **Do not make new cloud calls.** Read what's already there.
>
> **Tests:**
>
> 1. **Completeness.** Count cloud calls visible in the forensic dock UI. Count
>    entries in `/api/audit` log. These must match exactly.
>
> 2. **Hash-only invariant.** For every audit entry, grep the entire audit log for
>    any word of length > 5 that appears in: (a) the canonical demo SAE narrative,
>    (b) any response you recorded in Stage 2. Must find zero matches. This is the
>    privacy claim under test.
>
> 3. **Canary invariant.** Confirm the Stage 1 test 7 canary leak entry is present
>    with `status: "canary_leak"`. Confirm no canary string appears in any audit
>    field.
>
> 4. **ε monotonicity.** Extract ε values from all audit entries in chronological
>    order. Must be monotonically non-decreasing per session.
>
> 5. **Forensic dock UI fidelity.** Expand the bottom dock. Confirm:
>    - Three-lane view shows `Proxy Sent`, `Cloud Response`, `Rehydrated` columns.
>    - Each row corresponds to one audit entry.
>    - Canary-leak rows render with the `--color-danger` accent.
>    - No raw content is visible in the DOM (open DevTools → Elements, grep for any
>      narrative word; must find zero).
>
> 6. **Persona independence.** Confirm the forensic dock shows both Analyst and
>    Reviewer calls together, regardless of which persona is currently selected.
>    The dock is shared chrome per CLAUDE.md §11.4.
>
> **Deliverable:** Write `experiments/results/forensic-audit.md` with:
>   - Per-test verdict.
>   - Any raw-content leaks found, with exact file path and line.
>   - Final verdict: `FORENSIC: CLEAN` or `FORENSIC: LEAKED` with specifics.
>
> A `LEAKED` verdict is a demo-blocker regardless of how good the UX is. Fix
> before proceeding to Stage 4.

---

## Stage 4 — demo rehearsal (one agent, serial after Stage 3)

**Only run Stage 4 if forensic audit is `CLEAN`.**

### Task: dispatch `demo-rehearser`

> You are the `demo-rehearser` subagent. Read CLAUDE.md, `new-prompt.md` §7
> (integration-and-demo), and `docs/test-campaign.md`. Your job is to run the two
> demo scripts end-to-end, measure wall-clock time, and confirm the visually
> dramatic closing frame described in each script actually lands.
>
> **Setup:** Run `./scripts/reset-demo.sh` to get a clean state. Confirm the
> backend and frontend are both up afterward.
>
> **Rehearsal 1: Analyst demo (target 90 seconds).** Execute the analyst demo
> script from `docs/demo-script.md` step by step, with a stopwatch. Record the
> wall-clock time for each step. Confirm the closing frame:
>   - Dashboard renders with at least two charts and a narrative summary.
>   - Export chip produces a visible MCP receipt.
>   - Forensic dock, when expanded, shows the aggregation-only cloud call with a
>     hashed payload.
>
> **Rehearsal 2: Reviewer demo (target 90 seconds).** Execute the reviewer demo
> script step by step with a stopwatch. Confirm the closing frame:
>   - Case timeline fully assembled with all four tracks.
>   - Signal map shows the seeded cluster.
>   - Export chip fires MCP dispatch with visible receipt.
>   - Expanded forensic dock shows the two cloud calls with hashed payloads and a
>     running ε total.
>
> **Rehearsal 3: reset-and-repeat.** Run `./scripts/reset-demo.sh` again. Confirm
> the system comes back to a clean state in under 30 seconds. Re-run rehearsal 1
> from the clean state to confirm the demo is repeatable (critical: during the
> actual demo, if the first run fails, you need to be able to reset and try again
> without it looking broken).
>
> **Deliverable:** Write `experiments/results/demo-rehearsal.md` with:
>   - Per-rehearsal: step-by-step timing table, total time, closing-frame status.
>   - Known rough edges: anything that works but looks janky, with suggested
>     cleanup.
>   - Final verdict: `DEMO: READY`, `DEMO: NEEDS-POLISH`, or `DEMO: BLOCKED` with
>     specifics.

---

## Orchestration rules

1. **Stages are gates, not suggestions.** Do not dispatch Stage 2 until Stage 1
   reports GO. Do not dispatch Stage 3 until both Stage 2 agents report at least
   PARTIAL. Do not dispatch Stage 4 until Stage 3 reports CLEAN.

2. **Within Stage 2, the two persona agents run in parallel.** They use disjoint
   code paths at runtime. Parallelism is safe here and halves wall-clock time.

3. **When an agent reports a failure, fix it yourself or dispatch a targeted
   fix-it agent** with the failure detail as its only input. Do not re-run the
   whole stage; just re-run the one failed test after the fix.

4. **Record every test run's git SHA** in the report filename: e.g.
   `experiments/results/substrate-test-<sha>.md`. This lets you diff runs and
   see regressions.

5. **If you find yourself wanting to skip a stage to save time — don't.** Stages
   are in dependency order for a reason. A broken substrate will make Stage 2
   failures look like persona bugs, and you'll waste an afternoon chasing ghosts.

## Success criteria

The campaign is done when:

```
SUBSTRATE: GO
ANALYST:   DEMO-READY
REVIEWER:  DEMO-READY
FORENSIC:  CLEAN
DEMO:      READY
```

Any other combination means more work. The combination above means the product is
demo-ready with both persona workflows, a clean privacy story, and two rehearsed
90-second scripts.