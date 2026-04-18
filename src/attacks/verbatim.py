# Attack 1: literal and fuzzy substring scan for sensitive-span leakage in proxy texts.
from __future__ import annotations

from dataclasses import dataclass, field

from rapidfuzz import fuzz

from data.schemas import SensitiveSpan


@dataclass
class VerbatimResult:
    # Verbatim attack outcome: per-category and overall literal/fuzzy leak rates.
    overall_literal_leak_rate: float
    overall_fuzzy_leak_rate: float
    # Per-category count of literal leaks and total spans evaluated.
    per_category_literal: dict[str, float] = field(default_factory=dict)
    per_category_fuzzy: dict[str, float] = field(default_factory=dict)
    n_spans_evaluated: int = 0
    fuzzy_threshold: int = 85


# Check whether `span_value` appears literally anywhere in `proxy_text`.
def _literal_hit(span_value: str, proxy_text: str) -> bool:
    return span_value.lower() in proxy_text.lower()


# Check whether `span_value` fuzzy-matches anywhere in `proxy_text` at or above threshold.
def _fuzzy_hit(span_value: str, proxy_text: str, threshold: int) -> bool:
    return fuzz.partial_ratio(span_value.lower(), proxy_text.lower()) >= threshold


# Run the verbatim attack over a list of (proxy_text, ground_truth_spans) pairs.
def run_verbatim(
    pairs: list[tuple[str, list[SensitiveSpan]]],
    threshold: int = 85,
) -> VerbatimResult:
    literal_hits: dict[str, int] = {}
    fuzzy_hits: dict[str, int] = {}
    cat_counts: dict[str, int] = {}
    total_literal = 0
    total_fuzzy = 0
    n_total = 0

    for proxy_text, spans in pairs:
        for span in spans:
            cat = span.category.value
            cat_counts[cat] = cat_counts.get(cat, 0) + 1
            lit = _literal_hit(span.value, proxy_text)
            fuz = _fuzzy_hit(span.value, proxy_text, threshold)
            literal_hits[cat] = literal_hits.get(cat, 0) + int(lit)
            fuzzy_hits[cat] = fuzzy_hits.get(cat, 0) + int(fuz)
            total_literal += int(lit)
            total_fuzzy += int(fuz)
            n_total += 1

    per_cat_lit = {
        cat: literal_hits.get(cat, 0) / max(cnt, 1)
        for cat, cnt in cat_counts.items()
    }
    per_cat_fuz = {
        cat: fuzzy_hits.get(cat, 0) / max(cnt, 1)
        for cat, cnt in cat_counts.items()
    }
    return VerbatimResult(
        overall_literal_leak_rate=total_literal / max(n_total, 1),
        overall_fuzzy_leak_rate=total_fuzzy / max(n_total, 1),
        per_category_literal=per_cat_lit,
        per_category_fuzzy=per_cat_fuz,
        n_spans_evaluated=n_total,
        fuzzy_threshold=threshold,
    )
