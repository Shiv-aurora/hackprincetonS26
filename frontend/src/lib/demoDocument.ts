// Canonical demo SAE narrative used as the pre-loaded document on first page render.
// Synthetic — no real PHI. Structurally realistic across all three sensitivity tiers.
export const DEMO_DOCUMENT =
  "Subject 04-0023, a 68-year-old female at Site 104 (Princeton Regional Oncology), " +
  "was enrolled in Study BMS-986253-301 on 14-MAR-2024. " +
  "Following administration of investigational product BMS-986253 at 50mg on study day 1, " +
  "the subject developed Grade 4 thrombocytopenia (platelet count 18,000/\u00b5L) on study day 14. " +
  "Per protocol Amendment 4, dose was reduced from 50mg to 25mg cohort-wide due to this safety signal. " +
  "Preliminary efficacy analysis in cohort 2 showed 34% ORR, below the 45% target, " +
  "which was discussed in the DSMB meeting on 22-APR-2024.";

export const DEMO_PROMPT = "Rewrite this in ICH E2B format.";
