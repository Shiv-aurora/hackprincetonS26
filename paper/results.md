# Results

> **Experimental configuration:** ε = 3.0, δ = 1e-5, n_docs = 50, seed = 42, model = `google/gemma-4-E2B-it`.
> Attacks 1–4 sourced from `experiments/results/run_attacks_eps3.0.log` (2026-04-18). Attack 5 pending.
> All claims traceable to `experiments/results/`.

## 1. Privacy-Utility Curve

Produced by `experiments/calibrate_epsilon.py`. For each ε ∈ {0.5, 1.0, 2.0, 3.0, 5.0, 10.0}:

| ε | σ (Gaussian) | Inversion F1 | Utility Ratio | Passes H₁ (F1 ≤ 0.09) | Passes H₂ (U ≥ 0.85) |
|---|-------------|-------------|---------------|------------------------|----------------------|
| 0.5 | ~6.60 | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| 1.0 | ~3.30 | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| 2.0 | ~1.65 | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| **3.0** | **~1.10** | **0.6686** | **_TBD_** | **FAIL** | **_TBD_** |
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

| **Overall** | **0.4952** | **_TBD_** |

**Finding:** Literal leak rate is 49× above the 0.01 threshold. Root cause: quasi-identifier categories (COMPOUND_CODE, AE_GRADE, EFFICACY_VALUE, SITE_ID) fall outside the 18 HIPAA Safe Harbor identifiers and pass through the stripper by design. The NGSP neural components do not suppress them at ε = 3.0. **H₁ sub-metric: FALSIFIED.**

### Attack 2 — Cross-Encoder Similarity

| Metric | Value |
|--------|-------|
| mean_sim | _TBD_ |
| median_sim | _TBD_ |
| p95_sim | _TBD_ |
| fraction_above_threshold (0.85) | _TBD_ |

| mean_sim | 0.9345 |
| median_sim | _TBD_ |
| p95_sim | _TBD_ |
| fraction_above_threshold (0.85) | _TBD_ |

**Finding:** 93% mean semantic similarity — the proxy is near-identical to the original by cross-encoder measure. Query synthesis preserves task intent but for SAE narratives the task intent IS the content, so the synthesized proxy retains entity-laden structure.

### Attack 3 — Trained Inversion (Primary Result)

| Metric | Value |
|--------|-------|
| overall_f1 | _TBD_ |
| baseline_random_f1 | _TBD_ |
| control_shuffle_f1 | _TBD_ |
| n_train | _TBD_ |
| n_eval | _TBD_ |

| overall_f1 | 0.6686 |
| baseline_random_f1 | 0.4066 |
| control_shuffle_f1 | _TBD_ |
| n_train | _TBD_ |
| n_eval | _TBD_ |

**H₁ verdict: FALSIFIED** — F1 = 0.6686 is 7.4× above the Expert Determination threshold of 0.09. The attacker lifts +0.262 F1 points above random baseline, confirming genuine learned signal. The dominant cause is verbatim quasi-identifier presence in proxy text (see Attack 1).

### Attack 4 — Membership Inference

| Entity | AUC | n_positive | n_negative |
|--------|-----|-----------|-----------|
| _top entity 1_ | _TBD_ | _TBD_ | _TBD_ |
| _top entity 2_ | _TBD_ | _TBD_ | _TBD_ |
| _top entity 3_ | _TBD_ | _TBD_ | _TBD_ |
| **mean_auc** | **_TBD_** | | |

| **mean_auc** | **0.5000** | | |

**Finding: PASSES** (threshold ≤ 0.55). Membership inference is exactly at chance. Despite failing span-level privacy (Attack 3), the system successfully hides entity presence at the frequency level — the one positive privacy result.

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

## 5. Patched Pipeline Results (QI Stripping, ε=3.0)

System change: `pipeline.py` extended to strip quasi-identifier spans with typed placeholders before proxy synthesis. Entity map restoration unchanged.

| Metric | Original (no QI strip) | Patched (QI strip) | Threshold | Verdict |
|--------|----------------------|-------------------|-----------|---------|
| Verbatim leak rate | 0.4952 | _TBD_ | ≤ 0.05 | _TBD_ |
| Inversion F1 | 0.6686 | _TBD_ | ≤ 0.09 | _TBD_ |
| Membership AUC | 0.5000 | _TBD_ | ≤ 0.55 | PASS (baseline) |
| Utility ratio | _TBD_ | _TBD_ | ≥ 0.85 | _TBD_ |

Result source: `experiments/results/run_attacks_eps3.0_qi_strip.log` (in progress)

## 4. Comment Audit

Result: `paper/code_audit.md`

Running `python3 scripts/check_comments.py --path src/` as of Phase 3 completion:

```
OK — all defs have a one-line comment directly above. (src)
```

Zero violations across all 26 Python files in `src/`.
