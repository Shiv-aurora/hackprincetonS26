// BottomDock: collapsible forensic log strip at the bottom of the application shell.
import React, { useRef, useCallback } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

interface BottomDockProps {
  expanded: boolean;
  heightPct: number;
  onToggle: () => void;
  onResize: (pct: number) => void;
}

// Format a Date as HH:MM:SS for the collapsed status line.
function formatTime(d: Date): string {
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

// Drag handle rendered at the top edge of the expanded dock for vertical resizing.
const DragHandle: React.FC<{
  onDragStart: (e: React.PointerEvent) => void;
}> = ({ onDragStart }) => (
  <div
    onPointerDown={onDragStart}
    style={{
      height: 4,
      cursor: "ns-resize",
      flexShrink: 0,
      background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)",
      transition: "background 200ms",
    }}
    onMouseEnter={(e) =>
      ((e.currentTarget as HTMLDivElement).style.background =
        "rgba(0,120,212,0.35)")
    }
    onMouseLeave={(e) =>
      ((e.currentTarget as HTMLDivElement).style.background =
        "linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)")
    }
    aria-hidden="true"
  />
);

// Expanded forensic log with three columns: Proxy Sent, Cloud Response, Rehydrated.
const ExpandedDock: React.FC<{ heightPct: number; onResize: (pct: number) => void }> = ({
  heightPct,
  onResize,
}) => {
  const dragging = useRef(false);
  const startY = useRef(0);
  const startPct = useRef(heightPct);

  // Begin vertical resize drag.
  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = true;
      startY.current = e.clientY;
      startPct.current = heightPct;
    },
    [heightPct]
  );

  // Compute new height percentage from drag position.
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const deltaY = startY.current - e.clientY;
    const deltaPct = (deltaY / window.innerHeight) * 100;
    onResize(Math.max(8, Math.min(60, startPct.current + deltaPct)));
  }, [onResize]);

  // End drag.
  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const columns = ["Proxy Sent", "Cloud Response", "Rehydrated"];

  return (
    <div
      style={{ height: `${heightPct}vh`, display: "flex", flexDirection: "column" }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <DragHandle onDragStart={handleDragStart} />
      {/* Column headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          padding: "0 12px",
          height: 28,
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        {columns.map((col) => (
          <span
            key={col}
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#4b535b",
            }}
          >
            {col}
          </span>
        ))}
      </div>
      {/* Empty rows area — forensic-and-mcp agent fills this in Phase 6. */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 12px" }}>
        <p
          style={{
            fontSize: 11,
            color: "#2f363d",
            margin: 0,
            fontStyle: "italic",
          }}
        >
          Forensic log entries appear here after each /api/complete call.
          Canary-leak events are highlighted in{" "}
          <span style={{ color: "var(--color-error)" }}>danger red</span>.
        </p>
      </div>
    </div>
  );
};

// Renders either the collapsed single-line status or the expanded three-column forensic view.
export const BottomDock: React.FC<BottomDockProps> = ({
  expanded,
  heightPct,
  onToggle,
  onResize,
}) => {
  const nowStr = formatTime(new Date());

  return (
    <div
      style={{
        background: "rgba(10,13,16,0.97)",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        userSelect: expanded ? "none" : "auto",
      }}
    >
      {expanded && <ExpandedDock heightPct={heightPct} onResize={onResize} />}

      {/* Collapsed status line — always visible */}
      <div
        style={{
          height: 24,
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          gap: 8,
          cursor: "pointer",
          flexShrink: 0,
        }}
        onClick={onToggle}
        title={expanded ? "Collapse forensic log" : "Expand forensic log"}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onToggle();
        }}
        aria-label={expanded ? "Collapse forensic log" : "Expand forensic log"}
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown size={11} style={{ color: "#4b535b", flexShrink: 0 }} />
        ) : (
          <ChevronUp size={11} style={{ color: "#4b535b", flexShrink: 0 }} />
        )}
        <span
          style={{
            fontSize: 10,
            color: "#3a434b",
            fontFamily: "monospace",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {nowStr} · NGSP ready · ε 0.00
        </span>
      </div>
    </div>
  );
};
