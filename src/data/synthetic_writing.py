# Generates synthetic Clinical Study Report draft paragraphs for medical-writer rewrites.
from __future__ import annotations

import random
import uuid

from . import _fakers as F
from ._vocab import (
    AE_CATEGORIES,
    INDICATIONS,
    INTERIM_RESULTS,
)
from .schemas import CSRDraft, DocBuilder, SensitiveCategory

random.seed(42)

_SECTIONS: tuple[str, ...] = ("efficacy_summary", "safety_narrative", "discussion", "conclusion")


# Build an efficacy summary paragraph referencing interim results and primary endpoint.
def _build_efficacy_summary(rng: random.Random, doc_id: str) -> CSRDraft:
    compound = F.fake_compound_code(rng)
    protocol_id = F.fake_protocol_id(rng, compound)
    indication = rng.choice(INDICATIONS)
    efficacy = F.fake_efficacy_value(rng)
    efficacy2 = F.fake_efficacy_value(rng)
    interim = rng.choice(INTERIM_RESULTS)

    b = DocBuilder()
    b.add("CSR SECTION 11 DRAFT — EFFICACY SUMMARY (synthetic, pre-finalization)\n\n")
    b.add("In the primary analysis population of Study ")
    b.add_span(protocol_id, SensitiveCategory.COMPOUND_CODE)
    b.add(", ")
    b.add_span(compound, SensitiveCategory.COMPOUND_CODE)
    b.add(" demonstrated ")
    b.add_span(efficacy, SensitiveCategory.EFFICACY_VALUE)
    b.add(" compared to a control-arm value of ")
    b.add_span(efficacy2, SensitiveCategory.EFFICACY_VALUE)
    b.add(" in subjects with ")
    b.add_span(indication, SensitiveCategory.INDICATION)
    b.add(". Supporting context: ")
    b.add_span(interim, SensitiveCategory.INTERIM_RESULT)
    b.add(". Medical writer to confirm numbers against the locked data cut.")
    b.validate_offsets()
    return CSRDraft(
        doc_id=doc_id,
        text=b.text(),
        spans=b.spans(),
        metadata={"section": "efficacy_summary", "protocol_id": protocol_id, "compound_code": compound},
    )


# Build a safety narrative paragraph summarizing SAE frequencies and dose-limiting events.
def _build_safety_narrative(rng: random.Random, doc_id: str) -> CSRDraft:
    compound = F.fake_compound_code(rng)
    indication = rng.choice(INDICATIONS)
    ae1 = rng.choice(AE_CATEGORIES)
    ae2 = rng.choice(AE_CATEGORIES)
    dose = F.fake_dose(rng)
    investigator = F.fake_person_name(rng)

    b = DocBuilder()
    b.add("CSR SECTION 12 DRAFT — SAFETY NARRATIVE (synthetic)\n\n")
    b.add("Across the safety population receiving ")
    b.add_span(compound, SensitiveCategory.COMPOUND_CODE)
    b.add(" at ")
    b.add_span(dose, SensitiveCategory.DOSE)
    b.add(" for ")
    b.add_span(indication, SensitiveCategory.INDICATION)
    b.add(", the most frequent treatment-related SAEs were ")
    b.add(ae1)
    b.add(" and ")
    b.add(ae2)
    b.add(". A dose-reduction rule was triggered in approximately 12% of enrolled subjects. ")
    b.add("Principal contributor: ")
    b.add_span(investigator, SensitiveCategory.NAME)
    b.add(".")
    b.validate_offsets()
    return CSRDraft(
        doc_id=doc_id,
        text=b.text(),
        spans=b.spans(),
        metadata={"section": "safety_narrative", "compound_code": compound, "indication": indication},
    )


# Build a discussion paragraph comparing result to historical controls.
def _build_discussion(rng: random.Random, doc_id: str) -> CSRDraft:
    compound = F.fake_compound_code(rng)
    indication = rng.choice(INDICATIONS)
    efficacy = F.fake_efficacy_value(rng)

    b = DocBuilder()
    b.add("CSR SECTION 13 DRAFT — DISCUSSION (synthetic)\n\n")
    b.add("The observed ")
    b.add_span(efficacy, SensitiveCategory.EFFICACY_VALUE)
    b.add(" for ")
    b.add_span(compound, SensitiveCategory.COMPOUND_CODE)
    b.add(" in ")
    b.add_span(indication, SensitiveCategory.INDICATION)
    b.add(" compares favorably to historical controls published in the therapeutic area. ")
    b.add("Pending external publication the sponsor considers this finding MNPI and restricts circulation.")
    b.validate_offsets()
    return CSRDraft(
        doc_id=doc_id,
        text=b.text(),
        spans=b.spans(),
        metadata={"section": "discussion", "compound_code": compound, "indication": indication},
    )


# Build a short conclusion paragraph tying the study to regulatory strategy.
def _build_conclusion(rng: random.Random, doc_id: str) -> CSRDraft:
    compound = F.fake_compound_code(rng)
    protocol_id = F.fake_protocol_id(rng, compound)
    efficacy = F.fake_efficacy_value(rng)

    b = DocBuilder()
    b.add("CSR SECTION 14 DRAFT — CONCLUSION (synthetic)\n\n")
    b.add("Study ")
    b.add_span(protocol_id, SensitiveCategory.COMPOUND_CODE)
    b.add(" supports the continued development of ")
    b.add_span(compound, SensitiveCategory.COMPOUND_CODE)
    b.add(" with a favorable benefit-risk profile given the observed ")
    b.add_span(efficacy, SensitiveCategory.EFFICACY_VALUE)
    b.add(". A Phase 3 protocol is in draft and the sponsor anticipates a pre-submission meeting request.")
    b.validate_offsets()
    return CSRDraft(
        doc_id=doc_id,
        text=b.text(),
        spans=b.spans(),
        metadata={"section": "conclusion", "compound_code": compound, "protocol_id": protocol_id},
    )


# Dispatch to the appropriate section-specific builder.
def _build_one_csr(rng: random.Random, doc_id: str) -> CSRDraft:
    section = rng.choice(_SECTIONS)
    if section == "efficacy_summary":
        return _build_efficacy_summary(rng, doc_id)
    if section == "safety_narrative":
        return _build_safety_narrative(rng, doc_id)
    if section == "discussion":
        return _build_discussion(rng, doc_id)
    return _build_conclusion(rng, doc_id)


# Produce n CSR draft paragraphs with deterministic IDs; default n=300 per spec.
def generate_csr_drafts(n: int = 300, seed: int = 45) -> list[CSRDraft]:
    rng = random.Random(seed)
    out: list[CSRDraft] = []
    for i in range(n):
        doc_id = f"CSR-{seed:04d}-{i:04d}-{uuid.UUID(int=rng.getrandbits(128)).hex[:8]}"
        out.append(_build_one_csr(rng, doc_id))
    return out
