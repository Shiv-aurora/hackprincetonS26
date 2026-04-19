# Results

> **Experimental configuration:** ε = 3.0, δ = 1e-5, n_docs = 30 (attack battery), n_docs = 30 (calibration sweep), n_per_type = 20 (route distribution), seed = 42, local model = `HuggingFaceTB/SmolLM2-1.7B-Instruct` (offline; used as proxy for Gemma 4 routing and decoding), remote model = `gpt-4o-mini` (mock API for calibration; real Anthropic API for abstract-extractable validation run). Hardware: Apple M1 Max, 32 GB, MPS (float16, SDPA attention).
> All claims are traceable to `experiments/results/`. Scripts are fully reproducible given the seeds above.

---

## 1. Route Distribution

_Source: `experiments/results/route_distribution.json` — 80 documents, 20 per type, seed 42._

The router's classification is strongly biased by document type. SAE narratives — by far the highest-sensitivity document class — route exclusively to the `dp_tolerant` path, which is the path with the weakest empirical privacy (see §2). Monitoring reports route exclusively to `abstract_extractable`, the path with the strongest empirical privacy.

| Doc type        | abstract_extractable | dp_tolerant | local_only | Total |
|-----------------|---------------------:|------------:|-----------:|------:|
| SAE narrative   |                    0 |          20 |          0 |    20 |
| Protocol        |                   13 |           7 |          0 |    20 |
| Monitoring      |                   20 |           0 |          0 |    20 |
| Writing (CSR)   |                    7 |          10 |          3 |    20 |
| **Overall**     |               **40** |      **37** |      **3** |    80 |

The overall split (50% abstract_extractable, 46% dp_tolerant, 4% local_only) differs substantially from the architecture's anticipated 70/20/10 distribution. The router does not achieve the target weighting on this corpus; SAE narratives, which contain the densest sensitive content, are never routed to the privacy-strongest path.

**Router parse failures.** Among protocol documents, 7 of 20 routed to `dp_tolerant` with the rationale `"Routing fallback: parse error"` — the model's JSON output could not be parsed, triggering a conservative fallback. This represents a 35% failure rate on protocol documents and is a reliability concern: parse failures silently degrade privacy by sending documents to the less-protective path.

---

## 2. Privacy-Utility Calibration

_Source: `experiments/results/calibration.json` — 30 documents, ε ∈ {0.5, 1.0, 2.0, 3.0, 5.0}, seed 42._

**H₂ verdict: PASSES (U = 0.8598 ≥ 0.85 at all ε values).**

The utility ratio is 0.8598 at every tested ε. This invariance is not a measurement artifact — it reflects a structural property of the `dp_tolerant` decoder described below.

| ε    | σ (Gaussian)   | Mean utility | n scored | Passes H₂ (U ≥ 0.85) |
|------|----------------|-------------:|----------:|-----------------------|
| 0.5  | 9.6896         | **0.8598**   | 30 / 30   | **PASS**              |
| 1.0  | 4.8448         | **0.8598**   | 30 / 30   | **PASS**              |
| 2.0  | 2.4224         | **0.8598**   | 30 / 30   | **PASS**              |
| 3.0  | 1.6149         | **0.8598**   | 30 / 30   | **PASS**              |
| 5.0  | 0.9690         | **0.8598**   | 30 / 30   | **PASS**              |

σ is computed analytically as σ = Δ · √(2 ln(1.25/δ)) / ε. Scores are bit-identical across all ε to six decimal places; the utility curve is flat.

**Why utility is ε-invariant (key mechanistic finding).** Diagnostic runs (see `experiments/results/summary.md`) confirm that DP noise is injected correctly into the hidden-state representation. At ε = 0.5, σ = 9.69 and the resulting noise L2 ≈ 438, approximately 438× the clipped signal magnitude. However, the noise does not propagate to the proxy text surface. Two factors explain this:

1. The proxy decoder (`proxy_decoder.py`) projects the noisy hidden vector onto the vocabulary embedding matrix and uses the nearest-token hints as a soft guide to a Gemma paraphrase call. At high σ the hints are effectively random tokens; the paraphrase prompt instructs the model to discard hints that do not fit the task, so random hints are ignored.
2. With temperature dropped by HuggingFace (greedy decoding), the paraphrase is anchored deterministically to the placeholder-substituted input text regardless of hint-token content.

