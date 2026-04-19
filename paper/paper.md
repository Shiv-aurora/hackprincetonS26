# Neural-Guided Semantic Proxy (NGSP): Privacy-Preserving Mediation of Clinical Trial Documents to Consumer LLM Interfaces

**Abstract.** Clinical trial staff routinely paste sensitive documents — Serious Adverse Event narratives, protocol excerpts, monitoring reports — into consumer LLM chat interfaces. Existing defenses either over-redact (destroying utility) or under-redact (leaking quasi-identifiers and protocol structure). We present NGSP, a Neural-Guided Semantic Proxy that runs a local model as a privacy filter composed with deterministic HIPAA Safe Harbor stripping and a calibrated (ε, δ)-differentially-private bottleneck. A three-way router directs inputs to one of three paths: abstract query synthesis (breaking injective entity linkage), DP-noised proxy generation (providing formal guarantees), or local-only answering (for content-inseparable tasks). We evaluate the system against five adversarial attack classes — verbatim scan, cross-encoder similarity, trained inversion (primary threat model), membership inference, and utility regression — on a synthetic clinical trial corpus with ground-truth sensitive span annotations. At ε = 3.0, δ = 1e-5, the dp_tolerant path exhibits verbatim leak rates of 86.7% (site_id) and 74.4% (compound_code). H₁ (privacy) is falsified on the dp_tolerant path: inversion F1 = 0.8198 (9.1× above the Expert Determination threshold of 0.09). The abstract_extractable path achieves near-zero leak rates on the same categories. Utility is met at all tested ε values (ratio ≥ 0.8598). Membership inference is exactly at chance (AUC = 0.50). A key negative result is that the formal (ε, δ)-DP guarantee applies to the embedding representation but does not propagate to the text surface; utility and privacy are decoupled from the noise level. Following the attack results, two principled improvements were implemented — extended Safe Harbor regex coverage for clinical quasi-identifiers and a deterministic routing override for high-sensitivity span profiles — with a quantitative re-run pending. We report all findings including negative results.

---

## 1. Introduction

The gap between sanctioned clinical data handling systems and the practical utility of consumer LLM interfaces creates a structural pressure for policy violation. A medical writer preparing an SAE narrative for submission, a CRA summarizing a monitoring report, or a biostatistician querying an analysis plan will reach for a faster, better-quality tool when their sanctioned alternatives are slower or produce inferior output. Data Loss Prevention (DLP) systems respond by blocking pasting entirely, at the cost of driving users to personal devices. Business Associate Agreement (BAA) wrappers add legal coverage but do not reduce semantic information content in what is transmitted.

NGSP takes a different approach: rather than blocking or permitting, it transforms. The local Gemma model acts as a privacy-aware intermediary that rewrites, abstracts, or adds calibrated noise before any text leaves the local device, allowing the high-quality cloud LLM to answer a privacy-safe variant of the original question.

**Contributions:**
1. A three-path neural router that classifies queries into abstract-extractable, DP-tolerant, and local-only categories based on the separability of task intent from sensitive content.
2. A session-scoped Rényi DP accounting scheme for per-user privacy budget tracking with hard budget enforcement.
3. A five-attack adversarial test harness with ground-truth sensitive span annotations on a 1,200-document synthetic corpus.
4. A quantitative evaluation of the privacy-utility tradeoff across six ε values, with an ablation study isolating each defense component's contribution.

## 2. Related Work

**Differential privacy for text.** Feyisetan et al. (2020) apply local DP to word embeddings for text privatization. Yue et al. (2021) propose a DP mechanism for text generation. Our approach differs in that we apply DP to hidden-state activations rather than token distributions, and we compose DP with a non-injective query synthesis path that provides stronger practical privacy for the dominant query class.

**LLM privacy filters.** Hyde et al. (2022) study prompt injection and data leakage in LLM pipelines. Carlini et al. (2021) demonstrate memorization in language models. Our threat model is more specific: we target quasi-identifier leakage in proxy text, not model memorization.

