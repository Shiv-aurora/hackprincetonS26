# Smoke tests for POST /api/signal/cluster in offline/mock mode.
from __future__ import annotations

from fastapi.testclient import TestClient


# Confirm the signal endpoint returns HTTP 200 with valid structure.
def test_signal_smoke(client: TestClient) -> None:
    resp = client.post(
        "/api/signal/cluster",
        json={"study_id": "STUDY-001", "current_case_id": "CASE-003", "window_days": 30},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "events" in body
    assert "clusters" in body
    assert "hypothesis" in body
    assert "recommended_actions" in body
    assert "audit_id" in body


# Confirm events list is non-empty within a 30-day window.
def test_signal_events_non_empty(client: TestClient) -> None:
    resp = client.post(
        "/api/signal/cluster",
        json={"study_id": "STUDY-001", "current_case_id": "CASE-001", "window_days": 30},
    )
    assert len(resp.json()["events"]) > 0


# Confirm each event has required fields with valid grade.
def test_signal_event_fields(client: TestClient) -> None:
    resp = client.post(
        "/api/signal/cluster",
        json={"study_id": "STUDY-001", "current_case_id": "CASE-001", "window_days": 30},
    )
    for ev in resp.json()["events"]:
        assert "site" in ev
        assert "day" in ev
        assert "grade" in ev
        assert ev["grade"] in (1, 2, 3, 4, 5)
        assert "case_id_placeholder" in ev


# Confirm recommended_actions is a non-empty list.
def test_signal_recommended_actions_non_empty(client: TestClient) -> None:
    resp = client.post(
        "/api/signal/cluster",
        json={"study_id": "STUDY-001", "current_case_id": "CASE-001", "window_days": 30},
    )
    actions = resp.json()["recommended_actions"]
    assert isinstance(actions, list)
    assert len(actions) > 0


# Confirm window_days validation rejects 0.
def test_signal_rejects_zero_window(client: TestClient) -> None:
    resp = client.post(
        "/api/signal/cluster",
        json={"study_id": "STUDY-001", "current_case_id": "CASE-001", "window_days": 0},
    )
    assert resp.status_code == 422


# Confirm current_case_position is a two-element tuple [site, day].
def test_signal_current_case_position(client: TestClient) -> None:
    resp = client.post(
        "/api/signal/cluster",
        json={"study_id": "STUDY-001", "current_case_id": "CASE-001", "window_days": 30},
    )
    pos = resp.json()["current_case_position"]
    assert len(pos) == 2
    assert isinstance(pos[1], int)
