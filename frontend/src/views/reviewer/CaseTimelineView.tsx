// CaseTimelineView: multi-track D3 timeline rendering event severity, dosing, conmeds, and labs for a case narrative.
import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { ViewProps } from "../../layout/ViewRegistry";
import type { TimelineResponse } from "./types";
import { useReviewerContext } from "./ReviewerContext";
import { ExportActions } from "../../components/ExportActions";

// Track height constants in pixels.
const TRACK_HEIGHT_EVENT = 48;
const TRACK_HEIGHT_DOSING = 32;
const TRACK_HEIGHT_CONMEDS = 36;
const TRACK_HEIGHT_LABS = 64;
const AXIS_HEIGHT = 24;
const MARGIN_LEFT = 80;
const MARGIN_RIGHT = 24;
const MARGIN_TOP = 8;

// Maps event grade to a CSS color string.
function gradeColor(grade: 1 | 2 | 3 | 4 | 5): string {
  switch (grade) {
    case 1: return "#d4a017";
    case 2: return "#e07b39";
    case 3: return "var(--color-error)";
    case 4: return "#b83232";
    case 5: return "#7a1f1f";
  }
}

// Maps causality verdict string to a CSS background color.
function verdictColor(verdict: string): string {
  switch (verdict.toLowerCase()) {
    case "certain":    return "rgba(100,180,100,0.25)";
    case "probable":   return "rgba(79,193,247,0.2)";
    case "possible":   return "rgba(212,160,23,0.25)";
    case "unlikely":   return "rgba(100,100,100,0.2)";
    case "unassessable": return "rgba(100,100,100,0.2)";
    default:           return "rgba(100,100,100,0.2)";
  }
}

// Maps causality verdict string to a CSS border color.
function verdictBorderColor(verdict: string): string {
  switch (verdict.toLowerCase()) {
    case "certain":    return "rgba(100,180,100,0.55)";
    case "probable":   return "rgba(79,193,247,0.5)";
    case "possible":   return "rgba(212,160,23,0.55)";
    default:           return "rgba(150,150,150,0.35)";
  }
}

// Maps causality verdict string to a CSS text color.
function verdictTextColor(verdict: string): string {
  switch (verdict.toLowerCase()) {
    case "certain":    return "#7fcf7f";
    case "probable":   return "var(--color-ip)";
    case "possible":   return "var(--color-mnpi)";
    default:           return "#9aa3ad";
  }
}

// Props for the D3 drawing function — carries timeline data and SVG dimensions.
interface DrawTimelineProps {
  svg: SVGSVGElement;
  data: TimelineResponse;
  width: number;
}

