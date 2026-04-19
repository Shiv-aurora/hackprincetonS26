# FastAPI backend wrapping the NGSP pipeline with lifespan, APIRouter, and ε accounting.
from __future__ import annotations

import json
import os
import re
import sys
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncGenerator

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure src/ layout is importable when running the backend directly.
_SRC = Path(__file__).resolve().parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from data.schemas import (
    HIPAA_SAFE_HARBOR_CATEGORIES,
    MNPI_CATEGORIES,
    QUASI_IDENTIFIER_CATEGORIES,
    SensitiveCategory,
)
from ngsp.answer_applier import apply_entity_map
from ngsp.pipeline import Pipeline, SessionBudget
from ngsp.remote_client import RemoteClient
from ngsp.safe_harbor import extract_regex_spans

from backend.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    AuditLogEntry,
    AuditResponse,
    AuditResponseExtended,
    CompleteRequest,
    CompleteResponse,
    EntityCounts,
    EntityItem,
    HealthResponse,
    PositionMapping,
    ProxyRequest,
    ProxyResponse,
    RouteRequest,
    RouteResponse,
    RoutingInfo,
    SessionStats,
)
from backend.openai_demo import call_openai, openai_configured

load_dotenv()

# ---------------------------------------------------------------------------
# App + config
# ---------------------------------------------------------------------------

_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "sk-ant-mock")
_OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
_MOCK_MODE: bool = not openai_configured() and (
    _API_KEY == "sk-ant-mock" or not _API_KEY.startswith("sk-ant-")
)
_VERSION = "0.1.0"
_EPSILON_CAP = 3.0
_DELTA = 1e-5

# Canary token pattern — any string matching this in a proxy payload is a leak and must be blocked.
_CANARY_PATTERN = re.compile(r"CANARY_[A-Za-z0-9]+")
_CANARY_TOKENS: list[str] = []  # populated at runtime by test injections; also matched by regex

# Path to the NGSP file-based audit log (canonical source of truth).
_AUDIT_LOG_PATH = Path("experiments/results/audit.jsonl")

# In-memory audit cache — rebuilt from the file on startup and on each GET /api/audit.
_audit_log: list[AuditLogEntry] = []


# ---------------------------------------------------------------------------
# Audit file helpers
# ---------------------------------------------------------------------------

# Read the NGSP audit.jsonl file and rebuild the in-memory audit log cache.
def _rebuild_audit_cache() -> None:
    _audit_log.clear()
    if not _AUDIT_LOG_PATH.exists():
        return
    with _AUDIT_LOG_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
                # Only ingest records that carry the fields we expose in AuditLogEntry.
                if "request_id" in record and "status" in record:
                    _audit_log.append(
                        AuditLogEntry(
                            audit_id=record.get("request_id", ""),
                            timestamp=record.get("timestamp", ""),
                            route=record.get("route", record.get("kind", "unknown")),
                            entities_count=record.get("entities_count", 0),
                            blocked=record.get("status") == "canary_leak",
                        )
                    )
            except (json.JSONDecodeError, Exception):  # noqa: BLE001
                pass


# Atomically truncate (overwrite) the audit JSONL file with an empty file.
def _truncate_audit_file() -> None:
    _AUDIT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    _AUDIT_LOG_PATH.write_text("", encoding="utf-8")


# Append one audit record dict to the JSONL file and the in-memory cache.
def _append_audit(entry: AuditLogEntry, record: dict[str, Any]) -> None:
    _AUDIT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _AUDIT_LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, separators=(",", ":")) + "\n")
    _audit_log.append(entry)


# ---------------------------------------------------------------------------
# Lifespan — build pipeline once and store on app.state
# ---------------------------------------------------------------------------

