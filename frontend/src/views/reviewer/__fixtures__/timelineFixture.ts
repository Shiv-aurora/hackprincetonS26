// Static fixture used in reviewer view tests.
import type { TimelineResponse } from "../types";

// Synthetic timeline fixture — no real PHI, no real compound codenames.
export const TIMELINE_FIXTURE: TimelineResponse = {
  demographics: { age_band: "45-54", sex: "F", site_id_placeholder: "SITE-7" },
  tracks: {
    event: [
      { day: 5, grade: 3, label: "Rash onset" },
      { day: 12, grade: 4, label: "Progression" },
    ],
    dosing: [
      { day: 1, kind: "dose", dose_mg: 50, half_life_days: 24 },
      { day: 10, kind: "dechallenge" },
    ],
    conmeds: [{ start_day: 0, end_day: 20, drug_placeholder: "DRUG_1" }],
    labs: {
      series_name: "ALT",
      points: [
        [1, 12],
        [5, 45],
        [10, 78],
        [15, 34],
      ],
      lower_threshold: 40,
      upper_threshold: 120,
    },
  },
  annotations: [
    { kind: "onset_latency", text: "4 days post-dose", anchor_track: "event", anchor_day: 5 },
    { kind: "dechallenge", text: "Drug stopped day 10", anchor_track: "dosing", anchor_day: 10 },
  ],
  causality: { verdict: "probable", rationale: "Temporal relationship supports causality." },
  audit_id: "abc123",
};
