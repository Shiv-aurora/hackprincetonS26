# Phases 5–7 Execution Plan — Enterprise Client

> **Scope.** Phases 0–4 of NGSP are complete (research pipeline, attack suite,
> paper). Phases 5–7 wrap the research substrate with a VS-Code-style desktop
> client and five new backend endpoint groups. This document is the canonical
> handoff brief every subagent reads before dispatch. No implementation code
> lives here — only contracts, types, schemas, task tables, and verification
> criteria.

---

## 1. Current-state inventory

### 1.1 Frontend (`frontend/`)

- React 19, Vite 6, Tailwind v4, TypeScript ~5.8, D3 7.9, Framer Motion 12,
  Lucide React 0.546. No charting wrapper, no TanStack, no test framework.
- `tsconfig.json` has `strict: false` — **violates CLAUDE.md §14.8**, must be
  flipped on during Phase 5a.
- `src/App.tsx` wraps `TitleBar` + `ActivityBar` + `SideBar` + `Workspace` +
  `AssistantPanel`. Hard-coded 2-pane (workspace + assistant) resizable with a
  single 6 px handle; no registry, no persona framework, no bottom dock.
- `src/components/ActivityBar.tsx` has 5 icons (RECORDS, VITALS, PHARMACY, LABS,
  CARDIOLOGY). Per CLAUDE.md §12.3: VITALS → Analyst (default),
  RECORDS → Reviewer. Others stay disabled with a "production feature" tooltip.
- `src/components/AssistantPanel.tsx` is the existing chat. Already calls
  `/api/complete`. Salvageable as the `chat` view.
- `src/components/Workspace.tsx` has five hard-coded view modes (Compare,
  Heatmap, Graph, Routing, Audit) with a D3 force-graph. Useful references but
  replaced by the view registry.
- `src/index.css` defines the CSS-variable design system:
  `--color-surface-*`, `--color-primary-*`, `--color-phi`, `--color-ip`,
  `--color-mnpi`, `--color-error`, `--color-vscode-*`. All theming flows through
  these.
- Backend URL: `import.meta.env.VITE_API_URL ?? "http://localhost:8000"` in
  `src/lib/api.ts`. No Vite proxy; direct cross-origin (backend has CORS on).
- No `src/views/`, no `src/hooks/`, no `src/layout/` — all brand-new directories.

### 1.2 Backend (`backend/`)

- FastAPI singleton at module load in `backend/main.py`; no `Depends()`, no
  `APIRouter`, no `lifespan`. All state is module-level: `_API_KEY`,
  `_MOCK_MODE`, `_audit_log: list[AuditLogEntry]`.
- Existing routes: `GET /api/health`, `POST /api/analyze`, `POST /api/proxy`,
  `POST /api/route`, `POST /api/complete`, `GET /api/audit`,
  `POST /api/audit/reset`.
- The backend **does not instantiate the full `Pipeline` from
  `src/ngsp/pipeline.py`**. It imports only `extract_regex_spans` and
  `apply_entity_map`. The five new endpoints must go through the full pipeline,
  so the backend needs a `lifespan` that constructs `LocalModel` +
  `RemoteClient` + `Pipeline` once.
- Audit log is **two disjoint stores**: backend in-memory `_audit_log` for
  `/api/audit`, NGSP file `experiments/results/audit.jsonl` written by
  `RemoteClient`. These must be unified — backend reads the file as the source
  of truth.
- No `SessionBudget` threaded through. For the demo we attach one process-wide
  `SessionBudget` to `app.state` and reset it via `/api/audit/reset`.
- Tests use `TestClient(app)` with env `OPENAI_API_KEY=sk-openai-mock` (after
  the Anthropic → OpenAI swap in `src/ngsp/remote_client.py`).

### 1.3 Model client

`src/ngsp/remote_client.py` is now the **OpenAI** SDK wrapper (`gpt-4o-mini`
default). Both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are present in `.env`.
Anthropic-tool-runner is a documented future path; v1 of the MCP dispatch layer
uses direct connector routing with no LLM orchestration.

---

## 2. Context7 evidence summary

See `paper/methodology.md` §7 for the writeup; the five decisions below are
locked for Phases 5–7.

