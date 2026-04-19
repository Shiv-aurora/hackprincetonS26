// Tests for DatasetPreviewView: column headers, entity highlighting, and Load more button.
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { DatasetPreviewView } from "./DatasetPreviewView";
import {
  SCHEMA_FIXTURE,
  QUERY_FIXTURE,
  QUERY_LAST_PAGE_FIXTURE,
} from "./__fixtures__/dashboardFixture";

// Mock useDatasetQuery so tests bypass async fetch entirely.
vi.mock("../../hooks/useDatasetQuery", () => ({
  useDatasetQuery: vi.fn(),
}));

// Mock useVirtualizer so all rows render — jsdom containers have 0 height.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, i) => ({
        index: i,
        start: i * opts.estimateSize(),
        size: opts.estimateSize(),
        key: String(i),
        lane: 0,
      })),
    getTotalSize: () => opts.count * opts.estimateSize(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsdom measure stub
    measureElement: (_el: any) => {},
  }),
}));

// Stub ResizeObserver — not available in jsdom.
beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

// Returns a base mock result; tests override per-case as needed.
function baseResult(overrides: Partial<ReturnType<typeof import("../../hooks/useDatasetQuery")["useDatasetQuery"]>> = {}) {
  return {
    schema: SCHEMA_FIXTURE,
    rows: QUERY_FIXTURE.rows,
    totalMatched: QUERY_FIXTURE.total_matched,
    loading: false,
    error: null,
    filters: {},
    setFilter: vi.fn(),
    sort: [] as [string, "asc" | "desc"][],
    setSort: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: true,
    ...overrides,
  };
}

describe("DatasetPreviewView", () => {
  // Verifies column names appear in the filter dropdown (schema-derived).
  it("renders column headers from schema", async () => {
    const { useDatasetQuery } = await import("../../hooks/useDatasetQuery");
    vi.mocked(useDatasetQuery).mockReturnValue(baseResult());
    render(<DatasetPreviewView paneSlot="left" persona="analyst" />);
    // Column names appear in the filter <select> options — always rendered once schema loads.
    await waitFor(() => {
      const options = screen.getAllByRole("option");
      const texts = options.map((o) => o.textContent ?? "");
      expect(texts).toContain("subject_id");
      expect(texts).toContain("site");
      expect(texts).toContain("ae_grade");
    });
  });

  // Verifies that entity-annotated cells carry the entity-cell class for styling.
  it("renders entity-annotated cells with underline styling", async () => {
    const { useDatasetQuery } = await import("../../hooks/useDatasetQuery");
    vi.mocked(useDatasetQuery).mockReturnValue(baseResult());
    render(<DatasetPreviewView paneSlot="left" persona="analyst" />);
    await waitFor(() => {
      const entityCells = document.querySelectorAll(".entity-cell");
      expect(entityCells.length).toBeGreaterThan(0);
    });
  });

  // Verifies a "Load more" button is present when hasNextPage is true.
  it("shows Load more button when next_cursor is non-null", async () => {
    const { useDatasetQuery } = await import("../../hooks/useDatasetQuery");
    vi.mocked(useDatasetQuery).mockReturnValue(baseResult({ hasNextPage: true }));
    render(<DatasetPreviewView paneSlot="left" persona="analyst" />);
    await waitFor(() => {
      expect(screen.getByText("Load more")).toBeInTheDocument();
    });
  });

  // Verifies no "Load more" button when on the last page.
  it("hides Load more button when on last page", async () => {
    const { useDatasetQuery } = await import("../../hooks/useDatasetQuery");
    vi.mocked(useDatasetQuery).mockReturnValue(
      baseResult({ rows: QUERY_LAST_PAGE_FIXTURE.rows, hasNextPage: false })
    );
    render(<DatasetPreviewView paneSlot="left" persona="analyst" />);
    await waitFor(() => {
      expect(screen.queryByText("Load more")).not.toBeInTheDocument();
    });
  });

  // Verifies total row count is displayed in the filter bar.
  it("displays total matched row count", async () => {
    const { useDatasetQuery } = await import("../../hooks/useDatasetQuery");
    vi.mocked(useDatasetQuery).mockReturnValue(baseResult());
    render(<DatasetPreviewView paneSlot="left" persona="analyst" />);
    await waitFor(() => {
      expect(screen.getByText(/Total: 3 rows/i)).toBeInTheDocument();
    });
  });
});
