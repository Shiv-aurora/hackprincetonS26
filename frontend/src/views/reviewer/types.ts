// Shared TypeScript types for all reviewer-persona views and hooks.

// Response shape from /api/timeline/assemble.
export interface TimelineResponse {
  demographics: {
    age_band: string;
    sex: string;
    site_id_placeholder: string;
  };
  tracks: {
    event: Array<{ day: number; grade: 1 | 2 | 3 | 4 | 5; label: string }>;
    dosing: Array<{
      day: number;
      kind: "dose" | "dechallenge" | "rechallenge";
      dose_mg?: number;
      half_life_days?: number;
    }>;
    conmeds: Array<{ start_day: number; end_day: number; drug_placeholder: string }>;
    labs: {
      series_name: string;
      points: [number, number][];
      lower_threshold?: number;
      upper_threshold?: number;
    };
  };
  annotations: Array<{
    kind: string;
    text: string;
    anchor_track: string;
    anchor_day?: number;
  }>;
  causality: { verdict: string; rationale: string };
  audit_id: string;
}

// Response shape from /api/signal/cluster.
export interface SignalResponse {
  events: Array<{
    site: string;
    day: number;
    grade: 1 | 2 | 3 | 4 | 5;
    case_id_placeholder: string;
  }>;
  clusters: Array<{
    hull: [number, number][];
    member_indices: number[];
    density_score: number;
  }>;
  current_case_position: [string, number];
  hypothesis: string;
  recommended_actions: string[];
  audit_id: string;
}