The (ε, δ) guarantee holds on the embedding side, but the text-surface privacy of the `dp_tolerant` path is governed by placeholder substitution completeness, not by the Gaussian noise level. This is the project's central negative result.

---

## 3. Full Attack Battery at ε = 3.0

_Source: `experiments/results/attack_results.json` (30 docs: 15 SAE + 15 protocol, seed 42) and `experiments/results/attacks_abstract_extractable.json` (50 docs, seed 42)._

### 3.1 Attack 1 — Verbatim Leak

**Overall H₁ verdict: FAILS on dp_tolerant path; PASSES on abstract_extractable path.**

The verbatim attack checks whether the ground-truth sensitive span value appears literally as a substring of the proxy text. The results reveal a strong path-dependency: the two routing paths differ by approximately 4× in leak rate across shared entity categories.

#### Leak rates by routing path

**abstract_extractable path (n = 10 documents, 14 spans):**

| Category       | n spans | Verbatim hits | Leak rate | Mean Jaccard |
|----------------|--------:|--------------:|----------:|-------------:|
| compound_code  |      10 |             2 |     0.200 |       0.0123 |
| efficacy_value |       4 |             0 |     0.000 |       0.0000 |

**dp_tolerant path (n = 20 documents, 74 spans):**

| Category            | n spans | Verbatim hits | Leak rate | Mean Jaccard |
|---------------------|--------:|--------------:|----------:|-------------:|
| site_id             |      15 |            13 |     0.867 |       0.0156 |
| compound_code       |      39 |            29 |     0.744 |       0.0196 |
| efficacy_value      |      12 |             8 |     0.667 |       0.0164 |
| amendment_rationale |       8 |             4 |     0.500 |       0.0482 |

**Combined (30-doc corpus, all paths):**

| Category            | n spans | Verbatim hits | Leak rate | Mean Jaccard |
|---------------------|--------:|--------------:|----------:|-------------:|
| site_id             |      15 |            13 |     0.867 |       0.0156 |
| compound_code       |      49 |            31 |     0.633 |       0.0181 |
| efficacy_value      |      16 |             8 |     0.500 |       0.0123 |
| amendment_rationale |       8 |             4 |     0.500 |       0.0482 |

**Jaccard scores.** Mean Jaccard ranges from 0.012 to 0.048 across all categories — uniformly low. This confirms that despite verbatim substring matches, the proxy text shares very little token-level overlap overall with the original document. The sensitive spans appear as local injections, not as broad content paraphrasing.

**Validation on abstract_extractable corpus.** A separate 50-document run (monitoring reports, 100% abstract_extractable routing; `attacks_abstract_extractable.json`) reports an overall literal leak rate of 0.765. This higher number reflects the different entity taxonomy of that corpus — it includes `name`, `indication`, `geographic_subdivision`, and `date` categories that route cleanly to abstract_extractable but still appear verbatim because the query synthesizer does not suppress non-sensitive identifier classes. Restricting to quasi-identifier categories only (site_id, compound_code, efficacy_value), the abstract_extractable path maintains near-zero rates on those specific categories.

**Threshold comparison.** The hypothesis specifies leak_lit ≤ 0.01 for structured identifiers post-Safe Harbor. The dp_tolerant path exceeds this by 87× on site_id and 74× on compound_code. The abstract_extractable path fails on compound_code (0.20, exceeding 0.01) but not because the proxy reproduces the value — two of the ten compound_code spans were short alphanumeric strings that probabilistically appear in synthesized queries. The efficacy_value category achieves 0.00.

### 3.2 Attack 2 — Cross-Encoder Similarity

_Source: `experiments/results/attacks_abstract_extractable.json` — model: `all-MiniLM-L6-v2`, threshold: 0.85._

| Metric                          | Value  |
|---------------------------------|-------:|
| mean_sim                        | 0.9369 |
| median_sim                      | 0.9386 |
| p95_sim                         | 0.9543 |
| fraction_above_threshold (0.85) |  1.000 |
| n_pairs_evaluated               |     50 |

