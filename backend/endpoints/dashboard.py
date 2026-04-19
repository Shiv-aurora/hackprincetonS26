# POST /api/dashboard/generate — generate a chart-grid dashboard spec from a natural-language prompt.
from __future__ import annotations

import json
import re
import uuid
from collections import Counter
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from backend.deps import get_budget, get_pipeline
from backend.openai_demo import call_openai, openai_configured
from backend.schemas import (
    ChartSeries,
    ChartSpec,
    DashboardRequest,
    DashboardSpec,
)
from ngsp.pipeline import Pipeline, SessionBudget
from ngsp.safe_harbor import extract_regex_spans

router = APIRouter()

# Fallback dashboard returned when the cloud response cannot be parsed.
_FALLBACK_CHARTS: list[ChartSpec] = [
    ChartSpec(
        id="kpi-total-aes",
        kind="kpi",
        title="Total AEs in Cohort",
        series=[ChartSeries(name="AE count", data=[("Total", 20.0)])],
    ),
]


# Extract the first span value matching a SensitiveCategory string.
def _first_span_value(doc: Any, category: str, fallback: str = "unknown") -> str:
    for span in getattr(doc, "spans", []):
        if getattr(getattr(span, "category", None), "value", None) == category:
            return str(getattr(span, "value", fallback))
    return fallback


# Parse a synthetic DD-MMM-YYYY date into a YYYY-MM bucket.
def _month_bucket(value: str) -> str:
    try:
        return datetime.strptime(value.title(), "%d-%b-%Y").strftime("%Y-%m")
    except ValueError:
        return "unknown"


# Convert a grade label like "Grade 4" into a stable display key.
def _grade_key(value: Any) -> str:
    match = re.search(r"[1-5]", str(value))
    return f"Grade {match.group(0)}" if match else "Grade unknown"


# Pull a short outcome label from the generated narrative text.
def _extract_outcome(text: str) -> str:
    match = re.search(r"outcome is reported as ([^.]+)", text, flags=re.IGNORECASE)
    return match.group(1).strip() if match else "unknown"


def _quarter_bucket(month: str) -> str:
    try:
        dt = datetime.strptime(month, "%Y-%m")
        return f"{dt.year}-Q{((dt.month - 1) // 3) + 1}"
    except ValueError:
        return "unknown"


def _counter_series(counter: Counter[str], limit: int | None = None) -> list[list[str | float]]:
    items = counter.most_common(limit) if limit else sorted(counter.items())
    return [[key, float(value)] for key, value in items]


# Build an aggregate summary of the synthetic dataset suitable for cloud submission.
def _build_dataset_summary() -> str:
    try:
        from data.synthetic_sae import generate_sae_narratives

        corpus = generate_sae_narratives(120)
        grade_counts: Counter[str] = Counter()
        ae_counts: Counter[str] = Counter()
        indication_counts: Counter[str] = Counter()
        site_counts: Counter[str] = Counter()
        outcome_counts: Counter[str] = Counter()
        month_counts: Counter[str] = Counter()
        quarter_counts: Counter[str] = Counter()
        dose_counts: Counter[str] = Counter()
        site_grade: dict[str, Counter[str]] = {}
        mnpi_docs = 0

        for doc in corpus:
            metadata = getattr(doc, "metadata", {})
            text = str(getattr(doc, "text", ""))
            grade = _grade_key(metadata.get("grade", "unknown"))
            site = _first_span_value(doc, "site_id", "SITE-unknown")
            dose = _first_span_value(doc, "dose", "unknown")
            onset = _first_span_value(doc, "date", "unknown")
            month = _month_bucket(onset)

            grade_counts[grade] += 1
            ae_counts[str(metadata.get("ae_category", "unknown"))] += 1
            indication_counts[str(metadata.get("indication", "unknown"))] += 1
            site_counts[site] += 1
            outcome_counts[_extract_outcome(text)] += 1
            month_counts[month] += 1
            quarter_counts[_quarter_bucket(month)] += 1
            dose_counts[dose] += 1
            site_grade.setdefault(site, Counter())[grade] += 1

            if any(
                getattr(getattr(span, "category", None), "value", "") in {
                    "interim_result",
                    "amendment_rationale",
                    "regulatory_question",
                }
                for span in getattr(doc, "spans", [])
            ):
                mnpi_docs += 1

        profile = {
            "dataset_id": "synthetic-ct-v1",
            "record_count": len(corpus),
            "grade_distribution": dict(sorted(grade_counts.items())),
            "top_adverse_events": dict(ae_counts.most_common(6)),
            "top_indications": dict(indication_counts.most_common(5)),
            "site_event_counts": dict(site_counts.most_common(8)),
            "outcome_distribution": dict(outcome_counts.most_common()),
            "onset_quarter_distribution": dict(sorted(quarter_counts.items())),
            "dose_distribution": dict(dose_counts.most_common(6)),
            "top_site_grade_matrix": {
                site: dict(sorted(counts.items()))
                for site, counts in [(site, site_grade[site]) for site, _ in site_counts.most_common(8)]
            },
            "chart_ready_series": {
                "grade_distribution": _counter_series(grade_counts),
                "top_site_counts": _counter_series(site_counts, 8),
                "top_adverse_events": _counter_series(ae_counts, 8),
                "outcome_distribution": _counter_series(outcome_counts),
                "onset_quarters": _counter_series(quarter_counts),
                "dose_distribution": _counter_series(dose_counts, 6),
                "site_grade_heatmap": {
                    site: _counter_series(site_grade[site])
                    for site, _ in site_counts.most_common(8)
                },
            },
            "mnpi_bearing_records": mnpi_docs,
        }
        return json.dumps(profile, indent=2, sort_keys=True)
    except Exception as exc:  # noqa: BLE001
        return json.dumps(
            {
                "dataset_id": "synthetic-ct-v1",
                "record_count": 0,
                "profile_error": f"{type(exc).__name__}: {exc}",
            },
            sort_keys=True,
        )


