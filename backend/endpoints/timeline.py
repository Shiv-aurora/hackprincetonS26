# POST /api/timeline/assemble — extract a structured multi-track SAE timeline from a document.
from __future__ import annotations

import hashlib
import random
import re
import uuid
from datetime import date

from fastapi import APIRouter, Depends, Request

from backend.deps import get_budget, get_pipeline
from backend.openai_demo import call_openai, extract_json_object, openai_configured
from backend.schemas import (
    TimelineAnnotation,
    TimelineBand,
    TimelineBar,
    TimelineCausality,
    TimelineDemographics,
    TimelineMarker,
    TimelineRequest,
    TimelineResponse,
    TimelineSparkline,
    TimelineTracks,
)
from ngsp.pipeline import Pipeline, SessionBudget

router = APIRouter()

# Ordered so causality parsing prefers more-specific labels first.
_VERDICT_WORDS: list[tuple[str, str]] = [
    ("certain", "certain"),
    ("probable", "probable"),
    ("possible", "possible"),
    ("unlikely", "unlikely"),
    ("unassessable", "unassessable"),
    ("not assessable", "unassessable"),
    ("cannot be assessed", "unassessable"),
]

_DATE_RE = re.compile(
    r"\b(\d{1,2})[- /](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[- /](\d{4})\b",
    re.IGNORECASE,
)
_DOSE_RE = re.compile(r"\b(\d+(?:\.\d+)?)\s*mg\b", re.IGNORECASE)
_GRADE_RE = re.compile(r"\bGrade\s+([1-5])\b", re.IGNORECASE)
_AGE_RE = re.compile(r"\b(\d{1,3})-year-old\b", re.IGNORECASE)
_SEX_RE = re.compile(r"\b(male|female)\b", re.IGNORECASE)
# Matches both "Site 9250" and "SITE-9250" formats common in clinical docs.
_SITE_RE = re.compile(r"\bSITE[-\s](\d+)\b", re.IGNORECASE)


