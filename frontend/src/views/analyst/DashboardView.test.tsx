// Tests for DashboardView: prompt input, generate trigger, chart rendering, and PHI error.
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { DashboardView } from "./DashboardView";
import { DASHBOARD_FIXTURE } from "./__fixtures__/dashboardFixture";

// Stub ResizeObserver for jsdom.
beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsdom doesn't type getBBox
  (SVGElement.prototype as any).getBBox = () => ({ x: 0, y: 0, width: 100, height: 20 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Mocks fetch to return a successful DashboardSpec fixture.
function mockFetchSuccess() {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(DASHBOARD_FIXTURE), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

// Mocks fetch to return a 422 error (PHI in prompt).
function mockFetch422() {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ detail: "PHI detected in prompt" }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("DashboardView", () => {
  // Verifies that typing a prompt and clicking Generate triggers fetch and renders the chart grid.
  it("renders ChartGrid after a successful generate call", async () => {
    mockFetchSuccess();
    render(<DashboardView paneSlot="right" persona="analyst" />);

    const input = screen.getByPlaceholderText(/describe the chart/i);
    fireEvent.change(input, { target: { value: "Show AE grade distribution" } });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => {
      // Dashboard title from the fixture is rendered.
      expect(screen.getByText("Synthetic Study Dashboard")).toBeInTheDocument();
    });

    // Chart titles from the fixture are rendered.
    expect(screen.getByText("AE Grade Distribution")).toBeInTheDocument();
    expect(screen.getByText("Enrollment Over Time")).toBeInTheDocument();
  });

  // Verifies that a 422 response shows the PHI-sensitive-identifier error message.
  it("shows PHI error message on 422 response", async () => {
    mockFetch422();
    render(<DashboardView paneSlot="right" persona="analyst" />);

    const input = screen.getByPlaceholderText(/describe the chart/i);
    fireEvent.change(input, { target: { value: "Show Subject 01-1234 outcomes" } });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/prompt contains sensitive identifiers/i)
      ).toBeInTheDocument();
    });
  });

  // Verifies the narrative summary is rendered after a successful generate.
  it("renders narrative summary from the spec", async () => {
    mockFetchSuccess();
    render(<DashboardView paneSlot="right" persona="analyst" />);

    fireEvent.change(screen.getByPlaceholderText(/describe the chart/i), {
      target: { value: "summary view" },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/synthetic cohort shows typical ae distribution/i)
      ).toBeInTheDocument();
    });
  });

  // Verifies the Generate button is disabled when the input is empty.
  it("disables Generate button when prompt is empty", () => {
    render(<DashboardView paneSlot="right" persona="analyst" />);
    const btn = screen.getByRole("button", { name: /generate/i });
    expect(btn).toBeDisabled();
  });

  // Verifies the empty-state instruction text is shown before any generate call.
  it("shows empty-state hint before first generate", () => {
    render(<DashboardView paneSlot="right" persona="analyst" />);
    expect(screen.getByText(/enter a prompt above/i)).toBeInTheDocument();
  });
});
