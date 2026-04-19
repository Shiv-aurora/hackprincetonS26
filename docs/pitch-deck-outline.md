# Pitch Deck Outline — NGSP

6–8 slides. Each slide has one job. Do not exceed 25 words of body copy per slide.

---

## Slide 1 — Title

**NGSP: Privacy-Preserving LLM Routing for Clinical Trials**

Subline: *A local privacy proxy that lets clinical staff use AI safely.*

HackPrinceton S26 · Regeneron Clinical Trials Track · Alignment & Safety Track

---

## Slide 2 — Problem

**"They're pasting patient data into ChatGPT."**

Body (max 3 bullets):
- Every paste is a potential HIPAA incident + Regulation FD violation.
- DLP blocks destroy utility. BAA wrappers shift liability. Neither stops the leak.
- No tool today lets a CRA get ICH E2B help without exposing PHI, compound codes, and preliminary efficacy data to a cloud provider.

Visual: screenshot of the demo app's "What would have leaked" banner (6 PHI · 9 IP · 5 MNPI).

---

## Slide 3 — Solution (Product Screenshot)

**One proxy layer. Three routing paths. Zero raw PHI leaves the device.**

Visual: full-screen screenshot of the running app showing:
- Left pane: SAE narrative with color-coded highlights (red=PHI, blue=IP, yellow=MNPI)
- Right pane: proxy text with `<COMPOUND_1>`, `<SUBJECT_1>` placeholders
- Chat panel: rehydrated ICH E2B response

Caption: *The cloud model never sees the real values. They're restored locally after the response.*

---

## Slide 4 — Architecture

**Local first. Cloud only gets the abstract.**

ASCII diagram (simplified from paper §2):

```
User input → Safe Harbor Stripper → Router
                                       ├── Abstract path  → Query Synthesizer → Anthropic API
                                       ├── DP path        → Noisy Encoder → Anthropic API
                                       └── Local path     → Local LLM (no cloud call)
                                                                    ↓
                                                        Answer Applier (rehydrate locally)
```

One-liner per component. Emphasize: entity_map never leaves device.

---

## Slide 5 — Results

**86% utility. 0–20% leak rate on the abstract path.**

Two columns:

| Metric | Result |
|--------|--------|
| Task utility (ICH E2B reformatting) | **86.0%** (target: 85%) |
| Verbatim leak — abstract path | **0–20%** |
| Verbatim leak — dp_tolerant path | **50–87%** ← negative result |
| Expert Determination threshold | 9% |
| Documents covered without cloud call | **4%** (local-only) |

Insert `figures/leak_rate_comparison.png` as the hero chart.

Key callout: *"The DP bottleneck math is correct. The greedy decoder discards the noise. That's the finding — and the roadmap."*

---

## Slide 6 — Competitive / Why This Is Hard

**2×2: Privacy vs Utility**

|                  | Low Privacy     | High Privacy       |
|------------------|-----------------|--------------------|
| **High Utility** | ❌ Raw ChatGPT  | ✅ NGSP (abstract) |
| **Low Utility**  | 🚫 (no product) | ❌ Full redaction  |

Bullets:
- Regex redaction: high privacy, low utility (destroys context).
- Raw LLM: high utility, zero privacy.
- NGSP abstract path: high utility, sub-threshold leak rate — **the viable quadrant**.

---

## Slide 7 — Ask / Future Work

**What this prototype proves. What comes next.**

Proven:
- Query synthesis is a deployable privacy primitive for ~50% of clinical trial documents.
- Composing Safe Harbor + local routing + rehydration works end-to-end.

Next:
- Train a proxy decoder against the DP objective → close the dp_tolerant gap.
- Evaluate on real (de-identified) clinical corpus under BAA.
- Latency optimization for sub-3s proxy overhead.

Ask: *"We're looking for a CRO or pharma partner to run a pilot on de-identified documents."*

---

## Slide 8 — Thank You

NGSP · github.com/Shiv-aurora/hackprincetonS26

*"Clinical staff will use AI. The question is whether it leaks."*

Team · Contact
