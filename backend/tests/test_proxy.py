# Smoke tests for POST /api/proxy against the canonical demo SAE narrative.
from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.conftest import DEMO_DOC

client = TestClient(app)


def test_proxy_returns_200() -> None:
    # Health-check that the endpoint accepts the demo document without error.
    resp = client.post("/api/proxy", json={"text": DEMO_DOC})
    assert resp.status_code == 200


def test_proxy_text_differs_from_original() -> None:
    # The proxy text must differ from the original (at least one replacement made).
    resp = client.post("/api/proxy", json={"text": DEMO_DOC})
    data = resp.json()
    assert data["proxy"] != data["original"]


def test_proxy_entity_map_non_empty() -> None:
    # The entity_map must contain at least one placeholder → value mapping.
    resp = client.post("/api/proxy", json={"text": DEMO_DOC})
    data = resp.json()
    assert len(data["entity_map"]) > 0


def test_proxy_placeholder_format() -> None:
    # Every placeholder in entity_map must follow the <CATEGORY_N> convention.
    import re
    resp = client.post("/api/proxy", json={"text": DEMO_DOC})
    data = resp.json()
    pattern = re.compile(r"^<[A-Z_]+_\d+>$")
    for ph in data["entity_map"]:
        assert pattern.match(ph), f"Placeholder does not match expected format: {ph!r}"


def test_proxy_position_mapping_non_empty() -> None:
    # Position mappings must be returned (one per proxied entity).
    resp = client.post("/api/proxy", json={"text": DEMO_DOC})
    data = resp.json()
    assert len(data["position_mapping"]) > 0


def test_proxy_position_mapping_fields() -> None:
    # Each mapping must have valid start/end offsets and a known placeholder.
    resp = client.post("/api/proxy", json={"text": DEMO_DOC})
    data = resp.json()
    entity_map = data["entity_map"]
    for m in data["position_mapping"]:
        assert m["original_end"] > m["original_start"]
        assert m["proxy_end"] > m["proxy_start"]
        assert m["placeholder"] in entity_map
