// ViewRegistry: central registry mapping view IDs to their definitions and valid pane placements.
import type React from "react";

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

// Props passed to every view component by PaneContainer.
export interface ViewProps {
  paneSlot: PaneSlot;
  persona: PersonaId;
}

// Persona identifiers for the two layout presets.
export type PersonaId = "analyst" | "reviewer";

// Contract describing a single view that can be placed in a pane.
export interface ViewDefinition {
  id: ViewId;
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ViewProps imported lazily to avoid circular imports
  component: React.FC<any>;
  validPanes: PaneSlot[];
  backendDeps: string[];
}

// Lazy-imported placeholder components to avoid circular deps at registry definition time.
// These are resolved at runtime via the getter below.
import { DatasetPreviewPlaceholder } from "./placeholders/DatasetPreviewPlaceholder";
import { ChatView } from "./placeholders/ChatView";
import { DashboardPlaceholder } from "./placeholders/DashboardPlaceholder";
import { NarrativeInputPlaceholder } from "./placeholders/NarrativeInputPlaceholder";
import { CaseTimelinePlaceholder } from "./placeholders/CaseTimelinePlaceholder";
import { SignalMapPlaceholder } from "./placeholders/SignalMapPlaceholder";

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
    component: NarrativeInputPlaceholder,
    validPanes: ["left"],
    backendDeps: ["/api/analyze", "/api/proxy"],
  },
  "case-timeline": {
    id: "case-timeline",
    title: "Case Timeline",
    component: CaseTimelinePlaceholder,
    validPanes: ["main", "right"],
    backendDeps: ["/api/timeline/assemble"],
  },
  "signal-map": {
    id: "signal-map",
    title: "Signal Detection",
    component: SignalMapPlaceholder,
    validPanes: ["main", "right"],
    backendDeps: ["/api/signal/cluster"],
  },
};
