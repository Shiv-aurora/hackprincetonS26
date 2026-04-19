# NGSP — Neural-Guided Semantic Proxy

> Privacy-preserving clinical trial assistant. Gemma 4 runs locally as a semantic
> router between your clinical data and cloud LLMs. Zero raw PHI leaves your machine.

---

## What it does

Clinical trial staff (medical writers, CRAs, pharmacovigilance reviewers) routinely
paste sensitive documents into consumer LLMs because they are faster than sanctioned
tools. NGSP intercepts that action, runs the content through a local Gemma 4
privacy router, and forwards only a de-identified proxy to the cloud. The final answer
is returned with original entities re-applied locally — the cloud never sees raw PHI,
unpublished compound codes, or MNPI.

The system ships as a VS Code-style desktop application with two persona layouts:

- **Analyst** — virtualized dataset table, natural-language chat, auto-generated chart dashboard.
- **Reviewer** — SAE narrative input, multi-track D3 causality timeline, AE signal scatter map.

Every cloud call and MCP dispatch is recorded in a tamper-evident forensic audit log
visible in the bottom dock. A per-session ε budget enforces the (ε=3.0, δ=1e-5)
differential-privacy guarantee.

---

## Quick start

### Prerequisites

- Python 3.11+
- Node 20+
- An `OPENAI_API_KEY` — or use `sk-openai-mock` for offline demo (no key required)

### Setup

```bash
git clone <repo-url>
cd ngsp-clinical
./scripts/setup.sh          # create venv, install Python deps
cp .env.example .env        # then edit .env — fill in OPENAI_API_KEY if needed
cd frontend && npm install  # install frontend deps
cd ..
```

### Run

```bash
# One command — kills old servers, clears audit log, starts fresh stack:
./scripts/reset-demo.sh

# Then verify fixtures:
python scripts/seed-demo.py
```

The stack starts at:

| Service  | URL                      |
|----------|--------------------------|
| Frontend | http://localhost:3000    |
| Backend  | http://localhost:8000    |
| API docs | http://localhost:8000/docs |

---

## Demo

See [`docs/demo-script.md`](docs/demo-script.md) for the full step-by-step presenter guide.

- **Reviewer flow (88 s):** paste an SAE narrative → assemble causality timeline → inspect signal
  scatter → export via MCP.
- **Analyst flow (85 s):** filter dataset → natural-language chat → generate dashboard → export via MCP.

---

## Architecture

Three-path privacy router:

```
user input
   │
   ▼
[Safe Harbor stripper]   ← deterministic regex/NER for 18 HIPAA identifiers
   │
   ▼
[Gemma 4 router]         ← classifies: abstract-extractable | DP-tolerant | local-only
   │
   ├─ abstract-extractable (~70%) → [Query Synthesizer]        → proxy text ┐
   ├─ DP-tolerant          (~20%) → [DP bottleneck + decoder]              ├─→ cloud LLM
   └─ local-only           (~10%) → [Local Gemma answer]                   │
                                                                            │
                                    [Answer Applier] ← rehydrate entity map ┘
```

Key properties:

- Safe Harbor stripping is the **primary PHI defense**. NGSP is a secondary defense
  against quasi-identifier recombination and free-text leakage.
- The DP path gives **formal (ε, δ) bounds** via Gaussian noise + Rényi accounting.
  Cumulative ε is tracked per session; the system hard-refuses when the budget is spent.
- Query synthesis beats content translation. For abstract-extractable tasks a new
  self-contained query is generated — the mapping is non-injective, so inversion fails.
- **Canary tokens** run in the background. Every test input contains a sentinel string;
  any canary appearing in an outbound API call is a run failure independent of other metrics.

Full architectural detail: [`CLAUDE.md`](CLAUDE.md) and [`paper/paper.md`](paper/paper.md).

---

## Research

The `paper/` directory contains a research-paper-style writeup including:

- Formal hypothesis and falsification conditions
- Threat model and metrics
- Five adversarial attack classes (verbatim, semantic similarity, span inversion,
  membership inference, downstream utility)
- Quantitative results at ε ∈ {0.5, 1.0, 2.0, 3.0, 5.0, 10.0}
- Negative results and limitations

Run the full attack battery:

```bash
# Full battery at ε = 3.0 on 50 synthetic documents
python3 experiments/run_attacks.py --epsilon 3.0 --n-docs 50

# Privacy/utility curve across six ε values
python3 experiments/calibrate_epsilon.py

# Component ablation (Safe Harbor only vs. +router vs. +DP)
python3 experiments/ablations.py --n-docs 20
```

---

## Keyboard shortcuts

See [`docs/shortcuts.md`](docs/shortcuts.md) for the full list.

Quick reference:

| Shortcut | Action |
|----------|--------|
| ⌘1 / ⌘2 / ⌘3 | Focus left / main / right pane |
| ⌘J | Toggle forensic dock |
| ⌘⇧A | Switch to Analyst persona |
| ⌘⇧R | Switch to Reviewer persona |

---

## Privacy invariants

- **No real PHI in the repository.** The corpus is fully synthetic.
- **No API key in code or git history.** Keys live in `.env` only.
- **Audit log hashes only.** Raw inputs and outputs are never written to disk.
- **Canary tokens enforced.** Any canary in an outbound API call is a run failure.
- **DP ε accounting is session-scoped and monotone.** Hard-refuse on budget exhaustion.

---

## License

Apache 2.0. See research paper for acknowledgements.
