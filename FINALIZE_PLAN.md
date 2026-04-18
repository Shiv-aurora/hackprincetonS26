# FINALIZE_PLAN.md

End-to-end plan from "Stitch mockup ready" to "hackathon submission ready." Linear, step by step. Each step is a Claude Code session with a clear handoff artifact. Do not skip steps. Do not reorder.

Context: This repo contains a research prototype (NGSP — Neural-Guided Semantic Proxy) for privacy-preserving LLM routing on clinical trial documents. Research is done. Results are in `experiments/results/`. Now we're building a product on top.

Submission targets:
- Regeneron clinical trials track (primary, $1000)
- Alignment & Safety track (secondary)
- Main hackathon prizes (stretch)

---

## Foundational rules (apply to EVERY step)

1. **Do not modify `src/ngsp/`, `src/attacks/`, `src/data/`, `experiments/`, `paper/`, or `tests/`.** These are research artifacts. Import from them. Do not touch them.
2. **If existing tests break, stop and report. Do not fix by modifying tests.**
3. **Document every file created or modified in `product-build/CHANGELOG.md`.** One line per change.
4. **Every step ends with the human reviewing before moving to the next step.** Do not auto-proceed.
5. **Commit after every step.** Message format: `[step-N] <description>`.

---

## Step 0 — Pre-flight (human, 10 minutes, before any Claude Code session)

Human does these manually before starting Claude Code:

1. Create branch `product-build` from `research-shiv`. Verify the research code is all present on this branch.
2. Export the Stitch mockup as HTML, save to `docs/stitch-mockup.html`.
3. Copy the demo SAE narrative to `docs/demo-document.md`. Use this exact content:

```
Subject 04-0023, a 68-year-old female at Site 104 (Princeton Regional Oncology), was enrolled in Study BMS-986253-301 on 14-MAR-2024. Following administration of investigational product BMS-986253 at 50mg on study day 1, the subject developed Grade 4 thrombocytopenia (platelet count 18,000/µL) on study day 14. Per protocol Amendment 4, dose was reduced from 50mg to 25mg cohort-wide due to this safety signal. Preliminary efficacy analysis in cohort 2 showed 34% ORR, below the 45% target, which was discussed in the DSMB meeting on 22-APR-2024.
```

4. Verify `pytest -q` still passes on this branch. Should show `57 passed, 3 skipped`.

---

## Step 1 — Repo restructuring

**Goal:** Professional repo structure with clean separation of research, backend, and frontend.

**Target structure:**

```
/
├── src/ngsp/                    # research code, UNCHANGED
├── src/attacks/                 # research code, UNCHANGED
├── src/data/                    # synthetic corpus, UNCHANGED
├── tests/                       # existing tests, UNCHANGED
├── experiments/                 # research experiments, UNCHANGED
├── paper/                       # research writeup, UNCHANGED
├── backend/                     # NEW - FastAPI server
│   ├── main.py
│   ├── schemas.py
│   ├── tests/
│   └── README.md
├── frontend/                    # NEW - Next.js app
│   └── [standard next.js layout]
├── docs/
│   ├── stitch-mockup.html       # visual reference (from human)
│   ├── demo-document.md         # demo SAE narrative (from human)
│   └── architecture.md          # NEW - system diagram in prose
├── product-build/
│   └── CHANGELOG.md             # NEW - track every product build change
├── scripts/                     # existing
├── CLAUDE.md                    # UPDATE - add product build context
├── README.md                    # UPDATE - full project overview
├── pyproject.toml               # UPDATE - add fastapi, uvicorn, httpx deps
└── .env.example                 # UPDATE - add BACKEND_PORT, NEXT_PUBLIC_API_URL
```

**Tasks:**

1. Create the new folders: `backend/`, `frontend/` (leave empty for now), `docs/`, `product-build/`.
2. Initialize `product-build/CHANGELOG.md` with a header and today's date.
3. Update `pyproject.toml`: add `fastapi`, `uvicorn[standard]`, `httpx` to main deps (not dev deps — the backend is production code). Pin versions.
4. Update `.env.example`: add `BACKEND_PORT=8000`, `NEXT_PUBLIC_API_URL=http://localhost:8000`.
5. Create `docs/architecture.md` with a one-page prose description of the system: research pipeline → backend wrapper → frontend. Explain what's in `src/ngsp/` (the pipeline, unchanged), what's in `backend/` (FastAPI HTTP layer), what's in `frontend/` (Next.js UI). Include a simple ASCII diagram showing the data flow.
6. Update `CLAUDE.md`: add a new section "Product Build Phase" that states the rules above (do not touch research code, separation of concerns, etc.).
7. Update top-level `README.md`: brief project description, how to run tests, how to run experiments, placeholder for "how to run the app" (to be filled in Step 3).