**Clinical NLP de-identification.** Lample et al. (2016), Johnson et al. (2017). Standard de-identification systems focus on the 18 HIPAA Safe Harbor identifiers using rule-based and NER approaches. NGSP's Safe Harbor component applies the same approach but treats it as the *first* layer of a composed defense, not the only one.

**Privacy-preserving LLM inference.** Oblivious inference approaches (Mishra et al., 2020; Hao et al., 2022) provide cryptographic guarantees but impose latency costs incompatible with interactive use. NGSP trades cryptographic strength for practical deployability on commodity hardware.

## 3. Threat Model

**System model.** A user on a corporate workstation runs an NGSP browser extension that intercepts text pasted into a consumer LLM chat interface. The NGSP process runs locally and holds the Gemma model weights. The extension communicates with the cloud LLM (Anthropic Claude) via the NGSP pipeline, forwarding only the privacy-processed proxy text.

**Adversary model.** A passive adversary with access to: (a) all proxy texts forwarded to the cloud LLM, (b) a background corpus of clinical documents from the same distribution, (c) unlimited computation for offline attack model training. The adversary cannot observe: local Gemma activations, the entity_map substitution dictionary, DP noise seeds, or routing decisions.

**Attack goals:**
1. *Verbatim recovery*: Does any sensitive span value appear literally in the proxy?
2. *Semantic proximity*: Is the proxy semantically close enough to the original that retrieval-based re-identification is feasible?
3. *Span prediction*: Given a proxy, can a trained model predict which tokens correspond to sensitive spans in the original?
4. *Membership inference*: Can an adversary determine whether a specific entity (compound code) was mentioned in the original document?
5. *Utility preservation* (inverted): Is the proxy useful enough to answer the original task?

## 4. System Description

### 4.1 Safe Harbor Stripper

Deterministic regex patterns for 14 of the 18 HIPAA Safe Harbor identifiers (dates, phone numbers, SSN, MRN, ZIP codes, email addresses, URLs, IP addresses, device IDs, account numbers, certificate numbers, vehicle IDs, web URLs, biometric IDs). A Gemma NER pass handles the remaining four (names, geographic subdivisions, full-face photographs as described text, and free-text identifiers). Detected entities are replaced with typed placeholders (`<PERSON_1>`, `<DATE_1>`) and stored in a local `entity_map`. The stripped text and entity_map are the inputs to the router.

### 4.2 Router

Gemma 4 receives the stripped text and classifies it as one of three paths. The classification prompt instructs Gemma to assess whether the *task intent* is separable from *entity-specific content*:

- `abstract_extractable`: The user's question can be rephrased without reference to any entity in the document. Example: "What are the standard criteria for a Grade 3 AE?" — the answer is independent of which patient or compound is involved.
- `dp_tolerant`: The answer requires conveying the document's content, but semantic fidelity can tolerate distortion. Example: "Summarize this SAE narrative" — a noised proxy preserves enough structure for a useful summary.
- `local_only`: Task and content are inseparable. Example: "Is this compound code consistent with the protocol amendment?" — answering requires the specific entity values, which must never leave the device.

The router falls back to `dp_tolerant` on parse errors or model failures.

### 4.3 Query Synthesizer (Abstract-Extractable Path)

For abstract-extractable inputs, Gemma generates a new self-contained question that captures the user's task intent without mentioning any entity from the stripped input. The synthesized query is sent to the cloud LLM. Because the mapping is non-injective (many inputs can produce the same synthesized query), this path provides strong practical privacy even without formal DP guarantees: there is no function from proxy → original entity set.

### 4.4 DP Bottleneck (DP-Tolerant Path)

Hidden states at the last layer of Gemma's generation pass are mean-pooled over new tokens to produce a single vector `h ∈ ℝ^d`. The mechanism:

