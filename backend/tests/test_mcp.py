# Smoke tests for POST /api/mcp/dispatch with all five connector types.
from __future__ import annotations

from fastapi.testclient import TestClient


# Confirm argus connector always returns a synthetic receipt.
def test_mcp_argus_returns_stub_receipt(client: TestClient) -> None:
    resp = client.post(
        "/api/mcp/dispatch",
        json={"connector": "argus", "action": "file_case", "payload": {"case_id": "CASE-001"}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "sent"
    assert body["receipt"]["external_id"].startswith("STUB-")
    assert body["audit_id"]


# Confirm vault_safety connector returns a synthetic receipt.
def test_mcp_vault_safety_stub(client: TestClient) -> None:
    resp = client.post(
        "/api/mcp/dispatch",
        json={"connector": "vault_safety", "action": "submit_saer", "payload": {}},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "sent"
    assert "STUB-" in resp.json()["receipt"]["external_id"]


# Confirm rave_edc connector returns a synthetic receipt.
def test_mcp_rave_edc_stub(client: TestClient) -> None:
    resp = client.post(
        "/api/mcp/dispatch",
        json={"connector": "rave_edc", "action": "lock_form", "payload": {}},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "sent"


# Confirm email connector returns not_configured when MCP_EMAIL_URL is absent.
def test_mcp_email_not_configured(client: TestClient) -> None:
    # MCP_EMAIL_URL is not set in test env, so connector returns not_configured.
    import os
    os.environ.pop("MCP_EMAIL_URL", None)
    resp = client.post(
        "/api/mcp/dispatch",
        json={"connector": "email", "action": "send", "payload": {"to": "test@example.com"}},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "not_configured"


# Confirm calendar connector returns not_configured when MCP_CALENDAR_URL is absent.
def test_mcp_calendar_not_configured(client: TestClient) -> None:
    # MCP_CALENDAR_URL is not set in test env, so connector returns not_configured.
    import os
    os.environ.pop("MCP_CALENDAR_URL", None)
    resp = client.post(
        "/api/mcp/dispatch",
        json={"connector": "calendar", "action": "create_hold", "payload": {}},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "not_configured"


# Confirm an invalid connector name returns HTTP 422.
def test_mcp_invalid_connector(client: TestClient) -> None:
    resp = client.post(
        "/api/mcp/dispatch",
        json={"connector": "ftp", "action": "upload", "payload": {}},
    )
    assert resp.status_code == 422


# Confirm the receipt contains connector, action, and message fields.
def test_mcp_receipt_fields(client: TestClient) -> None:
    resp = client.post(
        "/api/mcp/dispatch",
        json={"connector": "argus", "action": "file_case", "payload": {}},
    )
    receipt = resp.json()["receipt"]
    for field in ("connector", "action", "message"):
        assert field in receipt, f"Missing receipt field: {field!r}"


# Confirm audit_id is a non-empty hex string.
def test_mcp_audit_id_hex(client: TestClient) -> None:
    resp = client.post(
        "/api/mcp/dispatch",
        json={"connector": "argus", "action": "file_case", "payload": {}},
    )
    audit_id = resp.json()["audit_id"]
    assert len(audit_id) > 0
    int(audit_id, 16)
