// Static fixture used in SignalMapView tests.
import type { SignalResponse } from "../types";

// Synthetic signal fixture — no real PHI, no real compound codenames.
export const SIGNAL_FIXTURE: SignalResponse = {
  events: [
    { site: "SITE-A", day: 10, grade: 2, case_id_placeholder: "CASE-001" },
    { site: "SITE-A", day: 14, grade: 3, case_id_placeholder: "CASE-002" },
    { site: "SITE-B", day: 20, grade: 2, case_id_placeholder: "CASE-003" },
    { site: "SITE-B", day: 22, grade: 4, case_id_placeholder: "CASE-004" },
    { site: "SITE-C", day: 35, grade: 1, case_id_placeholder: "CASE-005" },
  ],
  clusters: [
    {
      hull: [
        [10, 10],
        [14, 10],
        [12, 14],
      ],
      member_indices: [0, 1],
      density_score: 0.82,
    },
  ],
  current_case_position: ["SITE-B", 22],
  hypothesis:
    "Two cases at SITE-A within a short interval suggest a possible site-specific signal warranting investigation.",
  recommended_actions: [
    "Notify medical monitor at SITE-A",
    "Review concomitant medications for CASE-001 and CASE-002",
    "Schedule site visit within 14 days",
  ],
  audit_id: "sig-fixture-001",
};
