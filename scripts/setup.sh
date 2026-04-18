#!/usr/bin/env bash
# Bootstrap a Python venv for the NGSP clinical-trial privacy project and install dependencies.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PYTHON_BIN="${PYTHON_BIN:-python3}"
VENV_DIR="${VENV_DIR:-.venv}"

if [ ! -d "$VENV_DIR" ]; then
    echo "[setup] creating virtualenv at $VENV_DIR using $PYTHON_BIN"
    "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1090
source "$VENV_DIR/bin/activate"

echo "[setup] upgrading pip, setuptools, wheel"
python -m pip install --upgrade pip setuptools wheel

echo "[setup] installing project (editable) with dev extras"
python -m pip install -e ".[dev]"

if [ ! -f .env ]; then
    echo "[setup] no .env found — copying from .env.example (edit it before running anything that calls an API)"
    cp .env.example .env
fi

mkdir -p experiments/results/raw experiments/results/cache paper/figures

echo "[setup] done. activate with: source $VENV_DIR/bin/activate"
echo "[setup] next: edit .env, then run: python scripts/download_gemma.py"
