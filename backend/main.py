# FastAPI backend wrapping the NGSP pipeline: 5 REST endpoints + health check.
from __future__ import annotations

import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
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
from ngsp.safe_harbor import extract_regex_spans

from backend.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    AuditLogEntry,
    AuditResponse,
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

load_dotenv()

# ---------------------------------------------------------------------------
# App + config
# ---------------------------------------------------------------------------

_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "sk-ant-mock")
_MOCK_MODE: bool = _API_KEY == "sk-ant-mock" or not _API_KEY.startswith("sk-ant-")
_VERSION = "0.1.0"

app = FastAPI(title="NGSP Clinical Backend", version=_VERSION)

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

# In-memory audit log — resets on server restart; never stores raw content.
_audit_log: list[AuditLogEntry] = []

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
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health", response_model=HealthResponse)
async def api_health() -> HealthResponse:
    # Return server liveness, mock-mode flag, and version string.
    return HealthResponse(status="ok", mock_mode=_MOCK_MODE, version=_VERSION)


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def api_analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    # Detect all sensitive spans in the document and return them with tier counts.
    all_entries = _extract_all_entries(req.text)

    # Build entity map so we can assign placeholder names to EntityItems.
    _, entity_map, _, _ = _build_full_proxy(req.text)

    # Invert entity_map to look up placeholder by original value.
    # (multiple spans can share the same value — map first occurrence)
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


@app.post("/api/proxy", response_model=ProxyResponse)
async def api_proxy(req: ProxyRequest) -> ProxyResponse:
    # Run the full strip-and-proxy pipeline on the document, returning both texts and mappings.
    proxy_text, entity_map, _, position_mappings = _build_full_proxy(req.text)
    return ProxyResponse(
        original=req.text,
        proxy=proxy_text,
        entity_map=entity_map,
        position_mapping=position_mappings,
    )


@app.post("/api/route", response_model=RouteResponse)
async def api_route(req: RouteRequest) -> RouteResponse:
    # Classify the text into an NGSP routing path using the heuristic (no model).
    all_entries = _extract_all_entries(req.text)
    path, rationale = _heuristic_route(all_entries)
    return RouteResponse(path=path, rationale=rationale)  # type: ignore[arg-type]


@app.post("/api/complete", response_model=CompleteResponse)
async def api_complete(req: CompleteRequest) -> CompleteResponse:
    # Run the full pipeline: proxy → route → LLM (or mock) → rehydrate → audit.
    proxy_text, entity_map, all_entries, _ = _build_full_proxy(req.document)
    route_path, route_rationale = _heuristic_route(all_entries)
    entities_count = len(entity_map)
    audit_id = uuid.uuid4().hex

    # Determine response (mock or real API).
    if _MOCK_MODE:
        response_raw = _build_mock_response(entity_map)
        response_rehydrated = apply_entity_map(response_raw, entity_map)
    else:
        try:
            import anthropic  # lazy import — not needed in mock mode

            client = anthropic.Anthropic(api_key=_API_KEY)
            full_prompt = (
                f"Document (privacy tokens used in place of sensitive identifiers):\n"
                f"{proxy_text}\n\n"
                f"Task: {req.prompt}"
            )
            msg = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                system=(
                    "You are a clinical trial assistant. The document uses privacy tokens "
                    "(e.g. <COMPOUND_CODE_1>) in place of sensitive identifiers. "
                    "Respond using the same token notation — do not invent values."
                ),
                messages=[{"role": "user", "content": full_prompt}],
            )
            response_raw = msg.content[0].text  # type: ignore[union-attr]
            response_rehydrated = apply_entity_map(response_raw, entity_map)
        except Exception as exc:  # noqa: BLE001
            response_raw = f"[API error: {type(exc).__name__}]"
            response_rehydrated = response_raw

    # Record in audit log (no raw content logged).
    _audit_log.append(
        AuditLogEntry(
            audit_id=audit_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            route=route_path,
            entities_count=entities_count,
            blocked=False,
        )
    )

    return CompleteResponse(
        routing=RoutingInfo(path=route_path, rationale=route_rationale),
        proxy_sent=proxy_text,
        response_raw=response_raw,
        response_rehydrated=response_rehydrated,
        entities_proxied=entities_count,
        entities_blocked=0,
        audit_id=audit_id,
    )


@app.get("/api/audit", response_model=AuditResponse)
async def api_audit() -> AuditResponse:
    # Return session-level stats and the full in-memory audit log.
    proxied = sum(1 for e in _audit_log if e.route != "local_only")
    local_only = sum(1 for e in _audit_log if e.route == "local_only")
    blocked = sum(1 for e in _audit_log if e.blocked)
    stats = SessionStats(
        total_requests=len(_audit_log),
        proxied=proxied,
        local_only=local_only,
        blocked=blocked,
    )
    return AuditResponse(session_stats=stats, log=list(_audit_log))
