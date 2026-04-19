// Tests for VIEW_REGISTRY: verifies valid pane assignments and registry completeness.
import { describe, it, expect } from "vitest";
import { VIEW_REGISTRY } from "../layout/ViewRegistry";
import type { ViewId, PaneSlot } from "../layout/ViewRegistry";

// All view IDs expected in the registry.
const ALL_VIEW_IDS: ViewId[] = [
  "dataset-preview",
  "chat",
  "dashboard",
  "narrative-input",
  "case-timeline",
  "signal-map",
];

const ALL_SLOTS: PaneSlot[] = ["left", "main", "right"];

describe("VIEW_REGISTRY", () => {
  it("contains all six view IDs", () => {
    for (const id of ALL_VIEW_IDS) {
      expect(VIEW_REGISTRY[id]).toBeDefined();
    }
  });

  it("dataset-preview is only valid in left and main panes", () => {
    const validPanes = VIEW_REGISTRY["dataset-preview"].validPanes;
    expect(validPanes).toContain("left");
    expect(validPanes).toContain("main");
    expect(validPanes).not.toContain("right");
  });

  it("narrative-input is only valid in the left pane", () => {
    const validPanes = VIEW_REGISTRY["narrative-input"].validPanes;
    expect(validPanes).toEqual(["left"]);
  });

  it("chat is valid in main and right panes", () => {
    const validPanes = VIEW_REGISTRY["chat"].validPanes;
    expect(validPanes).toContain("main");
    expect(validPanes).toContain("right");
    expect(validPanes).not.toContain("left");
  });

  it("every view has a non-empty title and component", () => {
    for (const id of ALL_VIEW_IDS) {
      const def = VIEW_REGISTRY[id];
      expect(def.title.length).toBeGreaterThan(0);
      expect(def.component).toBeDefined();
    }
  });

  it("every view declares at least one valid pane", () => {
    for (const id of ALL_VIEW_IDS) {
      expect(VIEW_REGISTRY[id].validPanes.length).toBeGreaterThan(0);
    }
  });

  it("all declared validPanes are recognized pane slots", () => {
    for (const id of ALL_VIEW_IDS) {
      for (const slot of VIEW_REGISTRY[id].validPanes) {
        expect(ALL_SLOTS).toContain(slot);
      }
    }
  });
});
