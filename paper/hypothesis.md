# Hypothesis

## Formal Statement

**H₁ (Privacy):** On the synthetic clinical trial corpus at ε = 3.0, δ = 1e-5, the composed NGSP system (Safe Harbor stripping + neural router + query synthesis / DP bottleneck) reduces the inversion attacker's span-recovery F1 to ≤ 0.09 — the Expert Determination re-identification threshold established in 45 CFR §164.514(b).

**H₂ (Utility):** Under the same configuration, the utility ratio (mean proxy-answer quality / mean original-answer quality as scored by Claude-as-judge) remains ≥ 0.85.

**H₃ (Composition):** No single component achieves both bounds simultaneously. The composed system achieves them through layered defense: Safe Harbor eliminates structured PHI; query synthesis breaks the injective link between task intent and entity specifics; DP noise degrades residual quasi-identifier signal.

## Operationalisation

| Symbol | Quantity | Threshold | Source |
|--------|----------|-----------|--------|
| F1_inv | Inversion attacker token-level F1 (Attack 3) | ≤ 0.09 | Expert Determination / de-identification guidance, HHS |
| U_ratio | mean(proxy_score) / mean(original_score) | ≥ 0.85 | Clinical utility floor, project-internal |
| AUC_mem | Membership inference AUC (Attack 4) | ≤ 0.55 | Random classifier = 0.5; 0.55 allows ±1σ |
| leak_lit | Verbatim literal leak rate over sensitive spans (Attack 1) | ≤ 0.01 | Near-zero for structured identifiers post-Safe-Harbor |

## Falsification Conditions

H₁ is falsified if any single attack class produces F1_inv > 0.09 on the held-out 20% evaluation split at ε = 3.0.

H₂ is falsified if the mean utility ratio drops below 0.85 over the 50-document evaluation set.

H₃ is falsified if the ablation shows any single component achieves both H₁ and H₂ simultaneously — this would mean composition adds no marginal value.

## Scope and Limitations

This hypothesis is evaluated **only on synthetic data**. The corpus contains no real patient records, no real compound codenames, and no real institutional identifiers. Generalization to real clinical trial documents is explicitly out of scope and must be assessed in a separately governed study with appropriate data handling controls.

The threat model is a computationally bounded passive adversary with access to the proxy text but not to the NGSP internals, entity_map, or DP noise seed. Adaptive adversaries with partial system knowledge are not evaluated.
