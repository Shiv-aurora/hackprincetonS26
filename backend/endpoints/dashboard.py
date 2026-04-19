# POST /api/dashboard/generate — generate a chart-grid dashboard spec from a natural-language prompt.
from __future__ import annotations

import json
import uuid
from collections import Counter
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


# Build an aggregate summary of the synthetic dataset suitable for cloud submission.
def _build_dataset_summary() -> str:
    try:
        from data.synthetic_sae import generate_sae_corpus

        corpus = generate_sae_corpus(50)
        grades: list[int] = []
        sites: list[str] = []
        for doc in corpus:
            grade = getattr(doc, "grade", None)
            site = getattr(doc, "site_id", None)
            if grade is not None:
                grades.append(int(str(grade)) if str(grade).isdigit() else 2)
            if site is not None:
                sites.append(str(site))

        grade_dist = dict(Counter(grades))
        site_counts = dict(Counter(sites))
        return (
            f"Dataset summary (synthetic-ct-v1, {len(corpus)} records): "
            f"grade distribution={grade_dist}, "
            f"site event counts={site_counts}, "
            f"date range=2024-01-01 to 2024-06-30."
        )
    except Exception:  # noqa: BLE001
        return (
            "Dataset summary (synthetic-ct-v1, 20 records): "
            "grade distribution={1: 5, 2: 7, 3: 5, 4: 3}, "
            "site event counts={'SITE-1': 4, 'SITE-2': 4, 'SITE-3': 4, 'SITE-4': 4, 'SITE-5': 4}."
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
        return DashboardSpec.model_validate(raw)
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
        f"You are a clinical data analyst. Based on the following dataset summary, "
        f"generate a JSON dashboard specification matching this TypeScript schema:\n"
        f'{{"title": string, "charts": [ChartSpec], "narrative_summary": string}}\n'
        f"where ChartSpec has: id, kind (bar|line|stacked-bar|kpi|heatmap), title, "
        f"x_axis?, y_axis?, series=[{{name, data:[[x,y]]}}], annotations?.\n\n"
        f"Dataset summary: {summary}\n\n"
        f"User request: {req.prompt}\n\n"
        f"Return ONLY valid JSON, no markdown fences."
    )

    if openai_configured():
        system = (
            "You generate concise clinical operations dashboards as strict JSON. "
            "Use only aggregate, synthetic, or placeholder-safe values from the prompt. "
            "Return valid JSON only."
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
        except Exception:  # noqa: BLE001 — demo must degrade rather than crash
            pass

    try:
        output = pipeline.run(cloud_prompt, budget)
        spec = _parse_cloud_spec(output.final_response, audit_id)
        if spec is not None:
            return spec
    except Exception:  # noqa: BLE001 — fall back on any pipeline error
        pass

    return _build_fallback_spec(req.prompt, audit_id)
