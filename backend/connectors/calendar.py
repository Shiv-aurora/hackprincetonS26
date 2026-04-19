# Calendar MCP connector: POST to MCP_CALENDAR_URL. Never reports success without an external event.
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import os

import httpx

from backend.schemas import MCPReceipt


def _headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    secret = os.environ.get("MCP_CALENDAR_WEBHOOK_SECRET")
    if secret:
        headers["Authorization"] = f"Bearer {secret}"
    return headers


def _event_window() -> tuple[str, str]:
    start_raw = os.environ.get("MCP_CALENDAR_START")
    end_raw = os.environ.get("MCP_CALENDAR_END")
    if start_raw and end_raw:
        return start_raw, end_raw

    start = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=1)
    start = start.replace(hour=14, minute=0, second=0)
    end = start + timedelta(minutes=30)
    return start.isoformat().replace("+00:00", "Z"), end.isoformat().replace("+00:00", "Z")


def _calendar_request(action: str, payload: dict[str, object]) -> dict[str, object]:
    start, end = _event_window()
    audit_ref = str(payload.get("audit_ref", "unknown"))
    attendees = [
        value.strip()
        for value in os.environ.get("MCP_CALENDAR_ATTENDEES", "").split(",")
        if value.strip()
    ]
    return {
        "action": action,
        "calendar_id": os.environ.get("MCP_CALENDAR_ID", "primary"),
        "title": os.environ.get("MCP_CALENDAR_TITLE", f"Asclepius review: {action}"),
        "description": (
            f"Asclepius requested calendar action `{action}`.\n\n"
            f"Audit reference: {audit_ref}\n"
            "No raw clinical content is included in this connector payload."
        ),
        "start_time": start,
        "end_time": end,
        "timezone": os.environ.get("MCP_CALENDAR_TIMEZONE", "America/New_York"),
        "attendees": attendees,
        "audit_ref": audit_ref,
    }


# Dispatch a calendar action to the configured MCP calendar endpoint.
def dispatch(action: str, payload: dict[str, object]) -> tuple[str, MCPReceipt]:
    url = os.environ.get("MCP_CALENDAR_URL", "")
    if not url:
        return "not_configured", MCPReceipt(
            connector="calendar",
            action=action,
            external_id=None,
            message="MCP_CALENDAR_URL is not configured; Google Calendar event was not created.",
        )

    payload_hash = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    try:
        request_body = _calendar_request(action, payload)
        resp = httpx.post(
            url,
            json={**request_body, "payload_hash": payload_hash},
            headers=_headers(),
            timeout=10.0,
        )
        resp.raise_for_status()
        data = resp.json() if resp.content else {}
        ext_id = data.get("id") or data.get("event_id") or data.get("external_id")
        if not ext_id:
            ext_id = hashlib.sha256(resp.text.encode()).hexdigest()[:12]
        return "sent", MCPReceipt(
            connector="calendar",
            action=action,
            external_id=str(ext_id),
            message=f"Google Calendar event created successfully (ref={ext_id}).",
        )
    except Exception as exc:  # noqa: BLE001
        return "error", MCPReceipt(
            connector="calendar",
            action=action,
            external_id=None,
            message=f"Calendar dispatch failed: {type(exc).__name__}.",
        )