// Renders all four timeline tracks into the provided SVG element using D3.
function drawTimeline({ svg, data, width }: DrawTimelineProps): void {
  const { tracks, annotations } = data;

  // Determine x domain from all day values across all tracks.
  const allDays: number[] = [
    ...tracks.event.map((e) => e.day),
    ...tracks.dosing.map((d) => d.day),
    ...tracks.conmeds.flatMap((c) => [c.start_day, c.end_day]),
    ...tracks.labs.points.map(([day]) => day),
  ];
  const dayMin = allDays.length ? Math.min(...allDays) - 1 : 0;
  const dayMax = allDays.length ? Math.max(...allDays) + 2 : 30;

  const drawWidth = width - MARGIN_LEFT - MARGIN_RIGHT;
  const xScale = d3.scaleLinear().domain([dayMin, dayMax]).range([0, drawWidth]);

  // Track y-offsets stacked top-to-bottom.
  const yEvent = MARGIN_TOP;
  const yDosing = yEvent + TRACK_HEIGHT_EVENT + 4;
  const yConmeds = yDosing + TRACK_HEIGHT_DOSING + 4;
  const yLabs = yConmeds + TRACK_HEIGHT_CONMEDS + 4;
  const totalHeight = yLabs + TRACK_HEIGHT_LABS + AXIS_HEIGHT + 8;

  const root = d3.select(svg);
  root.selectAll("*").remove();
  root.attr("width", width).attr("height", totalHeight);

  const g = root.append("g").attr("transform", `translate(${MARGIN_LEFT},0)`);

  // ── Track labels ────────────────────────────────────────────────────────────
  const labelStyle = (sel: d3.Selection<SVGTextElement, unknown, null, undefined>) =>
    sel
      .attr("x", -6)
      .attr("text-anchor", "end")
      .attr("font-size", "10px")
      .attr("fill", "#6b7480")
      .attr("font-family", "var(--font-mono, monospace)");

  g.append("text").call(labelStyle).attr("y", yEvent + TRACK_HEIGHT_EVENT / 2 + 4).text("EVENT");
  g.append("text").call(labelStyle).attr("y", yDosing + TRACK_HEIGHT_DOSING / 2 + 4).text("DOSING");
  g.append("text").call(labelStyle).attr("y", yConmeds + TRACK_HEIGHT_CONMEDS / 2 + 4).text("CONMEDS");
  g.append("text").call(labelStyle).attr("y", yLabs + TRACK_HEIGHT_LABS / 2 + 4).text("LABS");

  // ── Track background bands ───────────────────────────────────────────────
  const trackBg = (y: number, h: number) =>
    g.append("rect")
      .attr("x", 0)
      .attr("y", y)
      .attr("width", drawWidth)
      .attr("height", h)
      .attr("fill", "rgba(255,255,255,0.018)")
      .attr("rx", 3);

  trackBg(yEvent, TRACK_HEIGHT_EVENT);
  trackBg(yDosing, TRACK_HEIGHT_DOSING);
  trackBg(yConmeds, TRACK_HEIGHT_CONMEDS);
  trackBg(yLabs, TRACK_HEIGHT_LABS);

  // ── EVENT track: colored grade bands ──────────────────────────────────────
  const eventG = g.append("g");
  for (const ev of tracks.event) {
    const px = xScale(ev.day);
    const bandW = Math.max(xScale(ev.day + 1) - px, 4);
    eventG
      .append("rect")
      .attr("x", px - bandW / 2)
      .attr("y", yEvent + 4)
      .attr("width", bandW)
      .attr("height", TRACK_HEIGHT_EVENT - 8)
      .attr("fill", gradeColor(ev.grade))
      .attr("rx", 2)
      .attr("opacity", 0.75);

    eventG
      .append("text")
      .attr("x", px)
      .attr("y", yEvent + TRACK_HEIGHT_EVENT - 10)
      .attr("text-anchor", "middle")
      .attr("font-size", "9px")
      .attr("fill", "#d4d9df")
      .attr("font-family", "var(--font-mono, monospace)")
      .text(`G${ev.grade}`);
  }

  // ── DOSING track: triangle markers ────────────────────────────────────────
  const dosingG = g.append("g");
  const triangleUp = (px: number, cy: number, size: number) =>
    `M${px},${cy - size} L${px + size},${cy + size} L${px - size},${cy + size} Z`;
  const triangleDown = (px: number, cy: number, size: number) =>
    `M${px},${cy + size} L${px + size},${cy - size} L${px - size},${cy - size} Z`;

  for (const dose of tracks.dosing) {
    const px = xScale(dose.day);
    const cy = yDosing + TRACK_HEIGHT_DOSING / 2;
    if (dose.kind === "dose") {
      dosingG.append("path")
        .attr("d", triangleUp(px, cy, 7))
        .attr("fill", "var(--color-ip)")
        .attr("opacity", 0.85);
      // Half-life shading window.
      if (dose.half_life_days) {
        dosingG.append("rect")
          .attr("x", px)
          .attr("y", yDosing + 4)
          .attr("width", Math.min(xScale(dose.day + dose.half_life_days) - px, drawWidth - px))
          .attr("height", TRACK_HEIGHT_DOSING - 8)
          .attr("fill", "rgba(79,193,247,0.07)")
          .attr("rx", 2);
      }
    } else if (dose.kind === "dechallenge") {
      dosingG.append("path")
        .attr("d", triangleDown(px, cy, 7))
        .attr("fill", "var(--color-error)")
        .attr("opacity", 0.85);
    } else if (dose.kind === "rechallenge") {
      dosingG.append("path")
        .attr("d", triangleUp(px, cy, 7))
        .attr("fill", "#d4a017")
        .attr("opacity", 0.85);
    }
  }

  // ── CONMEDS track: interval bars ──────────────────────────────────────────
  // Group unique drugs to assign separate rows.
  const drugNames = [...new Set(tracks.conmeds.map((c) => c.drug_placeholder))];
  const rowH = Math.max(10, (TRACK_HEIGHT_CONMEDS - 6) / Math.max(drugNames.length, 1));
  const conmedG = g.append("g");
  for (const conmed of tracks.conmeds) {
    const rowIdx = drugNames.indexOf(conmed.drug_placeholder);
    const barY = yConmeds + 3 + rowIdx * rowH;
    const x0 = xScale(conmed.start_day);
    const x1 = xScale(conmed.end_day);
    conmedG.append("rect")
      .attr("x", x0)
      .attr("y", barY)
      .attr("width", Math.max(x1 - x0, 2))
      .attr("height", rowH - 3)
      .attr("fill", "rgba(79,193,247,0.3)")
      .attr("rx", 2);
    conmedG.append("text")
      .attr("x", x0 + 3)
      .attr("y", barY + rowH - 6)
      .attr("font-size", "9px")
      .attr("fill", "var(--color-ip)")
      .attr("font-family", "var(--font-mono, monospace)")
      .text(conmed.drug_placeholder);
  }

  // ── LABS track: sparkline + threshold lines ───────────────────────────────
  const labG = g.append("g");
  const labPoints = tracks.labs.points;
  if (labPoints.length > 0) {
    const labValues = labPoints.map(([, v]) => v);
    const labMin = Math.min(...labValues) * 0.9;
    const labMax = Math.max(...labValues) * 1.1;
    const yLabScale = d3.scaleLinear()
      .domain([labMin, labMax])
      .range([yLabs + TRACK_HEIGHT_LABS - 4, yLabs + 4]);

    // Upper threshold band.
    if (tracks.labs.upper_threshold !== undefined) {
      const upperY = yLabScale(tracks.labs.upper_threshold);
      labG.append("rect")
        .attr("x", 0)
        .attr("y", yLabs + 4)
        .attr("width", drawWidth)
        .attr("height", Math.max(upperY - (yLabs + 4), 0))
        .attr("fill", "rgba(244,135,113,0.07)");
      labG.append("line")
        .attr("x1", 0).attr("x2", drawWidth)
        .attr("y1", upperY).attr("y2", upperY)
        .attr("stroke", "var(--color-error)")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3")
        .attr("opacity", 0.5);
    }

    // Lower threshold band.
    if (tracks.labs.lower_threshold !== undefined) {
      const lowerY = yLabScale(tracks.labs.lower_threshold);
      labG.append("rect")
        .attr("x", 0)
        .attr("y", lowerY)
        .attr("width", drawWidth)
        .attr("height", Math.max((yLabs + TRACK_HEIGHT_LABS - 4) - lowerY, 0))
        .attr("fill", "rgba(244,135,113,0.06)");
      labG.append("line")
        .attr("x1", 0).attr("x2", drawWidth)
        .attr("y1", lowerY).attr("y2", lowerY)
        .attr("stroke", "var(--color-error)")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3")
        .attr("opacity", 0.5);
    }

    // Sparkline.
    const lineGen = d3.line<[number, number]>()
      .x(([day]) => xScale(day))
      .y(([, val]) => yLabScale(val))
      .curve(d3.curveMonotoneX);

    labG.append("path")
      .datum(labPoints)
      .attr("d", lineGen)
      .attr("fill", "none")
      .attr("stroke", "var(--color-primary-fixed, #4fc3f7)")
      .attr("stroke-width", 1.5)
      .attr("opacity", 0.8);

    // Dots.
    for (const [day, val] of labPoints) {
      labG.append("circle")
        .attr("cx", xScale(day))
        .attr("cy", yLabScale(val))
        .attr("r", 2.5)
        .attr("fill", "var(--color-primary-fixed, #4fc3f7)")
        .attr("opacity", 0.9);
    }

    // Lab series name label.
    labG.append("text")
      .attr("x", drawWidth - 2)
      .attr("y", yLabs + 13)
      .attr("text-anchor", "end")
      .attr("font-size", "9px")
      .attr("fill", "#6b7480")
      .attr("font-family", "var(--font-mono, monospace)")
      .text(tracks.labs.series_name);
  }

  // ── ANNOTATIONS: vertical dashed lines with labels ────────────────────────
  for (const ann of annotations) {
    if (ann.anchor_day === undefined) continue;
    const px = xScale(ann.anchor_day);
    g.append("line")
      .attr("x1", px).attr("x2", px)
      .attr("y1", MARGIN_TOP)
      .attr("y2", yLabs + TRACK_HEIGHT_LABS)
      .attr("stroke", "rgba(220,220,170,0.4)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,3");

    const bubble = g.append("g").attr("transform", `translate(${px},${MARGIN_TOP - 2})`);
    bubble.append("rect")
      .attr("x", 2).attr("y", -14)
      .attr("width", Math.min(ann.text.length * 5.5 + 8, 120))
      .attr("height", 14)
      .attr("fill", "rgba(48,41,18,0.85)")
      .attr("rx", 3);
    bubble.append("text")
      .attr("x", 6).attr("y", -3)
      .attr("font-size", "8px")
      .attr("fill", "var(--color-mnpi)")
      .attr("font-family", "var(--font-mono, monospace)")
      .text(ann.text.length > 20 ? ann.text.slice(0, 20) + "…" : ann.text);
  }

  // ── X AXIS ────────────────────────────────────────────────────────────────
  const axisG = g.append("g").attr("transform", `translate(0,${yLabs + TRACK_HEIGHT_LABS + 2})`);
  const xAxis = d3.axisBottom(xScale).ticks(Math.min(10, dayMax - dayMin)).tickSize(4);
  axisG.call(xAxis);
  axisG.select(".domain").attr("stroke", "rgba(255,255,255,0.1)");
  axisG.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.1)");
  axisG.selectAll(".tick text")
    .attr("fill", "#6b7480")
    .attr("font-size", "9px")
    .attr("font-family", "var(--font-mono, monospace)");

  // Axis label.
  axisG.append("text")
    .attr("x", drawWidth / 2)
    .attr("y", AXIS_HEIGHT)
    .attr("text-anchor", "middle")
    .attr("fill", "#4a5260")
    .attr("font-size", "9px")
    .attr("font-family", "var(--font-mono, monospace)")
    .text("Study Day");
}

