#!/usr/bin/env bash
# Clears the audit log via POST /api/audit/reset so the demo can be re-run
# with a clean session without restarting the backend.
set -euo pipefail

BACKEND_PORT="${BACKEND_PORT:-8000}"

echo "[reset-demo] Clearing audit log..."
RESPONSE=$(curl -sf -X POST "http://localhost:$BACKEND_PORT/api/audit/reset" \
  -H "Content-Type: application/json" 2>&1) || {
  echo "[reset-demo] ERROR: Could not reach backend at http://localhost:$BACKEND_PORT"
  echo "[reset-demo] Is the backend running? Start with: uvicorn backend.main:app --port $BACKEND_PORT"
  exit 1
}

echo "[reset-demo] Done. $RESPONSE"
