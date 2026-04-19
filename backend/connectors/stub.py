# Stub connectors for Vault Safety, Rave EDC, and Argus — always return synthetic receipts.
from __future__ import annotations

import uuid

from backend.schemas import MCPReceipt

# Human-readable description for each stub connector.
_CONNECTOR_DESCRIPTIONS: dict[str, str] = {
    "vault_safety": "Veeva Vault Safety (stub)",
    "rave_edc": "Medidata Rave EDC (stub)",
    "argus": "Oracle Argus Safety (stub)",
}


# Return a synthetic receipt for any stub connector action without a real network call.
def dispatch(connector: str, action: str, payload: dict[str, object]) -> tuple[str, MCPReceipt]:
    ext_id = f"STUB-{uuid.uuid4().hex[:8].upper()}"
    description = _CONNECTOR_DESCRIPTIONS.get(connector, connector)
    return "sent", MCPReceipt(
        connector=connector,
        action=action,
        external_id=ext_id,
        message=f"Stub dispatch to {description} succeeded (ref={ext_id}). No real system was contacted.",
    )
