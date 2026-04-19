# new-prompt.md — Phase 5-7 orchestration for the NGSP clinical-trial privacy workspace

Paste this file's contents as your first message to Claude Code in a session where
`CLAUDE.md` has already been updated with §§11-13. Claude Code reads `CLAUDE.md`
automatically for persistent context; this file is the plan and the subagent dispatch
order for the frontend shell, backend extensions, and persona views.

---

## Situation

Phases 0-4 are complete: the NGSP pipeline runs end-to-end, the synthetic corpus is
labeled, the attack suite produces measurable results, and the research paper in
`paper/` captures the findings. The backend has a minimal FastAPI surface with
`/api/analyze`, `/api/proxy`, `/api/route`, `/api/complete`, `/api/audit`, and
`/api/health`. A partial frontend exists with a VS-Code-shaped shell, an activity
bar, a title bar, a resizable workspace, and an assistant panel that calls the
backend.

Two things are true about that partial frontend. First, the shell scaffolding is
salvageable — `App.tsx`, `TitleBar.tsx`, `ActivityBar.tsx`, `Workspace.tsx`, and
`AssistantPanel.tsx` are close enough in spirit to what §11 describes that most of
them can be refactored rather than rewritten. Second, the shell does not yet have a
pane/view registry, persona layouts, a shared bottom dock, or any of the
reviewer/analyst views. This session's work is to add that structure, then implement
each persona's views on top of it.

## Goal of this phase

Build the enterprise client described in CLAUDE.md §§11-13. Two personas, each with
a three-pane layout, all panes swappable and collapsible VS-Code-style. A shared
forensic bottom dock. MCP as a fulfillment layer inside workflows, never a top-level
view. One FastAPI service growing five new endpoint groups that all route through the
existing NGSP pipeline.

The deliverable is a running desktop-style client where a judge can walk up, click a
persona, watch a workflow run in under 90 seconds, see visually dramatic output, and
inspect the forensic log to verify that no sensitive content reached the cloud.

## Plan overview

Six specialized subagents dispatched in three phases. Each has a narrow remit and a
typed hand-off contract. The top-level session (you) orchestrates, reviews each
subagent's output before proceeding, and keeps the `paper/` writeup in sync.

```
Phase 5 — frontend shell + backend extensions (parallel-safe)
    ├─ layout-shell       ────── pane/view registry, persona layouts, bottom dock scaffold
    └─ backend-extensions ────── 5 new endpoint groups, all through NGSP pipeline

Phase 6 — views (parallel-safe, depends on Phase 5)
    ├─ reviewer-views     ────── case-timeline + signal-map
    ├─ analyst-views      ────── dataset-preview + dashboard
    └─ forensic-and-mcp   ────── shared bottom dock + ExportActions row

Phase 7 — integration
    └─ integration-and-demo ──── seed data, demo scripts, reset tooling, runbook
```

`research-writer` continues in the background from Phase 1 and documents each new
component as it lands.

Before dispatching any subagent, use the `context7` MCP to check current
documentation for:

  (a) D3 v7+ layout modules (axis, scale, force, polygon hull) and whether D3 or a
      higher-level wrapper (visx, Nivo, Recharts) is the currently-recommended default
      for composable dashboards in React + TypeScript as of April 2026.
  (b) TanStack Table (v8 or later) for the virtualized dataset preview.
  (c) The Anthropic Python SDK's current pattern for tool use, since MCP dispatch
      endpoints will likely invoke connector-style tools.
  (d) FastAPI patterns for dependency-injecting shared state (the NGSP pipeline,
      audit log, session budget) across multiple routers.

Record every documentation query and its outcome in `paper/methodology.md` under a
new "Phase 5-7 architecture decisions" section. If `context7` recommends replacing a
library named in this plan (e.g. swapping Recharts for visx, or TanStack for a
newer virtual-table library), update the plan before dispatching the affected agent.

---

