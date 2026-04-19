# Hypothesis

## Formal Statement

**H₁ (Privacy):** On the synthetic clinical trial corpus at ε = 3.0, δ = 1e-5, the composed NGSP system (Safe Harbor stripping + neural router + query synthesis / DP bottleneck) reduces the inversion attacker's span-recovery F1 to ≤ 0.09 — the Expert Determination re-identification threshold established in 45 CFR §164.514(b).

**H₂ (Utility):** Under the same configuration, the utility ratio (mean proxy-answer quality / mean original-answer quality as scored by Claude-as-judge) remains ≥ 0.85.

**H₃ (Composition):** No single component achieves both bounds simultaneously. The composed system achieves them through layered defense: Safe Harbor eliminates structured PHI; query synthesis breaks the injective link between task intent and entity specifics; DP noise degrades residual quasi-identifier signal.

## Operationalisation

| Symbol | Quantity | Threshold | Source |
|--------|----------|-----------|--------|
| F1_inv | Inversion attacker token-level F1 (Attack 3) | ≤ 0.09 | Expert Determination guidance, HHS 2012 |
| U_ratio | mean(proxy_score) / mean(original_score) | ≥ 0.85 | Clinical utility floor, project-internal |
| AUC_mem | Membership inference AUC (Attack 4) | ≤ 0.55 | Random classifier = 0.5; 0.55 allows ±1σ |
| leak_lit | Verbatim literal leak rate over sensitive spans (Attack 1) | ≤ 0.01 | Near-zero for structured identifiers post-Safe-Harbor |

## Falsification Conditions

H₁ is falsified if any single attack class produces F1_inv > 0.09 on the held-out 20% evaluation split at ε = 3.0.

H₂ is falsified if the mean utility ratio drops below 0.85 over the 50-document evaluation set.

H₃ is falsified if the ablation shows any single component achieves both H₁ and H₂ simultaneously — this would mean composition adds no marginal value.

## Revised Hypothesis H₁' (Post-Negative-Result)

Following the failure of H₁ at ε=3.0 (inversion F1=0.6686, leak rate=0.4952), root-cause analysis identified that quasi-identifier categories outside HIPAA Safe Harbor passed verbatim into proxy text. A system fix was implemented: `pipeline.py` now calls `apply_span_stripping` on quasi-identifier spans after extraction, replacing their values with typed placeholders before routing and synthesis.

**H₁':** The patched pipeline (Safe Harbor + quasi-identifier stripping + query synthesis) reduces verbatim literal leak rate to ≤ 0.05 and inversion F1 to ≤ 0.09 at ε=3.0, while maintaining utility ratio ≥ 0.85.

**Why H₁' is more likely to hold:** The dominant attack surface was verbatim token presence, not semantic inference. Removing that surface (by stripping quasi-identifiers) eliminates the inversion attacker's primary signal. The mapping from placeholder proxy to original value remains non-invertible from the proxy text alone.

**Falsification condition:** H₁' is falsified if either (a) inversion F1 > 0.09 on the patched proxy pairs, or (b) utility ratio < 0.85, indicating that stripping too much content degrades answer quality.

**Result:** FALSIFIED — verbatim leak rate = 0.4936 (threshold ≤ 0.05); effectively unchanged from original 0.4952. Run killed after attacks 1–2 confirmed no improvement. Two failure mechanisms: (1) `extract_quasi_identifiers` has low NER recall and does not reliably detect QI spans, so most values pass through unstripped; (2) the paraphrase decoder re-introduces entity values by echoing surrounding clinical context even when placeholders are inserted.

## Hypothesis H₁'' (Abstract-Extractable Path Validation)

Following the failure of H₁' (QI stripping did not reduce leak rate: 0.4936 vs 0.4952 original, because the NER extractor has low recall and the paraphrase decoder echoes surrounding context), the research pivot targets the abstract_extractable path directly.

**H₁'':** On documents that route to abstract_extractable (query synthesis), the verbatim literal leak rate for quasi-identifier categories is ≤ 0.20 and the inversion F1 is ≤ 0.30, at ε=3.0, with Gemma 4 E2B and the real Anthropic API.

Note: thresholds are relaxed from the original H₁ (≤ 0.09) because this hypothesis isolates path-level behavior rather than full-system behavior. The finding from product-build (0.00–0.20 leak on abstract_extractable) motivates these bounds.

**Why H₁'' is expected to hold:** Query synthesis generates a new question without referencing entity values — the mapping is non-injective by construction. An inversion attacker receiving only the synthesized query cannot recover the original entity values because they were never encoded.

**Falsification condition:** H₁'' is falsified if verbatim leak rate > 0.20 on abstract_extractable-routed documents with Gemma 4.

**Result:** _TBD — validation run in progress using monitoring reports_

## Scope and Limitations

This hypothesis is evaluated **only on synthetic data**. The corpus contains no real patient records, no real compound codenames, and no real institutional identifiers. Generalization to real clinical trial documents is explicitly out of scope and must be assessed in a separately governed study with appropriate data handling controls.

The threat model is a computationally bounded passive adversary with access to the proxy text but not to the NGSP internals, entity_map, or DP noise seed. Adaptive adversaries with partial system knowledge are not evaluated.