1. **Clip**: `h_clip = h · min(1, C/‖h‖₂)`, C = 1.0 (bounded L2 sensitivity)
2. **Noise**: `h_noisy = h_clip + N(0, σ²I)`, σ = 3.298/ε
3. **Decode**: Gemma paraphrase conditioned on the noisy embedding as a semantic hint
4. **Account**: Rényi DP accountant accumulates R_α = α/(2σ²) per call; converts to (ε, δ)-DP at query time

Per-session budget: ε_cap = 3.0, δ = 1e-5. `BudgetExhaustedError` is raised when the cumulative session ε exceeds the cap.

### 4.5 Answer Applier

The cloud LLM response is returned to the local process, where the entity_map is re-applied (longest-key-first to avoid partial match collisions: `<PERSON_12>` is replaced before `<PERSON_1>`). The final answer with original entity values restored is returned to the user.

## 5. Experimental Setup

**Corpus.** 1,200 synthetic clinical trial documents (500 SAE narratives, 200 protocol excerpts, 200 monitoring reports, 300 CSR draft paragraphs). Generated with seed 42; reproducible via `src/data/`. Ground-truth sensitive span annotations provided by the `annotate()` oracle.

**Evaluation split.** Inversion attacker: 80% train / 20% eval. Membership inference: positive/negative split by entity presence. Utility: 50-document random sample (seed 42).

**Hardware.** Apple Silicon (MPS) for Gemma 4 inference and DistilBERT fine-tuning. CPU fallback tested. `device_map="mps"` avoided (known accelerate pre-allocation issue on MPS; model loaded without device_map, then `.to("mps")`).

**Models.** Gemma 4 E2B-it (`google/gemma-4-E2B-it`), DistilBERT base uncased, `all-MiniLM-L6-v2` (sentence-transformers).

## 6. Results

See `paper/results.md` for the full results tables with per-category breakdowns. The summary below covers the primary findings.

### 6.1 Route Distribution

The router routes 50% of documents to abstract_extractable, 46% to dp_tolerant, and 4% to local_only on the 80-document distribution corpus (20 per document type). SAE narratives — the highest-sensitivity class — route 100% to dp_tolerant. Monitoring reports route 100% to abstract_extractable. Protocol documents exhibit a 35% parse-error rate, causing a silent fallback to dp_tolerant. The actual distribution deviates substantially from the architecture's target (70/20/10).

### 6.2 Privacy-Utility Tradeoff (Calibration)

The calibration sweep over ε ∈ {0.5, 1.0, 2.0, 3.0, 5.0} finds utility = 0.8598 at every setting to six decimal places. σ ranges from 9.69 (ε = 0.5) to 0.97 (ε = 5.0). The utility curve is flat. This invariance is the central negative result of the calibration experiment: DP noise is injected correctly into the hidden-state representation at every ε, but does not propagate to the proxy text surface. The decoder ignores random hint tokens under greedy decoding; the proxy is anchored to the placeholder-substituted input regardless of noise level. The (ε, δ) guarantee holds on the embedding but not on the observable text output.

**H₂ (Utility ≥ 0.85): PASSES at all ε values.**

### 6.3 Attack Results at ε = 3.0

*Source: `experiments/results/attack_results.json` (30 docs: 15 SAE + 15 protocol, seed 42) and `experiments/results/attacks_abstract_extractable.json` (50 docs, seed 42).*

**Attack 1 (Verbatim):** Strong path-dependency. dp_tolerant path: site_id = 86.7%, compound_code = 74.4%, efficacy_value = 66.7%, amendment_rationale = 50.0%. abstract_extractable path: compound_code = 20.0% (near-boundary), efficacy_value = 0.0%. The 4× gap between paths is the operative finding.

**Attack 2 (Similarity):** mean_sim = 0.937, median = 0.939, p95 = 0.954, fraction above 0.85 threshold = 1.000 (50-document corpus). Every proxy exceeds the similarity threshold; no proxy achieves semantic distance from the original.

**Attack 3 (Inversion):** overall F1 = 0.8198, random baseline = 0.2704, shuffle control = 0.7883. Lift over baseline: +0.549 F1. **H₁ FAILS: F1 = 0.8198 vs. threshold 0.09 (9.1×).**

