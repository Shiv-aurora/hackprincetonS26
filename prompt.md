# prompt.md — kickoff orchestration for the NGSP clinical-trial privacy project

Paste this file's contents as your first message to Claude Code in a fresh repository that already contains `CLAUDE.md`. Claude Code will read `CLAUDE.md` automatically for persistent context; this file is the plan and the subagent dispatch order.

---

## Problem statement (concise)

Clinical trial staff — medical writers, pharmacovigilance reviewers, Clinical Research Associates, biostatisticians, regulatory affairs, Clinical Data Managers — regularly paste sensitive content into consumer LLM chat interfaces to speed up their work. The leaked content includes Protected Health Information (PHI), unpublished protocol text, preliminary efficacy data, compound codenames, Serious Adverse Event narratives, and regulator correspondence. Existing defenses (regex redaction, Data Loss Prevention blocks, Business Associate Agreement wrappers) are either too aggressive (destroy utility) or too permissive (leak quasi-identifiers, protocol structure, and intellectual property).

## Solution approach (concise)

Build and empirically evaluate a **Neural-Guided Semantic Proxy (NGSP)** that runs Gemma 4 locally as a privacy filter in front of the Anthropic API. The design composes three mechanisms:

1. **Deterministic Safe Harbor stripping** for the 18 HIPAA identifiers (primary PHI defense).
2. **Router-driven handling** for one of three paths: *abstract-extractable* tasks get query-synthesized into a new self-contained question; *DP-tolerant* tasks go through a bottleneck with calibrated Gaussian noise giving formal (ε, δ) guarantees; *content-inseparable* tasks stay local and never call the cloud.
3. **Adversarial evaluation** against five attack classes: verbatim scan, cross-encoder similarity, trained inversion attacker, membership inference, and task utility regression. Sweep ε to produce a privacy-utility curve. Report negative results honestly.

The hypothesis: on a synthetic clinical trial corpus, at ε = 3.0, δ = 1e-5, the composed system (Safe Harbor + NGSP + DP) bounds inversion attack span-recovery F1 below 0.09 (the Expert Determination re-identification threshold) while preserving downstream task utility above 0.85 relative to sending raw input.

## Plan overview

Five specialized subagents, dispatched in dependency order. Each has a narrow remit with clear deliverables and a typed hand-off contract. The top-level session (you) orchestrates, reviews each subagent's output before proceeding, and keeps the `paper/` writeup in sync with completed work.

```
Phase 0 — scaffold and dependencies
    └─ top-level: create repo structure, pyproject.toml, .env.example, setup.sh

Phase 1 — foundations (parallel-safe)
    ├─ mock-data         ────────── produces labeled synthetic corpus
    └─ integration       ────────── produces working local Gemma + Anthropic plumbing

Phase 2 — core system (depends on Phase 1)
    └─ ngsp-core         ────────── produces the NGSP pipeline + DP calibration

Phase 3 — evaluation (depends on Phase 2)
    └─ attack-suite      ────────── produces quantitative attack results

Phase 4 — synthesis (depends on Phase 3, runs continuously from Phase 1)
    └─ research-writer   ────────── produces paper/, audits comments, final README
```

Before dispatching any subagent, use the context7 MCP to check current documentation for Gemma 4 inference, the Anthropic Python SDK, `opacus` DP accounting, and `sentence-transformers`. Record the versions checked in `paper/methodology.md` for reproducibility.

---

## Phase 0 — repository scaffold (top-level, do this first, before subagent dispatch)

Create the directory layout specified in `CLAUDE.md` section 4. Create:
- `pyproject.toml` with dependencies: `torch`, `transformers`, `anthropic`, `opacus`, `sentence-transformers`, `pydantic`, `python-dotenv`, `pytest`, `numpy`, `scikit-learn`, `rapidfuzz`, `datasets`
- `.env.example` with placeholders for `ANTHROPIC_API_KEY` and `HF_TOKEN`
- `.gitignore` covering `.env`, `__pycache__`, `experiments/results/raw/`, model weights directories
- `scripts/setup.sh` that creates a venv and installs deps
- `README.md` stub pointing at `paper/paper.md` for the full writeup

Do not write any implementation logic in Phase 0. This is scaffolding only.

---

## Phase 1a — dispatch `mock-data` subagent

**Task to dispatch (use the Task tool):**

