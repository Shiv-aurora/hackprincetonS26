// Tests for keyboard shortcut dispatch — verifies that key events trigger correct layout actions.
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { LayoutProvider, useLayoutState } from "../layout/useLayoutState";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

// Combined hook that registers shortcuts and exposes layout state.
function useTestHook() {
  useKeyboardShortcuts();
  return useLayoutState();
}

// Wrapper providing the layout context.
const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <LayoutProvider>{children}</LayoutProvider>
);

// Fire a keyboard event with the Cmd/Ctrl modifier.
function fireKey(key: string, shift = false) {
  const isMac = navigator.platform.toUpperCase().startsWith("MAC");
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      metaKey: isMac,
      ctrlKey: !isMac,
      shiftKey: shift,
      bubbles: true,
    })
  );
}

describe("Keyboard shortcuts", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("Cmd+1 sets focused pane to left", () => {
    const { result } = renderHook(() => useTestHook(), { wrapper });
    act(() => {
      fireKey("1");
    });
    expect(result.current.focusedPane).toBe("left");
  });

  it("Cmd+2 sets focused pane to main", () => {
    const { result } = renderHook(() => useTestHook(), { wrapper });
    act(() => {
      result.current.setFocusedPane("left"); // set to known state first
    });
    act(() => {
      fireKey("2");
    });
    expect(result.current.focusedPane).toBe("main");
  });

  it("Cmd+3 sets focused pane to right", () => {
    const { result } = renderHook(() => useTestHook(), { wrapper });
    act(() => {
      fireKey("3");
    });
    expect(result.current.focusedPane).toBe("right");
  });

  it("Cmd+J toggles bottom dock", () => {
    const { result } = renderHook(() => useTestHook(), { wrapper });
    const before = result.current.layout.bottomDockExpanded;
    act(() => {
      fireKey("j");
    });
    expect(result.current.layout.bottomDockExpanded).toBe(!before);
  });

  it("Cmd+Shift+A switches to analyst persona", () => {
    const { result } = renderHook(() => useTestHook(), { wrapper });
    // Switch to reviewer first.
    act(() => {
      result.current.setPersona("reviewer");
    });
    act(() => {
      fireKey("A", true);
    });
    expect(result.current.persona).toBe("analyst");
  });

  it("Cmd+Shift+R switches to reviewer persona", () => {
    const { result } = renderHook(() => useTestHook(), { wrapper });
    act(() => {
      fireKey("R", true);
    });
    expect(result.current.persona).toBe("reviewer");
  });

  it("Cmd+\\ toggles left pane collapse", () => {
    const { result } = renderHook(() => useTestHook(), { wrapper });
    const before = result.current.layout.panes.left.collapsed;
    act(() => {
      fireKey("\\");
    });
    expect(result.current.layout.panes.left.collapsed).toBe(!before);
  });

  it("Cmd+Shift+\\ toggles right pane collapse", () => {
    const { result } = renderHook(() => useTestHook(), { wrapper });
    const before = result.current.layout.panes.right.collapsed;
    act(() => {
      fireKey("\\", true);
    });
    expect(result.current.layout.panes.right.collapsed).toBe(!before);
  });
});
