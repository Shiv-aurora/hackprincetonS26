# Pydantic request/response models for every NGSP backend endpoint.
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# /api/analyze
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    # Raw document text to analyze for sensitive entities.
    text: str


class EntityItem(BaseModel):
    # One detected sensitive span with tier, subcategory, char offsets, and placeholder.
    text: str
    category: Literal["phi", "ip", "mnpi"]
    subcategory: str
    start: int
    end: int
    placeholder: str


class EntityCounts(BaseModel):
    # Aggregate count of each sensitivity tier in a document.
    phi: int
    ip: int
    mnpi: int


class AnalyzeResponse(BaseModel):
    # Full entity list with per-tier counts for one document.
    entities: list[EntityItem]
    counts: EntityCounts


# ---------------------------------------------------------------------------
# /api/proxy
# ---------------------------------------------------------------------------

class ProxyRequest(BaseModel):
    # Raw document text to run through the full strip-and-proxy pipeline.
    text: str


class PositionMapping(BaseModel):
    # Alignment of one entity between original text offsets and proxy text offsets.
    original_start: int
    original_end: int
    proxy_start: int
    proxy_end: int
    placeholder: str


class ProxyResponse(BaseModel):
    # Original text, proxy text, the entity map, and synchronized position mappings.
    original: str
    proxy: str
    entity_map: dict[str, str]
    position_mapping: list[PositionMapping]


# ---------------------------------------------------------------------------
# /api/route
# ---------------------------------------------------------------------------

class RouteRequest(BaseModel):
    # Already-stripped text and optional span metadata for routing classification.
    text: str
    spans: list[dict] = []


class RouteResponse(BaseModel):
    # Routing decision: one of the three NGSP paths plus a short rationale.
    path: Literal["abstract_extractable", "dp_tolerant", "local_only"]
    rationale: str


# ---------------------------------------------------------------------------
# /api/complete
# ---------------------------------------------------------------------------

class CompleteRequest(BaseModel):
    # Full pipeline request: document, user prompt, and optional model selector.
    document: str
    prompt: str
    model: Literal["claude-opus-4", "gpt-5", "gemini-2"] = "claude-opus-4"


class RoutingInfo(BaseModel):
    # Routing decision embedded inside a CompleteResponse.
    path: str
    rationale: str


class CompleteResponse(BaseModel):
    # Full pipeline output: routing, proxy sent, raw LLM response, rehydrated response.
    routing: RoutingInfo
    proxy_sent: str
    response_raw: str
    response_rehydrated: str
    entities_proxied: int
    entities_blocked: int
    audit_id: str


# ---------------------------------------------------------------------------
# /api/audit
# ---------------------------------------------------------------------------

class AuditLogEntry(BaseModel):
    # One entry in the in-memory audit log (no raw content, hashes only).
    audit_id: str
    timestamp: str
    route: str
    entities_count: int
    blocked: bool


class SessionStats(BaseModel):
    # Aggregate session statistics since server start.
    total_requests: int
    proxied: int
    local_only: int
    blocked: int


class AuditResponse(BaseModel):
    # Full audit log with session-level statistics.
    session_stats: SessionStats
    log: list[AuditLogEntry]


# ---------------------------------------------------------------------------
# /api/health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    # Server health and mode indicators.
    status: str
    mock_mode: bool
    version: str


# ---------------------------------------------------------------------------
# /api/audit (extended with ε accounting)
# ---------------------------------------------------------------------------

class AuditResponseExtended(BaseModel):
    # Full audit log with session-level statistics and DP ε budget fields.
    session_stats: SessionStats
    log: list[AuditLogEntry]
    epsilon_spent: float
    epsilon_cap: float


# ---------------------------------------------------------------------------
# /api/timeline/assemble
# ---------------------------------------------------------------------------

class TimelineRequest(BaseModel):
    # SAE narrative document to parse into a structured timeline.
    document: str = Field(min_length=1, max_length=20000)


class TimelineBand(BaseModel):
    # One event severity band on the event track (day + CTCAE grade + label).
    day: int
    grade: Literal[1, 2, 3, 4, 5]
    label: str


class TimelineMarker(BaseModel):
    # A point-in-time marker on the dosing track (dose, dechallenge, rechallenge).
    day: int
    kind: Literal["dose", "dechallenge", "rechallenge"]
    dose_mg: float | None = None
    half_life_days: float | None = None


class TimelineBar(BaseModel):
    # An interval bar on the conmeds track (concomitant medication span).
    start_day: int
    end_day: int
    drug_placeholder: str


class TimelineSparkline(BaseModel):
    # A dense time-series of lab values for a single analyte.
    series_name: str
    points: list[tuple[int, float]]
    lower_threshold: float | None = None
    upper_threshold: float | None = None


class TimelineAnnotation(BaseModel):
    # A callout annotation anchored to a specific track and day.
    kind: Literal["onset_latency", "dechallenge", "rechallenge", "who_umc"]
    text: str
    anchor_track: Literal["event", "dosing", "conmeds", "labs"]
    anchor_day: int | None = None


