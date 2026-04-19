// Renders a DashboardSpec as a responsive CSS grid of visx-powered charts.
import React, { useMemo } from "react";
import { Group } from "@visx/group";
import { Bar, LinePath, BarStack } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { scaleLinear, scaleBand, scaleOrdinal } from "@visx/scale";
import { HeatmapRect } from "@visx/heatmap";
import { useTooltip, TooltipWithBounds } from "@visx/tooltip";
import { curveMonotoneX } from "d3";
import type { ChartSpec, ChartSeries, DashboardSpec } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_H = 220;
const MARGIN = { top: 16, right: 16, bottom: 40, left: 44 };
const AXIS_COLOR = "rgba(255,255,255,0.35)";
const TICK_LABEL_PROPS = {
  fill: "rgba(255,255,255,0.55)",
  fontSize: 10,
  fontFamily: "JetBrains Mono, monospace",
} as const;

// Resolves a color_token CSS variable name to a concrete CSS value.
function resolveColor(token: string | undefined, fallback: string): string {
  if (!token) return fallback;
  // Return the CSS var() reference so the browser resolves it at paint time.
  return `var(${token}, ${fallback})`;
}

// Produces an array of distinct fallback colors for multi-series charts.
function fallbackColors(n: number): string[] {
  const palette = [
    "#4fc3f7",
    "#ce9178",
    "#6a9955",
    "#dcdcaa",
    "#c586c0",
    "#9cdcfe",
    "#f48771",
    "#569cd6",
  ];
  return Array.from({ length: n }, (_, i) => palette[i % palette.length]);
}

// ---------------------------------------------------------------------------
// Tooltip state type
// ---------------------------------------------------------------------------

interface TooltipData {
  label: string;
  value: number;
  seriesName?: string;
}

// ---------------------------------------------------------------------------
// BarChart
// ---------------------------------------------------------------------------

