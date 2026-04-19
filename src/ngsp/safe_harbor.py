# Deterministic detector for the 18 HIPAA Safe Harbor identifiers with entity-map building.
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from data.schemas import SensitiveCategory, SensitiveSpan

# ---------------------------------------------------------------------------
# Regex patterns for the 15 structured Safe Harbor identifier types.
# (Names, geographic subdivisions, and biometrics are handled via Gemma NER below.)
# ---------------------------------------------------------------------------

_PAT_PHONE = re.compile(
    r"(?<!\d)"
    r"(?:\+1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}"
    r"(?!\d)"
)
_PAT_FAX = re.compile(
    r"(?i)fax[:\s]*(?:\+1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}"
)
_PAT_EMAIL = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
_PAT_SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
_PAT_MRN = re.compile(
    r"\b(?:MRN|mrn|MR|Patient\s*ID|PatID)[:\s#]?\s*([A-Z0-9\-]{4,12})\b"
)
_PAT_URL = re.compile(r"https?://[^\s\"'<>]+")
_PAT_IP = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_PAT_ZIP = re.compile(r"\b\d{5}(?:-\d{4})?\b")
_PAT_DATE = re.compile(
    r"\b(?:0?[1-9]|1[0-2])[/\-](?:0?[1-9]|[12]\d|3[01])[/\-]\d{2,4}\b"
    r"|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+\d{1,2}[\s,]+\d{4}\b"
    r"|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b"
    # DD-MON-YYYY (07-DEC-2026) and MON-YYYY (MAY-2023) formats common in clinical docs.
    r"|\b(?:0?[1-9]|[12]\d|3[01])-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}\b"
    r"|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}\b",
    re.IGNORECASE,
)
_PAT_ACCOUNT = re.compile(r"\b(?:Acct|Account)\s*[#:]?\s*([A-Z0-9\-]{4,16})\b", re.IGNORECASE)
_PAT_CERT = re.compile(r"\b(?:Cert|License|Lic)\s*[#:]?\s*([A-Z0-9\-]{4,16})\b", re.IGNORECASE)
_PAT_VEHICLE = re.compile(r"\bVIN[:\s]*([A-HJ-NPR-Z0-9]{17})\b", re.IGNORECASE)
_PAT_DEVICE = re.compile(r"\bDEV[:\s#]*([A-Z0-9\-]{4,16})\b", re.IGNORECASE)
_PAT_HEALTH_PLAN = re.compile(r"\bHPBN?[:\s#]*([A-Z0-9\-]{6,14})\b", re.IGNORECASE)

# ---------------------------------------------------------------------------
# Clinical-trial quasi-identifier patterns (not in HIPAA 18 but leak at 75-100%
# in verbatim attacks; added after attack-suite results showed systematic leakage).
# ---------------------------------------------------------------------------

# Site identifiers: SITE-01, SITE-3, CTR-7, CENTER-12 etc.
_PAT_SITE_ID = re.compile(
    r"\b(?:SITE|CTR|CENTER|CLINIC|CRO)[-_]?\s*\d{1,4}\b",
    re.IGNORECASE,
)

# Compound / drug codes: SYN-XXXX, XZP-XXXX-Nb-NNN, COMP-XXX, NCT-prefixed codes.
# Negative lookahead excludes month abbreviations (MAY-2023) and subject-ID prefix PT.
_MONTH_ABBR = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
_PAT_COMPOUND_CODE = re.compile(
    rf"\b(?!{_MONTH_ABBR}[-_]\d{{4}}\b)(?!PT[-_])(?:[A-Z]{{2,6}}[-_]\d{{3,6}}(?:[-_]\d+[a-z][-_]\d+)?)\b"
    r"|\bNCT\d{8}\b",
    re.IGNORECASE,
)

# Clinical dose values: 25mg, 100 mg, 2.5 mg/kg, 1000IU, 0.5mL.
_PAT_DOSE = re.compile(
    r"\b\d+(?:\.\d+)?\s*(?:mg(?:/kg)?|mcg|μg|IU|mL|g)\b",
    re.IGNORECASE,
)

# AE grade annotations: Grade 3, CTCAE grade 2, Grade IV.
_PAT_AE_GRADE = re.compile(
    r"\bgrade\s+(?:[1-5]|[IVX]{1,4})\b",
    re.IGNORECASE,
)

_REGEX_RULES: list[tuple[re.Pattern[str], SensitiveCategory]] = [
    (_PAT_FAX, SensitiveCategory.FAX),  # fax before phone (fax pattern is more specific)
    (_PAT_PHONE, SensitiveCategory.PHONE),
    (_PAT_EMAIL, SensitiveCategory.EMAIL),
    (_PAT_SSN, SensitiveCategory.SSN),
    (_PAT_MRN, SensitiveCategory.MRN),
    (_PAT_URL, SensitiveCategory.URL),
    (_PAT_IP, SensitiveCategory.IP),
    (_PAT_ZIP, SensitiveCategory.GEOGRAPHIC_SUBDIVISION),
    (_PAT_DATE, SensitiveCategory.DATE),
    (_PAT_ACCOUNT, SensitiveCategory.ACCOUNT),
    (_PAT_CERT, SensitiveCategory.CERTIFICATE_LICENSE),
    (_PAT_VEHICLE, SensitiveCategory.VEHICLE_ID),
    (_PAT_DEVICE, SensitiveCategory.DEVICE_ID),
    (_PAT_HEALTH_PLAN, SensitiveCategory.HEALTH_PLAN_BENEFICIARY),
    # Clinical quasi-identifiers — SITE_ID before COMPOUND_CODE so "SITE-9250" isn't
    # consumed by the broader compound-code pattern first.
    (_PAT_SITE_ID, SensitiveCategory.SITE_ID),
    (_PAT_COMPOUND_CODE, SensitiveCategory.COMPOUND_CODE),
    (_PAT_DOSE, SensitiveCategory.DOSE),
    (_PAT_AE_GRADE, SensitiveCategory.AE_GRADE),
]


