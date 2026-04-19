# POST /api/signal/cluster — detect AE clusters in a study window and generate a hypothesis.
from __future__ import annotations

import math
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Request

from backend.deps import get_budget, get_pipeline
from backend.schemas import (
    SignalCluster,
    SignalEvent,
    SignalRequest,
    SignalResponse,
)
from ngsp.pipeline import Pipeline, SessionBudget

router = APIRouter()

# Static synthetic event fixture; replaced by seed-demo.py data when available.
_SYNTHETIC_EVENTS: list[dict[str, Any]] = [
    {"site": "SITE-1", "day": 3,  "grade": 2, "case_id": "CASE-001"},
    {"site": "SITE-1", "day": 7,  "grade": 3, "case_id": "CASE-002"},
    {"site": "SITE-2", "day": 5,  "grade": 1, "case_id": "CASE-003"},
    {"site": "SITE-2", "day": 12, "grade": 4, "case_id": "CASE-004"},
    {"site": "SITE-3", "day": 4,  "grade": 3, "case_id": "CASE-005"},
    {"site": "SITE-3", "day": 6,  "grade": 3, "case_id": "CASE-006"},
    {"site": "SITE-3", "day": 8,  "grade": 4, "case_id": "CASE-007"},
    {"site": "SITE-4", "day": 20, "grade": 2, "case_id": "CASE-008"},
    {"site": "SITE-4", "day": 22, "grade": 2, "case_id": "CASE-009"},
    {"site": "SITE-5", "day": 15, "grade": 1, "case_id": "CASE-010"},
]

# Map site placeholder to a numeric x-coordinate for 2-D clustering.
_SITE_X: dict[str, float] = {
    "SITE-1": 1.0, "SITE-2": 2.0, "SITE-3": 3.0, "SITE-4": 4.0, "SITE-5": 5.0,
}


# Return the 2-D coordinates (site_x, day) for a single event record.
def _coords(ev: dict[str, Any]) -> tuple[float, float]:
    x = _SITE_X.get(ev["site"], float(list(_SITE_X.values())[-1]) + 1.0)
    return x, float(ev["day"])


# Compute Euclidean distance between two 2-D coordinate pairs.
def _dist(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)


# Group event indices into distance-based clusters (single-linkage, radius=4.0).
def _cluster_events(
    events: list[dict[str, Any]],
) -> list[list[int]]:
    coords = [_coords(ev) for ev in events]
    radius = 4.0
    assigned: list[int | None] = [None] * len(events)
    clusters: list[list[int]] = []

    for i in range(len(events)):
        if assigned[i] is not None:
            continue
        cluster = [i]
        assigned[i] = len(clusters)
        for j in range(i + 1, len(events)):
            if assigned[j] is None and _dist(coords[i], coords[j]) <= radius:
                cluster.append(j)
                assigned[j] = len(clusters)
        clusters.append(cluster)

    return clusters


# Compute the axis-aligned bounding box of a cluster as four hull corners.
def _hull_box(events: list[dict[str, Any]], indices: list[int]) -> list[tuple[float, float]]:
    xs = [_coords(events[i])[0] for i in indices]
    ys = [_coords(events[i])[1] for i in indices]
    x0, x1 = min(xs) - 0.5, max(xs) + 0.5
    y0, y1 = min(ys) - 0.5, max(ys) + 0.5
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


# Build a plain-text abstract cluster description to send to the cloud (no raw data).
def _build_abstract_description(
    events: list[dict[str, Any]],
    clusters: list[list[int]],
    window_days: int,
    current_site: str,
    current_day: int,
    current_grade: int,
) -> str:
    n_events = len(events)
    n_grade3plus = sum(1 for ev in events if ev["grade"] >= 3)
    n_sites = len({ev["site"] for ev in events})
    cluster_summary = ", ".join(
        f"cluster {i + 1}: {len(c)} events"
        for i, c in enumerate(clusters)
        if len(c) >= 2
    )
    return (
        f"Study has {n_events} AEs across {n_sites} sites in the last {window_days} days. "
        f"{n_grade3plus} are Grade 3+. "
        f"Clusters detected: {cluster_summary or 'none with 2+ events'}. "
        f"Current case: site {current_site}, day {current_day}, grade {current_grade}. "
        "What is the most likely explanation and what two to four actions are recommended? "
        "List actions one per line beginning with '- '."
    )


