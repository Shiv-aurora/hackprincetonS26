#!/usr/bin/env bash
# Resets the NGSP demo: kills any running servers, clears audit log, restarts backend and frontend.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Kill any process listening on port 8000 (backend).
echo "[reset-demo] Killing any process on port 8000..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true

# Kill any process listening on port 5173 (Vite default) and port 3000 (npm run dev).
echo "[reset-demo] Killing any process on ports 5173 / 3000..."
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Truncate the audit log so the forensic dock starts clean.
echo "[reset-demo] Truncating audit log..."
mkdir -p "$REPO_ROOT/experiments/results"
> "$REPO_ROOT/experiments/results/audit.jsonl" 2>/dev/null || true

# Ensure .env exists; if not, copy .env.example and warn the user.
if [[ ! -f "$REPO_ROOT/.env" ]]; then
  echo "[reset-demo] WARNING: .env not found. Copying .env.example → .env"
  echo "[reset-demo]          Fill in OPENAI_API_KEY (or leave as-is for offline/mock mode)."
  cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
fi

# Load .env so uvicorn inherits OPENAI_API_KEY etc.
set -a
# shellcheck source=/dev/null
source "$REPO_ROOT/.env"
set +a

# Start the backend in the background from the repo root (so relative imports resolve).
echo "[reset-demo] Starting backend (port 8000)..."
cd "$REPO_ROOT"
uvicorn backend.main:app --reload --port 8000 --log-level warning &
BACKEND_PID=$!
echo "[reset-demo] Backend PID: $BACKEND_PID"

# Start the frontend dev server in the background.
echo "[reset-demo] Starting frontend (port 3000)..."
cd "$REPO_ROOT/frontend"
npm run dev &
FRONTEND_PID=$!
echo "[reset-demo] Frontend PID: $FRONTEND_PID"

# Write PIDs to a file so the user can kill them later.
PID_FILE="$REPO_ROOT/.demo-pids"
echo "$BACKEND_PID $FRONTEND_PID" > "$PID_FILE"
echo "[reset-demo] PIDs saved to .demo-pids  (stop with: kill \$(cat .demo-pids))"

# Poll /api/health until the backend is up (max 20 seconds).
echo "[reset-demo] Waiting for backend health check (up to 20 s)..."
MAX_WAIT=20
ELAPSED=0
until curl -sf "http://localhost:8000/api/health" > /dev/null 2>&1; do
  sleep 1
  ELAPSED=$((ELAPSED + 1))
  if [[ $ELAPSED -ge $MAX_WAIT ]]; then
    echo "[reset-demo] ERROR: Backend did not become healthy within ${MAX_WAIT}s."
    echo "[reset-demo] Check for import errors: cd \"$REPO_ROOT\" && uvicorn backend.main:app --port 8000"
    exit 1
  fi
done
echo "[reset-demo] Backend healthy after ${ELAPSED}s."

echo ""
echo "✓ Stack ready at http://localhost:3000"
echo ""
echo "  Analyst persona (default) — http://localhost:3000"
echo "  Reviewer persona          — click the RECORDS icon in the activity bar"
echo ""
echo "  Stop servers : kill \$(cat .demo-pids)"
echo "  Seed checks  : python scripts/seed-demo.py --base-url http://localhost:8000"
echo ""
