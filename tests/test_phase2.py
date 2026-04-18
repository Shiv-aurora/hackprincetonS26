# Smoke and unit tests for Phase 2 ngsp-core modules.
from __future__ import annotations

import json
import math
from unittest.mock import MagicMock

import pytest
import torch


# ──────────────────────────────────────────────────────────────────────────────
# dp_mechanism
# ──────────────────────────────────────────────────────────────────────────────

class TestDpMechanism:
    # clip_to_norm must reduce vectors above C to exactly norm C.
    def test_clip_to_norm_above_bound(self) -> None:
        from ngsp.dp_mechanism import clip_to_norm

        x = torch.tensor([3.0, 4.0])  # norm = 5.0
        clipped = clip_to_norm(x, C=1.0)
        assert abs(clipped.norm(p=2).item() - 1.0) < 1e-6

    # clip_to_norm must leave vectors at or below C unchanged.
    def test_clip_to_norm_within_bound(self) -> None:
        from ngsp.dp_mechanism import clip_to_norm

        x = torch.tensor([0.3, 0.4])  # norm = 0.5
        clipped = clip_to_norm(x, C=1.0)
        assert torch.allclose(x, clipped)

    # Gaussian noise must produce different output than the original vector.
    def test_add_gaussian_noise_changes_values(self) -> None:
        from ngsp.dp_mechanism import add_gaussian_noise

        x = torch.zeros(64)
        noisy = add_gaussian_noise(x, sigma=1.0, seed=42)
        assert not torch.allclose(x, noisy)

    # Seeded noise generation must be deterministic.
    def test_add_gaussian_noise_seeded_deterministic(self) -> None:
        from ngsp.dp_mechanism import add_gaussian_noise

        x = torch.zeros(32)
        a = add_gaussian_noise(x, sigma=0.5, seed=123)
        b = add_gaussian_noise(x, sigma=0.5, seed=123)
        assert torch.allclose(a, b)

    # compute_sigma with canonical (ε=1, δ=1e-5, Δ=1) must match the closed-form value.
    def test_compute_sigma_canonical(self) -> None:
        from ngsp.dp_mechanism import compute_sigma

        sigma = compute_sigma(epsilon=1.0, delta=1e-5, sensitivity=1.0)
        expected = math.sqrt(2 * math.log(1.25 / 1e-5)) / 1.0
        assert abs(sigma - expected) < 1e-9

    # Invalid (ε ≤ 0) must raise ValueError.
    def test_compute_sigma_invalid_epsilon(self) -> None:
        from ngsp.dp_mechanism import compute_sigma

        with pytest.raises(ValueError):
            compute_sigma(epsilon=0.0, delta=1e-5)

    # RDPAccountant must accumulate ε monotonically over multiple steps.
    def test_accountant_monotone_accumulation(self) -> None:
        from ngsp.dp_mechanism import RDPAccountant

        acct = RDPAccountant()
        eps0 = acct.get_epsilon(1e-5)
        acct.step(sigma=1.0)
        eps1 = acct.get_epsilon(1e-5)
        acct.step(sigma=1.0)
        eps2 = acct.get_epsilon(1e-5)
        assert eps0 <= eps1 <= eps2

    # reset() must bring the accountant back to zero.
    def test_accountant_reset(self) -> None:
        from ngsp.dp_mechanism import RDPAccountant

        acct = RDPAccountant()
        acct.step(sigma=0.5)
        acct.reset()
        assert acct.get_epsilon(1e-5) == 0.0


# ──────────────────────────────────────────────────────────────────────────────
# safe_harbor
# ──────────────────────────────────────────────────────────────────────────────

