// Virtualized dataset table with column filters, sort, and entity PHI highlighting.
import React, { useRef, useState, useMemo, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type ColumnDef,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDatasetQuery } from "../../hooks/useDatasetQuery";
import type { ViewProps } from "../../layout/ViewRegistry";
import type { DatasetRow, DatasetCell } from "./types";

// ---------------------------------------------------------------------------
// Skeleton row — displayed while the initial fetch is loading.
// ---------------------------------------------------------------------------

// Renders a shimmering placeholder row for the loading state.
const SkeletonRow: React.FC<{ cols: number }> = ({ cols }) => (
  <tr>
    {Array.from({ length: cols + 1 }).map((_, i) => (
      <td
        key={i}
        style={{
          padding: "6px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div
          style={{
            height: 10,
            borderRadius: 4,
            background: "rgba(255,255,255,0.07)",
            width: i === 0 ? 28 : `${60 + ((i * 37) % 40)}%`,
            animation: "skeleton-shimmer 1.5s infinite linear",
          }}
        />
      </td>
    ))}
  </tr>
);

// ---------------------------------------------------------------------------
// EntityCell — cell that may carry a PHI/IP entity annotation.
// ---------------------------------------------------------------------------

// Renders a table cell, underlining values that carry entity annotations.
const EntityCell: React.FC<{ cell: DatasetCell }> = ({ cell }) => {
  const display = cell.value === null ? "—" : String(cell.value);
  if (!cell.entity) return <span>{display}</span>;
  return (
    <span
      className="entity-cell"
      title={`${cell.entity.placeholder} (${cell.entity.category})`}
      style={{
        textDecoration: "underline",
        textDecorationColor: "var(--color-phi, #ce9178)",
        textDecorationThickness: "1px",
        textUnderlineOffset: "2px",
        cursor: "help",
      }}
    >
      {display}
    </span>
  );
};

// ---------------------------------------------------------------------------
// DatasetPreviewView
// ---------------------------------------------------------------------------

// Main analyst view: virtualized dataset table with filter, sort, and entity highlighting.
export const DatasetPreviewView: React.FC<ViewProps> = () => {
  const {
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
  } = useDatasetQuery();

  const [filterCol, setFilterCol] = useState<string>("");
  const [filterVal, setFilterVal] = useState<string>("");

  // Apply the pending filter from the filter bar.
  const applyFilter = useCallback(() => {
    if (filterCol) setFilter(filterCol, filterVal);
  }, [filterCol, filterVal, setFilter]);

  // Build TanStack Table column definitions from the schema (memoized per schema).
  const columns = useMemo<ColumnDef<DatasetRow, DatasetCell>[]>(() => {
    if (!schema) return [];
    const helper = createColumnHelper<DatasetRow>();
    return schema.columns.map((col) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- function accessor has type variance with the helper's inferred row key type
      (helper.accessor as any)(
        (row: DatasetRow) => row.cells[col.name] ?? { value: null },
        {
          id: col.name,
          header: col.name,
          cell: (info: { getValue: () => DatasetCell }) => <EntityCell cell={info.getValue()} />,
        }
      )
    );
  }, [schema]);

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualFiltering: true,
  });

  // Virtualizer for the scrollable tbody.
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 10,
  });

  const headerGroups = table.getHeaderGroups();
  const allRows = table.getRowModel().rows;
  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  // Derive sort indicator for a given column id.
  const sortIndicator = (colId: string): string => {
    const entry = sort.find(([c]) => c === colId);
    if (!entry) return "";
    return entry[1] === "asc" ? " ▲" : " ▼";
  };

  if (error) {
    return (
      <div
        style={{
          padding: "1rem",
          color: "var(--color-error, #f48771)",
          fontSize: 12,
          fontFamily: "JetBrains Mono, monospace",
        }}
      >
        Error: {error}
      </div>
    );
  }

  const colCount = schema?.columns.length ?? 4;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 12,
      }}
    >
      {/* Skeleton shimmer keyframes */}
      <style>{`
        @keyframes skeleton-shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.9; }
          100% { opacity: 0.4; }
        }
      `}</style>

      {/* ── Filter bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.02)",
          flexShrink: 0,
        }}
      >
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Filter:</span>
        <select
          value={filterCol}
          onChange={(e) => setFilterCol(e.target.value)}
          style={{
            background: "var(--color-surface-container-low, #14191e)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 4,
            color: "#d4d9df",
            padding: "2px 6px",
            fontSize: 11,
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          <option value="">— col —</option>
          {schema?.columns.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          value={filterVal}
          onChange={(e) => setFilterVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilter()}
          placeholder="value"
          style={{
            background: "var(--color-surface-container-low, #14191e)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 4,
            color: "#d4d9df",
            padding: "2px 8px",
            fontSize: 11,
            fontFamily: "JetBrains Mono, monospace",
            width: 120,
          }}
        />
        <button
          onClick={applyFilter}
          style={{
            background: "var(--color-primary-container, #0078d4)",
            border: "none",
            borderRadius: 4,
            color: "#fff",
            padding: "2px 10px",
            fontSize: 11,
            fontFamily: "JetBrains Mono, monospace",
            cursor: "pointer",
          }}
        >
          Apply
        </button>
        {Object.keys(filters).length > 0 && (
          <button
            onClick={() => { setFilterCol(""); setFilterVal(""); setFilter(filterCol, ""); }}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 4,
              color: "rgba(255,255,255,0.4)",
              padding: "2px 8px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}
        <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
          Total: {totalMatched.toLocaleString()} rows
        </span>
      </div>

      {/* ── Virtualized table ── */}
      <div ref={parentRef} style={{ flex: 1, overflow: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
          }}
        >
          {/* Sticky header */}
          <thead
            style={{
              position: "sticky",
              top: 0,
              zIndex: 10,
              background: "var(--color-surface-container-high, #181e24)",
            }}
          >
            {headerGroups.map((hg) => (
              <tr key={hg.id}>
                <th
                  style={{
                    width: 36,
                    padding: "6px 6px 6px 10px",
                    textAlign: "right",
                    color: "rgba(255,255,255,0.3)",
                    fontSize: 10,
                    fontWeight: 500,
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  #
                </th>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={() => setSort(header.id)}
                    style={{
                      padding: "6px 10px",
                      textAlign: "left",
                      fontSize: 10,
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.55)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                      cursor: "pointer",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {sortIndicator(header.id)}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {loading && rows.length === 0 ? (
              // Loading skeleton: 5 shimmering rows.
              Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} cols={colCount} />
              ))
            ) : (
              <>
                {/* Top spacer for virtualizer */}
                {virtualRows.length > 0 && (
                  <tr style={{ height: virtualRows[0].start }}>
                    <td colSpan={colCount + 1} />
                  </tr>
                )}
                {virtualRows.map((vRow) => {
                  const row = allRows[vRow.index];
                  if (!row) return null;
                  const isOdd = vRow.index % 2 !== 0;
                  return (
                    <tr
                      key={row.id}
                      data-index={vRow.index}
                      ref={rowVirtualizer.measureElement}
                      style={{
                        background: isOdd
                          ? "var(--color-surface-container-low, #14191e)"
                          : "var(--color-surface-container-lowest, #101419)",
                        height: 32,
                      }}
                    >
                      <td
                        style={{
                          padding: "4px 6px 4px 10px",
                          textAlign: "right",
                          color: "rgba(255,255,255,0.2)",
                          fontSize: 10,
                          borderBottom: "1px solid rgba(255,255,255,0.03)",
                        }}
                      >
                        {vRow.index + 1}
                      </td>
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          style={{
                            padding: "4px 10px",
                            color: "#d4d9df",
                            fontSize: 11,
                            borderBottom: "1px solid rgba(255,255,255,0.03)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: 180,
                          }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {/* Bottom spacer for virtualizer */}
                {virtualRows.length > 0 && (
                  <tr
                    style={{
                      height: totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0),
                    }}
                  >
                    <td colSpan={colCount + 1} />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Load more ── */}
      {hasNextPage && !loading && (
        <div
          style={{
            padding: "8px 10px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <button
            onClick={fetchNextPage}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 4,
              color: "rgba(255,255,255,0.55)",
              padding: "4px 16px",
              fontSize: 11,
              fontFamily: "JetBrains Mono, monospace",
              cursor: "pointer",
            }}
          >
            Load more
          </button>
        </div>
      )}
      {loading && rows.length > 0 && (
        <div
          style={{
            padding: "6px 10px",
            textAlign: "center",
            fontSize: 11,
            color: "rgba(255,255,255,0.3)",
            flexShrink: 0,
          }}
        >
          Loading…
        </div>
      )}
    </div>
  );
};
