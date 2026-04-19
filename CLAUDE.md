# CLAUDE.md

This file is the persistent project context. Claude Code reads it on every session. Do not delete. Update it when architectural decisions change.

---

## 1. Project mission

Enterprise and clinical trial staff routinely paste sensitive content into consumer LLM chat interfaces (ChatGPT, Claude) because the tools are faster than their sanctioned alternatives. The leaked content includes Protected Health Information (PHI), Material Non-Public Information (MNPI), unpublished protocol designs, preliminary efficacy data, internal compound codenames, and regulator correspondence. Existing defenses — regex redaction, Data Loss Prevention (DLP) blocks, Business Associate Agreement (BAA) wrappers — either over-redact and destroy utility, or under-redact and leak.

This project builds and empirically evaluates a **Neural-Guided Semantic Proxy (NGSP)** architecture that runs Gemma 4 locally as a privacy filter between the user and a closed cloud LLM (the Anthropic API), composed with a deterministic Safe Harbor front end and a calibrated (ε, δ)-differentially-private (DP) noise layer. The research question is whether the composed system can simultaneously preserve task utility above 85% and bound inversion attack accuracy below the Expert Determination re-identification threshold (typically 0.09) on synthetic clinical trial workloads.

The deliverable is a reproducible research prototype: working code, an adversarial test harness, a mock clinical trial dataset with ground-truth sensitive span annotations, and a research-paper-style writeup including negative results.

## 2. Architecture

Three-path router, with Gemma 4 as the local decision-maker:

```
user input
   │
   ▼
[Safe Harbor stripper]  ← deterministic regex/NER for 18 HIPAA identifiers
   │
   ▼
[Gemma 4 router]  ← classifies request: abstract-extractable | DP-tolerant | local-only
   │
   ├── abstract-extractable (~70%)  →  [Query Synthesizer]  →  proxy text  ┐
   ├── DP-tolerant         (~20%)  →  [DP bottleneck + proxy decoder]     ┤
   └── local-only          (~10%)  →  [Local Gemma answer]                │
                                                                           │
                                   Anthropic API  ← ← ← ← ← ← ← ← ← ← ← ┘
                                        │
                                        ▼
                                [Answer Applier]  ← re-apply entity_map locally
                                        │
                                        ▼
                                   user response
```

Key properties:
- **Safe Harbor stripping is the primary PHI defense.** NGSP is a secondary defense against quasi-identifier recombination and free-text leakage, not the primary shield.
- **The DP path gives formal (ε, δ) bounds.** Track cumulative ε per session; hard-refuse once the session budget is exhausted.
- **Query synthesis beats content translation.** For abstract-extractable tasks, generate a new self-contained query rather than encoding the input — this sidesteps inversion because the mapping is non-injective.
- **Canary tokens run in the background.** Every test input contains a unique sentinel string; if it ever appears in an outbound API call, we've detected a leak independent of the test suite.

## 3. Technical decisions

**Local model: Gemma 4.** Loaded via `transformers` or `llama.cpp` (whichever is more stable at implementation time — check with context7 MCP for current Gemma 4 inference recommendations). Quantized if needed to fit the target hardware. All activations, entity maps, and intermediate representations stay on-device.

**DP mechanism: Gaussian with Rényi DP accounting.** σ calibrated as σ = Δ · √(2 ln(1.25/δ)) / ε where Δ is the L2 sensitivity of the bottleneck projection. Use `opacus` or a minimal in-house accountant. Default target (ε=3.0, δ=1e-5) per session; expose as config.

**Remote client: Anthropic Python SDK.** Use the latest Claude model available. All calls go through a single `remote_client.py` so the canary detection, retry logic, and audit logging are centralized.

**Sensitivity of the bottleneck must be clipped.** Unbounded activations break DP guarantees. Every vector entering the noise mechanism passes through an L2 norm clip with a known bound.

**Everything logged, nothing sensitive logged.** The audit log records: request ID, routing decision, ε spent, proxy text hash, response hash, timestamp. It never records raw inputs, raw outputs, or entity_map contents.

## 4. Repository structure

