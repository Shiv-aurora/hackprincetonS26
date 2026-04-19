// PaneContainer: renders one pane slot with a header, view-picker dropdown, and collapse toggle.
import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronsLeft, ChevronsRight } from "lucide-react";
import type { ViewId, PaneSlot, PersonaId } from "./ViewRegistry";
import { VIEW_REGISTRY } from "./ViewRegistry";
import { useLayoutState } from "./useLayoutState";

interface PaneContainerProps {
  slot: PaneSlot;
  viewId: ViewId;
  width: number;
  collapsed: boolean;
  persona: PersonaId;
}

// Returns all view IDs that declare the given pane slot as valid.
function viewsForSlot(slot: PaneSlot): ViewId[] {
  return (Object.keys(VIEW_REGISTRY) as ViewId[]).filter((id) =>
    VIEW_REGISTRY[id].validPanes.includes(slot)
  );
}

// Renders the collapsed strip (32 px wide) with an expand icon and rotated title.
const CollapsedStrip: React.FC<{ slot: PaneSlot; title: string; onExpand: () => void }> = ({
  slot,
  title,
  onExpand,
}) => {
  const icon = slot === "left" ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />;
  return (
    <div
      style={{
        width: 32,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        borderRight: slot === "left" ? "1px solid rgba(255,255,255,0.05)" : undefined,
        borderLeft: slot !== "left" ? "1px solid rgba(255,255,255,0.05)" : undefined,
        background: "rgba(15,18,22,0.98)",
      }}
    >
      <button
        onClick={onExpand}
        title={`Expand ${slot} pane`}
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#6b7480",
          cursor: "pointer",
          background: "none",
          border: "none",
          flexShrink: 0,
        }}
        aria-label={`Expand ${slot} pane`}
      >
        {icon}
      </button>
      <span
        style={{
          fontSize: 10,
          color: "#4b535b",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transform: "rotate(180deg)",
          marginTop: 8,
          letterSpacing: "0.12em",
          userSelect: "none",
          textTransform: "uppercase",
        }}
      >
        {title}
      </span>
    </div>
  );
};

// Dropdown picker listing views compatible with the current pane slot.
const ViewPicker: React.FC<{
  slot: PaneSlot;
  currentViewId: ViewId;
  onSelect: (id: ViewId) => void;
  open: boolean;
  onClose: () => void;
}> = ({ slot, currentViewId, onSelect, open, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const options = viewsForSlot(slot);

  // Close dropdown when clicking outside.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        zIndex: 60,
        minWidth: 180,
        background: "#12161b",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12,
        padding: "4px 0",
        boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
        marginTop: 4,
      }}
      role="listbox"
      aria-label="View picker"
    >
      {options.map((id) => {
        const def = VIEW_REGISTRY[id];
        const isActive = id === currentViewId;
        return (
          <button
            key={id}
            role="option"
            aria-selected={isActive}
            onClick={() => {
              onSelect(id);
              onClose();
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 14px",
              fontSize: 12,
              background: isActive ? "rgba(255,255,255,0.05)" : "none",
              color: isActive ? "#ffffff" : "#7d848b",
              cursor: "pointer",
              border: "none",
              transition: "background 100ms",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "rgba(255,255,255,0.04)";
              (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = isActive
                ? "rgba(255,255,255,0.05)"
                : "none";
              (e.currentTarget as HTMLButtonElement).style.color = isActive ? "#ffffff" : "#7d848b";
            }}
          >
            {def.title}
          </button>
        );
      })}
    </div>
  );
};

// Full pane container: header with view picker + collapse toggle, plus the active view.
export const PaneContainer: React.FC<PaneContainerProps> = ({
  slot,
  viewId,
  width,
  collapsed,
  persona,
}) => {
  const { setPaneView, toggleCollapse } = useLayoutState();
  const [pickerOpen, setPickerOpen] = useState(false);
  const def = VIEW_REGISTRY[viewId];
  const ViewComponent = def.component;

  // Collapsed state: render the thin strip instead of the full pane.
  if (collapsed) {
    return (
      <CollapsedStrip
        slot={slot}
        title={def.title}
        onExpand={() => toggleCollapse(slot)}
      />
    );
  }

  const collapseIcon = slot === "left" ? <ChevronsLeft size={13} /> : <ChevronsRight size={13} />;

  return (
    <div
      style={{
        width: `${width}%`,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRight: slot === "left" ? "1px solid rgba(255,255,255,0.05)" : undefined,
        borderLeft: slot === "right" ? "1px solid rgba(255,255,255,0.05)" : undefined,
        background: "rgba(15,18,22,0.98)",
        position: "relative",
      }}
    >
      {/* Pane header */}
      <div
        style={{
          height: 36,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 10px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(11,14,17,0.92)",
        }}
      >
        {/* View picker trigger */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setPickerOpen((v) => !v)}
            title="Switch view"
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 8px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 500,
              color: "#b2bac2",
              background: "none",
              border: "none",
              cursor: "pointer",
              letterSpacing: "0.01em",
              transition: "color 150ms",
            }}
          >
            {def.title}
            <ChevronDown size={11} style={{ opacity: 0.6, transform: pickerOpen ? "rotate(180deg)" : undefined, transition: "transform 150ms" }} />
          </button>
          <ViewPicker
            slot={slot}
            currentViewId={viewId}
            onSelect={(id) => setPaneView(slot, id)}
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
          />
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => toggleCollapse(slot)}
          title={`Collapse ${slot} pane`}
          aria-label={`Collapse ${slot} pane`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 6,
            color: "#4b535b",
            background: "none",
            border: "none",
            cursor: "pointer",
            transition: "color 150ms",
          }}
        >
          {collapseIcon}
        </button>
      </div>

      {/* View content */}
      <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
        <ViewComponent paneSlot={slot} persona={persona} />
      </div>
    </div>
  );
};
