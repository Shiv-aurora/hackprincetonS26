// Fetches and returns timeline data from /api/timeline/assemble, with loading and error states.
import { useState, useEffect, useRef } from "react";
import type { TimelineResponse } from "../views/reviewer/types";

const BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// Return type for the useTimelineData hook.
interface UseTimelineDataResult {
  data: TimelineResponse | null;
  loading: boolean;
  error: string | null;
}

// Fetches timeline data from /api/timeline/assemble when document is non-null; caches the last successful result.
export function useTimelineData(document: string | null): UseTimelineDataResult {
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // Track the last document string that produced a successful fetch to avoid redundant requests.
  const lastSuccessDoc = useRef<string | null>(null);

  useEffect(() => {
    if (document === null) return;
    // Skip re-fetch if we already have data for this exact document.
    if (document === lastSuccessDoc.current && data !== null) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${BASE_URL}/api/timeline/assemble`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document }),
    })
      .then((resp) => {
        if (!resp.ok) throw new Error(`timeline/assemble: ${resp.status} ${resp.statusText}`);
        return resp.json() as Promise<TimelineResponse>;
      })
      .then((result) => {
        if (!cancelled) {
          setData(result);
          lastSuccessDoc.current = document;
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error fetching timeline");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [document]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error };
}