```
ngsp-clinical/
├── CLAUDE.md                       ← this file
├── README.md                       ← user-facing overview
├── pyproject.toml                  ← dependencies, build config
├── .env.example                    ← ANTHROPIC_API_KEY, HF_TOKEN
├── src/ngsp/
│   ├── __init__.py
│   ├── local_model.py              ← Gemma 4 wrapper (load, generate, hidden states)
│   ├── safe_harbor.py              ← deterministic HIPAA 18-identifier stripper
│   ├── entity_extractor.py         ← quasi-identifier extraction via Gemma
│   ├── router.py                   ← abstract-extractable | DP-tolerant | local-only classifier
│   ├── query_synthesizer.py        ← abstract query generation for path 1
│   ├── dp_mechanism.py             ← Gaussian noise + Rényi ε accountant
│   ├── proxy_decoder.py            ← noisy embeddings → proxy text for path 2
│   ├── remote_client.py            ← Anthropic API wrapper, canary check, audit
│   ├── answer_applier.py           ← re-apply entity_map to response
│   └── pipeline.py                 ← end-to-end orchestration
├── src/attacks/
│   ├── verbatim.py                 ← attack 1: literal + fuzzy substring scan
│   ├── similarity.py               ← attack 2: cross-encoder cosine similarity
│   ├── inversion.py                ← attack 3: trained span predictor on proxies
│   ├── membership.py               ← attack 4: entity membership inference
│   └── utility.py                  ← attack 5: downstream QA utility benchmark
├── src/data/
│   ├── synthetic_sae.py            ← mock Serious Adverse Event narratives
│   ├── synthetic_protocol.py       ← mock protocol excerpts
│   ├── synthetic_monitoring.py     ← mock Clinical Research Associate reports
│   ├── synthetic_writing.py        ← mock Clinical Study Report excerpts
│   ├── annotator.py                ← ground-truth sensitive span labeler
│   └── schemas.py                  ← typed dataclasses for all record types
├── tests/                          ← pytest unit tests
├── experiments/
│   ├── run_attacks.py              ← full attack battery at a given ε
│   ├── calibrate_epsilon.py        ← sweep ε, measure privacy/utility curve
│   ├── ablations.py                ← components on/off comparisons
│   └── results/                    ← JSON results, never committed raw
├── paper/
│   ├── paper.md                    ← research-paper-style writeup
│   ├── hypothesis.md               ← formal hypothesis statement
│   ├── methodology.md              ← methods, threat model, metrics
│   ├── results.md                  ← tables and findings, including negatives
│   ├── discussion.md               ← interpretation, limitations, future work
│   └── figures/                    ← all generated plots
└── scripts/
    ├── download_gemma.py           ← one-shot model download
    └── setup.sh                    ← environment bootstrap
```

## 5. Coding standards

**Every function has a one-line comment directly above its `def` line** explaining what the function does in plain English. This is a hard rule. The comment must describe the function's contract, not restate its name. Example:

```python
# Given a raw user input, return the list of Safe Harbor identifier spans detected.
def extract_safe_harbor_spans(text: str) -> list[Span]:
    ...
```

Type hints on every public function signature. `dataclasses` or `pydantic` for any structured record. No silent exception swallowing — errors propagate or are logged with explicit justification.

Tests live in `tests/` and use `pytest`. Run with `pytest -q`. Every attack implementation has at least one smoke test that confirms it runs end-to-end on a tiny fixture.

All model calls (local Gemma and remote Anthropic) go through wrapper modules. Never call `model.generate` or `client.messages.create` directly from business logic — this is a hard invariant, because the wrappers are where the audit logging and canary detection live.

## 6. Subagent roles

This project uses five specialized subagents dispatched via the Task tool. Each has a narrow remit. The orchestrator agent (you, the top-level Claude Code session) coordinates them.

1. **`ngsp-core`** — implements NGSP components: local model wrapper, router, query synthesizer, DP mechanism, proxy decoder, answer applier, pipeline. Owns `src/ngsp/`. Calibrates ε against privacy/utility targets. Must consult context7 MCP for current Gemma 4 inference best practices before implementation.