# Build the deterministic fallback DashboardSpec used in mock mode or on parse failure.
def _build_fallback_spec(prompt: str, audit_id: str) -> DashboardSpec:
    return DashboardSpec(
        title="Clinical Trial Overview",
        charts=[
            ChartSpec(
                id="bar-grade-dist",
                kind="bar",
                title="AE Grade Distribution",
                x_axis="Grade",
                y_axis="Count",
                series=[
                    ChartSeries(
                        name="Events",
                        data=[("Grade 1", 5.0), ("Grade 2", 7.0), ("Grade 3", 5.0), ("Grade 4", 3.0)],
                        color_token="--color-primary",
                    )
                ],
            ),
            ChartSpec(
                id="heatmap-site-day",
                kind="heatmap",
                title="AE Events by Site and Week",
                x_axis="Week",
                y_axis="Site",
                series=[
                    ChartSeries(name="SITE-1", data=[("W1", 2.0), ("W2", 1.0), ("W3", 1.0)]),
                    ChartSeries(name="SITE-2", data=[("W1", 1.0), ("W2", 2.0), ("W3", 1.0)]),
                    ChartSeries(name="SITE-3", data=[("W1", 0.0), ("W2", 3.0), ("W3", 1.0)]),
                ],
            ),
            ChartSpec(
                id="kpi-total-aes",
                kind="kpi",
                title="Total AEs",
                series=[ChartSeries(name="Total AEs", data=[("Total", 20.0)])],
            ),
        ],
        narrative_summary=(
            "The cohort shows a moderate AE profile with Grade 2 events most common. "
            "SITE-3 had a concentration of events in week 2, warranting closer monitoring."
        ),
        audit_id=audit_id,
        )


def _valid_color_token(token: str | None) -> str | None:
    return token if token and token.startswith("--") else None


def _coerce_kpi_labels(chart: ChartSpec) -> ChartSpec:
    if chart.kind != "kpi":
        return chart
    for series in chart.series:
        series.data = [("Value", float(series.data[0][1] if series.data else 0.0))]
    return chart


def _compact_series_data(chart: ChartSpec) -> ChartSpec:
    if chart.kind not in {"bar", "line", "stacked-bar"}:
        return chart
    for series in chart.series:
        if len(series.data) <= 12:
            continue
        quarter_counts: Counter[str] = Counter()
        can_bucket = True
        for label, value in series.data:
            label_str = str(label)
            if not re.fullmatch(r"\d{4}-\d{2}", label_str):
                can_bucket = False
                break
            quarter_counts[_quarter_bucket(label_str)] += float(value)
        if can_bucket:
            series.data = [(label, value) for label, value in sorted(quarter_counts.items())[-12:]]
        else:
            series.data = series.data[:12]
    return chart