**Validation:**
- `pytest -q` still passes (57 passed, 3 skipped).
- `pip install -e .` succeeds with new deps.
- All new folders exist.

**Deliverable:** Clean repo structure, ready for backend and frontend to be scaffolded.

---

## Step 2 — Backend scaffold

**Goal:** FastAPI server wrapping the NGSP pipeline with 5 REST endpoints.

**Endpoints:**

### `POST /api/analyze`
- **Input:** `{"text": "<document text>"}`
- **Output:** `{"entities": [{"text": "...", "category": "phi|ip|mnpi", "subcategory": "name|date|compound_code|...", "start": 0, "end": 10, "placeholder": "<SUBJECT_1>"}], "counts": {"phi": 8, "ip": 5, "mnpi": 3}}`
- **Implementation:** call `strip_safe_harbor()` and `extract_quasi_identifiers()` from the pipeline. Map the spans to the three-tier category system (PHI/IP/MNPI). Map Safe Harbor categories to PHI. Map compound_code, site_id, dose, indication, ae_grade, timing to IP. Map efficacy_value, amendment_rationale, regulatory_question, interim_result to MNPI.

### `POST /api/proxy`
- **Input:** `{"text": "<document text>"}`
- **Output:** `{"original": "...", "proxy": "...", "entity_map": {"<SUBJECT_1>": "Subject 04-0023", ...}, "position_mapping": [{"original_start": 0, "original_end": 12, "proxy_start": 0, "proxy_end": 11, "placeholder": "<SUBJECT_1>"}]}`
- **Implementation:** run the full strip + substitute pipeline, return both texts plus the mapping. The `position_mapping` field is critical for the UI's synchronized highlighting.

### `POST /api/route`
- **Input:** `{"text": "<stripped text>", "spans": [...]}`
- **Output:** `{"path": "abstract_extractable|dp_tolerant|local_only", "rationale": "..."}`
- **Implementation:** call `route()` from the pipeline.

### `POST /api/complete`
- **Input:** `{"document": "...", "prompt": "...", "model": "claude-opus-4|gpt-5|gemini-2"}`
- **Output:** `{"routing": {"path": "...", "rationale": "..."}, "proxy_sent": "...", "response_raw": "...", "response_rehydrated": "...", "entities_proxied": 12, "entities_blocked": 0, "audit_id": "uuid"}`
- **Implementation:** the main endpoint the chat calls. Runs the full pipeline. In offline mode (default), return a mock response that references the proxy placeholders, then show rehydration. In online mode (if a real `ANTHROPIC_API_KEY` is set), call the real API.

### `GET /api/audit`
- **Input:** none
- **Output:** `{"session_stats": {"total_requests": 47, "proxied": 12, "local_only": 3, "blocked": 0}, "log": [{"audit_id": "...", "timestamp": "...", "route": "...", "entities_count": 12, "blocked": false}]}`
- **Implementation:** in-memory list of all requests since server started. No database. Reset on restart.

**Required features:**

1. CORS middleware allowing `http://localhost:3000`.
2. Offline/online mode flag based on whether `ANTHROPIC_API_KEY` is `sk-ant-mock` or real.
3. In offline mode: when `/api/complete` is called, return a canned response that looks realistic for the demo. Specifically, for the demo SAE narrative + "rewrite for ICH E2B format" prompt, return a properly formatted ICH E2B narrative mentioning the proxy placeholders that then get rehydrated.
4. Pydantic models in `backend/schemas.py` for all request/response shapes.
5. Health check at `GET /api/health`.
6. Server runs with `uvicorn backend.main:app --reload --port 8000`.

**Tests in `backend/tests/`:**
- `test_analyze.py` — POST the demo document, assert we get >= 10 entities and all three tiers are present.
- `test_proxy.py` — POST the demo document, assert proxy is different from original, entity_map is non-empty.
- `test_route.py` — POST stripped text, assert path is one of the three valid values.
- `test_complete.py` — POST a full request, assert response has all required fields.
- `test_audit.py` — hit GET after making requests, assert log length increases.

