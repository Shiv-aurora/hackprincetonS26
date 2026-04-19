// Canonical demo SAE narrative — synthetic, no real PHI.
export const DEMO_DOCUMENT =
  "Subject 04-0023, a 68-year-old female at Site 104 (Princeton Regional Oncology), " +
  "was enrolled in Study BMS-986253-301 on 14-MAR-2024. " +
  "Following administration of investigational product BMS-986253 at 50mg on study day 1, " +
  "the subject developed Grade 4 thrombocytopenia (platelet count 18,000/\u00b5L) on study day 14. " +
  "Per protocol Amendment 4, dose was reduced from 50mg to 25mg cohort-wide due to this safety signal. " +
  "Preliminary efficacy analysis in cohort 2 showed 34% ORR, below the 45% target, " +
  "which was discussed in the DSMB meeting on 22-APR-2024.";

export const DEMO_PROMPT = "Rewrite this in ICH E2B format.";

export type ModelId = "claude-opus-4" | "gpt-5" | "gemini-2";

export const MODEL_LABELS: Record<ModelId, string> = {
  "claude-opus-4": "Claude Opus 4",
  "gpt-5": "GPT-5",
  "gemini-2": "Gemini 2",
};

export interface DemoFile {
  content: string;
  language: string;
  prompt: string;
  /** Human-readable display name (no extension, no underscores) */
  label: string;
}

// Strip extension and underscores for a human display name.
export function formatFileName(raw: string): string {
  return raw
    .replace(/\.(txt|csv|json|md|pdf|docx|xlsx)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export const DEMO_FILES: Record<string, DemoFile> = {
  "SAE_Narrative_Draft_001.txt": {
    label: "SAE Narrative — Draft 001",
    content: DEMO_DOCUMENT,
    language: "plaintext",
    prompt: "Rewrite this in ICH E2B format.",
  },
  "patient_records.csv": {
    label: "Patient Records",
    language: "csv",
    content: `subject_id,age,sex,site_id,enrollment_date,compound,dose,ae_grade
SUBJ-001,68,F,Site 104,14-MAR-2024,BMS-986253,50mg,4
SUBJ-002,54,M,Site 107,22-APR-2024,BMS-986253,25mg,2
SUBJ-003,71,F,Site 104,01-MAY-2024,BMS-986253,25mg,1
SUBJ-004,62,M,Site 110,03-JUN-2024,BMS-986253,25mg,3`,
    prompt: "Summarize patient demographics and adverse event incidence by site.",
  },
  "extraction_rules.json": {
    label: "Extraction Rules",
    language: "json",
    content: `{
  "version": "2.1",
  "description": "NGSP entity extraction rules for clinical trial documents",
  "phi_patterns": [
    "subject_id", "date_of_birth",
    "site_name", "age", "geographic_subdivision"
  ],
  "ip_patterns": [
    "compound_code", "dose_level",
    "ae_grade", "study_day", "cycle_timing"
  ],
  "mnpi_patterns": [
    "efficacy_value", "amendment_detail",
    "dsmb_result", "interim_analysis"
  ]
}`,
    prompt: "Explain what types of sensitive information this extraction ruleset covers.",
  },
};