2. **`attack-suite`** — implements the five attack classes in `src/attacks/`. Runs them against the NGSP pipeline at different ε values and records quantitative results. Must produce reproducible numbers: seed all randomness, log model versions, save inputs.

3. **`research-writer`** — owns `paper/` and writes the research-paper-style documentation as experiments complete. Records hypothesis, methodology, each attack's setup, results (including negative results), and interpretation. Also audits that every function in the codebase has a one-line explanation comment; flags violations back to the other agents. Writes the final `README.md`.

4. **`integration`** — wires the local Gemma 4 inference stack to the Anthropic API. Owns `src/ngsp/local_model.py`, `src/ngsp/remote_client.py`, `scripts/download_gemma.py`, and `scripts/setup.sh`. Handles authentication, retries, rate limits, canary injection, audit logging. Uses context7 MCP to check current Anthropic SDK and Gemma transformers documentation.

5. **`mock-data`** — owns `src/data/`. Generates synthetic clinical trial documents (Serious Adverse Event narratives, protocol excerpts, Clinical Research Associate monitoring reports, medical writing drafts) with ground-truth sensitive span annotations. Output is a labeled corpus the attack suite can evaluate against. Documents are synthetic but structurally realistic — no real PHI, no real compound codenames, no real clinical data.

## 7. Invariants (never violate)

- **No real PHI enters the repository.** The corpus is synthetic by construction. Any accidental inclusion of real patient data is a project-level incident.
- **No API key in code or git history.** Use `.env` files and `python-dotenv`. `.env.example` goes in the repo; `.env` never does.
- **No raw inputs or outputs in logs.** Audit logs contain hashes and metadata only.
- **Canary tokens are injected into every test input.** If any canary ever reaches the outbound API, that run is a failure regardless of other metrics.
- **DP ε accounting is session-scoped and monotone.** Cumulative ε can only increase within a session; a fresh session resets. The system hard-refuses when the session budget is exhausted.
- **Every function has a one-line explanation comment.** `research-writer` audits this; CI fails if violations are detected.

## 8. External documentation

Use the context7 MCP to look up current documentation when needed. Primary references:
- Gemma 4 model card and inference docs (Hugging Face, Google)
- Anthropic Python SDK (anthropic-sdk-python)
- `transformers` library for hidden-state extraction
- `opacus` for DP mechanisms and Rényi accountant
- `sentence-transformers` for cross-encoder similarity attack
- HIPAA Safe Harbor 18 identifiers (HHS guidance)
- ICH E6 Good Clinical Practice for clinical document structure
- TMF Reference Model for document taxonomy

Do not rely on training-data memory for these APIs. Check current docs with context7 before writing integration code.

## 9. How to run

```bash
# one-time setup
./scripts/setup.sh
python scripts/download_gemma.py
cp .env.example .env  # then fill in ANTHROPIC_API_KEY, HF_TOKEN

# run unit tests
pytest -q

# run the full attack battery at default ε=3.0
python experiments/run_attacks.py --epsilon 3.0

# sweep ε from 0.5 to 10.0 and produce the privacy/utility curve
python experiments/calibrate_epsilon.py --epsilons 0.5,1.0,2.0,3.0,5.0,10.0

# render the research paper from paper/*.md
# (paper is plain markdown; render with any pandoc pipeline if PDF is needed)
```

## 10. Definition of done

The project is complete when:
1. The pipeline runs end-to-end on a synthetic clinical trial input and produces a useful answer from the Anthropic API.
2. The attack suite runs reproducibly and produces quantitative results for all five attack classes at three or more ε values.
3. The research paper in `paper/` contains a formal hypothesis, methodology, results tables (including negative results), and a discussion that honestly states limitations.
4. Every function in `src/` has a one-line explanation comment above its `def`.
5. A fresh clone + `./scripts/setup.sh` + `pytest -q` passes on a supported machine.

## 11. Product build phase (branch: `product-build`)

The research prototype is complete on `main`. The hackathon submission is being
assembled on the `product-build` branch, which wraps the research code with a
FastAPI backend and a Vite + React frontend. The foundational rules for this
phase come from `FINALIZE_PLAN.md` and are restated here so they survive
context compaction:

