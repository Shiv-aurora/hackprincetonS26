// Typed API client for the NGSP backend. Uses native fetch; no external dependencies.
const BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface EntityItem {
  text: string;
  category: "phi" | "ip" | "mnpi";
  subcategory: string;
  start: number;
  end: number;
  placeholder: string;
}

export interface EntityCounts {
  phi: number;
  ip: number;
  mnpi: number;
}

export interface AnalyzeResponse {
  entities: EntityItem[];
  counts: EntityCounts;
}

export interface PositionMapping {
  original_start: number;
  original_end: number;
  proxy_start: number;
  proxy_end: number;
  placeholder: string;
}

export interface ProxyResponse {
  original: string;
  proxy: string;
  entity_map: Record<string, string>;
  position_mapping: PositionMapping[];
}

export interface RouteResponse {
  path: "abstract_extractable" | "dp_tolerant" | "local_only";
  rationale: string;
}

export interface RoutingInfo {
  path: string;
  rationale: string;
}

export interface CompleteResponse {
  routing: RoutingInfo;
  proxy_sent: string;
  response_raw: string;
  response_rehydrated: string;
  entities_proxied: number;
  entities_blocked: number;
  audit_id: string;
}

export interface AuditLogEntry {
  audit_id: string;
  timestamp: string;
  route: string;
  entities_count: number;
  blocked: boolean;
}

export interface SessionStats {
  total_requests: number;
  proxied: number;
  local_only: number;
  blocked: number;
}

export interface AuditResponse {
  session_stats: SessionStats;
  log: AuditLogEntry[];
}

export interface HealthResponse {
  status: string;
  mock_mode: boolean;
  version: string;
}

// ---------------------------------------------------------------------------
// Client functions
// ---------------------------------------------------------------------------

// POST /api/analyze — detect sensitive entities in a document.
export async function analyzeDocument(text: string): Promise<AnalyzeResponse> {
  const resp = await fetch(`${BASE_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) throw new Error(`analyze: ${resp.status} ${resp.statusText}`);
  return resp.json() as Promise<AnalyzeResponse>;
}

// POST /api/proxy — strip and proxy the full document, returning both texts plus mappings.
export async function proxyDocument(text: string): Promise<ProxyResponse> {
  const resp = await fetch(`${BASE_URL}/api/proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) throw new Error(`proxy: ${resp.status} ${resp.statusText}`);
  return resp.json() as Promise<ProxyResponse>;
}

// POST /api/route — classify the text into an NGSP routing path.
export async function routeDocument(text: string): Promise<RouteResponse> {
  const resp = await fetch(`${BASE_URL}/api/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) throw new Error(`route: ${resp.status} ${resp.statusText}`);
  return resp.json() as Promise<RouteResponse>;
}

// POST /api/complete — run the full pipeline and return the rehydrated response.
export async function completeRequest(
  document: string,
  prompt: string,
  model: "claude-opus-4" | "gpt-5" | "gemini-2" = "claude-opus-4"
): Promise<CompleteResponse> {
  const resp = await fetch(`${BASE_URL}/api/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document, prompt, model }),
  });
  if (!resp.ok) throw new Error(`complete: ${resp.status} ${resp.statusText}`);
  return resp.json() as Promise<CompleteResponse>;
}

// GET /api/audit — fetch session statistics and the full audit log.
export async function fetchAudit(): Promise<AuditResponse> {
  const resp = await fetch(`${BASE_URL}/api/audit`);
  if (!resp.ok) throw new Error(`audit: ${resp.status} ${resp.statusText}`);
  return resp.json() as Promise<AuditResponse>;
}

// GET /api/health — check whether the backend is running.
export async function checkHealth(): Promise<HealthResponse> {
  const resp = await fetch(`${BASE_URL}/api/health`);
  if (!resp.ok) throw new Error(`health: ${resp.status} ${resp.statusText}`);
  return resp.json() as Promise<HealthResponse>;
}