> You are the `mock-data` subagent. Read `CLAUDE.md` for context. Your job is to own `src/data/` and produce a labeled synthetic clinical trial corpus for downstream training and evaluation. The corpus must be structurally realistic but contain zero real patient data, zero real compound codenames, and zero real institutional identifiers.
>
> **Deliverables:**
>
> 1. `src/data/schemas.py` — pydantic models for: `SAENarrative`, `ProtocolExcerpt`, `MonitoringReport`, `CSRDraft` (Clinical Study Report section), and `SensitiveSpan` (with fields: `start`, `end`, `category`, `value`). `category` is an enum covering the 18 HIPAA Safe Harbor identifier types plus quasi-identifier types (compound code, site ID, dose, indication, efficacy value, AE grade, timing) plus MNPI types (interim result, amendment rationale, regulatory question).
>
> 2. `src/data/synthetic_sae.py` — generates Serious Adverse Event narratives with templated structure and variable entity slots. Every entity slot produces a `SensitiveSpan`. Target: 500 SAE narratives, 200–600 tokens each, spanning ~15 indications and ~8 AE categories.
>
> 3. `src/data/synthetic_protocol.py` — generates protocol excerpts (synopsis, eligibility criteria, dosing schedule, statistical analysis plan snippets). Target: 200 excerpts.
>
> 4. `src/data/synthetic_monitoring.py` — generates Clinical Research Associate monitoring visit reports with site IDs, principal investigator names, enrollment stats, protocol deviations. Target: 200 reports.
>
> 5. `src/data/synthetic_writing.py` — generates Clinical Study Report draft paragraphs that a medical writer might plausibly paste into a chat tool for rewriting. Target: 300 paragraphs.
>
> 6. `src/data/annotator.py` — given a synthesized document, return the list of `SensitiveSpan` objects with ground-truth start/end offsets. This is the oracle the attack suite uses to score inversion success.
>
> 7. `src/data/canary.py` — given a document, inject a unique sentinel token string (format: `CANARY_<uuid4 hex>`) into a natural location. Return the modified document and the canary value. Downstream callers check for canary appearance in outbound API traffic.
>
> **Invariants:**
> - Every function has a one-line explanation comment above its `def` line.
> - Use deterministic seeding (`random.seed(42)` at module top and accept a `seed` parameter on every generator function) so the corpus is reproducible.
> - All generated content is clearly synthetic: use fake names from a fixed list of obvious placeholders (e.g., "Dr. Testname Alpha", site IDs in the 9000-range), fake compound codenames (format: `SYN-<4 digits>`), fake indication names blended from real therapeutic area vocabulary.
> - Produce a `tests/test_mock_data.py` with smoke tests confirming each generator produces valid typed output and span offsets correctly point to the entity text.
>
> **Hand-off:** When done, write a one-page `src/data/README.md` describing the corpus, the generator seeds used, and example outputs. Notify the top-level agent that the corpus is ready.

---

## Phase 1b — dispatch `integration` subagent (can run in parallel with 1a)

**Task to dispatch:**

> You are the `integration` subagent. Read `CLAUDE.md` for context. Your job is to wire up the local Gemma 4 inference stack and the Anthropic API client so downstream agents can depend on clean wrapper interfaces.
>
> Before writing any code, use the context7 MCP to check: (a) current Gemma 4 inference recommendations (transformers vs llama.cpp vs Ollama — pick the one most stable and reproducible for a research prototype on commodity hardware), (b) the latest Anthropic Python SDK documentation, (c) authentication flow for gated Hugging Face model access. Record the versions checked in `scripts/versions.md`.
>
> **Deliverables:**
>
> 1. `scripts/download_gemma.py` — one-shot Gemma 4 download with progress bar, resumable. Documents `HF_TOKEN` requirements.
>
> 2. `src/ngsp/local_model.py` — wrapper class `LocalModel` with these methods:
>    - `generate(prompt: str, max_tokens: int, **kwargs) -> str` — standard text generation.
>    - `generate_with_hidden_states(prompt: str, layer: int, max_tokens: int) -> tuple[str, Tensor]` — returns generated text and hidden-state tensor at the specified layer, used by the DP bottleneck path.
>    - `embed(text: str, layer: int = -1) -> Tensor` — returns pooled hidden state at the specified layer for a fixed input.
>    - `tokenize(text: str) -> list[int]` and `detokenize(ids: list[int]) -> str`.
>
>    Load the model once per process, cache the instance. Expose a config that controls quantization (none / 8-bit / 4-bit) and device (cpu / cuda / mps).
>
> 3. `src/ngsp/remote_client.py` — wrapper class `RemoteClient` with:
>    - `complete(prompt: str, system: str | None, max_tokens: int) -> str` — calls the Anthropic Messages API.
>    - Internal canary check: before every outbound call, scan the prompt for any string matching `CANARY_[0-9a-f]+`. If found, raise `CanaryLeakError` and log the incident. This is a hard invariant.
>    - Internal audit log: append to `experiments/results/audit.jsonl` a record with request ID, prompt length, prompt hash (sha256), system length, max_tokens, response length, response hash, timestamp, model name. Never log raw prompt or response content.
>    - Retry with exponential backoff on rate limits, no retry on auth errors, surface other errors cleanly.
>
> 4. `tests/test_local_model.py` and `tests/test_remote_client.py` — smoke tests. The remote client test must include a test that injects a canary-containing prompt and confirms `CanaryLeakError` is raised.
>
> **Invariants:**
> - Every function has a one-line explanation comment above its `def` line.
> - No API key hardcoded. Use `python-dotenv` to load from `.env`.
> - The wrappers are the only modules in the codebase that directly call `model.generate` or `client.messages.create`. Downstream agents must route through them.
>
> **Hand-off:** Confirm both wrappers work end-to-end (a one-line call to each successfully returns text), then notify the top-level agent.

