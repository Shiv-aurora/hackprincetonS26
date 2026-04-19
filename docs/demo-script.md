# NGSP Demo Script

Two persona flows, each under 90 seconds. Run `./scripts/reset-demo.sh` before presenting.

---

## Pre-flight checklist

1. `./scripts/reset-demo.sh` — kills prior servers, clears audit log, starts fresh stack.
2. `python scripts/seed-demo.py` — verifies all endpoints respond (takes ~5 s).
3. Open `http://localhost:3000` in a browser. Analyst persona loads by default.
4. Have the pre-staged narrative (bottom of this doc) in your clipboard.

---

## Flow 1 — Reviewer (target 88 s)

_Role: clinical safety scientist evaluating adverse event causality._

| t (s) | Action | What to say |
|-------|--------|-------------|
| 0 | Open `http://localhost:3000`. Analyst persona loads by default. | "This is NGSP — a privacy-preserving clinical trial assistant. The system runs Gemma locally as a privacy router before any data reaches the cloud." |
| 3 | Click the **RECORDS** icon at the top of the activity bar. | "Switching to the Reviewer persona — this is for clinical safety scientists evaluating adverse event causality." |
| 5 | Three panes appear: Narrative / Timeline / Signal Map. Paste the pre-staged SAE narrative (below) into the Narrative pane. | "I'm pasting a Serious Adverse Event narrative. Notice the tool never sees this text in raw form — it is immediately processed through our Safe Harbor stripper." |
| 8 | Click **Assemble Timeline**. | "The local Gemma model extracts dates, grades, and drug exposures. Only an abstract causality question goes to the cloud." |
| 22 | Timeline renders: 4 tracks + annotations + causality verdict badge. | "The cloud returns a causality verdict. The entity map is applied locally to restore site and drug names — the cloud never saw them." |
| 28 | Click the bottom dock expand handle (or press **⌘J**). | "The forensic dock shows every cloud call. Hashes only — no raw text, ever." |
| 35 | Click the **Signal Map** pane. Scatter loads with clusters. | "Signal detection clusters AE events across all cases in the study. The density algorithm runs locally — cloud only gets the abstract cluster shape." |
| 48 | Side panel shows hypothesis + recommended actions. | "Cloud-authored hypothesis, restored with local entity rehydration." |
| 55 | Click **Flag to medical monitor** chip (ExportActions row). | "One-click MCP dispatch to email. The payload is hashed in the audit log." |
| 60 | Click **Hold in calendar** chip. | "Calendar hold for the medical monitor meeting." |
| 66 | Click **File to Vault Safety** chip. | "Stub connector for the safety database — shows the integration pattern." |
| 72 | Show expanded forensic dock: 2 cloud rows + 3 MCP rows. | "Full forensic chain. ε shows 0.3 of 3.0 budget consumed." |
| 82 | Drag dock to full height. | "Every action leaves a tamper-evident hash trail." |
| 88 | End. | — |

---

## Flow 2 — Analyst (target 85 s)

_Role: data scientist running cross-trial signal analysis._

| t (s) | Action | What to say |
|-------|--------|-------------|
| 0 | Press **⌘Shift+A** (or click the **VITALS** icon). Analyst persona. | "Switching to the Analyst persona — for data scientists running cross-trial signal analysis." |
| 3 | Dataset pane on the left shows 300 synthetic subjects. | "The dataset table virtualizes 300 rows — TanStack Virtual handles this at 60 fps." |
| 6 | Filter Grade to **3**. Click Apply. | "Filtering to Grade 3+ events. The entity-highlighted cells show compound codes as underlined — click one to see the Safe Harbor placeholder." |
| 14 | Click in chat (main pane). Type: `Summarize Grade 3+ events by site for the last 30 days.` Press Enter. | "Natural-language query through the NGSP pipeline." |
| 18 | Response streams in. Bottom dock ticks. | "Safe Harbor stripping happened locally, abstract query went to cloud, response rehydrated locally with site names." |
| 30 | Click Dashboard pane (right). Type: `Compare AE rates across sites; flag sites above 2× mean.` Click **Generate**. | "Dashboard generation — the cloud receives only aggregate statistics, never raw rows." |
| 34 | Chart grid renders: stacked bar + heatmap + KPIs + narrative. | — |
| 52 | Point to the narrative summary below the charts. | "Cloud-authored narrative summary, grounded in anonymized aggregates." |
| 58 | Click **Send to CMO** chip. | "Email to stakeholder via MCP." |
| 64 | Click **Schedule stakeholder review** chip. | "Calendar via MCP." |
| 70 | Click **File to SharePoint** chip. | "SharePoint stub — shows the EDC integration pattern." |
| 76 | Press **⌘J** to expand dock. | "3 cloud rows, 3 MCP rows. ε total ≈ 0.6 / 3.0." |
| 82 | Dashboard front and center. | "Complete audit chain. Privacy budget tracked. Zero raw PHI ever left this machine." |
| 85 | End. | — |

---

## Pre-staged narrative (paste this in the Reviewer demo)

```
Patient Beta-7, 47-year-old female, enrolled at site 9001 in protocol SYN-9182-P3.
Drug: SYN-9182 50mg oral daily, initiated Day 1.
Day 5: Grade 3 maculopapular rash observed across trunk and upper extremities.
Day 10: Drug discontinued (dechallenge). Rash began resolving within 72 hours.
Day 22: Drug re-introduced at 25mg (rechallenge). Grade 2 rash recurred at Day 24.
ALT values: Day 1: 28 U/L (normal), Day 5: 78 U/L (elevated), Day 10: 45 U/L, Day 15: 31 U/L.
Concomitant medications: Acetaminophen 500mg PRN throughout.
Investigator assessment: probable drug-related adverse event per WHO-UMC criteria.
MedDRA term: Drug hypersensitivity (10013786). Site investigator: Dr. Testname Alpha.
```

---

## Fallback (if live backend is unavailable)

The app works in **offline / mock mode** — set `OPENAI_API_KEY=sk-openai-mock` (already the
`.env.example` default). The mock path returns a realistic response using actual proxy
placeholders, then rehydrates — functionally identical to the live path for demo purposes.

If the backend fails to start:

```bash
cd /path/to/repo
pip install -e .
uvicorn backend.main:app --port 8000
```

Then refresh the browser. The frontend auto-reconnects to the backend on each API call.

---

## Keyboard shortcuts quick-reference

| Shortcut | Action |
|----------|--------|
| ⌘1 / ⌘2 / ⌘3 | Focus left / main / right pane |
| ⌘J | Toggle forensic dock |
| ⌘\ | Collapse/expand left pane |
| ⌘⇧\ | Collapse/expand right pane |
| ⌘⇧P | Open view picker in focused pane |
| ⌘⇧A | Switch to Analyst persona |
| ⌘⇧R | Switch to Reviewer persona |

Full list: [`docs/shortcuts.md`](shortcuts.md)