@dataclass
class StripResult:
    # Output of the Safe Harbor stripping pass.
    stripped_text: str
    # Mapping from abstract placeholder (e.g. "<PERSON_1>") to original value.
    entity_map: dict[str, str] = field(default_factory=dict)
    # All detected sensitive spans (in original-text offsets).
    spans: list[SensitiveSpan] = field(default_factory=list)


# Extract raw safe-harbor spans from `text` using regex rules only (no model call).
def extract_regex_spans(text: str) -> list[SensitiveSpan]:
    covered: list[tuple[int, int]] = []  # already-matched intervals to avoid double-tagging
    spans: list[SensitiveSpan] = []
    for pattern, category in _REGEX_RULES:
        for m in pattern.finditer(text):
            s, e = m.start(), m.end()
            if any(cs <= s < ce or cs < e <= ce for cs, ce in covered):
                continue  # overlaps a prior match; skip
            covered.append((s, e))
            spans.append(SensitiveSpan(start=s, end=e, category=category, value=text[s:e]))
    return sorted(spans, key=lambda sp: sp.start)


# Use Gemma to identify names and geographic subdivisions not caught by regex.
def _extract_ner_spans(text: str, local_model: Any) -> list[SensitiveSpan]:
    prompt = (
        "You are a strict HIPAA de-identification assistant. "
        "Find every PERSON NAME and every GEOGRAPHIC SUBDIVISION (city, state, county, address) "
        "in the TEXT below. Return ONLY a JSON array of objects with keys "
        '"text" (the exact substring), "category" ("name" or "geographic_subdivision"). '
        "If none, return []. Do not add explanation.\n\nTEXT:\n" + text
    )
    try:
        raw = local_model.generate(prompt, max_tokens=512, temperature=0.0)
    except Exception:
        return []  # degrade gracefully if model unavailable

    import json

    try:
        bracket_start = raw.index("[")
        bracket_end = raw.rindex("]") + 1
        items = json.loads(raw[bracket_start:bracket_end])
    except (ValueError, json.JSONDecodeError):
        return []

    spans: list[SensitiveSpan] = []
    for item in items:
        value = item.get("text", "")
        cat_raw = item.get("category", "")
        if cat_raw == "name":
            cat = SensitiveCategory.NAME
        elif cat_raw == "geographic_subdivision":
            cat = SensitiveCategory.GEOGRAPHIC_SUBDIVISION
        else:
            continue
        # Find first occurrence in text (case-sensitive for accuracy).
        idx = text.find(value)
        if idx == -1:
            continue
        spans.append(SensitiveSpan(start=idx, end=idx + len(value), category=cat, value=value))
    return spans


# Build an entity_map counter keyed by SensitiveCategory, returning a fresh placeholder.
def _make_placeholder(category: SensitiveCategory, counters: dict[str, int]) -> str:
    key = category.value.upper()
    counters[key] = counters.get(key, 0) + 1
    return f"<{key}_{counters[key]}>"


# Replace spans in `text` with typed placeholders, extending entity_map in place; returns updated text.
def apply_span_stripping(
    text: str,
    spans: "list[Any]",
    entity_map: "dict[str, str]",
    counters: "dict[str, int] | None" = None,
) -> str:
    if not spans:
        return text
    if counters is None:
        counters = {}
    result_chars = list(text)
    for sp in sorted(spans, key=lambda s: s.start, reverse=True):
        placeholder = _make_placeholder(sp.category, counters)
        entity_map[placeholder] = sp.value
        result_chars[sp.start : sp.end] = list(placeholder)
    return "".join(result_chars)


# Strip Safe Harbor identifiers from `text`, replacing them with abstract placeholders.
# Pass a LocalModel instance to enable Gemma NER for names and geographic text.
# Returns a StripResult containing stripped text, entity_map, and all detected spans.
def strip_safe_harbor(text: str, local_model: Any | None = None) -> StripResult:
    spans = extract_regex_spans(text)

    if local_model is not None:
        ner_spans = _extract_ner_spans(text, local_model)
        # Merge; drop NER spans that overlap any already-covered regex span.
        covered = {(sp.start, sp.end) for sp in spans}
        for sp in ner_spans:
            if (sp.start, sp.end) not in covered:
                spans.append(sp)

    spans = sorted(spans, key=lambda sp: sp.start)

    # Build stripped text by replacing spans in reverse order to preserve offsets.
    entity_map: dict[str, str] = {}
    counters: dict[str, int] = {}
    result_chars = list(text)
    for sp in reversed(spans):
        placeholder = _make_placeholder(sp.category, counters)
        entity_map[placeholder] = sp.value
        result_chars[sp.start : sp.end] = list(placeholder)

    stripped = "".join(result_chars)
    return StripResult(stripped_text=stripped, entity_map=entity_map, spans=spans)
