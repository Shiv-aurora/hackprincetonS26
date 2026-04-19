// Typed API client for the NGSP backend. Uses native fetch; falls back to local demo mode.
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
// Demo fallback state
// ---------------------------------------------------------------------------

type DetectionRule = {
  regex: RegExp;
  category: EntityItem["category"];
  subcategory: string;
};

const DEMO_DELAY_MS = 180;
const DEMO_VERSION = "frontend-demo";
const demoAuditLog: AuditLogEntry[] = [];

const PLACEHOLDER_PREFIX: Record<string, string> = {
  name: "PERSON",
  geographic_subdivision: "GEO",
  date: "DATE",
  other_unique_id: "SUBJECT",
  site_id: "SITE",
  compound_code: "COMPOUND_CODE",
  dose: "DOSE",
  ae_grade: "AE_GRADE",
  timing: "TIMING",
  amendment_rationale: "AMENDMENT",
  efficacy_value: "EFFICACY",
  interim_result: "INTERIM",
};

const DETECTION_RULES: DetectionRule[] = [
  { regex: /\bSubject\s+\d{2}-\d{4}\b/gi, category: "phi", subcategory: "name" },
  { regex: /\b\d{1,3}-year-old\b/gi, category: "phi", subcategory: "other_unique_id" },
  { regex: /\b\d{1,2}-(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-\d{4}\b/gi, category: "phi", subcategory: "date" },
  { regex: /\b(?:Princeton Regional Oncology|Princeton Regional Research Center)\b/gi, category: "phi", subcategory: "geographic_subdivision" },
  { regex: /\bSite\s+\d+\b/gi, category: "ip", subcategory: "site_id" },
  { regex: /\b[A-Z]{2,6}-\d{3,9}(?:-\d{2,4})*(?:-[A-Z]+)?\b/g, category: "ip", subcategory: "compound_code" },
  { regex: /\b\d+(?:\.\d+)?\s*(?:mg|mcg|μg|mg\/kg|μg\/kg|IU|mL|g)\b/gi, category: "ip", subcategory: "dose" },
  { regex: /\bGrade\s+\d\b/gi, category: "ip", subcategory: "ae_grade" },
  { regex: /\bstudy day\s+\d+\b/gi, category: "ip", subcategory: "timing" },
  { regex: /\bAmendment\s+\d+\b/gi, category: "mnpi", subcategory: "amendment_rationale" },
  { regex: /\b\d+%\s+ORR\b/gi, category: "mnpi", subcategory: "efficacy_value" },
  { regex: /\b\d+%\s+target\b/gi, category: "mnpi", subcategory: "efficacy_value" },
  { regex: /\b(?:DSMB|interim analysis|preliminary efficacy analysis|cohort\s+\d+)\b/gi, category: "mnpi", subcategory: "interim_result" },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso(): string {
  return new Date().toISOString();
}

function uniqueId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function getCounts(entities: EntityItem[]): EntityCounts {
  return {
    phi: entities.filter((item) => item.category === "phi").length,
    ip: entities.filter((item) => item.category === "ip").length,
    mnpi: entities.filter((item) => item.category === "mnpi").length,
  };
}

function getRouteFromEntities(entities: EntityItem[]): RouteResponse {
  if (entities.some((item) => item.category === "mnpi")) {
    return {
      path: "dp_tolerant",
      rationale: "MNPI and interim-signal content detected. Differential privacy route selected for safe summarization.",
    };
  }
  if (entities.some((item) => item.category === "phi" || item.category === "ip")) {
    return {
      path: "abstract_extractable",
      rationale: "Sensitive identifiers detected, but task intent can be abstracted into a safe proxy request.",
    };
  }
  return {
    path: "local_only",
    rationale: "No sensitive identifiers detected. Local-only route selected for direct handling.",
  };
}

function analyzeTextLocally(text: string): AnalyzeResponse {
  const hits: Array<Omit<EntityItem, "placeholder">> = [];
  const occupied: Array<{ start: number; end: number }> = [];

  for (const rule of DETECTION_RULES) {
    const matches = text.matchAll(rule.regex);
    for (const match of matches) {
      const value = match[0];
      const start = match.index ?? -1;
      const end = start + value.length;
      if (start < 0) continue;
      if (occupied.some((span) => !(end <= span.start || start >= span.end))) continue;
      occupied.push({ start, end });
      hits.push({
        text: value,
        category: rule.category,
        subcategory: rule.subcategory,
        start,
        end,
      });
    }
  }

  hits.sort((a, b) => a.start - b.start);

  const counters: Record<string, number> = {};
  const entities = hits.map((item) => {
    const prefix = PLACEHOLDER_PREFIX[item.subcategory] ?? item.subcategory.toUpperCase();
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return {
      ...item,
      placeholder: `<${prefix}_${counters[prefix]}>`,
    } satisfies EntityItem;
  });

  return { entities, counts: getCounts(entities) };
}

function proxyTextLocally(text: string): ProxyResponse {
  const { entities } = analyzeTextLocally(text);
  let cursor = 0;
  let proxy = "";
  const entity_map: Record<string, string> = {};
  const position_mapping: PositionMapping[] = [];

  for (const entity of entities) {
    proxy += text.slice(cursor, entity.start);
    const proxy_start = proxy.length;
    proxy += entity.placeholder;
    const proxy_end = proxy.length;
    position_mapping.push({
      original_start: entity.start,
      original_end: entity.end,
      proxy_start,
      proxy_end,
      placeholder: entity.placeholder,
    });
    entity_map[entity.placeholder] = entity.text;
    cursor = entity.end;
  }

  proxy += text.slice(cursor);
  return { original: text, proxy, entity_map, position_mapping };
}

function rehydrate(text: string, entityMap: Record<string, string>): string {
  return Object.keys(entityMap)
    .sort((a, b) => b.length - a.length)
    .reduce((acc, placeholder) => acc.replaceAll(placeholder, entityMap[placeholder]), text);
}

function buildDemoCompletion(proxy: ProxyResponse, prompt: string, model: string): CompleteResponse {
  const analysis = analyzeTextLocally(proxy.original);
  const route = getRouteFromEntities(analysis.entities);
  const audit_id = uniqueId("audit");
  const promptLower = prompt.toLowerCase();

  const placeholders = Object.keys(proxy.entity_map);
  const first = (prefix: string, fallback: string) => placeholders.find((value) => value.startsWith(`<${prefix}_`)) ?? fallback;

  let response_raw: string;
  if (promptLower.includes("e2b") || promptLower.includes("safety") || promptLower.includes("narrative")) {
    response_raw = [
      `ICH E2B draft generated via ${model}.`,
      `Case: ${first("SUBJECT", "<SUBJECT_1>")} enrolled at ${first("SITE", "<SITE_1>")}.`,
      `Suspect product: ${first("COMPOUND_CODE", "<COMPOUND_CODE_1>")} with dose ${first("DOSE", "<DOSE_1>")}.`,
      `Primary event: ${first("AE_GRADE", "<AE_GRADE_1>")} occurring around ${first("TIMING", "<TIMING_1>")}.`,
      `Regulatory note: ${first("AMENDMENT", "<AMENDMENT_1>")} and ${first("INTERIM", "<INTERIM_1>")} remain protected by NGSP.`
    ].join("\n");
  } else if (promptLower.includes("summary") || promptLower.includes("summarize")) {
    response_raw = [
      `Executive summary generated via ${model}.`,
      `- Sensitive items detected: ${analysis.entities.length}`,
      `- Route selected: ${route.path}`,
      `- Main study reference: ${first("COMPOUND_CODE", "<COMPOUND_CODE_1>")}`,
      `- Key signal: ${first("EFFICACY", "<EFFICACY_1>")} with ${first("INTERIM", "<INTERIM_1>")}`,
      `- Privacy handling: identifiers proxied before response synthesis.`
    ].join("\n");
  } else {
    response_raw = [
      `Answer generated via ${model}.`,
      `I can help with this document while keeping ${analysis.counts.phi} PHI, ${analysis.counts.ip} IP, and ${analysis.counts.mnpi} MNPI elements protected.`,
      `Suggested next action: ask for a rewrite, timeline summary, risk memo, or regulatory-style response and I will use the NGSP-safe proxy path.`
    ].join("\n");
  }

  demoAuditLog.push({
    audit_id,
    timestamp: nowIso(),
    route: route.path,
    entities_count: analysis.entities.length,
    blocked: false,
  });

  return {
    routing: route,
    proxy_sent: proxy.proxy,
    response_raw,
    response_rehydrated: rehydrate(response_raw, proxy.entity_map),
    entities_proxied: analysis.entities.length,
    entities_blocked: 0,
    audit_id,
  };
}

function demoAudit(): AuditResponse {
  const session_stats: SessionStats = {
    total_requests: demoAuditLog.length,
    proxied: demoAuditLog.filter((entry) => entry.route !== "local_only").length,
    local_only: demoAuditLog.filter((entry) => entry.route === "local_only").length,
    blocked: demoAuditLog.filter((entry) => entry.blocked).length,
  };
  return { session_stats, log: [...demoAuditLog] };
}

// ---------------------------------------------------------------------------
// Client functions
// ---------------------------------------------------------------------------

export async function analyzeDocument(text: string): Promise<AnalyzeResponse> {
  try {
    const resp = await fetch(`${BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!resp.ok) throw new Error(`analyze: ${resp.status} ${resp.statusText}`);
    return resp.json() as Promise<AnalyzeResponse>;
  } catch {
    await sleep(DEMO_DELAY_MS);
    return analyzeTextLocally(text);
  }
}

export async function proxyDocument(text: string): Promise<ProxyResponse> {
  try {
    const resp = await fetch(`${BASE_URL}/api/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!resp.ok) throw new Error(`proxy: ${resp.status} ${resp.statusText}`);
    return resp.json() as Promise<ProxyResponse>;
  } catch {
    await sleep(DEMO_DELAY_MS);
    return proxyTextLocally(text);
  }
}

export async function routeDocument(text: string): Promise<RouteResponse> {
  try {
    const resp = await fetch(`${BASE_URL}/api/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!resp.ok) throw new Error(`route: ${resp.status} ${resp.statusText}`);
    return resp.json() as Promise<RouteResponse>;
  } catch {
    await sleep(DEMO_DELAY_MS / 2);
    return getRouteFromEntities(analyzeTextLocally(text).entities);
  }
}

export async function completeRequest(
  document: string,
  prompt: string,
  model: "claude-opus-4" | "gpt-5" | "gemini-2" = "claude-opus-4"
): Promise<CompleteResponse> {
  try {
    const resp = await fetch(`${BASE_URL}/api/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document, prompt, model }),
    });
    if (!resp.ok) throw new Error(`complete: ${resp.status} ${resp.statusText}`);
    return resp.json() as Promise<CompleteResponse>;
  } catch {
    await sleep(DEMO_DELAY_MS * 2);
    return buildDemoCompletion(proxyTextLocally(document), prompt, model);
  }
}

export async function fetchAudit(): Promise<AuditResponse> {
  try {
    const resp = await fetch(`${BASE_URL}/api/audit`);
    if (!resp.ok) throw new Error(`audit: ${resp.status} ${resp.statusText}`);
    return resp.json() as Promise<AuditResponse>;
  } catch {
    await sleep(DEMO_DELAY_MS / 2);
    return demoAudit();
  }
}

export async function checkHealth(): Promise<HealthResponse> {
  try {
    const resp = await fetch(`${BASE_URL}/api/health`);
    if (!resp.ok) throw new Error(`health: ${resp.status} ${resp.statusText}`);
    return resp.json() as Promise<HealthResponse>;
  } catch {
    return { status: "ok", mock_mode: true, version: DEMO_VERSION };
  }
}
