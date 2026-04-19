// NarrativeInputView: textarea for pasting an SAE narrative plus Assemble button that calls /api/timeline/assemble.
import React from "react";
import type { ViewProps } from "../../layout/ViewRegistry";
import { useReviewerContext } from "./ReviewerContext";
import type { TimelineResponse } from "./types";

const BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// Calls /api/timeline/assemble with the narrative document and returns the parsed TimelineResponse.
async function assembleTimeline(document: string): Promise<TimelineResponse> {
  const resp = await fetch(`${BASE_URL}/api/timeline/assemble`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document }),
  });
  if (!resp.ok) throw new Error(`timeline/assemble: ${resp.status} ${resp.statusText}`);
  return resp.json() as Promise<TimelineResponse>;
}

// Renders the narrative text input pane for the reviewer persona with an Assemble Timeline action.
const NarrativeInputView: React.FC<ViewProps> = () => {
  const {
    narrativeText,
    setNarrativeText,
    setTimelineData,
    assembling,
    setAssembling,
    assembleError,
    setAssembleError,
  } = useReviewerContext();

  // Handles the Assemble button click: validates input, calls API, updates shared context.
  async function handleAssemble(): Promise<void> {
    const trimmed = narrativeText.trim();
    if (!trimmed) {
      setAssembleError("Please paste a narrative before assembling.");
      return;
    }
    setAssembling(true);
    setAssembleError(null);
    setTimelineData(null);
    try {
      const result = await assembleTimeline(trimmed);
      setTimelineData(result);
    } catch (err: unknown) {
      setAssembleError(err instanceof Error ? err.message : "Failed to assemble timeline.");
    } finally {
      setAssembling(false);
    }
  }

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "var(--color-surface-container-low)",
    overflow: "hidden",
  };

  const headerStyle: React.CSSProperties = {
    padding: "0.75rem 1rem 0.5rem",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    flexShrink: 0,
  };

  const textareaStyle: React.CSSProperties = {
    flex: 1,
    resize: "none",
    background: "rgba(255,255,255,0.025)",
    border: "none",
    outline: "none",
    color: "#d4d9df",
    fontSize: "13px",
    lineHeight: 1.75,
    fontFamily: "var(--font-sans, sans-serif)",
    padding: "0.75rem 1rem",
    margin: "0.5rem",
    borderRadius: "4px",
    minHeight: 0,
  };

  const footerStyle: React.CSSProperties = {
    padding: "0.5rem 1rem 0.75rem",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  };

  const buttonStyle: React.CSSProperties = {
    width: "100%",
    padding: "7px 16px",
    fontSize: "12px",
    fontWeight: 600,
    fontFamily: "var(--font-mono, monospace)",
    background: assembling ? "rgba(0,120,212,0.25)" : "rgba(0,120,212,0.6)",
    border: "1px solid rgba(0,120,212,0.5)",
    borderRadius: "4px",
    color: assembling ? "#6b7480" : "#d4d9df",
    cursor: assembling ? "not-allowed" : "pointer",
    letterSpacing: "0.04em",
    transition: "background 0.15s ease, color 0.15s ease",
  };

  const errorStyle: React.CSSProperties = {
    fontSize: "11px",
    color: "var(--color-error)",
    fontFamily: "var(--font-mono, monospace)",
    lineHeight: 1.5,
  };

  const charCountStyle: React.CSSProperties = {
    fontSize: "10px",
    color: "#4a5260",
    fontFamily: "var(--font-mono, monospace)",
    textAlign: "right",
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={{ fontSize: "12px", fontWeight: 600, color: "#d4d9df" }}>Narrative</span>
        <p style={{ fontSize: "11px", color: "#4a5260", margin: "4px 0 0", lineHeight: 1.5 }}>
          Paste an SAE narrative and click Assemble to generate the case timeline.
        </p>
      </div>

      <textarea
        style={textareaStyle}
        value={narrativeText}
        onChange={(e) => setNarrativeText(e.target.value)}
        placeholder="Paste a Serious Adverse Event narrative here…"
        disabled={assembling}
        aria-label="SAE narrative input"
        data-testid="narrative-textarea"
        spellCheck={false}
      />

      <div style={footerStyle}>
        <div style={charCountStyle}>{narrativeText.length} chars</div>

        <button
          style={buttonStyle}
          onClick={() => void handleAssemble()}
          disabled={assembling}
          aria-label="Assemble timeline from narrative"
          data-testid="assemble-button"
        >
          {assembling ? "Assembling…" : "Assemble Timeline"}
        </button>

        {assembleError && (
          <p style={errorStyle} role="alert" data-testid="assemble-error">
            {assembleError}
          </p>
        )}
      </div>
    </div>
  );
};

export default NarrativeInputView;
