#!/usr/bin/env python3
"""Seed and verify the NGSP demo fixture state.

Usage:
    python scripts/seed-demo.py [--base-url http://localhost:8000]
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any

try:
    import urllib.request
    import urllib.error
except ImportError:
    pass


# Parse CLI args and return the base URL for the backend.
def parse_args() -> str:
    parser = argparse.ArgumentParser(description="Seed the NGSP demo fixtures.")
    parser.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="Backend base URL (default: http://localhost:8000)",
    )
    args = parser.parse_args()
    return args.base_url.rstrip("/")


# Perform an HTTP request and return (status_code, response_body_dict).
def _request(
    method: str,
    url: str,
    body: dict[str, Any] | None = None,
) -> tuple[int, Any]:
    data: bytes | None = None
    headers: dict[str, str] = {}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        return exc.code, {}
    except Exception as exc:  # noqa: BLE001
        return -1, {"error": str(exc)}


# Check backend liveness via GET /api/health; return True if server is up.
def check_health(base_url: str) -> bool:
    status, body = _request("GET", f"{base_url}/api/health")
    if status == 200:
        print(f"  [PASS] /api/health → {body.get('status', 'ok')} (mock_mode={body.get('mock_mode')})")
        return True
    print(f"  [FAIL] /api/health → HTTP {status}")
    print(f"         Ensure the backend is running: uvicorn backend.main:app --port 8000")
    return False


# Verify the dataset schema endpoint returns a non-empty columns list.
def check_dataset_schema(base_url: str) -> bool:
    status, body = _request("GET", f"{base_url}/api/dataset/schema")
    if status == 200 and body.get("columns"):
        col_names = [c.get("name", "?") for c in body["columns"]]
        print(f"  [PASS] /api/dataset/schema → {len(col_names)} columns: {col_names[:5]}…")
        return True
    print(f"  [FAIL] /api/dataset/schema → HTTP {status}, body={body}")
    return False


# Pre-warm the signal cluster endpoint with the demo study ID and case.
def prewarm_signal(base_url: str) -> bool:
    payload = {
        "study_id": "DEMO-STUDY-001",
        "current_case_id": "CASE-042",
        "window_days": 30,
    }
    status, body = _request("POST", f"{base_url}/api/signal/cluster", body=payload)
    if status == 200:
        n_events = len(body.get("events", []))
        n_clusters = len(body.get("clusters", []))
        print(f"  [PASS] /api/signal/cluster → {n_events} events, {n_clusters} clusters")
        return True
    print(f"  [FAIL] /api/signal/cluster → HTTP {status}, body={body}")
    return False


# Verify the timeline endpoint responds to a small SAE narrative fixture.
def check_timeline(base_url: str) -> bool:
    narrative = (
        "Patient Beta-7, 47-year-old female, received SYN-9182 50mg daily from Day 1. "
        "Grade 3 rash onset at Day 5. Drug was discontinued at Day 10. "
        "ALT elevated to 78 U/L on Day 5, normalized by Day 15. "
        "Concomitant medication: DRUG_1 throughout. Site 9001."
    )
    payload = {"document": narrative}
    status, body = _request("POST", f"{base_url}/api/timeline/assemble", body=payload)
    if status == 200:
        has_tracks = "tracks" in body
        causality = body.get("causality", {}).get("verdict", "?")
        print(f"  [PASS] /api/timeline/assemble → tracks present={has_tracks}, causality={causality!r}")
        return True
    print(f"  [FAIL] /api/timeline/assemble → HTTP {status}, body={body}")
    return False


# Run all seed checks and return True only if every check passes.
def run_all(base_url: str) -> bool:
    print(f"\nNGSP Demo Seed — target: {base_url}\n")

    # Health check must pass before anything else.
    if not check_health(base_url):
        print("\n[ABORT] Backend is not reachable. Start it with:")
        print(f"  cd backend && uvicorn main:app --reload --port 8000")
        return False

    results: list[tuple[str, bool]] = []
    results.append(("dataset/schema", check_dataset_schema(base_url)))
    results.append(("signal/cluster prewarm", prewarm_signal(base_url)))
    results.append(("timeline/assemble", check_timeline(base_url)))

    print("\n── Summary ─────────────────────────────────")
    all_pass = True
    for name, passed in results:
        icon = "PASS" if passed else "FAIL"
        print(f"  [{icon}] {name}")
        if not passed:
            all_pass = False

    if all_pass:
        print("\nAll checks passed. Demo fixtures are ready.\n")
    else:
        print("\nOne or more checks failed. See output above.\n")

    return all_pass


# Entry point — parse args, run checks, exit with appropriate code.
def main() -> None:
    base_url = parse_args()
    success = run_all(base_url)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