| Question | Library queried | Outcome |
|---|---|---|
| Dashboard charting in React + TS | `/airbnb/visx`, `/recharts/recharts` | **visx**. Native `HeatmapRect`, modular `@visx/shape`/`@visx/scale`/`@visx/heatmap`/`@visx/tooltip` for bundle-size control, D3 scales re-exported typed. Recharts is simpler but has no first-class heatmap; stacked bar / composed chart work, tooltip story strong. Heatmap absence was the deciding factor. |
| Reviewer custom viz | `/websites/d3js` | **Raw D3 v7** for timeline + signal map. `d3.scaleTime` for axes, `d3.polygonHull` for cluster hulls, `d3.contourDensity` for density-based grouping. React integration via `useRef` + `useEffect` is the current D3-website pattern. |
| Virtualized table | `/websites/tanstack_table` | **TanStack Table v8 + TanStack Virtual**, still canonical. Documented pattern: `useReactTable` + `useVirtualizer`, 50k-row demo exists. |
| FastAPI shared state | `/fastapi/fastapi` | **`lifespan` async context manager** + `APIRouter(prefix=...)` + `Annotated[T, Depends(getter)]` type aliases. Store the long-lived `Pipeline` on `app.state.pipeline`; getters read from `request.app.state`. |
| Anthropic tool use | `/anthropics/anthropic-sdk-python` | `@beta_tool` decorator + `client.beta.messages.tool_runner()` for async tool-call loops. MCP-server tools adapt via `async_mcp_tool(t, mcp_client)`. v1 of `/api/mcp/dispatch` uses **direct routing** (no LLM); Claude-tool-runner is the documented v2. |

---

## 3. View-registry types and persona layouts (`layout-shell`)

`frontend/src/layout/ViewRegistry.ts`:

```ts
// Compile-time union of every registered view id.
export type ViewId =
  | "dataset-preview"
  | "chat"
  | "dashboard"
  | "narrative-input"
  | "case-timeline"
  | "signal-map";

// Which slot a view may occupy in the three-pane layout.
export type PaneSlot = "left" | "main" | "right";

// Props handed to every view. Views receive their own id plus the active
// persona so they can adjust if needed; layout width is handled by the
// PaneContainer.
export interface ViewProps {
  paneSlot: PaneSlot;
  persona: PersonaId;
}

// Every view declares its contract here. Placeholder components registered in
// Phase 5a; real implementations replace them in Phase 6.
export interface ViewDefinition {
  id: ViewId;
  title: string;
  component: React.FC<ViewProps>;
  validPanes: PaneSlot[];
  backendDeps: string[]; // e.g. ["/api/dashboard/generate"]
}

export const VIEW_REGISTRY: Record<ViewId, ViewDefinition>;
```

`frontend/src/layout/PersonaLayouts.ts`:

```ts
// One of the two personas; also the storage-key suffix for localStorage.
export type PersonaId = "analyst" | "reviewer";

// Persisted layout state for a single pane. `collapsed` panes render the thin
// expand affordance; `width` is a percentage of the SplitterGroup viewport.
export interface PaneState {
  viewId: ViewId;
  width: number;      // 0-100, renormalized on collapse/expand
  collapsed: boolean;
}

// Full layout for one persona. Load order: localStorage `ngsp.layout.<persona>`
// → fallback to this preset.
export interface LayoutPreset {
  persona: PersonaId;
  panes: Record<PaneSlot, PaneState>;
  bottomDockExpanded: boolean;
  bottomDockHeightPct: number; // 0-60, default 18 expanded, 4 collapsed
}

export const ANALYST_DEFAULT: LayoutPreset = {
  persona: "analyst",
  panes: {
    left:  { viewId: "dataset-preview", width: 25, collapsed: false },
    main:  { viewId: "chat",            width: 45, collapsed: false },
    right: { viewId: "dashboard",       width: 30, collapsed: false },
  },
  bottomDockExpanded: false,
  bottomDockHeightPct: 4,
};

export const REVIEWER_DEFAULT: LayoutPreset = {
  persona: "reviewer",
  panes: {
    left:  { viewId: "narrative-input", width: 25, collapsed: false },
    main:  { viewId: "case-timeline",   width: 45, collapsed: false },
    right: { viewId: "signal-map",      width: 30, collapsed: false },
  },
  bottomDockExpanded: false,
  bottomDockHeightPct: 4,
};

export const PERSONA_PRESETS: Record<PersonaId, LayoutPreset> = {
  analyst:  ANALYST_DEFAULT,
  reviewer: REVIEWER_DEFAULT,
};
```

