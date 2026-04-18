# Generates a new self-contained proxy query from task intent, with no sensitive content.
from __future__ import annotations

from typing import Any

from data.schemas import SensitiveSpan

_SYNTH_PROMPT_TEMPLATE = """\
You are a privacy-preserving query reformulator for a clinical-trial system.

The user has a request that can be answered without exposing any sensitive details.
Your job: write a NEW self-contained question that captures the user's task intent but \
contains ZERO reference to any specific sensitive entity (no names, dates, compound codes, \
site IDs, doses, or study-specific values).

The new question must:
- Be answerable by a general-purpose LLM without clinical-trial context.
- Preserve the user's intent (the TYPE of task, not the specific content).
- Be a single, natural English question or instruction.
- Never include placeholder tokens like <PERSON_1> or <DATE_1>.

Detected sensitive span categories: {span_summary}
Original user request (stripped): {stripped_input}

Return ONLY the new synthesized question. No preamble, no quotes, no explanation.
"""


# Build a brief summary of span categories for the synthesis prompt.
def _span_summary(spans: list[SensitiveSpan]) -> str:
    if not spans:
        return "(none)"
    cats = sorted({sp.category.value for sp in spans})
    return ", ".join(cats)


# Synthesize a new privacy-preserving query from the stripped input and its span profile.
# The returned proxy text can be sent to the Anthropic API without exposing sensitive data.
def synthesize_query(
    stripped_input: str,
    spans: list[SensitiveSpan],
    local_model: Any,
) -> str:
    prompt = _SYNTH_PROMPT_TEMPLATE.format(
        span_summary=_span_summary(spans),
        stripped_input=stripped_input,
    )
    try:
        proxy = local_model.generate(prompt, max_tokens=256, temperature=0.3)
    except Exception:
        # Degrade to returning the stripped input if the model is unavailable.
        proxy = stripped_input
    return proxy.strip()
