// Fetches signal cluster data from /api/signal/cluster, with loading and error states.
import { useState, useEffect } from "react";
import type { SignalResponse } from "../views/reviewer/types";

const BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// Return type for the useSignalData hook.
interface UseSignalDataResult {
  data: SignalResponse | null;
  loading: boolean;
  error: string | null;
}

// Fetches signal cluster data from /api/signal/cluster; re-fetches when any parameter changes.
export function useSignalData(
  studyId: string,
  caseId: string,
  windowDays: number
): UseSignalDataResult {
  const [data, setData] = useState<SignalResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studyId || !caseId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${BASE_URL}/api/signal/cluster`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ study_id: studyId, current_case_id: caseId, window_days: windowDays }),
    })
      .then((resp) => {
        if (!resp.ok) throw new Error(`signal/cluster: ${resp.status} ${resp.statusText}`);
        return resp.json() as Promise<SignalResponse>;
      })
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error fetching signal data");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [studyId, caseId, windowDays]);

  return { data, loading, error };
}
