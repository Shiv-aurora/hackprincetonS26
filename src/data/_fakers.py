# Deterministic fake-value generators for dates, phones, emails, IDs, compound codes, etc.
from __future__ import annotations

import random

from ._vocab import GREEK_LETTERS, PLACEHOLDER_FIRSTNAMES

_MONTHS: tuple[str, ...] = (
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
)


# Return a clinical-trial-style date string "DD-MMM-YYYY" using the provided Random.
def fake_date(rng: random.Random, year_range: tuple[int, int] = (2022, 2026)) -> str:
    day = rng.randint(1, 28)
    month = rng.choice(_MONTHS)
    year = rng.randint(year_range[0], year_range[1])
    return f"{day:02d}-{month}-{year}"


# Return a four-digit synthetic compound code like "SYN-4821".
def fake_compound_code(rng: random.Random) -> str:
    return f"SYN-{rng.randint(1000, 9999)}"


# Return a site identifier in the 9000-9999 range.
def fake_site_id(rng: random.Random) -> str:
    return f"SITE-{rng.randint(9000, 9999)}"


# Return a synthetic investigator or CRA name prefixed by a title.
def fake_person_name(rng: random.Random, title: str = "Dr.") -> str:
    first = rng.choice(PLACEHOLDER_FIRSTNAMES)
    last = rng.choice(GREEK_LETTERS)
    return f"{title} {first} {last}"


# Return a synthetic patient identifier tying subject to site.
def fake_patient_id(rng: random.Random, site_id: str) -> str:
    # site_id comes in as "SITE-9XXX"; reuse its numeric suffix in the subject id.
    suffix = site_id.split("-")[-1]
    return f"PT-{suffix}-{rng.randint(100, 999)}"


# Return a US-style phone number in the obviously-fake 555 exchange.
def fake_phone(rng: random.Random) -> str:
    return f"(555) {rng.randint(100, 999)}-{rng.randint(1000, 9999)}"


# Return a synthetic investigator email in a fake institution domain.
def fake_email(rng: random.Random, name_seed: str | None = None) -> str:
    stem = (name_seed or "investigator").lower().replace(" ", ".").replace(",", "")
    stem = stem.replace("dr.", "").strip(".")
    institution = rng.choice(("synthmed", "testclin", "mockhospital", "fakemed"))
    return f"{stem}@{institution}.example.org"


# Return a synthetic medical-license number.
def fake_license(rng: random.Random) -> str:
    return f"LIC-{rng.choice(['CA', 'NY', 'TX', 'MA', 'IL'])}-{rng.randint(100000, 999999)}"


# Return a synthetic MRN string.
def fake_mrn(rng: random.Random) -> str:
    return f"MRN-{rng.randint(10000000, 99999999)}"


# Return a dose string like "200 mg QD" or "1.5 mg/kg IV Q3W".
def fake_dose(rng: random.Random) -> str:
    mg = rng.choice((10, 25, 50, 100, 150, 200, 300, 400, 600, 800))
    schedule = rng.choice(("QD", "BID", "Q2W", "Q3W", "Q4W", "weekly"))
    if rng.random() < 0.25:
        kg_dose = rng.choice((0.5, 1.0, 1.5, 2.0, 3.0))
        route = rng.choice(("IV", "SC"))
        return f"{kg_dose} mg/kg {route} {schedule}"
    return f"{mg} mg {schedule}"


# Return an efficacy value phrase like "ORR 38.4%" or "PFS 8.2 months".
def fake_efficacy_value(rng: random.Random) -> str:
    metric = rng.choice(("ORR", "PFS", "OS", "DoR", "DCR"))
    if metric in ("ORR", "DCR"):
        return f"{metric} {rng.uniform(10.0, 75.0):.1f}%"
    return f"{metric} {rng.uniform(2.0, 24.0):.1f} months"


# Return a fake protocol identifier.
def fake_protocol_id(rng: random.Random, compound_code: str) -> str:
    phase = rng.choice(("1", "1b", "2", "2b", "3"))
    return f"{compound_code}-{phase}-{rng.randint(100, 999)}"


# Return a fake hospital admission duration count in days.
def fake_days(rng: random.Random, low: int = 1, high: int = 21) -> str:
    n = rng.randint(low, high)
    return f"{n} day{'s' if n != 1 else ''}"