- **Do not modify the research code.** `src/ngsp/`, `src/attacks/`, `src/data/`,
  `experiments/`, `paper/`, and `tests/` are frozen on `product-build`. If a
  bug in research code surfaces during product integration, fix it on a
  separate branch off `main`, merge that into `main`, then rebase
  `product-build` on top. Never rewrite research code inline on
  `product-build`.
- **`pytest -q` must continue to pass.** Baseline is `57 passed, 3 skipped`.
  Every product-build commit is validated against this gate.
- **All product-build changes are logged in `product-build/CHANGELOG.md`.**
  One dated entry per step with the concrete files touched.
- **One commit per step.** Commit messages use the `[step-N]` prefix to match
  FINALIZE_PLAN.md.
- **Secrets never enter git.** The root `.env` and `frontend/.env` are
  ignored; only `.env.example` files are tracked. The CI secret-scan regex
  (`sk-ant-`, `hf_`, `sk-proj-`, `AKIA`) must stay at zero hits on tracked
  files.
- **Frontend stack is fixed.** Vite + React + TypeScript + Tailwind v4. Do not
  convert to Next.js or any other framework. The original plan's
  `docs/stitch-mockup.html` is obsolete — the live `frontend/` scaffold
  replaces it.
- **Anthropic primary, Gemini optional.** The model selector in
  `/api/complete` accepts `claude-opus-4 | gpt-5 | gemini-2`. Anthropic is the
  default (mock mode offline); Gemini is retained because the FRONTEND drop
  already shipped `@google/genai` — no additional work, just keep the path
  usable.
- **No raw PHI ever leaves the backend.** Only proxy text goes to any remote
  provider. This is identical to the research invariant and must hold for
  the product build.

  ## 12. Frontend architecture
 
The NGSP system ships a desktop-style enterprise client built with React + TypeScript,
modeled on VS Code's shell. It is *not* a web app; it is an application window with a
title bar, activity bar, three resizable panes, and a bottom dock. Users switch
*personas* from the activity bar; each persona provides a default pane layout, but
every pane is independently resizable, collapsible, and view-swappable.
 
### 12.1 Shell layout
 
```
┌──────────────────────────────────────────────────────────────────────┐
│  TitleBar: profile · entity chip · ε meter · mode toggle · settings  │
├───┬──────────────────────────────────────────────────────────────────┤
│ A │                                                                  │
│ C │   ┌────────────┐  ┌────────────┐  ┌────────────┐                 │
│ T │   │            │  │            │  │            │                 │
│ I │   │  Left Pane │  │  Main Pane │  │ Right Pane │                 │
│ V │   │            │  │            │  │            │                 │
│ I │   │            │  │            │  │            │                 │
│ T │   └────────────┘  └────────────┘  └────────────┘                 │
│ Y │                                                                  │
├───┴──────────────────────────────────────────────────────────────────┤
│  BottomDock: forensic log (collapsed by default)                     │
└──────────────────────────────────────────────────────────────────────┘
```
 
### 12.2 View registry
 
A **view** is a self-contained React component that renders inside a pane. Every view
declares its contract via `ViewDefinition`:
 
```ts
interface ViewDefinition {
  id: ViewId;                         // e.g. "case-timeline"
  title: string;                      // display name in pane header
  component: React.FC<ViewProps>;     // renders inside the pane
  validPanes: PaneSlot[];             // where it may be placed: "left" | "main" | "right"
  backendDeps: string[];              // e.g. ["/api/timeline", "/api/route"]
}
```
 
A `PaneContainer` renders one view at a time with a header that contains a
view-picker dropdown. The user may swap any pane's view to any other compatible view,
collapse the pane, or drag its splitter. Pane state is persisted per persona in
`localStorage` under the key `ngsp.layout.<persona>`.
 
Views currently planned:
 