class TestSafeHarbor:
    # SSN regex must detect a canonical SSN in text.
    def test_extract_ssn(self) -> None:
        from ngsp.safe_harbor import extract_regex_spans
        from data.schemas import SensitiveCategory

        spans = extract_regex_spans("Patient SSN is 123-45-6789.")
        cats = [sp.category for sp in spans]
        assert SensitiveCategory.SSN in cats

    # Email regex must detect a valid email address.
    def test_extract_email(self) -> None:
        from ngsp.safe_harbor import extract_regex_spans
        from data.schemas import SensitiveCategory

        spans = extract_regex_spans("Contact dr.test@hospital.org for info.")
        cats = [sp.category for sp in spans]
        assert SensitiveCategory.EMAIL in cats

    # Phone regex must detect a 10-digit US phone number.
    def test_extract_phone(self) -> None:
        from ngsp.safe_harbor import extract_regex_spans
        from data.schemas import SensitiveCategory

        spans = extract_regex_spans("Call 555-867-5309 for scheduling.")
        cats = [sp.category for sp in spans]
        assert SensitiveCategory.PHONE in cats

    # IP regex must detect a valid IPv4 address.
    def test_extract_ip(self) -> None:
        from ngsp.safe_harbor import extract_regex_spans
        from data.schemas import SensitiveCategory

        spans = extract_regex_spans("Server IP: 192.168.1.10")
        cats = [sp.category for sp in spans]
        assert SensitiveCategory.IP in cats

    # URL regex must detect an https URL.
    def test_extract_url(self) -> None:
        from ngsp.safe_harbor import extract_regex_spans
        from data.schemas import SensitiveCategory

        spans = extract_regex_spans("See https://clinic.example.com/data for details.")
        cats = [sp.category for sp in spans]
        assert SensitiveCategory.URL in cats

    # strip_safe_harbor must replace detected spans with placeholders and build entity_map.
    def test_strip_builds_entity_map(self) -> None:
        from ngsp.safe_harbor import strip_safe_harbor

        text = "Email dr.smith@research.org or call 555-123-4567."
        result = strip_safe_harbor(text, local_model=None)
        # Stripped text must not contain the original email or phone.
        assert "dr.smith@research.org" not in result.stripped_text
        assert "555-123-4567" not in result.stripped_text
        # entity_map must contain the original values.
        values = set(result.entity_map.values())
        assert "dr.smith@research.org" in values or any("dr.smith" in v for v in values)

    # Placeholders in stripped text must be keys in entity_map.
    def test_strip_placeholder_in_entity_map(self) -> None:
        from ngsp.safe_harbor import strip_safe_harbor

        result = strip_safe_harbor("SSN: 123-45-6789", local_model=None)
        for placeholder in result.entity_map:
            assert placeholder.startswith("<") and placeholder.endswith(">")
            assert placeholder in result.stripped_text


# ──────────────────────────────────────────────────────────────────────────────
# router
# ──────────────────────────────────────────────────────────────────────────────

class TestRouter:
    # _parse_routing_response must handle valid JSON for all three paths.
    def test_parse_all_three_paths(self) -> None:
        from ngsp.router import _parse_routing_response

        for path in ("abstract_extractable", "dp_tolerant", "local_only"):
            raw = json.dumps({"path": path, "rationale": "test"})
            decision = _parse_routing_response(raw)
            assert decision.path == path

    # _parse_routing_response must fall back gracefully on bad JSON.
    def test_parse_fallback_on_bad_json(self) -> None:
        from ngsp.router import _parse_routing_response

        decision = _parse_routing_response("not json at all")
        assert decision.path == "dp_tolerant"

    # route() with a mock model must return a valid RouteDecision.
    def test_route_with_mock_model(self) -> None:
        from ngsp.router import route

        mock_model = MagicMock()
        mock_model.generate.return_value = json.dumps(
            {"path": "abstract_extractable", "rationale": "task is separable"}
        )
        decision = route("Rewrite this sentence.", spans=[], local_model=mock_model)
        assert decision.path == "abstract_extractable"


# ──────────────────────────────────────────────────────────────────────────────
# query_synthesizer
# ──────────────────────────────────────────────────────────────────────────────

