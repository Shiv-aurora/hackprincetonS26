# Generates synthetic Clinical Research Associate monitoring visit reports with spans.
from __future__ import annotations

import random
import uuid

from . import _fakers as F
from ._vocab import (
    DEVIATION_TYPES,
    GEOGRAPHIC_SUBDIVISIONS,
    INDICATIONS,
    SITE_NAMES,
)
from .schemas import DocBuilder, MonitoringReport, SensitiveCategory

random.seed(42)


# Assemble a single monitoring visit report with randomized deviation detail.
def _build_one_monitoring(rng: random.Random, doc_id: str) -> MonitoringReport:
    compound = F.fake_compound_code(rng)
    protocol_id = F.fake_protocol_id(rng, compound)
    site_id = F.fake_site_id(rng)
    site_name = rng.choice(SITE_NAMES)
    city = rng.choice(GEOGRAPHIC_SUBDIVISIONS)
    pi = F.fake_person_name(rng)
    cra = F.fake_person_name(rng, title="Ms." if rng.random() < 0.5 else "Mr.")
    visit_date = F.fake_date(rng)
    next_visit = F.fake_date(rng)
    indication = rng.choice(INDICATIONS)
    email = F.fake_email(rng, pi)
    phone = F.fake_phone(rng)

    enrolled = rng.randint(4, 48)
    screened = enrolled + rng.randint(2, 20)
    screen_failures = screened - enrolled
    dev1 = rng.choice(DEVIATION_TYPES)
    dev2 = rng.choice(DEVIATION_TYPES)

    b = DocBuilder()
    b.add("CRA MONITORING VISIT REPORT (synthetic test data)\n\n")
    b.add("Site: ")
    b.add_span(site_id, SensitiveCategory.SITE_ID)
    b.add(" — ")
    b.add_span(site_name, SensitiveCategory.GEOGRAPHIC_SUBDIVISION)
    b.add(", ")
    b.add_span(city, SensitiveCategory.GEOGRAPHIC_SUBDIVISION)
    b.add(".\nProtocol: ")
    b.add_span(protocol_id, SensitiveCategory.COMPOUND_CODE)
    b.add(" (")
    b.add_span(compound, SensitiveCategory.COMPOUND_CODE)
    b.add(" in ")
    b.add_span(indication, SensitiveCategory.INDICATION)
    b.add(").\nVisit date: ")
    b.add_span(visit_date, SensitiveCategory.DATE)
    b.add(". Monitor: ")
    b.add_span(cra, SensitiveCategory.NAME)
    b.add(". PI: ")
    b.add_span(pi, SensitiveCategory.NAME)
    b.add(".\n\n")

    b.add(f"Enrollment summary: {screened} screened, {enrolled} enrolled, {screen_failures} screen failures. ")
    b.add("Source data verification was performed on a 100% sample of enrolled subjects.\n\n")

    b.add("Protocol deviations observed this visit:\n")
    b.add(f"  1. {dev1} — affecting 1 subject; action taken: retraining of the site staff.\n")
    b.add(f"  2. {dev2} — affecting 2 subjects; action taken: corrective SOP amendment.\n\n")

    # Optional follow-up paragraph with PI direct contact details.
    if rng.random() < 0.6:
        b.add("Next planned visit: ")
        b.add_span(next_visit, SensitiveCategory.DATE)
        b.add(". Follow-up correspondence to PI at ")
        b.add_span(email, SensitiveCategory.EMAIL)
        b.add(" and by phone at ")
        b.add_span(phone, SensitiveCategory.PHONE)
        b.add(".\n")

    b.validate_offsets()
    return MonitoringReport(
        doc_id=doc_id,
        text=b.text(),
        spans=b.spans(),
        metadata={
            "site_id": site_id,
            "protocol_id": protocol_id,
            "compound_code": compound,
            "enrolled": enrolled,
            "screened": screened,
        },
    )


# Produce n monitoring reports with deterministic IDs; default n=200 per spec.
def generate_monitoring_reports(n: int = 200, seed: int = 44) -> list[MonitoringReport]:
    rng = random.Random(seed)
    out: list[MonitoringReport] = []
    for i in range(n):
        doc_id = f"MON-{seed:04d}-{i:04d}-{uuid.UUID(int=rng.getrandbits(128)).hex[:8]}"
        out.append(_build_one_monitoring(rng, doc_id))
    return out
