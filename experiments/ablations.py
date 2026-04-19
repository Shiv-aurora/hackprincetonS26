#!/usr/bin/env python3
# Ablation study: measures Attack 1 (verbatim) and Attack 3 (inversion F1) under four
# component configurations (Safe Harbor only → full system) to isolate each defence's value.
"""Run the NGSP ablation study.

Usage:
    python experiments/ablations.py --n-docs 10 --seed 42

Output:
    experiments/results/ablations.json
"""
from __future__ import annotations

import dataclasses
import json
import sys
from pathlib import Path
from typing import Any

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))


# Build a serialisable dict from any dataclass instance.
def _dc_to_dict(obj: Any) -> Any:
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {k: _dc_to_dict(v) for k, v in dataclasses.asdict(obj).items()}
    if isinstance(obj, (dict,)):
        return {k: _dc_to_dict(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_dc_to_dict(v) for v in obj]
    return obj


# Generate proxy texts using Safe Harbor stripping only (no NGSP routing or DP).
def _proxies_safe_harbor_only(docs: list[Any], local_model: Any) -> list[tuple[str, Any]]:
    from ngsp.safe_harbor import strip_safe_harbor
    from data.annotator import annotate

    return [
        (strip_safe_harbor(doc.text, local_model).stripped_text, annotate(doc))
        for doc in docs
    ]


# Generate proxy texts using the abstract_extractable path only (Safe Harbor + query synthesis).
def _proxies_synthesis_only(docs: list[Any], pipeline: Any) -> list[tuple[str, Any]]:
    from ngsp.pipeline import SessionBudget
    from ngsp.safe_harbor import strip_safe_harbor
    from data.annotator import annotate

    pairs = []
    for doc in docs:
        budget = SessionBudget(epsilon_cap=100.0)  # effectively unlimited — we want synth path
        try:
            out = pipeline.run(doc.text, budget)
            proxy = out.proxy_text or strip_safe_harbor(doc.text, None).stripped_text
        except Exception:
            proxy = strip_safe_harbor(doc.text, None).stripped_text
        pairs.append((proxy, annotate(doc)))
    return pairs


# Generate proxy texts using the DP-only path for all inputs (no query synthesis).
def _proxies_dp_only(docs: list[Any], local_model: Any, epsilon: float, delta: float) -> list[tuple[str, Any]]:
    from ngsp.safe_harbor import strip_safe_harbor
    from ngsp.dp_mechanism import compute_sigma, clip_to_norm, add_gaussian_noise
    from ngsp.proxy_decoder import decode_proxy
    from data.annotator import annotate

    sigma = compute_sigma(epsilon, delta)
    pairs = []
    for doc in docs:
        strip = strip_safe_harbor(doc.text, local_model)
        try:
            _, hidden = local_model.generate_with_hidden_states(strip.stripped_text, layer=-1, max_tokens=64)
            clipped = clip_to_norm(hidden, C=1.0)
            noisy = add_gaussian_noise(clipped, sigma, seed=42)
            proxy = decode_proxy(strip.stripped_text, noisy, strip.spans, local_model)
        except Exception:
            proxy = strip.stripped_text
        pairs.append((proxy, annotate(doc)))
    return pairs


# Generate proxy texts using the full three-path NGSP pipeline.
def _proxies_full(docs: list[Any], pipeline: Any, epsilon: float, delta: float) -> list[tuple[str, Any]]:
    from ngsp.pipeline import SessionBudget
    from ngsp.safe_harbor import strip_safe_harbor
    from data.annotator import annotate

    pairs = []
    for doc in docs:
        budget = SessionBudget(epsilon_cap=epsilon, delta=delta)
        try:
            out = pipeline.run(doc.text, budget)
            proxy = out.proxy_text or strip_safe_harbor(doc.text, None).stripped_text
        except Exception:
            proxy = strip_safe_harbor(doc.text, None).stripped_text
        pairs.append((proxy, annotate(doc)))
    return pairs


# Run one ablation configuration: verbatim + inversion attacks, return summary dict.
def _run_config(
    name: str,
    proxy_span_pairs: list[tuple[str, Any]],
    seed: int,
    inversion_epochs: int = 2,
) -> dict[str, Any]:
    from attacks.verbatim import run_verbatim
    from attacks.inversion import run_inversion

    verbatim = _dc_to_dict(run_verbatim(proxy_span_pairs))
    inversion = _dc_to_dict(run_inversion(proxy_span_pairs, seed=seed, n_epochs=inversion_epochs))
    return {
        "config": name,
        "verbatim_literal_leak_rate": verbatim["overall_literal_leak_rate"],
        "verbatim_fuzzy_leak_rate": verbatim["overall_fuzzy_leak_rate"],
        "inversion_f1": inversion["overall_f1"],
        "inversion_baseline_f1": inversion["baseline_random_f1"],
        "verbatim_full": verbatim,
        "inversion_full": inversion,
    }


# Entry point: run ablations for four configurations and write results JSON.
def main() -> int:
    import argparse

    p = argparse.ArgumentParser(description="NGSP ablation study")
    p.add_argument("--n-docs", type=int, default=20)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--epsilon", type=float, default=3.0)
    p.add_argument("--delta", type=float, default=1e-5)
    p.add_argument("--inversion-epochs", type=int, default=2)
    args = p.parse_args()

    from data.synthetic_sae import generate_sae_narratives
    from ngsp.local_model import LocalModel
    from ngsp.pipeline import Pipeline
    from ngsp.remote_client import RemoteClient

    print(f"[ablations] loading models, n_docs={args.n_docs}, ε={args.epsilon}")
    local_model = LocalModel()
    remote_client = RemoteClient()
    pipeline = Pipeline(local_model=local_model, remote_client=remote_client)
    docs = generate_sae_narratives(n=max(args.n_docs, 10), seed=args.seed)[:args.n_docs]

    configs: list[dict[str, Any]] = []

    print("[ablations] config 1: Safe Harbor only")
    pairs_sh = _proxies_safe_harbor_only(docs, local_model)
    configs.append(_run_config("safe_harbor_only", pairs_sh, args.seed, args.inversion_epochs))

    print("[ablations] config 2: Safe Harbor + query synthesis")
    pairs_synth = _proxies_synthesis_only(docs, pipeline)
    configs.append(_run_config("safe_harbor_plus_synthesis", pairs_synth, args.seed, args.inversion_epochs))

    print("[ablations] config 3: Safe Harbor + DP only")
    pairs_dp = _proxies_dp_only(docs, local_model, args.epsilon, args.delta)
    configs.append(_run_config("safe_harbor_plus_dp", pairs_dp, args.seed, args.inversion_epochs))

    print("[ablations] config 4: full system")
    pairs_full = _proxies_full(docs, pipeline, args.epsilon, args.delta)
    configs.append(_run_config("full_system", pairs_full, args.seed, args.inversion_epochs))

    out = {
        "epsilon": args.epsilon,
        "delta": args.delta,
        "n_docs": len(docs),
        "seed": args.seed,
        "local_model": local_model.config.model_id,
        "configs": configs,
    }

    out_path = Path("experiments/results/ablations.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2))

    print("\n[ablations] summary:")
    print(f"  {'Config':<35} {'Verbatim':>10} {'Inv F1':>10}")
    for c in configs:
        print(f"  {c['config']:<35} {c['verbatim_literal_leak_rate']:>10.4f} {c['inversion_f1']:>10.4f}")
    print(f"\n[ablations] done → {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
