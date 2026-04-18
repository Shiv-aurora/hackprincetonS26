# Results

> **Note:** This file documents the result structure and expected findings. Populate with actual values by running:
> ```bash
> python experiments/run_attacks.py --epsilon 3.0 --n-docs 50
> python experiments/ablations.py --n-docs 20
> python experiments/calibrate_epsilon.py
> ```
> All claims must be traceable to a file in `experiments/results/`.

## 1. Privacy-Utility Curve

Produced by `experiments/calibrate_epsilon.py`. For each ε ∈ {0.5, 1.0, 2.0, 3.0, 5.0, 10.0}:

| ε | σ (Gaussian) | Inversion F1 | Utility Ratio | Passes H₁ (F1 ≤ 0.09) | Passes H₂ (U ≥ 0.85) |
|---|-------------|-------------|---------------|------------------------|----------------------|
| 0.5 | ~6.60 | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| 1.0 | ~3.30 | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| 2.0 | ~1.65 | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| **3.0** | **~1.10** | **_TBD_** | **_TBD_** | **_TBD_** | **_TBD_** |
| 5.0 | ~0.66 | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| 10.0 | ~0.33 | _TBD_ | _TBD_ | _TBD_ | _TBD_ |

σ values computed analytically: σ = √(2 ln(1.25/1e-5)) / ε ≈ 3.298 / ε.

Result source: `experiments/results/calibration.json`

## 2. Full Attack Battery at ε = 3.0

Result source: `experiments/results/attacks_eps3.0.json`

### Attack 1 — Verbatim Leak

| Category | Literal Leak Rate | Fuzzy Leak Rate (threshold 85) |
|----------|------------------|-------------------------------|
| NAME | _TBD_ | _TBD_ |
| DATE | _TBD_ | _TBD_ |
| SSN | _TBD_ | _TBD_ |
| COMPOUND_CODE | _TBD_ | _TBD_ |
| SITE_ID | _TBD_ | _TBD_ |
| AE_GRADE | _TBD_ | _TBD_ |
| EFFICACY_VALUE | _TBD_ | _TBD_ |
| **Overall** | **_TBD_** | **_TBD_** |

**Expected finding:** Safe Harbor stripping should drive literal leak rates to near zero for structured identifiers (NAME, DATE, SSN, SITE_ID). Compound codes and quasi-identifiers are handled by NGSP; their residual rates test the neural components' marginal value.

### Attack 2 — Cross-Encoder Similarity

| Metric | Value |
|--------|-------|
| mean_sim | _TBD_ |
| median_sim | _TBD_ |
| p95_sim | _TBD_ |
| fraction_above_threshold (0.85) | _TBD_ |

**Expected finding:** The abstract-extractable path (query synthesis) should produce low similarity scores because the synthesized query captures task intent but drops entity specifics. The DP path may produce higher similarity scores since the proxy text retains sentence structure.

### Attack 3 — Trained Inversion (Primary Result)

| Metric | Value |
|--------|-------|
| overall_f1 | _TBD_ |
| baseline_random_f1 | _TBD_ |
| control_shuffle_f1 | _TBD_ |
| n_train | _TBD_ |
| n_eval | _TBD_ |

**H₁ verdict:** _TBD_ (threshold: overall_f1 ≤ 0.09)

**Expected finding:** The shuffle-pair control F1 should be close to the random baseline, confirming that any learned signal above baseline is real and not a training artifact. If the main model F1 is also near baseline, NGSP successfully breaks the proxy→span mapping.

### Attack 4 — Membership Inference

| Entity | AUC | n_positive | n_negative |
|--------|-----|-----------|-----------|
| _top entity 1_ | _TBD_ | _TBD_ | _TBD_ |
| _top entity 2_ | _TBD_ | _TBD_ | _TBD_ |
| _top entity 3_ | _TBD_ | _TBD_ | _TBD_ |
| **mean_auc** | **_TBD_** | | |

**Expected finding:** AUC near 0.5 indicates the proxy text does not expose whether a specific entity was mentioned in the original document. AUC significantly above 0.5 would indicate residual membership signal.

### Attack 5 — Downstream Utility

| Metric | Value |
|--------|-------|
| mean_original_score | _TBD_ |
| mean_proxy_score | _TBD_ |
| utility_ratio | _TBD_ |
| n_docs_evaluated | _TBD_ |

**H₂ verdict:** _TBD_ (threshold: utility_ratio ≥ 0.85)

## 3. Ablation Study

Result source: `experiments/results/ablations.json`

| Configuration | Verbatim Literal Leak | Verbatim Fuzzy Leak | Inversion F1 |
|--------------|----------------------|--------------------|--------------| 
| Safe Harbor only | _TBD_ | _TBD_ | _TBD_ |
| Safe Harbor + synthesis | _TBD_ | _TBD_ | _TBD_ |
| Safe Harbor + DP only | _TBD_ | _TBD_ | _TBD_ |
| Full system | _TBD_ | _TBD_ | _TBD_ |

**Expected finding (H₃):** No single component should achieve both privacy and utility thresholds simultaneously. Safe Harbor alone eliminates structured PHI but leaves quasi-identifiers exposed. Query synthesis breaks the inversion signal for abstract-extractable inputs but cannot handle all document types. DP alone provides formal guarantees but may degrade utility at tight ε values. The full system combines all three.

**Negative result to report honestly:** If the ablation shows that Safe Harbor alone already achieves F1 ≤ 0.09 (because the synthetic corpus's sensitive spans are dominated by Safe Harbor categories), that is a negative result for H₃ and should be stated clearly. It would mean NGSP provides marginal privacy improvement over simpler baselines on this corpus — a finding worth reporting.

## 4. Comment Audit

Result: `paper/code_audit.md`

Running `python3 scripts/check_comments.py --path src/` as of Phase 3 completion:

```
OK — all defs have a one-line comment directly above. (src)
```

Zero violations across all 26 Python files in `src/`.
