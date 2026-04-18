# 60-Second Demo Script

**Setup before presenting:**
1. Run `./scripts/reset-demo.sh` (clears prior session data).
2. Run `./scripts/demo.sh` (starts backend + frontend, opens browser).
3. The browser opens to the app with the demo SAE narrative pre-loaded and the chat input pre-filled.

---

## Beat 1 — 0:00–0:20 — The Problem

> "Every day, clinical trial staff paste patient narratives into ChatGPT because it's faster than their sanctioned tools. This one document contains **PHI, an unpublished compound code, a dose change, and preliminary efficacy data**. You can see them highlighted here — red for patient identifiers, blue for IP, yellow for MNPI."

*Point at the "What would have leaked" banner in the document pane — it shows the count (e.g., 6 PHI · 9 IP · 5 MNPI).*

> "If this went to OpenAI raw, all of it leaks. That's a HIPAA incident and a Regulation FD violation in a single paste."

---

## Beat 2 — 0:20–0:40 — The Solution

> "NGSP sits between the user and the cloud model. Watch what it does."

*Click Send (or press ⌘↵). The chat panel shows the routing badge.*

> "The system detects MNPI — preliminary efficacy data — so it routes this through the **differential-privacy path**. The proxy pane shows exactly what leaves the machine: placeholder tokens, not raw values. `<COMPOUND_1>` instead of BMS-986253. `<EFFICACY_1>` instead of 34% ORR."

*Point at the proxy pane showing `<SUBJECT_1>`, `<COMPOUND_1>`, `<EFFICACY_1>`.*

> "The cloud model sees a structurally identical narrative with zero sensitive content. When the answer comes back, NGSP re-hydrates the placeholders locally — the user sees a clean ICH E2B rewrite with the real values restored."

*Point at the assistant response in the chat panel.*

---

## Beat 3 — 0:40–0:55 — The Research

> "This isn't just a redaction heuristic. We ran five adversarial attacks against the proxy layer — verbatim scan, semantic similarity, span inversion, membership inference — and measured leak rate versus task utility across a synthetic clinical trial corpus."

> "The abstract-extractable path holds utility above **85%** while keeping verbatim leak rate below **2%**. The DP path gives formal **(ε = 3.0, δ = 1e-5)** bounds at a utility cost of roughly 8 points — within the acceptable range for a secondary safety check."

*Optionally point at the Privacy Stats sidebar (VITALS tab) showing session counters and DP budget.*

---

## Beat 4 — 0:55–1:00 — The Close

> "One command to run, zero configuration for offline use, Anthropic API for production. The research paper, the full attack harness, and synthetic annotated corpus are all in the repo."

---

## Fallback (if live backend is unavailable)

The app works in **offline / mock mode** without any API key. The mock path returns a realistic ICH E2B narrative using the actual proxy placeholders, then rehydrates it — functionally identical to the live path for demo purposes.

If the backend fails to start:
```
cd /path/to/repo
pip install -e .
uvicorn backend.main:app --port 8000
```

Then refresh the browser.