@asynccontextmanager
# Construct shared Pipeline + SessionBudget on startup; tear down gracefully on shutdown.
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    skip_local = os.environ.get("NGSP_SKIP_LOCAL_MODEL", "0") == "1"

    # Construct local model (may be skipped for fast test starts).
    local_model: Any = None
    if not skip_local:
        try:
            from ngsp.local_model import LocalModel, LocalModelConfig

            cfg = LocalModelConfig.from_env()
            local_model = LocalModel(cfg)
        except Exception:  # noqa: BLE001 — non-fatal: degrade to regex-only
            local_model = None

    # Construct RemoteClient (always needed; handles mock mode internally).
    remote_api_key = os.getenv("OPENAI_API_KEY") or "sk-openai-mock"
    remote_client = RemoteClient(
        api_key=remote_api_key,
        audit_log_path=_AUDIT_LOG_PATH,
    )

    # Construct Pipeline with whatever local model we have (None-safe in mock mode).
    pipeline = Pipeline(local_model=local_model, remote_client=remote_client)

    # Create a fresh process-wide session budget.
    budget = SessionBudget(epsilon_cap=_EPSILON_CAP, delta=_DELTA)

    # Load audit cache from file.
    _rebuild_audit_cache()

    app.state.local_model = local_model
    app.state.remote_client = remote_client
    app.state.pipeline = pipeline
    app.state.budget = budget

    yield

    # Shutdown: nothing to release for local_model in mock/skip mode.


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="NGSP Clinical Backend", version=_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Detection patterns (model-free, for demo / offline mode)
# ---------------------------------------------------------------------------
# Each entry: (compiled pattern, subcategory string, tier string)

_DETECTION_PATTERNS: list[tuple[re.Pattern[str], str, str]] = [
    # PHI: clinical trial date format DD-MMM-YYYY (e.g. "14-MAR-2024")
    (
        re.compile(
            r"\b\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}\b",
            re.IGNORECASE,
        ),
        "date",
        "phi",
    ),
    # PHI: subject identifiers (e.g. "Subject 04-0023")
    (
        re.compile(r"\bSubject\s+\d{2}-\d{4}\b", re.IGNORECASE),
        "name",
        "phi",
    ),
    # PHI: institutional site names ending in clinical keywords
    (
        re.compile(
            r"\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+"
            r"(?:Oncology|Hospital|Medical\s+Center|Research\s+Center|Institute|Clinic)\b"
        ),
        "geographic_subdivision",
        "phi",
    ),
    # PHI: age notation (e.g. "68-year-old")
    (re.compile(r"\b\d{1,3}-year-old\b"), "other_unique_id", "phi"),
    # IP: compound / study codes (e.g. "BMS-986253-301", "IND-4321")
    (
        re.compile(r"\b[A-Z]{2,6}-\d{3,9}(?:-\d{2,4})*(?:-[A-Z]+)?\b"),
        "compound_code",
        "ip",
    ),
    # IP: clinical site numbers (e.g. "Site 104")
    (re.compile(r"\bSite\s+\d+\b", re.IGNORECASE), "site_id", "ip"),
    # IP: doses (e.g. "50mg", "25 mg/kg")
    (
        re.compile(r"\b\d+(?:\.\d+)?\s*(?:mg|μg|mcg|mg/kg|μg/kg|IU|mL|g)\b"),
        "dose",
        "ip",
    ),
    # IP: CTCAE AE grades (e.g. "Grade 4")
    (re.compile(r"\bGrade\s+[1-5]\b", re.IGNORECASE), "ae_grade", "ip"),
    # IP: study-day timing references (e.g. "study day 14")
    (re.compile(r"\bstudy\s+day\s+\d+\b", re.IGNORECASE), "timing", "ip"),
    # IP: cycle/day references (e.g. "Cycle 2 Day 1")
    (re.compile(r"\bCycle\s+\d+(?:\s+Day\s+\d+)?\b", re.IGNORECASE), "timing", "ip"),
    # MNPI: objective response rates (e.g. "34% ORR")
    (
        re.compile(r"\b\d+(?:\.\d+)?%\s*(?:ORR|CR|PR|DCR|PFS|OS|DOR)\b"),
        "efficacy_value",
        "mnpi",
    ),
    # MNPI: below-target efficacy statements (e.g. "below the 45% target")
    (
        re.compile(
            r"\bbelow(?:\s+the?)?\s+\d+(?:\.\d+)?%\s*(?:target|threshold|benchmark)\b",
            re.IGNORECASE,
        ),
        "efficacy_value",
        "mnpi",
    ),
    # MNPI: Data Safety Monitoring Board references
    (re.compile(r"\bDSMB\b"), "interim_result", "mnpi"),
    # MNPI: preliminary efficacy analyses
    (
        re.compile(r"\bpreliminary\s+efficacy\s+analysis\b", re.IGNORECASE),
        "interim_result",
        "mnpi",
    ),
    # MNPI: protocol amendments (e.g. "Amendment 4")
    (re.compile(r"\bAmendment\s+\d+\b", re.IGNORECASE), "amendment_rationale", "mnpi"),
]