`validPanes` per view id (drives the pane-header view-picker filter):

| view id          | left | main | right |
|------------------|:----:|:----:|:-----:|
| dataset-preview  |  ✓   |  ✓   |       |
| chat             |      |  ✓   |   ✓   |
| dashboard        |      |  ✓   |   ✓   |
| narrative-input  |  ✓   |      |       |
| case-timeline    |      |  ✓   |   ✓   |
| signal-map       |      |  ✓   |   ✓   |

---

## 4. Backend pydantic schemas (`backend-extensions`)

All new models live in `backend/schemas.py`. Every new endpoint:
- Goes through `Depends(get_pipeline)` so the NGSP `Pipeline.run()` path is
  used for any remote call (guarantees canary scan + audit line before network
  I/O).
- Writes its backend audit row via `_append_audit(...)` and relies on the NGSP
  `RemoteClient` to append to `experiments/results/audit.jsonl` automatically.
- Rejects cloud requests that would exceed the process-wide `SessionBudget`
  with HTTP 429 + a structured error body.

### 4.1 Timeline — routes through `abstract_extractable`

```python
class TimelineRequest(BaseModel):
    """POST /api/timeline/assemble — narrative in, structured timeline out."""
    document: str = Field(min_length=1, max_length=20000)

class TimelineBand(BaseModel):
    """One severity interval on the event track."""
    day: int
    grade: Literal[1, 2, 3, 4, 5]
    label: str

class TimelineMarker(BaseModel):
    """A dose administration or other point event."""
    day: int
    kind: Literal["dose", "dechallenge", "rechallenge"]
    dose_mg: float | None = None
    half_life_days: float | None = None

class TimelineBar(BaseModel):
    """A concomitant-medication interval."""
    start_day: int
    end_day: int
    drug_placeholder: str

class TimelineSparkline(BaseModel):
    """A lab series with threshold bands."""
    series_name: str
    points: list[tuple[int, float]]
    lower_threshold: float | None = None
    upper_threshold: float | None = None

class TimelineAnnotation(BaseModel):
    kind: Literal["onset_latency", "dechallenge", "rechallenge", "who_umc"]
    text: str
    anchor_track: Literal["event", "dosing", "conmeds", "labs"]
    anchor_day: int | None = None

class TimelineTracks(BaseModel):
    event: list[TimelineBand]
    dosing: list[TimelineMarker]
    conmeds: list[TimelineBar]
    labs: TimelineSparkline

class TimelineDemographics(BaseModel):
    age_band: str
    sex: Literal["M", "F", "U"]
    site_id_placeholder: str

class TimelineCausality(BaseModel):
    verdict: Literal["certain", "probable", "possible", "unlikely", "unassessable"]
    rationale: str

class TimelineResponse(BaseModel):
    demographics: TimelineDemographics
    tracks: TimelineTracks
    annotations: list[TimelineAnnotation]
    causality: TimelineCausality
    audit_id: str
```

Handler contract: extract entities + temporal spans locally via `LocalModel`
and `extract_quasi_identifiers`; build the abstract causality question +
facts; run that question through `Pipeline.run()` (forces
`abstract_extractable` by preset prompt shape); re-apply `entity_map` to
`causality.rationale` before returning.

### 4.2 Signal — routes through `abstract_extractable`

```python
class SignalRequest(BaseModel):
    """POST /api/signal/cluster — cross-case pattern detection."""
    study_id: str
    current_case_id: str
    window_days: int = Field(default=30, ge=1, le=365)

class SignalEvent(BaseModel):
    site: str              # "SITE-3" placeholder, never raw site name
    day: int
    grade: Literal[1, 2, 3, 4, 5]
    case_id_placeholder: str

class SignalCluster(BaseModel):
    hull: list[tuple[float, float]]    # convex-hull points in site/day space
    member_indices: list[int]
    density_score: float

class SignalResponse(BaseModel):
    events: list[SignalEvent]
    clusters: list[SignalCluster]
    current_case_position: tuple[str, int]
    hypothesis: str                    # cloud-authored, rehydrated locally
    recommended_actions: list[str]
    audit_id: str
```

