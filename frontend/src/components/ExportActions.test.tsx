// Tests for ExportActions: chip count, MCP dispatch states, not_configured, sent.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { ExportActions } from "./ExportActions";
import type { MCPDispatchResponse } from "../lib/mcp";

// Helper to build a mock MCPDispatchResponse.
function mockResponse(status: MCPDispatchResponse["status"]): MCPDispatchResponse {
  return {
    status,
    receipt: {
      connector: "email",
      action: "test_action",
      external_id: status === "sent" ? "ext_123" : null,
      message: status === "sent" ? "Dispatched" : "Not configured",
    },
    audit_id: "audit_abc",
  };
}

describe("ExportActions — timeline context", () => {
  beforeEach(() => {
    // Reset fetch mock before each test.
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders 3 chips for the timeline context", () => {
    render(<ExportActions context="timeline" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
  });

  it("renders the correct chip labels for timeline", () => {
    render(<ExportActions context="timeline" />);
    expect(screen.getByText("Flag to medical monitor")).toBeInTheDocument();
    expect(screen.getByText("Hold in calendar")).toBeInTheDocument();
    expect(screen.getByText("File to Vault Safety")).toBeInTheDocument();
  });

  it("renders 1 chip for the chat context", () => {
    render(<ExportActions context="chat" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(screen.getByText("Share summary")).toBeInTheDocument();
  });

  it("renders 3 chips for the signal context", () => {
    render(<ExportActions context="signal" />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("renders 3 chips for the dashboard context", () => {
    render(<ExportActions context="dashboard" />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });
});

describe("ExportActions — chip interaction: not_configured", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse("not_configured"),
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("disables chip after receiving not_configured response", async () => {
    render(<ExportActions context="timeline" auditRef="audit_test" />);
    const btn = screen.getByText("Flag to medical monitor");
    fireEvent.click(btn);

    await waitFor(() => {
      // Chip should be disabled (not_configured state).
      const updated = screen.getByText("Flag to medical monitor");
      expect(updated.closest("button")).toBeDisabled();
    });
  });

  it("adds not-configured tooltip after receiving not_configured response", async () => {
    render(<ExportActions context="timeline" auditRef="audit_test" />);
    const btn = screen.getByText("Flag to medical monitor");
    fireEvent.click(btn);

    await waitFor(() => {
      const updated = screen.getByText("Flag to medical monitor").closest("button");
      expect(updated?.getAttribute("title")).toMatch(/not configured/i);
    });
  });
});

describe("ExportActions — chip interaction: sent", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse("sent"),
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows success state after a sent response", async () => {
    render(<ExportActions context="timeline" auditRef="audit_test" />);
    const btn = screen.getByText("Flag to medical monitor");
    fireEvent.click(btn);

    // Success label appears once the async dispatch resolves.
    await waitFor(() => {
      expect(screen.getByText(/✓ Flag to medical monitor/)).toBeInTheDocument();
    });
  });

  it("chip is disabled while in success state", async () => {
    render(<ExportActions context="timeline" auditRef="audit_test" />);
    const btn = screen.getByText("Flag to medical monitor");
    fireEvent.click(btn);

    await waitFor(() => {
      const successBtn = screen.getByText(/✓ Flag to medical monitor/).closest("button");
      expect(successBtn).toBeDisabled();
    });
  });
});

describe("ExportActions — chip interaction: sending state", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows sending state while dispatching", async () => {
    // Use a never-resolving fetch to freeze the chip in sending state.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => undefined))
    );
    render(<ExportActions context="timeline" />);
    const btn = screen.getByText("Flag to medical monitor");
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText("Sending…")).toBeInTheDocument();
    });
  });
});
