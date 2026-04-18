#!/usr/bin/env python3
# Generate all paper figures from JSON result files in experiments/results/.
"""Generate figures for the NGSP paper.

Usage:
    python paper/figures/generate_figures.py

Reads:
    experiments/results/calibration.json
    experiments/results/attacks_eps3.0.json
    experiments/results/ablations.json

Writes:
    paper/figures/epsilon_utility_curve.png
    paper/figures/epsilon_utility_curve.svg
    paper/figures/attack_summary_bar.png
    paper/figures/attack_summary_bar.svg
    paper/figures/ablation_table.png
    paper/figures/ablation_table.svg
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

RESULTS = Path("experiments/results")
FIGURES = Path("paper/figures")
FIGURES.mkdir(parents=True, exist_ok=True)


# Load a JSON results file; return None with a warning if the file does not exist.
def _load(path: Path) -> dict | None:
    if not path.exists():
        print(f"  [figures] WARNING: {path} not found — skipping figure", file=sys.stderr)
        return None
    return json.loads(path.read_text())


# Plot the privacy-utility curve: inversion F1 and utility ratio vs. epsilon.
def plot_epsilon_utility_curve(calibration: dict) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np

    epsilons = [c["epsilon"] for c in calibration["configs"]]
    f1_values = [c.get("inversion_f1", float("nan")) for c in calibration["configs"]]
    utility_values = [c.get("utility_ratio", float("nan")) for c in calibration["configs"]]
    sigma_values = [c.get("sigma", float("nan")) for c in calibration["configs"]]

    fig, ax1 = plt.subplots(figsize=(7, 4))
    ax2 = ax1.twinx()

    color_f1 = "#c0392b"
    color_u = "#2980b9"

    ax1.plot(epsilons, f1_values, "o-", color=color_f1, label="Inversion F1 (Attack 3)", linewidth=2)
    ax1.axhline(0.09, color=color_f1, linestyle="--", linewidth=1, alpha=0.6, label="F1 threshold (0.09)")
    ax1.set_xlabel("Privacy budget ε", fontsize=12)
    ax1.set_ylabel("Inversion F1", color=color_f1, fontsize=12)
    ax1.tick_params(axis="y", labelcolor=color_f1)
    ax1.set_ylim(0, 0.30)

    ax2.plot(epsilons, utility_values, "s--", color=color_u, label="Utility ratio (Attack 5)", linewidth=2)
    ax2.axhline(0.85, color=color_u, linestyle="--", linewidth=1, alpha=0.6, label="Utility threshold (0.85)")
    ax2.set_ylabel("Utility ratio", color=color_u, fontsize=12)
    ax2.tick_params(axis="y", labelcolor=color_u)
    ax2.set_ylim(0, 1.1)

    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, loc="center right", fontsize=9)

    ax1.set_title("NGSP Privacy-Utility Tradeoff by ε", fontsize=13)
    fig.tight_layout()
    for ext in ("png", "svg"):
        out = FIGURES / f"epsilon_utility_curve.{ext}"
        fig.savefig(out, dpi=150)
        print(f"  [figures] wrote {out}")
    plt.close(fig)


# Plot a grouped bar chart of attack metrics at ε = 3.0.
def plot_attack_summary_bar(attacks: dict) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    labels = ["Verbatim\nliteral", "Verbatim\nfuzzy", "Similarity\nmean", "Inversion\nF1", "Membership\nAUC"]
    values = [
        attacks.get("verbatim", {}).get("overall_literal_leak_rate", float("nan")),
        attacks.get("verbatim", {}).get("overall_fuzzy_leak_rate", float("nan")),
        attacks.get("similarity", {}).get("mean_sim", float("nan")),
        attacks.get("inversion", {}).get("overall_f1", float("nan")),
        attacks.get("membership", {}).get("mean_auc", float("nan")),
    ]
    thresholds = [0.01, 0.05, 0.85, 0.09, 0.55]
    colors = ["#e74c3c" if (v > t) else "#27ae60" for v, t in zip(values, thresholds)]

    fig, ax = plt.subplots(figsize=(8, 4))
    bars = ax.bar(labels, values, color=colors, edgecolor="white", linewidth=0.5)
    ax.step(
        range(-1, len(labels) + 1),
        [float("nan")] + thresholds + [float("nan")],
        where="mid",
        color="black",
        linestyle="--",
        linewidth=1,
        label="Threshold",
    )
    for bar, val in zip(bars, values):
        if val == val:  # not nan
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.01, f"{val:.3f}",
                    ha="center", va="bottom", fontsize=9)
    ax.set_ylim(0, 1.1)
    ax.set_ylabel("Metric value", fontsize=11)
    ax.set_title(f"Attack Metrics at ε = {attacks.get('epsilon', 3.0)}", fontsize=13)
    ax.legend(fontsize=9)
    fig.tight_layout()
    for ext in ("png", "svg"):
        out = FIGURES / f"attack_summary_bar.{ext}"
        fig.savefig(out, dpi=150)
        print(f"  [figures] wrote {out}")
    plt.close(fig)


# Plot the ablation table as a grouped bar chart.
def plot_ablation_table(ablations: dict) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np

    configs = ablations.get("configs", [])
    if not configs:
        print("  [figures] no ablation configs — skipping", file=sys.stderr)
        return

    names = [c["config"].replace("_", "\n") for c in configs]
    verbatim = [c.get("verbatim_literal_leak_rate", float("nan")) for c in configs]
    inversion = [c.get("inversion_f1", float("nan")) for c in configs]

    x = np.arange(len(names))
    width = 0.35

    fig, ax = plt.subplots(figsize=(9, 4))
    ax.bar(x - width / 2, verbatim, width, label="Verbatim literal leak", color="#e67e22", edgecolor="white")
    ax.bar(x + width / 2, inversion, width, label="Inversion F1", color="#8e44ad", edgecolor="white")
    ax.axhline(0.09, color="#8e44ad", linestyle="--", linewidth=1, alpha=0.7, label="F1 threshold (0.09)")
    ax.axhline(0.01, color="#e67e22", linestyle="--", linewidth=1, alpha=0.7, label="Leak threshold (0.01)")

    ax.set_xticks(x)
    ax.set_xticklabels(names, fontsize=9)
    ax.set_ylim(0, 0.35)
    ax.set_ylabel("Metric value", fontsize=11)
    ax.set_title("Ablation: Component Contributions to Privacy", fontsize=13)
    ax.legend(fontsize=9)
    fig.tight_layout()
    for ext in ("png", "svg"):
        out = FIGURES / f"ablation_table.{ext}"
        fig.savefig(out, dpi=150)
        print(f"  [figures] wrote {out}")
    plt.close(fig)


# Entry point: load result files and generate all figures.
def main() -> int:
    print("[figures] generating paper figures …")
    calibration = _load(RESULTS / "calibration.json")
    attacks = _load(RESULTS / "attacks_eps3.0.json")
    ablations = _load(RESULTS / "ablations.json")

    if calibration:
        plot_epsilon_utility_curve(calibration)
    if attacks:
        plot_attack_summary_bar(attacks)
    if ablations:
        plot_ablation_table(ablations)

    print("[figures] done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
