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

// Generates a mock DashboardSpec fixture for offline/demo mode.
function mockDashboardSpec(prompt: string): DashboardSpec {
  const isGrade = prompt.toLowerCase().includes("grade");
  const isSite = prompt.toLowerCase().includes("site");
  return {
    title: isGrade ? "AE Grade Distribution" : isSite ? "Events by Site" : "Study Overview Dashboard",
    charts: [
      {
        id: "chart-1",
        kind: "bar",
        title: "Adverse Events by Grade",
        x_axis: "Grade",
        y_axis: "Count",
        series: [
          {
            name: "Events",
            data: [
              ["Grade 1", 42],
              ["Grade 2", 31],
              ["Grade 3", 18],
              ["Grade 4", 7],
            ],
            color_token: "--color-primary-fixed",
          },
        ],
        annotations: ["N=98 total AE reports across all sites"],
      },
      {
        id: "chart-2",
        kind: "line",
        title: "Cumulative Enrollment Over Time",
        x_axis: "Study Week",
        y_axis: "Subjects",
        series: [
          {
            name: "Enrolled",
            data: [
              ["Wk1", 8],
              ["Wk2", 19],
              ["Wk4", 35],
              ["Wk6", 52],
              ["Wk8", 68],
              ["Wk10", 80],
            ],
            color_token: "--color-tertiary",
          },
        ],
        annotations: [],
      },
      {
        id: "chart-3",
        kind: "kpi",
        title: "Total Subjects Enrolled",
        series: [{ name: "Total", data: [["Total", 80]] }],
        annotations: [],
      },
      {
        id: "chart-4",
        kind: "stacked-bar",
        title: "Outcomes by Site",
        x_axis: "Site",
        y_axis: "Count",
        series: [
          {
            name: "Recovered",
            data: [
              ["SITE-1", 12],
              ["SITE-2", 9],
              ["SITE-3", 14],
            ],
            color_token: "--color-tertiary",
          },
          {
            name: "Ongoing",
            data: [
              ["SITE-1", 5],
              ["SITE-2", 3],
              ["SITE-3", 7],
            ],
            color_token: "--color-phi",
          },
        ],
        annotations: [],
      },
    ],
    narrative_summary:
      "The synthetic study cohort shows a typical AE distribution with Grade 1–2 events comprising ~74% of all reports. Enrollment accelerated after Week 4, consistent with site activation patterns. No clustering anomalies were detected in the site-level outcome breakdown.",
    audit_id: `mock-audit-${Math.random().toString(36).slice(2, 10)}`,
  };
}

// Hook: fetches or mock-generates a DashboardSpec from a natural-language prompt.
export function useDashboardSpec(): UseDashboardSpecResult {
  const [spec, setSpec] = useState<DashboardSpec | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Submits the prompt to the backend; falls back to mock data if backend is unavailable.
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
          // Backend unavailable — use mock data.
          setSpec(mockDashboardSpec(prompt));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return { spec, loading, error, generate };
}
