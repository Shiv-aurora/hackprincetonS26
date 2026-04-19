# Smoke tests for POST /api/analyze against the canonical demo SAE narrative.
from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.conftest import DEMO_DOC

client = TestClient(app)


def test_analyze_returns_200() -> None:
    # Health-check that the endpoint accepts the demo document without error.
    resp = client.post("/api/analyze", json={"text": DEMO_DOC})
    assert resp.status_code == 200


def test_analyze_entity_count() -> None:
    # Demo document has entities across all three tiers; require at least 10.
    resp = client.post("/api/analyze", json={"text": DEMO_DOC})
    data = resp.json()
    assert len(data["entities"]) >= 10, (
        f"Expected >=10 entities, got {len(data['entities'])}"
    )


def test_analyze_all_three_tiers_present() -> None:
    # PHI, IP, and MNPI must all be detected in the demo document.
    resp = client.post("/api/analyze", json={"text": DEMO_DOC})
    data = resp.json()
    tiers = {e["category"] for e in data["entities"]}
    assert "phi" in tiers, "PHI tier missing from analysis"
    assert "ip" in tiers, "IP tier missing from analysis"
    assert "mnpi" in tiers, "MNPI tier missing from analysis"


def test_analyze_counts_match_entities() -> None:
    # counts.phi + counts.ip + counts.mnpi must equal len(entities).
    resp = client.post("/api/analyze", json={"text": DEMO_DOC})
    data = resp.json()
    counts = data["counts"]
    total = counts["phi"] + counts["ip"] + counts["mnpi"]
    assert total == len(data["entities"])


def test_analyze_entity_fields() -> None:
    # Every entity must have the required fields with valid values.
    resp = client.post("/api/analyze", json={"text": DEMO_DOC})
    data = resp.json()
    for entity in data["entities"]:
        assert entity["category"] in ("phi", "ip", "mnpi")
        assert entity["start"] >= 0
        assert entity["end"] > entity["start"]
        assert entity["text"] == DEMO_DOC[entity["start"]: entity["end"]]
        assert entity["placeholder"].startswith("<")
