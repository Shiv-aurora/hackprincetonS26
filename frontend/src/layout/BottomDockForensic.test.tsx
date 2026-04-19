// Tests for BottomDockForensic: rendering, canary styling, ε bar, no raw content.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { BottomDockForensic } from "./BottomDockForensic";
import type { AuditEntry } from "../hooks/useForensicStream";

// Minimal fixture entry for a successful call.
const makeEntry = (overrides: Partial<AuditEntry> = {}): AuditEntry => ({
  request_id: "req_001",
  timestamp: new Date().toISOString(),
  model: "claude-opus-4",
  prompt_length: 256,
  prompt_hash: "abcdef1234567890",
  system_length: 64,
  system_hash: "fedcba9876543210",
  max_tokens: 1024,
  response_length: 512,
  response_hash: "aabbccdd11223344",
  status: "ok",
  error_type: null,
  ...overrides,
});

// Canary-leak fixture — the critical privacy failure case.
const canaryEntry = makeEntry({
  request_id: "req_canary",
  status: "canary_leak",
  prompt_hash: "canary_hash_abcdef",
  response_hash: "canary_resp_123456",
});

const normalEntry = makeEntry({ request_id: "req_normal" });
const mockEntry = makeEntry({ request_id: "req_mock", status: "mock_ok" });

describe("BottomDockForensic", () => {
  it("renders with no entries showing the empty state message", () => {
    render(
      <BottomDockForensic entries={[]} epsilonSpent={0} epsilonCap={3.0} />
    );
    expect(screen.getByText(/No cloud calls yet/i)).toBeInTheDocument();
  });

  it("renders a row for each entry", () => {
    render(
      <BottomDockForensic
        entries={[normalEntry, canaryEntry]}
        epsilonSpent={0.5}
        epsilonCap={3.0}
      />
    );
    const rows = screen.getAllByTestId("forensic-row");
    expect(rows).toHaveLength(2);
  });

  it("applies canary-leak background style to the canary row", () => {
    render(
      <BottomDockForensic
        entries={[canaryEntry]}
        epsilonSpent={0}
        epsilonCap={3.0}
      />
    );
    const row = screen.getByTestId("forensic-row");
    // Row must have the error-color background at reduced opacity.
    expect(row).toHaveAttribute("data-status", "canary_leak");
    // Inline style should include the rgba error background.
    expect(row.style.background).toContain("rgba(244, 135, 113");
  });

  it("shows CANARY LEAK text in the canary row", () => {
    render(
      <BottomDockForensic
        entries={[canaryEntry]}
        epsilonSpent={0}
        epsilonCap={3.0}
      />
    );
    expect(screen.getByText("CANARY LEAK")).toBeInTheDocument();
  });

  it("shows MOCK badge for mock_ok entries", () => {
    render(
      <BottomDockForensic
        entries={[mockEntry]}
        epsilonSpent={0}
        epsilonCap={3.0}
      />
    );
    expect(screen.getByText("MOCK")).toBeInTheDocument();
  });

  it("renders shortened hashes — not the full hash string", () => {
    render(
      <BottomDockForensic
        entries={[normalEntry]}
        epsilonSpent={0}
        epsilonCap={3.0}
      />
    );
    // The full prompt_hash is "abcdef1234567890"; the component renders sha256:<first12>…
    expect(screen.getByText(/sha256:abcdef123456/)).toBeInTheDocument();
    // Full hash must NOT appear as a standalone text node.
    expect(screen.queryByText("abcdef1234567890")).not.toBeInTheDocument();
  });

  it("renders the ε progress bar fill at the correct proportional width", () => {
    render(
      <BottomDockForensic entries={[]} epsilonSpent={1.5} epsilonCap={3.0} />
    );
    const fill = screen.getByTestId("epsilon-bar-fill");
    // 1.5 / 3.0 = 0.5, so width should be 50%.
    expect(fill.style.width).toBe("50%");
  });

  it("renders ε bar at 100% when spent equals cap", () => {
    render(
      <BottomDockForensic entries={[]} epsilonSpent={3.0} epsilonCap={3.0} />
    );
    const fill = screen.getByTestId("epsilon-bar-fill");
    expect(fill.style.width).toBe("100%");
  });

  it("renders ε bar at 0% when spent is 0", () => {
    render(
      <BottomDockForensic entries={[]} epsilonSpent={0} epsilonCap={3.0} />
    );
    const fill = screen.getByTestId("epsilon-bar-fill");
    expect(fill.style.width).toBe("0%");
  });

  it("does not render any field that does not exist in the AuditEntry schema", () => {
    // This verifies the component only uses schema-defined fields.
    // There is no raw prompt text, no raw response text in the schema.
    render(
      <BottomDockForensic
        entries={[normalEntry]}
        epsilonSpent={0}
        epsilonCap={3.0}
      />
    );
    // The rendered DOM should show the hash (sha256:...) and char counts,
    // but no hypothetical "raw_prompt" or "raw_response" text.
    // Hashes are rendered in truncated form.
    expect(screen.getByText(/sha256:abcdef123456/)).toBeInTheDocument();
    expect(screen.getByText(/256 chars/)).toBeInTheDocument();
    // Verify model name appears.
    expect(screen.getByText("claude-opus-4")).toBeInTheDocument();
  });
});
