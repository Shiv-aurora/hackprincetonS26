// Context-aware MCP action chips rendered beneath workflow outputs.
import React, { useState, useCallback } from "react";
import {
  dispatchEmail,
  dispatchCalendar,
  dispatchVaultSafety,
  dispatchRaveEDC,
  dispatchArgus,
} from "../lib/mcp";
import type { MCPDispatchResponse } from "../lib/mcp";

/** Which workflow context is requesting export actions. */
export interface ExportActionsProps {
  context: "timeline" | "signal" | "dashboard" | "chat";
  /** Optional audit ref from the most recent relevant API call. */
  auditRef?: string;
}

// Possible chip display states.
type ChipState = "idle" | "sending" | "success" | "not_configured" | "error";

/** Definition of a single MCP export chip. */
interface ChipDef {
  label: string;
  action: string;
  dispatch: (action: string, auditRef: string) => Promise<MCPDispatchResponse>;
}

// Map each context to its set of chips.
const CONTEXT_CHIPS: Record<ExportActionsProps["context"], ChipDef[]> = {
  timeline: [
    {
      label: "Flag to medical monitor",
      action: "flag_medical_monitor",
      dispatch: dispatchEmail,
    },
    {
      label: "Hold in calendar",
      action: "hold_medical_monitor_meeting",
      dispatch: dispatchCalendar,
    },
    {
      label: "File to Vault Safety",
      action: "file_case",
      dispatch: dispatchVaultSafety,
    },
  ],
  signal: [
    {
      label: "Alert safety team",
      action: "alert_safety_team",
      dispatch: dispatchEmail,
    },
    {
      label: "Schedule signal review",
      action: "schedule_signal_review",
      dispatch: dispatchCalendar,
    },
    {
      label: "File to Argus",
      action: "file_signal",
      dispatch: dispatchArgus,
    },
  ],
  dashboard: [
    {
      label: "Send to CMO",
      action: "send_to_cmo",
      dispatch: dispatchEmail,
    },
    {
      label: "Schedule stakeholder review",
      action: "schedule_stakeholder_review",
      dispatch: dispatchCalendar,
    },
    {
      label: "File to SharePoint",
      action: "file_to_sharepoint",
      dispatch: dispatchRaveEDC,
    },
  ],
  chat: [
    {
      label: "Share summary",
      action: "share_summary",
      dispatch: dispatchEmail,
    },
  ],
};

// Returns CSS background color for a chip based on its current state.
function chipBackground(state: ChipState): string {
  switch (state) {
    case "success":
      return "rgba(106,153,85,0.25)";
    case "error":
      return "rgba(244,135,113,0.25)";
    case "not_configured":
      return "rgba(255,255,255,0.04)";
    default:
      // idle + sending: surface-2 equivalent
      return "rgba(255,255,255,0.06)";
  }
}

// Returns the label text displayed on the chip for a given state.
function chipLabel(state: ChipState, original: string): string {
  switch (state) {
    case "sending":
      return "Sending…";
    case "success":
      return `✓ ${original}`;
    default:
      return original;
  }
}

/** Single MCP export chip with loading, success, error, and not-configured states. */
const ExportChip: React.FC<{
  def: ChipDef;
  auditRef: string;
}> = ({ def, auditRef }) => {
  const [chipState, setChipState] = useState<ChipState>("idle");
  const [chipMessage, setChipMessage] = useState<string | undefined>(undefined);

  // Dispatch the MCP action and handle all result states.
  const handleClick = useCallback(async () => {
    if (chipState !== "idle") return;
    setChipState("sending");
    setChipMessage(undefined);
    try {
      const result = await def.dispatch(def.action, auditRef);
      setChipMessage(result.receipt.message);
      if (result.status === "sent") {
        setChipState("success");
        setTimeout(() => setChipState("idle"), 3000);
      } else if (result.status === "not_configured") {
        setChipState("not_configured");
      } else {
        setChipState("error");
        setTimeout(() => setChipState("idle"), 2000);
      }
    } catch {
      setChipMessage("Connector request failed before a receipt was returned.");
      setChipState("error");
      setTimeout(() => setChipState("idle"), 2000);
    }
  }, [chipState, def, auditRef]);

  const isDisabled =
    chipState === "sending" ||
    chipState === "not_configured" ||
    chipState === "success";

  const tooltipText = chipMessage;

  const chipStyle: React.CSSProperties = {
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 13,
    fontFamily: "var(--font-sans)",
    border: "1px solid rgba(255,255,255,0.08)",
    background: chipBackground(chipState),
    color:
      chipState === "error"
        ? "var(--color-error)"
        : chipState === "success"
        ? "#6a9955"
        : "#d4d9df",
    cursor: isDisabled ? "not-allowed" : "pointer",
    opacity: isDisabled && chipState !== "success" ? 0.5 : 1,
    transition: "background 300ms, color 300ms, opacity 300ms",
    outline: "none",
    whiteSpace: "nowrap",
    flexShrink: 0,
  };

  return (
    <button
      style={chipStyle}
      onClick={() => void handleClick()}
      disabled={isDisabled}
      title={tooltipText}
      aria-label={`${def.label}${chipState === "not_configured" ? " (not configured)" : ""}`}
    >
      {chipLabel(chipState, def.label)}
    </button>
  );
};

/** Row of MCP export chips appropriate for the given workflow context. */
export const ExportActions: React.FC<ExportActionsProps> = ({
  context,
  auditRef = "",
}) => {
  const chips = CONTEXT_CHIPS[context];

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        marginTop: 16,
      }}
    >
      {chips.map((chip) => (
        <ExportChip key={chip.action} def={chip} auditRef={auditRef} />
      ))}
    </div>
  );
};