class TimelineTracks(BaseModel):
    # All four timeline tracks for one SAE case.
    event: list[TimelineBand]
    dosing: list[TimelineMarker]
    conmeds: list[TimelineBar]
    labs: TimelineSparkline


class TimelineDemographics(BaseModel):
    # Anonymised patient demographics extracted from the document.
    age_band: str
    sex: Literal["M", "F", "U"]
    site_id_placeholder: str


class TimelineCausality(BaseModel):
    # WHO-UMC causality verdict with cloud-generated rationale.
    verdict: Literal["certain", "probable", "possible", "unlikely", "unassessable"]
    rationale: str


class TimelineResponse(BaseModel):
    # Full structured timeline response including tracks, annotations, and causality.
    demographics: TimelineDemographics
    tracks: TimelineTracks
    annotations: list[TimelineAnnotation]
    causality: TimelineCausality
    audit_id: str


# ---------------------------------------------------------------------------
# /api/signal/cluster
# ---------------------------------------------------------------------------

class SignalRequest(BaseModel):
    # Cluster-detection request scoped to one study and a day window.
    study_id: str
    current_case_id: str
    window_days: int = Field(default=30, ge=1, le=365)


class SignalEvent(BaseModel):
    # One adverse event in the signal detection window (placeholders only).
    site: str
    day: int
    grade: Literal[1, 2, 3, 4, 5]
    case_id_placeholder: str


class SignalCluster(BaseModel):
    # Convex-hull cluster of spatially proximate events with density score.
    hull: list[tuple[float, float]]
    member_indices: list[int]
    density_score: float


class SignalResponse(BaseModel):
    # Full signal detection response with events, clusters, and cloud hypothesis.
    events: list[SignalEvent]
    clusters: list[SignalCluster]
    current_case_position: tuple[str, int]
    hypothesis: str
    recommended_actions: list[str]
    audit_id: str


# ---------------------------------------------------------------------------
# /api/dataset/schema  &  /api/dataset/query
# ---------------------------------------------------------------------------

class DatasetColumn(BaseModel):
    # Schema descriptor for one column in the synthetic clinical dataset.
    name: str
    kind: Literal["string", "int", "float", "date", "category"]
    has_entities: bool


class DatasetSchemaResponse(BaseModel):
    # Column schema plus total row count for the loaded synthetic dataset.
    columns: list[DatasetColumn]
    total_rows: int


class DatasetQueryRequest(BaseModel):
    # Structured filter + sort + paginate spec for the dataset query endpoint.
    filters: dict[str, str] = {}
    sort: list[tuple[str, Literal["asc", "desc"]]] = []
    cursor: str | None = None
    page_size: int = Field(default=100, ge=1, le=1000)


class DatasetEntityAnnotation(BaseModel):
    # Privacy annotation for one cell value that contains a sensitive entity.
    placeholder: str
    category: str


class DatasetCell(BaseModel):
    # One cell value with an optional privacy annotation.
    value: str | int | float | None
    entity: DatasetEntityAnnotation | None = None


class DatasetRow(BaseModel):
    # One dataset row identified by row_id with annotated cells.
    row_id: str
    cells: dict[str, DatasetCell]


class DatasetQueryResponse(BaseModel):
    # Paginated query result with cursor for the next page.
    rows: list[DatasetRow]
    next_cursor: str | None
    total_matched: int


# ---------------------------------------------------------------------------
# /api/dashboard/generate
# ---------------------------------------------------------------------------

class ChartSeries(BaseModel):
    # One data series within a chart (name, data points, optional color token).
    name: str
    data: list[tuple[str | float, float]]
    color_token: str | None = None


class ChartSpec(BaseModel):
    # Specification for one chart panel in a dashboard grid.
    id: str
    kind: Literal["bar", "line", "stacked-bar", "kpi", "heatmap"]
    title: str
    x_axis: str | None = None
    y_axis: str | None = None
    series: list[ChartSeries]
    annotations: list[str] = []


class DashboardRequest(BaseModel):
    # Natural-language dashboard generation request scoped to one dataset.
    prompt: str = Field(min_length=4, max_length=800)
    dataset_id: str = "synthetic-ct-v1"


class DashboardSpec(BaseModel):
    # Full dashboard specification with chart grid and narrative summary.
    title: str
    charts: list[ChartSpec]
    narrative_summary: str
    audit_id: str


# ---------------------------------------------------------------------------
# /api/mcp/dispatch
# ---------------------------------------------------------------------------

class MCPDispatchRequest(BaseModel):
    # Dispatch request routing an action to one of the registered MCP connectors.
    connector: Literal["email", "calendar", "vault_safety", "rave_edc", "argus"]
    action: str
    payload: dict[str, object]


class MCPReceipt(BaseModel):
    # Confirmation receipt returned by an MCP connector after dispatch.
    connector: str
    action: str
    external_id: str | None
    message: str


class MCPDispatchResponse(BaseModel):
    # Full MCP dispatch response including status, receipt, and audit reference.
    status: Literal["sent", "not_configured", "error"]
    receipt: MCPReceipt
    audit_id: str
