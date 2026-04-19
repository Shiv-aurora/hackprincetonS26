// useLayoutState: React context and hook managing per-persona pane layout with localStorage persistence.
import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { ViewId, PaneSlot, PersonaId } from "./ViewRegistry";
import type { LayoutPreset, PaneState } from "./PersonaLayouts";
import { DEFAULT_LAYOUTS, loadLayout, saveLayout } from "./PersonaLayouts";

// Shape of the context value consumed by all layout-aware components.
interface LayoutContextValue {
  layout: LayoutPreset;
  persona: PersonaId;
  /** Switch to another persona, saving the current layout first. */
  setPersona: (persona: PersonaId) => void;
  /** Change which view is shown in a pane. */
  setPaneView: (slot: PaneSlot, viewId: ViewId) => void;
  /** Toggle a pane's collapsed state. */
  toggleCollapse: (slot: PaneSlot) => void;
  /** Toggle bottom dock open/closed. */
  toggleDock: () => void;
  /** Update bottom dock height percentage (clamped 8–60). */
  setDockHeight: (pct: number) => void;
  /** The pane that currently has keyboard focus. */
  focusedPane: PaneSlot;
  /** Programmatically move keyboard focus to a pane. */
  setFocusedPane: (slot: PaneSlot) => void;
  /** Update a pane's width percentage (renormalization happens in SplitterGroup). */
  setPaneWidths: (widths: Record<PaneSlot, number>) => void;
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

// Produce the initial layout: load from localStorage if present, otherwise use default.
function resolveInitialLayout(persona: PersonaId): LayoutPreset {
  return loadLayout(persona) ?? DEFAULT_LAYOUTS[persona];
}

// Provider component wrapping the application to supply layout state.
export const LayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [persona, setPersonaState] = useState<PersonaId>("analyst");
  const [layout, setLayout] = useState<LayoutPreset>(() => resolveInitialLayout("analyst"));
  const [focusedPane, setFocusedPane] = useState<PaneSlot>("main");

  // Persist layout to localStorage whenever it changes.
  useEffect(() => {
    saveLayout(layout);
  }, [layout]);

  // Switch persona: save current layout, load (or default) new persona's layout.
  const setPersona = useCallback((next: PersonaId) => {
    setLayout((current) => {
      saveLayout(current);
      return resolveInitialLayout(next);
    });
    setPersonaState(next);
  }, []);

  // Replace the view shown in one pane without touching others.
  const setPaneView = useCallback((slot: PaneSlot, viewId: ViewId) => {
    setLayout((prev) => ({
      ...prev,
      panes: {
        ...prev.panes,
        [slot]: { ...prev.panes[slot], viewId },
      },
    }));
  }, []);

  // Toggle the collapsed flag for a pane.
  const toggleCollapse = useCallback((slot: PaneSlot) => {
    setLayout((prev) => ({
      ...prev,
      panes: {
        ...prev.panes,
        [slot]: { ...prev.panes[slot], collapsed: !prev.panes[slot].collapsed },
      },
    }));
  }, []);

  // Flip the bottom dock open/closed.
  const toggleDock = useCallback(() => {
    setLayout((prev) => ({
      ...prev,
      bottomDockExpanded: !prev.bottomDockExpanded,
      bottomDockHeightPct: prev.bottomDockExpanded ? 4 : 18,
    }));
  }, []);

  // Clamp and apply a new dock height percentage.
  const setDockHeight = useCallback((pct: number) => {
    const clamped = Math.max(8, Math.min(60, pct));
    setLayout((prev) => ({ ...prev, bottomDockHeightPct: clamped }));
  }, []);

  // Apply new pane widths (set by SplitterGroup after drag renormalization).
  const setPaneWidths = useCallback((widths: Record<PaneSlot, number>) => {
    setLayout((prev) => ({
      ...prev,
      panes: {
        left: { ...prev.panes.left, width: widths.left },
        main: { ...prev.panes.main, width: widths.main },
        right: { ...prev.panes.right, width: widths.right },
      },
    }));
  }, []);

  return (
    <LayoutContext.Provider
      value={{
        layout,
        persona,
        setPersona,
        setPaneView,
        toggleCollapse,
        toggleDock,
        setDockHeight,
        focusedPane,
        setFocusedPane,
        setPaneWidths,
      }}
    >
      {children}
    </LayoutContext.Provider>
  );
};

// Hook that components use to access layout state — throws if used outside LayoutProvider.
export function useLayoutState(): LayoutContextValue {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error("useLayoutState must be used inside <LayoutProvider>");
  return ctx;
}

// Re-export PaneState for convenience so importers only need one import site.
export type { PaneState };
