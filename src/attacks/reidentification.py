# Minimal re-identification attack: does a sensitive span survive the NGSP proxy?
"""Systematic measurement of what leaks from original → proxy for a given document.

For each document that passed through an abstract_extractable or dp_tolerant path we
already have:
  * the original document text and its ground-truth sensitive spans, and
  * the proxy text that was sent downstream.

The attack asks two simple questions per span, per target category:
  1) Does the exact original value string appear verbatim in the proxy?
  2) What is the Jaccard token overlap between the original span value and the proxy?

These are deliberately light-weight — no embeddings, no model calls — so the attack is
fast, deterministic, and auditable. It is a floor on leakage, not a ceiling: a
sophisticated adversary could recover content missed here via semantic techniques.

Audit invariant: this module MUST NOT record raw span values anywhere. Only lengths,
boolean flags, and similarity scores.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable

from data.schemas import SensitiveCategory, SensitiveSpan

# Target categories for re-identification measurement. These are the clinical-trial
# quasi-identifiers and MNPI markers that the proxy MUST strip to be useful.
TARGET_CATEGORIES: tuple[SensitiveCategory, ...] = (
    SensitiveCategory.COMPOUND_CODE,
    SensitiveCategory.SITE_ID,
    SensitiveCategory.EFFICACY_VALUE,
    SensitiveCategory.AMENDMENT_RATIONALE,
)


@dataclass(frozen=True)
class SpanAttackResult:
    # Per-span attack measurement; never records the raw value.
    category: str
    char_len: int
    verbatim_match: bool
    jaccard: float


@dataclass
class DocAttackResult:
    # Per-document attack measurement with summary metadata and per-span results.
    doc_id: str
    route: str
    spans_tested: list[SpanAttackResult] = field(default_factory=list)


# Normalize a text to a set of lowercase word tokens (letters/digits), used for Jaccard.
def _tokenize(s: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", s.lower()))


# Compute the Jaccard overlap |A ∩ B| / |A ∪ B| of two token sets, 0.0 when both empty.
def _jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 0.0
    union = a | b
    if not union:
        return 0.0
    return len(a & b) / len(union)


# Evaluate one document: for every span in a target category, record verbatim + Jaccard.
# `proxy_text` is what was (or would have been) sent to the remote API for this doc.
def run_attack(
    doc_id: str,
    route: str,
    proxy_text: str,
    spans: Iterable[SensitiveSpan],
    target_categories: Iterable[SensitiveCategory] = TARGET_CATEGORIES,
) -> DocAttackResult:
    target_set = set(target_categories)
    proxy_lc = proxy_text.lower()
    proxy_tokens = _tokenize(proxy_text)

    tested: list[SpanAttackResult] = []
    for sp in spans:
        if sp.category not in target_set:
            continue
        value = sp.value
        verbatim = value.lower() in proxy_lc
        span_tokens = _tokenize(value)
        jac = _jaccard(span_tokens, proxy_tokens)
        tested.append(
            SpanAttackResult(
                category=sp.category.value,
                char_len=len(value),
                verbatim_match=verbatim,
                jaccard=round(jac, 4),
            )
        )
    return DocAttackResult(doc_id=doc_id, route=route, spans_tested=tested)


# Aggregate per-category leakage rate and mean Jaccard across many DocAttackResults.
def summarize(results: list[DocAttackResult]) -> dict[str, dict[str, float | int]]:
    summary: dict[str, dict[str, float | int]] = {}
    for doc in results:
        for sp in doc.spans_tested:
            bucket = summary.setdefault(
                sp.category,
                {"n": 0, "verbatim_hits": 0, "jaccard_sum": 0.0},
            )
            bucket["n"] = int(bucket["n"]) + 1
            bucket["verbatim_hits"] = int(bucket["verbatim_hits"]) + (1 if sp.verbatim_match else 0)
            bucket["jaccard_sum"] = float(bucket["jaccard_sum"]) + sp.jaccard

    out: dict[str, dict[str, float | int]] = {}
    for cat, b in summary.items():
        n = int(b["n"])
        hits = int(b["verbatim_hits"])
        jac_sum = float(b["jaccard_sum"])
        out[cat] = {
            "n_spans": n,
            "verbatim_hits": hits,
            "verbatim_leak_rate": round(hits / n, 4) if n else 0.0,
            "mean_jaccard": round(jac_sum / n, 4) if n else 0.0,
        }
    return out
