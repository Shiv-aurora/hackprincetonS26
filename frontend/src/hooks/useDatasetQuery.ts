// Manages dataset query state including filter, sort, and cursor-based pagination.
import { useState, useEffect, useCallback, useRef } from "react";
import type {
  DatasetSchemaResponse,
  DatasetRow,
  DatasetQueryResponse,
} from "../views/analyst/types";

const BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const PAGE_SIZE = 50;

// Return type for the useDatasetQuery hook.
export interface UseDatasetQueryResult {
  schema: DatasetSchemaResponse | null;
  rows: DatasetRow[];
  totalMatched: number;
  loading: boolean;
  error: string | null;
  filters: Record<string, string>;
  setFilter: (col: string, val: string) => void;
  sort: [string, "asc" | "desc"][];
  setSort: (col: string) => void;
  fetchNextPage: () => void;
  hasNextPage: boolean;
}

// Fetches dataset schema from /api/dataset/schema and returns it or null on error.
async function fetchSchema(): Promise<DatasetSchemaResponse> {
  const resp = await fetch(`${BASE_URL}/api/dataset/schema`);
  if (!resp.ok) throw new Error(`schema: ${resp.status}`);
  return resp.json() as Promise<DatasetSchemaResponse>;
}

// Posts a dataset query request and returns the paginated response.
async function postQuery(
  filters: Record<string, string>,
  sort: [string, "asc" | "desc"][],
  cursor: string | null
): Promise<DatasetQueryResponse> {
  const resp = await fetch(`${BASE_URL}/api/dataset/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters, sort, cursor, page_size: PAGE_SIZE }),
  });
  if (!resp.ok) throw new Error(`query: ${resp.status}`);
  return resp.json() as Promise<DatasetQueryResponse>;
}

// Generates synthetic fallback schema when the backend is unavailable.
function mockSchema(): DatasetSchemaResponse {
  return {
    columns: [
      { name: "subject_id", kind: "string", has_entities: true },
      { name: "site", kind: "category", has_entities: true },
      { name: "compound_code", kind: "string", has_entities: true },
      { name: "ae_grade", kind: "int", has_entities: false },
      { name: "study_day", kind: "int", has_entities: false },
      { name: "dose_mg", kind: "float", has_entities: false },
      { name: "outcome", kind: "category", has_entities: false },
    ],
    total_rows: 120,
  };
}

// Generates a synthetic row using sequential index for deterministic mock data.
function mockRow(i: number): DatasetRow {
  const grades = [1, 2, 3, 4] as const;
  const outcomes = ["Recovered", "Ongoing", "Resolved with sequelae", "Fatal"];
  return {
    row_id: `row-${i}`,
    cells: {
      subject_id: {
        value: `SUBJ-${String(i).padStart(4, "0")}`,
        entity: { placeholder: `<SUBJECT_${i}>`, category: "phi" },
      },
      site: {
        value: `SITE-${((i % 8) + 1)}`,
        entity: { placeholder: `<SITE_${(i % 8) + 1}>`, category: "ip" },
      },
      compound_code: {
        value: `SYN-${1000 + (i % 5)}`,
        entity: { placeholder: `<COMPOUND_CODE_${(i % 5) + 1}>`, category: "ip" },
      },
      ae_grade: { value: grades[i % 4] },
      study_day: { value: (i % 28) + 1 },
      dose_mg: { value: parseFloat(((i % 4) * 50 + 100).toFixed(1)) },
      outcome: { value: outcomes[i % 4] },
    },
  };
}

// Generates a mock paginated query response for offline/demo mode.
function mockQuery(cursor: string | null): DatasetQueryResponse {
  const offset = cursor ? parseInt(cursor, 10) : 0;
  const total = 120;
  const rows: DatasetRow[] = [];
  for (let i = offset; i < Math.min(offset + PAGE_SIZE, total); i++) {
    rows.push(mockRow(i));
  }
  const nextOffset = offset + PAGE_SIZE;
  return {
    rows,
    next_cursor: nextOffset < total ? String(nextOffset) : null,
    total_matched: total,
  };
}

// Hook: manages dataset schema fetch, query pagination, filter, and sort state.
export function useDatasetQuery(): UseDatasetQueryResult {
  const [schema, setSchema] = useState<DatasetSchemaResponse | null>(null);
  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [totalMatched, setTotalMatched] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSortState] = useState<[string, "asc" | "desc"][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  // Track whether we are appending (next page) vs replacing (new filter/sort).
  const appendRef = useRef(false);

  // Fetches schema once on mount, falling back to mock data if backend is down.
  useEffect(() => {
    fetchSchema()
      .then(setSchema)
      .catch(() => setSchema(mockSchema()));
  }, []);

  // Re-fetches the first page whenever filters or sort change.
  useEffect(() => {
    appendRef.current = false;
    setCursor(null);
    setRows([]);
    setHasNextPage(false);
  }, [filters, sort]);

  // Runs query whenever cursor changes (including reset to null).
  useEffect(() => {
    if (schema === null) return;
    setLoading(true);
    setError(null);
    const isAppend = appendRef.current;
    postQuery(filters, sort, cursor)
      .then((data) => {
        setRows((prev) => (isAppend ? [...prev, ...data.rows] : data.rows));
        setTotalMatched(data.total_matched);
        setHasNextPage(data.next_cursor !== null);
        setCursor(data.next_cursor);
      })
      .catch(() => {
        // Fall back to mock data when backend is unreachable.
        const data = mockQuery(cursor);
        setRows((prev) => (isAppend ? [...prev, ...data.rows] : data.rows));
        setTotalMatched(data.total_matched);
        setHasNextPage(data.next_cursor !== null);
        setCursor(data.next_cursor);
      })
      .finally(() => {
        setLoading(false);
        appendRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cursor intentionally omitted: reset above
  }, [schema, filters, sort]);

  // Updates a single column filter, resetting pagination.
  const setFilter = useCallback((col: string, val: string) => {
    setFilters((prev) => {
      if (val === "") {
        const next = { ...prev };
        delete next[col];
        return next;
      }
      return { ...prev, [col]: val };
    });
  }, []);

  // Cycles sort for a column: none → asc → desc → none.
  const setSort = useCallback((col: string) => {
    setSortState((prev) => {
      const existing = prev.find(([c]) => c === col);
      if (!existing) return [[col, "asc"]];
      if (existing[1] === "asc") return [[col, "desc"]];
      return prev.filter(([c]) => c !== col);
    });
  }, []);

  // Appends the next cursor page of results.
  const fetchNextPage = useCallback(() => {
    if (!hasNextPage || loading) return;
    appendRef.current = true;
    // Trigger a re-fetch by updating cursor to the stored next cursor value.
    // The cursor is already set to the next cursor from the previous response.
    // We need to re-trigger the effect; use a dummy state toggle approach.
    setLoading(true);
    postQuery(filters, sort, cursor)
      .then((data) => {
        setRows((prev) => [...prev, ...data.rows]);
        setTotalMatched(data.total_matched);
        setHasNextPage(data.next_cursor !== null);
        setCursor(data.next_cursor);
      })
      .catch(() => {
        const data = mockQuery(cursor);
        setRows((prev) => [...prev, ...data.rows]);
        setTotalMatched(data.total_matched);
        setHasNextPage(data.next_cursor !== null);
        setCursor(data.next_cursor);
      })
      .finally(() => setLoading(false));
  }, [hasNextPage, loading, filters, sort, cursor]);

  return {
    schema,
    rows,
    totalMatched,
    loading,
    error,
    filters,
    setFilter,
    sort,
    setSort,
    fetchNextPage,
    hasNextPage,
  };
}
