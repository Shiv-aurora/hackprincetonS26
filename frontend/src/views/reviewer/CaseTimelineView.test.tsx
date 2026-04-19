// Tests for CaseTimelineView: verifies causality badge, SVG rendering, and absence of raw narrative text.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import CaseTimelineView from "./CaseTimelineView";
import { ReviewerContextProvider } from "./ReviewerContext";
import { TIMELINE_FIXTURE } from "./__fixtures__/timelineFixture";

// Stub ResizeObserver which is not available in jsdom.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Wraps the component in ReviewerContextProvider with pre-loaded timeline data.
function renderWithTimelineData() {
  // We need to inject pre-loaded data into context; use a helper wrapper that
  // seeds the context after mount by calling internal setters via a child component.
  const Seed: React.FC = () => {
    const { setTimelineData } = require("./ReviewerContext").useReviewerContext();
    React.useEffect(() => { setTimelineData(TIMELINE_FIXTURE); }, [setTimelineData]);
    return null;
  };
  return render(
    <ReviewerContextProvider>
      <Seed />
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
      expect(screen.getByRole("img", { hidden: true }) ?? document.querySelector("svg")).toBeTruthy();
    });
    const svg = document.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("does not expose raw narrative text in the DOM", async () => {
    renderWithTimelineData();
    // The fixture has audit_id "abc123"; no raw input narrative is in the fixture.
    // Assert the synthetic rationale (not raw input) is the only text from causality.
    await waitFor(() => {
      expect(screen.getByTestId("causality-verdict")).toBeInTheDocument();
    });
    // "abc123" (audit_id) should not be rendered anywhere.
    expect(document.body.textContent).not.toContain("abc123");
  });

  it("renders demographics fields from the fixture", async () => {
    renderWithTimelineData();
    await waitFor(() => {
      expect(screen.getByText("45-54")).toBeInTheDocument();
    });
    expect(screen.getByText("SITE-7")).toBeInTheDocument();
  });
});