Handler contract: local store holds all seeded cases; cluster detection runs
locally (`scipy.spatial.ConvexHull` on density-filtered points, or an
in-house Andrew monotone-chain). Cloud receives **only** the abstract cluster
shape ("3 Grade-3 events at one site within 14 days") and returns a
hypothesis string. Entity map restores site names locally.

### 4.3 Dataset — no remote path (offline-only)

```python
class DatasetSchemaResponse(BaseModel):
    """GET /api/dataset/schema — column definitions of the loaded corpus."""
    columns: list["DatasetColumn"]
    total_rows: int

class DatasetColumn(BaseModel):
    name: str
    kind: Literal["string", "int", "float", "date", "category"]
    has_entities: bool              # true → cells may contain placeholders

class DatasetQueryRequest(BaseModel):
    """POST /api/dataset/query — filter + sort + cursor pagination."""
    filters: dict[str, str] = {}
    sort: list[tuple[str, Literal["asc", "desc"]]] = []
    cursor: str | None = None
    page_size: int = Field(default=100, ge=1, le=1000)

class DatasetCell(BaseModel):
    value: str | int | float | None
    entity: "DatasetEntityAnnotation | None" = None

class DatasetEntityAnnotation(BaseModel):
    placeholder: str                 # e.g. "<COMPOUND_CODE_3>"
    category: str                    # e.g. "compound_code"

class DatasetRow(BaseModel):
    row_id: str
    cells: dict[str, DatasetCell]

class DatasetQueryResponse(BaseModel):
    rows: list[DatasetRow]
    next_cursor: str | None
    total_matched: int
```

No cloud call; all local. Emits a minimal audit line
(`kind="dataset.query"`) for operational visibility.

### 4.4 Dashboard — routes through `abstract_extractable`

```python
class DashboardRequest(BaseModel):
    """POST /api/dashboard/generate — NL prompt → chart grid spec."""
    prompt: str = Field(min_length=4, max_length=800)
    dataset_id: str = "synthetic-ct-v1"

class ChartSpec(BaseModel):
    id: str
    kind: Literal["bar", "line", "stacked-bar", "kpi", "heatmap"]
    title: str
    x_axis: str | None = None
    y_axis: str | None = None
    series: list["ChartSeries"]
    annotations: list[str] = []

class ChartSeries(BaseModel):
    name: str
    data: list[tuple[str | float, float]]
    color_token: str | None = None   # resolves to a CSS variable

class DashboardSpec(BaseModel):
    title: str
    charts: list[ChartSpec]
    narrative_summary: str           # cloud-authored
    audit_id: str
```

Handler contract: backend aggregates the local dataset into a deterministic
entity-stripped summary (counts per site, grade distribution, weekly rates —
never raw rows); pipeline runs the summary + prompt through
`abstract_extractable`; the cloud returns a spec the backend validates
against the pydantic shape before returning.

### 4.5 MCP dispatch — no cloud path in v1

```python
class MCPDispatchRequest(BaseModel):
    """POST /api/mcp/dispatch — route to an MCP connector and record receipt."""
    connector: Literal["email", "calendar", "vault_safety", "rave_edc", "argus"]
    action: str                      # e.g. "send", "create_event", "file_report"
    payload: dict[str, object]       # connector-specific; schema validated per connector

class MCPDispatchResponse(BaseModel):
    status: Literal["sent", "not_configured", "error"]
    receipt: "MCPReceipt"
    audit_id: str

class MCPReceipt(BaseModel):
    connector: str
    action: str
    external_id: str | None          # stub connectors return "STUB-<uuid>"
    message: str
```

Handler contract: no cloud call in v1. Each connector has a resolver
function that either invokes a configured MCP client (email/calendar when env
vars set) or returns a synthetic receipt (vault_safety/rave_edc/argus always
synthetic for the hackathon). Every dispatch writes one hashed audit row;
payload is sha256'd into the audit, never logged raw.

---

## 5. Subagent task breakdowns

Each subagent gets a single dispatch with the task list below. **Files to
create or modify are listed per task.** Verification criteria are the "done"
contract the top-level agent checks before dispatching downstream agents.

### 5.1 `layout-shell` (Phase 5a, parallel-safe with 5b)

