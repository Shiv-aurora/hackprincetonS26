# Generates templated Serious Adverse Event narratives with ground-truth sensitive spans.
from __future__ import annotations

import random
import uuid

from . import _fakers as F
from ._vocab import (
    AE_CATEGORIES,
    AE_GRADES,
    AMENDMENT_RATIONALES,
    CAUSALITY,
    COMORBIDITIES,
    GEOGRAPHIC_SUBDIVISIONS,
    INDICATIONS,
    INTERIM_RESULTS,
    OUTCOMES,
    REGULATORY_QUESTIONS,
    SITE_NAMES,
)
from .schemas import DocBuilder, SAENarrative, SensitiveCategory

random.seed(42)


# Assemble a single SAE narrative with rotating optional paragraphs for length variance.
def _build_one_sae(rng: random.Random, doc_id: str) -> SAENarrative:
    compound = F.fake_compound_code(rng)
    site_id = F.fake_site_id(rng)
    site_name = rng.choice(SITE_NAMES)
    city = rng.choice(GEOGRAPHIC_SUBDIVISIONS)
    protocol_id = F.fake_protocol_id(rng, compound)
    investigator = F.fake_person_name(rng)
    cra = F.fake_person_name(rng, title="Ms." if rng.random() < 0.5 else "Mr.")
    patient_id = F.fake_patient_id(rng, site_id)
    mrn = F.fake_mrn(rng)
    indication = rng.choice(INDICATIONS)
    ae = rng.choice(AE_CATEGORIES)
    grade = rng.choice(AE_GRADES)
    onset_date = F.fake_date(rng)
    start_date = F.fake_date(rng)
    admit_date = F.fake_date(rng)
    discharge_date = F.fake_date(rng)
    action_date = F.fake_date(rng)
    dose = F.fake_dose(rng)
    age = rng.randint(22, 84)
    sex = rng.choice(("male", "female"))
    comorbidity = rng.choice(COMORBIDITIES)
    outcome = rng.choice(OUTCOMES)
    causality = rng.choice(CAUSALITY)
    license_no = F.fake_license(rng)
    email = F.fake_email(rng, investigator)
    phone = F.fake_phone(rng)
    hosp_duration = F.fake_days(rng)
    efficacy = F.fake_efficacy_value(rng)
    amendment = rng.choice(AMENDMENT_RATIONALES)
    regulatory = rng.choice(REGULATORY_QUESTIONS)
    interim = rng.choice(INTERIM_RESULTS)

    b = DocBuilder()
    b.add("CONFIDENTIAL — SAE NARRATIVE (synthetic test data)\n\n")
    b.add("Subject ")
    b.add_span(patient_id, SensitiveCategory.OTHER_UNIQUE_ID)
    b.add(f" (MRN ")
    b.add_span(mrn, SensitiveCategory.MRN)
    b.add(f"), a {age}-year-old {sex}, enrolled at ")
    b.add_span(site_id, SensitiveCategory.SITE_ID)
    b.add(" — ")
    b.add_span(site_name, SensitiveCategory.GEOGRAPHIC_SUBDIVISION)
    b.add(" (")
    b.add_span(city, SensitiveCategory.GEOGRAPHIC_SUBDIVISION)
    b.add(") under protocol ")
    b.add_span(protocol_id, SensitiveCategory.COMPOUND_CODE)
    b.add(" for ")
    b.add_span(indication, SensitiveCategory.INDICATION)
    b.add(" experienced a serious adverse event of ")
    b.add_span(ae, SensitiveCategory.AE_GRADE)
    b.add(" (")
    b.add_span(grade, SensitiveCategory.AE_GRADE)
    b.add(") on ")
    b.add_span(onset_date, SensitiveCategory.DATE)
    b.add(". The subject had initiated ")
    b.add_span(compound, SensitiveCategory.COMPOUND_CODE)
    b.add(" at a dose of ")
    b.add_span(dose, SensitiveCategory.DOSE)
    b.add(" on ")
    b.add_span(start_date, SensitiveCategory.DATE)
    b.add(".\n\n")

    # Medical history paragraph.
    b.add("Relevant medical history includes ")
    b.add(comorbidity)
    b.add(". Prior therapies were unremarkable. Clinical course: the event evolved over ")
    b.add_span(hosp_duration, SensitiveCategory.TIMING)
    b.add(" and required hospitalization at ")
    b.add_span(site_name, SensitiveCategory.GEOGRAPHIC_SUBDIVISION)
    b.add(" from ")
    b.add_span(admit_date, SensitiveCategory.DATE)
    b.add(" through ")
    b.add_span(discharge_date, SensitiveCategory.DATE)
    b.add(". Study drug was held on ")
    b.add_span(action_date, SensitiveCategory.DATE)
    b.add(" and subsequently resumed at a reduced dose.\n\n")

    # Optional interim efficacy paragraph (MNPI) — included about 60% of the time.
    if rng.random() < 0.6:
        b.add("Per the most recent blinded safety update, the observed ")
        b.add_span(efficacy, SensitiveCategory.EFFICACY_VALUE)
        b.add(" was noted in the experimental arm. At the pre-specified interim, ")
        b.add_span(interim, SensitiveCategory.INTERIM_RESULT)
        b.add(".\n\n")

    # Optional amendment paragraph — included about 50% of the time.
    if rng.random() < 0.5:
        b.add("Following this event, ")
        b.add_span(amendment, SensitiveCategory.AMENDMENT_RATIONALE)
        b.add(". The sponsor is tracking this change under the active amendment log.\n\n")

    # Optional regulatory paragraph — included about 35% of the time.
    if rng.random() < 0.35:
        b.add("Regulatory note: ")
        b.add_span(regulatory, SensitiveCategory.REGULATORY_QUESTION)
        b.add(".\n\n")

    # Investigator disposition paragraph (always present).
    b.add("The event was assessed as ")
    b.add(causality)
    b.add(" related to study drug. The outcome is reported as ")
    b.add(outcome)
    b.add(". Investigator of record: ")
    b.add_span(investigator, SensitiveCategory.NAME)
    b.add(" (license ")
    b.add_span(license_no, SensitiveCategory.CERTIFICATE_LICENSE)
    b.add("). Site monitor: ")
    b.add_span(cra, SensitiveCategory.NAME)
    b.add(". Contact: ")
    b.add_span(email, SensitiveCategory.EMAIL)
    b.add(", ")
    b.add_span(phone, SensitiveCategory.PHONE)
    b.add(".\n")

    b.validate_offsets()

    metadata = {
        "indication": indication,
        "ae_category": ae,
        "grade": grade,
        "compound_code": compound,
        "protocol_id": protocol_id,
    }
    return SAENarrative(doc_id=doc_id, text=b.text(), spans=b.spans(), metadata=metadata)


# Produce n SAE narratives with deterministic IDs and spans; default n=500 per spec.
def generate_sae_narratives(n: int = 500, seed: int = 42) -> list[SAENarrative]:
    rng = random.Random(seed)
    # Seed a separate uuid-like namespace from the rng so doc_ids are also deterministic.
    out: list[SAENarrative] = []
    for i in range(n):
        doc_id = f"SAE-{seed:04d}-{i:04d}-{uuid.UUID(int=rng.getrandbits(128)).hex[:8]}"
        out.append(_build_one_sae(rng, doc_id))
    return out