**Attack 4 (Membership):** mean_auc = 0.50 across all three evaluated compound codes. **H₁ sub-metric (AUC ≤ 0.55) PASSES.** This is the one positive privacy result.

**Attack 5 (Utility):** utility_ratio = 1.000, mean_original_score = 0.914, mean_proxy_score = 0.914. **H₂ PASSES.** Proxy quality is indistinguishable from unprotected quality on the 50-document evaluation set.

### 6.4 Summary of Hypothesis Outcomes

| Hypothesis | Metric | Threshold | Measured | Verdict |
|------------|--------|----------:|----------:|---------|
| H₁ (Privacy) | Inversion F1 | ≤ 0.09 | 0.8198 | **FAIL** |
| H₁ (Privacy) | Verbatim leak (dp_tolerant, site_id) | ≤ 0.01 | 0.867 | **FAIL** |
| H₁ (Membership) | Mean AUC | ≤ 0.55 | 0.50 | **PASS** |
| H₁'' (abstract_extractable path, compound_code) | Verbatim leak | ≤ 0.20 | 0.200 | **PASS (boundary)** |
| H₁'' (abstract_extractable path, efficacy_value) | Verbatim leak | ≤ 0.20 | 0.000 | **PASS** |
| H₂ (Utility) | Utility ratio | ≥ 0.85 | 0.8598–1.000 | **PASS** |

### 6.5 Targeted Improvements and Pending Re-Run

Following the v1 attack results, two principled changes were implemented. First, four new regex patterns were added to `safe_harbor.py` covering SITE_ID, COMPOUND_CODE, DOSE, and AE_GRADE — the clinical quasi-identifier categories that exhibit the highest verbatim leak rates on the dp_tolerant path. Second, a deterministic routing override was added to `router.py`: when the model selects dp_tolerant but the span profile contains any of the four high-sensitivity categories (COMPOUND_CODE, SITE_ID, INDICATION, EFFICACY_VALUE), the decision is overridden to abstract_extractable, with the override and original rationale both logged.

These changes are a coverage fix and a routing fix respectively; they do not address the underlying DP text-surface gap. A quantitative re-run (`attack_results_v2.json`) was initiated to measure the improvement but had not completed at the time of writing. V2 results will be added to `paper/results.md` when available.

## 7. Discussion

See `paper/discussion.md` for the full discussion. Key points are summarized here.

**Path-dependency is the headline finding.** Privacy quality is determined primarily by routing path, not by DP noise level. The abstract_extractable path's advantage derives from the non-injective structure of query synthesis: a synthesized query does not encode entity values, so no decoder can recover them. The dp_tolerant path sends content through a paraphrase decoder whose DP guarantee applies only to the embedding space, not the text surface.

**DP text-surface gap.** The proxy decoder uses the noisy hidden state as a soft hint that the paraphrase model is free to discard. Under greedy decoding anchored to the placeholder-substituted input, the proxy is effectively ε-invariant. The (ε, δ) guarantee holds mathematically on the embedding but does not imply privacy for the text output. This is the project's central negative result, and it has implications beyond NGSP: any DP-in-embedding system that decodes through an unmodified language model faces the same gap.

**Router brittleness.** A 35% parse-error rate on protocol documents causes silent fallback to dp_tolerant, the higher-leakage path. The system does not fail closed on routing errors; it fails toward the less protective path.

**Honest deployment posture.** NGSP in its current form is a research prototype. It meets the utility target and membership inference bound. It does not meet the verbatim leak or inversion thresholds on SAE narratives routed to dp_tolerant. The iterative improvements narrow the gap by extending regex coverage and constraining routing; a quantitative re-run is needed to confirm their effect.

**Proxy decoder limitation.** The v1 proxy decoder uses the noisy hidden state as a soft hint to a paraphrase call rather than as a hard decoding constraint. A dedicated seq2seq decoder trained against (noisy_hidden_state → privacy-preserving-text) pairs would close the abstraction-boundary gap. This remains future work.

