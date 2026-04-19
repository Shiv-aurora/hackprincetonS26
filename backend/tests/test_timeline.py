# Smoke tests for POST /api/timeline/assemble in offline/mock mode.
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.tests.conftest import SEED_NARRATIVE


# Confirm the timeline endpoint returns a valid TimelineResponse in mock mode.
def test_timeline_smoke(client: TestClient) -> None:
    resp = client.post("/api/timeline/assemble", json={"document": SEED_NARRATIVE})
    assert resp.status_code == 200
    body = resp.json()
    assert body["causality"]["verdict"] in {
        "certain", "probable", "possible", "unlikely", "unassessable"
    }
    assert body["audit_id"], "audit_id must be non-empty"


# Confirm required top-level keys are present in the TimelineResponse.
def test_timeline_required_fields(client: TestClient) -> None:
    resp = client.post("/api/timeline/assemble", json={"document": SEED_NARRATIVE})
    body = resp.json()
    for field in ("demographics", "tracks", "annotations", "causality", "audit_id"):
        assert field in body, f"Missing field: {field!r}"


# Confirm demographics contains age_band, sex, and site_id_placeholder.
def test_timeline_demographics_fields(client: TestClient) -> None:
    resp = client.post("/api/timeline/assemble", json={"document": SEED_NARRATIVE})
    demo = resp.json()["demographics"]
    assert "age_band" in demo
    assert demo["sex"] in ("M", "F", "U")
    assert "site_id_placeholder" in demo


# Confirm tracks object contains all four track keys.
def test_timeline_tracks_present(client: TestClient) -> None:
    resp = client.post("/api/timeline/assemble", json={"document": SEED_NARRATIVE})
    tracks = resp.json()["tracks"]
    for key in ("event", "dosing", "conmeds", "labs"):
        assert key in tracks, f"Missing track: {key!r}"


# Confirm no raw document text appears in the audit log after a timeline call.
def test_timeline_no_raw_content_in_audit(client: TestClient) -> None:
    client.post("/api/timeline/assemble", json={"document": SEED_NARRATIVE})
    audit = client.get("/api/audit").json()
    raw_audit_str = str(audit)
    # Sensitive fragments must not appear in the audit output.
    assert "55-year-old" not in raw_audit_str
    assert "50mg" not in raw_audit_str


# Confirm the endpoint rejects an empty document with HTTP 422.
def test_timeline_rejects_empty_document(client: TestClient) -> None:
    resp = client.post("/api/timeline/assemble", json={"document": ""})
    assert resp.status_code == 422


# Confirm audit_id is a non-empty hex string.
def test_timeline_audit_id_is_hex(client: TestClient) -> None:
    resp = client.post("/api/timeline/assemble", json={"document": SEED_NARRATIVE})
    audit_id = resp.json()["audit_id"]
    assert len(audit_id) > 0
    int(audit_id, 16)
