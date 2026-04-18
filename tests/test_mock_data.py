# Smoke tests for the mock-data corpus: types, span offset integrity, canary injection.
from __future__ import annotations

import pytest

from data.annotator import (
    annotate,
    find_span_value,
    spans_by_category,
    unique_values,
    validate_spans,
)
from data.canary import (
    CANARY_REGEX,
    contains_canary,
    extract_canaries,
    inject_canary_doc,
    inject_canary_text,
    mint_canary,
)
from data.schemas import (
    CSRDraft,
    MonitoringReport,
    ProtocolExcerpt,
    SAENarrative,
    SensitiveCategory,
    SensitiveSpan,
)
from data.synthetic_monitoring import generate_monitoring_reports
from data.synthetic_protocol import generate_protocol_excerpts
from data.synthetic_sae import generate_sae_narratives
from data.synthetic_writing import generate_csr_drafts


# Confirm default-count generators produce the spec-mandated number of records.
def test_default_counts() -> None:
    assert len(generate_sae_narratives()) == 500
    assert len(generate_protocol_excerpts()) == 200
    assert len(generate_monitoring_reports()) == 200
    assert len(generate_csr_drafts()) == 300


# For every document of every kind, every span must map back to its declared value.
@pytest.mark.parametrize(
    "generator, klass, small_n",
    [
        (generate_sae_narratives, SAENarrative, 25),
        (generate_protocol_excerpts, ProtocolExcerpt, 25),
        (generate_monitoring_reports, MonitoringReport, 25),
        (generate_csr_drafts, CSRDraft, 25),
    ],
)
def test_every_span_is_correctly_offset(generator, klass, small_n) -> None:
    docs = generator(n=small_n)
    assert len(docs) == small_n
    for doc in docs:
        assert isinstance(doc, klass)
        assert len(doc.text) > 0
        assert len(doc.spans) >= 1
        for s in doc.spans:
            assert isinstance(s, SensitiveSpan)
            assert doc.text[s.start : s.end] == s.value


# Deterministic seeding: same seed must yield byte-identical text across runs.
def test_deterministic_seed_reproduces_text() -> None:
    a = generate_sae_narratives(n=10, seed=123)
    b = generate_sae_narratives(n=10, seed=123)
    assert [d.text for d in a] == [d.text for d in b]
    assert [d.doc_id for d in a] == [d.doc_id for d in b]


# Different seeds must yield different corpora (sanity check on RNG plumbing).
def test_different_seed_yields_different_text() -> None:
    a = generate_sae_narratives(n=10, seed=1)
    b = generate_sae_narratives(n=10, seed=2)
    assert [d.text for d in a] != [d.text for d in b]


# Annotator returns exactly the document's own spans (the oracle contract).
def test_annotator_roundtrip() -> None:
    docs = generate_protocol_excerpts(n=5)
    for doc in docs:
        spans = annotate(doc)
        assert spans == list(doc.spans)
        validate_spans(doc.text, spans)


# Annotator can locate a known value in the raw text via find_span_value.
def test_find_span_value_locates_entity() -> None:
    docs = generate_sae_narratives(n=3)
    doc = docs[0]
    first = doc.spans[0]
    found = find_span_value(doc.text, first.value, first.category)
    assert found is not None
    assert doc.text[found.start : found.end] == first.value


# spans_by_category produces a per-category bucket dictionary.
def test_spans_by_category_groups() -> None:
    docs = generate_csr_drafts(n=5)
    all_spans = [s for d in docs for s in d.spans]
    buckets = spans_by_category(all_spans)
    assert all(isinstance(k, SensitiveCategory) for k in buckets.keys())
    assert sum(len(v) for v in buckets.values()) == len(all_spans)


# Every generator must use categories drawn from the SensitiveCategory enum only.
def test_categories_are_enum_members() -> None:
    docs = (
        generate_sae_narratives(n=5)
        + generate_protocol_excerpts(n=5)
        + generate_monitoring_reports(n=5)
        + generate_csr_drafts(n=5)
    )
    valid = set(SensitiveCategory)
    for d in docs:
        for s in d.spans:
            assert s.category in valid


# Canary minting produces unique tokens that match the detection regex.
def test_canary_mint_and_regex() -> None:
    canaries = {mint_canary() for _ in range(20)}
    assert len(canaries) == 20
    for c in canaries:
        assert CANARY_REGEX.fullmatch(c) is not None


# Injecting a canary into a document yields modified text containing that canary.
def test_inject_canary_doc_appends_token() -> None:
    docs = generate_monitoring_reports(n=1)
    new_doc, canary = inject_canary_doc(docs[0])
    assert contains_canary(new_doc.text)
    assert canary in new_doc.text
    assert canary not in docs[0].text  # original untouched
    assert new_doc.doc_id == docs[0].doc_id  # metadata preserved


# Raw-text canary injection round-trips through extract_canaries.
def test_inject_canary_text_extractable() -> None:
    injection = inject_canary_text("some unrelated text")
    found = extract_canaries(injection.text)
    assert injection.canary in found


# Every document emits at least one span per core HIPAA / quasi category on average.
def test_corpus_has_diverse_categories() -> None:
    docs = (
        generate_sae_narratives(n=20)
        + generate_protocol_excerpts(n=20)
        + generate_monitoring_reports(n=20)
        + generate_csr_drafts(n=20)
    )
    all_values = set()
    all_categories = set()
    for d in docs:
        for s in d.spans:
            all_values.add((s.category, s.value))
            all_categories.add(s.category)
    # At minimum we want to see HIPAA NAME and DATE, plus quasi COMPOUND_CODE and INDICATION.
    assert SensitiveCategory.NAME in all_categories
    assert SensitiveCategory.DATE in all_categories
    assert SensitiveCategory.COMPOUND_CODE in all_categories
    assert SensitiveCategory.INDICATION in all_categories
    # Unique-values helper must return a set of (category, value) tuples.
    u = unique_values([s for d in docs for s in d.spans])
    assert u == all_values


# SensitiveSpan must reject zero-width and inverted spans.
def test_sensitive_span_rejects_empty() -> None:
    with pytest.raises(Exception):
        SensitiveSpan(start=5, end=5, category=SensitiveCategory.NAME, value="x")
    with pytest.raises(Exception):
        SensitiveSpan(start=5, end=3, category=SensitiveCategory.NAME, value="x")
