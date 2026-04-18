#!/usr/bin/env python3
# Run the minimal re-identification attack over a mixed 30-doc corpus, local half only.
"""Execute the local half of the NGSP pipeline (strip → extract → route →
synthesize_query or zero-noise decode_proxy) on a mixed synthetic corpus (default: 15
SAE narratives + 15 protocol excerpts), then score every proxy with
attacks.reidentification.

The mix is chosen so that both routing paths are sampled: the route_distribution
experiment showed SAE narratives route to dp_tolerant while protocol excerpts split
roughly 65/35 between abstract_extractable and dp_tolerant. Pure-SAE corpora produce
zero abstract_extractable samples, so a mix is required for the cross-path comparison.

No remote API calls are made.

Outputs:
    experiments/results/attack_results.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))


# Parse the small CLI surface for this experiment.
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="NGSP re-identification attack over a mixed synthetic corpus")
    parser.add_argument("--n-sae", type=int, default=15,
                        help="Number of SAE narratives to include (default: 15).")
    parser.add_argument("--n-protocol", type=int, default=15,
                        help="Number of protocol excerpts to include (default: 15).")
    parser.add_argument("--seed", type=int, default=42,
                        help="Seed for corpus generation (default: 42).")
    parser.add_argument("--sensitivity", type=float, default=1.0,
                        help="L2 clip bound for dp_tolerant path (default: 1.0).")
    return parser.parse_args()


# Build the mixed corpus: SAE narratives + protocol excerpts with doc_id-preserving order.
def _load_mixed_corpus(n_sae: int, n_protocol: int, seed: int) -> list[object]:
    from data.synthetic_protocol import generate_protocol_excerpts
    from data.synthetic_sae import generate_sae_narratives

    sae = generate_sae_narratives(n=max(n_sae, 20), seed=seed)[:n_sae]
    protocol = generate_protocol_excerpts(n=max(n_protocol, 20), seed=seed + 1)[:n_protocol]
    return list(sae) + list(protocol)


# Run the local-only portion of the pipeline for one document and return the proxy text.
# Returns (route_path, proxy_text or None) — None means the doc routed to local_only and
# is skipped by the attack loop.
def _local_pipeline(doc_text: str, local_model: object, sensitivity: float) -> tuple[str, str | None, list]:
    from ngsp.dp_mechanism import clip_to_norm
    from ngsp.entity_extractor import extract_quasi_identifiers
    from ngsp.proxy_decoder import decode_proxy
    from ngsp.query_synthesizer import synthesize_query
    from ngsp.router import route
    from ngsp.safe_harbor import strip_safe_harbor

    strip = strip_safe_harbor(doc_text, local_model)
    qi_spans = extract_quasi_identifiers(strip.stripped_text, local_model)
    all_spans = strip.spans + qi_spans
    decision = route(strip.stripped_text, all_spans, local_model)
    path = decision.path

    if path == "local_only":
        return path, None, all_spans

    if path == "abstract_extractable":
        proxy = synthesize_query(strip.stripped_text, all_spans, local_model)
        return path, proxy, all_spans

    # dp_tolerant: use the DP bottleneck with a ZERO noise vector (ε = ∞ best case).
    _, hidden_vec = local_model.generate_with_hidden_states(  # type: ignore[attr-defined]
        strip.stripped_text, layer=-1, max_tokens=64
    )
    clipped = clip_to_norm(hidden_vec, sensitivity)
    # No noise is added: we measure what survives proxy generation structurally.
    proxy = decode_proxy(strip.stripped_text, clipped, all_spans, local_model)
    return path, proxy, all_spans


# Render a summary table of per-category verbatim leakage rate + mean Jaccard.
def _format_summary(summary: dict[str, dict[str, float | int]], title: str = "") -> str:
    header = f"{'category':<22} {'n':>4} {'verb_hits':>10} {'leak_rate':>10} {'mean_jac':>10}"
    lines = []
    if title:
        lines.append(title)
    lines.extend([header, "-" * len(header)])
    for cat in sorted(summary.keys()):
        b = summary[cat]
        lines.append(
            f"{cat:<22} {int(b['n_spans']):>4} {int(b['verbatim_hits']):>10} "
            f"{float(b['verbatim_leak_rate']):>10.4f} {float(b['mean_jaccard']):>10.4f}"
        )
    return "\n".join(lines)


# Entry point: load docs, run local pipeline + attack on each, aggregate and save.
def main() -> int:
    args = parse_args()
    print(f"[attacks] n_sae={args.n_sae}, n_protocol={args.n_protocol}, "
          f"seed={args.seed}", flush=True)

    from attacks.reidentification import DocAttackResult, run_attack, summarize
    from ngsp.local_model import LocalModel

    print("[attacks] loading local model …", flush=True)
    local_model = LocalModel()

    # MPS warmup — first generation compiles shaders; keeps per-doc times stable.
    import time
    t0 = time.time()
    _ = local_model.generate("warmup", max_tokens=8)
    print(f"[attacks] MPS warmup {time.time() - t0:.1f}s "
          f"(device={local_model.device}, dtype={local_model.dtype_name})", flush=True)

    docs = _load_mixed_corpus(args.n_sae, args.n_protocol, args.seed)
    print(f"[attacks] loaded {len(docs)} documents "
          f"({args.n_sae} SAE + {args.n_protocol} protocol)", flush=True)

    results: list[DocAttackResult] = []
    skipped_local_only = 0
    failures = 0
    route_counts = {"abstract_extractable": 0, "dp_tolerant": 0, "local_only": 0}

    for i, doc in enumerate(docs):
        try:
            path, proxy, all_spans = _local_pipeline(doc.text, local_model, args.sensitivity)
        except Exception as exc:
            print(f"  [attacks] doc {i} ({doc.doc_id}) local-pipeline error: {exc}",
                  file=sys.stderr)
            failures += 1
            continue

        route_counts[path] = route_counts.get(path, 0) + 1

        if path == "local_only" or proxy is None:
            skipped_local_only += 1
            continue

        # The attack uses the ground-truth spans attached to the synthetic doc so the
        # targets are known exactly — Safe Harbor + quasi-identifier detectors have
        # their own recall story that is measured elsewhere.
        attack = run_attack(
            doc_id=doc.doc_id,
            route=path,
            proxy_text=proxy,
            spans=doc.spans,
        )
        results.append(attack)

        if (i + 1) % 5 == 0:
            print(f"  [attacks] processed {i + 1}/{len(docs)}", flush=True)

    summary_all = summarize(results)
    summary_abs = summarize([r for r in results if r.route == "abstract_extractable"])
    summary_dp = summarize([r for r in results if r.route == "dp_tolerant"])

    print()
    print(f"[attacks] route counts across {len(docs)} docs: {route_counts}")
    print(f"[attacks] attack evaluated on {len(results)} proxies "
          f"(skipped_local_only={skipped_local_only}, failures={failures})")
    print()
    print(_format_summary(summary_all, title="=== OVERALL (all paths combined) ==="))
    print()
    print(_format_summary(summary_abs,
                          title="=== abstract_extractable path ==="))
    print()
    print(_format_summary(summary_dp, title="=== dp_tolerant path ==="))
    print()

    out = {
        "n_docs": len(docs),
        "n_sae": args.n_sae,
        "n_protocol": args.n_protocol,
        "seed": args.seed,
        "route_counts": route_counts,
        "skipped_local_only": skipped_local_only,
        "failures": failures,
        "summary_by_category": summary_all,
        "summary_by_category_abstract_extractable": summary_abs,
        "summary_by_category_dp_tolerant": summary_dp,
        "per_doc": [
            {
                "doc_id": r.doc_id,
                "route": r.route,
                "spans_tested": [
                    {
                        "category": s.category,
                        "char_len": s.char_len,
                        "verbatim_match": s.verbatim_match,
                        "jaccard": s.jaccard,
                    }
                    for s in r.spans_tested
                ],
            }
            for r in results
        ],
    }
    out_path = Path("experiments/results/attack_results.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2))
    print(f"[attacks] results saved → {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
