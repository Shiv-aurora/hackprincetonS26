# Injects unique CANARY_<hex> sentinel tokens into documents for leak detection.
from __future__ import annotations

import random
import re
import uuid
from dataclasses import dataclass

from .schemas import _DocumentBase

# Regex used by the remote client wrapper to detect canary leakage in outbound prompts.
CANARY_REGEX: re.Pattern[str] = re.compile(r"CANARY_[0-9a-f]+")


# Generate a fresh unique canary sentinel using uuid4 hex.
def mint_canary() -> str:
    return f"CANARY_{uuid.uuid4().hex}"


@dataclass(frozen=True)
class CanaryInjection:
    # Container for the result of a canary injection: modified text + sentinel value.
    text: str
    canary: str


# Inject a canary token near the end of a raw text string at a paragraph boundary.
def inject_canary_text(text: str, canary: str | None = None, rng: random.Random | None = None) -> CanaryInjection:
    rng = rng or random.Random()
    canary = canary or mint_canary()
    suffix = f"\n\n[internal reference token: {canary}]\n"
    return CanaryInjection(text=text + suffix, canary=canary)


# Return a shallow copy of a synthesized document with a canary sentinel appended.
def inject_canary_doc(
    doc: _DocumentBase, canary: str | None = None, rng: random.Random | None = None
) -> tuple[_DocumentBase, str]:
    injection = inject_canary_text(doc.text, canary=canary, rng=rng)
    new_doc = doc.model_copy(update={"text": injection.text})
    return new_doc, injection.canary


# Return True iff the given text contains any canary-matching substring.
def contains_canary(text: str) -> bool:
    return CANARY_REGEX.search(text) is not None


# Return the list of distinct canary tokens found in the given text.
def extract_canaries(text: str) -> list[str]:
    return list(dict.fromkeys(CANARY_REGEX.findall(text)))
