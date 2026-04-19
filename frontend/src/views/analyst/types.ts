// Shared TypeScript types for analyst-persona views and hooks.

// Column descriptor returned by /api/dataset/schema.
export interface DatasetColumn {
  name: string;
  kind: "string" | "int" | "float" | "date" | "category";
  has_entities: boolean;
}

// Schema response from GET /api/dataset/schema.
export interface DatasetSchemaResponse {
  columns: DatasetColumn[];
  total_rows: number;
}

// Entity annotation on an individual cell value.
export interface CellEntity {
  placeholder: string;
  category: string;
}

// A single dataset cell, possibly annotated with an entity placeholder.
export interface DatasetCell {
  value: string | number | null;
  entity?: CellEntity;
}

// A single dataset row returned by /api/dataset/query.
export interface DatasetRow {
  row_id: string;
  cells: Record<string, DatasetCell>;
}

// Request body for POST /api/dataset/query.
export interface DatasetQueryRequest {
  filters: Record<string, string>;
  sort: [string, "asc" | "desc"][];
  cursor: string | null;
  page_size: number;
}

// Response body from POST /api/dataset/query.
export interface DatasetQueryResponse {
  rows: DatasetRow[];
  next_cursor: string | null;
  total_matched: number;
}

// A single chart series with data points and optional color token.
export interface ChartSeries {
  name: string;
  data: [string | number, number][];
  color_token?: string;
}

// A single chart specification within a DashboardSpec.
export interface ChartSpec {
  id: string;
  kind: "bar" | "line" | "stacked-bar" | "kpi" | "heatmap" | string;
  title: string;
  x_axis?: string;
  y_axis?: string;
  series: ChartSeries[];
  annotations: string[];
}

// Full dashboard spec returned by /api/dashboard/generate.
export interface DashboardSpec {
  title: string;
  charts: ChartSpec[];
  narrative_summary: string;
  audit_id: string;
}
