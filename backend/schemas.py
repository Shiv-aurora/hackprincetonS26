# Pydantic request/response models for every NGSP backend endpoint.
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


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
