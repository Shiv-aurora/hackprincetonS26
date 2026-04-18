# NGSP Frontend

Vite 6 + React 19 + TypeScript + Tailwind v4. VS Code-themed UI for the Neural-Guided Semantic Proxy demo.

## Prerequisites

- Node.js 20+
- The NGSP backend running on port 8000 (see `../backend/README.md`)

## Run

```bash
cd frontend
cp .env.example .env          # optional — defaults work for local dev
npm install
npm run dev                   # http://localhost:5173
```

The app pre-loads the demo SAE narrative on startup. If the backend is unreachable it shows an error banner and continues in a degraded state.

## Environment variables

| Variable       | Default                  | Description                        |
|----------------|--------------------------|------------------------------------|
| `VITE_API_URL` | `http://localhost:8000`  | Backend base URL                   |

## Tabs

| Tab      | Icon        | Function                                      |
|----------|-------------|-----------------------------------------------|
| RECORDS  | Stethoscope | Document view — SAE narrative with highlights |
| VITALS   | Activity    | Privacy session stats + DP budget             |
| PHARMACY | Pill        | Settings — backend URL, model selector        |

## Type check

```bash
npm run lint    # tsc --noEmit
```