# Map a SensitiveCategory enum value to its three-tier string.
def _tier_from_category(cat: SensitiveCategory) -> str:
    if cat in HIPAA_SAFE_HARBOR_CATEGORIES:
        return "phi"
    if cat in QUASI_IDENTIFIER_CATEGORIES:
        return "ip"
    if cat in MNPI_CATEGORIES:
        return "mnpi"
    return "phi"


# ---------------------------------------------------------------------------
# Core detection + proxy builder
# ---------------------------------------------------------------------------

def _extract_all_entries(
    text: str,
) -> list[tuple[int, int, str, str, str]]:
    """
    Combine regex Safe Harbor spans with clinical detection patterns.
    Returns sorted list of (start, end, category_key, tier, value).
    """
    # Step 1: regex Safe Harbor (HIPAA 18 identifiers)
    sh_spans = extract_regex_spans(text)
    covered: list[tuple[int, int]] = [(sp.start, sp.end) for sp in sh_spans]
    entries: list[tuple[int, int, str, str, str]] = []

    for sp in sh_spans:
        tier = _tier_from_category(sp.category)
        entries.append((sp.start, sp.end, sp.category.value.upper(), tier, sp.value))

    # Step 2: clinical detection patterns (non-overlapping with SH hits)
    for pattern, subcat, tier in _DETECTION_PATTERNS:
        for m in pattern.finditer(text):
            s, e = m.start(), m.end()
            if any(cs <= s < ce or cs < e <= ce for cs, ce in covered):
                continue
            covered.append((s, e))
            entries.append((s, e, subcat.upper(), tier, text[s:e]))

    return sorted(entries, key=lambda x: x[0])


# Build the full proxy text and supporting mappings from a document string.
def _build_full_proxy(
    text: str,
) -> tuple[str, dict[str, str], list[tuple[int, int, str, str, str]], list[PositionMapping]]:
    """
    Strip all detected spans and replace with placeholders.
    Returns (proxy_text, entity_map, all_entries, position_mappings).
    """
    all_entries = _extract_all_entries(text)

    # Assign placeholders in reverse-position order (matches strip_safe_harbor convention).
    counters: dict[str, int] = {}
    entity_map: dict[str, str] = {}
    placeholder_pairs: list[tuple[int, int, str]] = []  # (start, end, placeholder)

    for start, end, cat_key, _tier, value in reversed(all_entries):
        counters[cat_key] = counters.get(cat_key, 0) + 1
        ph = f"<{cat_key}_{counters[cat_key]}>"
        entity_map[ph] = value
        placeholder_pairs.append((start, end, ph))

    # Apply replacements right-to-left so earlier offsets stay valid.
    result_chars = list(text)
    for s, e, ph in placeholder_pairs:
        result_chars[s:e] = list(ph)
    proxy_text = "".join(result_chars)

    # Compute original ↔ proxy position mappings walking left-to-right.
    sorted_pairs = sorted(placeholder_pairs, key=lambda x: x[0])
    position_mappings: list[PositionMapping] = []
    cum_shift = 0

    for orig_start, orig_end, ph in sorted_pairs:
        orig_len = orig_end - orig_start
        ph_len = len(ph)
        proxy_start = orig_start + cum_shift
        proxy_end = proxy_start + ph_len
        position_mappings.append(
            PositionMapping(
                original_start=orig_start,
                original_end=orig_end,
                proxy_start=proxy_start,
                proxy_end=proxy_end,
                placeholder=ph,
            )
        )
        cum_shift += ph_len - orig_len

    return proxy_text, entity_map, all_entries, position_mappings


# ---------------------------------------------------------------------------
# Routing heuristic (model-free)
# ---------------------------------------------------------------------------

