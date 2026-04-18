#!/usr/bin/env python3
# Full adversarial attack battery: runs all 5 attack classes at a given ε and saves results.
"""Run the NGSP attack battery at a specified privacy budget.

Usage:
    python experiments/run_attacks.py --epsilon 3.0
    python experiments/run_attacks.py --epsilon 1.0 --n-docs 30 --seed 42

Output:
    experiments/results/attacks_eps{ε}.json
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from typing import Any


# Parse CLI flags and return the configuration namespace.
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="NGSP adversarial attack battery")
    p.add_argument("--epsilon", type=float, default=3.0)
    p.add_argument("--n-docs", type=int, default=50)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--delta", type=float, default=1e-5)
    p.add_argument("--output", type=str, default=None,
                   help="Output JSON path (default: experiments/results/attacks_eps{ε}.json)")
    p.add_argument("--inversion-epochs", type=int, default=3,
                   help="Training epochs for the DistilBERT inversion attacker")
    return p.parse_args()


# Build a serialisable dict from any dataclass instance.
def _dc_to_dict(obj: Any) -> Any:
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {k: _dc_to_dict(v) for k, v in dataclasses.asdict(obj).items()}
    if isinstance(obj, dict):
        return {k: _dc_to_dict(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_dc_to_dict(v) for v in obj]
    return obj


# Generate (original_text, proxy_text, ground_truth_spans) triples from the corpus.
def _build_pairs(
    docs: list[Any],
    pipeline: Any,
    epsilon: float,
    delta: float,
    local_model: Any,
) -> list[tuple[str, str, list[Any]]]:
    from ngsp.pipeline import SessionBudget
    from ngsp.safe_harbor import strip_safe_harbor
    from data.annotator import annotate

    pairs = []
    for doc in docs:
        budget = SessionBudget(epsilon_cap=epsilon, delta=delta)
        try:
            out = pipeline.run(doc.text, budget)
            proxy = out.proxy_text or strip_safe_harbor(doc.text, local_model).stripped_text
        except Exception as exc:
            print(f"  [run_attacks] pipeline error on {doc.doc_id}: {exc}", file=sys.stderr)
            proxy = strip_safe_harbor(doc.text, None).stripped_text
        spans = annotate(doc)
        pairs.append((doc.text, proxy, spans))
    return pairs


# Entry point: run all attacks, print summary, write results JSON.
def main() -> int:
    args = parse_args()
    out_path = Path(args.output) if args.output else \
        Path(f"experiments/results/attacks_eps{args.epsilon}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"[run_attacks] ε={args.epsilon}, n_docs={args.n_docs}, seed={args.seed}")

    from data.synthetic_sae import generate_sae_narratives
    from ngsp.local_model import LocalModel
    from ngsp.pipeline import Pipeline
    from ngsp.remote_client import RemoteClient
    from attacks.verbatim import run_verbatim
    from attacks.similarity import run_similarity
    from attacks.inversion import run_inversion
    from attacks.membership import run_membership
    from attacks.utility import run_utility

    print("[run_attacks] loading models …")
    local_model = LocalModel()
    remote_client = RemoteClient()
    pipeline = Pipeline(local_model=local_model, remote_client=remote_client)

    docs = generate_sae_narratives(n=max(args.n_docs, 20), seed=args.seed)[:args.n_docs]
    print(f"[run_attacks] loaded {len(docs)} SAE narratives")

    print("[run_attacks] generating proxy pairs …")
    triples = _build_pairs(docs, pipeline, args.epsilon, args.delta, local_model)
    proxy_span_pairs = [(proxy, spans) for _, proxy, spans in triples]
    text_pairs = [(orig, proxy) for orig, proxy, _ in triples]

    results: dict[str, Any] = {
        "epsilon": args.epsilon,
        "delta": args.delta,
        "n_docs": len(triples),
        "seed": args.seed,
        "local_model": local_model.config.model_id,
        "remote_model": remote_client.model,
    }

    print("[run_attacks] Attack 1 — verbatim …")
    results["verbatim"] = _dc_to_dict(run_verbatim(proxy_span_pairs))
    print(f"  literal_leak_rate={results['verbatim']['overall_literal_leak_rate']:.4f}")

    print("[run_attacks] Attack 2 — similarity …")
    results["similarity"] = _dc_to_dict(run_similarity(text_pairs))
    print(f"  mean_sim={results['similarity']['mean_sim']:.4f}")

    print("[run_attacks] Attack 3 — inversion (DistilBERT) …")
    results["inversion"] = _dc_to_dict(
        run_inversion(proxy_span_pairs, seed=args.seed, n_epochs=args.inversion_epochs)
    )
    print(f"  overall_f1={results['inversion']['overall_f1']:.4f}  "
          f"(random_baseline={results['inversion']['baseline_random_f1']:.4f})")

    print("[run_attacks] Attack 4 — membership inference …")
    results["membership"] = _dc_to_dict(
        run_membership(proxy_span_pairs, seed=args.seed)
    )
    print(f"  mean_auc={results['membership']['mean_auc']:.4f}")

    print("[run_attacks] Attack 5 — utility …")
    results["utility"] = _dc_to_dict(
        run_utility(docs, pipeline, remote_client, seed=args.seed)
    )
    print(f"  utility_ratio={results['utility']['utility_ratio']:.4f}")

    out_path.write_text(json.dumps(results, indent=2))
    print(f"[run_attacks] done → {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