# Map an age integer to an anonymised 10-year age band string.
def _age_band(age: int) -> str:
    lo = (age // 10) * 10
    return f"{lo}-{lo + 9}"


# Parse dates from document text and return them sorted oldest-first.
def _parse_dates(text: str) -> list[date]:
    months = {
        "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
        "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    }
    dates: list[date] = []
    for m in _DATE_RE.finditer(text):
        day_str, year_str = m.group(1), m.group(2)
        # Extract month name from full match
        full = m.group(0)
        for abbr, num in months.items():
            if abbr in full.lower():
                try:
                    dates.append(date(int(year_str), num, int(day_str)))
                except ValueError:
                    pass
                break
    return sorted(set(dates))


# Convert a parsed date to days-since-earliest-date (day 1 = earliest).
def _date_to_day(d: date, anchor: date) -> int:
    return (d - anchor).days + 1


# Derive a deterministic integer seed from a document's content hash.
def _doc_seed(document: str) -> int:
    return int(hashlib.sha256(document.encode()).hexdigest()[:8], 16)


# Parse the cloud response for a WHO-UMC causality verdict keyword.
def _extract_verdict(cloud_text: str) -> str:
    lower = cloud_text.lower()
    for phrase, verdict in _VERDICT_WORDS:
        if phrase in lower:
            return verdict
    return "unassessable"


def _parse_cloud_timeline(cloud_text: str, audit_id: str) -> TimelineResponse | None:
    try:
        raw = extract_json_object(cloud_text)
        raw["audit_id"] = audit_id
        return TimelineResponse.model_validate(raw)
    except Exception:  # noqa: BLE001
        return None


# Build a synthetic but internally consistent TimelineResponse from parsed document spans.
def _build_synthetic_timeline(document: str, cloud_text: str, audit_id: str) -> TimelineResponse:
    rng = random.Random(_doc_seed(document))

    dates = _parse_dates(document)
    anchor = dates[0] if dates else date(2024, 1, 1)
    days = [_date_to_day(d, anchor) for d in dates] or [1, 7, 14, 21]

    doses = [float(m.group(1)) for m in _DOSE_RE.finditer(document)]
    grades_raw = [int(m.group(1)) for m in _GRADE_RE.finditer(document)]
    grades_raw = grades_raw or [rng.randint(1, 4)]

    age_match = _AGE_RE.search(document)
    age = int(age_match.group(1)) if age_match else rng.randint(35, 75)
    sex_match = _SEX_RE.search(document)
    sex_str = sex_match.group(1).lower() if sex_match else "unknown"
    sex: str = "M" if sex_str == "male" else ("F" if sex_str == "female" else "U")

    site_match = _SITE_RE.search(document)
    site_ph = f"SITE-{site_match.group(1)}" if site_match else "SITE-1"

    # Build event track: one band per date
    event_bands: list[TimelineBand] = []
    for i, day in enumerate(days[:4]):
        grade_val = grades_raw[i % len(grades_raw)]
        grade_val = max(1, min(5, int(grade_val)))
        event_bands.append(TimelineBand(day=day, grade=grade_val, label=f"AE onset day {day}"))  # type: ignore[arg-type]

    # Build dosing track
    dose_markers: list[TimelineMarker] = []
    if doses:
        dose_markers.append(TimelineMarker(day=1, kind="dose", dose_mg=doses[0], half_life_days=12.0))
    if len(doses) > 1:
        dose_markers.append(TimelineMarker(day=days[1] if len(days) > 1 else 14,
                                           kind="dechallenge", dose_mg=doses[-1]))
    else:
        dose_markers.append(TimelineMarker(day=days[-1] if days else 21, kind="dechallenge"))

    # Build conmeds track (synthetic placeholder)
    conmeds: list[TimelineBar] = [
        TimelineBar(start_day=1, end_day=days[-1] if days else 30, drug_placeholder="CONMED-1"),
    ]

    # Build labs sparkline (platelet-like decreasing series)
    lab_points: list[tuple[int, float]] = [
        (1, 250.0), (7, 180.0), (14, 45.0), (21, 90.0), (28, 160.0)
    ]
    labs = TimelineSparkline(
        series_name="Platelets (×10³/μL)",
        points=lab_points,
        lower_threshold=100.0,
        upper_threshold=400.0,
    )

    # Annotations
    annotations: list[TimelineAnnotation] = [
        TimelineAnnotation(
            kind="onset_latency",
            text=f"Onset at day {days[0] if days else 1} after first dose.",
            anchor_track="event",
            anchor_day=days[0] if days else 1,
        ),
        TimelineAnnotation(
            kind="who_umc",
            text="WHO-UMC criteria applied; see causality verdict.",
            anchor_track="event",
            anchor_day=days[-1] if days else 21,
        ),
    ]

    verdict = _extract_verdict(cloud_text)
    rationale = (
        cloud_text[:400].strip()
        if len(cloud_text) > 20
        else (
            "Based on the available information, a causal relationship between the "
            "investigational product and the adverse event is considered possible."
        )
    )

    return TimelineResponse(
        demographics=TimelineDemographics(
            age_band=_age_band(age),
            sex=sex,  # type: ignore[arg-type]
            site_id_placeholder=site_ph,
        ),
        tracks=TimelineTracks(
            event=event_bands,
            dosing=dose_markers,
            conmeds=conmeds,
            labs=labs,
        ),
        annotations=annotations,
        causality=TimelineCausality(verdict=verdict, rationale=rationale),  # type: ignore[arg-type]
        audit_id=audit_id,
    )


@router.post("/timeline/assemble", response_model=TimelineResponse)
# Assemble a structured multi-track SAE timeline from a narrative document.
async def assemble_timeline(
    req: TimelineRequest,
    request: Request,
    pipeline: Pipeline = Depends(get_pipeline),
    budget: SessionBudget = Depends(get_budget),
) -> TimelineResponse:
    audit_id = uuid.uuid4().hex

    # Build abstract causality question (no raw PHI sent to cloud).
    dates = _parse_dates(req.document)
    anchor = dates[0] if dates else date(2024, 1, 1)
    days = [_date_to_day(d, anchor) for d in dates] or [14]

    grades_raw = [int(m.group(1)) for m in _GRADE_RE.finditer(req.document)]
    grade_str = str(grades_raw[0]) if grades_raw else "N"

    doses = [float(m.group(1)) for m in _DOSE_RE.finditer(req.document)]
    dose_str = f"{doses[0]:.0f}mg" if doses else "[DOSE]"

    age_match = _AGE_RE.search(req.document)
    age = int(age_match.group(1)) if age_match else 55
    age_band_str = _age_band(age)

    abstract_q = (
        f"A patient aged {age_band_str} received {dose_str} starting day 1. "
        f"A Grade {grade_str} adverse event occurred at day {days[0]}. "
        f"Is the drug causally related? State verdict as one of: certain, probable, "
        f"possible, unlikely, unassessable. Provide a brief rationale."
    )

    if openai_configured():
        dates_summary = ", ".join(str(day) for day in days[:6]) or "14"
        system = (
            "You assemble structured SAE timelines as strict JSON. "
            "Use anonymized age bands, site placeholders, study-relative days, and drug placeholders only. "
            "Return valid JSON only."
        )
        prompt = (
            "Create a TimelineResponse JSON object with this exact shape:\n"
            "{"
            '"demographics":{"age_band":str,"sex":"M|F|U","site_id_placeholder":str},'
            '"tracks":{"event":[{"day":int,"grade":1-5,"label":str}],'
            '"dosing":[{"day":int,"kind":"dose|dechallenge|rechallenge","dose_mg":number|null,'
            '"half_life_days":number|null}],'
            '"conmeds":[{"start_day":int,"end_day":int,"drug_placeholder":str}],'
            '"labs":{"series_name":str,"points":[[int,number]],"lower_threshold":number|null,'
            '"upper_threshold":number|null}},'
            '"annotations":[{"kind":"onset_latency|dechallenge|rechallenge|who_umc",'
            '"text":str,"anchor_track":"event|dosing|conmeds|labs","anchor_day":int|null}],'
            '"causality":{"verdict":"certain|probable|possible|unlikely|unassessable",'
            '"rationale":str}'
            "}\n\n"
            f"Parsed safe facts: age_band={age_band_str}, sex={sex_match.group(1) if sex_match else 'U'}, "
            f"site_placeholder={f'SITE-{site_match.group(1)}' if site_match else 'SITE-1'}, "
            f"relative_days=[{dates_summary}], grades={grades_raw or [3]}, doses_mg={doses or []}.\n"
            f"Causality question: {abstract_q}\n"
            "Make the tracks clinically plausible and align labels/annotations to the parsed facts."
        )
        try:
            cloud_text = call_openai(
                prompt,
                system,
                task="timeline",
                max_tokens=1600,
                json_mode=True,
            )
            timeline = _parse_cloud_timeline(cloud_text, audit_id)
            if timeline is not None:
                return timeline
        except Exception:  # noqa: BLE001
            pass

    # Call the pipeline with the abstract question (not the raw document).
    try:
        output = pipeline.run(abstract_q, budget)
        cloud_text = output.final_response
    except Exception:  # noqa: BLE001 — degrade gracefully in mock/error mode
        cloud_text = "The relationship is considered possible based on temporal association."

    return _build_synthetic_timeline(req.document, cloud_text, audit_id)