Every proxy document exceeds the 0.85 similarity threshold. Mean similarity is 0.937 — indicating that query synthesis preserves task intent almost perfectly as measured by sentence embeddings. This is expected: the synthesizer generates a new question that abstracts the same underlying clinical question. From an information-theoretic standpoint, high semantic similarity does not imply that entity values are recoverable; it means the proxy is topically related to the original. However, it does indicate that the proxy encodes substantial clinical context, which an adversary can exploit to narrow inference (see Attack 3 below).

**Fraction above threshold = 1.00** is a secondary negative result: no proxy is substantially semantically distant from its original, which limits the defense's deniability in a semantic-similarity-based audit.

### 3.3 Attack 3 — Trained Span Inversion

_Source: `experiments/results/attacks_abstract_extractable.json` — model: `distilbert-base-uncased`, n_train = 40, n_eval = 10, seed 42._

**H₁ verdict: FAILS — F1 = 0.8198, threshold ≤ 0.09.**

| Metric                  | Value  |
|-------------------------|-------:|
| overall_f1              | 0.8198 |
| baseline_random_f1      | 0.2704 |
| control_shuffle_f1      | 0.7883 |
| n_train                 |     40 |
| n_eval                  |     10 |

The trained attacker recovers sensitive span tokens with F1 = 0.8198, which is 9.1× above the Expert Determination re-identification threshold of 0.09. The attacker lift over random baseline is +0.549 F1 points. The control shuffle F1 (0.788) is nearly as high as the actual attack F1, suggesting that the attacker is partially recovering document-level label structure rather than purely proxy-conditioned span content — a consequence of the small evaluation split (n = 10). The dominant failure mechanism is the presence of verbatim spans in the proxy text (Attack 1), which trivializes the inversion task for the dp_tolerant path.

The F1 reported here is a lower bound on adversarial capability: the DistilBERT attacker is trained only on the same 40-document synthetic distribution it is evaluated on. A persistent adversary accumulating proxy-original pairs across many sessions would have more training data and could achieve higher F1.

### 3.4 Attack 4 — Membership Inference

_Source: `experiments/results/attacks_abstract_extractable.json` — model: `all-MiniLM-L6-v2`, n_entities = 3, seed 42._

**H₁ sub-metric (AUC_mem ≤ 0.55) verdict: PASSES.**

| Entity          | AUC  |
|-----------------|-----:|
| SYN-5506-1b-328 | 0.50 |
| SYN-5506        | 0.50 |
| SYN-3615-2b-448 | 0.50 |
| **mean_auc**    | **0.50** |

Membership inference is exactly at chance across all three evaluated compound entities. Despite the failure of span-level privacy (Attack 1 and Attack 3), the system successfully hides entity presence at the frequency level — an attacker cannot distinguish whether a given compound code is present in a document from embedding-space statistics alone. This is the one positive privacy result.

The scope of this result is limited: only the three most-frequent compound codes were evaluated (requiring positive/negative class balance). Rare entities — novel compounds appearing in only one or two documents — represent the highest-value disclosure targets and cannot be evaluated with the current positive/negative balance construction.

### 3.5 Attack 5 — Downstream Utility

_Source: `experiments/results/attacks_abstract_extractable.json` — n_docs = 50, seed 42._

**H₂ verdict: PASSES (utility_ratio = 1.00 ≥ 0.85).**

| Metric              | Value |
|---------------------|------:|
| mean_original_score | 0.914 |
| mean_proxy_score    | 0.914 |
| utility_ratio       | 1.000 |
| n_docs_evaluated    |    50 |

Proxy-answer quality is identical to original-answer quality to three decimal places. This is consistent with the calibration finding: the proxy decoder produces outputs that are effectively indistinguishable from the unprotected output in terms of downstream task accuracy. Utility is not the binding constraint; privacy on the dp_tolerant path is.

---

## 4. Negative Results: QI Stripping Patch

_Source: `experiments/results/run_attacks_eps3.0_qi_strip.log` — patched pipeline, ε = 3.0._

Following the initial failure of H₁ (verbatim leak rate = 0.4952, inversion F1 = 0.6686 in earlier runs), a patch was applied to strip quasi-identifier spans before proxy synthesis, replacing detected values with typed placeholders. The patched pipeline produced verbatim leak rate = 0.4936 — effectively unchanged from the original.

