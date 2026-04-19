// Synthetic fixture data for analyst view tests — no real PHI or clinical data.
import type { DashboardSpec, DatasetSchemaResponse, DatasetQueryResponse } from "../types";

// A minimal DashboardSpec fixture covering all five chart kinds for test coverage.
export const DASHBOARD_FIXTURE: DashboardSpec = {
  title: "Synthetic Study Dashboard",
  charts: [
    {
      id: "chart-bar",
      kind: "bar",
      title: "AE Grade Distribution",
      x_axis: "Grade",
      y_axis: "Count",
      series: [
        {
          name: "Events",
          data: [
            ["Grade 1", 42],
            ["Grade 2", 28],
            ["Grade 3", 14],
            ["Grade 4", 6],
          ],
        },
      ],
      annotations: ["N=90 total events"],
    },
    {
      id: "chart-line",
      kind: "line",
      title: "Enrollment Over Time",
      x_axis: "Week",
      y_axis: "Subjects",
      series: [
        {
          name: "Enrolled",
          data: [
            ["Wk1", 5],
            ["Wk2", 15],
            ["Wk4", 30],
            ["Wk6", 45],
          ],
        },
      ],
      annotations: [],
    },
    {
      id: "chart-stacked",
      kind: "stacked-bar",
      title: "Outcomes by Site",
      x_axis: "Site",
      y_axis: "Count",
      series: [
        {
          name: "Recovered",
          data: [
            ["SITE-1", 10],
            ["SITE-2", 8],
          ],
        },
        {
          name: "Ongoing",
          data: [
            ["SITE-1", 3],
            ["SITE-2", 5],
          ],
        },
      ],
      annotations: [],
    },
    {
      id: "chart-kpi",
      kind: "kpi",
      title: "Total Enrolled",
      series: [{ name: "Total", data: [["Total", 80]] }],
      annotations: [],
    },
    {
      id: "chart-heatmap",
      kind: "heatmap",
      title: "Site × Week Density",
      series: [
        {
          name: "SITE-1",
          data: [
            ["Wk1", 3],
            ["Wk2", 7],
            ["Wk4", 11],
          ],
        },
        {
          name: "SITE-2",
          data: [
            ["Wk1", 2],
            ["Wk2", 5],
            ["Wk4", 9],
          ],
        },
      ],
      annotations: [],
    },
  ],
  narrative_summary:
    "Synthetic cohort shows typical AE distribution. Grade 1–2 events account for 78% of total. Enrollment accelerated after week 2.",
  audit_id: "audit-fixture-001",
};

// A fixture with an unrecognised chart kind to test graceful fallback rendering.
export const UNKNOWN_CHART_FIXTURE: DashboardSpec = {
  title: "Unknown Chart Test",
  charts: [
    {
      id: "chart-unknown",
      kind: "unknown-chart-type",
      title: "An Unsupported Chart",
      series: [],
      annotations: [],
    },
  ],
  narrative_summary: "",
  audit_id: "audit-fixture-002",
};

// A minimal schema fixture for DatasetPreviewView tests.
export const SCHEMA_FIXTURE: DatasetSchemaResponse = {
  columns: [
    { name: "subject_id", kind: "string", has_entities: true },
    { name: "site", kind: "category", has_entities: true },
    { name: "ae_grade", kind: "int", has_entities: false },
    { name: "outcome", kind: "category", has_entities: false },
  ],
  total_rows: 3,
};

// A minimal query response fixture with one entity-annotated cell and a next_cursor.
export const QUERY_FIXTURE: DatasetQueryResponse = {
  rows: [
    {
      row_id: "row-0",
      cells: {
        subject_id: {
          value: "SUBJ-0001",
          entity: { placeholder: "<SUBJECT_1>", category: "phi" },
        },
        site: {
          value: "SITE-1",
          entity: { placeholder: "<SITE_1>", category: "ip" },
        },
        ae_grade: { value: 2 },
        outcome: { value: "Recovered" },
      },
    },
    {
      row_id: "row-1",
      cells: {
        subject_id: { value: "SUBJ-0002" },
        site: { value: "SITE-2" },
        ae_grade: { value: 1 },
        outcome: { value: "Ongoing" },
      },
    },
  ],
  next_cursor: "50",
  total_matched: 3,
};

// A query response fixture with no next_cursor (last page).
export const QUERY_LAST_PAGE_FIXTURE: DatasetQueryResponse = {
  ...QUERY_FIXTURE,
  next_cursor: null,
};