**Validation:**
- `pytest backend/tests -q` passes.
- `uvicorn backend.main:app --port 8000` starts without errors.
- `curl http://localhost:8000/api/health` returns 200.
- `curl -X POST http://localhost:8000/api/analyze -H "Content-Type: application/json" -d '{"text":"Subject 04-0023..."}'` returns entities.

**Deliverable:** Working backend, tested, starts cleanly.

---

## Step 3 — Frontend scaffold from Stitch mockup

**Goal:** Next.js app that visually matches the Stitch mockup, wired to the backend, runs on localhost:3000.

**CRITICAL INSTRUCTION TO CLAUDE CODE FOR THIS STEP:**

> Do not redesign the UI. Do not rearrange the layout. Do not substitute different components. The Stitch mockup in `docs/stitch-mockup.html` is the visual target. Replicate it in Next.js using Tailwind CSS. Every visual element — colors, typography, spacing, panel proportions, the privacy pill, the split view, the chat panel, the legend, the bottom bar — should match the mockup. If you are uncertain, choose the option closer to the mockup. Do not add features not shown in the mockup. Do not remove elements shown in the mockup.

**Build order (strict):**

1. `cd frontend && npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*"`. Use app router.
2. Install additional deps: `lucide-react` for icons, `clsx` and `tailwind-merge` for conditional classes. No UI library (no shadcn, no Material, no Chakra) — the Stitch mockup has its own aesthetic, bringing in a component library will fight it.
3. Configure Tailwind with the exact color palette from the Stitch mockup. Extract the hex codes from the HTML and add them as custom colors in `tailwind.config.ts`.
4. Build `app/page.tsx` as the single main page. Structure:
   - Top bar component (app name, document name, privacy pill, settings)
   - Three-pane main area:
     - Document pane (left) — `components/DocumentPane.tsx`
     - Proxy pane (middle) — `components/ProxyPane.tsx`
     - Chat pane (right) — `components/ChatPane.tsx`
   - Bottom bar (legend, Original/Proxy toggle)
5. On page load: fetch `/api/analyze` for the demo document, render entities with colored underlines. Also fetch `/api/proxy`, render proxy text with placeholders.
6. Implement synchronized highlighting: when hovering an entity in the document pane, the corresponding placeholder in the proxy pane highlights, and vice versa. Use a shared state (React context or prop drilling) to track the hovered entity id.
7. Wire up the chat input: on "Send" click, POST to `/api/complete`, show the routing indicator, stream the response character by character (or chunk by chunk), animate the "rehydrating N/M entities" state.
8. Wire up the privacy pill in the top bar to reflect session stats from `/api/audit`. Poll every 5 seconds or refresh after each request.

**State management:** React useState + useContext is enough. Do not bring in Redux, Zustand, or similar. This is a single-page app with minimal state.

**API client:** Create `lib/api.ts` with typed functions for each endpoint. Use the native `fetch` API.

**Demo data:** On first page load, the document pane should be pre-populated with `docs/demo-document.md` content. Fetch it via a Next.js API route or import it as a static string.

**Error handling:** If the backend is down, show a clear error state with "Backend not running. Start with: `uvicorn backend.main:app --port 8000`". Do not crash.

**Validation:**
- `npm run dev` starts the frontend on localhost:3000.
- Opening localhost:3000 in a browser shows the UI visually matching the Stitch mockup.
- The demo document is pre-loaded and entities are underlined in three colors.
- Hovering an entity in the document pane highlights its proxy counterpart.
- Clicking Send in the chat area actually calls the backend and shows a response.
- No console errors.

**Deliverable:** Working frontend that looks like the Stitch mockup and talks to the backend.

---

## Step 4 — UX cleanup pass

**Goal:** Fix the gap between "Stitch mockup translated to code" and "actually usable demo product." Claude Code acts as product designer here.

**CRITICAL INSTRUCTION TO CLAUDE CODE FOR THIS STEP:**

> The Stitch mockup is a starting point but has UX gaps. Do not redesign the visual aesthetic — keep colors, typography, and overall layout exactly as they are. Only fix interaction and clarity issues. For every change, justify it in one sentence in `product-build/CHANGELOG.md`.

**Specific tasks:**