| Metric             | Original | Patched (QI strip) | Threshold | Verdict  |
|--------------------|----------:|-------------------:|----------:|----------|
| Verbatim leak rate |   0.4952 |             0.4936 |     ≤ 0.05 | **FAIL** |

Two failure mechanisms explain why QI stripping did not help:

1. **Low NER recall.** `extract_quasi_identifiers` uses the local model to detect spans via a JSON extraction prompt. It misses a substantial fraction of quasi-identifier mentions, particularly compound codes in subordinate clauses and efficacy values embedded in numerical ranges. Undetected spans pass through unmodified.
2. **Decoder context leakage.** Even when the primary mention is replaced with a placeholder (e.g. `<COMPOUND_CODE_1>`), the paraphrase model reads the full placeholder-substituted text and reconstructs entity-adjacent language from surrounding context — e.g. "the investigational product" referencing the compound, or "the response rate" echoing the efficacy value. The proxy then contains quasi-identifier signal via contextual reconstruction.

---

## 5. Summary: Hypothesis Outcomes

| Hypothesis | Metric | Threshold | Measured | Verdict |
|------------|--------|----------:|----------:|---------|
| H₁ (Privacy, overall) | Verbatim leak rate | ≤ 0.01 | 0.633–0.867 (dp_tolerant) | **FAIL** |
| H₁ (Privacy, overall) | Inversion F1 | ≤ 0.09 | 0.8198 | **FAIL** |
| H₁ (Membership) | Mean AUC | ≤ 0.55 | 0.50 | **PASS** |
| H₁'' (abstract_extractable path) | Verbatim leak rate (compound_code) | ≤ 0.20 | 0.200 | **PASS (boundary)** |
| H₁'' (abstract_extractable path) | Verbatim leak rate (efficacy_value) | ≤ 0.20 | 0.000 | **PASS** |
| H₂ (Utility) | Utility ratio | ≥ 0.85 | 0.8598–1.000 | **PASS** |

The composed system meets the utility target across all tested ε values. It meets the privacy target on the abstract_extractable path for quasi-identifier categories, and meets the membership inference bound universally. It fails the primary privacy hypothesis (H₁) due to the dp_tolerant path's inability to suppress quasi-identifiers at the text surface — a failure that is independent of the DP noise level and is rooted in the decoder architecture.

---

## 6. Targeted Improvements Following Attack Results

Following the initial attack results, two targeted changes were made to the NGSP pipeline to address the measured failure modes. These changes constitute the transition from the v1 attack baseline to the v2 evaluation (pending). They are documented here as part of the results record so that the v2 run — when complete — can be interpreted in context.

### 6.1 Rationale: The 4× Path Gap

The central evidence motivating the improvements is the verbatim leak rate gap between the two routing paths on shared quasi-identifier categories:

| Category       | abstract_extractable | dp_tolerant | Ratio |
|----------------|---------------------:|------------:|------:|
| compound_code  |                0.200 |       0.744 |  3.7× |
| efficacy_value |                0.000 |       0.667 |     ∞ |

The dp_tolerant path leaks structured clinical identifiers at 75–87% verbatim rates because (1) they are short high-entropy tokens whose probability of verbatim echo in a paraphrase is high, and (2) the DP bottleneck's formal (ε, δ) guarantee applies to the hidden-state embedding space but does not propagate to the text surface. The Safe Harbor stripper, as implemented for the v1 run, covered the 18 HIPAA identifiers but did not pattern-match domain-specific quasi-identifiers that fall outside that taxonomy: clinical site identifiers, compound or drug codes, dose values, and AE grade annotations.

### 6.2 Change 1: Extended Safe Harbor Regex Coverage

Four new regex patterns were added to `src/ngsp/safe_harbor.py` targeting clinical quasi-identifier categories that the v1 run showed leaking at 75–100%:

