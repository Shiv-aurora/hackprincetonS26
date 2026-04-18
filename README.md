# Sovereign OS — Neural-Guided Semantic Proxy

> *Clinical staff will use AI. The question is whether it leaks.*

A local privacy proxy that lets clinical-trial staff use cloud LLMs on sensitive documents without exposing PHI, unreleased efficacy data, or internal compound codes. A small local model routes each request into one of three paths — an abstract query synthesizer, a differentially-private proxy decoder, or an on-device answer — so the cloud provider only ever sees a sanitized proxy.

**HackPrinceton S26 — Regeneron Clinical Trials Track / Alignment & Safety Track**

---

## Quick start (one command)

```bash
./scripts/demo.sh
```

Starts the FastAPI backend (port 8000) and Vite frontend (port 5173), waits for the health check, and opens the browser. Press Ctrl+C to stop both.

To reset the audit log between demo runs:

```bash
./scripts/reset-demo.sh
```

---

## Manual start

```bash
# 1. Install Python deps
pip install -e .

# 2. Configure environment
cp .env.example .env            # leave ANTHROPIC_API_KEY blank for offline/mock mode

# 3. Start backend
uvicorn backend.main:app --reload --port 8000

# 4. Start frontend (separate terminal)
cd frontend && npm install && npm run dev   # http://localhost:5173
```

---

## What you'll see

The app opens to a VS Code-styled interface pre-loaded with a synthetic SAE narrative (Subject 04-0023, compound BMS-986253-301). The interface shows:

- **Left pane**: original document with color-coded entity highlights — PHI in amber, IP in blue, MNPI in yellow.
- **Right pane**: the proxy text that would be sent to the cloud — placeholder tokens only, no raw values.
- **"What would have leaked" banner**: if this document were pasted directly into ChatGPT, N sensitive items would be exposed.
- **Chat panel**: ask a clinical question (e.g. "Rewrite in ICH E2B format"). The response is rehydrated locally — the cloud model only saw the proxy.

For the exact 60-second demo script, see [docs/demo-script.md](./docs/demo-script.md).

---

## Research results

All experiments run offline on a synthetic clinical-trial corpus. Anthropic API is mocked.

| Metric | Result |
|--------|--------|
| Task utility (mean, all ε) | **86.0%** (target: 85%) |
| Verbatim leak — abstract path | **0–20%** |
| Verbatim leak — dp_tolerant path | **50–87%** |
| Expert Determination threshold | 9% |
| Documents routed without cloud call | **4%** (local_only) |

**Key finding:** Formal DP in the hidden-state bottleneck does not reach the text surface with a greedy, training-free decoder. Query synthesis on the abstract-extractable path is the usable privacy primitive for this stack.

Full writeup: [paper/paper.md](./paper/paper.md)
Results summary: [experiments/results/summary.md](./experiments/results/summary.md)

---

## Repository layout

```
.
├── src/ngsp/           research pipeline (strip, route, DP, proxy, rehydrate)
├── src/attacks/        attack suite (verbatim, similarity, inversion, membership, utility)
├── src/data/           synthetic clinical-trial corpus generators
├── experiments/        calibration, routing, attack runs + results/
├── paper/              research writeup + figures
├── tests/              pytest suite (57 passed, 3 skipped)
├── backend/            FastAPI wrapper — 7 endpoints, offline+online modes
├── frontend/           Vite + React 19 + TypeScript + Tailwind v4 UI
├── docs/               architecture.md, demo-script.md, pitch-deck-outline.md
├── scripts/            demo.sh, reset-demo.sh, setup.sh
└── product-build/      CHANGELOG.md for the product build phase
```

---

## Run research experiments

```bash
bash scripts/setup.sh
source .venv/bin/activate
pytest -q                                           # 57 passed, 3 skipped

export GEMMA_MODEL_ID=HuggingFaceTB/SmolLM2-1.7B-Instruct

python experiments/route_distribution.py --n-per-type 20 --seed 42
python experiments/calibrate_epsilon.py --epsilons 0.5,1.0,2.0,3.0,5.0 --n-docs 30 --seed 42
python experiments/run_attacks.py --n-sae 15 --n-protocol 15 --seed 42
```

Hardware: M1 Max, 32 GB. Total wall-clock: ~90 minutes.

---

## License

MIT. Corpus is entirely synthetic — no real PHI, no real compound codenames, no real clinical results.
