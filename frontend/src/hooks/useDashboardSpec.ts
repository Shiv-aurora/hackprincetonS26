// Submits a prompt to /api/dashboard/generate and returns the resulting spec.
import { useState, useCallback } from "react";
import type { DashboardSpec } from "../views/analyst/types";

const BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// Return type for the useDashboardSpec hook.
export interface UseDashboardSpecResult {
  spec: DashboardSpec | null;
  loading: boolean;
  error: string | null;
  generate: (prompt: string) => void;
}

// Hook: fetches a DashboardSpec from the backend.
export function useDashboardSpec(): UseDashboardSpecResult {
  const [spec, setSpec] = useState<DashboardSpec | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Submits the prompt to the backend; backend is responsible for OpenAI generation.
  const generate = useCallback((prompt: string) => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setSpec(null);

    fetch(`${BASE_URL}/api/dashboard/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, dataset_id: "synthetic-clinical-v1" }),
    })
      .then(async (resp) => {
        if (resp.status === 422) {
          const body = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
          throw Object.assign(new Error("phi_in_prompt"), { status: 422, body });
        }
        if (!resp.ok) throw new Error(`dashboard: ${resp.status}`);
        return resp.json() as Promise<DashboardSpec>;
      })
      .then((data) => setSpec(data))
      .catch((err: unknown) => {
        if (err instanceof Error && err.message === "phi_in_prompt") {
          setError("phi_in_prompt");
        } else {
          setError(err instanceof Error ? err.message : "dashboard_generation_failed");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return { spec, loading, error, generate };
}
