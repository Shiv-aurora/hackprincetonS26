#!/usr/bin/env bash
# Starts backend + frontend, waits for health check, opens browser.
# Traps Ctrl+C to kill both processes cleanly.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

# -------------------------------------------------------------------
# Cleanup — kill background processes on exit or Ctrl+C
# -------------------------------------------------------------------
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo ""
  echo "[demo] Shutting down..."
  [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM EXIT

# -------------------------------------------------------------------
# Start backend
# -------------------------------------------------------------------
echo "[demo] Starting backend on port $BACKEND_PORT..."
cd "$REPO_ROOT"

# Load .env if present (sets ANTHROPIC_API_KEY etc.)
if [[ -f .env ]]; then
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

uvicorn backend.main:app --port "$BACKEND_PORT" --log-level warning &
BACKEND_PID=$!

# -------------------------------------------------------------------
# Wait for health check
# -------------------------------------------------------------------
echo "[demo] Waiting for backend health check..."
MAX_WAIT=30
ELAPSED=0
until curl -sf "http://localhost:$BACKEND_PORT/api/health" > /dev/null 2>&1; do
  sleep 1
  ELAPSED=$((ELAPSED + 1))
  if [[ $ELAPSED -ge $MAX_WAIT ]]; then
    echo "[demo] ERROR: Backend did not start within ${MAX_WAIT}s."
    exit 1
  fi
done
echo "[demo] Backend ready (${ELAPSED}s)."

# -------------------------------------------------------------------
# Start frontend
# -------------------------------------------------------------------
echo "[demo] Starting frontend on port $FRONTEND_PORT..."
cd "$REPO_ROOT/frontend"
VITE_API_URL="http://localhost:$BACKEND_PORT" npx vite --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

# Give Vite a moment to print its ready message, then open the browser.
sleep 3

URL="http://localhost:$FRONTEND_PORT/?demo=1"
echo "[demo] Opening $URL"
case "$(uname -s)" in
  Darwin) open "$URL" ;;
  Linux)  xdg-open "$URL" 2>/dev/null || true ;;
  *)      echo "[demo] Open $URL manually." ;;
esac

echo "[demo] Running. Press Ctrl+C to stop."
# Wait for background processes so the trap fires correctly.
wait
