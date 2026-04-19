// PersonaLayouts: defines the default pane layout presets for each persona.
import type { ViewId, PaneSlot, PersonaId } from "./ViewRegistry";

// State for a single pane: which view is shown, how wide, and whether collapsed.
export interface PaneState {
  viewId: ViewId;
  width: number;   // percentage of total splitter width (0–100)
  collapsed: boolean;
}

// Full layout for a persona: three panes plus dock state.
export interface LayoutPreset {
  persona: PersonaId;
  panes: Record<PaneSlot, PaneState>;
  bottomDockExpanded: boolean;
  bottomDockHeightPct: number; // clamped 8–60; default 4 collapsed, 18 expanded
}

// Default layout for the Analyst persona.
export const ANALYST_DEFAULT: LayoutPreset = {
  persona: "analyst",
  panes: {
    left: { viewId: "dataset-preview", width: 25, collapsed: false },
    main: { viewId: "chat", width: 45, collapsed: false },
    right: { viewId: "dashboard", width: 30, collapsed: false },
  },
  bottomDockExpanded: false,
  bottomDockHeightPct: 4,
};

// Default layout for the Reviewer persona.
export const REVIEWER_DEFAULT: LayoutPreset = {
  persona: "reviewer",
  panes: {
    left: { viewId: "narrative-input", width: 25, collapsed: false },
    main: { viewId: "case-timeline", width: 45, collapsed: false },
    right: { viewId: "signal-map", width: 30, collapsed: false },
  },
  bottomDockExpanded: false,
  bottomDockHeightPct: 4,
};

// Map from persona to its factory default layout.
export const DEFAULT_LAYOUTS: Record<PersonaId, LayoutPreset> = {
  analyst: ANALYST_DEFAULT,
  reviewer: REVIEWER_DEFAULT,
};

// Build the localStorage key for a given persona.
export function layoutStorageKey(persona: PersonaId): string {
  return `ngsp.layout.${persona}`;
}

// Load a saved layout for a persona from localStorage, returning null if none.
export function loadLayout(persona: PersonaId): LayoutPreset | null {
  try {
    const raw = localStorage.getItem(layoutStorageKey(persona));
    if (!raw) return null;
    return JSON.parse(raw) as LayoutPreset;
  } catch {
    return null;
  }
}

// Persist a layout for a persona to localStorage.
export function saveLayout(layout: LayoutPreset): void {
  try {
    localStorage.setItem(layoutStorageKey(layout.persona), JSON.stringify(layout));
  } catch {
    // localStorage unavailable in some test environments — ignore silently
  }
}
