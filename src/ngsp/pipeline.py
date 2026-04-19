# End-to-end NGSP pipeline: Safe Harbor → router → proxy → Anthropic → entity re-apply.
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ngsp.answer_applier import apply_entity_map
from ngsp.dp_mechanism import (
    BudgetExhaustedError,
    RDPAccountant,
    add_gaussian_noise,
    clip_to_norm,
    compute_sigma,
)
from ngsp.entity_extractor import extract_quasi_identifiers
from ngsp.proxy_decoder import decode_proxy
from ngsp.query_synthesizer import synthesize_query
from ngsp.remote_client import RemoteClient
from ngsp.router import RouteDecision, route
from ngsp.safe_harbor import StripResult, apply_span_stripping, strip_safe_harbor


@dataclass
class SessionBudget:
    # Per-session differential-privacy budget; ε is monotone and never decreases.
    epsilon_cap: float = 3.0  # hard limit per session
    delta: float = 1e-5
    # L2 sensitivity of the bottleneck projection (set by calibration in Phase 2).
    sensitivity: float = 1.0
    # Rényi accountant is reset only when a new SessionBudget is constructed.
    _accountant: RDPAccountant = field(default_factory=RDPAccountant, repr=False)

    # Return cumulative ε spent this session.
    def epsilon_spent(self) -> float:
        return self._accountant.get_epsilon(self.delta)

    # Return remaining ε headroom before the session cap is hit.
    def epsilon_remaining(self) -> float:
        return self.epsilon_cap - self.epsilon_spent()

    # Record one DP mechanism application with the given sigma and update the accountant.
    def consume(self, sigma: float) -> None:
        self._accountant.step(sigma, sensitivity=self.sensitivity)
        if self.epsilon_spent() > self.epsilon_cap:
            raise BudgetExhaustedError(
                f"Session ε budget exhausted (cap={self.epsilon_cap}, "
                f"spent={self.epsilon_spent():.4f})."
            )


@dataclass
class PipelineOutput:
    # Full trace of one pipeline run including routing decision, proxy, and ε accounting.
    final_response: str
    route_decision: RouteDecision
    # Text sent to the Anthropic API (None for local_only path).
    proxy_text: str | None
    # ε consumed by this call (0.0 for abstract_extractable and local_only paths).
    epsilon_this_call: float
    # Cumulative session ε after this call.
    epsilon_cumulative: float
    # Categories of spans detected (never raw values, per audit invariant).
    span_categories: list[str]


class Pipeline:
    # Orchestrates the three-path NGSP flow for a single process session.

    # Initialize the pipeline with model wrappers, an optional DP config, and max_tokens.
    def __init__(
        self,
        local_model: Any,
        remote_client: RemoteClient,
        dp_layer_index: int = -1,
        max_tokens: int = 1024,
    ) -> None:
        self.local_model = local_model
        self.remote_client = remote_client
        self.dp_layer_index = dp_layer_index
        self.max_tokens = max_tokens

    # Run the full pipeline for one user request; mutates `budget` to record ε spent.
    def run(self, user_input: str, budget: SessionBudget) -> PipelineOutput:
        if budget.epsilon_remaining() <= 0:
            raise BudgetExhaustedError(
                f"Session ε budget already exhausted (cap={budget.epsilon_cap})."
            )

        # ── Phase A: Safe Harbor stripping ────────────────────────────────────────
        strip: StripResult = strip_safe_harbor(user_input, self.local_model)
        stripped = strip.stripped_text
        entity_map = strip.entity_map

        # ── Phase B: Quasi-identifier extraction + stripping ──────────────────────
        qi_spans = extract_quasi_identifiers(stripped, self.local_model)
        # Replace quasi-identifier values with typed placeholders in the proxy text,
        # extending entity_map so answer_applier can restore them in the final response.
        stripped = apply_span_stripping(stripped, qi_spans, entity_map)
        all_spans = strip.spans + qi_spans
        span_categories = sorted({sp.category.value for sp in all_spans})

        # ── Phase C: Routing ──────────────────────────────────────────────────────
        decision = route(stripped, all_spans, self.local_model)

        proxy_text: str | None = None
        epsilon_this_call: float = 0.0

        # ── Phase D: Path-specific proxy generation ────────────────────────────────
        if decision.path == "local_only":
            # Answer locally; never call the remote API.
            raw_response = self.local_model.generate(user_input, max_tokens=self.max_tokens)
            final_response = raw_response

        elif decision.path == "abstract_extractable":
            proxy_text = synthesize_query(stripped, all_spans, self.local_model)
            raw_response = self.remote_client.complete(
                prompt=proxy_text,
                system="You are a helpful clinical-trial assistant.",
                max_tokens=self.max_tokens,
            )
            final_response = apply_entity_map(raw_response, entity_map)

        else:  # dp_tolerant
            # DP bottleneck: hidden state → clip → noise → decode → send.
            _, hidden_vec = self.local_model.generate_with_hidden_states(
                stripped, layer=self.dp_layer_index, max_tokens=64
            )

            # Compute sigma that satisfies (ε_remaining, δ)-DP for this step.
            eps_step = min(budget.epsilon_remaining(), 1.0)  # consume at most 1.0 per call
            sigma = compute_sigma(eps_step, budget.delta, budget.sensitivity)
            clipped = clip_to_norm(hidden_vec, budget.sensitivity)
            noisy = add_gaussian_noise(clipped, sigma)

            eps_before = budget.epsilon_spent()
            budget.consume(sigma)
            epsilon_this_call = budget.epsilon_spent() - eps_before

            proxy_text = decode_proxy(stripped, noisy, all_spans, self.local_model)
            raw_response = self.remote_client.complete(
                prompt=proxy_text,
                system="You are a helpful clinical-trial assistant.",
                max_tokens=self.max_tokens,
            )
            final_response = apply_entity_map(raw_response, entity_map)

        return PipelineOutput(
            final_response=final_response,
            route_decision=decision,
            proxy_text=proxy_text,
            epsilon_this_call=epsilon_this_call,
            epsilon_cumulative=budget.epsilon_spent(),
            span_categories=span_categories,
        )
