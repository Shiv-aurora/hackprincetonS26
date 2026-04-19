// Natural-language-prompted chart dashboard view for the Analyst persona.
import React, { useState, useRef } from "react";
import { useDashboardSpec } from "../../hooks/useDashboardSpec";
import { ChartGrid } from "./ChartGrid";
import { ExportActions } from "../../components/ExportActions";
import type { ViewProps } from "../../layout/ViewRegistry";

// DashboardView: prompt input → chart grid rendered from /api/dashboard/generate spec.
export const DashboardView: React.FC<ViewProps> = () => {
  const { spec, loading, error, generate } = useDashboardSpec();
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Submits the current prompt value to the generate function.
  const handleGenerate = () => {
    const trimmed = inputValue.trim();
    if (trimmed) generate(trimmed);
  };

  // Allows submitting prompt via Enter key.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleGenerate();
  };

  const isPhiError = error === "phi_in_prompt";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        fontFamily: "var(--font-sans, Inter, sans-serif)",
      }}
    >
      {/* ── Prompt bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "14px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.02)",
          flexShrink: 0,
        }}
      >
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the chart you want (e.g. 'AE grade distribution by site')"
          style={{
            flex: 1,
            background: "var(--color-surface-container-low, #14191e)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 6,
            color: "#d4d9df",
            padding: "10px 14px",
            fontSize: 15,
            fontFamily: "inherit",
            outline: "none",
          }}
          aria-label="Dashboard prompt"
        />
        <button
          onClick={handleGenerate}
          disabled={loading || !inputValue.trim()}
          style={{
            background: loading
              ? "rgba(0,120,212,0.4)"
              : "var(--color-primary-container, #0078d4)",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            padding: "10px 20px",
            fontSize: 15,
            fontFamily: "inherit",
            cursor: loading || !inputValue.trim() ? "not-allowed" : "pointer",
            opacity: loading || !inputValue.trim() ? 0.6 : 1,
            transition: "opacity 200ms, background 200ms",
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "Generating…" : "Generate"}
        </button>
      </div>

      {/* ── Error ── */}
      {isPhiError && (
        <div
          style={{
            padding: "8px 12px",
            fontSize: 12,
            color: "var(--color-error, #f48771)",
            background: "rgba(244,135,113,0.07)",
            borderBottom: "1px solid rgba(244,135,113,0.15)",
            flexShrink: 0,
          }}
          role="alert"
        >
          Prompt contains sensitive identifiers. Please rephrase.
        </div>
      )}

      {/* ── Main scrollable content area ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>
        {/* Loading state */}
        {loading && (
          <div
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.4)",
              fontFamily: "JetBrains Mono, monospace",
              padding: "8px 0",
            }}
          >
            Generating dashboard…
          </div>
        )}

        {/* Non-PHI error */}
        {error && !isPhiError && (
          <div
            style={{
              fontSize: 14,
              color: "var(--color-error, #f48771)",
              fontFamily: "JetBrains Mono, monospace",
              padding: "8px 0",
            }}
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Dashboard spec rendered */}
        {spec && !loading && (
          <>
            {/* Dashboard title */}
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "#d4d9df",
                marginBottom: 14,
                letterSpacing: "0.02em",
              }}
            >
              {spec.title}
            </div>

            {/* Chart grid */}
            <ChartGrid spec={spec} />

            {/* Narrative summary */}
            {spec.narrative_summary && (
              <div
                style={{
                  marginTop: 18,
                  padding: "12px 14px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 6,
                  fontSize: 15,
                  color: "rgba(255,255,255,0.6)",
                  lineHeight: 1.7,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "rgba(255,255,255,0.3)",
                    marginBottom: 6,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                >
                  Narrative summary
                </div>
                {spec.narrative_summary}
              </div>
            )}

            {/* MCP export actions */}
            <ExportActions context="dashboard" auditRef={spec.audit_id} />
          </>
        )}

        {/* Empty state */}
        {!spec && !loading && !error && (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              paddingTop: 60,
            }}
          >
            <div
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.25)",
                fontFamily: "JetBrains Mono, monospace",
                textAlign: "center",
                lineHeight: 1.7,
              }}
            >
              Enter a prompt above to generate a dashboard.
              <br />
              Example: <em>"Show AE grade distribution by study week"</em>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
