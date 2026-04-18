# NGSP — Neural-Guided Semantic Proxy for Clinical Trial Privacy

A research prototype that runs Gemma 4 locally as a privacy filter between clinical trial staff and consumer LLM chat interfaces. Composes HIPAA Safe Harbor stripping, neural routing, and calibrated Gaussian differential privacy to bound re-identification risk while preserving downstream task utility.

**Full writeup:** [`paper/paper.md`](paper/paper.md)

---

## What this does

Clinical trial staff (medical writers, CRAs, pharmacovigilance reviewers) paste sensitive documents into ChatGPT/Claude to speed up their work. NGSP intercepts that paste event, runs it through a local Gemma 4 model, and forwards only a privacy-processed proxy to the cloud LLM. The final answer is returned with original entities re-applied locally.

Three paths:
1. **Abstract query synthesis** (~70% of inputs) — Gemma rewrites the question without any entity references; the synthesized query is sent to the cloud
2. **DP bottleneck** (~20%) — hidden-state Gaussian noise (ε = 3.0, δ = 1e-5) gives formal (ε, δ)-DP guarantees
3. **Local only** (~10%) — content-inseparable tasks stay on-device; no cloud call made

---

## Getting started

```bash
# 1. Set up environment
./scripts/setup.sh

# 2. Download Gemma 4 weights (requires HF_TOKEN with Gemma 4 access)
python3 scripts/download_gemma.py

# 3. Configure API keys
cp .env.example .env
# edit .env: set ANTHROPIC_API_KEY and HF_TOKEN

# 4. Run smoke tests (no model load, no API calls, ~7s)
pytest -q

# 5. Run the full attack battery at ε = 3.0
python3 experiments/run_attacks.py --epsilon 3.0 --n-docs 50

# 6. Run the ablation study
python3 experiments/ablations.py --n-docs 20

# 7. Sweep ε for the privacy-utility curve
python3 experiments/calibrate_epsilon.py

# 8. Generate paper figures (after running experiments)
python3 paper/figures/generate_figures.py

# 9. Check comment invariant
python3 scripts/check_comments.py --path src/
```

---

## Repository layout

```
src/ngsp/           Pipeline: Safe Harbor, router, synthesizer, DP, decoder, applier
src/attacks/        Five adversarial attack classes
src/data/           Synthetic clinical corpus (1,200 documents, ground-truth spans)
experiments/        Attack battery, ablation study, ε calibration runners
tests/              Pytest suite (74 tests, 0 failures, 3 slow skipped)
paper/              Research paper, hypothesis, methodology, results, discussion
scripts/            Setup, model download, comment invariant checker
```

---

## Hypothesis

At ε = 3.0, δ = 1e-5, the composed system bounds inversion attacker span-recovery F1 ≤ 0.09 (Expert Determination threshold) while preserving downstream utility ≥ 0.85 relative to sending raw input.

See [`paper/hypothesis.md`](paper/hypothesis.md) for the formal statement and falsification conditions.

---

## Privacy invariants

- **No real PHI in the repository.** The corpus is fully synthetic.
- **No API key in code or git history.** Keys live in `.env` only.
- **Audit log hashes only.** Raw inputs and outputs are never written to disk.
- **Canary tokens enforced.** Every test input contains a unique sentinel; any canary appearing in an outbound API call is a run failure.
- **DP ε accounting is session-scoped and monotone.** Hard-refuse on budget exhaustion.

---

## Limitations

This is a research prototype evaluated on synthetic data only. It is not suitable for production deployment with real patient data without independent security review. See [`paper/discussion.md`](paper/discussion.md) for a full limitations discussion.
