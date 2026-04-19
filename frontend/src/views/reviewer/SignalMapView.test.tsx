// Tests for SignalMapView: verifies SVG circles, hypothesis text, and loading/error states.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import SignalMapView from "./SignalMapView";
import { ReviewerContextProvider } from "./ReviewerContext";
import { SIGNAL_FIXTURE } from "./__fixtures__/signalFixture";

// Stub ResizeObserver which is not available in jsdom.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe("SignalMapView", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows loading state while fetch is in-flight", async () => {
    // Return a promise that never resolves to keep loading state.
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(
      <ReviewerContextProvider>
        <SignalMapView paneSlot="right" persona="reviewer" />
      </ReviewerContextProvider>
    );
    expect(screen.getByText(/Loading signal data/i)).toBeInTheDocument();
  });

  it("renders hypothesis text from the fixture in the side panel", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(SIGNAL_FIXTURE),
    } as unknown as Response);
    render(
      <ReviewerContextProvider>
        <SignalMapView paneSlot="right" persona="reviewer" />
      </ReviewerContextProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId("hypothesis-text")).toBeInTheDocument();
    });
    expect(screen.getByTestId("hypothesis-text")).toHaveTextContent(
      /site-specific signal/i
    );
  });

  it("renders SVG circles after data loads", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(SIGNAL_FIXTURE),
    } as unknown as Response);
    render(
      <ReviewerContextProvider>
        <SignalMapView paneSlot="right" persona="reviewer" />
      </ReviewerContextProvider>
    );
    await waitFor(() => {
      const svg = document.querySelector("svg");
      expect(svg).not.toBeNull();
    });
    const circles = document.querySelectorAll("circle");
    expect(circles.length).toBeGreaterThan(0);
  });

  it("renders recommended actions after data loads", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(SIGNAL_FIXTURE),
    } as unknown as Response);
    render(
      <ReviewerContextProvider>
        <SignalMapView paneSlot="right" persona="reviewer" />
      </ReviewerContextProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId("signal-side-panel")).toBeInTheDocument();
    });
    expect(screen.getByText(/Notify medical monitor/i)).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));
    render(
      <ReviewerContextProvider>
        <SignalMapView paneSlot="right" persona="reviewer" />
      </ReviewerContextProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/Network failure/i);
  });
});
