// Typed MCP connector dispatch helpers — each targets a specific external system.
const BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/** Response shape returned by POST /api/mcp/dispatch. */
export interface MCPDispatchResponse {
  status: "sent" | "not_configured" | "error";
  receipt: {
    connector: string;
    action: string;
    external_id: string | null;
    message: string;
  };
  audit_id: string;
}

// Internal connector type matching the backend enum.
type Connector =
  | "email"
  | "calendar"
  | "vault_safety"
  | "rave_edc"
  | "argus";

// Shared POST helper — never includes raw prompt or response content in payload.
async function dispatchConnector(
  connector: Connector,
  action: string,
  auditRef: string
): Promise<MCPDispatchResponse> {
  const payload = {
    audit_ref: auditRef,
    exported_at: new Date().toISOString(),
  };
  const resp = await fetch(`${BASE_URL}/api/mcp/dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connector, action, payload }),
  });
  if (!resp.ok) {
    // Surface a structured error response rather than throwing.
    const errorResponse: MCPDispatchResponse = {
      status: "error",
      receipt: {
        connector,
        action,
        external_id: null,
        message: `HTTP ${resp.status} ${resp.statusText}`,
      },
      audit_id: "",
    };
    return errorResponse;
  }
  return resp.json() as Promise<MCPDispatchResponse>;
}

/** Dispatch an action to the email MCP connector. */
export async function dispatchEmail(
  action: string,
  auditRef: string
): Promise<MCPDispatchResponse> {
  return dispatchConnector("email", action, auditRef);
}

/** Dispatch an action to the calendar MCP connector. */
export async function dispatchCalendar(
  action: string,
  auditRef: string
): Promise<MCPDispatchResponse> {
  return dispatchConnector("calendar", action, auditRef);
}

/** Dispatch an action to the Vault Safety MCP connector. */
export async function dispatchVaultSafety(
  action: string,
  auditRef: string
): Promise<MCPDispatchResponse> {
  return dispatchConnector("vault_safety", action, auditRef);
}

/** Dispatch an action to the Rave EDC MCP connector. */
export async function dispatchRaveEDC(
  action: string,
  auditRef: string
): Promise<MCPDispatchResponse> {
  return dispatchConnector("rave_edc", action, auditRef);
}

/** Dispatch an action to the Argus pharmacovigilance MCP connector. */
export async function dispatchArgus(
  action: string,
  auditRef: string
): Promise<MCPDispatchResponse> {
  return dispatchConnector("argus", action, auditRef);
}
