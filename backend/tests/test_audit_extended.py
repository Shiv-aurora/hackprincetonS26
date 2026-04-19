# Smoke tests for extended GET /api/audit (ε fields) and POST /api/audit/reset.
from __future__ import annotations

from fastapi.testclient import TestClient


# Confirm audit response now includes epsilon_spent and epsilon_cap fields.
def test_audit_has_epsilon_fields(client: TestClient) -> None:
    resp = client.get("/api/audit")
    assert resp.status_code == 200
    body = resp.json()
    assert "epsilon_spent" in body, "epsilon_spent missing from audit response"
    assert "epsilon_cap" in body, "epsilon_cap missing from audit response"
    assert isinstance(body["epsilon_spent"], float)
    assert isinstance(body["epsilon_cap"], float)


# Confirm epsilon_cap matches the configured 3.0 default.
def test_audit_epsilon_cap_default(client: TestClient) -> None:
    resp = client.get("/api/audit")
    assert resp.json()["epsilon_cap"] == 3.0


# Confirm audit reset returns ok status.
def test_audit_reset_returns_ok(client: TestClient) -> None:
    resp = client.post("/api/audit/reset")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


# Confirm audit reset zeroes the entry count.
def test_audit_reset_clears_entries(client: TestClient) -> None:
    # Generate at least one entry.
    from backend.tests.conftest import DEMO_DOC
    client.post("/api/complete", json={"document": DEMO_DOC, "prompt": "Summarize."})
    client.post("/api/audit/reset")
    resp = client.get("/api/audit")
    assert resp.json()["session_stats"]["total_requests"] == 0