| Id                 | Title              | Default in       | Backend deps                    |
|--------------------|--------------------|------------------|---------------------------------|
| `dataset-preview`  | Dataset            | Analyst / left   | `/api/dataset/query`            |
| `chat`             | Assistant          | Analyst / main   | `/api/complete`, `/api/route`   |
| `dashboard`        | Dashboard          | Analyst / right  | `/api/dashboard/generate`       |
| `narrative-input`  | Narrative          | Reviewer / left  | `/api/analyze`, `/api/proxy`    |
| `case-timeline`    | Case Timeline      | Reviewer / main  | `/api/timeline/assemble`        |
| `signal-map`       | Signal Detection   | Reviewer / right | `/api/signal/cluster`           |
 
### 12.3 Personas
 
A **persona** is a layout preset. Switching persona restores that persona's pane
layout from `localStorage`, or falls back to the default if none is saved.
 
Two personas are defined for the hackathon:
 
- **Analyst** (`VITALS` icon in the activity bar, *default* on first load). Layout:
  `dataset-preview` (left) · `chat` (main) · `dashboard` (right).
- **Reviewer** (`RECORDS` icon). Layout: `narrative-input` (left) · `case-timeline`
  (main) · `signal-map` (right).
Shared chrome across both: title bar, activity bar, bottom dock. The bottom dock is
*not* persona-scoped; forensic evidence applies to every workflow.
 
### 12.4 Bottom dock (forensic log)
 
Collapsed state: single scrolling line at the bottom of the window showing the most
recent NGSP pipeline event in the format:
 
```
HH:MM:SS · <event> · <details> · ε <cumulative>
```
 
Expanded state: three-lane view with column headers `Proxy Sent`, `Cloud Response`,
`Rehydrated`. Each row is one `/api/complete` call. Canary-leak events render with
the `--color-danger` accent. ε consumption renders as a running total beside each row.
 
The dock is never closed — only collapsed. One click expands it; one click collapses
it. Height is user-draggable when expanded.
 
### 12.5 MCP as fulfillment layer
 
MCP connectors (email, calendar, Vault Safety stub, Rave EDC stub, Argus stub) are
invoked via an "Export to…" action row beneath workflow outputs. They are *not*
activity-bar views. The row is implemented once in a shared `ExportActions` component
and embedded in any workflow that produces a publishable artifact:
 
- Reviewer workflow output (case timeline + extracted fields): export chips for email
  to investigator, calendar hold for medical monitor meeting, file to Vault Safety.
- Analyst workflow output (dashboard + summary): export chips for email to stakeholder,
  calendar meeting with attached chart, file to SharePoint stub.
MCP dispatch goes through `POST /api/mcp/dispatch` with a typed payload; the backend
routes to the appropriate connector and writes a forensic audit line.
 
### 12.6 Enterprise-tool posture
 
This is an enterprise application, not a consumer web product. Design consequences:
 
- No marketing copy, no onboarding tour, no feature-tour tooltips.
- Keyboard-first operation: every pane action has a shortcut (documented in
  `docs/shortcuts.md`).
- Information density is high. Whitespace serves legibility, not decoration.
- No gratuitous animation. Transitions are motion-reduced-respectful and under 250 ms.
- Single accent color (clinical teal / blue). Red reserved for errors and canary
  failure.
- Three fonts only: sans for chrome, serif for narrative prose, mono for codes / IDs.
---
 
## 13. Backend extensions
 
The FastAPI service in `backend/` grows five new endpoint groups, each reusing the
existing NGSP routing and forensic audit substrate from §2.
 
### 13.1 `/api/timeline/assemble`
 
**POST.** Body: `{ document: str }`. Returns a structured timeline:
 
```ts
interface TimelineResponse {
  demographics: { age_band: string; sex: string; site_id_placeholder: string };
  tracks: {
    event: TimelineBand[];          // severity grade over time
    dosing: TimelineMarker[];       // administration points + half-life windows
    conmeds: TimelineBar[];         // concomitant medication intervals
    labs: TimelineSparkline;        // relevant lab values with threshold bands
  };
  annotations: TimelineAnnotation[];  // dechallenge, onset latency, rechallenge, WHO-UMC
  causality: { verdict: string; rationale: string };
}
```
 
