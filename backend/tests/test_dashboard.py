# Smoke tests for POST /api/dashboard/generate in offline/mock mode.
from __future__ import annotations

from fastapi.testclient import TestClient


# Confirm dashboard returns HTTP 200 with required fields for a safe prompt.
def test_dashboard_smoke(client: TestClient) -> None:
    resp = client.post(
        "/api/dashboard/generate",
        json={"prompt": "Show me AE grade distribution by site"},
    )
    assert resp.status_code == 200
    body = resp.json()
    for field in ("title", "charts", "narrative_summary", "audit_id"):
        assert field in body, f"Missing field: {field!r}"


# Confirm each chart spec has required fields.
def test_dashboard_chart_fields(client: TestClient) -> None:
    resp = client.post(
        "/api/dashboard/generate",
        json={"prompt": "Show weekly AE trends"},
    )
    charts = resp.json()["charts"]
    assert len(charts) > 0
    for chart in charts:
        assert "id" in chart
        assert "kind" in chart
        assert chart["kind"] in ("bar", "line", "stacked-bar", "kpi", "heatmap")
        assert "title" in chart
        assert "series" in chart


# Confirm a prompt containing a phone number returns HTTP 422 (PHI detected).
def test_dashboard_rejects_phi_prompt(client: TestClient) -> None:
    resp = client.post(
        "/api/dashboard/generate",
        json={"prompt": "Show data for patient 555-123-4567"},
    )
    assert resp.status_code == 422


# Confirm audit_id is a non-empty hex string.
def test_dashboard_audit_id_hex(client: TestClient) -> None:
    resp = client.post(
        "/api/dashboard/generate",
        json={"prompt": "Overview dashboard"},
    )
    audit_id = resp.json()["audit_id"]
    assert len(audit_id) > 0
    int(audit_id, 16)


# Confirm prompt shorter than 4 chars is rejected with HTTP 422.
def test_dashboard_rejects_short_prompt(client: TestClient) -> None:
    resp = client.post(
        "/api/dashboard/generate",
        json={"prompt": "hi"},
    )
    assert resp.status_code == 422
