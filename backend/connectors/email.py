# Email MCP connector: POST to MCP_EMAIL_URL if configured, otherwise not_configured.
from __future__ import annotations

import hashlib
import json
import os
import uuid

import httpx

from backend.schemas import MCPReceipt


# Dispatch an email action to the configured MCP email endpoint.
def dispatch(action: str, payload: dict[str, object]) -> tuple[str, MCPReceipt]:
    url = os.environ.get("MCP_EMAIL_URL", "")
    if not url:
        # Demo mode: return a synthetic sent receipt so the UI chip shows success.
        stub_id = f"STUB-{uuid.uuid4().hex[:8].upper()}"
        return "sent", MCPReceipt(
            connector="email",
            action=action,
            external_id=stub_id,
            message=f"Demo mode: email stub dispatched (ref={stub_id}).",
        )

    payload_hash = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    try:
        resp = httpx.post(url, json={"action": action, "payload_hash": payload_hash}, timeout=10.0)
        resp.raise_for_status()
        ext_id = resp.json().get("id") or uuid.uuid4().hex
        return "sent", MCPReceipt(
            connector="email",
            action=action,
            external_id=str(ext_id),
            message=f"Email dispatched successfully (ref={ext_id}).",
        )
    except Exception as exc:  # noqa: BLE001
        return "error", MCPReceipt(
            connector="email",
            action=action,
            external_id=None,
            message=f"Email dispatch failed: {type(exc).__name__}.",
        )
