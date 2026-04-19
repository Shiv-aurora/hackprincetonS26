// Tests for useLayoutState: persona switching, localStorage persistence, pane operations.
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { LayoutProvider, useLayoutState } from "../layout/useLayoutState";
import { layoutStorageKey } from "../layout/PersonaLayouts";

// Wrap the hook in LayoutProvider for all tests.
const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <LayoutProvider>{children}</LayoutProvider>
);

describe("useLayoutState", () => {
  beforeEach(() => {
    // Clear localStorage before each test to ensure isolation.
    localStorage.clear();
  });

  it("starts on the analyst persona by default", () => {
    const { result } = renderHook(() => useLayoutState(), { wrapper });
    expect(result.current.persona).toBe("analyst");
  });

  it("switches persona and saves previous layout to localStorage", () => {
    const { result } = renderHook(() => useLayoutState(), { wrapper });
    act(() => {
      result.current.setPersona("reviewer");
    });
    expect(result.current.persona).toBe("reviewer");
    // Analyst layout should have been saved.
    const saved = localStorage.getItem(layoutStorageKey("analyst"));
    expect(saved).not.toBeNull();
  });

  it("restores saved layout when switching back to a persona", () => {
    const { result } = renderHook(() => useLayoutState(), { wrapper });

    // Mutate analyst layout, then switch away and back.
    act(() => {
      result.current.setPaneView("left", "chat");
    });
    act(() => {
      result.current.setPersona("reviewer");
    });
    act(() => {
      result.current.setPersona("analyst");
    });
    // The mutated analyst view should be restored from localStorage.
    expect(result.current.layout.panes.left.viewId).toBe("chat");
  });

  it("toggles pane collapse state", () => {
    const { result } = renderHook(() => useLayoutState(), { wrapper });
    const initialCollapsed = result.current.layout.panes.left.collapsed;
    act(() => {
      result.current.toggleCollapse("left");
    });
    expect(result.current.layout.panes.left.collapsed).toBe(!initialCollapsed);
  });

  it("toggles bottom dock expanded state", () => {
    const { result } = renderHook(() => useLayoutState(), { wrapper });
    const initial = result.current.layout.bottomDockExpanded;
    act(() => {
      result.current.toggleDock();
    });
    expect(result.current.layout.bottomDockExpanded).toBe(!initial);
  });

  it("persists layout to localStorage on every change", () => {
    const { result } = renderHook(() => useLayoutState(), { wrapper });
    act(() => {
      result.current.setPaneView("main", "dashboard");
    });
    const raw = localStorage.getItem(layoutStorageKey("analyst"));
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.panes.main.viewId).toBe("dashboard");
  });

  it("clamps dock height between 8 and 60", () => {
    const { result } = renderHook(() => useLayoutState(), { wrapper });
    act(() => {
      result.current.setDockHeight(200);
    });
    expect(result.current.layout.bottomDockHeightPct).toBe(60);
    act(() => {
      result.current.setDockHeight(-5);
    });
    expect(result.current.layout.bottomDockHeightPct).toBe(8);
  });
});
