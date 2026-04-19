// ViewRegistry: central registry mapping view IDs to their definitions and valid pane placements.
import type React from "react";
import { DatasetPreviewView } from "../views/analyst/DatasetPreviewView";
import { DashboardView } from "../views/analyst/DashboardView";
import { ChatView } from "./placeholders/ChatView";
import NarrativeInputView from "../views/reviewer/NarrativeInputView";
import CaseTimelineView from "../views/reviewer/CaseTimelineView";
import SignalMapView from "../views/reviewer/SignalMapView";

// All named view identifiers used in the layout system.
export type ViewId =
  | "dataset-preview"
  | "chat"
  | "dashboard"
  | "narrative-input"
  | "case-timeline"
  | "signal-map";

// The three horizontal pane slots in the three-pane layout.
export type PaneSlot = "left" | "main" | "right";

// Persona identifiers for the two layout presets.
export type PersonaId = "analyst" | "reviewer";

// Props passed to every view component by PaneContainer.
export interface ViewProps {
  paneSlot: PaneSlot;
  persona: PersonaId;
}

// Contract describing a single view that can be placed in a pane.
export interface ViewDefinition {
  id: ViewId;
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ViewProps used via React.FC<any> to avoid importing ViewProps in registry (circular)
  component: React.FC<any>;
  validPanes: PaneSlot[];
  backendDeps: string[];
}

// Registry mapping every ViewId to its full definition.
export const VIEW_REGISTRY: Record<ViewId, ViewDefinition> = {
  "dataset-preview": {
    id: "dataset-preview",
    title: "Dataset",
    component: DatasetPreviewPlaceholder,
    validPanes: ["left", "main"],
    backendDeps: ["/api/dataset/query"],
  },
  "chat": {
    id: "chat",
    title: "Assistant",
    component: ChatView,
    validPanes: ["main", "right"],
    backendDeps: ["/api/complete", "/api/route"],
  },
  "dashboard": {
    id: "dashboard",
    title: "Dashboard",
    component: DashboardPlaceholder,
    validPanes: ["main", "right"],
    backendDeps: ["/api/dashboard/generate"],
  },
  "narrative-input": {
    id: "narrative-input",
    title: "Narrative",
    component: NarrativeInputView,
    validPanes: ["left"],
    backendDeps: ["/api/timeline/assemble"],
  },
  "case-timeline": {
    id: "case-timeline",
    title: "Case Timeline",
    component: CaseTimelineView,
    validPanes: ["main", "right"],
    backendDeps: ["/api/timeline/assemble"],
  },
  "signal-map": {
    id: "signal-map",
    title: "Signal Detection",
    component: SignalMapView,
    validPanes: ["main", "right"],
    backendDeps: ["/api/signal/cluster"],
  },
};
