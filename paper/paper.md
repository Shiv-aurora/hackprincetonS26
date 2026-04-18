# Neural-Guided Semantic Proxy (NGSP): Privacy-Preserving Mediation of Clinical Trial Documents to Consumer LLM Interfaces

**Abstract.** Clinical trial staff routinely paste sensitive documents — Serious Adverse Event narratives, protocol excerpts, monitoring reports — into consumer LLM chat interfaces. Existing defenses either over-redact (destroying utility) or under-redact (leaking quasi-identifiers and protocol structure). We present NGSP, a Neural-Guided Semantic Proxy that runs Gemma 4 locally as a privacy filter composed with deterministic HIPAA Safe Harbor stripping and a calibrated (ε, δ)-differentially-private bottleneck. A three-way router directs inputs to one of three paths: abstract query synthesis (breaking injective entity linkage), DP-noised proxy generation (providing formal guarantees), or local-only answering (for content-inseparable tasks). We evaluate the system against five adversarial attack classes — verbatim scan, cross-encoder similarity, trained inversion (primary threat model), membership inference, and utility regression — on a synthetic clinical trial corpus of 1,200 documents with ground-truth sensitive span annotations. At ε = 3.0, δ = 1e-5, we report [results pending execution of experiments]. The hypothesis that the composed system simultaneously bounds inversion span-recovery F1 ≤ 0.09 and preserves utility ≥ 0.85 is [pending]. We report all results including negative findings.

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

**Differential privacy for text.** Feyisetan et al. (2020) apply local DP to word embeddings for text privatization, and Yue et al. (2021) propose a natural-text sanitization mechanism. More recent work has sharpened both the mechanism design and the critique surface: Mattern et al. (2022) analyze the limits of word-level DP, Chen et al. (2023) introduce customized token-level sanitization, and Awon et al. (2025), Zhang et al. (2025), and Tong et al. (2025) extend the modern text-sanitization literature with semantically-aware and attack-aware formulations. Our approach differs in that we apply DP to hidden-state activations rather than token distributions, and we compose DP with a non-injective query synthesis path that provides stronger practical privacy for the dominant query class.

**LLM privacy and leakage.** Carlini et al. (2021) demonstrate training-data extraction from large language models. Mireshghallah et al. (2022) quantify privacy risks via membership inference attacks, and Huang et al. (2022) study leakage of personal information from large pretrained language models. Our threat model is more specific: we target quasi-identifier leakage in proxy text, not only model memorization at training time.

**Clinical NLP de-identification.** Lample et al. (2016), Dernoncourt et al. (2017), Liu et al. (2017), and Friedrich et al. (2019) anchor the transition from sequence-labeling-based PHI removal toward privacy-preserving text representations for medical records. Standard de-identification systems focus on the 18 HIPAA Safe Harbor identifiers using rule-based and NER approaches. NGSP's Safe Harbor component applies the same approach but treats it as the *first* layer of a composed defense, not the only one.

**Privacy accounting and practical deployment.** Mironov (2017) introduces Rényi differential privacy, and Wang et al. (2019) provide the subsampled analytical moments accountant used widely in practical composition analyses. NGSP adopts this accounting perspective, but couples it to a local-model mediation architecture and a task-aware router designed for interactive drafting workflows on commodity hardware.

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

*[Populate from `experiments/results/attacks_eps3.0.json`, `experiments/results/ablations.json`, `experiments/results/calibration.json` after running experiments.]*

See `paper/results.md` for the full results tables.

### 6.1 Privacy-Utility Tradeoff

[Insert Figure: `paper/figures/epsilon_utility_curve.png`]

The calibration sweep over ε ∈ {0.5, 1.0, 2.0, 3.0, 5.0, 10.0} reveals the operating envelope. [Populate with actual findings from calibration.json.]

### 6.2 Attack Results at ε = 3.0

**Attack 1 (Verbatim):** [Values from `results["verbatim"]` in attacks_eps3.0.json.]

**Attack 2 (Similarity):** [Values from `results["similarity"]`.]

**Attack 3 (Inversion):** [Values from `results["inversion"]`.]
- H₁ **[PASS/FAIL]**: overall_f1 = [value] vs. threshold 0.09

**Attack 4 (Membership):** [Values from `results["membership"]`.]

**Attack 5 (Utility):** [Values from `results["utility"]`.]
- H₂ **[PASS/FAIL]**: utility_ratio = [value] vs. threshold 0.85

### 6.3 Ablation Study

[Insert Table from `experiments/results/ablations.json`.]

The ablation isolates each component's contribution. Key question for H₃: does any single component achieve both H₁ and H₂?

## 7. Discussion

See `paper/discussion.md` for the full discussion. Key points:

**Privacy-utility curve.** [Characterize after results.]

**Proxy decoder limitation.** The v1 proxy decoder uses the noisy hidden state as a soft hint to a Gemma paraphrase call rather than as a hard decoding constraint. This provides approximate rather than strict DP guarantees for the proxy text. A dedicated decoder network would be the correct next step.

**Synthetic corpus scope.** All evaluation is on synthetic data. Generalization to real clinical documents requires a separately governed study.

## 8. Limitations

1. Synthetic corpus only; generalization to real data is untested.
2. Passive adversary only; adaptive adversaries are out of scope.
3. DP path proxy decoder provides approximate, not strict, guarantees.
4. Rare-entity membership inference (< 5 appearances) is not evaluated.
5. Latency impact on user adoption is not measured.
6. Gemma 4 at 2B parameters; larger models may produce better routing and proxy quality.

## 9. Conclusion

NGSP demonstrates the feasibility of a three-layer composed privacy architecture (Safe Harbor + neural routing + DP bottleneck) as a practical alternative to DLP blocking for clinical trial document handling. The five-attack adversarial evaluation provides a quantitative characterization of the privacy-utility tradeoff at multiple ε values. [Conclude with findings after experiments run.]

---

## Appendix A — Repository Structure

```
ngsp-clinical/
├── src/ngsp/         # Pipeline implementation
├── src/attacks/      # Five attack classes
├── src/data/         # Synthetic corpus generators
├── experiments/      # Attack battery and calibration runners
├── tests/            # Pytest test suite (74 tests, 0 failures)
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
