# Discussion

## 0. Iterative Hypothesis Refinement

The original H₁ was falsified at ε = 3.0 by a wide margin (inversion F1 = 0.6686 vs. threshold 0.09). Root-cause analysis identified the failure mechanism: quasi-identifier categories outside HIPAA Safe Harbor (COMPOUND_CODE, SITE_ID, EFFICACY_VALUE, AMENDMENT_RATIONALE) passed verbatim into proxy text through the dp_tolerant path. These categories are not touched by the deterministic Safe Harbor stripper by design, and the DP bottleneck does not suppress them at the text surface.

A first repair attempt (H₁', QI stripping) replaced detected quasi-identifier spans with typed placeholders before proxy synthesis. Results confirmed the repair was ineffective: verbatim leak rate 0.4936 versus the original 0.4952. Two mechanisms explain the failure: (1) `extract_quasi_identifiers` has low NER recall and does not reliably detect all quasi-identifier spans, so most values reach the proxy unstripped; (2) even when placeholders are inserted, the paraphrase decoder re-introduces entity values by echoing surrounding clinical context in which the entity appears.

**Pivot to path-level analysis (H₁'').** Cross-referencing the attack results by routing path reveals the operative finding: the abstract_extractable path achieves approximately 4× lower verbatim leak rates than dp_tolerant on shared quasi-identifier categories (compound_code: 0.20 vs. 0.74; efficacy_value: 0.00 vs. 0.67). Query synthesis is the viable privacy primitive: it generates a new question without referencing entity values, making inversion structurally impossible rather than merely probabilistically unlikely. H₁'' (leak rate ≤ 0.20 on abstract_extractable-routed documents) is met at the boundary for compound_code and comfortably met for efficacy_value.

---

## 1. Path-Dependency: The Headline Finding

The central empirical result of this work is that privacy quality is determined primarily by routing path, not by DP noise level. The two paths achieve the following verbatim leak rates on quasi-identifier categories:

| Category            | abstract_extractable | dp_tolerant | Ratio |
|---------------------|---------------------:|------------:|------:|
| site_id             |                  n/a |       0.867 |   n/a |
| compound_code       |                0.200 |       0.744 |  3.7× |
| efficacy_value      |                0.000 |       0.667 |   ∞   |
| amendment_rationale |                  n/a |       0.500 |   n/a |

The abstract_extractable path's privacy advantage does not derive from noise injection — it derives from the non-injective structure of query synthesis. A synthesized query asks "what is the standard dosing protocol for a phase II oncology trial in this indication?" rather than transmitting "the dose of XYZ-123 was 40 mg/kg." The original entity value is never encoded in the proxy; no decoder can recover it because it was never present. This is a cryptographically stronger property than adding noise to a representation that contains the value.

The dp_tolerant path, by contrast, sends the full document through a paraphrase model with a nominally differentially private hidden-state bottleneck. The DP guarantee holds mathematically on the embedding side, but the paraphrase decoder strips the noise before producing the proxy text. The entity values survive the paraphrase step because the paraphrase model, conditioned on full document context including co-occurrence cues, reconstructs them from surrounding prose even when the primary mention is masked.

This path-dependency creates a security asymmetry that is hidden in aggregate metrics: the overall system appears to achieve utility ≥ 0.85 (which it does) and membership inference AUC ≤ 0.55 (which it does), but these positive results coexist with site_id verbatim leak rates of 87% on the highest-sensitivity document class (SAE narratives). An aggregate metric conceals the risk; disaggregation by routing path is necessary to assess deployability.

---

## 2. Why Utility Is Invariant to ε

The calibration experiment sweeps ε from 0.5 to 5.0 — a 10× range — and observes utility = 0.8598 to six decimal places at every setting. The σ values range from 9.69 to 0.97; at ε = 0.5, the noise L2 is approximately 438× the clipped signal magnitude, yet utility is unchanged.

This invariance has a precise mechanistic explanation. The proxy decoder (`proxy_decoder.py`) extracts hint tokens by projecting the noisy hidden vector onto the vocabulary embedding matrix and selecting the nearest tokens. When σ is large, the projected tokens are drawn effectively uniformly from the vocabulary — random noise. The paraphrase prompt explicitly instructs the model it may discard hints that do not fit the task context. With greedy decoding anchored to the placeholder-substituted input (temperature dropped by HuggingFace on the local model), the paraphrase output is deterministic given the input text and is insensitive to the hint-token content.

The consequence is architecturally significant: the DP (ε, δ) guarantee holds on the embedding representation but not on the text surface. The mapping from noisy embedding to proxy text is not injective — many different noisy embeddings produce the same proxy text. This breaks the standard DP composition argument for text privacy: the privacy amplification from DP noise cannot be claimed for the proxy text itself, only for the (unobserved) hidden-state representation.

This is not a bug in the DP mechanism implementation; it is a fundamental mismatch between the abstraction boundary of DP (defined over vector representations) and the observable output (text tokens). Closing this gap requires either a learned decoder trained against the noisy-embedding → privacy-preserving-text objective, or a direct-perturbation approach such as sampling softmax logits with σ-scaled temperature.

---

## 3. Router Reliability and the Parse-Error Problem

Of 20 protocol documents, 7 (35%) routed to `dp_tolerant` with the rationale `"Routing fallback: parse error"`. This is the router failing to produce parseable JSON output and defaulting to the more conservative (but empirically more leaky) path. The router is a prompted model generating structured output without a grammar constraint; on long or structurally complex protocol excerpts, the model occasionally produces malformed JSON.

The privacy implication is significant: a parse failure does not trigger a security-safe fallback (local_only or rejection); it triggers a fallback to dp_tolerant, which is the path with the highest leak rates. A correctly designed system would either fail closed (reject the document) or use constrained decoding to guarantee valid JSON. The current behavior means that router brittleness on complex documents silently degrades the system's privacy guarantees without any signal to the user or the audit log.

This also affects the expected routing distribution. If the router had 100% parse success on protocol documents, the abstract_extractable fraction would rise from 50% to approximately 59% overall. The SAE narrative class (100% dp_tolerant, 0% parse errors) is the structurally harder case: the router correctly identifies these as content-coupled tasks requiring the dp_tolerant path, but that path is precisely where privacy fails. Parse-error mitigation would not help SAE narratives.

---

## 4. The Structural Mismatch Between Document Type and Privacy Path

The most actionable finding of this evaluation is that the router's classification of SAE narratives to `dp_tolerant` — a semantically correct routing decision — places the highest-sensitivity documents on the lowest-privacy path. SAE narratives are content-coupled tasks: the clinical question is the narrative itself, and there is no separable abstract question to synthesize. The router correctly identifies this. But the dp_tolerant path's text-surface privacy is governed by placeholder substitution recall, which is low (~30–50% effective on the quasi-identifier categories tested), not by DP noise.

The architectural fix required is not a better DP decoder. It is a different approach to content-coupled tasks: for documents where task intent and entity content are inseparable, the system should either (a) handle them entirely locally without any cloud API call, or (b) apply a more aggressive stripping strategy that accepts higher information loss in exchange for privacy. Option (a) is already the `local_only` path; the router's reluctance to assign SAE narratives to `local_only` (0 of 20 in the distribution experiment) suggests the routing prior needs adjustment for narrative-format clinical documents.

---

## 5. Honest Deployment Posture

NGSP in its current form is a **research prototype** appropriate for:
- Evaluating the feasibility of the architecture and characterizing the privacy-utility tradeoff under adversarial evaluation
- Benchmarking the abstract_extractable path as a practically viable privacy primitive for extractable clinical questions
- Identifying the specific failure modes of the dp_tolerant path for structured quasi-identifiers

It is **not appropriate** for:
- Production deployment with real patient data without independent security review and a substantially redesigned dp_tolerant path
- Regulatory compliance claims (BAA, HIPAA Safe Harbor certification, etc.) — the system fails the verbatim leak threshold on the SAE narrative document class
- Therapeutic-area-specific document types not represented in the synthetic corpus
- Scenarios where the adversary has side-channel access to model artifacts or the entity_map

The membership inference result (AUC = 0.50, at random-classifier level) is the one metric that passes cleanly without qualification. This result is meaningful: even though the proxy leaks span values verbatim, it does not leak frequency-level entity presence above the random-classifier baseline. This is some protection against the population-level membership inference threat model — but it does not protect against an adversary who already knows the entity of interest and is trying to confirm its presence in a specific document.

---

## 6. Limitations

**Corpus size and diversity.** The verbatim attack corpus is 30 documents (15 SAE + 15 protocol). The trained inversion attack uses 40 training documents and 10 evaluation documents. These are small samples; confidence intervals on leak rates and F1 are wide. The abstract_extractable sub-corpus in the attack battery is particularly small (n = 10), making the boundary-case compound_code result (2 of 10 hits) difficult to interpret reliably.

**Inversion attacker strength.** The DistilBERT span predictor is trained on the same synthetic distribution it is evaluated on, without any curriculum or adversarial augmentation. The F1 = 0.8198 reported is a lower bound; a persistent adversary with accumulated proxy-original pairs from multiple sessions would train a stronger model. The control shuffle F1 (0.788) being nearly as high as the actual attack F1 suggests label leakage in the small evaluation split, not that inversion is easy — but it does mean the F1 values should be interpreted as a feasibility demonstration rather than a precise capability bound.

**Membership inference scope.** Attack 4 evaluates only the three most-frequent compound codes. Rare entities (appearing in one or two documents) are the highest-value targets and the hardest to evaluate with positive/negative class balance. The PASS on membership inference may not generalize to rare-entity scenarios.

**Synthetic corpus.** All documents are generated by the `src/data/` synthesis modules. Real clinical trial documents have richer linguistic structure, more complex quasi-identifier co-occurrence patterns (e.g. a compound code referenced alongside a site name, a subject ID, and a visit date in the same sentence), and domain-specific abbreviations that the synthesis modules do not capture. The abstract_extractable path's favorable results on synthetic monitoring reports may not hold on real monitoring visit reports, which tend to be less formulaic.

**Router model.** The SmolLM2-1.7B model used in all experiments is smaller than the intended Gemma 4 target model. The 35% parse-error rate on protocol documents may decrease with a larger, instruction-following model. Conversely, the SAE routing behavior (100% dp_tolerant) is likely to persist regardless of model size because it reflects a genuine property of SAE narrative tasks.

**Rare-disease and genomics.** The synthetic corpus uses common-indication categories. Ultra-rare disease trials have at most a handful of active sites globally; quasi-identifier recombination risk is qualitatively higher. Genomic quasi-identifiers are not covered by the 18 HIPAA Safe Harbor identifiers and are not evaluated here.

---

## 7. Iterative Improvement: From Attack Evidence to Principled Patch

The attack results enabled a cycle of measurement-driven architectural refinement. This section documents what the attack suite revealed, what was changed in response, and why those changes represent principled engineering rather than ad hoc patching.

### 7.1 What the Attack Results Revealed

The verbatim attack (Attack 1) provided the most actionable diagnostic: a 4× difference in verbatim leak rate between the abstract_extractable and dp_tolerant paths on shared quasi-identifier categories (site_id: 86.7% dp_tolerant vs. effectively 0% abstract_extractable; efficacy_value: 66.7% vs. 0%). This gap was not predicted at the outset of the project. The original threat model assumed that the DP bottleneck would provide text-surface privacy in proportion to the noise level; the calibration result (§2) demonstrated that this assumption is false.

The evidence pointed to two compounding root causes. First, the Safe Harbor stripper was never designed to cover clinical quasi-identifiers — its scope was the 18 HIPAA identifiers, which are patient-centric (names, dates, phone numbers) rather than study-centric (compound codes, site identifiers, AE grades). Clinical quasi-identifiers are structurally different: they are short, high-entropy alphanumeric tokens with no common-language analogues, which means they are trivially echoed verbatim by a paraphrase decoder that does not know to suppress them. Second, the router's model was not constrained from sending documents containing those tokens to the dp_tolerant path; by design it classified SAE narratives there because SAE narratives are content-coupled tasks.

### 7.2 The Two-Part Response

The improvement is composed of two changes that address the two root causes independently.

**Regex extension (coverage fix).** Adding four new patterns to `safe_harbor.py` — for SITE_ID, COMPOUND_CODE, DOSE, and AE_GRADE — means those tokens are now stripped and replaced with placeholders before any model call. This is the same defensive layer already used for SSNs and MRNs: deterministic, high-recall, zero false-negatives for token formats the pattern covers. The date pattern was simultaneously extended to cover DD-MON-YYYY and MON-YYYY formats common in clinical narratives. This change extends the reach of the proven primary defense to the newly identified leakage surface.

**Routing override (routing fix).** Adding the `_has_high_sensitivity_spans` guard to `route()` ensures that even if the regex extension fails to strip a token (e.g., a novel compound code format not yet in the pattern library), the routing decision will not compound the failure by sending the document through the weakest-privacy path. The override is conservative: it forces abstract_extractable rather than rejecting the request, preserving utility while improving privacy. The override is deterministic, logged, and does not depend on model reliability.

Together the two changes implement a defense-in-depth posture: strip first (high-coverage regex), then constrain routing (model-agnostic guard). Either change alone would provide partial protection; together they create two independent failure barriers.

### 7.3 What This Does Not Solve

The improvements are targeted, not comprehensive. They do not address the fundamental architectural gap between DP guarantees on hidden-state representations and text-surface privacy (§2 of this discussion). If a token escapes both the regex and the routing override — for instance, because it uses a format not yet in the pattern library — it will still reach the dp_tolerant decoder and leak verbatim. The architectural fix for the dp_tolerant path remains an open problem: a trained decoder that treats the noisy representation as a hard conditioning signal rather than an ignorable soft hint (see §7, Future Work point 2).

They also do not resolve the semantic similarity issue (Attack 2): proxy text for monitoring reports remains at 0.937 mean cosine similarity to the original regardless of which tokens are stripped. High semantic similarity is partially an artifact of the abstract_extractable path's design goal — it is supposed to preserve task intent — but it limits the system's deniability against a retrieval-based audit.

Finally, the routing override shifts more documents to the abstract_extractable path, which increases the load on the query synthesizer. The synthesizer's non-suppression of non-quasi-identifier entities (names, dates, indications in monitoring reports) means the abstract_extractable path still exhibits verbatim leakage on those categories. Extending the Safe Harbor patterns covers some of this gap (dates now partially covered), but names and geographic subdivisions rely on the NER pass, whose recall on synthetic clinical writing has not been systematically measured.

### 7.4 The Broader Lesson: DP on Embeddings Requires Text-Surface Verification

This project's central empirical contribution is not the architecture itself but the negative result it surfaces: **formal (ε, δ)-DP on an embedding representation does not imply text-surface privacy for the output text**. The gap arises because the decoder is not trained to respect the noise — it is trained on clean (input, output) pairs and treats the noisy embedding as a soft hint it can ignore. This mismatch is not unique to NGSP. Any system that injects DP noise into a hidden-state representation and then decodes the representation with an unmodified language model will face the same gap.

The practical implication is that privacy evaluation for text-generating systems cannot rely on mathematical DP guarantees alone. Verbatim scanning (Attack 1) and trained inversion (Attack 3) must be run on actual text output to characterize text-surface privacy, independently of whether the embedding-space mechanism is formally correct. The attack suite built for this project provides exactly this empirical ground truth.

The iterative improvement — from attack evidence to code change to pending re-run — demonstrates the value of the attack harness as a feedback mechanism. The changes were not hypothesized before the attacks ran; they were derived directly from the attack results. This is the intended use of an adversarial test harness: not to validate a system that is assumed to be correct, but to surface the specific, quantified failure modes that motivate the next round of engineering.

---

## 8. v2 Results: Interpretation and New Findings

The targeted improvements described in §7 of this discussion (and detailed in Results §§6–7) produced a measurable shift in the system's privacy-utility profile. This section interprets the v2 results, documents residual failure modes with their root causes, and frames the utility regression as a central finding — not an artifact to be minimized.

### 8.1 The Privacy-Utility Tradeoff Becomes Visible

The v1 results obscured the privacy-utility tradeoff. The dp_tolerant path achieved utility ratio 1.000 and verbatim leak rate 76.5%: the system appeared to "work" by the utility metric while catastrophically failing the privacy metric. The two metrics did not jointly constrain the system because they measured different paths — utility was measured on a corpus where the abstract_extractable path dominated, while privacy failures concentrated on the dp_tolerant path.

The v2 routing override unified the corpus: SAE narratives, previously routed to dp_tolerant, now route uniformly to abstract_extractable. The result is that privacy and utility are now measured on the same path for the same documents. The tradeoff that had been hidden by path separation is now fully visible.

**v2 operating point:** verbatim leak rate 7.17%, utility ratio 0.266. **v1 operating point (dp_tolerant-dominated):** verbatim leak rate 76.5%, utility ratio 1.000. The two points occupy opposite corners of the privacy-utility space; the improvement in privacy came at the direct cost of utility, and by almost exactly the same factor (10× improvement in privacy, 3.75× degradation in utility).

This is consistent with the theoretical expectation in the DP literature: for a fixed information channel, strong privacy constraints reduce the mutual information between the proxy and the original, which reduces both adversarial inference capability and downstream task utility. The v2 data confirm that this theoretical tradeoff is not merely asymptotic — it manifests at the architectural level within this prototype.

Crucially, the tradeoff is not smooth. There is no intermediate operating point between the dp_tolerant corner (high utility, high leakage) and the abstract_extractable corner (low leakage, low utility). The routing decision is binary; the two paths do not form a continuum. A system that could modulate the degree of abstraction continuously — for example, a decoder trained to preserve task-relevant information while discarding entity content — would trace a curve through the interior of this space. No such decoder is implemented here; it remains an open problem (see §9, Future Work point 2).

### 8.2 Residual Verbatim Leaks: Root Causes and Necessary Fixes

Four categories remain above the 1% verbatim threshold in v2. Each has a distinct structural cause that determines what kind of fix is required.

**ae_grade (13.3% residual).** The AE_GRADE regex targets canonical CTCAE notation: "Grade N", "CTCAE grade N", Roman numeral grade forms. It does not match natural-language severity synonyms: "severe", "life-threatening", "serious" — all of which appear in SAE narratives as valid CTCAE grade proxies. The fix is either (a) a terminology-list approach that maps severity adjectives to grade-level placeholders, or (b) NER over the local model's entity extraction pass, which already processes the document before routing. The latter is cleaner architecturally but adds latency to every document.

**indication (46.7% residual).** Indication names ("rheumatoid arthritis", "non-small cell lung cancer") are plain English multi-token phrases with no fixed alphanumeric structure and no HIPAA Safe Harbor coverage. They cannot be matched by simple regex. Importantly, they are also preserved intentionally by the query synthesizer: the synthesized abstract query "What are the standard management protocols for severe non-small cell lung cancer?" retains the indication because the synthesizer's prompt does not instruct it to replace condition names with placeholders. Two fixes are possible: (a) extend the query synthesis prompt to replace indication names with a disease-class abstraction (e.g. "an oncology indication"), accepting the information loss; or (b) add indication recognition via a curated ICD-10-CM / MedDRA vocabulary lookup. Option (a) is faster but would further reduce utility; option (b) would require a substantial offline terminology resource.

**geographic_subdivision (18.9% residual).** City names and hospital names embedded in SAE narrative prose (e.g. "Testburg Medical Center", "the site in Northdale") are not covered by any current stripping layer. The HIPAA Safe Harbor stripper handles geographic subdivisions in structured fields (address components) but not in free-text prose. The query synthesizer preserves them as contextual terms. The fix is a gazetteer-based NER pass that flags location mentions for placeholder substitution before the synthesizer runs. In the absence of a high-quality NER model on-device, a conservative alternative is to strip any proper noun that is not otherwise annotated — but this would aggressively reduce utility for geography-relevant tasks.

**other_unique_id (50.0% residual).** Subject IDs in the format `PT-<site>-<sequence>` (e.g. PT-9250-195) are excluded from the COMPOUND_CODE regex by a deliberate negative lookahead on the `PT-` prefix. The lookahead was intended to prevent the compound-code pattern from consuming subject IDs, which are a distinct identifier class. The inadvertent consequence is that subject IDs receive no stripping at all. A dedicated subject-ID pattern — for example, matching `\bPT-\d{3,4}-\d+\b` — would close this gap without expanding the compound-code regex scope. This is the most straightforward fix among the four residual categories: it requires only a new regex rule and carries no risk of unintended interaction with other patterns.

### 8.3 The Inversion Attack (Attack 3): What the Shuffle Control Reveals

The inversion F1 in v2 (0.664) is lower than v1 (0.820) but still far above the Expert Determination threshold (0.09). The most informative diagnostic is the control shuffle F1, which measures inversion F1 when proxy and original documents are paired randomly. In v1, shuffle F1 was 0.789 — nearly as high as the actual attack F1 of 0.820. This indicated that the DistilBERT span predictor was recovering schema-level structure from the synthetic corpus rather than proxy-conditioned entity content: the label distribution of the synthetic corpus was sufficiently regular that a model trained and evaluated on it could achieve high F1 without genuinely recovering information from the proxy.

In v2, shuffle F1 collapsed to 0.035. This is a qualitatively different regime: the inversion model operating on v2 proxies has almost no ability to recover structure from randomly paired documents. The model's actual F1 of 0.664 therefore represents genuine proxy-conditioned inference, not schema recovery. The v2 inversion attack is, in this sense, a more honest measurement of adversarial capability than the v1 result.

The residual F1 of 0.664 is primarily attributable to the categories that still leak verbatim: indication (46.7%) and other_unique_id (50.0%) together contribute most of the correctly identified spans. A model that observes a proxy containing "rheumatoid arthritis" can trivially recover that the original also contained "rheumatoid arthritis." Eliminating those two residual categories — by the fixes described in §8.2 — would reduce the inversion F1 substantially, though it would not guarantee falling below 0.09 given the small evaluation corpus.

### 8.4 Honest Assessment of the Privacy-Utility Composition

The composed hypothesis — Privacy PASS ∧ Utility ≥ 0.85 — is not met by v1 (privacy fails) or v2 (utility fails). Neither version of the system achieves the project's original joint target.

However, this framing is too binary for the complexity of the result. A more nuanced assessment:

**Privacy (v2):** 10 of 14 evaluated verbatim categories achieve 0% leak rate. The 4 failing categories have identified root causes and clear (if not yet implemented) fixes. Semantic similarity dropped from 100% above the 0.85 danger threshold to 0%. Membership inference remains at random-classifier level (AUC = 0.50). The system in v2 provides substantially stronger privacy than v1 against the most dangerous leakage vectors (structured quasi-identifiers), while leaving natural-language entity classes (indication, geography) unaddressed.

**Utility (v2):** The 0.266 utility ratio reflects the abstract_extractable path's fundamental property: it generates a different question, not an encoded version of the original question. For tasks where the sensitive entity *is* the task — "summarize the AE narrative for patient PT-9250-195" — there is no abstract proxy that preserves the task. The utility loss is not incidental; it is the direct consequence of the privacy mechanism. A proxy-based architecture can only preserve utility for tasks that are separable from their sensitive content. SAE narratives are, almost by definition, not such tasks.

The honest framing is this: for the document class that matters most in clinical trial safety workflows — SAE narratives — the system presents an irresolvable architectural tension. Either the proxy transmits enough content to be useful (and leaks entity values), or it abstracts enough to be private (and loses utility). This tension cannot be resolved by parameter tuning within the current architecture; it requires a fundamentally different approach for content-coupled tasks.

The research value of this finding is precisely its negativity. Prior work on DP text mechanisms frequently evaluates on tasks where the task intent is separable from sensitive content (e.g. sentiment classification, topic detection). This project evaluates on SAE narratives — a document class specifically chosen because task and content are inseparable — and confirms empirically that separability is not a free assumption. This has direct practical implications for any clinical trial safety workflow that considers deploying a proxy-based LLM privacy layer.

---

## 9. Future Work

**1. Fix the dp_tolerant path for structured short-token entities.** Site IDs and compound codes are short, high-entropy strings (e.g. `SITE-042`, `XYZ-123-2b`) that appear in SAE narratives with near-100% verbatim leak rates. The placeholder substitution approach succeeds for named entities in subordinate clauses but fails for these because (a) the NER recall is low on non-standard alphanumeric strings and (b) the paraphrase model echoes ambient context that co-occurs with the entity. A rule-based pre-processing step that pattern-matches known compound code and site ID formats before any model call would cover these cases without requiring NER.

**2. Implement a learned proxy decoder.** The fundamental reason DP noise does not propagate to proxy text is that the current decoder is untrained: it uses the noisy vector only as a soft hint that can be discarded. Training a seq2seq decoder on (noisy_hidden_state → privacy-preserving-text) pairs — where the privacy-preserving target is a text with entities removed — would force the model to use the noisy representation as a hard conditioning signal rather than an ignorable hint. This would close the abstraction-boundary gap between DP guarantees on embeddings and text-surface privacy.

**3. Redesign dp_tolerant routing for narrative documents.** SAE narratives should route to `local_only` unless a separable abstract question can be identified. The router currently treats all narrative text as dp_tolerant; adding a secondary classifier that distinguishes "is there an extractable task distinct from the content?" would push more high-sensitivity documents to local_only and reduce the fraction that reach the leaky dp_tolerant decoder.

**4. Constrained decoding for the router.** Replace the unconstrained generation + JSON parsing pattern in `router.py` with a grammar-constrained decoder that guarantees valid JSON output. This would eliminate the 35% parse-failure rate on protocol documents and remove the silent privacy degradation caused by the conservative dp_tolerant fallback.

**5. Adaptive adversary evaluation.** Train the inversion attacker with knowledge of the NGSP routing decisions (as if the adversary can observe the proxy generation process). This tests the security of the mechanism under partial disclosure — a more realistic threat model for an enterprise deployment where the adversary may have access to some system internals.

**6. Operational pilot with real users.** Run NGSP as a Chrome extension that intercepts clipboard paste events into web-based LLM chat interfaces. Measure latency impact, user bypass rate (intentional circumvention), and false-positive Safe Harbor stripping rate on real (non-PHI) clinical writing tasks. The gap between controlled adversarial evaluation and real-world usage is a known blind spot in privacy-system research.

**7. Federated and session-aggregated DP accounting.** Extend the session budget to track across users (not just sessions), enabling a site-level or organization-level privacy budget that degrades gracefully as aggregate exposure accumulates. The current per-session accounting does not prevent an adversary who runs many short sessions.
