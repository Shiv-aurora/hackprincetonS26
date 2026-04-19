// Tests for ChartGrid: verifies all chart kinds render and unknown kind doesn't crash.
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { ChartGrid } from "./ChartGrid";
import { DASHBOARD_FIXTURE, UNKNOWN_CHART_FIXTURE } from "./__fixtures__/dashboardFixture";

// Stub ResizeObserver which is not available in jsdom.
beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // visx uses getBBox which jsdom doesn't implement; assign directly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsdom doesn't type getBBox
  (SVGElement.prototype as any).getBBox = () => ({ x: 0, y: 0, width: 100, height: 20 });
});

describe("ChartGrid", () => {
  // Renders a full fixture with all five chart kinds and asserts each title is present.
  it("renders all chart titles from the fixture", () => {
    render(<ChartGrid spec={DASHBOARD_FIXTURE} />);
    for (const chart of DASHBOARD_FIXTURE.charts) {
      expect(screen.getAllByText(chart.title).length).toBeGreaterThan(0);
    }
  });

  // Verifies that an unknown chart kind renders the fallback message without throwing.
  it("renders a fallback for unsupported chart kind without crashing", () => {
    render(<ChartGrid spec={UNKNOWN_CHART_FIXTURE} />);
    expect(
      screen.getByText(/chart type not supported: unknown-chart-type/i)
    ).toBeInTheDocument();
  });

  // Verifies the dashboard fixture title is not rendered by ChartGrid (title is in DashboardView).
  it("does not render the top-level dashboard title", () => {
    render(<ChartGrid spec={DASHBOARD_FIXTURE} />);
    // ChartGrid renders chart titles, not the spec.title at the dashboard level.
    expect(screen.queryByText("Synthetic Study Dashboard")).not.toBeInTheDocument();
  });

  // Verifies that an annotation string is rendered for charts that have annotations.
  it("renders annotations when present", () => {
    render(<ChartGrid spec={DASHBOARD_FIXTURE} />);
    expect(screen.getByText(/N=90 total events/i)).toBeInTheDocument();
  });
});