## Phase 5a — dispatch `layout-shell` (do this first; parallel-safe with 5b)

**Task to dispatch (use the Task tool):**

> You are the `layout-shell` subagent. Read CLAUDE.md including §§11 and 13. Your job
> is to own the VS-Code-style shell: title bar, activity bar, pane container system,
> view registry, persona layouts, bottom dock scaffolding, keyboard shortcuts, and
> layout persistence. You do not implement individual views. You build the frame they
> live in, plus two placeholder views per persona so the shell is demonstrable end-to-
> end.
>
> Before writing any code, check the existing frontend in `frontend/src/` — App.tsx,
> ActivityBar.tsx, TitleBar.tsx, Workspace.tsx, AssistantPanel.tsx — and plan the
> refactor. Most of the existing shell can stay; what's missing is the pane/view
> registry, persona switching, and the bottom dock. Do not rewrite what works.
>
> **Deliverables:**
>
> 1. `frontend/src/layout/ViewRegistry.ts` — exports `ViewDefinition`, `ViewId`,
>    `PaneSlot` types matching CLAUDE.md §11.2. Exports a `VIEW_REGISTRY` map keyed
>    by view id. During this phase the map contains placeholder components for
>    `dataset-preview`, `chat`, `dashboard`, `narrative-input`, `case-timeline`,
>    `signal-map` — real implementations come from Phase 6. Placeholder components
>    render the view id and a brief description so the shell is inspectable.
>
> 2. `frontend/src/layout/PersonaLayouts.ts` — exports the two persona layout presets
>    from CLAUDE.md §11.3. Each preset specifies which view occupies which pane by
>    default, along with default pane widths as percentages (left 25%, main 45%,
>    right 30% on first load).
>
> 3. `frontend/src/layout/PaneContainer.tsx` — renders one pane: header with view-
>    picker dropdown (listing only views whose `validPanes` includes this slot), a
>    collapse toggle, and the rendered view component. Respects the pane's current
>    view id from layout state.
>
> 4. `frontend/src/layout/SplitterGroup.tsx` — horizontal splitter group that wraps
>    three `PaneContainer` instances with draggable dividers. Splitter drag updates
>    widths in the layout state. Handles collapse: a collapsed pane renders as a
>    thin vertical bar with an expand affordance; dividers bordering it become
>    non-draggable.
>
> 5. `frontend/src/layout/BottomDock.tsx` — scaffold only. Renders a collapsed bar at
>    the bottom of the window showing a single-line placeholder. Expanding renders
>    an empty three-column grid. The actual forensic log population belongs to the
>    `forensic-and-mcp` agent in Phase 6; this agent ships the empty shell with the
>    correct collapse/expand/drag behavior.
>
> 6. `frontend/src/hooks/useLayoutState.ts` — layout state lives in React context,
>    persisted to `localStorage` under `ngsp.layout.<persona>`. The hook exposes:
>    `currentPersona`, `setPersona`, `panes`, `setPaneView`, `setPaneWidth`,
>    `collapsePane`, `expandPane`, `bottomDock`, `setBottomDockState`. On persona
>    switch, load that persona's saved layout or fall back to the default preset.
>
> 7. Refactor `frontend/src/App.tsx` to: wrap the app in the layout state provider,
>    render `TitleBar`, `ActivityBar`, `SplitterGroup`, and `BottomDock`, and
>    remove the hard-coded Workspace + AssistantPanel split. The Workspace file can
>    stay as a reference but is no longer imported by App.
>
> 8. Refactor `frontend/src/components/ActivityBar.tsx` so the RECORDS icon selects
>    the Reviewer persona and the VITALS icon selects the Analyst persona. Other
>    icons remain disabled ("production feature" tooltip) as in the current code.
>
> 9. `frontend/src/hooks/useKeyboardShortcuts.ts` — implements:
>    - `Cmd/Ctrl+1` focus left pane, `Cmd/Ctrl+2` main, `Cmd/Ctrl+3` right.
>    - `Cmd/Ctrl+B` collapse/expand the focused pane.
>    - `Cmd/Ctrl+J` collapse/expand the bottom dock.
>    - `Cmd/Ctrl+Shift+P` open the view-picker for the focused pane.
>    - `Cmd/Ctrl+K 1` switch to Analyst persona, `Cmd/Ctrl+K 2` Reviewer.
>    Document shortcuts in `docs/shortcuts.md`.
>
> 10. Vitest coverage for: `useLayoutState` persistence roundtrip, persona switch
>     restores saved layout, view-picker only offers views valid for the slot,
>     collapse/expand behavior, keyboard shortcut dispatch.
>
> **Invariants:**
> - Every function has a one-line explanation comment above its declaration.
> - TypeScript `strict` mode; no `any` without a comment justifying it.
> - No inline styles beyond CSS variables.
> - Transitions under 250 ms, motion-reduced-respectful.
> - All new code passes `npm run lint` and `npm run typecheck`.
>
> **Hand-off:** Produce `frontend/src/layout/README.md` describing the registry,
> layout persistence format, and how Phase 6 agents add their views. Push a running
> demo where a judge can switch personas and watch both default layouts render
> placeholder views, resize panes, and collapse/expand the bottom dock. Notify the
> top-level agent.

