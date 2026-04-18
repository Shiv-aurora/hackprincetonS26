#!/usr/bin/env python3
# Measure how the NGSP router distributes documents across the three paths by doc type.
"""Run Safe Harbor stripping + quasi-identifier extraction + routing on 80 synthetic docs
(20 each of SAE narratives, protocol excerpts, monitoring reports, CSR drafts) and record
the routing path chosen for each. No remote API calls are required — routing is purely
local.

Outputs:
    experiments/results/route_distribution.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

PATHS = ("abstract_extractable", "dp_tolerant", "local_only")


# Parse the small CLI surface for this experiment.
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="NGSP routing distribution across doc types")
    parser.add_argument("--n-per-type", type=int, default=20,
                        help="Documents per synthetic type (default: 20).")
    parser.add_argument("--seed", type=int, default=42,
                        help="Shared seed basis for corpus generation (default: 42).")
    return parser.parse_args()


# Load n documents from each of the four synthetic generators, returning a flat list.
def _load_docs(n_per_type: int, seed: int) -> list[tuple[str, object]]:
    from data.synthetic_monitoring import generate_monitoring_reports
    from data.synthetic_protocol import generate_protocol_excerpts
    from data.synthetic_sae import generate_sae_narratives
    from data.synthetic_writing import generate_csr_drafts

    sae = generate_sae_narratives(n=max(n_per_type, 20), seed=seed)[:n_per_type]
    protocol = generate_protocol_excerpts(n=max(n_per_type, 20), seed=seed + 1)[:n_per_type]
    monitoring = generate_monitoring_reports(n=max(n_per_type, 20), seed=seed + 2)[:n_per_type]
    writing = generate_csr_drafts(n=max(n_per_type, 20), seed=seed + 3)[:n_per_type]

    out: list[tuple[str, object]] = []
    for d in sae:
        out.append(("sae", d))
    for d in protocol:
        out.append(("protocol", d))
    for d in monitoring:
        out.append(("monitoring", d))
    for d in writing:
        out.append(("writing", d))
    return out


# Run strip → extract → route on a single doc and return the RouteDecision.
def _route_doc(doc: object, local_model: object) -> object:
    from ngsp.entity_extractor import extract_quasi_identifiers
    from ngsp.router import route
    from ngsp.safe_harbor import strip_safe_harbor

    strip = strip_safe_harbor(doc.text, local_model)  # type: ignore[attr-defined]
    qi_spans = extract_quasi_identifiers(strip.stripped_text, local_model)
    all_spans = strip.spans + qi_spans
    return route(strip.stripped_text, all_spans, local_model)


# Fresh counter dict keyed by route path.
def _empty_counts() -> dict[str, int]:
    return {p: 0 for p in PATHS}


# Render a compact text table of route counts by doc type + overall.
def _format_table(by_doc_type: dict[str, dict[str, int]], overall: dict[str, int]) -> str:
    header = f"{'doc_type':<12} {'abstract':>10} {'dp_tol':>8} {'local':>8} {'total':>7}"
    lines = [header, "-" * len(header)]
    for name, counts in by_doc_type.items():
        total = sum(counts.values())
        lines.append(
            f"{name:<12} {counts['abstract_extractable']:>10} "
            f"{counts['dp_tolerant']:>8} {counts['local_only']:>8} {total:>7}"
        )
    lines.append("-" * len(header))
    total_all = sum(overall.values())
    lines.append(
        f"{'OVERALL':<12} {overall['abstract_extractable']:>10} "
        f"{overall['dp_tolerant']:>8} {overall['local_only']:>8} {total_all:>7}"
    )
    return "\n".join(lines)


# Entry point: generate corpus, route every doc, tally, print + save JSON.
def main() -> int:
    args = parse_args()
    print(f"[route-dist] n_per_type={args.n_per_type}, seed={args.seed}", flush=True)

    from ngsp.local_model import LocalModel

    print("[route-dist] loading local model …", flush=True)
    local_model = LocalModel()

    # MPS warmup — first generation compiles shaders (~60-90s); keeps per-doc times stable.
    import time
    t0 = time.time()
    _ = local_model.generate("warmup", max_tokens=8)
    print(f"[route-dist] MPS warmup {time.time() - t0:.1f}s "
          f"(device={local_model.device}, dtype={local_model.dtype_name})", flush=True)

    docs = _load_docs(args.n_per_type, args.seed)
    print(f"[route-dist] loaded {len(docs)} documents", flush=True)

    by_doc_type: dict[str, dict[str, int]] = {
        "sae": _empty_counts(),
        "protocol": _empty_counts(),
        "monitoring": _empty_counts(),
        "writing": _empty_counts(),
    }
    overall = _empty_counts()
    per_doc: list[dict[str, object]] = []

    for i, (doc_type, doc) in enumerate(docs):
        try:
            decision = _route_doc(doc, local_model)
            path = decision.path  # type: ignore[attr-defined]
            rationale = decision.rationale  # type: ignore[attr-defined]
        except Exception as exc:
            print(f"  [route-dist] doc {i} ({doc_type}) error: {exc}", file=sys.stderr)
            path = "dp_tolerant"
            rationale = f"fallback due to exception: {type(exc).__name__}"

        if path not in PATHS:
            path = "dp_tolerant"

        by_doc_type[doc_type][path] += 1
        overall[path] += 1
        per_doc.append({
            "doc_id": getattr(doc, "doc_id", f"doc_{i}"),
            "doc_type": doc_type,
            "path": path,
            "rationale": rationale,
        })
        if (i + 1) % 10 == 0:
            print(f"  [route-dist] routed {i + 1}/{len(docs)}", flush=True)

    table = _format_table(by_doc_type, overall)
    print()
    print(table)
    print()

    out = {
        "n_per_type": args.n_per_type,
        "seed": args.seed,
        "by_doc_type": by_doc_type,
        "overall": overall,
        "per_doc": per_doc,
    }
    out_path = Path("experiments/results/route_distribution.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2))
    print(f"[route-dist] results saved → {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