// Renders the multi-track D3 case timeline for the reviewer persona's main pane.
const CaseTimelineView: React.FC<ViewProps> = () => {
  const { timelineData, assembling } = useReviewerContext();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Draw or redraw the D3 chart whenever data or container width changes.
  useEffect(() => {
    if (!timelineData || !svgRef.current || !containerRef.current) return;
    const width = containerRef.current.getBoundingClientRect().width || 600;
    drawTimeline({ svg: svgRef.current, data: timelineData, width });
  }, [timelineData]);

  // Re-render on container resize.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !timelineData) return;
    const observer = new ResizeObserver(() => {
      if (!svgRef.current || !containerRef.current) return;
      const width = containerRef.current.getBoundingClientRect().width || 600;
      drawTimeline({ svg: svgRef.current, data: timelineData, width });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [timelineData]);

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    background: "var(--color-surface-container-low)",
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.75rem 1rem 0.5rem",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    flexShrink: 0,
  };

  const scrollStyle: React.CSSProperties = {
    flex: 1,
    overflow: "auto",
    padding: "0.75rem 1rem",
  };

  const emptyStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#4a5260",
    fontSize: "13px",
    fontFamily: "var(--font-mono, monospace)",
    textAlign: "center",
    padding: "2rem",
  };

  // Empty state — no data loaded yet.
  if (!timelineData && !assembling) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#d4d9df" }}>Case Timeline</span>
        </div>
        <div style={emptyStyle}>
          No narrative loaded.&nbsp;Paste a narrative in the Narrative pane and click&nbsp;Assemble.
        </div>
      </div>
    );
  }

  // Loading state.
  if (assembling) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#d4d9df" }}>Case Timeline</span>
        </div>
        <div style={{ ...emptyStyle, opacity: 0.6, animation: "assembleFade 1.4s ease-in-out infinite alternate" }}>
          Assembling timeline…
        </div>
      </div>
    );
  }

  // Render causality badge above chart.
  const verdict = timelineData!.causality.verdict;
  const verdictBadgeStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "2px 10px",
    borderRadius: "9999px",
    fontSize: "11px",
    fontWeight: 600,
    fontFamily: "var(--font-mono, monospace)",
    background: verdictColor(verdict),
    border: `1px solid ${verdictBorderColor(verdict)}`,
    color: verdictTextColor(verdict),
    textTransform: "capitalize",
  };

  const demographicsStyle: React.CSSProperties = {
    display: "flex",
    gap: "1rem",
    fontSize: "10px",
    fontFamily: "var(--font-mono, monospace)",
    color: "#6b7480",
  };

  const demo = timelineData!.demographics;

  return (
    <div style={containerStyle}>
      {/* Header with demographics */}
      <div style={headerStyle}>
        <span style={{ fontSize: "12px", fontWeight: 600, color: "#d4d9df" }}>Case Timeline</span>
        <div style={demographicsStyle}>
          <span>{demo.age_band}</span>
          <span>{demo.sex}</span>
          <span style={{ color: "var(--color-phi)" }}>{demo.site_id_placeholder}</span>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span
            style={verdictBadgeStyle}
            data-testid="causality-verdict"
            role="status"
          >
            Causality: {verdict}
          </span>
        </div>
      </div>

      {/* Rationale text */}
      <div style={{ padding: "4px 1rem", fontSize: "11px", color: "#6b7480", flexShrink: 0, fontStyle: "italic" }}>
        {timelineData!.causality.rationale}
      </div>

      {/* D3 chart */}
      <div ref={containerRef} style={scrollStyle}>
        <svg ref={svgRef} style={{ display: "block", width: "100%" }} aria-label="Case timeline chart" />
      </div>

      {/* Export actions stub */}
      <div style={{ padding: "0.5rem 1rem", flexShrink: 0 }}>
        <ExportActions context="timeline" />
      </div>
    </div>
  );
};

export default CaseTimelineView;
