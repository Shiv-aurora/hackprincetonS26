// useKeyboardShortcuts: registers global keyboard shortcuts for pane navigation and persona switching.
import { useEffect } from "react";
import type { PaneSlot } from "../layout/ViewRegistry";
import { useLayoutState } from "../layout/useLayoutState";

// Returns true if the event has the OS-appropriate modifier key (Cmd on macOS, Ctrl elsewhere).
function hasPrimaryMod(e: KeyboardEvent): boolean {
  const isMac = navigator.platform.toUpperCase().startsWith("MAC");
  return isMac ? e.metaKey : e.ctrlKey;
}

// Wires all documented keyboard shortcuts to layout state actions.
export function useKeyboardShortcuts(): void {
  const {
    setFocusedPane,
    toggleDock,
    toggleCollapse,
    setPersona,
    focusedPane,
  } = useLayoutState();

  useEffect(() => {
    // Handle a keydown event and dispatch to the appropriate layout action.
    const handler = (e: KeyboardEvent) => {
      if (!hasPrimaryMod(e)) return;

      // Cmd+1 / Cmd+2 / Cmd+3: focus left / main / right pane.
      if (!e.shiftKey && e.key === "1") {
        e.preventDefault();
        setFocusedPane("left");
        return;
      }
      if (!e.shiftKey && e.key === "2") {
        e.preventDefault();
        setFocusedPane("main");
        return;
      }
      if (!e.shiftKey && e.key === "3") {
        e.preventDefault();
        setFocusedPane("right");
        return;
      }

      // Cmd+J: toggle bottom dock.
      if (!e.shiftKey && e.key === "j") {
        e.preventDefault();
        toggleDock();
        return;
      }

      // Cmd+\: collapse/expand left pane.
      if (!e.shiftKey && (e.key === "\\" || e.key === "|")) {
        e.preventDefault();
        toggleCollapse("left");
        return;
      }

      // Cmd+Shift+\: collapse/expand right pane.
      if (e.shiftKey && (e.key === "\\" || e.key === "|")) {
        e.preventDefault();
        toggleCollapse("right");
        return;
      }

      // Cmd+Shift+P: open view picker in focused pane — dispatches a custom DOM event
      // that PaneContainer listens for. Avoids prop drilling.
      if (e.shiftKey && e.key === "P") {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("ngsp:open-view-picker", { detail: { slot: focusedPane } })
        );
        return;
      }

      // Cmd+Shift+A: switch to Analyst persona.
      if (e.shiftKey && e.key === "A") {
        e.preventDefault();
        setPersona("analyst");
        return;
      }

      // Cmd+Shift+R: switch to Reviewer persona.
      if (e.shiftKey && e.key === "R") {
        e.preventDefault();
        setPersona("reviewer");
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setFocusedPane, toggleDock, toggleCollapse, setPersona, focusedPane]);
}

// Export the focused-pane type for consumers.
export type { PaneSlot };