---

## Phase 2 — dispatch `ngsp-core` subagent (after Phase 1 completes)

**Task to dispatch:**

> You are the `ngsp-core` subagent. Read `CLAUDE.md` for context. Phase 1 produced the labeled corpus (`src/data/`) and the model wrappers (`src/ngsp/local_model.py`, `src/ngsp/remote_client.py`). Your job is to implement the NGSP pipeline on top of those, calibrate the differential privacy mechanism, and wire everything into a single `pipeline.run(user_input: str) -> PipelineOutput` entry point.
>
> **Deliverables:**
>
> 1. `src/ngsp/safe_harbor.py` — deterministic detector for the 18 HIPAA Safe Harbor identifier categories. Use regex for structured patterns (dates, phone numbers, SSN, MRN, ZIP, email, URL, IP, device ID) and a small NER pass (use Gemma via `LocalModel`) for names, geographic subdivisions, and free-text identifiers. Returns `list[SensitiveSpan]`. Build a stable entity_map from detected spans to abstract placeholders like `<PERSON_1>`, `<DATE_1>`.
>
> 2. `src/ngsp/entity_extractor.py` — quasi-identifier extraction via Gemma prompting. Given already-Safe-Harbor-stripped text, identify compound codes, site IDs, specific dose values, indication-identifying phrases, and MNPI markers. Returns a merged `list[SensitiveSpan]` extending the Safe Harbor output.
>
> 3. `src/ngsp/router.py` — three-way classifier. Given an input and its entity annotations, Gemma decides: `abstract_extractable` (task intent separable from sensitive content), `dp_tolerant` (summarization / long-form reasoning where content must be conveyed but can be noised), or `local_only` (content and task are inseparable). Returns a `RouteDecision` dataclass with the path and a short rationale.
>
> 4. `src/ngsp/query_synthesizer.py` — for the abstract-extractable path. Given the input and entity annotations, Gemma writes a new self-contained question that captures task intent with zero references to sensitive entities. The output string is the proxy sent to the Anthropic API. Crucial property: this is a non-injective mapping — many inputs can produce the same synthesized query.
>
> 5. `src/ngsp/dp_mechanism.py` — Gaussian mechanism with Rényi Differential Privacy (RDP) accountant. Implement:
>    - `clip_to_norm(x: Tensor, C: float) -> Tensor` — L2 clipping to bounded sensitivity C.
>    - `add_gaussian_noise(x: Tensor, sigma: float) -> Tensor`.
>    - `compute_sigma(epsilon: float, delta: float, sensitivity: float) -> float` — analytical calibration.
>    - `RDPAccountant` class with `step(sigma, sensitivity)` and `get_epsilon(delta)` methods tracking cumulative budget.
>    Use `opacus` utilities where sensible, but keep the per-session accountant self-contained.
>
> 6. `src/ngsp/proxy_decoder.py` — for the DP-tolerant path. Given a noised bottleneck embedding, Gemma decodes it back to a proxy text that preserves task-relevant meaning but degrades entity-level specificity. Approach: prepend the noised embedding as a soft prompt / prefix-tuning signal, or simpler v1: use Gemma to paraphrase the original conditioned on the noisy embedding as a hint. Document the chosen method in `paper/methodology.md`.
>
> 7. `src/ngsp/answer_applier.py` — takes the Anthropic response and the entity_map, locally re-applies the mapping (`<PERSON_1>` → "John Smith"), returns the final user-visible response.
>
> 8. `src/ngsp/pipeline.py` — the `Pipeline` class exposing `run(user_input: str, session_budget: SessionBudget) -> PipelineOutput`. The output includes the final response, the routing decision, the proxy text sent (if any), ε spent on this call, and cumulative session ε.
>
> 9. `experiments/calibrate_epsilon.py` — sweeps ε ∈ {0.5, 1.0, 2.0, 3.0, 5.0, 10.0} against a held-out subset of the synthetic corpus, measuring task utility at each ε. Produces `experiments/results/calibration.json` and a plot in `paper/figures/epsilon_utility_curve.png`.
>
> **Invariants:**
> - Every function has a one-line explanation comment above its `def` line.
> - The DP accountant is monotone and session-scoped. `Pipeline.run` refuses with `BudgetExhaustedError` when cumulative ε exceeds the session cap.
> - Never log raw entity values. The audit record stores only the entity_map's keys (`<PERSON_1>`) and their categories, never the values.
> - All random noise sampling is seedable for reproducibility in testing; seeding is disabled in production mode (set via config).
>
> **Hand-off:** Produce a `src/ngsp/README.md` explaining the pipeline, current ε calibration, and known limitations. Notify the top-level agent and provide the path to `experiments/results/calibration.json`.