Internally: local model extracts entities and temporal references; cloud model (via
the existing NGSP routing) reasons about causality and writes the rationale; local
layer re-applies entities to produce the final grounded output. This is the three-way
capability split from CLAUDE.md §2 applied to the timeline workflow.
 
### 13.2 `/api/signal/cluster`
 
**POST.** Body: `{ study_id: str, current_case_id: str, window_days: int }`.
Returns:
 
```ts
interface SignalResponse {
  events: SignalEvent[];              // every AE in the window with { site, day, grade }
  clusters: SignalCluster[];          // auto-detected density clusters with convex hulls
  current_case_position: { site: string; day: int };
  hypothesis: string;                 // cloud-reasoned explanation for any cluster containing the current case
  recommended_actions: string[];      // one-click action stubs
}
```
 
Cross-case memory lives locally; cloud only receives the abstract pattern description,
never the raw case list.
 
### 13.3 `/api/dataset/*`
 
**GET /api/dataset/schema** returns the column schema of the loaded synthetic clinical
trial dataset (subjects, events, dosing, labs).
 
**POST /api/dataset/query** accepts a structured filter + sort + pagination spec and
returns a page of rows. Every cell that contains an entity is annotated with its
placeholder for the frontend to render privacy-aware highlighting.
 
### 13.4 `/api/dashboard/generate`
 
**POST.** Body: `{ prompt: str, dataset_id: str }`. Returns a chart grid spec:
 
```ts
interface DashboardSpec {
  title: string;
  charts: ChartSpec[];                // bar, line, stacked, kpi tile, heatmap
  narrative_summary: string;          // cloud-generated text
}
```
 
Cloud receives an aggregated, entity-stripped summary of the dataset (counts, ranges,
distributions), never raw rows. Returns a spec; the frontend renders the charts via
the chosen charting library.
 
### 13.5 `/api/mcp/dispatch`
 
**POST.** Body:
```ts
{ connector: "email" | "calendar" | "vault_safety" | "rave_edc" | "argus",
  action: string,
  payload: Record<string, unknown> }
```
Routes to the appropriate MCP client. Writes a forensic audit line identical in shape
to `/api/complete` audit lines. Returns a status + receipt.
 
### 13.6 Shared invariants (re-stated for emphasis)
 
- Every new endpoint writes a hashed audit line. Raw inputs and outputs are never
  logged.
- Every new endpoint passes user content through the existing NGSP pipeline before any
  cloud call. No endpoint may bypass routing.
- Every new endpoint's canary scan runs before any outbound traffic.
---
 
## 14. Subagent roles (extended)
 
The existing five subagents (`ngsp-core`, `attack-suite`, `research-writer`,
`integration`, `mock-data`) remain unchanged. Six additional subagents handle the
frontend and extension work.
 
### 14.1 `layout-shell`
 
Owns the VS-Code-style window: title bar, activity bar, pane container system, view
registry, persona layouts, bottom dock scaffolding, keyboard shortcuts, layout
persistence. Does **not** implement individual views — only the frame they live in.
 
Touches: `frontend/src/App.tsx`, `frontend/src/components/ActivityBar.tsx`,
`frontend/src/components/TitleBar.tsx`, and new files under `frontend/src/layout/`
(`PaneContainer.tsx`, `ViewRegistry.ts`, `PersonaLayouts.ts`, `BottomDock.tsx`,
`SplitterGroup.tsx`).
 
Produces: a running shell where both personas can be selected, panes can be swapped
between any views (including empty placeholder views), and layout persists across
reloads.
 
### 14.2 `backend-extensions`
 
Owns the five new endpoint groups in §12. Each endpoint has pydantic request/response
models, integrates with the existing NGSP pipeline, writes forensic audit lines, and
ships with pytest smoke tests. Must use `context7` MCP before writing integration code
against the Anthropic SDK, FastAPI, or any connector library.
 
Touches: `backend/main.py`, `backend/schemas.py`, new files under
`backend/endpoints/` (`timeline.py`, `signal.py`, `dataset.py`, `dashboard.py`,
`mcp.py`).
 
