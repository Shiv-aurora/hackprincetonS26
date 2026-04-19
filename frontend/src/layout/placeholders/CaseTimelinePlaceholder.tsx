// Placeholder for the Case Timeline view — will be replaced by multi-track D3 timeline in Phase 6.
import type React from "react";
import type { ViewProps } from "../ViewRegistry";

// Renders a descriptive placeholder indicating the case-timeline view location.
export const CaseTimelinePlaceholder: React.FC<ViewProps> = ({ paneSlot }) => (
  <div
    style={{
      background: "var(--color-surface-container-low)",
      padding: "1.5rem",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem",
    }}
  >
    <h3 style={{ fontSize: "13px", fontWeight: 600, color: "#d4d9df", margin: 0 }}>
      Case Timeline <span style={{ opacity: 0.4, fontWeight: 400 }}>· {paneSlot}</span>
    </h3>
    <p style={{ fontSize: "12px", color: "#6b7480", margin: 0, lineHeight: 1.6 }}>
      Multi-track D3 visualization: events, dosing, conmeds, labs with causality annotation.
      Calls <code style={{ fontFamily: "monospace", color: "#4fc1ff" }}>/api/timeline/assemble</code>.
      Implemented in Phase 6 by the reviewer-views agent.
    </p>
  </div>
);
