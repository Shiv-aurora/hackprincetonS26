# Demo SAE Narrative

This is the canonical demo input used throughout the product build (frontend paste
target, backend integration tests, end-to-end video walkthrough). It is synthetic
and contains no real PHI, but it is structurally realistic: a Serious Adverse Event
narrative touching all three sensitivity tiers the system is designed to defend
against.

- **PHI (HIPAA 18 identifiers):** subject ID, age, site name, enrollment date, DSMB
  meeting date.
- **IP (internal intellectual property):** compound codename, site number, dose,
  indication, AE grade, study day timing.
- **MNPI (material non-public information):** preliminary efficacy value,
  amendment rationale, regulator-facing safety signal, DSMB discussion.

## Narrative

```
Subject 04-0023, a 68-year-old female at Site 104 (Princeton Regional Oncology), was enrolled in Study BMS-986253-301 on 14-MAR-2024. Following administration of investigational product BMS-986253 at 50mg on study day 1, the subject developed Grade 4 thrombocytopenia (platelet count 18,000/µL) on study day 14. Per protocol Amendment 4, dose was reduced from 50mg to 25mg cohort-wide due to this safety signal. Preliminary efficacy analysis in cohort 2 showed 34% ORR, below the 45% target, which was discussed in the DSMB meeting on 22-APR-2024.
```

## Expected routing (for reviewer sanity)

- This narrative is MNPI-heavy (preliminary efficacy, amendment rationale). Under
  the current `router.py`, it is expected to route to `dp_tolerant`, matching the
  behavior observed in `experiments/results/route_distribution.json` for the SAE
  corpus.
- The frontend should render subject/age/site/date spans as PHI (red), compound and
  dose as IP (amber), and ORR / amendment rationale / DSMB discussion as MNPI
  (violet) once the three-tier entity extractor is wired in Step 2.
