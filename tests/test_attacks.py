# Smoke tests for Phase 3 attack modules — all tests run offline, no model loads.
from __future__ import annotations

import pytest

from data.schemas import SensitiveCategory, SensitiveSpan


# Helper: build a minimal SensitiveSpan at the given substring.
def _span(text: str, value: str, category: SensitiveCategory) -> SensitiveSpan:
    idx = text.index(value)
    return SensitiveSpan(start=idx, end=idx + len(value), category=category, value=value)


# ──────────────────────────────────────────────────────────────────────────────
# Attack 1 — verbatim
# ──────────────────────────────────────────────────────────────────────────────

class TestVerbatim:
    # A proxy that contains the original sensitive value must register a literal hit.
    def test_literal_leak_detected(self) -> None:
        from attacks.verbatim import run_verbatim

        proxy = "Patient John Smith was admitted."
        span = _span("Patient John Smith was admitted.", "John Smith", SensitiveCategory.NAME)
        result = run_verbatim([(proxy, [span])])
        assert result.overall_literal_leak_rate == 1.0

    # A proxy that does NOT contain the value must not register a literal hit.
    def test_no_literal_leak(self) -> None:
        from attacks.verbatim import run_verbatim

        proxy = "The patient was admitted."
        span = SensitiveSpan(start=0, end=10, category=SensitiveCategory.NAME, value="John Smith")
        result = run_verbatim([(proxy, [span])])
        assert result.overall_literal_leak_rate == 0.0

    # Empty pairs must return zero rates without raising.
    def test_empty_pairs(self) -> None:
        from attacks.verbatim import run_verbatim

        result = run_verbatim([])
        assert result.overall_literal_leak_rate == 0.0
        assert result.n_spans_evaluated == 0

    # Per-category breakdown must have an entry for each category found.
    def test_per_category_populated(self) -> None:
        from attacks.verbatim import run_verbatim

        proxy = "SSN 123-45-6789 and John Smith."
        spans = [
            _span(proxy, "123-45-6789", SensitiveCategory.SSN),
            _span(proxy, "John Smith", SensitiveCategory.NAME),
        ]
        result = run_verbatim([(proxy, spans)])
        assert "ssn" in result.per_category_literal
        assert "name" in result.per_category_literal


# ──────────────────────────────────────────────────────────────────────────────
# Attack 2 — similarity
# ──────────────────────────────────────────────────────────────────────────────

class TestSimilarity:
    # Identical texts must produce a similarity score very close to 1.0.
    def test_identical_texts_high_similarity(self) -> None:
        from attacks.similarity import run_similarity

        pairs = [("The patient recovered quickly.", "The patient recovered quickly.")]
        result = run_similarity(pairs)
        assert result.mean_sim >= 0.95

    # Completely unrelated texts must produce a lower score than identical texts.
    def test_dissimilar_texts_lower_score(self) -> None:
        from attacks.similarity import run_similarity

        pairs = [("Clinical trial patient demographics.", "The weather is sunny today.")]
        result = run_similarity(pairs)
        assert result.mean_sim < 0.9

    # Empty pairs must not raise and must return a zero result.
    def test_empty_pairs(self) -> None:
        from attacks.similarity import run_similarity

        result = run_similarity([])
        assert result.mean_sim == 0.0

    # per_pair_scores must have the same length as the input pairs.
    def test_score_count_matches_pairs(self) -> None:
        from attacks.similarity import run_similarity

        pairs = [("text one", "text one different"), ("text two", "different text")]
        result = run_similarity(pairs)
        assert len(result.per_pair_scores) == 2


# ──────────────────────────────────────────────────────────────────────────────
# Attack 3 — inversion
# ──────────────────────────────────────────────────────────────────────────────

class TestInversion:
    # With fewer than 5 pairs the function must return zeros without training.
    def test_too_few_pairs_returns_zero(self) -> None:
        from attacks.inversion import run_inversion

        result = run_inversion([], seed=42)
        assert result.overall_f1 == 0.0

    # _label_tokens must produce a 1 for a token that overlaps a sensitive span.
    def test_label_tokens_hit(self) -> None:
        from attacks.inversion import _label_tokens

        span = SensitiveSpan(start=4, end=14, category=SensitiveCategory.NAME, value="John Smith")
        # Token covering chars 4–14 (the name).
        labels = _label_tokens([(4, 14)], [span])
        assert labels == [1]

    # _label_tokens must produce a 0 for a token that does not overlap any span.
    def test_label_tokens_miss(self) -> None:
        from attacks.inversion import _label_tokens

        span = SensitiveSpan(start=4, end=14, category=SensitiveCategory.NAME, value="John Smith")
        labels = _label_tokens([(0, 4)], [span])
        assert labels == [0]

    # _token_f1 must return 1.0 when predictions exactly match labels.
    def test_token_f1_perfect(self) -> None:
        from attacks.inversion import _token_f1

        assert _token_f1([1, 0, 1], [1, 0, 1]) == 1.0

    # _token_f1 must return 0.0 when all predictions are wrong.
    def test_token_f1_zero(self) -> None:
        from attacks.inversion import _token_f1

        assert _token_f1([0, 0, 0], [1, 1, 1]) == 0.0


# ──────────────────────────────────────────────────────────────────────────────
# Attack 4 — membership
# ──────────────────────────────────────────────────────────────────────────────

class TestMembership:
    # Empty pairs must return mean_auc=0.5 without raising.
    def test_empty_pairs(self) -> None:
        from attacks.membership import run_membership

        result = run_membership([])
        assert result.mean_auc == 0.5
        assert result.n_entities_evaluated == 0

    # _top_entities must return at most k compound-code values.
    def test_top_entities_limit(self) -> None:
        from attacks.membership import _top_entities

        spans_a = [SensitiveSpan(start=0, end=8, category=SensitiveCategory.COMPOUND_CODE, value="SYN-1234")]
        spans_b = [SensitiveSpan(start=0, end=8, category=SensitiveCategory.COMPOUND_CODE, value="SYN-5678")]
        pairs = [("proxy a", spans_a)] * 5 + [("proxy b", spans_b)] * 3
        top = _top_entities(pairs, k=1)
        assert len(top) == 1
        assert top[0] == "SYN-1234"


# ──────────────────────────────────────────────────────────────────────────────
# Attack 5 — utility
# ──────────────────────────────────────────────────────────────────────────────

class TestUtility:
    # _evaluate_utility must clamp the score to [0, 1] even with borderline responses.
    def test_evaluate_utility_clamp(self) -> None:
        from unittest.mock import MagicMock
        from attacks.utility import _evaluate_utility

        rc = MagicMock()
        rc.complete.return_value = "  1.2  "  # over 1.0 — must clamp to 1.0
        score = _evaluate_utility("orig", "proxy", rc)
        assert score == 1.0

    # _evaluate_utility must return 0.5 on any exception from the remote client.
    def test_evaluate_utility_exception_fallback(self) -> None:
        from unittest.mock import MagicMock
        from attacks.utility import _evaluate_utility

        rc = MagicMock()
        rc.complete.side_effect = RuntimeError("network error")
        score = _evaluate_utility("orig", "proxy", rc)
        assert score == 0.5