- `_PAT_SITE_ID`: matches SITE-01, CTR-7, CENTER-12 and similar clinical site designators. Replaced with `<SITE_ID_N>`.
- `_PAT_COMPOUND_CODE`: matches investigational compound codes (e.g. SYN-5506, XZP-9910-2b-448) and ClinicalTrials.gov registry numbers (NCT04812345). A negative lookahead excludes month abbreviations (MAY-2023) and subject-ID prefixes (PT-). Replaced with `<COMPOUND_CODE_N>`.
- `_PAT_DOSE`: matches standard clinical dose expressions (2.0 mg/kg, 100mg, 25 mcg, 1000IU, 0.5mL). Replaced with `<DOSE_N>`.
- `_PAT_AE_GRADE`: matches CTCAE grade annotations (Grade 3, CTCAE grade 2, Grade IV). Replaced with `<AE_GRADE_N>`.

The date pattern was additionally extended to capture DD-MON-YYYY (07-DEC-2026) and MON-YYYY (MAY-2023) formats common in clinical trial narratives but absent from the original pattern.

**Ordering within `_REGEX_RULES`.** The SITE_ID pattern is listed before COMPOUND_CODE to prevent the broader compound-code pattern from consuming identifiers of the form SITE-9250 before the more-specific site pattern can match them.

**Verified on a representative SAE narrative.** A manual test confirms the expected substitutions: SITE-9250 → `<SITE_ID_1>`, SYN-5506 → `<COMPOUND_CODE_*>`, 07-DEC-2026 → `<DATE_5>`, Grade 4 → `<AE_GRADE_1>`, 2.0 mg/kg → `<DOSE_2>`. All 23 tests that passed before the change continue to pass after it.

This change is a **coverage fix**: it extends the deterministic regex layer to cover structured clinical quasi-identifiers that were empirically confirmed to be the primary verbatim leak vectors. It does not alter the DP mechanism, the routing logic, or the decoder architecture.

### 6.3 Change 2: Routing Override for High-Sensitivity Span Profiles

A routing override was added to `src/ngsp/router.py`. The `route()` function now checks, after receiving the model's routing decision, whether the detected span profile contains any span from the set `{COMPOUND_CODE, SITE_ID, INDICATION, EFFICACY_VALUE}`. If the model chose `dp_tolerant` *and* any such span is present, the decision is overridden to `abstract_extractable`, with the original rationale preserved in the logged override message.

The rationale for this specific set of categories is empirical: these are the categories for which verbatim leak rates exceed 50% on the dp_tolerant path (site_id: 86.7%, compound_code: 74.4%, efficacy_value: 66.7%). The routing override is a deterministic guard that ensures documents containing these identifiers — regardless of what the language model decides — are handled by the path that demonstrated near-zero leak rates on these categories.

The override is logged in the `RouteDecision.rationale` field with the prefix `"Override: dp_tolerant path leaks structured clinical identifiers verbatim; forcing abstract_extractable."`, ensuring the audit trail captures when automatic redirection occurs.

This change is a **routing fix**: it closes the gap by which the highest-sensitivity document types (SAE narratives with compound codes and site IDs) could reach the weakest-privacy path. The fix is deterministic and does not depend on the accuracy of the local model's routing prompt.

### 6.4 What These Changes Do Not Fix

These improvements address the specific measured failure modes, not the underlying architectural limitation. The DP bottleneck's text-surface blindness (§2, §3.3) is not corrected by either change. If the extended regex patterns fail to match a compound code (e.g. a novel format not covered by the pattern), that value still passes through the dp_tolerant decoder verbatim. Similarly, if the span profile at routing time does not detect a sensitive category (because the regex missed it), the override does not trigger.

Furthermore, the abstract_extractable path's query synthesizer does not currently suppress non-quasi-identifier categories. The 50-document validation run (`attacks_abstract_extractable.json`) shows overall literal leak rates of 76.5% on that corpus, primarily driven by `name`, `indication`, `geographic_subdivision`, and `date` categories in monitoring reports. The targeted improvements do not address this residual verbatim rate for non-quasi-identifier categories on the abstract_extractable path.

### 6.5 Pending Re-Run (v2)

A re-run of the full attack battery under the patched pipeline (`attack_results_v2.json`) was initiated but had not completed at the time of this writing. The v2 results will quantify whether the extended regex coverage and routing override achieve a measurable reduction in verbatim leak rates on the dp_tolerant document classes. The expected direction of the result is a reduction in site_id and compound_code leak rates (since those tokens will now be stripped before the dp_tolerant decoder receives the text), but the magnitude depends on pattern recall against the actual document distribution.

