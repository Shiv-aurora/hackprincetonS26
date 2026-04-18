# Quasi-identifier and MNPI extraction on already-Safe-Harbor-stripped text via Gemma.
from __future__ import annotations

import json
from typing import Any

from data.schemas import SensitiveCategory, SensitiveSpan

# Quasi-identifier types the extractor looks for beyond the HIPAA 18 Safe Harbor set.
_QI_PROMPT_TYPES = (
    "compound_code (e.g. SYN-1234, IND-4321)",
    "site_id (clinical site number, e.g. site 9001)",
    "dose (specific numeric dose, e.g. 25 mg, 100 μg/kg)",
    "indication (specific disease or condition being treated)",
    "efficacy_value (objective response rate, progression-free survival months, p-value, etc.)",
    "ae_grade (CTCAE grade, e.g. Grade 3, G2)",
    "timing (specific treatment cycle, visit, or day reference, e.g. Cycle 2 Day 1)",
    "interim_result (interim analysis conclusion, boundary crossing, or hold decision)",
    "amendment_rationale (internal reason a protocol was amended)",
    "regulatory_question (specific question posed to or by a health authority)",
)

_CATEGORY_MAP: dict[str, SensitiveCategory] = {
    "compound_code": SensitiveCategory.COMPOUND_CODE,
    "site_id": SensitiveCategory.SITE_ID,
    "dose": SensitiveCategory.DOSE,
    "indication": SensitiveCategory.INDICATION,
    "efficacy_value": SensitiveCategory.EFFICACY_VALUE,
    "ae_grade": SensitiveCategory.AE_GRADE,
    "timing": SensitiveCategory.TIMING,
    "interim_result": SensitiveCategory.INTERIM_RESULT,
    "amendment_rationale": SensitiveCategory.AMENDMENT_RATIONALE,
    "regulatory_question": SensitiveCategory.REGULATORY_QUESTION,
}


# Build the Gemma prompt for quasi-identifier extraction from stripped text.
def _build_extraction_prompt(text: str) -> str:
    types_list = "\n".join(f"  - {t}" for t in _QI_PROMPT_TYPES)
    return (
        "You are a clinical-trial data-sensitivity expert. "
        "The following TEXT has already had HIPAA Safe Harbor identifiers removed. "
        "Your task: find remaining quasi-identifiers and MNPI markers.\n\n"
        "Categories to look for:\n"
        f"{types_list}\n\n"
        'Return ONLY a JSON array of objects with keys "text" (exact substring) and "category" '
        "(one of the snake_case category names above). If none found, return [].\n\n"
        "TEXT:\n" + text
    )


# Parse a raw Gemma JSON response into SensitiveSpan objects aligned to the source text.
def _parse_extraction_response(raw: str, text: str) -> list[SensitiveSpan]:
    try:
        bracket_start = raw.index("[")
        bracket_end = raw.rindex("]") + 1
        items = json.loads(raw[bracket_start:bracket_end])
    except (ValueError, json.JSONDecodeError):
        return []

    spans: list[SensitiveSpan] = []
    for item in items:
        value = item.get("text", "").strip()
        cat_raw = item.get("category", "").strip().lower()
        if not value or cat_raw not in _CATEGORY_MAP:
            continue
        idx = text.find(value)
        if idx == -1:
            continue
        spans.append(
            SensitiveSpan(
                start=idx,
                end=idx + len(value),
                category=_CATEGORY_MAP[cat_raw],
                value=value,
            )
        )
    return spans


# Extract quasi-identifiers and MNPI spans from already-stripped text using LocalModel.
# Returns a list of SensitiveSpan objects extending the Safe Harbor output.
def extract_quasi_identifiers(
    stripped_text: str, local_model: Any
) -> list[SensitiveSpan]:
    prompt = _build_extraction_prompt(stripped_text)
    try:
        raw = local_model.generate(prompt, max_tokens=512, temperature=0.0)
    except Exception:
        return []  # degrade gracefully if model unavailable
    return _parse_extraction_response(raw, stripped_text)