1. **Audit every button and control.** For each clickable element in the UI, determine: (a) wire to real functionality, (b) remove if unused, (c) keep as visual element but add tooltip "Production feature." List decisions in CHANGELOG.
2. **Left rail icons.** The Stitch mockup has 4 mystery icons on the far left. Either: give them real function (e.g., document mode / audit log mode / settings), or remove them. Do not leave them as mystery icons.
3. **Rename developer-ese labels to writer-friendly labels:**
   - "SOURCE_TEXT" → "Original"
   - "PROXIED_OUTPUT" → "Safe Version"
   - "PROTOCOL ASSISTANT" → "AI Assistant"
   - "DOCUMENT ANALYSIS MATRIX" → "Document"
   - Keep placeholder tokens like `<SUBJECT_1>` in monospace — those are intentionally technical.
4. **Standardize placeholder naming.** Make sure every placeholder follows `<CATEGORY_N>` pattern. Short, consistent, numbered. Update the backend proxy logic if needed.
5. **Add the dp_tolerant warning state.** When the router returns `dp_tolerant`, the chat input area shows a warning banner: "This request contains content that can't be safely abstracted. [Process locally] [Edit request]" with the Send button disabled. This is the Option A UX decision from earlier. Must be implemented.
6. **Add the "What would have leaked" banner.** Above the document pane, show a non-intrusive banner: "If you pasted this into ChatGPT directly, N sensitive items would be exposed: X PHI, Y IP, Z MNPI." Clickable to show details. This is the visceral pitch moment.
7. **Loading states.** Every async action (analyze, proxy, complete) should have a loading state. No frozen UI.
8. **Empty states.** If the chat has no messages, show helpful hint text: "Try: Rewrite this in ICH E2B format" or similar.
9. **Keyboard shortcut.** Cmd+Enter to send from chat input.
10. **Don't touch the color palette, typography, or panel proportions.** Those are the Stitch design and stay as-is.

**Validation:**
- Every button does something (real or "coming in production").
- No mystery icons.
- Labels are writer-friendly, not developer-ese.
- dp_tolerant warning state renders when triggered.
- "What would have leaked" banner is visible on page load.

**Deliverable:** Usable, professional-feeling demo product.

---

## Step 5 — Demo script rehearsal support

**Goal:** Make sure the demo runs reliably, end to end, every time.

**Tasks:**

1. Add a `scripts/demo.sh` that:
   - Starts the backend on port 8000 in the background
   - Waits for health check to pass
   - Starts the frontend on port 3000
   - Opens localhost:3000 in the default browser
   - Traps Ctrl+C to kill both processes cleanly
2. Add a `scripts/reset-demo.sh` that clears the audit log via a backend endpoint (add a `POST /api/audit/reset` for this purpose). Lets you run the demo multiple times without stale data.
3. Add `docs/demo-script.md` — the exact beats of the 60-second demo:
   - 0:00–0:20 — Open with analogy, point at SAE narrative on screen
   - 0:20–0:40 — Click Send on pre-filled prompt "Rewrite this in ICH E2B format", narrate routing and proxy transformation
   - 0:40–0:55 — Show results slide (attack leak rate chart, routing distribution)
   - 0:55–1:00 — Close line
4. Pre-fill the chat input with the demo prompt so the demo flows without typing.
5. Add a "demo mode" flag (env var or URL param) that pre-loads the demo document and pre-fills the chat input automatically.

**Validation:**
- `./scripts/demo.sh` runs the whole demo stack with one command.
- Demo runs end-to-end in under 90 seconds without any manual intervention besides clicking Send.

**Deliverable:** Demo is reproducible on any machine with one command.

---

## Step 6 — Pitch deck + writeup

**Goal:** Materials judges see outside the demo itself.

Human does most of this with Claude as writer. Claude Code's only role: generate the charts from experiment results.

**Tasks:**

1. Claude Code: generate `paper/figures/attack_leak_rates.png` — bar chart showing leak rate per category, with abstract_extractable vs dp_tolerant bars side by side. Use the data in `experiments/results/attack_results.json`.
2. Claude Code: generate `paper/figures/routing_distribution.png` — stacked bar chart of routing decisions by document type. Use data from `experiments/results/route_distribution.json`.
3. Claude Code: generate `paper/figures/leak_rate_comparison.png` — single chart showing "leak rate with direct LLM usage (estimated from dp_tolerant baseline)" vs "leak rate with NGSP routing" for each category. This is the pitch's hero chart.
4. Human (with Claude as writer): draft `paper/paper.md` — the writeup for the Alignment track. Sections: Abstract, Problem, System Design, Methodology, Results, Limitations, Future Work. 3-5 pages.
5. Human (with Claude as writer): draft `docs/pitch-deck-outline.md` — slide-by-slide outline. 6-8 slides max: Problem (with analogy), Solution (product screenshot), Architecture (1 diagram), Results (1 chart), Competitive (2x2), Ask/Future. Plus title and thank-you slides.
6. Human: build the actual slide deck in Keynote/PowerPoint/Figma from the outline. Not Claude Code's job.

