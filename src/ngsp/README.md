# NGSP Pipeline — `src/ngsp/`

## Overview

The Neural-Guided Semantic Proxy (NGSP) pipeline runs local Gemma 4 as a privacy filter
between user inputs and the Anthropic API. Every request is routed through one of three
paths depending on whether task intent can be separated from sensitive content.

## Architecture

```
user input
   │
   ▼
[safe_harbor.py]          deterministic regex + optional Gemma NER for 18 HIPAA identifiers
   │  entity_map built here (placeholder → original value)
   ▼
[entity_extractor.py]     Gemma prompting for quasi-identifiers (compound codes, site IDs,
   │                      doses, indications, MNPI markers) on the already-stripped text
   ▼
[router.py]               Gemma three-way classification:
   │                        abstract_extractable | dp_tolerant | local_only
   │
   ├── abstract_extractable (~70%)
   │      [query_synthesizer.py]  Gemma generates a new self-contained question with no
   │                              reference to sensitive entities (non-injective mapping)
   │
   ├── dp_tolerant (~20%)
   │      [local_model.py]        extract pooled hidden state at chosen layer
   │      [dp_mechanism.py]       L2 clip → add Gaussian noise (ε,δ)-DP
   │      [proxy_decoder.py]      nearest-neighbor hint + Gemma paraphrase
   │
   └── local_only (~10%)
          [local_model.py]        Gemma answers locally; no remote API call

Anthropic API  ←  proxy text (abstract_extractable + dp_tolerant paths only)
   │
   ▼
[answer_applier.py]   re-apply entity_map: <PERSON_1> → "Jane Smith" etc.
   │
   ▼
user response
```

## Module Reference

| Module | Responsibility |
|--------|---------------|
| `local_model.py` | Singleton Gemma 4 wrapper: `generate`, `generate_with_hidden_states`, `embed`, `tokenize` |
| `remote_client.py` | Anthropic Messages API wrapper with canary pre-check and SHA-256 audit log |
| `safe_harbor.py` | Regex + Gemma NER for 18 HIPAA Safe Harbor identifiers; builds entity_map |
| `entity_extractor.py` | Gemma prompting for quasi-identifiers and MNPI markers |
| `router.py` | Three-way routing classification via Gemma; falls back to `dp_tolerant` on error |
| `query_synthesizer.py` | Generates a new privacy-preserving proxy question from task intent |
| `dp_mechanism.py` | Gaussian mechanism, L2 clipping, Rényi DP accountant |
| `proxy_decoder.py` | Nearest-neighbor embedding hint + Gemma paraphrase for the DP path |
| `answer_applier.py` | Re-applies entity_map placeholders to the remote API response |
| `pipeline.py` | End-to-end orchestration; enforces session ε budget monotonically |

## DP Calibration

Default session budget: **ε = 3.0, δ = 1e-5**.

Sigma calibration formula (Dwork et al., 2014):
```
σ = Δ · √(2 · ln(1.25 / δ)) / ε
```
For (ε=3.0, δ=1e-5, Δ=1.0): σ ≈ 1.10.

The Rényi DP accountant tracks cumulative budget across calls in a session. `pipeline.py`
hard-refuses with `BudgetExhaustedError` when the cap is hit.

Run `python experiments/calibrate_epsilon.py` to sweep ε ∈ {0.5, 1.0, 2.0, 3.0, 5.0, 10.0}
and measure task utility at each value. Results written to `experiments/results/calibration.json`
and `paper/figures/epsilon_utility_curve.png`.

## Known Limitations

1. **Proxy decoder is v1 (nearest-neighbor hints, not true soft-prompt).** The DP bottleneck
   uses noisy-nearest-neighbor vocab tokens as a hint phrase, then prompts Gemma to paraphrase.
   This is a heuristic — formal inversion resistance is bounded only by the DP guarantee, not
   by the decoder approach itself.

2. **Router fallback is dp_tolerant on any model error.** This is the conservative choice
   (prefers privacy over utility when uncertain), but means model failures inflate ε spend.

3. **Safe Harbor NER (names, geographic) via Gemma is best-effort.** If Gemma misses an
   entity, it will pass through unstripped. The regex pass covers 14 of 18 HIPAA categories
   deterministically; names and geographic entities depend on model availability.

4. **entity_map is session-local, not persisted.** If a session crashes mid-run, the
   entity_map is lost and previously sent proxies cannot be de-anonymized.

5. **Apple Silicon (MPS): bitsandbytes quantization is unavailable.** Use the E2B-it
   variant at float16; it fits in ~4 GB of unified memory.
