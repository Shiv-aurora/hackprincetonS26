// Three-lane forensic log table rendered inside the expanded BottomDock.
// Raw prompt/response content is never available here — only hashes.
import React, { useEffect, useRef, useState } from "react";
import type { AuditEntry } from "../hooks/useForensicStream";

/** Props consumed by the expanded forensic body. */
export interface BottomDockForensicProps {
  entries: AuditEntry[];
  epsilonSpent: number;
  epsilonCap: number;
}

// Determine progress-bar color based on ε utilisation fraction.
function epsilonBarColor(fraction: number): string {
  if (fraction > 0.8) return "var(--color-error)";
  if (fraction > 0.5) return "#dcdcaa"; // warning yellow (--color-mnpi)
  return "#6a9955"; // green (--color-tertiary)
}

/** Truncate a hash string to the first 12 characters for display. */
function shortHash(hash: string | null): string {
  if (!hash) return "—";
  return `sha256:${hash.slice(0, 12)}…`;
}

/** Format an ISO timestamp string to HH:MM:SS local time. */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "??:??:??";
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

// Individual row — mounted with opacity-0 then transitioned to opacity-1 for entry animation.
const ForensicRow: React.FC<{ entry: AuditEntry; isNew: boolean }> = ({
  entry,
  isNew,
}) => {
  const [visible, setVisible] = useState(!isNew);

  useEffect(() => {
    if (!isNew) return;
    // Trigger opacity transition after a microtask so the initial render is at 0.
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [isNew]);

  const isCanary = entry.status === "canary_leak";
  const isMock = entry.status === "mock_ok";

  const rowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    padding: "5px 12px",
    gap: 8,
    borderBottom: "1px solid rgba(255,255,255,0.03)",
    fontSize: 10,
    fontFamily: "monospace",
    opacity: visible ? 1 : 0,
    transition: "opacity 400ms ease",
    background: isCanary
      ? `rgba(244, 135, 113, 0.15)` // --color-error at 15% opacity
      : "transparent",
  };

  const cellStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    color: "#8a9199",
    minWidth: 0,
    overflow: "hidden",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#4b535b",
  };

  return (
    <div style={rowStyle} data-testid="forensic-row" data-status={entry.status}>
      {/* Column 1: Proxy Sent — proxy hash + prompt length */}
      <div style={cellStyle}>
        <span style={labelStyle}>{formatTime(entry.timestamp)}</span>
        <span style={{ color: "#6a9955", fontWeight: 500 }}>
          {shortHash(entry.prompt_hash)}
        </span>
        <span>{entry.prompt_length} chars</span>
        {isCanary && (
          <span
            style={{
              color: "var(--color-error)",
              fontWeight: 700,
              fontSize: 9,
              letterSpacing: "0.12em",
            }}
          >
            CANARY LEAK
          </span>
        )}
        {isMock && (
          <span
            style={{
              background: "rgba(255,255,255,0.06)",
              color: "#8a9199",
              fontSize: 8,
              padding: "1px 4px",
              borderRadius: 2,
              alignSelf: "flex-start",
              letterSpacing: "0.1em",
            }}
          >
            MOCK
          </span>
        )}
      </div>

      {/* Column 2: Cloud Response — response hash + length */}
      <div style={cellStyle}>
        <span style={labelStyle}>{entry.model}</span>
        <span style={{ color: "#4fc1ff", fontWeight: 500 }}>
          {shortHash(entry.response_hash)}
        </span>
        <span>{entry.response_length} chars</span>
      </div>

      {/* Column 3: Rehydrated — length + status */}
      <div style={cellStyle}>
        <span style={labelStyle}>status</span>
        <span
          style={{
            color: isCanary
              ? "var(--color-error)"
              : entry.status === "ok" || entry.status === "mock_ok"
              ? "#6a9955"
              : "#dcdcaa",
            fontWeight: 600,
          }}
        >
          {entry.status}
        </span>
        {entry.error_type && (
          <span style={{ color: "var(--color-error)", fontSize: 9 }}>
            {entry.error_type}
          </span>
        )}
      </div>
    </div>
  );
};

/** Renders the ε utilisation progress bar with colour-coded fill. */
const EpsilonBar: React.FC<{ spent: number; cap: number }> = ({
  spent,
  cap,
}) => {
  const fraction = cap > 0 ? Math.min(spent / cap, 1) : 0;
  const pct = fraction * 100;
  const barColor = epsilonBarColor(fraction);

  return (
    <div
      style={{
        padding: "6px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span
        style={{
          fontSize: 10,
          color: "#8a9199",
          fontFamily: "monospace",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        ε {spent.toFixed(2)} / {cap.toFixed(2)}
      </span>
      {/* Track */}
      <div
        data-testid="epsilon-bar-track"
        style={{
          flex: 1,
          height: 4,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        {/* Fill */}
        <div
          data-testid="epsilon-bar-fill"
          data-fraction={fraction.toFixed(4)}
          style={{
            width: `${pct}%`,
            height: "100%",
            background: barColor,
            borderRadius: 999,
            transition: "width 400ms ease, background 400ms ease",
          }}
        />
      </div>
    </div>
  );
};

/** Full three-lane forensic log body displayed when the bottom dock is expanded. */
export const BottomDockForensic: React.FC<BottomDockForensicProps> = ({
  entries,
  epsilonSpent,
  epsilonCap,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(entries.length);

  // Scroll to bottom whenever a new entry arrives.
  useEffect(() => {
    if (entries.length !== prevLengthRef.current) {
      prevLengthRef.current = entries.length;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [entries]);

  const columns = ["Proxy Sent", "Cloud Response", "Rehydrated"];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        overflow: "hidden",
      }}
    >
      {/* ε progress bar */}
      <EpsilonBar spent={epsilonSpent} cap={epsilonCap} />

      {/* Column headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "0 12px",
          height: 24,
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        {columns.map((col) => (
          <span
            key={col}
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#4b535b",
            }}
          >
            {col}
          </span>
        ))}
      </div>

      {/* Scrollable rows */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
        {entries.length === 0 ? (
          <p
            style={{
              fontSize: 10,
              color: "#2f363d",
              margin: "12px",
              fontStyle: "italic",
            }}
          >
            No cloud calls yet. Send a request to see forensic entries.
          </p>
        ) : (
          entries.map((entry, idx) => (
            <ForensicRow
              key={entry.request_id}
              entry={entry}
              isNew={idx === entries.length - 1 && entries.length > prevLengthRef.current}
            />
          ))
        )}
      </div>
    </div>
  );
};
