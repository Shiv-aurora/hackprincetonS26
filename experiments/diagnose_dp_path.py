#!/usr/bin/env python3
# Diagnose whether DP-bottleneck noise actually reaches decoded proxy text.
"""For 3 SAE documents × 2 ε values, compute the hidden state, clip + noise it, and
then decode via the proxy decoder. Report L2 distance, cosine similarity, noise-to-
signal ratio, character-level diff count, and token-level diff between proxies across
epsilons. No production code is modified.

Usage:
    GEMMA_MODEL_ID=HuggingFaceTB/SmolLM2-1.7B-Instruct \\
        python experiments/diagnose_dp_path.py
"""
from __future__ import annotations

import difflib
import re
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

EPSILONS = (0.5, 5.0)
DELTA = 1e-5
SENSITIVITY = 1.0
N_DOCS = 3
SEED = 42


# Fresh torch-friendly clone helpers; avoid shared-reference confusion in diagnostics.
def _clone(t):
    return t.detach().clone()


# Word token set for a text, lowercase [a-z0-9]+.
def _tokenize(s: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", s.lower()))


# Count raw character-level edits between two strings (Levenshtein-like via SequenceMatcher).
def _char_edit_count(a: str, b: str) -> int:
    # SequenceMatcher reports matching blocks; edit count = total_len - 2 * matching_chars.
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    matches = sum(block.size for block in sm.get_matching_blocks())
    return len(a) + len(b) - 2 * matches


# Pretty printer for a single (doc, ε) row.
def _fmt_row(
    doc_id: str,
    epsilon: float,
    sigma: float,
    l2_dist: float,
    cos_sim: float,
    nsr: float,
    proxy_snippet: str,
) -> str:
    return (
        f"  doc={doc_id}  ε={epsilon}  σ={sigma:.4f}  "
        f"||Δ||={l2_dist:.4f}  cos={cos_sim:.4f}  "
        f"||noise||/||clean||={nsr:.4f}\n"
        f"    proxy[0:200]: {proxy_snippet!r}"
    )


# Main: load model + docs, run clean vs noisy bottleneck, decode both, print diagnostics.
def main() -> int:
    import torch

    from data.synthetic_sae import generate_sae_narratives
    from ngsp.dp_mechanism import add_gaussian_noise, clip_to_norm, compute_sigma
    from ngsp.local_model import LocalModel
    from ngsp.proxy_decoder import decode_proxy
    from ngsp.safe_harbor import strip_safe_harbor

    print("[diag] loading local model …", flush=True)
    lm = LocalModel()

    docs = generate_sae_narratives(n=max(N_DOCS, 20), seed=SEED)[:N_DOCS]
    print(f"[diag] loaded {len(docs)} SAE documents", flush=True)

    # Cache per-doc clean-hidden and stripped state so we do not regenerate it per ε.
    per_doc: dict[str, dict] = {}
    for d in docs:
        print(f"[diag] preparing doc={d.doc_id} …", flush=True)
        strip = strip_safe_harbor(d.text, lm)
        _, hidden_clean = lm.generate_with_hidden_states(
            strip.stripped_text, layer=-1, max_tokens=64
        )
        clipped_clean = clip_to_norm(_clone(hidden_clean), SENSITIVITY)
        proxy_clean = decode_proxy(strip.stripped_text, clipped_clean, strip.spans, lm)
        per_doc[d.doc_id] = {
            "doc": d,
            "stripped": strip.stripped_text,
            "spans": strip.spans,
            "hidden_clean": hidden_clean,
            "clipped_clean": clipped_clean,
            "proxy_clean": proxy_clean,
        }

    # Run each ε against each doc using a fresh add_gaussian_noise seeded by (doc, eps)
    # so results are reproducible and distinct across epsilons.
    results: dict[str, dict[float, dict]] = {d.doc_id: {} for d in docs}
    for eps in EPSILONS:
        sigma = compute_sigma(eps, DELTA, SENSITIVITY)
        for d in docs:
            ref = per_doc[d.doc_id]
            torch.manual_seed(abs(hash((d.doc_id, eps))) % (2**31))
            noisy = add_gaussian_noise(_clone(ref["clipped_clean"]), sigma)
            delta_vec = noisy - ref["clipped_clean"]
            l2_dist = float(delta_vec.norm(p=2).item())
            clean_norm = float(ref["clipped_clean"].norm(p=2).item())
            noise_norm = float(delta_vec.norm(p=2).item())
            nsr = noise_norm / max(clean_norm, 1e-9)
            cos = float(
                torch.nn.functional.cosine_similarity(
                    noisy.unsqueeze(0), ref["clipped_clean"].unsqueeze(0)
                ).item()
            )
            proxy = decode_proxy(ref["stripped"], noisy, ref["spans"], lm)
            results[d.doc_id][eps] = {
                "sigma": sigma,
                "l2": l2_dist,
                "cos": cos,
                "nsr": nsr,
                "proxy": proxy,
            }

    # Per-doc report section.
    print("\n" + "=" * 80)
    print("PER-DOC DIAGNOSTICS")
    print("=" * 80)
    for doc_id, by_eps in results.items():
        clean_proxy = per_doc[doc_id]["proxy_clean"]
        print(f"\n--- {doc_id} ---")
        print(f"  ||clean hidden||_2 = {per_doc[doc_id]['clipped_clean'].norm(p=2).item():.4f}")
        print(f"  proxy_clean (no noise) [0:200]:")
        print(f"    {clean_proxy[:200]!r}")
        for eps in EPSILONS:
            r = by_eps[eps]
            print(_fmt_row(doc_id, eps, r["sigma"], r["l2"], r["cos"], r["nsr"], r["proxy"][:200]))

        proxy_a = by_eps[EPSILONS[0]]["proxy"]
        proxy_b = by_eps[EPSILONS[1]]["proxy"]
        char_diff = _char_edit_count(proxy_a, proxy_b)
        tok_a = _tokenize(proxy_a)
        tok_b = _tokenize(proxy_b)
        tok_symmetric_diff = (tok_a - tok_b) | (tok_b - tok_a)
        print(f"  proxy(ε={EPSILONS[0]}) vs proxy(ε={EPSILONS[1]}):")
        print(f"    char_edit_count          = {char_diff}")
        print(f"    token_symmetric_diff size= {len(tok_symmetric_diff)} / "
              f"union({len(tok_a | tok_b)})")
        print(f"    identical?               = {proxy_a == proxy_b}")
        if proxy_a != proxy_b:
            print(f"    sample_diff_tokens (up to 20): {sorted(tok_symmetric_diff)[:20]}")

    # Also compare clean-vs-ε=0.5 and clean-vs-ε=5.0 to show whether any noise changes decoding.
    print("\n" + "=" * 80)
    print("PROXY DIFF VS CLEAN (no-noise) BASELINE")
    print("=" * 80)
    for doc_id, by_eps in results.items():
        clean_proxy = per_doc[doc_id]["proxy_clean"]
        print(f"\n--- {doc_id} ---")
        for eps in EPSILONS:
            noisy_proxy = by_eps[eps]["proxy"]
            char_diff = _char_edit_count(clean_proxy, noisy_proxy)
            tok_a = _tokenize(clean_proxy)
            tok_b = _tokenize(noisy_proxy)
            sym = (tok_a - tok_b) | (tok_b - tok_a)
            print(f"  ε={eps}: char_edit={char_diff}  tok_sym_diff={len(sym)}  "
                  f"identical_to_clean={clean_proxy == noisy_proxy}")

    # Summary interpretation hint printed at the bottom for easy reading.
    print("\n" + "=" * 80)
    print("INTERPRETATION")
    print("=" * 80)
    print("If ||Δ||/||clean|| is large (≫1) at ε=0.5 but the proxy text is identical or")
    print("near-identical to the ε=5.0 proxy AND to the clean (no-noise) proxy, the")
    print("bottleneck noise is NOT propagating to the decoder output. That would confirm")
    print("the hypothesis that decode_proxy ignores the noisy vector under greedy decoding.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
