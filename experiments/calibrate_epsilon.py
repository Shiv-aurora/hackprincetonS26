#!/usr/bin/env python3
# Sweeps ε values against the synthetic corpus to produce a privacy/utility curve.
"""Calibrate NGSP epsilon: sweep ε ∈ {0.5, 1.0, 2.0, 3.0, 5.0, 10.0} and measure utility.

Usage:
    python experiments/calibrate_epsilon.py
    python experiments/calibrate_epsilon.py --epsilons 0.5,1.0,3.0 --n-docs 50

Outputs:
    experiments/results/calibration.json
    paper/figures/epsilon_utility_curve.png
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))


# Parse command-line flags and return the resolved configuration namespace.
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Calibrate NGSP privacy/utility tradeoff")
    parser.add_argument(
        "--epsilons",
        default="0.5,1.0,2.0,3.0,5.0,10.0",
        help="Comma-separated list of ε values to sweep (default: 0.5,1.0,2.0,3.0,5.0,10.0)",
    )
    parser.add_argument(
        "--n-docs",
        type=int,
        default=20,
        help="Number of documents to sample per ε value (default: 20)",
    )
    parser.add_argument(
        "--delta",
        type=float,
        default=1e-5,
        help="δ for the (ε,δ)-DP guarantee (default: 1e-5)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for corpus sampling (default: 42)",
    )
    return parser.parse_args()


# Sample n SAE narratives from the synthetic corpus with a fixed seed for reproducibility.
def _load_corpus(n: int, seed: int) -> list[Any]:
    from data.synthetic_sae import generate_sae_narratives

    docs = generate_sae_narratives(n=max(n, 20), seed=seed)
    return docs[:n]


# Evaluate proxy utility locally without any remote API call.
# Heuristic: ratio of (non-placeholder) proxy word tokens that also occur in the stripped
# original over the total word count of the stripped original. This stands in for the
# "did the proxy preserve the task-relevant content?" judgement that the Anthropic API
# previously answered. Deterministic, offline, cheap — used across all ε sweeps.
def _evaluate_utility(
    original_text: str,
    proxy_text: str,
    remote_client: Any,  # kept for signature compatibility; unused in offline mode
) -> float:
    import re

    def _tokens(s: str) -> list[str]:
        # Lowercase word tokens, dropping placeholder markers like <NAME_1>.
        no_placeholders = re.sub(r"<[A-Z_]+_\d+>", " ", s)
        return re.findall(r"[a-z0-9]+", no_placeholders.lower())

    orig_tokens = _tokens(original_text)
    proxy_tokens = _tokens(proxy_text)
    if not orig_tokens:
        return 0.0
    orig_set = set(orig_tokens)
    overlap = sum(1 for t in proxy_tokens if t in orig_set)
    score = overlap / len(orig_tokens)
    return max(0.0, min(1.0, score))


# Pre-compute and cache the per-doc objects that do not depend on ε: stripped text,
# safe-harbor spans, extracted quasi-identifier spans, and the clipped clean hidden
# vector. These steps are the expensive ones (NER generate + hidden-state generate),
# so running them once per doc instead of once per (doc, ε) pair yields ~5× wall-clock
# savings on a 5-point ε sweep with no change to the DP math.
def _precompute_doc_cache(docs: list[Any], local_model: Any) -> list[dict[str, Any]]:
    import time

    from ngsp.dp_mechanism import clip_to_norm
    from ngsp.entity_extractor import extract_quasi_identifiers
    from ngsp.safe_harbor import strip_safe_harbor

    cache: list[dict[str, Any]] = []
    for i, doc in enumerate(docs):
        t0 = time.time()
        strip = strip_safe_harbor(doc.text, local_model)
        qi_spans = extract_quasi_identifiers(strip.stripped_text, local_model)
        all_spans = strip.spans + qi_spans
        _, hidden = local_model.generate_with_hidden_states(
            strip.stripped_text, layer=-1, max_tokens=64
        )
        clipped = clip_to_norm(hidden, 1.0)
        cache.append({
            "doc": doc,
            "stripped": strip.stripped_text,
            "spans": all_spans,
            "clipped_hidden": clipped,
        })
        print(f"  [calibrate] cached doc {i + 1}/{len(docs)} in {time.time() - t0:.1f}s",
              flush=True)
    return cache


# Run one calibration pass at the given ε against a prebuilt per-doc cache.
# Only the noise + decode_proxy step runs here — the strip + hidden-state work was
# already done by `_precompute_doc_cache`.
def _run_epsilon(
    epsilon: float,
    doc_cache: list[dict[str, Any]],
    delta: float,
    local_model: Any,
    remote_client: Any,
) -> dict[str, Any]:
    from ngsp.dp_mechanism import add_gaussian_noise, compute_sigma
    from ngsp.proxy_decoder import decode_proxy

    sigma = compute_sigma(epsilon, delta)
    scores: list[float] = []
    failures: int = 0

    for entry in doc_cache:
        try:
            noisy = add_gaussian_noise(entry["clipped_hidden"], sigma)
            proxy = decode_proxy(entry["stripped"], noisy, entry["spans"], local_model)
            score = _evaluate_utility(entry["doc"].text, proxy, remote_client)
            scores.append(score)
        except Exception as exc:
            print(f"  [calibrate] warning: {exc}", file=sys.stderr)
            failures += 1

    mean_utility = sum(scores) / max(len(scores), 1)
    return {
        "epsilon": epsilon,
        "delta": delta,
        "sigma": sigma,
        "n_docs": len(doc_cache),
        "n_scored": len(scores),
        "n_failures": failures,
        "mean_utility": mean_utility,
        "scores": scores,
    }


# Plot the privacy/utility curve from calibration results, saving to paper/figures/.
def _plot_curve(results: list[dict], out_path: Path) -> None:
    import matplotlib.pyplot as plt

    epsilons = [r["epsilon"] for r in results]
    utilities = [r["mean_utility"] for r in results]

    fig, ax = plt.subplots(figsize=(7, 4))
    ax.plot(epsilons, utilities, marker="o", linewidth=2, color="#2563eb")
    ax.axhline(0.85, color="#dc2626", linestyle="--", linewidth=1, label="Target utility 0.85")
    ax.set_xlabel("Privacy budget ε")
    ax.set_ylabel("Mean utility score (0–1)")
    ax.set_title("NGSP DP bottleneck: privacy–utility curve")
    ax.legend()
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=150)
    fig.savefig(out_path.with_suffix(".svg"))
    plt.close(fig)
    print(f"[calibrate] figure saved → {out_path}")


# Any type used for doc objects — resolved at runtime.
from typing import Any


# Entry point: parse args, run calibration, write results and figure.
def main() -> int:
    args = parse_args()
    epsilons = [float(e.strip()) for e in args.epsilons.split(",")]
    print(f"[calibrate] ε sweep: {epsilons}, n_docs={args.n_docs}, δ={args.delta}")

    from ngsp.local_model import LocalModel
    from ngsp.remote_client import RemoteClient

    print("[calibrate] loading local model …")
    local_model = LocalModel()
    remote_client = RemoteClient()

    # MPS warmup: first generation compiles shaders; running a throwaway call here
    # keeps the per-doc timings stable and visible in the log.
    import time
    t0 = time.time()
    _ = local_model.generate("warmup", max_tokens=8)
    print(f"[calibrate] MPS warmup done in {time.time() - t0:.1f}s "
          f"(device={local_model.device}, dtype={local_model.dtype_name})")

    docs = _load_corpus(args.n_docs, args.seed)
    print(f"[calibrate] loaded {len(docs)} documents from synthetic corpus")

    print(f"[calibrate] precomputing per-doc cache (strip + NER + hidden-state) …")
    doc_cache = _precompute_doc_cache(docs, local_model)
    print(f"[calibrate] cache ready: {len(doc_cache)} docs")

    all_results = []
    for eps in epsilons:
        print(f"[calibrate] running ε={eps} …", flush=True)
        result = _run_epsilon(eps, doc_cache, args.delta, local_model, remote_client)
        print(
            f"  ε={eps}: mean_utility={result['mean_utility']:.3f}, "
            f"scored={result['n_scored']}/{result['n_docs']}",
            flush=True,
        )
        all_results.append(result)

    out_path = Path("experiments/results/calibration.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(all_results, indent=2))
    print(f"[calibrate] results saved → {out_path}")

    figure_path = Path("paper/figures/epsilon_utility_curve.png")
    _plot_curve(all_results, figure_path)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