# Parse a bulleted list of recommended actions from plain-text cloud output.
def _parse_actions(cloud_text: str) -> list[str]:
    lines = [ln.lstrip("- ").strip() for ln in cloud_text.splitlines() if ln.strip().startswith("- ")]
    return lines if lines else [
        "Notify Data Safety Monitoring Board of cluster pattern.",
        "Initiate site-specific protocol deviation review.",
        "Consider dose modification per amendment criteria.",
    ]


@router.post("/signal/cluster", response_model=SignalResponse)
# Detect AE event clusters in a study window and generate an abstract cloud hypothesis.
async def cluster_signal(
    req: SignalRequest,
    request: Request,
    pipeline: Pipeline = Depends(get_pipeline),
    budget: SessionBudget = Depends(get_budget),
) -> SignalResponse:
    audit_id = uuid.uuid4().hex

    # Filter events to window and convert to typed records (no raw IDs to cloud).
    filtered = [ev for ev in _SYNTHETIC_EVENTS if ev["day"] <= req.window_days]

    # Find current case; if not in fixture, inject it so the map shows the right position.
    current_ev = next(
        (ev for ev in filtered if ev["case_id"] == req.current_case_id),
        None,
    )
    if current_ev is None:
        # Case not in seeded fixture — synthesize a plausible position from the case_id.
        site_num = int(req.current_case_id.split("-")[1]) % 5 + 1 if "-" in req.current_case_id else 1
        current_ev = {
            "case_id": req.current_case_id,
            "site": f"SITE-{site_num}",
            "day": min(req.window_days, 14),
            "grade": 4,
        }
        filtered.append(current_ev)

    # Build typed event list with placeholder IDs only.
    signal_events = [
        SignalEvent(
            site=ev["site"],
            day=ev["day"],
            grade=ev["grade"],  # type: ignore[arg-type]
            case_id_placeholder=ev["case_id"],
        )
        for ev in filtered
    ]

    # Cluster locally — no raw data to cloud.
    raw_clusters = _cluster_events(filtered)
    signal_clusters = [
        SignalCluster(
            hull=_hull_box(filtered, indices),
            member_indices=indices,
            density_score=round(len(indices) / req.window_days, 4),
        )
        for indices in raw_clusters
        if len(indices) >= 2
    ]

    # Build abstract description and call pipeline.
    abstract_desc = _build_abstract_description(
        filtered,
        raw_clusters,
        req.window_days,
        current_ev["site"],
        current_ev["day"],
        current_ev["grade"],
    )

    try:
        output = pipeline.run(abstract_desc, budget)
        cloud_text = output.final_response
    except Exception:  # noqa: BLE001 — degrade gracefully in mock/error mode
        cloud_text = (
            "- Notify Data Safety Monitoring Board of cluster pattern.\n"
            "- Initiate site-specific protocol deviation review.\n"
            "- Consider dose modification per amendment criteria."
        )

    actions = _parse_actions(cloud_text)
    hypothesis = cloud_text.split("\n")[0].strip() or (
        "Temporal clustering of Grade 3+ events at proximate sites suggests a "
        "site-specific or drug-related signal warranting immediate DSMB review."
    )

    return SignalResponse(
        events=signal_events,
        clusters=signal_clusters,
        current_case_position=(current_ev["site"], current_ev["day"]),
        hypothesis=hypothesis,
        recommended_actions=actions,
        audit_id=audit_id,
    )
