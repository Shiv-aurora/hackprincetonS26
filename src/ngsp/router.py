# Three-way routing classifier: abstract_extractable | dp_tolerant | local_only.
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Literal

from data.schemas import SensitiveSpan

RoutePath = Literal["abstract_extractable", "dp_tolerant", "local_only"]


@dataclass(frozen=True)
class RouteDecision:
    # Immutable routing outcome with path and a short model-provided rationale.
    path: RoutePath
    rationale: str


_ROUTE_PROMPT_TEMPLATE = """\
You are a routing agent for a clinical-trial privacy system.

Your job: classify the user request below into exactly ONE of three routing paths.

Definitions:
- abstract_extractable: The user's task intent can be expressed without referencing any \
specific sensitive entity. Example: "rewrite this sentence more concisely" — the task is \
pure editing, separable from who or what is described.
- dp_tolerant: The task requires conveying some of the sensitive content to be useful \
(e.g. summarization, translation, long-form Q&A about clinical data), but the exact \
sensitive values are not critical — a slightly noised version would still be acceptable.
- local_only: The task and the sensitive content are inseparable. The user needs an answer \
that specifically identifies or references sensitive entities. No useful proxy can be formed.

Sensitive spans detected in the input:
{span_summary}

User request (with Safe Harbor identifiers already stripped):
{stripped_input}

Return ONLY a JSON object with keys "path" (one of the three values above) and "rationale" \
(one sentence explaining your choice). No other text.
"""


# Build a compact summary of detected spans for the routing prompt context.
def _summarize_spans(spans: list[SensitiveSpan]) -> str:
    if not spans:
        return "(none)"
    by_cat: dict[str, int] = {}
    for sp in spans:
        by_cat[sp.category.value] = by_cat.get(sp.category.value, 0) + 1
    return ", ".join(f"{cat}: {n}" for cat, n in sorted(by_cat.items()))


# Parse the Gemma routing response into a RouteDecision; fall back to dp_tolerant on error.
def _parse_routing_response(raw: str) -> RouteDecision:
    valid: set[RoutePath] = {"abstract_extractable", "dp_tolerant", "local_only"}
    try:
        brace_start = raw.index("{")
        brace_end = raw.rindex("}") + 1
        obj = json.loads(raw[brace_start:brace_end])
        path = obj.get("path", "").strip()
        rationale = obj.get("rationale", "").strip()
        if path not in valid:
            raise ValueError(f"Unknown path: {path!r}")
        return RouteDecision(path=path, rationale=rationale)  # type: ignore[arg-type]
    except (ValueError, json.JSONDecodeError, KeyError):
        return RouteDecision(path="dp_tolerant", rationale="Routing fallback: parse error.")


# Classify the (stripped) input + its sensitive-span profile into one of three paths.
def route(
    stripped_input: str,
    spans: list[SensitiveSpan],
    local_model: Any,
) -> RouteDecision:
    prompt = _ROUTE_PROMPT_TEMPLATE.format(
        span_summary=_summarize_spans(spans),
        stripped_input=stripped_input,
    )
    try:
        raw = local_model.generate(prompt, max_tokens=256, temperature=0.0)
    except Exception:
        return RouteDecision(path="dp_tolerant", rationale="Routing fallback: model error.")
    return _parse_routing_response(raw)
