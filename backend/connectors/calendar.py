# Calendar MCP connector: POST to MCP_CALENDAR_URL if configured, otherwise not_configured.
from __future__ import annotations

import hashlib
import json
import os
import uuid

import httpx

from backend.schemas import MCPReceipt


# Dispatch a calendar action to the configured MCP calendar endpoint.
def dispatch(action: str, payload: dict[str, object]) -> tuple[str, MCPReceipt]:
    url = os.environ.get("MCP_CALENDAR_URL", "")
    if not url:
        return "not_configured", MCPReceipt(
            connector="calendar",
            action=action,
            external_id=None,
            message="MCP_CALENDAR_URL is not configured; calendar hold was not created.",
        )

    payload_hash = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    try:
        resp = httpx.post(url, json={"action": action, "payload_hash": payload_hash}, timeout=10.0)
        resp.raise_for_status()
        ext_id = resp.json().get("id") or uuid.uuid4().hex
        return "sent", MCPReceipt(
            connector="calendar",
            action=action,
            external_id=str(ext_id),
            message=f"Calendar hold created successfully (ref={ext_id}).",
        )
    except Exception as exc:  # noqa: BLE001
        return "error", MCPReceipt(
            connector="calendar",
            action=action,
            external_id=None,
            message=f"Calendar dispatch failed: {type(exc).__name__}.",
        )