# Classify document sensitivity tier into a routing path without a local model.
def _heuristic_route(all_entries: list[tuple[int, int, str, str, str]]) -> tuple[str, str]:
    tiers = {tier for _, _, _, tier, _ in all_entries}
    if "mnpi" in tiers:
        return (
            "dp_tolerant",
            "Document contains MNPI (interim results, amendment rationale, or efficacy data); "
            "conservative routing applied to bound inversion risk.",
        )
    if tiers:
        return (
            "abstract_extractable",
            "Document contains PHI or IP quasi-identifiers but no MNPI; "
            "query intent can be safely abstracted.",
        )
    return (
        "abstract_extractable",
        "No sensitive spans detected; request routed directly.",
    )


# ---------------------------------------------------------------------------
# Mock LLM response builder
# ---------------------------------------------------------------------------

# Build a realistic mock ICH E2B response referencing actual entity placeholders.
# Call the cloud LLM through OpenAI for demo mode, with Anthropic as legacy fallback.
def _call_llm(prompt: str, system: str, requested_model: str | None = None) -> str:
    if openai_configured():
        try:
            return call_openai(
                prompt,
                system,
                task="chat",
                requested_model=requested_model,
                max_tokens=1024,
            )
        except Exception as exc:
            return f"[OpenAI error: {type(exc).__name__}: {exc}]"

    # --- Anthropic path ---
    if _API_KEY and _API_KEY != "sk-ant-mock" and _API_KEY.startswith("sk-ant-"):
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=_API_KEY)
            msg = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                system=system,
                messages=[{"role": "user", "content": prompt}],
            )
            return msg.content[0].text  # type: ignore[union-attr]
        except Exception as exc:
            err_str = str(exc).lower()
            # Fall through to OpenAI only on billing/credit errors; re-raise others.
            if not any(kw in err_str for kw in ("credit", "balance", "billing", "quota", "insufficient")):
                return f"[Anthropic error: {type(exc).__name__}: {exc}]"
            # Credit exhausted — try OpenAI fallback.

    # --- OpenAI fallback ---
    if _OPENAI_API_KEY and openai_configured():
        try:
            from openai import OpenAI
            oa = OpenAI(api_key=_OPENAI_API_KEY)
            resp = oa.chat.completions.create(
                model="gpt-4o-mini",
                max_tokens=1024,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
            )
            return resp.choices[0].message.content or ""
        except Exception as exc:
            return f"[OpenAI error: {type(exc).__name__}: {exc}]"

    return "[No LLM configured: set ANTHROPIC_API_KEY or OPENAI_API_KEY]"


# Build a realistic mock ICH E2B response referencing actual entity placeholders.
def _build_mock_response(entity_map: dict[str, str]) -> str:
    def get_ph(prefix: str, n: int = 1) -> str:
        """Return the nth placeholder for a category prefix (1-indexed, sorted by number)."""
        candidates = sorted(
            [k for k in entity_map if k.startswith(f"<{prefix.upper()}_")],
            key=lambda x: int(re.search(r"_(\d+)>$", x).group(1)),
        )
        return candidates[n - 1] if len(candidates) >= n else f"<{prefix.upper()}_{n}>"

    n_doses = len([k for k in entity_map if k.startswith("<DOSE_")])
    dose_start = get_ph("DOSE", n_doses) if n_doses >= 1 else get_ph("DOSE")
    dose_reduced = get_ph("DOSE", 1)
    dose_from = get_ph("DOSE", 2) if n_doses >= 2 else dose_start

    return f"""\
**ICH E2B(R3) — Individual Case Safety Report (Proxy Mode)**

**1. Identification**
Report type: Initial
Study reference: {get_ph("COMPOUND_CODE", 2)}
Subject: {get_ph("NAME")}

**2. Patient Characteristics**
{get_ph("OTHER_UNIQUE_ID")} female enrolled at {get_ph("SITE_ID")} \
({get_ph("GEOGRAPHIC_SUBDIVISION")}) on {get_ph("DATE", 2)}.

**3. Suspect Drug**
Investigational product: {get_ph("COMPOUND_CODE")}
Starting dose: {dose_start}

**4. Adverse Event**
- Event term: Thrombocytopenia, {get_ph("AE_GRADE")} (CTCAE v5.0)
- Onset: {get_ph("TIMING")} post-first dose
- Platelet nadir: 18,000/μL
- Seriousness: Life-threatening
- Causality: Possibly related to {get_ph("COMPOUND_CODE")}

**5. Actions Taken**
Per {get_ph("AMENDMENT_RATIONALE")}: cohort-wide dose modification \
from {dose_from} → {dose_reduced} following safety signal.

**6. Efficacy Context**
{get_ph("INTERIM_RESULT", 2)}: {get_ph("EFFICACY_VALUE", 2)} \
(below pre-specified {get_ph("EFFICACY_VALUE", 1)}).
Reviewed at {get_ph("INTERIM_RESULT")} meeting on {get_ph("DATE")}.

**7. Outcome**
Unresolved at time of reporting.

*Privacy tokens are rehydrated locally — no identifying data was transmitted to the cloud.*"""