| # | Task | Files | Verification |
|---|---|---|---|
| 1 | Enable `strict: true` in tsconfig; fix resulting errors. | `frontend/tsconfig.json`, existing `.tsx` files as needed | `npm run typecheck` passes |
| 2 | Define view-registry types + placeholder components. | `frontend/src/layout/ViewRegistry.ts`, `frontend/src/layout/placeholders/*.tsx` | Registry exports all 6 view ids; placeholders render id + description |
| 3 | Define persona layout presets. | `frontend/src/layout/PersonaLayouts.ts` | Exports `ANALYST_DEFAULT`, `REVIEWER_DEFAULT`, `PERSONA_PRESETS` |
| 4 | `PaneContainer` with view-picker dropdown + collapse toggle. | `frontend/src/layout/PaneContainer.tsx` | Picker lists only views with `validPanes` ∋ current slot; collapse shrinks pane to 32 px; no console errors |
| 5 | `SplitterGroup` — three panes + two draggable dividers. | `frontend/src/layout/SplitterGroup.tsx` | Widths sum to 100; dividers bordering a collapsed pane are non-draggable; drag updates state via hook |
| 6 | `BottomDock` scaffold (collapsed + expanded, empty three-column body). | `frontend/src/layout/BottomDock.tsx` | Collapsed is single-line height; expanded renders three empty columns labeled `Proxy Sent` / `Cloud Response` / `Rehydrated`; vertical drag resizes when expanded |
| 7 | `useLayoutState` context + hook, persisted per persona. | `frontend/src/hooks/useLayoutState.tsx` | Persona switch round-trips through `localStorage`; reload restores layout; no layout cross-contamination |
| 8 | Refactor `App.tsx` around the new shell. | `frontend/src/App.tsx`, remove old `Workspace` imports | Running app shows title bar + activity bar + 3-pane body + dock; no visible regressions |
| 9 | Wire ActivityBar persona selection. | `frontend/src/components/ActivityBar.tsx` | VITALS highlights when persona=analyst; RECORDS highlights when persona=reviewer; others disabled |
| 10 | Keyboard shortcuts hook + doc. | `frontend/src/hooks/useKeyboardShortcuts.ts`, `docs/shortcuts.md` | All 9 shortcuts from CLAUDE.md §12 dispatch correctly on macOS and Linux; documented |
| 11 | Vitest setup + coverage. | `frontend/vitest.config.ts`, `frontend/src/**/*.test.tsx` | `npm run test` passes for: persistence roundtrip, persona restore, view-picker filter, collapse/expand, shortcut dispatch |
| 12 | README for the layout module. | `frontend/src/layout/README.md` | Describes the registry, storage format, how Phase-6 agents add a view |

### 5.2 `backend-extensions` (Phase 5b, parallel-safe with 5a)

| # | Task | Files | Verification |
|---|---|---|---|
| 1 | Refactor `main.py` to use `lifespan` + `APIRouter`. Move Pipeline/LocalModel/RemoteClient construction into `lifespan` and expose via `get_pipeline` dependency. | `backend/main.py`, new `backend/deps.py` | `pytest backend/tests` still passes for existing endpoints; pipeline constructed once, shared across requests |
| 2 | Add process-wide `SessionBudget` on `app.state`; `/api/audit/reset` rebuilds it. | `backend/main.py`, `backend/deps.py` | `GET /api/audit` includes `epsilon_spent` and `epsilon_cap`; reset zeroes it |
| 3 | Unify audit: backend `_audit_log` is derived from tailing `experiments/results/audit.jsonl`; in-memory list is a cache. | `backend/main.py` | Every NGSP cloud call shows up in `/api/audit` within one poll cycle |
| 4 | Timeline endpoint + schemas + unit tests. | `backend/endpoints/timeline.py`, `backend/schemas.py`, `backend/tests/test_timeline.py` | Smoke test with a seeded narrative returns a well-formed `TimelineResponse` in mock mode; audit line written; no raw text in audit |
| 5 | Signal endpoint + schemas + unit tests. | `backend/endpoints/signal.py`, `backend/schemas.py`, `backend/tests/test_signal.py` | Smoke test returns ≥1 cluster on the seed fixture; cloud hypothesis placeholder in mock mode |
| 6 | Dataset schema + query + per-cell entity annotation + tests. | `backend/endpoints/dataset.py`, `backend/schemas.py`, `backend/tests/test_dataset.py` | Schema returns all columns; query with a filter returns paged rows; cells with placeholders carry `entity` annotation |
| 7 | Dashboard endpoint + aggregation helpers + tests. | `backend/endpoints/dashboard.py`, `backend/schemas.py`, `backend/tests/test_dashboard.py` | Smoke test with `"AE rates by site"` returns a `DashboardSpec` with ≥1 chart; `narrative_summary` non-empty in mock mode |
| 8 | MCP dispatch endpoint + connector resolvers + tests. | `backend/endpoints/mcp.py`, `backend/connectors/{email,calendar,stub}.py`, `backend/tests/test_mcp.py` | All 5 connectors return well-formed receipts; 3 stubs always synthetic; dispatch writes audit; payload never appears raw in audit |
| 9 | Register new routers in `main.py` under `/api`. | `backend/main.py` | `GET /docs` (FastAPI Swagger) lists all new endpoints |
| 10 | Update `backend/README.md` with curl examples for each new endpoint. | `backend/README.md` | Each endpoint has a copy-pasteable curl that works against the dev server |

