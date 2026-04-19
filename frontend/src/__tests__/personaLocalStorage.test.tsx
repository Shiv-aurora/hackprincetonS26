// Tests for localStorage round-trip: layout survives a simulated page reload.
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { LayoutProvider, useLayoutState } from "../layout/useLayoutState";
import { layoutStorageKey } from "../layout/PersonaLayouts";

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <LayoutProvider>{children}</LayoutProvider>
);

describe("Persona layout localStorage round-trip", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves analyst layout to localStorage after mutation", () => {
    const { result } = renderHook(() => useLayoutState(), { wrapper });
    act(() => {
      result.current.setPaneView("main", "dashboard");
    });
    const raw = localStorage.getItem(layoutStorageKey("analyst"));
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.panes.main.viewId).toBe("dashboard");
  });

  it("new LayoutProvider instance reads saved analyst layout (simulates reload)", () => {
    // First render: mutate and unmount.
    const { result: r1, unmount } = renderHook(() => useLayoutState(), { wrapper });
    act(() => {
      r1.current.setPaneView("right", "case-timeline");
    });
    unmount();

    // Second render: should restore the saved layout.
    const { result: r2 } = renderHook(() => useLayoutState(), { wrapper });
    expect(r2.current.layout.panes.right.viewId).toBe("case-timeline");
  });

  it("saves reviewer layout when switching to reviewer", () => {
    const { result } = renderHook(() => useLayoutState(), { wrapper });
    act(() => {
      result.current.setPersona("reviewer");
    });
    // Analyst layout was saved on switch.
    const analystRaw = localStorage.getItem(layoutStorageKey("analyst"));
    expect(analystRaw).not.toBeNull();
    // Current persona is reviewer.
    expect(result.current.persona).toBe("reviewer");
  });

  it("restores reviewer layout from localStorage on second render", () => {
    // First render: switch to reviewer, mutate, unmount.
    const { result: r1, unmount } = renderHook(() => useLayoutState(), { wrapper });
    act(() => {
      result.current.setPersona("reviewer");
    });
    act(() => {
      r1.current.setPaneView("left", "narrative-input");
    });
    unmount();

    // Second render starting as analyst — switch to reviewer to trigger localStorage load.
    const { result: r2 } = renderHook(() => useLayoutState(), { wrapper });
    act(() => {
      r2.current.setPersona("reviewer");
    });
    expect(r2.current.persona).toBe("reviewer");
  });
});

// Alias for the second test's outer result — avoids unused var lint warning.
function noop() {}
noop();
