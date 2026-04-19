// Placeholder for the Dashboard view — will be replaced by chart-grid implementation in Phase 6.
import type React from "react";
import type { ViewProps } from "../ViewRegistry";

// Renders a descriptive placeholder indicating the dashboard view location.
export const DashboardPlaceholder: React.FC<ViewProps> = ({ paneSlot }) => (
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
      Dashboard <span style={{ opacity: 0.4, fontWeight: 400 }}>· {paneSlot}</span>
    </h3>
    <p style={{ fontSize: "12px", color: "#6b7480", margin: 0, lineHeight: 1.6 }}>
      Natural-language-prompted chart grid over the synthetic clinical trial dataset.
      Calls <code style={{ fontFamily: "monospace", color: "#4fc1ff" }}>/api/dashboard/generate</code>.
      Implemented in Phase 6 by the analyst-views agent.
    </p>
  </div>
);
