# Typed records and the shared DocBuilder helper used by every synthetic generator.
from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SensitiveCategory(str, Enum):
    # HIPAA Safe Harbor 18 identifiers.
    NAME = "name"
    GEOGRAPHIC_SUBDIVISION = "geographic_subdivision"
    DATE = "date"
    PHONE = "phone"
    FAX = "fax"
    EMAIL = "email"
    SSN = "ssn"
    MRN = "mrn"
    HEALTH_PLAN_BENEFICIARY = "health_plan_beneficiary"
    ACCOUNT = "account"
    CERTIFICATE_LICENSE = "certificate_license"
    VEHICLE_ID = "vehicle_id"
    DEVICE_ID = "device_id"
    URL = "url"
    IP = "ip"
    BIOMETRIC = "biometric"
    PHOTO = "photo"
    OTHER_UNIQUE_ID = "other_unique_id"

    # Quasi-identifiers specific to the clinical-trial domain.
    COMPOUND_CODE = "compound_code"
    SITE_ID = "site_id"
    DOSE = "dose"
    INDICATION = "indication"
    EFFICACY_VALUE = "efficacy_value"
    AE_GRADE = "ae_grade"
    TIMING = "timing"

    # Material non-public information categories.
    INTERIM_RESULT = "interim_result"
    AMENDMENT_RATIONALE = "amendment_rationale"
    REGULATORY_QUESTION = "regulatory_question"


HIPAA_SAFE_HARBOR_CATEGORIES: frozenset[SensitiveCategory] = frozenset(
    {
        SensitiveCategory.NAME,
        SensitiveCategory.GEOGRAPHIC_SUBDIVISION,
        SensitiveCategory.DATE,
        SensitiveCategory.PHONE,
        SensitiveCategory.FAX,
        SensitiveCategory.EMAIL,
        SensitiveCategory.SSN,
        SensitiveCategory.MRN,
        SensitiveCategory.HEALTH_PLAN_BENEFICIARY,
        SensitiveCategory.ACCOUNT,
        SensitiveCategory.CERTIFICATE_LICENSE,
        SensitiveCategory.VEHICLE_ID,
        SensitiveCategory.DEVICE_ID,
        SensitiveCategory.URL,
        SensitiveCategory.IP,
        SensitiveCategory.BIOMETRIC,
        SensitiveCategory.PHOTO,
        SensitiveCategory.OTHER_UNIQUE_ID,
    }
)


QUASI_IDENTIFIER_CATEGORIES: frozenset[SensitiveCategory] = frozenset(
    {
        SensitiveCategory.COMPOUND_CODE,
        SensitiveCategory.SITE_ID,
        SensitiveCategory.DOSE,
        SensitiveCategory.INDICATION,
        SensitiveCategory.EFFICACY_VALUE,
        SensitiveCategory.AE_GRADE,
        SensitiveCategory.TIMING,
    }
)


MNPI_CATEGORIES: frozenset[SensitiveCategory] = frozenset(
    {
        SensitiveCategory.INTERIM_RESULT,
        SensitiveCategory.AMENDMENT_RATIONALE,
        SensitiveCategory.REGULATORY_QUESTION,
    }
)


class SensitiveSpan(BaseModel):
    # A half-open [start, end) character offset tagged with its sensitivity category.
    model_config = ConfigDict(frozen=True)

    start: int = Field(ge=0)
    end: int = Field(ge=0)
    category: SensitiveCategory
    value: str

    @field_validator("end")
    @classmethod
    # Ensure end is strictly greater than start so empty spans are rejected.
    def _end_after_start(cls, v: int, info: Any) -> int:
        start = info.data.get("start")
        if start is not None and v <= start:
            raise ValueError(f"SensitiveSpan end ({v}) must be greater than start ({start}).")
        return v


class _DocumentBase(BaseModel):
    # Common fields every synthetic document carries.
    model_config = ConfigDict(arbitrary_types_allowed=True)

    doc_id: str
    text: str
    spans: list[SensitiveSpan] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SAENarrative(_DocumentBase):
    # Serious Adverse Event narrative with templated investigator disposition.
    kind: str = "sae_narrative"


class ProtocolExcerpt(_DocumentBase):
    # Protocol synopsis / eligibility / dosing / SAP excerpt.
    kind: str = "protocol_excerpt"


class MonitoringReport(_DocumentBase):
    # Clinical Research Associate site monitoring visit report.
    kind: str = "monitoring_report"


class CSRDraft(_DocumentBase):
    # Clinical Study Report draft paragraph a medical writer might revise.
    kind: str = "csr_draft"


class DocBuilder:
    """Accumulates plain text and tagged sensitive spans while tracking offsets."""

    # Initialize an empty builder with offset 0 and no spans recorded.
    def __init__(self) -> None:
        self._parts: list[str] = []
        self._spans: list[SensitiveSpan] = []
        self._offset: int = 0

    # Append a plain non-sensitive string to the document buffer.
    def add(self, s: str) -> "DocBuilder":
        self._parts.append(s)
        self._offset += len(s)
        return self

    # Append a sensitive value and record its offset as a SensitiveSpan.
    def add_span(self, value: str, category: SensitiveCategory) -> "DocBuilder":
        if not value:
            raise ValueError("DocBuilder.add_span received empty value.")
        start = self._offset
        self._parts.append(value)
        self._offset += len(value)
        self._spans.append(
            SensitiveSpan(start=start, end=self._offset, category=category, value=value)
        )
        return self

    # Return the composed text string.
    def text(self) -> str:
        return "".join(self._parts)

    # Return the list of recorded spans (copy so callers cannot mutate internal state).
    def spans(self) -> list[SensitiveSpan]:
        return list(self._spans)

    # Assert every recorded span maps back to its original value in the composed text.
    def validate_offsets(self) -> None:
        text = self.text()
        for span in self._spans:
            slice_ = text[span.start : span.end]
            if slice_ != span.value:
                raise ValueError(
                    f"DocBuilder span offset mismatch: "
                    f"text[{span.start}:{span.end}]={slice_!r} != value={span.value!r}"
                )
