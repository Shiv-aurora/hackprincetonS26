# Shared fake vocabulary lists used by every synthetic generator.
# All content is clearly synthetic: no real compound codenames, no real PHI, no real sites.
from __future__ import annotations

# Fifteen fake indications blended from real therapeutic-area vocabulary.
INDICATIONS: tuple[str, ...] = (
    "metastatic hepatocellular carcinoma",
    "relapsed or refractory B-cell lymphoma",
    "moderate-to-severe plaque psoriasis",
    "refractory rheumatoid arthritis",
    "advanced non-small cell lung cancer",
    "chronic heart failure with reduced ejection fraction",
    "type 2 diabetes mellitus with cardiovascular risk",
    "idiopathic pulmonary fibrosis",
    "treatment-resistant major depressive disorder",
    "severe atopic dermatitis",
    "metastatic triple-negative breast cancer",
    "relapsed acute myeloid leukemia",
    "progressive multiple sclerosis",
    "eosinophilic esophagitis",
    "primary biliary cholangitis",
)

# Eight adverse event categories used for SAE narratives.
AE_CATEGORIES: tuple[str, ...] = (
    "febrile neutropenia",
    "grade 3 hepatotoxicity",
    "infusion-related reaction",
    "acute kidney injury",
    "pulmonary embolism",
    "cardiac arrhythmia",
    "severe hypersensitivity reaction",
    "pneumonitis",
)

# CTCAE-style grade values.
AE_GRADES: tuple[str, ...] = (
    "Grade 2",
    "Grade 3",
    "Grade 4",
)

# Greek-letter placeholder surnames make investigator names visibly synthetic.
GREEK_LETTERS: tuple[str, ...] = (
    "Alpha",
    "Beta",
    "Gamma",
    "Delta",
    "Epsilon",
    "Zeta",
    "Eta",
    "Theta",
    "Iota",
    "Kappa",
    "Lambda",
    "Mu",
    "Nu",
    "Xi",
    "Omicron",
    "Pi",
    "Rho",
    "Sigma",
    "Tau",
    "Upsilon",
    "Phi",
    "Chi",
    "Psi",
    "Omega",
)

# Obvious placeholder first names for investigator / CRA persona construction.
PLACEHOLDER_FIRSTNAMES: tuple[str, ...] = (
    "Testname",
    "Synthname",
    "Mockname",
    "Fakename",
    "Dummyname",
)

# Placeholder hospital/site names — all contain "Synthetic" or "Test" markers.
SITE_NAMES: tuple[str, ...] = (
    "Synthetic Regional Medical Center",
    "Testhaven University Hospital",
    "Mockbridge Clinical Institute",
    "Fakewood Cancer Center",
    "Dummybrook Cardiology Unit",
    "Synthville Academic Medical Center",
    "Testpoint Clinical Research Hospital",
    "Mockfield General Hospital",
    "Fakegrove Research Campus",
    "Synthbay Teaching Hospital",
)

# Placeholder city / geographic markers — all clearly made-up.
GEOGRAPHIC_SUBDIVISIONS: tuple[str, ...] = (
    "Synthville",
    "Testburg",
    "Mocktown",
    "Fakehaven",
    "Dummytown",
    "Synthpoint",
)

# Comorbidities used to pad narrative realism.
COMORBIDITIES: tuple[str, ...] = (
    "hypertension",
    "type 2 diabetes mellitus",
    "chronic kidney disease stage 3",
    "prior myocardial infarction",
    "depression",
    "obstructive sleep apnea",
    "atrial fibrillation",
    "hypothyroidism",
)

# Outcome phrases for SAE resolution.
OUTCOMES: tuple[str, ...] = (
    "resolved with sequelae",
    "resolved without sequelae",
    "ongoing at the time of this report",
    "fatal despite supportive care",
    "improved but not fully resolved",
)

# Causality assessment values per ICH E2A conventions.
CAUSALITY: tuple[str, ...] = (
    "probably",
    "possibly",
    "unlikely",
    "definitely",
    "not",
)

# Amendment rationale fragments used to create MNPI-flavored content.
AMENDMENT_RATIONALES: tuple[str, ...] = (
    "an unexpected signal in the Phase 2 interim analysis prompted tightening of cardiac eligibility",
    "a preliminary efficacy readout crossed the O'Brien-Fleming futility boundary",
    "the DMC recommended dose reduction after hepatotoxicity clustering",
    "sponsor-initiated change to the primary endpoint following a competitor's Phase 3 readout",
    "regulator feedback on the pharmacokinetic strategy required re-baselining the dosing schedule",
)

# Regulatory question fragments — clearly MNPI.
REGULATORY_QUESTIONS: tuple[str, ...] = (
    "response to the FDA Type C meeting question on exposure-response in the hepatic-impaired cohort is pending",
    "EMA requested additional biomarker stratification before unblinding the efficacy subgroup",
    "PMDA raised a concern about the hepatic safety run-in that the sponsor has not yet answered publicly",
    "a regulator question about interim efficacy remains under embargo pending the upcoming advisory committee",
)

# Interim efficacy phrases — clearly MNPI.
INTERIM_RESULTS: tuple[str, ...] = (
    "ORR of 47% in the 200mg arm versus 22% in control at the unblinded interim",
    "hazard ratio of 0.61 (95% CI 0.48-0.77) for PFS at the second interim analysis",
    "median overall survival not yet reached in the experimental arm after 14 months of follow-up",
    "a 3.8-point separation on the primary PRO endpoint at the 12-week blinded review",
)

# Protocol deviation categories used in monitoring reports.
DEVIATION_TYPES: tuple[str, ...] = (
    "inclusion/exclusion violation",
    "missed visit window",
    "out-of-range concomitant medication",
    "incorrect dose administration",
    "informed consent procedural deviation",
    "laboratory sample handling deviation",
)