// Renders a single-series vertical bar chart using visx Bar + AxisBottom + AxisLeft.
const BarChart: React.FC<{ spec: ChartSpec; width: number }> = ({ spec, width }) => {
  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop, tooltipOpen } =
    useTooltip<TooltipData>();

  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = CHART_H - MARGIN.top - MARGIN.bottom;
  const series: ChartSeries = spec.series[0] ?? { name: "", data: [], color_token: undefined };
  const data = series.data;

  const xScale = scaleBand<string>({
    domain: data.map(([x]) => String(x)),
    range: [0, innerW],
    padding: 0.35,
  });

  const maxY = Math.max(...data.map(([, y]) => y), 1);
  const yScale = scaleLinear<number>({ domain: [0, maxY * 1.1], range: [innerH, 0] });

  const barColor = resolveColor(series.color_token, "#4fc3f7");

  return (
    <div style={{ position: "relative" }}>
      <svg width={width} height={CHART_H}>
        <Group left={MARGIN.left} top={MARGIN.top}>
          <GridRows
            scale={yScale}
            width={innerW}
            stroke="rgba(255,255,255,0.06)"
            numTicks={4}
          />
          {data.map(([xVal, yVal]) => {
            const xStr = String(xVal);
            const barX = xScale(xStr) ?? 0;
            const barY = yScale(yVal);
            const barH = innerH - yScale(yVal);
            return (
              <Bar
                key={xStr}
                x={barX}
                y={barY}
                width={xScale.bandwidth()}
                height={barH}
                fill={barColor}
                opacity={0.85}
                rx={2}
                onMouseEnter={(e) => {
                  const rect = (e.target as SVGElement).getBoundingClientRect();
                  showTooltip({
                    tooltipData: { label: xStr, value: yVal },
                    tooltipLeft: rect.left + rect.width / 2,
                    tooltipTop: rect.top - 8,
                  });
                }}
                onMouseLeave={hideTooltip}
              />
            );
          })}
          <AxisBottom
            scale={xScale}
            top={innerH}
            stroke={AXIS_COLOR}
            tickStroke={AXIS_COLOR}
            tickLabelProps={TICK_LABEL_PROPS}
          />
          <AxisLeft
            scale={yScale}
            stroke={AXIS_COLOR}
            tickStroke={AXIS_COLOR}
            tickLabelProps={TICK_LABEL_PROPS}
            numTicks={4}
          />
        </Group>
      </svg>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={{ position: "fixed" }}>
          <span style={{ fontSize: 11, color: "#d4d9df", fontFamily: "JetBrains Mono, monospace" }}>
            {tooltipData.label}: <strong>{tooltipData.value}</strong>
          </span>
        </TooltipWithBounds>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// LineChart
// ---------------------------------------------------------------------------

// Renders a multi-series line chart using visx LinePath with monotone curve.
const LineChart: React.FC<{ spec: ChartSpec; width: number }> = ({ spec, width }) => {
  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop, tooltipOpen } =
    useTooltip<TooltipData>();

  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = CHART_H - MARGIN.top - MARGIN.bottom;

  const allXValues = spec.series.flatMap((s) => s.data.map(([x]) => String(x)));
  const uniqueX = [...new Set(allXValues)];
  const allY = spec.series.flatMap((s) => s.data.map(([, y]) => y));
  const maxY = Math.max(...allY, 1);

  const xScale = scaleBand<string>({ domain: uniqueX, range: [0, innerW] });
  const yScale = scaleLinear<number>({ domain: [0, maxY * 1.1], range: [innerH, 0] });
  const colors = fallbackColors(spec.series.length);

  return (
    <div style={{ position: "relative" }}>
      <svg width={width} height={CHART_H}>
        <Group left={MARGIN.left} top={MARGIN.top}>
          <GridRows scale={yScale} width={innerW} stroke="rgba(255,255,255,0.06)" numTicks={4} />
          {spec.series.map((s, si) => {
            const color = resolveColor(s.color_token, colors[si]);
            return (
              <LinePath<[string | number, number]>
                key={s.name}
                data={s.data}
                x={([x]) => (xScale(String(x)) ?? 0) + xScale.bandwidth() / 2}
                y={([, y]) => yScale(y)}
                stroke={color}
                strokeWidth={2}
                curve={curveMonotoneX}
              />
            );
          })}
          {/* Invisible hit-area circles for tooltips */}
          {spec.series.map((s, si) =>
            s.data.map(([x, y]) => {
              const cx = (xScale(String(x)) ?? 0) + xScale.bandwidth() / 2;
              const cy = yScale(y);
              return (
                <circle
                  key={`${si}-${String(x)}`}
                  cx={cx}
                  cy={cy}
                  r={5}
                  fill={resolveColor(s.color_token, colors[si])}
                  opacity={0.8}
                  onMouseEnter={(e) => {
                    const rect = (e.target as SVGElement).getBoundingClientRect();
                    showTooltip({
                      tooltipData: { label: String(x), value: y, seriesName: s.name },
                      tooltipLeft: rect.left,
                      tooltipTop: rect.top - 8,
                    });
                  }}
                  onMouseLeave={hideTooltip}
                />
              );
            })
          )}
          <AxisBottom
            scale={xScale}
            top={innerH}
            stroke={AXIS_COLOR}
            tickStroke={AXIS_COLOR}
            tickLabelProps={TICK_LABEL_PROPS}
          />
          <AxisLeft
            scale={yScale}
            stroke={AXIS_COLOR}
            tickStroke={AXIS_COLOR}
            tickLabelProps={TICK_LABEL_PROPS}
            numTicks={4}
          />
        </Group>
      </svg>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={{ position: "fixed" }}>
          <span style={{ fontSize: 11, color: "#d4d9df", fontFamily: "JetBrains Mono, monospace" }}>
            {tooltipData.seriesName && <>{tooltipData.seriesName}: </>}
            {tooltipData.label}: <strong>{tooltipData.value}</strong>
          </span>
        </TooltipWithBounds>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// StackedBarChart
// ---------------------------------------------------------------------------

// Builds the stacked data structure expected by @visx/shape BarStack.
interface StackDatum {
  x: string;
  [seriesName: string]: string | number;
}

// Renders a stacked bar chart using visx BarStack.
const StackedBarChart: React.FC<{ spec: ChartSpec; width: number }> = ({ spec, width }) => {
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = CHART_H - MARGIN.top - MARGIN.bottom;
  const colors = fallbackColors(spec.series.length);

  // Pivot series data into per-x objects.
  const allX = [...new Set(spec.series.flatMap((s) => s.data.map(([x]) => String(x))))];
  const stackData: StackDatum[] = allX.map((x) => {
    const row: StackDatum = { x };
    spec.series.forEach((s) => {
      const pt = s.data.find(([sx]) => String(sx) === x);
      row[s.name] = pt ? pt[1] : 0;
    });
    return row;
  });

  const maxTotal = Math.max(
    ...stackData.map((row) =>
      spec.series.reduce((sum, s) => sum + ((row[s.name] as number) ?? 0), 0)
    ),
    1
  );

  const xScale = scaleBand<string>({ domain: allX, range: [0, innerW], padding: 0.35 });
  const yScale = scaleLinear<number>({ domain: [0, maxTotal * 1.1], range: [innerH, 0] });
  const colorScale = scaleOrdinal<string, string>({
    domain: spec.series.map((s) => s.name),
    range: spec.series.map((s, i) => resolveColor(s.color_token, colors[i])),
  });

  const keys = spec.series.map((s) => s.name);

  return (
    <svg width={width} height={CHART_H}>
      <Group left={MARGIN.left} top={MARGIN.top}>
        <GridRows scale={yScale} width={innerW} stroke="rgba(255,255,255,0.06)" numTicks={4} />
        <BarStack<StackDatum, string>
          data={stackData}
          keys={keys}
          x={(d) => d.x}
          xScale={xScale}
          yScale={yScale}
          color={colorScale}
        >
          {(stacks) =>
            stacks.map((stack) =>
              stack.bars.map((bar) => (
                <Bar
                  key={`${stack.key}-${bar.index}`}
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  fill={bar.color}
                  opacity={0.85}
                  rx={1}
                />
              ))
            )
          }
        </BarStack>
        <AxisBottom
          scale={xScale}
          top={innerH}
          stroke={AXIS_COLOR}
          tickStroke={AXIS_COLOR}
          tickLabelProps={TICK_LABEL_PROPS}
        />
        <AxisLeft
          scale={yScale}
          stroke={AXIS_COLOR}
          tickStroke={AXIS_COLOR}
          tickLabelProps={TICK_LABEL_PROPS}
          numTicks={4}
        />
      </Group>
    </svg>
  );
};

// ---------------------------------------------------------------------------
// KPITile
// ---------------------------------------------------------------------------

// Renders a single large-number KPI tile with title and value.
const KPITile: React.FC<{ spec: ChartSpec; width: number }> = ({ spec, width }) => {
  const value = spec.series[0]?.data[0]?.[1] ?? 0;
  return (
    <div
      style={{
        width,
        height: CHART_H,
        background: "var(--color-surface-container-highest, rgba(31,38,46,1))",
        borderRadius: 6,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          fontSize: 52,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: "var(--color-primary-fixed, #4fc3f7)",
          lineHeight: 1,
        }}
      >
        {value.toLocaleString()}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.5)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontFamily: "JetBrains Mono, monospace",
        }}
      >
        {spec.title}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// HeatmapChart
// ---------------------------------------------------------------------------

// Builds bin data for visx HeatmapRect from the chart spec series.
interface HeatBin {
  bin: number;
  bins: Array<{ bin: number; count: number }>;
}

// Renders a heatmap using visx HeatmapRect; X=data columns, Y=series names.
const HeatmapChart: React.FC<{ spec: ChartSpec; width: number }> = ({ spec, width }) => {
  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop, tooltipOpen } =
    useTooltip<TooltipData>();

  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = CHART_H - MARGIN.top - MARGIN.bottom;

  // Collect all X keys across series.
  const allXRaw = [...new Set(spec.series.flatMap((s) => s.data.map(([x]) => String(x))))];
  const seriesNames = spec.series.map((s) => s.name);
  const nX = allXRaw.length;
  const nY = seriesNames.length;
  const binW = nX > 0 ? innerW / nX : innerW;
  const binH = nY > 0 ? innerH / nY : innerH;

  const allValues = spec.series.flatMap((s) => s.data.map(([, v]) => v));
  const maxVal = Math.max(...allValues, 1);

  // Build bin structure for HeatmapRect.
  const binData: HeatBin[] = allXRaw.map((x, xi) => ({
    bin: xi,
    bins: seriesNames.map((sName, si) => {
      const s = spec.series[si];
      const pt = s?.data.find(([sx]) => String(sx) === x);
      return { bin: si, count: pt ? pt[1] : 0 };
    }),
  }));

  const colorScale = scaleLinear<string>({
    domain: [0, maxVal],
    range: ["rgba(0,120,212,0.1)", "rgba(0,120,212,0.9)"],
  });

  return (
    <div style={{ position: "relative" }}>
      <svg width={width} height={CHART_H}>
        <Group left={MARGIN.left} top={MARGIN.top}>
          <HeatmapRect
            data={binData}
            xScale={(d) => d * binW}
            yScale={(d) => d * binH}
            colorScale={colorScale}
            binWidth={binW}
            binHeight={binH}
            gap={2}
          >
            {(heatmap) =>
              heatmap.map((heatmapXBins) =>
                heatmapXBins.map((bin) => (
                  <rect
                    key={`${bin.row}-${bin.column}`}
                    x={bin.x}
                    y={bin.y}
                    width={bin.width}
                    height={bin.height}
                    fill={bin.color ?? "transparent"}
                    rx={2}
                    onMouseEnter={(e) => {
                      const rect = (e.target as SVGElement).getBoundingClientRect();
                      showTooltip({
                        tooltipData: {
                          label: `${allXRaw[bin.column ?? 0]} / ${seriesNames[bin.row ?? 0]}`,
                          value: bin.count as number,
                        },
                        tooltipLeft: rect.left,
                        tooltipTop: rect.top - 8,
                      });
                    }}
                    onMouseLeave={hideTooltip}
                  />
                ))
              )
            }
          </HeatmapRect>
        </Group>
      </svg>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={{ position: "fixed" }}>
          <span style={{ fontSize: 11, color: "#d4d9df", fontFamily: "JetBrains Mono, monospace" }}>
            {tooltipData.label}: <strong>{tooltipData.value}</strong>
          </span>
        </TooltipWithBounds>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// UnknownChart — graceful fallback for unrecognised chart kinds.
// ---------------------------------------------------------------------------

// Renders a labeled placeholder for unsupported chart kinds without crashing.
const UnknownChart: React.FC<{ spec: ChartSpec; width: number }> = ({ spec, width }) => (
  <div
    style={{
      width,
      height: CHART_H,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      border: "1px dashed rgba(255,255,255,0.12)",
      borderRadius: 6,
      gap: 6,
    }}
  >
    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{spec.title}</div>
    <div style={{ fontSize: 11, color: "var(--color-error, #f48771)", fontFamily: "JetBrains Mono, monospace" }}>
      Chart type not supported: {spec.kind}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// ChartWrapper — title + renderer dispatch
// ---------------------------------------------------------------------------

// Dispatches to the correct chart renderer based on spec.kind and wraps it with a title.
const ChartWrapper: React.FC<{ spec: ChartSpec; width: number }> = ({ spec, width }) => {
  const inner = useMemo(() => {
    switch (spec.kind) {
      case "bar":
        return <BarChart spec={spec} width={width} />;
      case "line":
        return <LineChart spec={spec} width={width} />;
      case "stacked-bar":
        return <StackedBarChart spec={spec} width={width} />;
      case "kpi":
        return <KPITile spec={spec} width={width} />;
      case "heatmap":
        return <HeatmapChart spec={spec} width={width} />;
      default:
        return <UnknownChart spec={spec} width={width} />;
    }
  }, [spec, width]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: "rgba(255,255,255,0.015)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 8,
        padding: "12px 12px 8px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "rgba(255,255,255,0.6)",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          fontFamily: "JetBrains Mono, monospace",
        }}
      >
        {spec.title}
      </div>
      {inner}
      {spec.annotations.length > 0 && (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>
          {spec.annotations.join(" · ")}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ChartGrid — public export
// ---------------------------------------------------------------------------

// Props for the ChartGrid component.
export interface ChartGridProps {
  spec: DashboardSpec;
}

// Chooses CSS grid column count based on number of charts: 1 → 1col, 2-4 → 2col, 5+ → 3col.
function gridColumns(n: number): number {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  return 3;
}

// Renders a DashboardSpec as a responsive CSS grid of charts using visx renderers.
export const ChartGrid: React.FC<ChartGridProps> = ({ spec }) => {
  const cols = gridColumns(spec.charts.length);
  // Approximate chart width: container minus padding divided by columns.
  // Using a static approximation; ChartWrapper receives full column width conceptually.
  const chartWidth = Math.floor((800 - cols * 16) / cols);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 16,
        padding: "4px 0",
      }}
    >
      {spec.charts.map((chart) => (
        <ChartWrapper key={chart.id} spec={chart} width={chartWidth} />
      ))}
    </div>
  );
};