class TestQuerySynthesizer:
    # synthesize_query must return the model's output stripped of whitespace.
    def test_synthesize_returns_model_output(self) -> None:
        from ngsp.query_synthesizer import synthesize_query

        mock_model = MagicMock()
        mock_model.generate.return_value = "  How do I summarize a clinical event?  "
        result = synthesize_query("...", spans=[], local_model=mock_model)
        assert result == "How do I summarize a clinical event?"

    # synthesize_query must degrade to the stripped input if the model raises.
    def test_synthesize_degrades_on_model_error(self) -> None:
        from ngsp.query_synthesizer import synthesize_query

        mock_model = MagicMock()
        mock_model.generate.side_effect = RuntimeError("model offline")
        result = synthesize_query("fallback text", spans=[], local_model=mock_model)
        assert result == "fallback text"


# ──────────────────────────────────────────────────────────────────────────────
# answer_applier
# ──────────────────────────────────────────────────────────────────────────────

class TestAnswerApplier:
    # apply_entity_map must restore all placeholders to their original values.
    def test_apply_entity_map_basic(self) -> None:
        from ngsp.answer_applier import apply_entity_map

        entity_map = {"<PERSON_1>": "Dr. Alice", "<DATE_1>": "2024-03-15"}
        response = "According to <PERSON_1>, the event occurred on <DATE_1>."
        result = apply_entity_map(response, entity_map)
        assert "Dr. Alice" in result
        assert "2024-03-15" in result
        assert "<PERSON_1>" not in result
        assert "<DATE_1>" not in result

    # apply_entity_map must handle longest-key-first to avoid partial-match collisions.
    def test_apply_entity_map_no_partial_collision(self) -> None:
        from ngsp.answer_applier import apply_entity_map

        entity_map = {"<DATE_1>": "Jan 1", "<DATE_10>": "Dec 31"}
        response = "<DATE_1> and <DATE_10> are important."
        result = apply_entity_map(response, entity_map)
        assert "Jan 1" in result
        assert "Dec 31" in result

    # apply_entity_map must be a no-op on text with no placeholders.
    def test_apply_entity_map_noop_without_placeholders(self) -> None:
        from ngsp.answer_applier import apply_entity_map

        text = "No placeholders here."
        assert apply_entity_map(text, {}) == text


# ──────────────────────────────────────────────────────────────────────────────
# pipeline (offline mock)
# ──────────────────────────────────────────────────────────────────────────────

class TestPipeline:
    # Pipeline.run (abstract_extractable path) must return a PipelineOutput with patched sub-modules.
    def test_run_abstract_extractable_path(self) -> None:
        from unittest.mock import MagicMock, patch
        from ngsp.pipeline import Pipeline, SessionBudget, PipelineOutput
        from ngsp.safe_harbor import StripResult
        from ngsp.router import RouteDecision

        strip_result = StripResult(
            stripped_text="Tell me about the dose.",
            entity_map={},
            spans=[],
        )
        decision = RouteDecision(path="abstract_extractable", rationale="separable")

        local_model = MagicMock()
        remote = MagicMock()
        remote.complete.return_value = "The answer is 42."

        with (
            patch("ngsp.pipeline.strip_safe_harbor", return_value=strip_result),
            patch("ngsp.pipeline.extract_quasi_identifiers", return_value=[]),
            patch("ngsp.pipeline.route", return_value=decision),
            patch("ngsp.pipeline.synthesize_query", return_value="What is the dosing schedule?"),
        ):
            pipeline = Pipeline(local_model=local_model, remote_client=remote)
            budget = SessionBudget(epsilon_cap=3.0)
            out = pipeline.run("Tell me about the dose.", budget)

        assert isinstance(out, PipelineOutput)
        assert out.final_response == "The answer is 42."
        assert out.route_decision.path == "abstract_extractable"
        assert out.proxy_text == "What is the dosing schedule?"
        assert out.epsilon_this_call == 0.0

    # BudgetExhaustedError must fire when ε cap is already set to zero.
    def test_run_raises_on_exhausted_budget(self) -> None:
        from unittest.mock import MagicMock
        from ngsp.dp_mechanism import BudgetExhaustedError
        from ngsp.pipeline import Pipeline, SessionBudget

        pipeline = Pipeline(local_model=MagicMock(), remote_client=MagicMock())
        budget = SessionBudget(epsilon_cap=0.0)  # already at cap
        with pytest.raises(BudgetExhaustedError):
            pipeline.run("any input", budget)
