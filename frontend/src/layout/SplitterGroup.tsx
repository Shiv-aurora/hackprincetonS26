// SplitterGroup: renders three PaneContainers separated by two draggable 6 px dividers.
import React, { useRef, useCallback } from "react";
import type { PaneSlot, PersonaId } from "./ViewRegistry";
import type { LayoutPreset } from "./PersonaLayouts";
import { PaneContainer } from "./PaneContainer";
import { useLayoutState } from "./useLayoutState";

interface SplitterGroupProps {
  layout: LayoutPreset;
  persona: PersonaId;
}

// Minimum visible width in px for a non-collapsed pane.
const MIN_PANE_PX = 120;

// 6 px draggable divider between two adjacent panes.
const Divider: React.FC<{
  disabled: boolean;
  onDragStart: (e: React.PointerEvent) => void;
}> = ({ disabled, onDragStart }) => (
  <div
    onPointerDown={disabled ? undefined : onDragStart}
    style={{
      width: 6,
      flexShrink: 0,
      cursor: disabled ? "default" : "col-resize",
      userSelect: "none",
      background:
        "linear-gradient(180deg, transparent, rgba(255,255,255,0.03), transparent)",
      transition: "background 200ms ease, box-shadow 200ms ease",
      position: "relative",
      zIndex: 10,
    }}
    onMouseEnter={(e) => {
      if (!disabled) {
        (e.currentTarget as HTMLDivElement).style.background =
          "rgba(0,120,212,0.4)";
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 0 22px rgba(0,120,212,0.22)";
      }
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLDivElement).style.background =
        "linear-gradient(180deg, transparent, rgba(255,255,255,0.03), transparent)";
      (e.currentTarget as HTMLDivElement).style.boxShadow = "";
    }}
    aria-hidden="true"
  />
);

// Given three current widths and a delta on divider N (0=left, 1=right), compute new widths.
// Widths are in percentage points. Adjacent collapsed panes are not resized.
function applyDelta(
  widths: [number, number, number],
  dividerIndex: 0 | 1,
  deltaPx: number,
  totalPx: number,
  collapsed: [boolean, boolean, boolean]
): [number, number, number] {
  if (totalPx === 0) return widths;
  const deltaPct = (deltaPx / totalPx) * 100;
  const result: [number, number, number] = [...widths];

  if (dividerIndex === 0) {
    // Divider between left (0) and main (1).
    const newLeft = Math.max(0, result[0] + deltaPct);
    const newMain = Math.max(0, result[1] - deltaPct);
    if (newLeft + result[2] < 100 - 0.1 && newMain > 0 && newLeft > 0) {
      result[0] = newLeft;
      result[1] = newMain;
    }
  } else {
    // Divider between main (1) and right (2).
    const newMain = Math.max(0, result[1] + deltaPct);
    const newRight = Math.max(0, result[2] - deltaPct);
    if (result[0] + newRight < 100 - 0.1 && newMain > 0 && newRight > 0) {
      result[1] = newMain;
      result[2] = newRight;
    }
  }

  // Renormalize so widths sum to exactly 100.
  const sum = result[0] + result[1] + result[2];
  if (sum > 0) {
    result[0] = (result[0] / sum) * 100;
    result[1] = (result[1] / sum) * 100;
    result[2] = (result[2] / sum) * 100;
  }

  return result;
}

// Container holding the three panes with pointer-event-based drag resizing.
export const SplitterGroup: React.FC<SplitterGroupProps> = ({ layout, persona }) => {
  const { setPaneWidths } = useLayoutState();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ divider: 0 | 1; startX: number; startWidths: [number, number, number] } | null>(null);

  const slots: PaneSlot[] = ["left", "main", "right"];
  const collapsedArr: [boolean, boolean, boolean] = [
    layout.panes.left.collapsed,
    layout.panes.main.collapsed,
    layout.panes.right.collapsed,
  ];
  const widthArr: [number, number, number] = [
    layout.panes.left.width,
    layout.panes.main.width,
    layout.panes.right.width,
  ];

  // Divider 0 is non-draggable if either adjacent pane is collapsed.
  const divider0Disabled = collapsedArr[0] || collapsedArr[1];
  // Divider 1 is non-draggable if either adjacent pane is collapsed.
  const divider1Disabled = collapsedArr[1] || collapsedArr[2];

  // Begin drag — record the starting state.
  const handleDragStart = useCallback(
    (dividerIndex: 0 | 1) => (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = {
        divider: dividerIndex,
        startX: e.clientX,
        startWidths: [...widthArr] as [number, number, number],
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [widthArr[0], widthArr[1], widthArr[2]]
  );

  // During drag — compute new widths and push to state.
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const totalPx = containerRef.current.offsetWidth;
      const deltaPx = e.clientX - dragging.current.startX;
      const newWidths = applyDelta(
        dragging.current.startWidths,
        dragging.current.divider,
        deltaPx,
        totalPx,
        collapsedArr
      );
      setPaneWidths({ left: newWidths[0], main: newWidths[1], right: newWidths[2] });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collapsedArr[0], collapsedArr[1], collapsedArr[2], setPaneWidths]
  );

  // End drag.
  const handlePointerUp = useCallback(() => {
    dragging.current = null;
  }, []);

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        display: "flex",
        flex: 1,
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      {slots.map((slot, i) => {
        const pane = layout.panes[slot];
        return (
          <React.Fragment key={slot}>
            <PaneContainer
              slot={slot}
              viewId={pane.viewId}
              width={pane.width}
              collapsed={pane.collapsed}
              persona={persona}
            />
            {i < slots.length - 1 && (
              <Divider
                disabled={i === 0 ? divider0Disabled : divider1Disabled}
                onDragStart={handleDragStart(i as 0 | 1)}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
