# CLAUDE.md

This file is the persistent project context. Claude Code reads it on every session. Do not delete. Update it when architectural decisions change.

---

## 1. Project mission

Enterprise and clinical trial staff routinely paste sensitive content into consumer LLM chat interfaces (ChatGPT, Claude) because the tools are faster than their sanctioned alternatives. The leaked content includes Protected Health Information (PHI), Material Non-Public Information (MNPI), unpublished protocol designs, preliminary efficacy data, internal compound codenames, and regulator correspondence. Existing defenses — regex redaction, Data Loss Prevention (DLP) blocks, Business Associate Agreement (BAA) wrappers — either over-redact and destroy utility, or under-redact and leak.

This project builds and empirically evaluates a **Neural-Guided Semantic Proxy (NGSP)** architecture that runs Gemma 4 locally as a privacy filter between the user and a closed cloud LLM (the Anthropic API), composed with a deterministic Safe Harbor front end and a calibrated (ε, δ)-differentially-private (DP) noise layer. The research question is whether the composed system can simultaneously preserve task utility above 85% and bound inversion attack accuracy below the Expert Determination re-identification threshold (typically 0.09) on synthetic clinical trial workloads.

The deliverable is a reproducible research prototype: working code, an adversarial test harness, a mock clinical trial dataset with ground-truth sensitive span annotations, and a research-paper-style writeup including negative results.

## 2. Architecture

Three-path router, with Gemma 4 as the local decision-maker:

```
user input
   │
   ▼
[Safe Harbor stripper]  ← deterministic regex/NER for 18 HIPAA identifiers
   │
   ▼
[Gemma 4 router]  ← classifies request: abstract-extractable | DP-tolerant | local-only
   │
   ├── abstract-extractable (~70%)  →  [Query Synthesizer]  →  proxy text  ┐
   ├── DP-tolerant         (~20%)  →  [DP bottleneck + proxy decoder]     ┤
   └── local-only          (~10%)  →  [Local Gemma answer]                │
                                                                           │
                                   Anthropic API  ← ← ← ← ← ← ← ← ← ← ← ┘
                                        │
                                        ▼
                                [Answer Applier]  ← re-apply entity_map locally
                                        │
                                        ▼
                                   user response
```

Key properties:
- **Safe Harbor stripping is the primary PHI defense.** NGSP is a secondary defense against quasi-identifier recombination and free-text leakage, not the primary shield.
- **The DP path gives formal (ε, δ) bounds.** Track cumulative ε per session; hard-refuse once the session budget is exhausted.
- **Query synthesis beats content translation.** For abstract-extractable tasks, generate a new self-contained query rather than encoding the input — this sidesteps inversion because the mapping is non-injective.
- **Canary tokens run in the background.** Every test input contains a unique sentinel string; if it ever appears in an outbound API call, we've detected a leak independent of the test suite.

## 3. Technical decisions

**Local model: Gemma 4.** Loaded via `transformers` or `llama.cpp` (whichever is more stable at implementation time — check with context7 MCP for current Gemma 4 inference recommendations). Quantized if needed to fit the target hardware. All activations, entity maps, and intermediate representations stay on-device.

**DP mechanism: Gaussian with Rényi DP accounting.** σ calibrated as σ = Δ · √(2 ln(1.25/δ)) / ε where Δ is the L2 sensitivity of the bottleneck projection. Use `opacus` or a minimal in-house accountant. Default target (ε=3.0, δ=1e-5) per session; expose as config.

**Remote client: Anthropic Python SDK.** Use the latest Claude model available. All calls go through a single `remote_client.py` so the canary detection, retry logic, and audit logging are centralized.

**Sensitivity of the bottleneck must be clipped.** Unbounded activations break DP guarantees. Every vector entering the noise mechanism passes through an L2 norm clip with a known bound.

**Everything logged, nothing sensitive logged.** The audit log records: request ID, routing decision, ε spent, proxy text hash, response hash, timestamp. It never records raw inputs, raw outputs, or entity_map contents.

## 4. Repository structure