### 5.3 `reviewer-views` (Phase 6a)

| # | Task | Files | Verification |
|---|---|---|---|
| 1 | `CaseTimelineView` — four-track D3 timeline with annotations. | `frontend/src/views/reviewer/CaseTimelineView.tsx`, `frontend/src/hooks/useTimelineData.ts` | Renders all four tracks + annotations from a seeded fixture in < 5 s on a warm cache; empty/loading/error states; keyboard-accessible |
| 2 | `SignalMapView` — scatter + hulls + current-case pulse + side panel. | `frontend/src/views/reviewer/SignalMapView.tsx`, `frontend/src/hooks/useSignalData.ts` | Renders hulls around density clusters; current case pulses; side panel shows hypothesis + recommended actions |
| 3 | Register views, replace placeholders, set `validPanes`. | `frontend/src/layout/ViewRegistry.ts` | Reviewer persona shows real timeline + signal-map on default load |
| 4 | Embed shared `ExportActions` row beneath primary output with `TODO(forensic-and-mcp)` until that agent lands. | both view files | Once `forensic-and-mcp` ships, no TODO remains |
| 5 | Vitest + fixture snapshots. | `frontend/src/views/reviewer/*.test.tsx`, `frontend/src/views/reviewer/__fixtures__/` | Tests for data hooks, annotation hover, cluster click |
| 6 | View README with measured render times + decisions. | `frontend/src/views/reviewer/README.md` | Documents data contract + measured times |

### 5.4 `analyst-views` (Phase 6b, parallel-safe with 6a)

| # | Task | Files | Verification |
|---|---|---|---|
| 1 | Install visx + TanStack Table + TanStack Virtual. | `frontend/package.json` | `npm install`; `npm run typecheck` clean |
| 2 | `DatasetPreviewView` — virtualized table with sort/filter/pagination + entity highlighting. | `frontend/src/views/analyst/DatasetPreviewView.tsx`, `frontend/src/hooks/useDatasetQuery.ts` | Stays responsive with 10k rows; per-cell entity underline + tooltip; sticky header |
| 3 | `ChartGrid` generic renderer for `ChartSpec`. | `frontend/src/views/analyst/ChartGrid.tsx` | Renders bar/line/stacked-bar/kpi/heatmap; unknown kind falls back to labeled placeholder, no crash |
| 4 | `DashboardView` — prompt input + chart grid + narrative summary. | `frontend/src/views/analyst/DashboardView.tsx`, `frontend/src/hooks/useDashboardSpec.ts` | Prompt → `/api/dashboard/generate` → rendered grid in < 90 s end-to-end |
| 5 | Register views, replace placeholders. | `frontend/src/layout/ViewRegistry.ts` | Analyst default layout renders all three real views |
| 6 | Embed `ExportActions` beneath chart grid with same TODO pattern. | `DashboardView.tsx` | Same TODO resolution rule |
| 7 | Vitest. | `frontend/src/views/analyst/*.test.tsx` | Table sort/filter/pagination; spec renderer unit tests |
| 8 | View README documenting the charting-lib decision. | `frontend/src/views/analyst/README.md` | Records visx choice + rationale |

### 5.5 `forensic-and-mcp` (Phase 6c, parallel-safe with 6a + 6b)