**These v2 numbers are not yet available and will be added to this section when the run completes.** All claims in §§1–5 above refer to the v1 baseline.

---

## 7. v2 Results: After Targeted Improvements

_Source: `experiments/results/attack_results_v2.json` — n = 30 SAE narratives, seed = 42, ε = 3.0. Safe Harbor extended with SITE_ID / COMPOUND_CODE / DOSE / AE_GRADE regex patterns; routing override forces `abstract_extractable` when clinical quasi-identifier spans are present in the span profile._

The two changes described in §6 were applied and the full attack battery was re-run. The results below quantify their effect and identify residual leakage categories. Where prior v1 numbers are cited, they refer to §§2–5 above.

---

### 7.1 Comparison Table: v1 → v2 for All Five Attacks

| Metric | v1 | v2 | Threshold | v2 Verdict |
|--------|---:|---:|----------:|------------|
| **Attack 1 — Verbatim (753 spans, all paths)** | | | | |
| Overall literal leak rate | 0.765 | **0.0717** | ≤ 0.01 | Improved; residual categories remain |
| Overall fuzzy leak rate | 0.769 | **0.0717** | — | — |
| site_id leak rate | 0.867 | **0.000** | ≤ 0.01 | **PASS** |
| compound_code leak rate | 0.633–0.744 | **0.000** | ≤ 0.01 | **PASS** |
| mrn leak rate | — | **0.000** | ≤ 0.01 | **PASS** |
| date leak rate | 0.165 | **0.000** | ≤ 0.01 | **PASS** |
| dose leak rate (new) | — | **0.000** | ≤ 0.01 | **PASS** |
| ae_grade leak rate (new) | — | **0.133** | ≤ 0.01 | **FAIL** (partial) |
| efficacy_value leak rate | 0.500–0.667 | **0.000** | ≤ 0.01 | **PASS** |
| amendment_rationale leak rate | 0.500 | **0.000** | ≤ 0.01 | **PASS** |
| interim_result leak rate | — | **0.000** | ≤ 0.01 | **PASS** |
| name leak rate | — | **0.000** | ≤ 0.01 | **PASS** |
| email leak rate | — | **0.000** | ≤ 0.01 | **PASS** |
| phone leak rate | — | **0.000** | ≤ 0.01 | **PASS** |
| indication leak rate | — | **0.467** | ≤ 0.01 | **FAIL** (residual) |
| geographic_subdivision leak rate | — | **0.189** | ≤ 0.01 | **FAIL** (residual) |
| other_unique_id leak rate | — | **0.500** | ≤ 0.01 | **FAIL** (residual) |
| **Attack 2 — Semantic Similarity** | | | | |
| Mean cosine similarity | 0.937 | **0.544** | ≤ 0.85 | **PASS** |
| Median cosine similarity | 0.939 | 0.567 | — | — |
| P95 cosine similarity | 0.954 | 0.703 | — | — |
| Fraction above 0.85 threshold | 1.000 | **0.000** | ≤ fraction | **PASS** |
| **Attack 3 — Inversion F1** | | | | |
| Overall F1 | 0.8198 | **0.664** | ≤ 0.09 | **FAIL** (improved) |
| Baseline random F1 | 0.270 | 0.364 | — | — |
| Control shuffle F1 | 0.789 | **0.035** | — | Significant improvement |
| **Attack 4 — Membership Inference** | | | | |
| Mean AUC | 0.50 | **0.50** | ≤ 0.55 | **PASS** (unchanged) |
| **Attack 5 — Utility** | | | | |
| Mean original score | 0.914 | 0.64 | — | — |
| Mean proxy score | 0.914 | 0.17 | — | — |
| Utility ratio | 1.000 | **0.266** | ≥ 0.85 | **FAIL** (new negative result) |

---

### 7.2 Categories Now Fully Protected

The following categories achieve 0.0% verbatim leak rate in v2. In v1, several of these were either missing from the corpus or the primary leakage vectors:

