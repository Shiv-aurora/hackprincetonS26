// SignalMapView: D3 scatter plot of AE events with convex-hull cluster polygons and a hypothesis side panel.
import React, { useRef, useEffect, useState } from "react";
import * as d3 from "d3";
import type { ViewProps } from "../../layout/ViewRegistry";
import type { SignalResponse } from "./types";
import { useSignalData } from "../../hooks/useSignalData";
import { ExportActions } from "../../components/ExportActions";

// Default demo parameters shown when no real study context is provided.
const DEFAULT_STUDY_ID = "STUDY-001";
const DEFAULT_CASE_ID = "CASE-0042";
const DEFAULT_WINDOW_DAYS = 90;

// Maps an AE grade to a pixel radius for scatter plot circles.
function gradeRadius(grade: 1 | 2 | 3 | 4 | 5): number {
  return 4 + (grade - 1) * 2; // grade 1=4px … grade 5=12px
}

// Maps an AE grade to a CSS color string.
function gradeEventColor(grade: 1 | 2 | 3 | 4 | 5): string {
  if (grade <= 2) return "var(--color-primary-container, #0078d4)";
  if (grade === 3) return "#e07b39";
  return "var(--color-error)";
}

// Maps cluster index to a low-opacity fill and stroke for the convex hull polygon.
function clusterFill(idx: number): string {
  const palette = [
    "rgba(79,193,247,0.08)",
    "rgba(220,220,170,0.08)",
    "rgba(106,153,85,0.08)",
    "rgba(244,135,113,0.08)",
  ];
  return palette[idx % palette.length];
}

// Maps cluster index to a stroke color for the convex hull polygon.
function clusterStroke(idx: number): string {
  const palette = [
    "rgba(79,193,247,0.35)",
    "rgba(220,220,170,0.35)",
    "rgba(106,153,85,0.35)",
    "rgba(244,135,113,0.35)",
  ];
  return palette[idx % palette.length];
}

// Props carried by a scatter-plot tooltip.
interface TooltipState {
  x: number;
  y: number;
  site: string;
  day: number;
  grade: number;
  caseId: string;
}

const MARGIN = { top: 12, right: 16, bottom: 32, left: 72 };