---

## Phase 3 — dispatch `attack-suite` subagent (after Phase 2 completes)

**Task to dispatch:**

> You are the `attack-suite` subagent. Read `CLAUDE.md` for context. Phase 2 produced the NGSP pipeline. Your job is to build the adversarial test harness in `src/attacks/` and produce quantitative leakage measurements at multiple ε values.
>
> **Deliverables:**
>
> 1. `src/attacks/verbatim.py` — attack 1. Given a `(original, proxy)` pair and the ground-truth `list[SensitiveSpan]`, detect any literal or fuzzy match of sensitive values in proxy. Use `rapidfuzz` for fuzzy. Report per-category leak rate.
>
> 2. `src/attacks/similarity.py` — attack 2. Load a cross-encoder (SentenceTransformer, model different from Gemma) and compute cosine similarity between original and proxy. Report distribution over the corpus and flag pairs above a configurable threshold (default 0.85).
>
> 3. `src/attacks/inversion.py` — attack 3, the primary threat model. Train a DistilBERT-based span predictor: input is proxy text, output is predicted sensitive-span tokens (from original). Training set: 80% of the corpus. Evaluation on held-out 20%. Report span-level F1 per category. This must beat a random-baseline comparison. The baseline: for the same category, pick a span uniformly at random from the corpus.
>
> 4. `src/attacks/membership.py` — attack 4. Given a target entity (e.g., a specific compound codename), build positive set (proxies from inputs mentioning the entity) and negative set (proxies from control inputs). Train a logistic classifier on proxy embeddings. Report AUC. Expected: close to 0.5 under good privacy.
>
> 5. `src/attacks/utility.py` — attack 5 (utility is inverted: higher is better for the system). For each input, ask the Anthropic API a standardized task question (e.g., "Rewrite this narrative more concisely" for SAE inputs, "Explain the rationale for this amendment" for protocol inputs). Do this twice: once with the original input, once with the NGSP proxy. Score both answers with a rubric (use Claude as judge with a constrained scoring prompt). Report utility ratio = proxy_score / original_score.
>
> 6. `experiments/run_attacks.py` — runs all five attacks against a given NGSP configuration. Flags: `--epsilon`, `--corpus`, `--output`. Output: `experiments/results/attacks_eps{ε}.json` with all metrics.
>
> 7. `experiments/ablations.py` — reruns the attack battery under component-on/off combinations: (Safe Harbor only), (Safe Harbor + query synthesis), (Safe Harbor + DP), (full system). Produces the ablation table for the paper.
>
> **Invariants:**
> - Every function has a one-line explanation comment above its `def` line.
> - All randomness is seeded. All model versions are recorded.
> - Never print raw sensitive spans in logs — show category counts, hashes, or aggregate statistics only.
> - Inversion attacker training must include negative control: a version trained on shuffled (original, proxy) pairs to confirm the learned signal is real and not from data leakage in the training loop.
>
> **Hand-off:** Produce a results summary in `experiments/results/summary.md` showing a table of {attack class × ε value → metric}. Notify the top-level agent.

---

## Phase 4 — dispatch `research-writer` subagent (continuously from Phase 1 onward, final pass after Phase 3)