```
ngsp-clinical/
├── CLAUDE.md                       ← this file
├── README.md                       ← user-facing overview
├── pyproject.toml                  ← dependencies, build config
├── .env.example                    ← ANTHROPIC_API_KEY, HF_TOKEN
├── src/ngsp/
│   ├── __init__.py
│   ├── local_model.py              ← Gemma 4 wrapper (load, generate, hidden states)
│   ├── safe_harbor.py              ← deterministic HIPAA 18-identifier stripper
│   ├── entity_extractor.py         ← quasi-identifier extraction via Gemma
│   ├── router.py                   ← abstract-extractable | DP-tolerant | local-only classifier
│   ├── query_synthesizer.py        ← abstract query generation for path 1
│   ├── dp_mechanism.py             ← Gaussian noise + Rényi ε accountant
│   ├── proxy_decoder.py            ← noisy embeddings → proxy text for path 2
│   ├── remote_client.py            ← Anthropic API wrapper, canary check, audit
│   ├── answer_applier.py           ← re-apply entity_map to response
│   └── pipeline.py                 ← end-to-end orchestration
├── src/attacks/
│   ├── verbatim.py                 ← attack 1: literal + fuzzy substring scan
│   ├── similarity.py               ← attack 2: cross-encoder cosine similarity
│   ├── inversion.py                ← attack 3: trained span predictor on proxies
│   ├── membership.py               ← attack 4: entity membership inference
│   └── utility.py                  ← attack 5: downstream QA utility benchmark
├── src/data/
│   ├── synthetic_sae.py            ← mock Serious Adverse Event narratives
│   ├── synthetic_protocol.py       ← mock protocol excerpts
│   ├── synthetic_monitoring.py     ← mock Clinical Research Associate reports
│   ├── synthetic_writing.py        ← mock Clinical Study Report excerpts
│   ├── annotator.py                ← ground-truth sensitive span labeler
│   └── schemas.py                  ← typed dataclasses for all record types
├── tests/                          ← pytest unit tests
├── experiments/
│   ├── run_attacks.py              ← full attack battery at a given ε
│   ├── calibrate_epsilon.py        ← sweep ε, measure privacy/utility curve
│   ├── ablations.py                ← components on/off comparisons
│   └── results/                    ← JSON results, never committed raw
├── paper/
│   ├── paper.md                    ← research-paper-style writeup
│   ├── hypothesis.md               ← formal hypothesis statement
│   ├── methodology.md              ← methods, threat model, metrics
│   ├── results.md                  ← tables and findings, including negatives
│   ├── discussion.md               ← interpretation, limitations, future work
│   └── figures/                    ← all generated plots
└── scripts/
    ├── download_gemma.py           ← one-shot model download
    └── setup.sh                    ← environment bootstrap
```

## 5. Coding standards

**Every function has a one-line comment directly above its `def` line** explaining what the function does in plain English. This is a hard rule. The comment must describe the function's contract, not restate its name. Example:

```python
# Given a raw user input, return the list of Safe Harbor identifier spans detected.
def extract_safe_harbor_spans(text: str) -> list[Span]:
    ...
```

Type hints on every public function signature. `dataclasses` or `pydantic` for any structured record. No silent exception swallowing — errors propagate or are logged with explicit justification.

Tests live in `tests/` and use `pytest`. Run with `pytest -q`. Every attack implementation has at least one smoke test that confirms it runs end-to-end on a tiny fixture.

All model calls (local Gemma and remote Anthropic) go through wrapper modules. Never call `model.generate` or `client.messages.create` directly from business logic — this is a hard invariant, because the wrappers are where the audit logging and canary detection live.

## 6. Subagent roles

This project uses five specialized subagents dispatched via the Task tool. Each has a narrow remit. The orchestrator agent (you, the top-level Claude Code session) coordinates them.

1. **`ngsp-core`** — implements NGSP components: local model wrapper, router, query synthesizer, DP mechanism, proxy decoder, answer applier, pipeline. Owns `src/ngsp/`. Calibrates ε against privacy/utility targets. Must consult context7 MCP for current Gemma 4 inference best practices before implementation.

2. **`attack-suite`** — implements the five attack classes in `src/attacks/`. Runs them against the NGSP pipeline at different ε values and records quantitative results. Must produce reproducible numbers: seed all randomness, log model versions, save inputs.

3. **`research-writer`** — owns `paper/` and writes the research-paper-style documentation as experiments complete. Records hypothesis, methodology, each attack's setup, results (including negative results), and interpretation. Also audits that every function in the codebase has a one-line explanation comment; flags violations back to the other agents. Writes the final `README.md`.

4. **`integration`** — wires the local Gemma 4 inference stack to the Anthropic API. Owns `src/ngsp/local_model.py`, `src/ngsp/remote_client.py`, `scripts/download_gemma.py`, and `scripts/setup.sh`. Handles authentication, retries, rate limits, canary injection, audit logging. Uses context7 MCP to check current Anthropic SDK and Gemma transformers documentation.

5. **`mock-data`** — owns `src/data/`. Generates synthetic clinical trial documents (Serious Adverse Event narratives, protocol excerpts, Clinical Research Associate monitoring reports, medical writing drafts) with ground-truth sensitive span annotations. Output is a labeled corpus the attack suite can evaluate against. Documents are synthetic but structurally realistic — no real PHI, no real compound codenames, no real clinical data.

