# Email MCP connector: POST to MCP_EMAIL_URL. Never reports success without an external send.
from __future__ import annotations

import hashlib
import json
import os

import httpx

from backend.schemas import MCPReceipt


def _headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    secret = os.environ.get("MCP_EMAIL_WEBHOOK_SECRET")
    if secret:
        headers["Authorization"] = f"Bearer {secret}"
    return headers


def _email_request(action: str, payload: dict[str, object]) -> dict[str, object]:
    audit_ref = str(payload.get("audit_ref", "unknown"))
    subject = os.environ.get("MCP_EMAIL_SUBJECT", f"Asclepius action: {action}")
    to = os.environ.get("MCP_EMAIL_TO", "")
    body = (
        f"Asclepius requested email action `{action}`.\n\n"
        f"Audit reference: {audit_ref}\n"
        f"Exported at: {payload.get('exported_at', 'unknown')}\n\n"
        "No raw clinical content is included in this connector payload."
    )
    return {
        "action": action,
        "to": to,
        "subject": subject,
        "body": body,
        "audit_ref": audit_ref,
    }


# Dispatch an email action to the configured MCP email endpoint.
def dispatch(action: str, payload: dict[str, object]) -> tuple[str, MCPReceipt]:
    url = os.environ.get("MCP_EMAIL_URL", "")
    if not url:
        return "not_configured", MCPReceipt(
            connector="email",
            action=action,
            external_id=None,
            message="MCP_EMAIL_URL is not configured; email was not sent.",
        )

    payload_hash = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    try:
        request_body = _email_request(action, payload)
        resp = httpx.post(
            url,
            json={**request_body, "payload_hash": payload_hash},
            headers=_headers(),
            timeout=10.0,
        )
        resp.raise_for_status()
        data = resp.json() if resp.content else {}
        ext_id = data.get("id") or data.get("message_id") or data.get("external_id")
        if not ext_id:
            ext_id = hashlib.sha256(resp.text.encode()).hexdigest()[:12]
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
