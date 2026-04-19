// Polls /api/audit every 2 seconds and returns the latest entries + ε state.
import { useState, useEffect } from "react";

const BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/** Shape of a single audit entry returned by /api/audit (extended backend schema). */
export interface AuditEntry {
  request_id: string;
  timestamp: string;       // ISO-8601 UTC
  model: string;
  prompt_length: number;
  prompt_hash: string;
  system_length: number;
  system_hash: string | null;
  max_tokens: number;
  response_length: number;
  response_hash: string | null;
  status: "ok" | "canary_leak" | "mock_ok" | "error";
  error_type: string | null;
}

/** Return type of the hook — entries, cumulative ε, and the session cap. */
export interface ForensicStreamResult {
  entries: AuditEntry[];
  epsilonSpent: number;
  epsilonCap: number;
}

// Raw response shape from GET /api/audit.
interface RawAuditResponse {
  entries: AuditEntry[];
  epsilon_spent: number;
  epsilon_cap: number;
}

const POLL_INTERVAL_MS = 2000;

/** Polls the audit endpoint every 2 s; returns stale data silently on fetch errors. */
export function useForensicStream(): ForensicStreamResult {
  const [state, setState] = useState<ForensicStreamResult>({
    entries: [],
    epsilonSpent: 0,
    epsilonCap: 3.0,
  });

  useEffect(() => {
    let cancelled = false;

    // Fetch once immediately, then on each interval tick.
    async function poll() {
      try {
        const resp = await fetch(`${BASE_URL}/api/audit`);
        if (!resp.ok) return; // Return stale data silently.
        const data = (await resp.json()) as RawAuditResponse;
        if (cancelled) return;
        // Only store fields present in the audit schema — no raw content ever.
        setState({
          entries: data.entries ?? [],
          epsilonSpent: data.epsilon_spent ?? 0,
          epsilonCap: data.epsilon_cap ?? 3.0,
        });
      } catch {
        // Network error — leave state unchanged (stale data).
      }
    }

    void poll();
    const id = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return state;
}
