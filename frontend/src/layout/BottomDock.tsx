// BottomDock: collapsible forensic log strip at the bottom of the application shell.
import React, { useRef, useCallback } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { BottomDockForensic } from "./BottomDockForensic";
import { useForensicStream } from "../hooks/useForensicStream";
import type { AuditEntry } from "../hooks/useForensicStream";

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

// Format an ISO timestamp string to HH:MM:SS local time for the status line.
function formatIso(iso: string): string {
  return formatTime(new Date(iso));
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
// Wraps BottomDockForensic (which renders real rows) plus the drag-resize handle.
const ExpandedDock: React.FC<{
  heightPct: number;
  onResize: (pct: number) => void;
  entries: AuditEntry[];
  epsilonSpent: number;
  epsilonCap: number;
}> = ({ heightPct, onResize, entries, epsilonSpent, epsilonCap }) => {
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
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const deltaY = startY.current - e.clientY;
      const deltaPct = (deltaY / window.innerHeight) * 100;
      onResize(Math.max(8, Math.min(60, startPct.current + deltaPct)));
    },
    [onResize]
  );

  // End drag.
  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      style={{ height: `${heightPct}vh`, display: "flex", flexDirection: "column" }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <DragHandle onDragStart={handleDragStart} />
      <BottomDockForensic
        entries={entries}
        epsilonSpent={epsilonSpent}
        epsilonCap={epsilonCap}
      />
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
  // Live forensic stream — drives both the collapsed status line and the expanded view.
  const { entries, epsilonSpent, epsilonCap } = useForensicStream();

  // Build the collapsed status line text from the most recent entry.
  const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;
  const statusText = lastEntry
    ? `${formatIso(lastEntry.timestamp)} · ${lastEntry.status} · ${lastEntry.model} · ε ${epsilonSpent.toFixed(2)}`
    : `${formatTime(new Date())} · No cloud calls yet · ε ${epsilonSpent.toFixed(2)}`;

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
      {expanded && (
        <ExpandedDock
          heightPct={heightPct}
          onResize={onResize}
          entries={entries}
          epsilonSpent={epsilonSpent}
          epsilonCap={epsilonCap}
        />
      )}

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
          {statusText}
        </span>
      </div>
    </div>
  );
};