**Task to dispatch:**

> You are the `research-writer` subagent. Read `CLAUDE.md` for context. Your role is long-lived: every time another subagent completes a deliverable, update the relevant `paper/` file to reflect it. After Phase 3, produce the final research writeup.
>
> **Ongoing deliverables (update continuously):**
>
> 1. `paper/hypothesis.md` — formal hypothesis statement. The composed NGSP system with Safe Harbor + query synthesis + DP bottleneck at (ε=3.0, δ=1e-5) bounds inversion attacker span-F1 below 0.09 while preserving utility ≥ 0.85 on the synthetic clinical trial corpus. Restate in precise, falsifiable terms.
>
> 2. `paper/methodology.md` — threat model, system architecture, attack setup, metrics, model versions, random seeds, corpus statistics. Document the exact DP calibration procedure and the chosen proxy decoder approach.
>
> 3. `paper/results.md` — tables of numerical results as they come in. Include:
>    - Ablation table: components on/off × attack metrics.
>    - Privacy-utility curve: ε × {attack span-F1, utility ratio}.
>    - Per-category leakage breakdown.
>    - **Negative results are first-class content.** If query synthesis passes inversion but fails similarity, say so. If DP at ε=1.0 destroys utility, say so. If Safe Harbor alone already catches 95% of Safe Harbor category leaks, say so and explain what that implies for NGSP's marginal value.
>
> 4. `paper/discussion.md` — interpretation. What does the privacy-utility curve tell us about deployability? Where does the composed system break? What's the honest deployment posture? What's out of scope (rare-disease trials, genomics, real-world unadversarial testing)?
>
> 5. `paper/paper.md` — the integrated writeup: abstract, introduction, related work, threat model, system, methods, results, discussion, limitations, future work. Plain markdown, pandoc-compatible. Aim for 10–15 pages equivalent.
>
> **Code audit deliverable (run after Phase 2 and again after Phase 3):**
>
> 6. Walk every `.py` file in `src/` and confirm each `def` has a one-line explanation comment directly above. Produce `paper/code_audit.md` listing any violations found and the fixes applied. Add a `scripts/check_comments.py` that programmatically enforces this and can be wired into CI.
>
> **Final deliverables:**
>
> 7. `README.md` at repo root — short, user-facing: what this is, how to run it, pointer to `paper/paper.md` for details.
>
> 8. `paper/figures/` — generate all plots referenced in the paper from the results JSON files. Use matplotlib with a neutral style. Save as PNG and SVG.
>
> **Invariants:**
> - Paper files are plain markdown. No LaTeX macros (simple `$...$` math is fine if it renders in GitHub markdown).
> - Every claim in `paper/results.md` is backed by a file in `experiments/results/`. If a number appears in the paper, it is traceable to a JSON result file.
> - Honest reporting. If the hypothesis fails, say so. Negative results get full sections, not footnotes.
>
> **Hand-off:** When Phase 3 is complete and the paper is final, produce a single-paragraph summary for the top-level agent describing the key finding.

---

## Orchestration rules for the top-level session

- **Dispatch one subagent at a time in the dependency order above**, except where noted parallel-safe (Phase 1a and 1b can run concurrently).
- **Read each subagent's output before dispatching the next.** Spot-check that the deliverables exist, that smoke tests pass, and that the `CLAUDE.md` invariants are respected.
- **If a subagent asks for a decision** (e.g., "should the proxy decoder use soft prompts or paraphrase prompting?"), make the call in the simplest direction that unblocks Phase 3 evaluation. Record the decision in `paper/methodology.md`.
- **Do not let `research-writer` block other phases.** It runs continuously; if it's mid-update when Phase 3 needs to dispatch, proceed.
- **Before dispatching any subagent, remind it in the task description to use context7 MCP for current documentation on the specific libraries it will touch.** Training-data knowledge of SDK APIs is unreliable.
- **After Phase 3, run the full ablation one more time** to catch any drift introduced during development. Commit the final results to `experiments/results/final/`.

## Success criteria

The project is done when:
1. `pytest -q` passes from a fresh clone.
2. `python experiments/run_attacks.py --epsilon 3.0` produces complete results for all five attacks.
3. `python experiments/calibrate_epsilon.py` produces the privacy-utility curve.
4. `paper/paper.md` exists as a complete research-paper-style document including honest negative results.
5. `scripts/check_comments.py` reports zero violations.
6. `README.md` at repo root is a working getting-started guide.

Begin with Phase 0.