**Validation:**
- Three figures render and look good (check them in an image viewer).
- Writeup is 3-5 pages and covers all required sections.
- Pitch deck outline is one page, scannable.

**Deliverable:** Writeup submittable to Alignment track, deck ready to present.

---

## Step 7 — README and repo polish

**Goal:** A judge who clones the repo can understand what this is in 30 seconds and run it in 5 minutes.

**Tasks:**

1. Rewrite top-level `README.md`. Structure:
   - Project name + one-line description
   - Screenshot of the app (grab from running demo)
   - Problem statement (3 sentences)
   - What's in this repo (pipeline, backend, frontend, research)
   - Quick start: `./scripts/demo.sh`
   - Research results summary with link to `paper/paper.md`
   - Links to experiment results
   - Credits / team
2. Write `frontend/README.md` — how to run frontend only.
3. Write `backend/README.md` — how to run backend only, API endpoint documentation.
4. Clean up `CLAUDE.md` if it's gotten cluttered across sessions. One cohesive document.
5. Add a `LICENSE` if not present. MIT or similar.
6. Remove any dead code, commented-out experiments, or `.DS_Store` files.
7. Make sure `.gitignore` covers `.env`, `node_modules`, `__pycache__`, `.next/`, `*.pyc`.

**Validation:**
- A stranger can clone, follow README, and get to a working demo in under 5 minutes.
- `pytest -q` passes.
- `./scripts/demo.sh` works.
- No secrets committed (grep for `sk-ant-`, `hf_` patterns in tracked files).

**Deliverable:** Clean, submittable repo.

---

## Step 8 — Final integration test + submission

**Goal:** Everything works together, nothing is broken, submit.

**Tasks:**

1. Fresh clone test: clone the repo to a new directory, follow README quick start, confirm demo runs. Do this on your actual demo machine if possible.
2. Run through the 60-second demo script 3 times, timing each run. Target under 70 seconds each.
3. Take the submission screenshot/video if required by the hackathon submission form.
4. Verify the submission form requirements:
   - GitHub repo URL (make public if not already)
   - Writeup PDF or link
   - Demo video (if required)
   - Team info
5. Submit to Regeneron track with pitch emphasizing clinical trials specificity.
6. Submit to Alignment track with pitch emphasizing research methodology and null finding.
7. Submit to main hackathon if separate.

**Validation:**
- Hackathon submission form confirmed.
- Repo is public.
- Writeup is accessible.
- Demo runs reproducibly.

**Deliverable:** Submission complete.

---

## Time budget (rough)

- Step 0: 10 min (human)
- Step 1: 30 min (Claude Code)
- Step 2: 90 min (Claude Code)
- Step 3: 180 min (Claude Code)
- Step 4: 90 min (Claude Code)
- Step 5: 45 min (Claude Code + human)
- Step 6: 180 min (human + Claude as writer + Claude Code for charts)
- Step 7: 45 min (Claude Code)
- Step 8: 60 min (human)

**Total:** ~12 hours focused work. Budget 15-18 hours with inevitable debugging and integration issues.

---

## Rules for human reviewer (you) between steps

Between each step, before approving the next:

1. Did Claude Code do what was asked, or did it scope-creep?
2. Does the validation criterion actually pass, or is it being claimed to pass?
3. Are tests still green?
4. Is CHANGELOG.md updated?
5. Does the commit message reflect what was done?

If any answer is no, do not proceed. Fix first.

---

## When things go wrong

- **Backend fails to start:** check `.env` is present, check `pip install -e .` was run after `pyproject.toml` change, check port 8000 is free.
- **Frontend can't reach backend:** check CORS, check `NEXT_PUBLIC_API_URL`, check both servers running.
- **Pipeline errors in backend:** do not modify `src/ngsp`. The error is in how the backend is calling it. Fix the backend wrapper.
- **UI doesn't match mockup:** pull Claude Code back to the mockup. "Redo this component to match `docs/stitch-mockup.html` exactly. Do not redesign."
- **Running out of time:** cut Step 5 (keep manual demo startup), cut Step 6 figures (use screenshots of numbers), never cut Step 7 README (judges clone the repo).

---

END OF PLAN.
