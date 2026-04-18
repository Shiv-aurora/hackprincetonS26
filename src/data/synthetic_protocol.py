# Generates synthetic protocol excerpts (synopsis, eligibility, dosing, SAP) with spans.
from __future__ import annotations

import random
import uuid

from . import _fakers as F
from ._vocab import (
    AE_CATEGORIES,
    AMENDMENT_RATIONALES,
    COMORBIDITIES,
    INDICATIONS,
    INTERIM_RESULTS,
    REGULATORY_QUESTIONS,
)
from .schemas import DocBuilder, ProtocolExcerpt, SensitiveCategory

random.seed(42)

_EXCERPT_KINDS: tuple[str, ...] = ("synopsis", "eligibility", "dosing", "sap")


# Build a synopsis-style paragraph summarizing objective, population, endpoints.
def _build_synopsis(rng: random.Random, doc_id: str) -> ProtocolExcerpt:
    compound = F.fake_compound_code(rng)
    protocol_id = F.fake_protocol_id(rng, compound)
    indication = rng.choice(INDICATIONS)
    dose = F.fake_dose(rng)
    efficacy = F.fake_efficacy_value(rng)
    interim = rng.choice(INTERIM_RESULTS)
    start_date = F.fake_date(rng)
    amendment = rng.choice(AMENDMENT_RATIONALES)

    b = DocBuilder()
    b.add("PROTOCOL SYNOPSIS (synthetic test data)\n\n")
    b.add("Protocol ")
    b.add_span(protocol_id, SensitiveCategory.COMPOUND_CODE)
    b.add(" evaluates ")
    b.add_span(compound, SensitiveCategory.COMPOUND_CODE)
    b.add(" at ")
    b.add_span(dose, SensitiveCategory.DOSE)
    b.add(" in subjects with ")
    b.add_span(indication, SensitiveCategory.INDICATION)
    b.add(". The primary objective is to assess efficacy per ")
    b.add_span(efficacy, SensitiveCategory.EFFICACY_VALUE)
    b.add(". First-patient-first-visit occurred on ")
    b.add_span(start_date, SensitiveCategory.DATE)
    b.add(".\n\n")

    b.add("An internal blinded review summary notes ")
    b.add_span(interim, SensitiveCategory.INTERIM_RESULT)
    b.add(". Amendment context: ")
    b.add_span(amendment, SensitiveCategory.AMENDMENT_RATIONALE)
    b.add(". This content is not intended for external distribution.")
    b.validate_offsets()
    return ProtocolExcerpt(
        doc_id=doc_id,
        text=b.text(),
        spans=b.spans(),
        metadata={"kind_sub": "synopsis", "compound_code": compound, "protocol_id": protocol_id},
    )


# Build an eligibility-criteria paragraph with comorbidities and concomitant exclusions.
def _build_eligibility(rng: random.Random, doc_id: str) -> ProtocolExcerpt:
    compound = F.fake_compound_code(rng)
    indication = rng.choice(INDICATIONS)
    ae = rng.choice(AE_CATEGORIES)
    comorbidity = rng.choice(COMORBIDITIES)
    reg = rng.choice(REGULATORY_QUESTIONS)

    b = DocBuilder()
    b.add("ELIGIBILITY CRITERIA (excerpt, synthetic)\n\n")
    b.add("Subjects eligible for enrollment must have a confirmed diagnosis of ")
    b.add_span(indication, SensitiveCategory.INDICATION)
    b.add(" and be candidates for ")
    b.add_span(compound, SensitiveCategory.COMPOUND_CODE)
    b.add(" therapy. Key exclusion: a prior history of ")
    b.add(ae)
    b.add(" within 6 months, or active ")
    b.add(comorbidity)
    b.add(" requiring ongoing therapy. Age 18–75 inclusive.\n\n")
    if rng.random() < 0.5:
        b.add("Note: ")
        b.add_span(reg, SensitiveCategory.REGULATORY_QUESTION)
        b.add(".")
    b.validate_offsets()
    return ProtocolExcerpt(
        doc_id=doc_id,
        text=b.text(),
        spans=b.spans(),
        metadata={"kind_sub": "eligibility", "indication": indication, "compound_code": compound},
    )


# Build a dosing schedule paragraph including dose levels and cycle definition.
def _build_dosing(rng: random.Random, doc_id: str) -> ProtocolExcerpt:
    compound = F.fake_compound_code(rng)
    dose1 = F.fake_dose(rng)
    dose2 = F.fake_dose(rng)
    indication = rng.choice(INDICATIONS)

    b = DocBuilder()
    b.add("DOSING SCHEDULE (excerpt, synthetic)\n\n")
    b.add("Subjects receive ")
    b.add_span(compound, SensitiveCategory.COMPOUND_CODE)
    b.add(" starting at ")
    b.add_span(dose1, SensitiveCategory.DOSE)
    b.add(" with potential escalation to ")
    b.add_span(dose2, SensitiveCategory.DOSE)
    b.add(" per the 3+3 design. Cycles are 21 days. The target population is ")
    b.add_span(indication, SensitiveCategory.INDICATION)
    b.add(". Dose-limiting toxicity (DLT) assessment occurs in Cycle 1.")
    b.validate_offsets()
    return ProtocolExcerpt(
        doc_id=doc_id,
        text=b.text(),
        spans=b.spans(),
        metadata={"kind_sub": "dosing", "compound_code": compound, "indication": indication},
    )


# Build a statistical analysis plan snippet referencing interim readouts.
def _build_sap(rng: random.Random, doc_id: str) -> ProtocolExcerpt:
    compound = F.fake_compound_code(rng)
    protocol_id = F.fake_protocol_id(rng, compound)
    efficacy = F.fake_efficacy_value(rng)
    interim = rng.choice(INTERIM_RESULTS)

    b = DocBuilder()
    b.add("STATISTICAL ANALYSIS PLAN (synthetic excerpt)\n\n")
    b.add("Study ")
    b.add_span(protocol_id, SensitiveCategory.COMPOUND_CODE)
    b.add(" applies an O'Brien-Fleming alpha-spending function with two interim analyses. ")
    b.add("The primary endpoint is ")
    b.add_span(efficacy, SensitiveCategory.EFFICACY_VALUE)
    b.add(". Per the most recent DMC review, ")
    b.add_span(interim, SensitiveCategory.INTERIM_RESULT)
    b.add(". All MNPI markings apply to this section.")
    b.validate_offsets()
    return ProtocolExcerpt(
        doc_id=doc_id,
        text=b.text(),
        spans=b.spans(),
        metadata={"kind_sub": "sap", "compound_code": compound, "protocol_id": protocol_id},
    )


# Route to the appropriate sub-builder based on a random kind selection.
def _build_one_protocol(rng: random.Random, doc_id: str) -> ProtocolExcerpt:
    kind = rng.choice(_EXCERPT_KINDS)
    if kind == "synopsis":
        return _build_synopsis(rng, doc_id)
    if kind == "eligibility":
        return _build_eligibility(rng, doc_id)
    if kind == "dosing":
        return _build_dosing(rng, doc_id)
    return _build_sap(rng, doc_id)


# Produce n protocol excerpts with deterministic IDs; default n=200 per spec.
def generate_protocol_excerpts(n: int = 200, seed: int = 43) -> list[ProtocolExcerpt]:
    rng = random.Random(seed)
    out: list[ProtocolExcerpt] = []
    for i in range(n):
        doc_id = f"PROT-{seed:04d}-{i:04d}-{uuid.UUID(int=rng.getrandbits(128)).hex[:8]}"
        out.append(_build_one_protocol(rng, doc_id))
    return out