| # | Task | Files | Verification |
|---|---|---|---|
| 1 | `BottomDockForensic` replacing scaffold content. | `frontend/src/layout/BottomDockForensic.tsx` | Collapsed single-line feed; expanded three-lane grid; canary rows in `--color-danger`; running ε visible |
| 2 | `useForensicStream` hook polling `/api/audit`. | `frontend/src/hooks/useForensicStream.ts` | Polls every 2 s; new rows animate in over ~600 ms; no raw content anywhere in DOM |
| 3 | `ExportActions` shared component. | `frontend/src/components/ExportActions.tsx` | Context-aware chip set; invokes `/api/mcp/dispatch`; disabled chip + tooltip for `not_configured` |
| 4 | `lib/mcp.ts` typed connector helpers. | `frontend/src/lib/mcp.ts` | One typed function per connector; typed payloads |
| 5 | Vitest. | `frontend/src/layout/*.test.tsx`, `frontend/src/components/ExportActions.test.tsx` | Asserts DOM contains no raw prompts/responses; dispatch payload correct per chip; canary style applied |
| 6 | Forensic data-flow README. | `frontend/src/layout/FORENSIC.md` | Documents dock rendering + audit-row shape |

### 5.6 `integration-and-demo` (Phase 7)

| # | Task | Files | Verification |
|---|---|---|---|
| 1 | Seed script builds the demo fixture into backend stores. | `scripts/seed-demo.py` | Idempotent; non-zero exit on failure; ≥1 cluster-worthy signal pre-seeded |
| 2 | Reset script. | `scripts/reset-demo.sh` | Brings stack up from clean in ≤ 30 s; clears audit + optionally layout state |
| 3 | Two demo scripts with measured wall-clock. | `docs/demo-script.md` | Both flows complete in < 90 s on reference hardware |
| 4 | Shortcuts doc consolidation. | `docs/shortcuts.md` | Lists layout-shell + view-specific shortcuts |
| 5 | Top-level README rewrite. | `README.md` | Product-facing: what it is, who for, how to run, links to paper + demo script |
| 6 | End-to-end verification pass. | — | Records measured times in `docs/demo-script.md`; confirms forensic dock reflects every call |
| 7 | Re-run attack suite against the extended backend. | `experiments/results/final/` | Commits results; no privacy regression vs the pre-extension baseline |

---

## 6. Open questions (with locked-in defaults)

1. **Testing framework.** Frontend has no test runner. → **Vitest**
   (Vite-native, small). `layout-shell` owns the install.
2. **`tsconfig.strict`.** Currently `false`. CLAUDE.md §14.8 mandates strict.
   → **Flip to `true` in `layout-shell` task 1**; fix fallout in the same
   pass.
3. **Charting library.** visx vs Recharts vs raw D3 for the dashboard. →
   **visx**, because Recharts lacks a native heatmap and the dashboard spec
   requires heatmap. Raw D3 reserved for reviewer views.
4. **Virtual-table lib.** No displacer found for TanStack Table v8 + Virtual.
   → **TanStack.**
5. **MCP dispatch orchestration.** Direct routing vs Claude `tool_runner`. →
   **Direct routing for v1.** Claude-runner is a follow-on if time permits.
6. **Real MCP connectors.** Assume **email + calendar configured** via env
   (connector adapters check `os.environ.get("MCP_EMAIL_URL")` etc.);
   **vault_safety / rave_edc / argus always stub** with a synthetic receipt.
   The UI handles `not_configured` cleanly for any of them.
7. **Signal-map data loading.** Eager vs lazy. → **Eager**: seeded fixture is
   < 5 k points; eager load keeps first interaction < 200 ms.
8. **Timeline with no onset date.** Narrative may lack explicit dates. →
   Render as **"undated onset"** on the event track; annotation reads
   "onset latency: undetermined"; confidence flag bubbles up in the response.
9. **Concurrent forensic-log rows.** Multiple `/api/complete` in flight. →
   Order strictly by audit `timestamp`; each call is one row; no interleaving
   across lanes.
10. **Audit unification.** Two audit stores today. → **File is source of
    truth**; backend tails it into the in-memory cache on a 2-second tick.
    `/api/audit/reset` truncates the file and the cache atomically.
11. **Session budget model.** Per-request vs process-wide. → **Process-wide
    for the demo**; reset via `/api/audit/reset`. Per-user budgets are a
    production concern flagged in the paper.
