# Ensure both the repo root (for `backend` package) and src/ (for ngsp/data) are importable.
from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent.parent
_SRC = _ROOT / "src"

for _p in (_ROOT, _SRC):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

# Canonical demo SAE narrative shared by all backend tests.
DEMO_DOC = (
    "Subject 04-0023, a 68-year-old female at Site 104 (Princeton Regional Oncology), "
    "was enrolled in Study BMS-986253-301 on 14-MAR-2024. "
    "Following administration of investigational product BMS-986253 at 50mg on study day 1, "
    "the subject developed Grade 4 thrombocytopenia (platelet count 18,000/\u00b5L) on study day 14. "
    "Per protocol Amendment 4, dose was reduced from 50mg to 25mg cohort-wide due to this safety signal. "
    "Preliminary efficacy analysis in cohort 2 showed 34% ORR, below the 45% target, "
    "which was discussed in the DSMB meeting on 22-APR-2024."
)
