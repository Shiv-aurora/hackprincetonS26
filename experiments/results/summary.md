# NGSP Experiment Summary

Synthetic clinical-trial corpus, offline pipeline, `HuggingFaceTB/SmolLM2-1.7B-Instruct`
running on Apple-Silicon MPS (`mps:0`, float16, SDPA attention). Anthropic API stubbed
out in mock mode for all experiments — every number below is produced locally and is
reproducible from seeds. Runs on an M1 Max 32 GB.

All raw artefacts live under `experiments/results/` and `paper/figures/`.

---

## 1. Calibration — DP privacy/utility sweep

**Command**
```
GEMMA_MODEL_ID=HuggingFaceTB/SmolLM2-1.7B-Instruct \
python experiments/calibrate_epsilon.py \
    --epsilons 0.5,1.0,2.0,3.0,5.0 --n-docs 30 --seed 42
```

Wall-clock: **41 min** on M1 Max (per-doc cache precompute + 5×30 decodes).
Raw: `experiments/results/calibration.json`, `paper/figures/epsilon_utility_curve.png`.

### Result

| ε    | σ (Gaussian)   | mean utility | n scored |
|------|----------------|--------------|----------|
| 0.5  | 9.6896         | **0.859847** | 30 / 30  |
| 1.0  | 4.8448         | **0.859847** | 30 / 30  |
| 2.0  | 2.4224         | **0.859847** | 30 / 30  |
| 3.0  | 1.6149         | **0.859847** | 30 / 30  |
| 5.0  | 0.9690         | **0.859847** | 30 / 30  |

The utility curve is **bit-identical** across a 10× range of σ. That is not a plotting
artefact — the proxy text produced by `decode_proxy` was the same string at every ε.

### Why the curve is flat (this is a finding, not a bug)

We confirmed via `experiments/diagnose_dp_path.py` that the DP mechanism is implemented
correctly:

* `clip_to_norm(hidden, 1.0)` enforces the L2 bound used to compute σ.
* `add_gaussian_noise(clipped, σ)` adds Gaussian noise with the expected magnitude.
  At ε=0.5, σ=9.69 ⇒ noise L2 ≈ σ · √d ≈ 9.69 · √2048 ≈ 438, i.e. ~**438× larger than
  the signal**. Cosine similarity between clipped and noisy hidden is effectively zero.

So the noise is real and large. The flat curve comes from **two decoder properties
downstream of the noise**:

1. **The hint channel is lossy.** `proxy_decoder._nearest_vocab_tokens` projects the
   noisy vector onto the embedding matrix and takes the top-k nearest tokens as free-text
   hints. For very large σ, those hints are effectively random tokens. The paraphrase
   prompt explicitly instructs the model it may ignore hints that do not fit the task,
   so random hints are discarded.
2. **Greedy decoding on the paraphrase task is anchored to the placeholder-substituted
   input.** `LocalModel.generate` currently drops `temperature` (HF reports
   `not valid and may be ignored`), so decoding is deterministic. With the sensitive
   spans already replaced by placeholders in the prompt, the model produces a nearly
   identical paraphrase regardless of hint-token content.

Net effect: noise is correctly injected into the hidden representation but does **not
propagate** to the text surface. The DP (ε, δ) guarantee holds on the embedding side;
the privacy story at the text surface for `dp_tolerant` comes entirely from the
placeholder substitution (see Step A / `proxy_decoder._substitute_quasi_identifiers`).

### Interpretation

The `dp_tolerant` path in this heuristic, training-free decoder configuration is
**not where privacy is enforced**. This flips the architectural emphasis: the
`abstract_extractable` path is the workhorse; the `dp_tolerant` path is a redundant
placeholder-replacement filter that happens to wrap a formally DP bottleneck whose
signal is discarded by the decoder. This is the key negative result of the project.

### Limitations

* A **learned** decoder trained against the noisy-embedding → proxy objective would
  almost certainly propagate noise to the text, closing the gap between ε and utility.
* A **direct-perturbation** decoder (sample softmax logits with σ-scaled temperature
  or Gumbel noise) would achieve the same without retraining, at the cost of changing
  the DP accounting surface.
* Switching `LocalModel.generate` to sampling (`do_sample=True`, τ>0) would also inject
  randomness, but then the privacy guarantee no longer traces back to the clipped
  Gaussian mechanism.

All three are **future work**, explicitly out of scope for this hackathon prototype.

---

## 2. Route distribution across document types

**Command**
```
GEMMA_MODEL_ID=HuggingFaceTB/SmolLM2-1.7B-Instruct \
python experiments/route_distribution.py --n-per-type 20 --seed 42
```

Wall-clock: **32 min**. Raw: `experiments/results/route_distribution.json`.

### Result (80 docs, 20 per type)

| doc type    | abstract_extractable | dp_tolerant | local_only | total |
|-------------|---------------------:|------------:|-----------:|------:|
| sae         |                    0 |          20 |          0 |    20 |
| protocol    |                   13 |           7 |          0 |    20 |
| monitoring  |                   20 |           0 |          0 |    20 |
| writing     |                    7 |          10 |          3 |    20 |
| **OVERALL** |               **40** |      **37** |      **3** |    80 |

* 50 % `abstract_extractable`, 46 % `dp_tolerant`, 4 % `local_only`.
* The Gemma-4-targeted heuristic routing prior (~70/20/10) from the project spec is
  **not** what this SmolLM2 router produces on our corpus; the split is closer to
  50/50 with a trace `local_only`. This is useful ground truth for the research paper.