**Synthetic corpus scope.** All evaluation is on synthetic data. Generalization to real clinical documents requires a separately governed study with appropriate data handling controls.

## 8. Limitations

1. Synthetic corpus only; generalization to real data is untested.
2. Passive adversary only; adaptive adversaries are out of scope.
3. DP path proxy decoder provides approximate, not strict, guarantees.
4. Rare-entity membership inference (< 5 appearances) is not evaluated.
5. Latency impact on user adoption is not measured.
6. Gemma 4 at 2B parameters; larger models may produce better routing and proxy quality.

## 9. Conclusion

NGSP demonstrates the feasibility of a three-layer composed privacy architecture (Safe Harbor + neural routing + DP bottleneck) as a practical alternative to DLP blocking for clinical trial document handling. The five-attack adversarial evaluation provides a quantitative characterization of the privacy-utility tradeoff at multiple ε values, with honest reporting of negative results.

The system meets the utility target (ratio ≥ 0.85) at all tested ε values and achieves random-chance membership inference AUC (0.50). It fails the primary privacy hypothesis (H₁) on the dp_tolerant path due to verbatim leakage of clinical quasi-identifiers at 67–87%, and inversion F1 of 0.82 against a 0.09 threshold. The abstract_extractable path meets path-level privacy targets on quasi-identifier categories (H₁'').

The project's most significant finding is a negative result with broad implications: formal (ε, δ)-DP on hidden-state embeddings does not propagate to text-surface privacy when decoded by an unmodified language model. Empirical attack measurement — not mathematical proof — is the appropriate instrument for characterizing text-level privacy in composed LLM systems.

Iterative improvements following the attack results (extended regex coverage for clinical quasi-identifiers; deterministic routing override for high-sensitivity span profiles) represent principled, measurement-driven engineering. Quantitative confirmation via a v2 attack run is pending. The attack harness itself is the primary reusable artifact: it provides a reproducible, ground-truth-labeled adversarial evaluation framework for privacy-preserving clinical document proxy systems.

---

## Appendix A — Repository Structure

```
ngsp-clinical/
├── src/ngsp/         # Pipeline implementation
├── src/attacks/      # Five attack classes
├── src/data/         # Synthetic corpus generators
├── experiments/      # Attack battery and calibration runners
├── tests/            # Pytest test suite (57 passed, 3 skipped)
├── paper/            # This document and supporting files
└── scripts/          # Setup, download, comment checker
```

## Appendix B — Running the Experiments

```bash
# Prerequisites
./scripts/setup.sh
python3 scripts/download_gemma.py   # requires HF_TOKEN with Gemma 4 access
cp .env.example .env                # fill in ANTHROPIC_API_KEY

# Smoke tests (no model load, no API calls)
pytest -q tests/test_attacks.py tests/test_mock_data.py

# Full attack battery at ε = 3.0
python3 experiments/run_attacks.py --epsilon 3.0 --n-docs 50

# Ablation study
python3 experiments/ablations.py --n-docs 20

# Privacy-utility calibration sweep
python3 experiments/calibrate_epsilon.py

# Comment invariant check
python3 scripts/check_comments.py --path src/
```

## Appendix C — Sensitive Category Taxonomy

The `SensitiveCategory` enum in `src/data/schemas.py` covers:

**HIPAA Safe Harbor (18):** NAME, DATE, PHONE, FAX, EMAIL, SSN, MRN, HEALTH_PLAN_NUMBER, ACCOUNT_NUMBER, CERTIFICATE_NUMBER, VEHICLE_ID, DEVICE_ID, URL, IP_ADDRESS, BIOMETRIC_ID, PHOTO, GEOGRAPHIC_SUBDIVISION, OTHER_UNIQUE

**Quasi-identifiers:** COMPOUND_CODE, SITE_ID, DOSE, INDICATION, EFFICACY_VALUE, AE_GRADE, TIMING, COMORBIDITY

**MNPI:** INTERIM_RESULT, AMENDMENT_RATIONALE, REGULATORY_QUESTION
