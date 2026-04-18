# `src/data/` — synthetic clinical-trial corpus

This package produces a labeled synthetic clinical-trial corpus used by the NGSP
pipeline's evaluation harness. Every document is generated from fixed templates
with randomized entity slots; every entity slot emits a ground-truth
`SensitiveSpan` so downstream attacks can be scored against an oracle.

**No real PHI, no real compound codenames, no real institutional identifiers
exist anywhere in this corpus. All content is clearly synthetic by
construction.**

## Record types

| Kind | Pydantic class | Generator | Default `n` | Default `seed` |
|---|---|---|---|---|
| Serious Adverse Event narrative | `SAENarrative` | `generate_sae_narratives` | 500 | 42 |
| Protocol excerpt (synopsis/eligibility/dosing/SAP) | `ProtocolExcerpt` | `generate_protocol_excerpts` | 200 | 43 |
| CRA monitoring visit report | `MonitoringReport` | `generate_monitoring_reports` | 200 | 44 |
| Clinical Study Report draft paragraph | `CSRDraft` | `generate_csr_drafts` | 300 | 45 |

Total default corpus: **1,200 documents** with **~16,800 ground-truth sensitive
spans**.

## Sensitive categories

`SensitiveCategory` (`schemas.py`) enumerates 28 categories organized into three
groups:

- **HIPAA Safe Harbor 18**: `name`, `geographic_subdivision`, `date`, `phone`,
  `fax`, `email`, `ssn`, `mrn`, `health_plan_beneficiary`, `account`,
  `certificate_license`, `vehicle_id`, `device_id`, `url`, `ip`, `biometric`,
  `photo`, `other_unique_id`.
- **Quasi-identifiers**: `compound_code`, `site_id`, `dose`, `indication`,
  `efficacy_value`, `ae_grade`, `timing`.
- **Material Non-Public Information**: `interim_result`, `amendment_rationale`,
  `regulatory_question`.

The Safe Harbor subset is also exposed as the module-level frozensets
`HIPAA_SAFE_HARBOR_CATEGORIES`, `QUASI_IDENTIFIER_CATEGORIES`, and
`MNPI_CATEGORIES`.

## Determinism

- Every module pins `random.seed(42)` at import time.
- Every generator accepts a `seed: int` parameter and uses only a
  `random.Random(seed)` instance internally, so repeated calls with the same
  seed produce byte-identical text and span sequences.
- Test `tests/test_mock_data.py::test_deterministic_seed_reproduces_text`
  enforces this.

## Usage

```python
from data.synthetic_sae import generate_sae_narratives
from data.annotator import annotate, validate_spans
from data.canary import inject_canary_doc

# Produce 500 SAE narratives with default seed.
sae = generate_sae_narratives()

# The oracle span list for a document.
spans = annotate(sae[0])
validate_spans(sae[0].text, spans)  # raises if offsets are inconsistent.

# Inject a unique canary before sending through the pipeline.
tagged_doc, canary = inject_canary_doc(sae[0])
```

## Example SAE (truncated)

```
CONFIDENTIAL — SAE NARRATIVE (synthetic test data)

Subject PT-9250-195 (MRN MRN-39345092), a 44-year-old female, enrolled at
SITE-9250 — Fakewood Cancer Center (Testburg) under protocol SYN-5506-1-792
for refractory rheumatoid arthritis experienced a serious adverse event of
febrile neutropenia (Grade 4) on 07-DEC-2026. The subject had initiated
SYN-5506 at a dose of 2.0 mg/kg IV Q2W on 14-APR-2024.
...
```

Every bolded-looking entity above (`PT-9250-195`, `MRN-39345092`, `SITE-9250`,
`Fakewood Cancer Center`, `Testburg`, `SYN-5506-1-792`, `refractory rheumatoid
arthritis`, `febrile neutropenia`, `Grade 4`, `07-DEC-2026`, `SYN-5506`,
`2.0 mg/kg IV Q2W`, `14-APR-2024`) is a `SensitiveSpan` with
`text[start:end] == value` by construction.

## Files

- `schemas.py` — pydantic models, `SensitiveCategory`, `DocBuilder` helper.
- `_vocab.py` — fake indication / AE / site / comorbidity / amendment vocabulary.
- `_fakers.py` — deterministic faker functions for dates, phones, IDs, doses.
- `synthetic_sae.py` — 500 SAE narratives.
- `synthetic_protocol.py` — 200 protocol excerpts (4 sub-kinds).
- `synthetic_monitoring.py` — 200 CRA monitoring reports.
- `synthetic_writing.py` — 300 CSR draft paragraphs (4 section types).
- `annotator.py` — ground-truth oracle API.
- `canary.py` — `CANARY_<hex>` sentinel injection + detection.

Smoke tests: `tests/test_mock_data.py` (16 tests, all passing).
