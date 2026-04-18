# Ground-truth sensitive-span oracle used by the attack suite to score inversion success.
from __future__ import annotations

from collections import defaultdict
from typing import Iterable

from .schemas import SensitiveCategory, SensitiveSpan, _DocumentBase


# Return the ground-truth SensitiveSpan list attached to a synthesized document.
def annotate(doc: _DocumentBase) -> list[SensitiveSpan]:
    return list(doc.spans)


# Verify every span's offsets resolve back to the declared value within the document text.
def validate_spans(text: str, spans: Iterable[SensitiveSpan]) -> None:
    for s in spans:
        got = text[s.start : s.end]
        if got != s.value:
            raise ValueError(
                f"Annotator mismatch: text[{s.start}:{s.end}]={got!r} != value={s.value!r}"
            )


# Group spans by their SensitiveCategory for per-category leak-rate reporting.
def spans_by_category(
    spans: Iterable[SensitiveSpan],
) -> dict[SensitiveCategory, list[SensitiveSpan]]:
    buckets: dict[SensitiveCategory, list[SensitiveSpan]] = defaultdict(list)
    for s in spans:
        buckets[s.category].append(s)
    return dict(buckets)


# Return the set of unique (category, value) pairs across a span list for dedup / matching.
def unique_values(spans: Iterable[SensitiveSpan]) -> set[tuple[SensitiveCategory, str]]:
    return {(s.category, s.value) for s in spans}


# Locate the first occurrence of a value in modified text and return it as a span (or None).
def find_span_value(
    text: str, value: str, category: SensitiveCategory
) -> SensitiveSpan | None:
    if not value:
        return None
    idx = text.find(value)
    if idx < 0:
        return None
    return SensitiveSpan(start=idx, end=idx + len(value), category=category, value=value)
