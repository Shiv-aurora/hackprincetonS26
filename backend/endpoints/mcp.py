# POST /api/mcp/dispatch — route an action to the appropriate MCP connector and write an audit line.
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter

from backend.schemas import (
    MCPDispatchRequest,
    MCPDispatchResponse,
    MCPReceipt,
)

router = APIRouter()

# Path to the NGSP file-based audit log (append-only source of truth).
_AUDIT_LOG_PATH = Path("experiments/results/audit.jsonl")


# Write one hashed audit line for an MCP dispatch (payload hash only, never raw payload).
def _write_mcp_audit(
    audit_id: str,
    connector: str,
    action: str,
    payload: dict[str, object],
    status: str,
) -> None:
    _AUDIT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload_hash = hashlib.sha256(
        json.dumps(payload, sort_keys=True, default=str).encode()
    ).hexdigest()
    record = {
        "request_id": audit_id,
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "kind": "mcp.dispatch",
        "connector": connector,
        "action": action,
        "payload_hash": payload_hash,
        "status": status,
    }
    with _AUDIT_LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, separators=(",", ":")) + "\n")


@router.post("/mcp/dispatch", response_model=MCPDispatchResponse)
# Route an MCP action to the appropriate connector and record a hashed audit line.
async def mcp_dispatch(req: MCPDispatchRequest) -> MCPDispatchResponse:
    audit_id = uuid.uuid4().hex

    if req.connector == "email":
        from backend.connectors.email import dispatch
        status, receipt = dispatch(req.action, req.payload)

    elif req.connector == "calendar":
        from backend.connectors.calendar import dispatch
        status, receipt = dispatch(req.action, req.payload)

    else:
        # vault_safety, rave_edc, argus — always stub
        from backend.connectors.stub import dispatch
        status, receipt = dispatch(req.connector, req.action, req.payload)

    _write_mcp_audit(audit_id, req.connector, req.action, req.payload, status)

    return MCPDispatchResponse(status=status, receipt=receipt, audit_id=audit_id)  # type: ignore[arg-type]
