// Tests for pane collapse/expand behavior via useLayoutState.
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { LayoutProvider, useLayoutState } from "../layout/useLayoutState";

// Wrap hook in provider for all tests.
const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <LayoutProvider>{children}</LayoutProvider>
);

describe("Pane collapse/expand", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("left pane starts non-collapsed in analyst default layout", () => {
    const { result } = renderHook(() => useLayoutState(), { wrapper });
    expect(result.current.layout.panes.left.collapsed).toBe(false);
  });

  it("toggling collapse sets collapsed to true", () => {
    const { result } = renderHook(() => useLayoutState(), { wrapper });
    act(() => {
      result.current.toggleCollapse("left");
    });
    expect(result.current.layout.panes.left.collapsed).toBe(true);
  });

  it("toggling collapse twice returns to original state", () => {
    const { result } = renderHook(() => useLayoutState(), { wrapper });
    act(() => {
      result.current.toggleCollapse("right");
    });
    act(() => {
      result.current.toggleCollapse("right");
    });
    expect(result.current.layout.panes.right.collapsed).toBe(false);
  });

  it("collapsing left pane does not affect main pane", () => {
    const { result } = renderHook(() => useLayoutState(), { wrapper });
    const mainCollapsedBefore = result.current.layout.panes.main.collapsed;
    act(() => {
      result.current.toggleCollapse("left");
    });
    expect(result.current.layout.panes.main.collapsed).toBe(mainCollapsedBefore);
  });

  it("setPaneWidths updates all three pane widths", () => {
    const { result } = renderHook(() => useLayoutState(), { wrapper });
    act(() => {
      result.current.setPaneWidths({ left: 20, main: 50, right: 30 });
    });
    expect(result.current.layout.panes.left.width).toBe(20);
    expect(result.current.layout.panes.main.width).toBe(50);
    expect(result.current.layout.panes.right.width).toBe(30);
  });
});