12. **Dashboard prompt safety.** The NL prompt is not stripped by Safe Harbor.
    → Run the prompt itself through `extract_regex_spans` before sending; if
    any span is present, refuse with a structured error (HTTP 422).

Each default above is locked in unless the user overrides before dispatch.

---

## 7. Ninety-second demo scripts

### 7.1 Reviewer flow (target 88 s)

| t (s) | Step | MCP invoked? |
|---|---|---|
| 0 | Open app; Analyst loads by default; click RECORDS on activity bar. | — |
| 3 | Reviewer persona opens with `narrative-input` / `case-timeline` / `signal-map`. | — |
| 5 | Paste pre-staged SAE narrative into `narrative-input`. | — |
| 8 | Click "Assemble timeline". Loading skeleton in `case-timeline`. | — |
| 22 | Timeline fully rendered: 4 tracks + onset-latency, dechallenge, WHO-UMC annotations + causality verdict. | — |
| 28 | Expand bottom dock (⌘J). Two cloud rows: entity extraction (local-only, no cloud) + causality reasoning (`abstract_extractable`). | — |
| 35 | Click `signal-map`. Scatter + two density hulls, current case pulses inside one hull. | — |
| 48 | Side panel: cloud-authored hypothesis + 3 recommended actions. | — |
| 55 | Click "Flag to medical monitor" in `ExportActions`. | ✓ email |
| 60 | Click "Hold in monitor calendar". | ✓ calendar |
| 66 | Click "File to Vault Safety". | ✓ vault_safety (stub) |
| 72 | Bottom dock shows 2 cloud rows + 3 MCP rows with hashed payloads and running ε. | — |
| 82 | Closing frame: full-screen expanded forensic dock + timeline visible through transparency. | — |
| 88 | End. | — |

### 7.2 Analyst flow (target 85 s)

| t (s) | Step | MCP invoked? |
|---|---|---|
| 0 | App on Analyst persona by default. | — |
| 3 | `dataset-preview` already populated on the left (300 synthetic subjects). | — |
| 6 | Filter column `grade` to `3+`; table re-sorts virtualized. | — |
| 14 | Main pane = `chat`. Pre-typed prompt: "Summarize Grade 3+ events by site for the last 30 days." | — |
| 18 | Chat response streams in, rehydrated with site names. Bottom dock ticks one cloud row. | — |
| 30 | Right pane = `dashboard`. Type: "Compare AE rates across sites for the last 30 days; flag sites above 2× mean." | — |
| 34 | Dashboard renders: stacked bar + heatmap + 3 KPI tiles + narrative summary. | — |
| 52 | Narrative summary calls out SITE-3 as a 2.4× outlier. | — |
| 58 | Click "Send to CMO" in `ExportActions` under the dashboard. | ✓ email |
| 64 | Click "Schedule review with Head of Safety". | ✓ calendar |
| 70 | Click "File to SharePoint". | ✓ rave_edc (stub as SharePoint for demo) |
| 76 | Expand bottom dock (⌘J). 3 cloud rows (entity extraction, summary, dashboard), 3 MCP rows, ε running total ≈ 0.6 of 3.0. | — |
| 82 | Closing frame: dashboard front and center with bottom dock expanded beneath. | — |
| 85 | End. | — |

---

## 8. End-to-end verification

1. `./scripts/reset-demo.sh` brings stack up from clean ≤ 30 s.
2. Both demo scripts complete in < 90 s on reference hardware (Apple M1 Max
   32 GB).
3. `npm run test` (frontend) and `pytest -q backend/tests` (backend) pass.
4. `pytest -q` across the research suite still passes at baseline
   `57 passed, 3 skipped`.
5. `scripts/check_comments.py` reports zero violations across `frontend/src/`
   and `backend/`.
6. Attack suite re-run against the extended backend shows no privacy
   regression.
7. Forensic dock reflects every cloud call with no raw content, verified by a
   Vitest assertion that scans the DOM for known prompt/response fixture
   strings.

---

## 9. Dispatch order

```
5a layout-shell        ┐  parallel
5b backend-extensions  ┘

6a reviewer-views      ┐
6b analyst-views       ├ parallel (all depend on 5a + 5b)
6c forensic-and-mcp    ┘

7  integration-and-demo   sequential, last
```

`research-writer` keeps running in the background and picks up new READMEs as
they land; it does not gate dispatch.
