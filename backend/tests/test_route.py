# Smoke tests for POST /api/route — routing classification.
from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.conftest import DEMO_DOC

client = TestClient(app)

_VALID_PATHS = {"abstract_extractable", "dp_tolerant", "local_only"}


def test_route_returns_200() -> None:
    # Health-check that the endpoint accepts the demo document without error.
    resp = client.post("/api/route", json={"text": DEMO_DOC})
    assert resp.status_code == 200


def test_route_path_is_valid() -> None:
    # The returned path must be one of the three NGSP routing values.
    resp = client.post("/api/route", json={"text": DEMO_DOC})
    data = resp.json()
    assert data["path"] in _VALID_PATHS, f"Unknown path: {data['path']!r}"


def test_route_rationale_non_empty() -> None:
    # A non-empty rationale string must be returned with every decision.
    resp = client.post("/api/route", json={"text": DEMO_DOC})
    data = resp.json()
    assert len(data["rationale"]) > 0


def test_route_mnpi_document_is_dp_tolerant() -> None:
    # The demo document is MNPI-heavy; the heuristic must return dp_tolerant.
    resp = client.post("/api/route", json={"text": DEMO_DOC})
    data = resp.json()
    assert data["path"] == "dp_tolerant", (
        f"Expected dp_tolerant for MNPI-heavy document, got {data['path']!r}"
    )


def test_route_clean_text_is_abstract_extractable() -> None:
    # A plain, entity-free sentence should route as abstract_extractable.
    resp = client.post("/api/route", json={"text": "Please summarize the following paragraph."})
    data = resp.json()
    assert data["path"] == "abstract_extractable"