## 7. Invariants (never violate)

- **No real PHI enters the repository.** The corpus is synthetic by construction. Any accidental inclusion of real patient data is a project-level incident.
- **No API key in code or git history.** Use `.env` files and `python-dotenv`. `.env.example` goes in the repo; `.env` never does.
- **No raw inputs or outputs in logs.** Audit logs contain hashes and metadata only.
- **Canary tokens are injected into every test input.** If any canary ever reaches the outbound API, that run is a failure regardless of other metrics.
- **DP ε accounting is session-scoped and monotone.** Cumulative ε can only increase within a session; a fresh session resets. The system hard-refuses when the session budget is exhausted.
- **Every function has a one-line explanation comment.** `research-writer` audits this; CI fails if violations are detected.

## 8. External documentation

Use the context7 MCP to look up current documentation when needed. Primary references:
- Gemma 4 model card and inference docs (Hugging Face, Google)
- Anthropic Python SDK (anthropic-sdk-python)
- `transformers` library for hidden-state extraction
- `opacus` for DP mechanisms and Rényi accountant
- `sentence-transformers` for cross-encoder similarity attack
- HIPAA Safe Harbor 18 identifiers (HHS guidance)
- ICH E6 Good Clinical Practice for clinical document structure
- TMF Reference Model for document taxonomy

Do not rely on training-data memory for these APIs. Check current docs with context7 before writing integration code.

## 9. How to run

```bash
# one-time setup
./scripts/setup.sh
python scripts/download_gemma.py
cp .env.example .env  # then fill in ANTHROPIC_API_KEY, HF_TOKEN

# run unit tests
pytest -q

# run the full attack battery at default ε=3.0
python experiments/run_attacks.py --epsilon 3.0

# sweep ε from 0.5 to 10.0 and produce the privacy/utility curve
python experiments/calibrate_epsilon.py --epsilons 0.5,1.0,2.0,3.0,5.0,10.0

# render the research paper from paper/*.md
# (paper is plain markdown; render with any pandoc pipeline if PDF is needed)
```

## 10. Definition of done

The project is complete when:
1. The pipeline runs end-to-end on a synthetic clinical trial input and produces a useful answer from the Anthropic API.
2. The attack suite runs reproducibly and produces quantitative results for all five attack classes at three or more ε values.
3. The research paper in `paper/` contains a formal hypothesis, methodology, results tables (including negative results), and a discussion that honestly states limitations.
4. Every function in `src/` has a one-line explanation comment above its `def`.
5. A fresh clone + `./scripts/setup.sh` + `pytest -q` passes on a supported machine.

## 11. Product build phase (branch: `product-build`)

The research prototype is complete on `main`. The hackathon submission is being
assembled on the `product-build` branch, which wraps the research code with a
FastAPI backend and a Vite + React frontend. The foundational rules for this
phase come from `FINALIZE_PLAN.md` and are restated here so they survive
context compaction:

- **Do not modify the research code.** `src/ngsp/`, `src/attacks/`, `src/data/`,
  `experiments/`, `paper/`, and `tests/` are frozen on `product-build`. If a
  bug in research code surfaces during product integration, fix it on a
  separate branch off `main`, merge that into `main`, then rebase
  `product-build` on top. Never rewrite research code inline on
  `product-build`.
- **`pytest -q` must continue to pass.** Baseline is `57 passed, 3 skipped`.
  Every product-build commit is validated against this gate.
- **All product-build changes are logged in `product-build/CHANGELOG.md`.**
  One dated entry per step with the concrete files touched.
- **One commit per step.** Commit messages use the `[step-N]` prefix to match
  FINALIZE_PLAN.md.
- **Secrets never enter git.** The root `.env` and `frontend/.env` are
  ignored; only `.env.example` files are tracked. The CI secret-scan regex
  (`sk-ant-`, `hf_`, `sk-proj-`, `AKIA`) must stay at zero hits on tracked
  files.
- **Frontend stack is fixed.** Vite + React + TypeScript + Tailwind v4. Do not
  convert to Next.js or any other framework. The original plan's
  `docs/stitch-mockup.html` is obsolete — the live `frontend/` scaffold
  replaces it.
- **Anthropic primary, Gemini optional.** The model selector in
  `/api/complete` accepts `claude-opus-4 | gpt-5 | gemini-2`. Anthropic is the
  default (mock mode offline); Gemini is retained because the FRONTEND drop
  already shipped `@google/genai` — no additional work, just keep the path
  usable.
- **No raw PHI ever leaves the backend.** Only proxy text goes to any remote
  provider. This is identical to the research invariant and must hold for
  the product build.