# ---------------------------------------------------------------------------
# API Router for existing endpoints
# ---------------------------------------------------------------------------

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
# Return server liveness, mock-mode flag, and version string.
async def api_health() -> HealthResponse:
    return HealthResponse(status="ok", mock_mode=_MOCK_MODE, version=_VERSION)


@router.post("/analyze", response_model=AnalyzeResponse)
# Detect all sensitive spans in the document and return them with tier counts.
async def api_analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    all_entries = _extract_all_entries(req.text)

    # Build entity map so we can assign placeholder names to EntityItems.
    _, entity_map, _, _ = _build_full_proxy(req.text)

    # Invert entity_map to look up placeholder by original value.
    value_to_placeholder: dict[str, str] = {}
    for ph, val in entity_map.items():
        value_to_placeholder.setdefault(val, ph)

    entities: list[EntityItem] = []
    for start, end, cat_key, tier, value in all_entries:
        placeholder = value_to_placeholder.get(value, f"<{cat_key}_?>")
        entities.append(
            EntityItem(
                text=value,
                category=tier,  # type: ignore[arg-type]
                subcategory=cat_key.lower(),
                start=start,
                end=end,
                placeholder=placeholder,
            )
        )

    counts = EntityCounts(
        phi=sum(1 for e in entities if e.category == "phi"),
        ip=sum(1 for e in entities if e.category == "ip"),
        mnpi=sum(1 for e in entities if e.category == "mnpi"),
    )
    return AnalyzeResponse(entities=entities, counts=counts)


@router.post("/proxy", response_model=ProxyResponse)
# Run the full strip-and-proxy pipeline on the document, returning both texts and mappings.
async def api_proxy(req: ProxyRequest) -> ProxyResponse:
    proxy_text, entity_map, _, position_mappings = _build_full_proxy(req.text)
    return ProxyResponse(
        original=req.text,
        proxy=proxy_text,
        entity_map=entity_map,
        position_mapping=position_mappings,
    )


@router.post("/route", response_model=RouteResponse)
# Classify the text into an NGSP routing path using the heuristic (no model).
async def api_route(req: RouteRequest) -> RouteResponse:
    all_entries = _extract_all_entries(req.text)
    path, rationale = _heuristic_route(all_entries)
    return RouteResponse(path=path, rationale=rationale)  # type: ignore[arg-type]