// Draws the D3 scatter plot with convex hull polygons into the provided SVG element.
function drawSignalMap(
  svg: SVGSVGElement,
  data: SignalResponse,
  width: number,
  height: number,
  onTooltip: (tt: TooltipState | null) => void
): void {
  const { events, clusters, current_case_position } = data;

  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  // X scale: study day.
  const dayMax = events.length ? Math.max(...events.map((e) => e.day)) + 5 : 30;
  const xScale = d3.scaleLinear().domain([0, dayMax]).range([0, innerW]);

  // Y scale: site names (ordinal).
  const sites = [...new Set(events.map((e) => e.site))].sort();
  const yScale = d3.scalePoint().domain(sites).range([0, innerH]).padding(0.5);

  const root = d3.select(svg);
  root.selectAll("*").remove();
  root.attr("width", width).attr("height", height);

  const g = root.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  // ── Convex hull polygons ──────────────────────────────────────────────────
  clusters.forEach((cluster, idx) => {
    if (cluster.hull.length < 3) return;
    const hullPoints: [number, number][] = cluster.hull.map(([hx, hy]) => [xScale(hx), yScale(hy) ?? 0]);
    const hull = d3.polygonHull(hullPoints);
    if (!hull) return;
    g.append("polygon")
      .attr("points", hull.map((pt) => pt.join(",")).join(" "))
      .attr("fill", clusterFill(idx))
      .attr("stroke", clusterStroke(idx))
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,2");
  });

  // ── Event circles ─────────────────────────────────────────────────────────
  const [currentSite, currentDay] = current_case_position;
  for (const ev of events) {
    const isCurrent = ev.site === currentSite && ev.day === currentDay;
    const cx = xScale(ev.day);
    const cy = yScale(ev.site) ?? 0;
    const r = gradeRadius(ev.grade);

    if (isCurrent) {
      // Outer pulse ring (CSS animation applied via class).
      g.append("circle")
        .attr("cx", cx).attr("cy", cy)
        .attr("r", r + 5)
        .attr("fill", "none")
        .attr("stroke", "var(--color-error)")
        .attr("stroke-width", 2)
        .attr("class", "current-case-pulse");
    }

    g.append("circle")
      .attr("cx", cx).attr("cy", cy).attr("r", r)
      .attr("fill", isCurrent ? "var(--color-error)" : gradeEventColor(ev.grade))
      .attr("opacity", isCurrent ? 1 : 0.75)
      .attr("stroke", isCurrent ? "rgba(255,255,255,0.4)" : "none")
      .attr("stroke-width", 1)
      .attr("cursor", "pointer")
      .attr("data-testid", `event-circle-${ev.case_id_placeholder}`)
      .on("mouseenter", (event: MouseEvent) => {
        onTooltip({
          x: (event.offsetX ?? 0) + MARGIN.left,
          y: (event.offsetY ?? 0) + MARGIN.top,
          site: ev.site,
          day: ev.day,
          grade: ev.grade,
          caseId: ev.case_id_placeholder,
        });
      })
      .on("mouseleave", () => onTooltip(null));
  }

  // ── X Axis ────────────────────────────────────────────────────────────────
  const xAxisG = g.append("g").attr("transform", `translate(0,${innerH})`);
  xAxisG.call(d3.axisBottom(xScale).ticks(8).tickSize(3));
  xAxisG.select(".domain").attr("stroke", "rgba(255,255,255,0.1)");
  xAxisG.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.1)");
  xAxisG.selectAll(".tick text").attr("fill", "#6b7480").attr("font-size", "9px")
    .attr("font-family", "var(--font-mono, monospace)");
  xAxisG.append("text")
    .attr("x", innerW / 2).attr("y", 28)
    .attr("text-anchor", "middle")
    .attr("fill", "#4a5260").attr("font-size", "9px")
    .attr("font-family", "var(--font-mono, monospace)")
    .text("Study Day");

  // ── Y Axis (site labels) ──────────────────────────────────────────────────
  const yAxisG = g.append("g");
  yAxisG.call(d3.axisLeft(yScale).tickSize(0));
  yAxisG.select(".domain").remove();
  yAxisG.selectAll(".tick text")
    .attr("fill", "#6b7480")
    .attr("font-size", "9px")
    .attr("font-family", "var(--font-mono, monospace)")
    .attr("dx", "-4px");
}

