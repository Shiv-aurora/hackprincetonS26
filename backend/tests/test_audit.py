# Smoke tests for GET /api/audit — in-memory session audit log.
from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import app, _audit_log
from backend.tests.conftest import DEMO_DOC

client = TestClient(app)


def _clear_log() -> None:
    """Empty the in-memory audit log so tests start from a known baseline."""
    _audit_log.clear()


def test_audit_returns_200() -> None:
    # Health-check that the GET endpoint responds without error.
    resp = client.get("/api/audit")
    assert resp.status_code == 200


def test_audit_schema() -> None:
    # Response must contain session_stats and log top-level keys.
    resp = client.get("/api/audit")
    data = resp.json()
    assert "session_stats" in data
    assert "log" in data
    stats = data["session_stats"]
    for key in ("total_requests", "proxied", "local_only", "blocked"):
        assert key in stats, f"Missing stats key: {key!r}"


def test_audit_log_grows_after_complete() -> None:
    # After a /api/complete call, the audit log length must increase by exactly 1.
    _clear_log()
    before = client.get("/api/audit").json()["session_stats"]["total_requests"]
    client.post(
        "/api/complete",
        json={"document": DEMO_DOC, "prompt": "Summarize."},
    )
    after = client.get("/api/audit").json()["session_stats"]["total_requests"]
    assert after == before + 1


def test_audit_log_entry_fields() -> None:
    # Every log entry must have the required fields with sensible types.
    _clear_log()
    client.post(
        "/api/complete",
        json={"document": DEMO_DOC, "prompt": "Summarize."},
    )
    data = client.get("/api/audit").json()
    assert len(data["log"]) >= 1
    entry = data["log"][0]
    for field in ("audit_id", "timestamp", "route", "entities_count", "blocked"):
        assert field in entry, f"Missing entry field: {field!r}"
    assert isinstance(entry["entities_count"], int)
    assert isinstance(entry["blocked"], bool)


def test_audit_no_raw_content_logged() -> None:
    # Audit entries must not contain raw document text (only metadata is stored).
    _clear_log()
    client.post(
        "/api/complete",
        json={"document": DEMO_DOC, "prompt": "Summarize."},
    )
    data = client.get("/api/audit").json()
    raw_log_str = str(data["log"])
    # Verify the original text and any fragment of sensitive content are absent.
    assert "BMS-986253" not in raw_log_str
    assert "04-0023" not in raw_log_str