@router.post("/complete", response_model=CompleteResponse)
# Run the full pipeline: proxy → route → LLM (or mock) → rehydrate → audit.
async def api_complete(req: CompleteRequest) -> CompleteResponse:
    proxy_text, entity_map, all_entries, _ = _build_full_proxy(req.document)
    route_path, route_rationale = _heuristic_route(all_entries)
    entities_count = len(entity_map)
    audit_id = uuid.uuid4().hex

    # Canary scan — abort before any outbound call if a canary token survived proxying.
    canary_match = _CANARY_PATTERN.search(proxy_text)
    if canary_match:
        entry = AuditLogEntry(
            audit_id=audit_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            route=route_path,
            entities_count=entities_count,
            blocked=True,
        )
        record: dict[str, Any] = {
            "request_id": audit_id,
            "timestamp": entry.timestamp,
            "kind": "complete",
            "route": route_path,
            "entities_count": entities_count,
            "status": "canary_leak",
            "canary_token": canary_match.group(0),
        }
        _append_audit(entry, record)
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail={
                "error": "canary_leak",
                "message": "Canary token detected in proxy text — outbound call blocked.",
                "audit_id": audit_id,
            },
        )

    # Determine response (mock or real API).
    response_raw: str
    if _MOCK_MODE:
        response_raw = _build_mock_response(entity_map)
        response_rehydrated = apply_entity_map(response_raw, entity_map)
    else:
        full_prompt = (
            f"Document (privacy tokens used in place of sensitive identifiers):\n"
            f"{proxy_text}\n\n"
            f"Task: {req.prompt}"
        )
        system_msg = (
            "You are a clinical trial assistant. The document uses privacy tokens "
            "(e.g. <COMPOUND_CODE_1>) in place of sensitive identifiers. "
            "Respond using the same token notation — do not invent values."
        )
        response_raw = _call_llm(full_prompt, system_msg, req.model)
        response_rehydrated = apply_entity_map(response_raw, entity_map)

    # Build audit entry and write to file + cache.
    entry = AuditLogEntry(
        audit_id=audit_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        route=route_path,
        entities_count=entities_count,
        blocked=False,
    )
    record = {
        "request_id": audit_id,
        "timestamp": entry.timestamp,
        "kind": "complete",
        "route": route_path,
        "entities_count": entities_count,
        "status": "ok",
    }
    _append_audit(entry, record)

    return CompleteResponse(
        routing=RoutingInfo(path=route_path, rationale=route_rationale),
        proxy_sent=proxy_text,
        response_raw=response_raw,
        response_rehydrated=response_rehydrated,
        entities_proxied=entities_count,
        entities_blocked=0,
        audit_id=audit_id,
    )


@router.post("/audit/reset")
# Clear the in-memory audit cache, truncate the JSONL file, and reset the session ε budget.
async def api_audit_reset() -> dict:
    _audit_log.clear()
    _truncate_audit_file()
    # Reset the process-wide budget stored on app.state (app defined in this same module).
    try:
        app.state.budget = SessionBudget(epsilon_cap=_EPSILON_CAP, delta=_DELTA)
    except Exception:  # noqa: BLE001 — app.state may not exist before lifespan runs
        pass
    return {"status": "ok", "message": "Audit log cleared."}


@router.get("/audit", response_model=AuditResponseExtended)
# Return session-level stats, the full audit cache, and current ε budget figures.
async def api_audit() -> AuditResponseExtended:
    # Use the in-memory cache directly; lifespan already seeded it from the file.
    # This keeps test isolation when callers clear _audit_log directly.

    proxied = sum(1 for e in _audit_log if e.route not in ("local_only", "unknown"))
    local_only = sum(1 for e in _audit_log if e.route == "local_only")
    blocked = sum(1 for e in _audit_log if e.blocked)
    stats = SessionStats(
        total_requests=len(_audit_log),
        proxied=proxied,
        local_only=local_only,
        blocked=blocked,
    )

    # Pull ε figures from app.state (set by lifespan on startup).
    epsilon_spent = 0.0
    try:
        budget: SessionBudget = app.state.budget
        epsilon_spent = budget.epsilon_spent()
    except Exception:  # noqa: BLE001 — app.state not populated outside lifespan context
        pass

    return AuditResponseExtended(
        session_stats=stats,
        log=list(_audit_log),
        epsilon_spent=epsilon_spent,
        epsilon_cap=_EPSILON_CAP,
    )


# ---------------------------------------------------------------------------
# Register routers
# ---------------------------------------------------------------------------

app.include_router(router, prefix="/api")

from backend.endpoints.timeline import router as timeline_router
from backend.endpoints.signal import router as signal_router
from backend.endpoints.dataset import router as dataset_router
from backend.endpoints.dashboard import router as dashboard_router
from backend.endpoints.mcp import router as mcp_router

app.include_router(timeline_router, prefix="/api")
app.include_router(signal_router, prefix="/api")
app.include_router(dataset_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(mcp_router, prefix="/api")
