# Sovereign OS — Neural-Guided Semantic Proxy for clinical-trial privacy

A local filter that lets clinical-trial staff use cloud LLMs on sensitive
documents without leaking PHI, unreleased efficacy data, or internal compound
codenames. A small local model (SmolLM2 / Gemma 4) routes each request into one
of three paths — an abstract query synthesizer, a differentially-private proxy
decoder, or an on-device answer — so the cloud provider only ever sees a
sanitized proxy, never the raw input.

The repository has two layers:

- **Research prototype (`src/`, `experiments/`, `paper/`, `tests/`)** — the
  scientific core. Stripping, routing, DP noise, proxy generation, attack
  suite, and the written-up findings. Completed on the `research-shiv` branch
  and merged to `main`.
- **Product build (`frontend/`, `backend/`, `docs/`, `product-build/`)** —
  the hackathon submission. A FastAPI backend wraps the research pipeline; a
  Vite + React frontend drives the demo. Assembled on the `product-build`
  branch per [FINALIZE_PLAN.md](./FINALIZE_PLAN.md).

See [CLAUDE.md](./CLAUDE.md) for the project mission, architecture decisions,
and invariants. See [docs/architecture.md](./docs/architecture.md) for the
end-to-end data flow of the product build.

## Quick start — research

```bash
bash scripts/setup.sh
cp .env.example .env        # fill in ANTHROPIC_API_KEY (or use sk-ant-mock for offline)
source .venv/bin/activate
pytest -q                   # expect: 57 passed, 3 skipped
```

Reproduce the main experiments (offline, mock Anthropic API):

```bash
export GEMMA_MODEL_ID=HuggingFaceTB/SmolLM2-1.7B-Instruct

# routing distribution across the four synthetic document types
python experiments/route_distribution.py

# (ε, δ)-DP calibration sweep + utility curve
python experiments/calibrate_epsilon.py \
    --epsilons 0.5,1.0,2.0,3.0,5.0 --n-docs 30 --seed 42

# re-identification attack (mixed SAE + protocol corpus)
python experiments/run_attacks.py
```

Outputs land in `experiments/results/`. A written summary of all three is in
[experiments/results/summary.md](./experiments/results/summary.md) and a
formal writeup is in [paper/](./paper/).

## Quick start — product build

> Scaffolded in Steps 0 and 1. The application wiring lands in Step 2+. See
> [FINALIZE_PLAN.md](./FINALIZE_PLAN.md) for the full plan and
> [product-build/CHANGELOG.md](./product-build/CHANGELOG.md) for per-step
> notes.

```bash
# backend (FastAPI) — wired in Step 2
# uvicorn backend.main:app --reload --port "${BACKEND_PORT:-8000}"

# frontend (Vite + React)
cd frontend
cp .env.example .env        # keep GEMINI_API_KEY optional; set VITE_API_URL
npm install
npm run dev                 # http://localhost:3000
```

TODO (Step 2+): one-command `make dev` that starts both layers and the demo
document auto-loads.

## Repository layout

```
.
├── src/ngsp/                 research pipeline (strip, route, DP, proxy)
├── src/attacks/              attack suite (verbatim + similarity + re-id)
├── src/data/                 synthetic clinical-trial corpora
├── experiments/              calibration, routing, attacks + results/
├── paper/                    hypothesis, methodology, results, discussion
├── tests/                    pytest suite (57 passed, 3 skipped)
├── backend/                  FastAPI wrapper (scaffolded Step 1, filled Step 2)
├── frontend/                 Vite + React + TS + Tailwind v4 UI
├── docs/                     demo-document.md, architecture.md
├── product-build/            CHANGELOG.md for the product phase
├── CLAUDE.md                 persistent project context and invariants
├── FINALIZE_PLAN.md          product-build plan (Steps 0–8)
└── pyproject.toml            Python deps (torch, transformers, fastapi, …)
```

## License

MIT. Synthetic data only — no real PHI, no real compound codenames, no real
patient records. See [CLAUDE.md §7](./CLAUDE.md) for project invariants.