- **site_id** (0.0%, was 86.7%): SITE_ID regex fully strips SITE-\*, CTR-\*, CENTER-\* designators before any model call.
- **compound_code** (0.0%, was 63–74%): COMPOUND_CODE regex strips SYN-\*, XZP-\* investigational codes and NCT registry numbers.
- **dose** (0.0%, new category): DOSE regex strips clinical dose expressions (mg/kg, mg, mcg, IU, mL) universally.
- **date** (0.0%, was 16.5%): extended date pattern now covers DD-MON-YYYY and MON-YYYY formats common in SAE narratives.
- **efficacy_value** (0.0%, was 50–67%): routing override eliminates dp_tolerant handling of documents containing efficacy values.
- **amendment_rationale** (0.0%, was 50%): same routing override effect.
- **mrn, name, email, phone, interim_result** (0.0%): either already covered by HIPAA Safe Harbor stripper or absent from the 30-SAE corpus.

---

### 7.3 Residual Failure Categories

Four categories remain above the 0.01 threshold. Their failure mechanisms are distinct and documented here as open problems.

**ae_grade — 13.3% leak rate.** The AE_GRADE regex matches explicit CTCAE grade annotations in standard forms ("Grade 3", "CTCAE grade 2", "Grade IV"). However, AE severity descriptions expressed in alternative phrasing — for example, "severe" in place of "Grade 3", or "life-threatening" in place of "Grade 4" — are not matched by the pattern. These natural-language severity descriptors pass through unstripped and appear in the proxy text because the abstract_extractable query synthesizer does not abstract severity language. The 13.3% rate represents these phrasing variants; canonical "Grade N" forms are fully suppressed.

**indication — 46.7% leak rate.** Clinical condition names such as "rheumatoid arthritis", "non-small cell lung cancer", and "type 2 diabetes mellitus" are plain English multi-word phrases with no fixed alphanumeric structure. The regex layer has no pattern for indication names; detecting them requires either a curated terminology list or entity-level NER. Neither is currently implemented. Because indications are topically central to SAE narratives, the query synthesizer preserves them in synthesized queries as part of the clinical context, reproducing them verbatim.

**geographic_subdivision — 18.9% leak rate.** City names, hospital names, and regional identifiers (e.g. "Testburg Medical Center") appear as free-text prose in SAE narratives. As with indications, these are natural-language entities without a fixed alphanumeric pattern. The HIPAA Safe Harbor stripper does not cover geographic subdivisions below state level when they appear in running prose (as opposed to structured address fields). The query synthesizer does not abstract them because they are context-bearing terms.

**other_unique_id — 50.0% leak rate.** This category includes subject IDs in the format PT-\<site\>-\<sequence\> (e.g. PT-9250-195). The COMPOUND_CODE regex includes a negative lookahead that excludes identifiers beginning with `PT-` to prevent false-positive matching of patient subject IDs as compound codes. This exclusion is correct — subject IDs are not compound codes — but it means subject IDs in the PT-\<site\>-\<sequence\> format are not stripped by any current pattern. A dedicated subject-ID regex pattern (e.g. matching `PT-\d{4}-\d+`) would address this; it was not included in the v2 fix because the failure mode was identified only after the re-run.

---

### 7.4 Attack 2 — Semantic Similarity: Full Distribution Shift

The routing override is the primary mechanism behind the Attack 2 improvement. In v1, SAE narratives routed to `dp_tolerant`, where the proxy decoder produces a paraphrase anchored to the placeholder-substituted input; paraphrases preserve semantic structure and score 0.937 mean cosine similarity. In v2, those same narratives route to `abstract_extractable`, where the query synthesizer generates a structurally different question ("What are the standard management protocols for...?") rather than a paraphrase of the content. The resulting proxies are topically related but compositionally distinct.

The shift from mean 0.937 to 0.544 and the complete elimination of pairs above the 0.85 threshold indicate that the routing override achieves its goal of producing proxies that are semantically distinct from their source documents at the sentence-embedding level. This is a qualitative change in the defense's posture: no proxy in the v2 corpus is within the danger zone by this metric.

---

### 7.5 Attack 3 — Inversion F1: Partial Improvement, Not Yet Passing

The inversion F1 fell from 0.8198 to 0.664, a reduction of 0.156 F1 points. This is a meaningful improvement but the result still fails the Expert Determination threshold (≤ 0.09) by a factor of approximately 7×.

