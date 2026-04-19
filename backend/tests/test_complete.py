# Smoke tests for POST /api/complete — full pipeline in offline/mock mode.
from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.conftest import DEMO_DOC

client = TestClient(app)

_DEMO_PROMPT = "Rewrite this in ICH E2B format."


def test_complete_returns_200() -> None:
    # Health-check that the endpoint accepts a full request without error.
    resp = client.post(
        "/api/complete",
        json={"document": DEMO_DOC, "prompt": _DEMO_PROMPT},
    )
    assert resp.status_code == 200


def test_complete_required_fields_present() -> None:
    # Response must contain all six top-level fields defined in CompleteResponse.
    resp = client.post(
        "/api/complete",
        json={"document": DEMO_DOC, "prompt": _DEMO_PROMPT},
    )
    data = resp.json()
    for field in ("routing", "proxy_sent", "response_raw", "response_rehydrated",
                  "entities_proxied", "entities_blocked", "audit_id"):
        assert field in data, f"Missing field: {field!r}"


def test_complete_routing_has_valid_path() -> None:
    # The embedded routing.path must be one of the three valid NGSP paths.
    resp = client.post(
        "/api/complete",
        json={"document": DEMO_DOC, "prompt": _DEMO_PROMPT},
    )
    data = resp.json()
    assert data["routing"]["path"] in {
        "abstract_extractable", "dp_tolerant", "local_only"
    }


def test_complete_proxy_differs_from_document() -> None:
    # The proxy_sent field must differ from the original document (substitutions happened).
    resp = client.post(
        "/api/complete",
        json={"document": DEMO_DOC, "prompt": _DEMO_PROMPT},
    )
    data = resp.json()
    assert data["proxy_sent"] != DEMO_DOC


def test_complete_entities_proxied_positive() -> None:
    # The demo document has multiple sensitive entities; count must be positive.
    resp = client.post(
        "/api/complete",
        json={"document": DEMO_DOC, "prompt": _DEMO_PROMPT},
    )
    data = resp.json()
    assert data["entities_proxied"] > 0


def test_complete_audit_id_is_hex() -> None:
    # audit_id must be a non-empty hex string.
    resp = client.post(
        "/api/complete",
        json={"document": DEMO_DOC, "prompt": _DEMO_PROMPT},
    )
    data = resp.json()
    audit_id = data["audit_id"]
    assert len(audit_id) > 0
    int(audit_id, 16)  # raises ValueError if not hex