---

## Phase 5b — dispatch `backend-extensions` (parallel-safe with 5a)

**Task to dispatch:**

> You are the `backend-extensions` subagent. Read CLAUDE.md including §§2, 12, and
> 13. Your job is to add five new endpoint groups to the existing FastAPI service
> and route every one of them through the existing NGSP pipeline so that the
> privacy + audit invariants apply uniformly.
>
> Before writing any code, use the `context7` MCP to check current FastAPI patterns
> for modular routers with shared dependencies, the current Anthropic Python SDK
> tool-use surface (for the MCP dispatch endpoint), and the current pydantic v2
> idioms. Record findings in `paper/methodology.md`.
>
> Then read the existing `backend/main.py`, `backend/schemas.py`, and the NGSP
> pipeline modules in `src/ngsp/` so your new code reuses them rather than
> duplicating behavior.
>
> **Deliverables:**
>
> 1. `backend/endpoints/timeline.py` — `POST /api/timeline/assemble` per §12.1.
>    Extract entities and temporal references locally; route abstract clinical
>    reasoning ("given these onset/dose/dechallenge facts, what is the WHO-UMC
>    causality verdict and rationale?") through the existing NGSP pipeline; re-apply
>    the entity map locally to produce the grounded response. Returns a
>    `TimelineResponse` matching the TS type in §12.1.
>
> 2. `backend/endpoints/signal.py` — `POST /api/signal/cluster` per §12.2. Local
>    code computes cross-case patterns from the session's in-memory case store
>    (seeded by `integration-and-demo`). Cloud receives only the abstract pattern
>    description. Returns `SignalResponse`.
>
> 3. `backend/endpoints/dataset.py` — `GET /api/dataset/schema` and
>    `POST /api/dataset/query` per §12.3. Query response includes a per-cell
>    entity annotation so the frontend can render privacy-aware highlighting.
>
> 4. `backend/endpoints/dashboard.py` — `POST /api/dashboard/generate` per §12.4.
>    Aggregates the dataset locally (counts, ranges, distributions) into an entity-
>    stripped summary; sends the summary plus the user's natural-language prompt to
>    the cloud via the existing NGSP pipeline; receives a chart-grid spec + narrative
>    summary. Returns `DashboardSpec`.
>
> 5. `backend/endpoints/mcp.py` — `POST /api/mcp/dispatch` per §12.5. Routes to the
>    appropriate MCP client based on the `connector` field. For the hackathon, the
>    `email` and `calendar` connectors use real MCP clients if available in the
>    environment; `vault_safety`, `rave_edc`, and `argus` are stubs that return a
>    synthetic receipt. Every dispatch writes a forensic audit line.
>
> 6. `backend/schemas.py` — add the pydantic request/response models for all five
>    endpoint groups. Every model has a docstring describing its contract.
>
> 7. `backend/main.py` — register the new routers under the `/api` prefix. The
>    existing endpoints are untouched.
>
> 8. `backend/tests/` — at least one pytest smoke test per endpoint group. Tests
>    use the existing `sk-ant-mock` offline mode so they don't require network.
>    Every test asserts that the endpoint writes an audit line and that the audit
>    line contains no raw input or output content.
>
> 9. Update `backend/README.md` with the new endpoints and an example curl for each.
>
> **Invariants (restated):**
> - Every new endpoint writes a hashed audit line.
> - No endpoint bypasses the NGSP pipeline for cloud calls.
> - Canary scanning runs before any outbound traffic.
> - Every function has a one-line explanation comment above its `def`.
>
> **Hand-off:** Push a running backend where all new endpoints return well-formed
> mock responses in offline mode. Notify the top-level agent with the full list of
> endpoint paths + request/response shapes so Phase 6 agents can wire their UIs.

---

## Phase 6a — dispatch `reviewer-views` (after Phase 5 lands)

**Task to dispatch:**

> You are the `reviewer-views` subagent. Read CLAUDE.md including §§11.2, 11.3, and
> 13.3. Your job is to implement the Reviewer persona's two primary views — the
> case timeline and the signal map — and register them in the view registry built
> by `layout-shell`.
>
> Before writing any code, use `context7` to confirm current D3 v7+ patterns for:
> multi-track horizontal timelines with independent y-axes, scatter plots with
> density-based cluster hulls (d3-polygon hull, d3.contourDensity, or d3-hexbin),
> and time-scale axes with clinical-trial-appropriate tick formatting.
>
> **Deliverables:**
>
> 1. `frontend/src/views/reviewer/CaseTimelineView.tsx` — the multi-track timeline
>    described in the product spec. Four tracks: event severity band, IP dosing
>    markers, concomitant medication bars, and a lab sparkline with threshold bands.
>    System-generated annotations (onset latency, dechallenge, rechallenge, WHO-UMC
>    causality) render as callouts on the correct tracks. Data comes from
>    `/api/timeline/assemble`. The view has an empty state, a loading state
>    (skeleton tracks), an error state, and a populated state.
>
> 2. `frontend/src/views/reviewer/SignalMapView.tsx` — 2D scatter with vertical axis
>    = site and horizontal axis = trial day. Dot color = severity grade, dot size =
>    event multiplicity at that coordinate. Auto-detected clusters render as soft
>    convex hulls around density-significant groups. The current case pulses with a
>    ring. A side panel shows the cloud-generated hypothesis and recommended actions.
>    Data from `/api/signal/cluster`.
>
> 3. `frontend/src/hooks/useTimelineData.ts` and `useSignalData.ts` — typed data
>    fetchers with loading/error state.
>
> 4. Register both views in `frontend/src/layout/ViewRegistry.ts`, replacing the
>    placeholders shipped by `layout-shell`. Update `validPanes` so the timeline
>    and signal map can be placed in the main or right pane but not left.
>
> 5. Both views embed the shared `ExportActions` row beneath their primary output.
>    `ExportActions` itself is built by `forensic-and-mcp`; import it once that
>    agent lands. If you dispatch before `forensic-and-mcp` finishes, use a typed
>    placeholder import and leave a `TODO(forensic-and-mcp)` comment.
>
> 6. Visual regression: add a Storybook story (or equivalent snapshot fixture) for
>    each view's populated state using a deterministic fixture.
>
> 7. Vitest coverage for data hooks and interaction behavior (hovering an
>    annotation reveals the source phrase, dragging a dose marker fires a correction
>    event, clicking a cluster opens the side panel).
>
> **Invariants:**
> - Every function has a one-line explanation comment above its declaration.
> - No real PHI in fixture data; use the synthetic corpus generators.
> - Timeline and signal map must each render in under 5 s on a warm cache with the
>   standard fixture; document measured render times in the view README.
> - All interactive elements are keyboard-accessible.
>
> **Hand-off:** Push a running Reviewer persona where the timeline assembles from
> narrative input and the signal map shows a cluster with a cloud-generated
> hypothesis. Produce `frontend/src/views/reviewer/README.md` with the data contracts
> and any design decisions. Notify the top-level agent.

---

## Phase 6b — dispatch `analyst-views` (parallel-safe with 6a)

**Task to dispatch:**

> You are the `analyst-views` subagent. Read CLAUDE.md including §§11.2, 11.3, and
> 13.4. Your job is to implement the Analyst persona's two primary views — the
> dataset preview and the dashboard generator — and register them in the view
> registry. The chat view already exists in `frontend/src/components/AssistantPanel.tsx`;
> integrate with it without rewriting it.
>
> Before writing any code, use `context7` to:
>   (a) confirm TanStack Table v8+ for the virtualized table (or identify a better
>       current alternative),
>   (b) choose a charting library for the dashboard — evaluate Recharts, visx,
>       Nivo, and raw D3. Optimize for: composable chart types, typed props, small
>       bundle, React + TypeScript ergonomics. Document the choice in
>       `frontend/src/views/analyst/README.md` and justify briefly.
>
> **Deliverables:**
>
> 1. `frontend/src/views/analyst/DatasetPreviewView.tsx` — virtualized table of the
>    synthetic clinical-trial dataset. Sticky header, column sort, column filter,
>    per-cell entity highlighting (cells containing placeholders render with a
>    subtle `--color-border-secondary` underline and a tooltip showing the
>    placeholder type). Pagination via cursor from `/api/dataset/query`. Empty,
>    loading, and error states.
>
> 2. `frontend/src/views/analyst/DashboardView.tsx` — a prompt input + a chart grid.
>    User types a natural-language request ("show me AE distribution by site over
>    the last 30 days"); view calls `/api/dashboard/generate`; renders the
>    returned spec as a grid of charts with a narrative summary above them.
>
> 3. `frontend/src/views/analyst/ChartGrid.tsx` — generic renderer that maps a
>    `ChartSpec` to the chosen library's component. Supports the chart types in
>    §12.4: bar, line, stacked bar, KPI tile, heatmap.
>
> 4. `frontend/src/hooks/useDatasetQuery.ts` and `useDashboardSpec.ts` — typed
>    fetchers.
>
> 5. Register both views in `ViewRegistry.ts`, replacing their placeholders.
>    `dataset-preview` is valid in left and main; `dashboard` is valid in main and
>    right.
>
> 6. The dashboard view embeds the shared `ExportActions` row beneath the chart
>    grid. Same `TODO(forensic-and-mcp)` dance as in 6a if that agent hasn't
>    landed yet.
>
> 7. Vitest coverage for table sort/filter/pagination and dashboard spec rendering.
>
> **Invariants:**
> - Table must stay responsive with 10,000 synthetic rows (virtualization required).
> - Every function has a one-line explanation comment.
> - Chart grid handles an unknown chart type gracefully with a labeled fallback.
> - The natural-language prompt is sent through the backend (which routes it
>   through the NGSP pipeline), never directly to any cloud API from the browser.
>
> **Hand-off:** Push a running Analyst persona where the dataset loads in the left
> pane, the assistant chat works in the main pane, and a prompt-driven dashboard
> renders in the right pane. Notify the top-level agent.

---

## Phase 6c — dispatch `forensic-and-mcp` (parallel-safe with 6a and 6b)

**Task to dispatch:**

> You are the `forensic-and-mcp` subagent. Read CLAUDE.md including §§11.4, 11.5,
> and 13.5. Your job is to fill in the forensic bottom dock shipped as a scaffold
> by `layout-shell`, and to build the shared `ExportActions` row used by both
> persona workflows.
>
> **Deliverables:**
>
> 1. `frontend/src/layout/BottomDockForensic.tsx` — replaces the placeholder content
>    of `BottomDock.tsx`. Collapsed state: single-line scrolling activity feed
>    pulling from `/api/audit` in the format from §11.4. Expanded state: three-lane
>    view with `Proxy Sent`, `Cloud Response`, `Rehydrated` columns, each row one
>    `/api/complete` call. Canary-leak rows render with the `--color-danger`
>    accent. A running ε total is visible beside each row.
>
> 2. `frontend/src/components/ExportActions.tsx` — a row of MCP action chips. Props:
>    `{ context: "reviewer" | "analyst", payload: unknown }`. The component
>    renders the context-appropriate chips (§11.5) and invokes `/api/mcp/dispatch`
>    when a chip is clicked. On success, shows a subtle toast with the MCP receipt.
>    On failure, shows an inline error with the reason.
>
> 3. `frontend/src/lib/mcp.ts` — typed helper functions for each MCP connector.
>    Thin wrappers over fetch to `/api/mcp/dispatch`.
>
> 4. `frontend/src/hooks/useForensicStream.ts` — polls `/api/audit` every 2 seconds,
>    exposes the current tail of the audit log. On receiving a new entry,
>    animates it into the collapsed feed over ~600 ms.
>
> 5. Vitest coverage: the forensic dock only renders metadata (asserting no raw
>    prompt or response ever appears in the DOM); ExportActions dispatches the
>    correct MCP payload per chip; canary rows render with the danger style.
>
> **Invariants:**
> - Never log raw prompts or responses to the browser console.
> - Every function has a one-line explanation comment.
> - The forensic dock works identically across both personas; no persona-specific
>   branching in the dock's own code.
> - The `ExportActions` row gracefully handles an MCP connector that returns
>   `not_configured` (e.g. calendar MCP is absent in the demo environment) with a
>   disabled chip + tooltip instead of a hard error.
>
> **Hand-off:** Push a running workspace where the forensic dock ticks in real time
> as users exercise the personas, and where clicking an export chip beneath a
> workflow output produces a visible MCP receipt. Produce
> `frontend/src/layout/FORENSIC.md` describing the dock's data flow. Notify the
> top-level agent.

---

## Phase 7 — dispatch `integration-and-demo` (after all of Phase 6 lands)

**Task to dispatch:**

> You are the `integration-and-demo` subagent. Read CLAUDE.md including §13.6. Your
> job is to make the product demonstrable: realistic fixture data, two scripted
> demo flows that each finish in under 90 seconds, a single-command reset, and a
> runbook the team uses live.
>
> **Deliverables:**
>
> 1. `scripts/seed-demo.py` — generates and loads a cohesive fixture into the
>    backend's in-memory stores: one SAE narrative (with a visible signal — e.g.
>    three Grade 3+ thrombocytopenia events at the same site within 21 days), a
>    dataset of ~300 synthetic subjects across 6 sites, and a handful of prior
>    cases that make the signal map interesting. All data is synthetic per
>    CLAUDE.md §7.
>
> 2. `scripts/reset-demo.sh` — one command that: stops running servers, clears the
>    audit log, clears local layout state (optional flag), re-seeds the fixture,
>    restarts backend and frontend. Idempotent.
>
> 3. `docs/demo-script.md` — two demo flows, each with a 90-second target:
>    - **Reviewer flow.** Start on the Reviewer persona. Paste the SAE narrative
>      into the narrative-input view. Watch the case timeline assemble. Click the
>      signal map — it highlights a cluster that contains the current case and
>      shows the cloud-generated hypothesis. Click "Flag to medical monitor" in
>      the `ExportActions` row: an MCP calendar hold is dropped on the monitor's
>      calendar, an email draft is created. End state: expanded forensic dock
>      showing the two cloud calls made (causality reasoning, cluster hypothesis)
>      with hashed payloads and ε running total.
>    - **Analyst flow.** Start on the Analyst persona. The dataset preview is
>      already populated. Type into the dashboard view: "Compare AE rates across
>      sites for the last 30 days and flag any site with a rate above 2x the mean."
>      Watch the dashboard render a bar chart + KPI tiles + a narrative summary.
>      Click "Send to CMO" in the `ExportActions` row: an MCP email is drafted
>      with the dashboard attached. End state: the forensic dock shows the
>      aggregation-only cloud call with a hashed payload.
>
> 4. `docs/shortcuts.md` — list of keyboard shortcuts introduced by `layout-shell`
>    plus any view-specific shortcuts from Phase 6 agents.
>
> 5. Update the repo's top-level `README.md` to a proper user-facing overview: what
>    the product is, who it's for, how to run it, pointers to the research paper
>    and the demo script.
>
> 6. A pass through every feature confirming that: both demo flows complete in
>    under 90 s on reference hardware (document the hardware in the runbook);
>    the forensic dock reflects every cloud call with no raw content; every
>    persona's layout persists correctly across reloads; collapsing any pane
>    doesn't break the layout; keyboard shortcuts work on both mac and linux.
>
> **Invariants:**
> - No real PHI anywhere.
> - Scripts must exit with non-zero on any setup failure.
> - Demo script timings are measured, not guessed. Record the measurements.
>
> **Hand-off:** Produce a one-paragraph summary for the top-level agent containing:
> the two demo flow names, their measured wall-clock times, the reference hardware,
> and any known rough edges. This paragraph goes into the paper's "Demo" section.

---

## Orchestration rules for the top-level session

- **Dispatch one subagent at a time in the dependency order above**, except where
  noted parallel-safe. `layout-shell` + `backend-extensions` in parallel first;
  then the three Phase-6 agents in parallel; then `integration-and-demo`.

- **Read each subagent's output before dispatching the next.** Spot-check that the
  deliverables exist, that smoke tests pass, that the CLAUDE.md invariants are
  respected, and that the produced README is coherent.

- **If a subagent asks for a decision** (e.g., "which charting library?"), make the
  call in the direction most defensible per the `context7` evidence. Record the
  decision in `paper/methodology.md`.

- **Do not let `research-writer` block Phase 5-7 progress.** It runs continuously; if
  it's mid-update when you need to dispatch, proceed and let it catch up.

- **Before dispatching any subagent, remind it to use `context7` MCP for current
  documentation** on the specific libraries it will touch. Training-data knowledge
  of frontend libraries in particular is unreliable at this cadence.

- **After Phase 6 completes, run the existing attack suite one more time** against
  the extended backend to confirm no new endpoint weakened the privacy story.
  Commit the results to `experiments/results/final/`.

## Success criteria

The work is done when:

1. `./scripts/reset-demo.sh` brings the whole system up from clean in under 30 s.
2. The Analyst persona loads by default and produces a dashboard in under 90 s from
   a natural-language prompt.
3. The Reviewer persona assembles a case timeline and renders a signal-map cluster
   with cloud-generated hypothesis, end-to-end in under 90 s.
4. Every workflow's cloud call appears in the forensic dock with no raw content.
5. Clicking an export chip beneath either persona's output produces a visible MCP
   receipt (real for email/calendar if connectors available, synthetic for clinical
   system stubs).
6. `paper/paper.md` has a new "Client architecture" section documenting the
   persona model, the view registry, the forensic dock, and the MCP fulfillment
   layer.
7. `scripts/check_comments.py` reports zero violations across `frontend/src/` and
   `backend/`.

Begin with Phase 5: dispatch `layout-shell` and `backend-extensions` in parallel.