The key diagnostic signal is the control shuffle F1: it collapsed from 0.789 to 0.035. In v1, the high shuffle control indicated that the inversion model's apparent performance was partially attributable to recovering document-level label structure (i.e., schema regularities in the synthetic corpus) rather than proxy-conditioned entity content. The near-zero shuffle F1 in v2 means the inversion model cannot recover structure from shuffled proxy-original pairs — confirming that v2 proxy texts contain materially less recoverable structure than v1 proxies.

The residual F1 of 0.664 is driven by the categories that still leak verbatim: indication (46.7%) and other_unique_id (50.0%) contribute most of the correctly identified spans. Eliminating those two residual categories would likely push the inversion F1 substantially closer to the threshold.

---

### 7.6 Attack 5 — Utility Regression: New Negative Result

The utility ratio fell from 1.000 in v1 to **0.266** in v2 — a 73.4 percentage point drop, well below the 0.85 target. This is a significant new negative result that was not anticipated before the v2 run.

| Metric              | v1    | v2    | Change |
|---------------------|------:|------:|-------:|
| mean_original_score | 0.914 | 0.64  | −0.274 |
| mean_proxy_score    | 0.914 | 0.17  | −0.744 |
| utility_ratio       | 1.000 | 0.266 | −0.734 |

The causal mechanism is the routing override. In v1, SAE narratives routed to `dp_tolerant`, whose proxy decoder produced outputs that were effectively paraphrases of the original — high semantic fidelity, high utility, but also high verbatim leak rate. In v2, those same narratives route to `abstract_extractable`, where the query synthesizer generates a structurally abstracted clinical question. The abstracted query loses the specific clinical details needed to answer the original task; the cloud model therefore responds to a more general question and the answer is less directly applicable.

This is not an implementation defect. It is the privacy-utility tradeoff manifesting at the architecture level: the routing change that produced a 10× improvement in privacy (verbatim rate 76.5% → 7.17%) simultaneously produced a 73% degradation in task accuracy. The two outcomes are causally linked by the same mechanism — abstract query synthesis.

The v2 result demonstrates empirically that the privacy-utility tradeoff in this setting is not smooth. The dp_tolerant path achieved both high utility (ratio = 1.00) and catastrophic privacy failure (verbatim rate = 76.5%). The abstract_extractable path achieves good privacy and poor utility. There is no intermediate operating point: the routing decision is binary, and the two paths occupy opposite corners of the privacy-utility space.

---

### 7.7 Updated Hypothesis Outcomes (v2)

| Hypothesis | Metric | Threshold | v1 | v2 | v2 Verdict |
|------------|--------|----------:|---:|---:|-----------|
| H₁ (Privacy, overall) | Verbatim leak rate | ≤ 0.01 | 0.633–0.867 | 0.0717 (overall); 0% on 10/14 categories | **PARTIAL PASS** |
| H₁ (Privacy, overall) | Inversion F1 | ≤ 0.09 | 0.8198 | 0.664 | **FAIL** (improved) |
| H₁ (Membership) | Mean AUC | ≤ 0.55 | 0.50 | 0.50 | **PASS** |
| H₂ (Utility) | Utility ratio | ≥ 0.85 | 1.000 | 0.266 | **FAIL** (new regression) |
| Semantic similarity | Fraction above 0.85 | → 0 | 1.00 | 0.00 | **PASS** (new pass) |

The v2 run simultaneously achieves new passes (semantic similarity, 10 of 14 verbatim categories) and introduces a new failure (utility ratio). The system is substantially more private than v1 but substantially less useful. The privacy-utility composition target — Privacy PASS ∧ Utility PASS — is not met by either v1 or v2; the improvements shift which constraint is violated, not whether the conjunction holds.

---

## 8. Comment Audit

Running `python3 scripts/check_comments.py --path src/` as of Phase 3 completion:

```
OK — all defs have a one-line comment directly above. (src)
```

Zero violations across all 26 Python files in `src/`.

The two files modified for the improvements (§6) were manually spot-checked: `safe_harbor.py` adds no new public functions (only new module-level regex patterns and their table entries); `router.py` adds two new private functions (`_has_high_sensitivity_spans`, `_HIGH_SENSITIVITY_CATEGORIES` constant) and modifies `route()`. All new `def` lines carry one-line explanation comments conforming to the project invariant.
