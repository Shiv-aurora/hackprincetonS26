// Placeholder for the Dataset view — will be replaced by a virtualized data table in Phase 6.
import type React from "react";
import type { ViewProps } from "../ViewRegistry";

// Renders a descriptive placeholder indicating the dataset-preview view location.
export const DatasetPreviewPlaceholder: React.FC<ViewProps> = ({ paneSlot }) => (
  <div
    style={{
      background: "var(--color-surface-container-low)",
      color: "var(--color-primary-fixed)",
      padding: "1.5rem",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem",
    }}
  >
    <h3 style={{ fontSize: "13px", fontWeight: 600, color: "#d4d9df", margin: 0 }}>
      Dataset <span style={{ opacity: 0.4, fontWeight: 400 }}>· {paneSlot}</span>
    </h3>
    <p style={{ fontSize: "12px", color: "#6b7480", margin: 0, lineHeight: 1.6 }}>
      Virtualized table of synthetic clinical trial rows with entity-level privacy highlighting.
      Calls <code style={{ fontFamily: "monospace", color: "#4fc1ff" }}>/api/dataset/query</code>.
      Implemented in Phase 6 by the analyst-views agent.
    </p>
  </div>
);