// Renders a two-panel signal detection view: D3 scatter on the left, hypothesis panel on the right.
const SignalMapView: React.FC<ViewProps> = () => {
  const { data, loading, error } = useSignalData(DEFAULT_STUDY_ID, DEFAULT_CASE_ID, DEFAULT_WINDOW_DAYS);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Draws (or redraws) the chart whenever data or container dimensions change.
  useEffect(() => {
    if (!data || !svgRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    // Left panel is 70% of total container width.
    const chartWidth = (rect.width * 0.7) || 400;
    const chartHeight = (rect.height - 48) || 300;
    drawSignalMap(svgRef.current, data, chartWidth, chartHeight, setTooltip);
  }, [data]);

  // Re-render chart on container resize.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !data) return;
    const observer = new ResizeObserver(() => {
      if (!svgRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const chartWidth = (rect.width * 0.7) || 400;
      const chartHeight = (rect.height - 48) || 300;
      drawSignalMap(svgRef.current, data, chartWidth, chartHeight, setTooltip);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [data]);

  const outerStyle: React.CSSProperties = {
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

  const bodyStyle: React.CSSProperties = {
    display: "flex",
    flex: 1,
    overflow: "hidden",
    position: "relative",
  };

  const chartPanelStyle: React.CSSProperties = {
    width: "70%",
    overflow: "hidden",
    position: "relative",
  };

  const sidePanelStyle: React.CSSProperties = {
    width: "30%",
    borderLeft: "1px solid rgba(255,255,255,0.05)",
    padding: "1rem",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  };

  const emptyStyle: React.CSSProperties = {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#4a5260",
    fontSize: "13px",
    fontFamily: "var(--font-mono, monospace)",
    textAlign: "center",
    padding: "2rem",
  };

  if (loading) {
    return (
      <div style={outerStyle}>
        <div style={headerStyle}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#d4d9df" }}>Signal Detection</span>
        </div>
        <div style={emptyStyle}>Loading signal data…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={outerStyle}>
        <div style={headerStyle}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#d4d9df" }}>Signal Detection</span>
        </div>
        <div style={{ ...emptyStyle, color: "var(--color-error)" }} role="alert">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={outerStyle}>
        <div style={headerStyle}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#d4d9df" }}>Signal Detection</span>
        </div>
        <div style={emptyStyle}>Select a cluster to see hypothesis</div>
      </div>
    );
  }

  return (
    <div style={outerStyle}>
      <div style={headerStyle}>
        <span style={{ fontSize: "12px", fontWeight: 600, color: "#d4d9df" }}>Signal Detection</span>
        <span style={{ fontSize: "10px", color: "#4a5260", marginLeft: "0.75rem", fontFamily: "var(--font-mono, monospace)" }}>
          {data.events.length} events · {data.clusters.length} clusters · {DEFAULT_WINDOW_DAYS}-day window
        </span>
      </div>

      <div ref={containerRef} style={bodyStyle}>
        {/* D3 chart panel */}
        <div style={chartPanelStyle}>
          <svg
            ref={svgRef}
            style={{ display: "block" }}
            aria-label="Signal detection scatter plot"
          />

          {/* Hover tooltip */}
          {tooltip && (
            <div
              style={{
                position: "absolute",
                left: tooltip.x + 10,
                top: tooltip.y - 10,
                background: "rgba(15,18,22,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "4px",
                padding: "6px 10px",
                fontSize: "10px",
                fontFamily: "var(--font-mono, monospace)",
                color: "#d4d9df",
                pointerEvents: "none",
                zIndex: 10,
              }}
            >
              <div>{tooltip.site}</div>
              <div>Day {tooltip.day} · Grade {tooltip.grade}</div>
              <div style={{ color: "#6b7480" }}>{tooltip.caseId}</div>
            </div>
          )}
        </div>

        {/* Side panel: hypothesis + recommended actions */}
        <div style={sidePanelStyle} data-testid="signal-side-panel">
          <div>
            <h4 style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "#d4d9df",
              margin: "0 0 0.5rem",
              fontFamily: "var(--font-mono, monospace)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              Cluster Hypothesis
            </h4>
            <p
              style={{ fontSize: "12px", color: "#9aa3ad", lineHeight: 1.6, margin: 0 }}
              data-testid="hypothesis-text"
            >
              {data.hypothesis || "Select a cluster to see hypothesis"}
            </p>
          </div>

          {data.recommended_actions.length > 0 && (
            <div>
              <h4 style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "#d4d9df",
                margin: "0 0 0.5rem",
                fontFamily: "var(--font-mono, monospace)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}>
                Recommended Actions
              </h4>
              <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
                {data.recommended_actions.map((action, i) => (
                  <li
                    key={i}
                    style={{ fontSize: "11px", color: "#9aa3ad", lineHeight: 1.65, marginBottom: "0.25rem" }}
                  >
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ marginTop: "auto" }}>
            <ExportActions context="signal" />
          </div>
        </div>
      </div>

      {/* Inject pulse animation keyframes */}
      <style>{`
        @keyframes current-case-pulse {
          0%, 100% { opacity: 0.4; r: calc(var(--r) + 2px); }
          50% { opacity: 1; r: calc(var(--r) + 7px); }
        }
        .current-case-pulse {
          animation: current-case-pulse 1.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default SignalMapView;