def _normalize_cloud_spec(spec: DashboardSpec) -> DashboardSpec:
    normalized_charts: list[ChartSpec] = []
    for chart in spec.charts[:5]:
        if chart.kind == "heatmap" and len(chart.series) <= 1:
            chart.kind = "bar"  # type: ignore[assignment]
            chart.x_axis = chart.x_axis or "Category"
            chart.y_axis = chart.y_axis or "Count"
        if chart.kind == "stacked-bar" and len(chart.series) <= 1:
            chart.kind = "bar"  # type: ignore[assignment]
        for series in chart.series:
            series.color_token = _valid_color_token(series.color_token)
        chart = _coerce_kpi_labels(chart)
        chart = _compact_series_data(chart)
        normalized_charts.append(chart)
    spec.charts = normalized_charts
    return spec


# Attempt to parse a cloud-returned JSON string into a DashboardSpec.
def _parse_cloud_spec(cloud_text: str, audit_id: str) -> DashboardSpec | None:
    # Try to find a JSON block in the cloud response.
    start = cloud_text.find("{")
    end = cloud_text.rfind("}") + 1
    if start < 0 or end <= start:
        return None
    try:
        raw = json.loads(cloud_text[start:end])
        raw["audit_id"] = audit_id
        return _normalize_cloud_spec(DashboardSpec.model_validate(raw))
    except Exception:  # noqa: BLE001
        return None


@router.post("/dashboard/generate", response_model=DashboardSpec)
# Generate a chart-grid dashboard specification from a natural-language prompt.
async def generate_dashboard(
    req: DashboardRequest,
    request: Request,
    pipeline: Pipeline = Depends(get_pipeline),
    budget: SessionBudget = Depends(get_budget),
) -> DashboardSpec:
    audit_id = uuid.uuid4().hex

    # Check prompt for PHI before any processing.
    phi_spans = extract_regex_spans(req.prompt)
    if phi_spans:
        raise HTTPException(
            status_code=422,
            detail="Prompt contains sensitive identifiers; please rephrase.",
        )

    summary = _build_dataset_summary()
    cloud_prompt = (
        "Generate a dashboard from this aggregate SAE dataset profile. "
        "Do not return a generic template. Select charts that directly answer the user request, "
        "using the supplied aggregate values and labels.\n\n"
        "Required JSON schema:\n"
        "{"
        "\"title\": string,"
        "\"charts\": ["
        "{\"id\": string, \"kind\": \"bar|line|stacked-bar|kpi|heatmap\", \"title\": string, "
        "\"x_axis\": string|null, \"y_axis\": string|null, "
        "\"series\": [{\"name\": string, \"data\": [[string, number]], \"color_token\": string|null}], "
        "\"annotations\": [string]}"
        "],"
        "\"narrative_summary\": string"
        "}\n\n"
        "Rules:\n"
        "- Return 3 to 5 charts unless the user explicitly asks for fewer.\n"
        "- KPI chart data must look like [[\"Value\", number]], not [[0, number]].\n"
        "- Keep each chart readable: cap line/bar categories at 12 points; aggregate months into quarters if needed.\n"
        "- Prefer concrete axes: grade, site, onset month, AE category, indication, outcome, dose.\n"
        "- For heatmaps, use one series per row, each with [[column_label, count]].\n"
        "- Include at least one annotation saying which aggregate drove the chart.\n"
        "- Return valid JSON only. No markdown fences.\n\n"
        f"Dataset profile:\n{summary}\n\n"
        f"User request: {req.prompt}"
    )

    if openai_configured():
        system = (
            "You are an OpenAI clinical analytics model generating live demo dashboard specs. "
            "Use only aggregate, synthetic, placeholder-safe values. Return strict JSON only."
        )
        try:
            cloud_text = call_openai(
                cloud_prompt,
                system,
                task="dashboard",
                max_tokens=1400,
                json_mode=True,
            )
            spec = _parse_cloud_spec(cloud_text, audit_id)
            if spec is not None:
                return spec
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=502,
                detail=f"OpenAI dashboard generation failed: {type(exc).__name__}",
            ) from exc

        raise HTTPException(
            status_code=502,
            detail="OpenAI dashboard generation returned invalid dashboard JSON.",
        )

    try:
        output = pipeline.run(cloud_prompt, budget)
        spec = _parse_cloud_spec(output.final_response, audit_id)
        if spec is not None:
            return spec
    except Exception:  # noqa: BLE001 — fall back on any pipeline error
        pass

    return _build_fallback_spec(req.prompt, audit_id)