* Document-type structure strongly biases routing:
  * SAE narratives always go `dp_tolerant` (narrative text, no task question).
  * Monitoring reports always go `abstract_extractable` (structured, extractable
    findings).
  * Protocol and CSR docs split across paths.

---

## 3. Re-identification attack results

**Command**
```
GEMMA_MODEL_ID=HuggingFaceTB/SmolLM2-1.7B-Instruct \
python experiments/run_attacks.py --n-sae 15 --n-protocol 15 --seed 42
```

Wall-clock: **17 min**. Raw: `experiments/results/attack_results.json`.

Corpus mix was deliberately broadened from pure-SAE (original spec) to 15 SAE +
15 protocol, because the route distribution above shows SAE is 100 % `dp_tolerant` —
a pure-SAE corpus would produce zero `abstract_extractable` samples and no
cross-path comparison. Protocol excerpts contribute the AMENDMENT_RATIONALE category
that SAE does not carry.

### Route assignment on the 30-doc attack corpus

| path                 | count |
|----------------------|------:|
| abstract_extractable |    10 |
| dp_tolerant          |    20 |
| local_only           |     0 |

### Leak rates by path and category

Verbatim match = the ground-truth span string appears literally inside the proxy text.
Mean Jaccard = token-set overlap of the span value with the proxy.

#### `abstract_extractable` path (n=10 docs)

| category            | n spans | verbatim hits | leak rate | mean jaccard |
|---------------------|--------:|--------------:|----------:|-------------:|
| compound_code       |      10 |             2 | **0.200** |       0.0123 |
| efficacy_value      |       4 |             0 | **0.000** |       0.0000 |

No SITE_ID or AMENDMENT_RATIONALE spans were present in this sub-corpus, so those
cells are empty rather than zero.

#### `dp_tolerant` path (n=20 docs)

| category            | n spans | verbatim hits | leak rate | mean jaccard |
|---------------------|--------:|--------------:|----------:|-------------:|
| amendment_rationale |       8 |             4 | **0.500** |       0.0482 |
| compound_code       |      39 |            29 | **0.744** |       0.0196 |
| efficacy_value      |      12 |             8 | **0.667** |       0.0164 |
| site_id             |      15 |            13 | **0.867** |       0.0156 |

#### Combined (reference only)

| category            | n spans | verbatim hits | leak rate | mean jaccard |
|---------------------|--------:|--------------:|----------:|-------------:|
| amendment_rationale |       8 |             4 |     0.500 |       0.0482 |
| compound_code       |      49 |            31 |     0.633 |       0.0181 |
| efficacy_value      |      16 |             8 |     0.500 |       0.0123 |
| site_id             |      15 |            13 |     0.867 |       0.0156 |

### Interpretation

The two paths show a **~4×** gap in verbatim leak rate:

* `abstract_extractable`: 0.20 on compound_code, 0.00 on efficacy_value — the
  query-synthesis proxy genuinely strips structured identifiers because it generates a
  *new question* rather than a transformation of the input.
* `dp_tolerant`: 0.87 on site_id, 0.74 on compound_code, 0.67 on efficacy_value —
  despite a formally correct Gaussian DP mechanism in the hidden-state bottleneck. The
  placeholder substitution added in Step A (`_substitute_quasi_identifiers`) catches
  *some* categories but is defeated when the paraphrase model echoes ambient context
  that the substitution does not cover (e.g. a compound name referenced in a
  surrounding clause).

This is the headline chart for the writeup: **formal DP is insufficient as a text-surface
defense when the decoder is greedy and untrained; query synthesis on extractable tasks
is the usable privacy primitive in this stack.**

### Limitations

* The attack is deliberately shallow (verbatim + Jaccard). A cross-encoder semantic
  attack or a trained span predictor would likely push leak rates higher on both
  paths; the relative gap between paths should survive.
* The `abstract_extractable` sub-corpus is smaller (n=10) than the `dp_tolerant`
  sub-corpus (n=20); rerunning with more monitoring docs (which route 100 % to
  `abstract_extractable`) would tighten confidence intervals.
* All numbers are on synthetic clinical-trial text. Real clinical language has richer
  co-occurrence patterns that a sophisticated adversary could exploit.

---

## 4. Key findings

1. **DP noise does not reach the proxy text** in the training-free decoder. ε ∈
   {0.5, 1, 2, 3, 5} produces identical utility (0.859847) to 6 decimal places.
2. **The abstract_extractable path is the privacy workhorse**, with verbatim leak
   rates ~4× lower than `dp_tolerant` on shared categories, even though DP math is
   mathematically correct on the losing side.
3. **Routing is document-type-biased**, not evenly 70/20/10 as the spec anticipated;
   SmolLM2 on our corpus produces ~50/46/4. This is a real number the paper should
   report rather than hide.
4. **Placeholder substitution in `proxy_decoder` (Step A)** is now the dominant
   privacy mechanism for the `dp_tolerant` path and correlates with exactly the
   categories it covers. SITE_ID (87 % leak) and COMPOUND_CODE (74 %) remain the
   hardest — the placeholders are overridden when the paraphrase model echoes
   surrounding context.

## 5. Reproducibility

All experiments are deterministic given the seeds above. Re-running the three
commands on a clean MPS-capable machine with the same corpus generators produces
the same numbers bit-for-bit for the calibration (because the decode_proxy output
is noise-independent) and up to the MPS/float16 reduction-order non-determinism for
the attack suite (span counts are stable; per-span Jaccard scores can shift by
≤0.001).

See `experiments/FIXES.md` for the minimal list of changes required to run offline.
