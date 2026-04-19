// Tests for CaseTimelineView: verifies causality badge, SVG rendering, and absence of raw narrative text.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import React, { useEffect } from "react";
import CaseTimelineView from "./CaseTimelineView";
import { ReviewerContextProvider, useReviewerContext } from "./ReviewerContext";
import { TIMELINE_FIXTURE } from "./__fixtures__/timelineFixture";

// Stub ResizeObserver which is not available in jsdom.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Helper component that seeds timeline data into context after mount.
const TimelineSeed: React.FC = () => {
  const { setTimelineData } = useReviewerContext();
  useEffect(() => {
    setTimelineData(TIMELINE_FIXTURE);
  }, [setTimelineData]);
  return null;
};

// Wraps the component in ReviewerContextProvider with pre-loaded timeline data.
function renderWithTimelineData() {
  return render(
    <ReviewerContextProvider>
      <TimelineSeed />
      <CaseTimelineView paneSlot="main" persona="reviewer" />
    </ReviewerContextProvider>
  );
}

describe("CaseTimelineView", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(TIMELINE_FIXTURE),
    } as unknown as Response);
  });

  it("shows the empty state when no data is loaded", () => {
    render(
      <ReviewerContextProvider>
        <CaseTimelineView paneSlot="main" persona="reviewer" />
      </ReviewerContextProvider>
    );
    expect(screen.getByText(/No narrative loaded/i)).toBeInTheDocument();
  });

  it("renders the causality verdict badge once data is in context", async () => {
    renderWithTimelineData();
    await waitFor(() => {
      expect(screen.getByTestId("causality-verdict")).toBeInTheDocument();
    });
    expect(screen.getByTestId("causality-verdict")).toHaveTextContent(/probable/i);
  });

  it("renders an SVG element (D3 drew the chart)", async () => {
    renderWithTimelineData();
    await waitFor(() => {
      const svg = document.querySelector("svg");
      expect(svg).not.toBeNull();
    });
  });

  it("does not expose the audit_id in the rendered DOM", async () => {
    renderWithTimelineData();
    await waitFor(() => {
      expect(screen.getByTestId("causality-verdict")).toBeInTheDocument();
    });
    // audit_id "abc123" must not appear in the rendered output.
    expect(document.body.textContent).not.toContain("abc123");
  });

  it("renders demographics fields from the fixture", async () => {
    renderWithTimelineData();
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByText("45-54")).toBeInTheDocument();
    });
    expect(screen.getByText("SITE-7")).toBeInTheDocument();
  });

  it("renders the causality rationale text", async () => {
    renderWithTimelineData();
    await waitFor(() => {
      expect(screen.getByText(/Temporal relationship supports causality/i)).toBeInTheDocument();
    });
  });
});