Produces: endpoints that return typed JSON, pytest coverage, and an updated backend
README.
 
### 14.3 `reviewer-views`
 
Owns the reviewer persona's two primary views: `case-timeline` and `signal-map`. The
timeline is a multi-track D3 visualization assembled from `/api/timeline/assemble`
output. The signal map is a D3 scatter with density-clustered convex hulls from
`/api/signal/cluster`. Each view handles its own empty, loading, and error states.
Each integrates with the shared `ExportActions` row.
 
Touches: new files under `frontend/src/views/reviewer/` (`CaseTimelineView.tsx`,
`SignalMapView.tsx`, hooks in `frontend/src/hooks/useTimelineData.ts`,
`frontend/src/hooks/useSignalData.ts`).
 
Dependencies: the view registry from `layout-shell`, the endpoints from
`backend-extensions`. Must consult `context7` MCP for current D3 API before
implementing.
 
### 14.4 `analyst-views`
 
Owns the analyst persona's two primary views: `dataset-preview` and `dashboard`. The
dataset preview is a virtualized table (TanStack Table or equivalent) with column
filters, row-level entity highlighting, and sticky headers. The dashboard view
consumes a natural-language prompt, calls `/api/dashboard/generate`, and renders the
resulting spec as a grid of charts. The charting library (D3, Recharts, visx, Nivo)
is chosen by `context7` research during planning; document the choice in
`frontend/src/views/analyst/README.md`.
 
Touches: new files under `frontend/src/views/analyst/` (`DatasetPreviewView.tsx`,
`DashboardView.tsx`, `ChartGrid.tsx`, hooks).
 
Dependencies: view registry, dataset + dashboard endpoints. The chat view
(`AssistantPanel`) is already built; this agent integrates with it but does not
rewrite it.
 
### 14.5 `forensic-and-mcp`
 
Owns the shared forensic bottom dock (collapsed + expanded states, three-lane view,
canary highlighting, ε accounting display) and the shared `ExportActions` component
that embeds MCP action chips beneath workflow outputs. Wires the MCP endpoints in the
backend to the frontend via typed helpers.
 
Touches: new files `frontend/src/layout/BottomDockForensic.tsx`,
`frontend/src/components/ExportActions.tsx`, `frontend/src/lib/mcp.ts`.
 
Dependencies: bottom dock scaffolding from `layout-shell`, MCP endpoint from
`backend-extensions`. Must not log any raw inputs or outputs to the browser console.
 
### 14.6 `integration-and-demo`
 
Owns the end-to-end demo script, realistic fixture data that exercises every workflow
in under 90 seconds, coordination of persona defaults, a single-command reset
(`scripts/reset-demo.sh`) that clears audit logs and restores fixture state, and the
top-level README / runbook. Also confirms that both persona workflows produce a
visually dramatic output within the demo time budget.
 
Touches: `scripts/reset-demo.sh`, `scripts/seed-demo.py`, `README.md`,
`docs/demo-script.md`, `docs/shortcuts.md`.
 
Dependencies: all of the above. Runs last.
 
### 14.7 Dispatch order
 
```
Phase 5 — frontend shell + backend extensions (parallel-safe)
    ├─ layout-shell
    └─ backend-extensions
 
Phase 6 — views (parallel-safe, all depend on Phase 5)
    ├─ reviewer-views
    ├─ analyst-views
    └─ forensic-and-mcp
 
Phase 7 — integration
    └─ integration-and-demo
```
 
`research-writer` continues to run in the background and documents each new component
as it lands, per CLAUDE.md §6 point 3.
 
### 14.8 Shared invariants for all new subagents
 
- Every function has a one-line explanation comment above its `def` or before its
  declaration. `research-writer` will audit.
- TypeScript uses `strict` mode; no `any` without a comment justifying it.
- React components are function components with hooks; no class components.
- No inline styles beyond CSS variables; all theming uses the existing `--color-*`
  variables in `frontend/src/index.css`.
- All new backend code is type-annotated, pydantic-validated at boundaries, and
  covered by at least one pytest smoke test.
- No real PHI, no real compound codenames, no real patient data anywhere in the repo.