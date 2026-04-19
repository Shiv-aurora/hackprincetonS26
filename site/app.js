const scenarios = [
  {
    id: "sae",
    label: "SAE Narrative Draft",
    subtitle: "DP bottleneck path",
    routeTitle: "DP bottleneck",
    routeText:
      "This task needs the event content preserved, but not in raw form. NGSP sends a privacy-processed semantic proxy instead of the original narrative.",
    original:
      "Patient John Doe (DOB 04/12/1975), a 48-year-old male enrolled in the phase III trial for Project Titan at Massachusetts General Hospital, presented on October 15, 2023 with severe abdominal pain. The subject had been receiving BMS-986253 at 10mg/kg bi-weekly. Initial labs showed ALT 450 U/L and AST 380 U/L. Dr. Sarah Jenkins assessed the event as possibly related to the study drug and initiated protocol T-889-Alpha unblinding procedures. Note: if confirmed, Q4 earnings for the gastro-oncology portfolio may be delayed.",
    proxy:
      "A 48-year-old male enrolled in a phase III oncology study presented with severe abdominal pain after treatment exposure. Laboratory findings showed marked transaminitis, and the investigator assessed the event as possibly treatment related. Unblinding procedures were initiated under the relevant study protocol. Summarize the event timeline, clinical severity, and operational implications in a concise safety-facing narrative.",
    response: [
      "Timeline extracted successfully.",
      "Subject presented with severe abdominal pain after ongoing study treatment exposure.",
      "Laboratory findings were notable for significantly elevated liver enzymes.",
      "The investigator assessed the event as possibly treatment related and initiated unblinding procedures."
    ],
    ledger: [
      ["Safe Harbor spans", "5 stripped locally"],
      ["Quasi-identifiers", "4 abstracted or noised"],
      ["Epsilon spent", "0.62 / 3.00"],
      ["Cloud exposure", "No raw identifiers"]
    ]
  },
  {
    id: "monitoring",
    label: "Monitoring Visit Note",
    subtitle: "Abstract path",
    routeTitle: "Abstract query synthesis",
    routeText:
      "The task intent can be preserved without sending site-specific or investigator-specific content. NGSP synthesizes a generic operational prompt.",
    original:
      "Site 207 under Dr. Evelyn Park has 40% screen failures, delayed CRF entry, and unresolved deviation follow-up. Draft an email asking the site to improve enrollment discipline and documentation turnaround before the next monitoring visit.",
    proxy:
      "Draft a concise, professional site-management email requesting improved documentation timeliness, better enrollment discipline, and prompt deviation follow-up before the next monitoring cycle.",
    response: [
      "Subject: Follow-up on enrollment discipline and documentation readiness",
      "Please prioritize timely CRF completion, closer screening-to-enrollment alignment, and prompt resolution of outstanding deviations ahead of the next monitoring cycle.",
      "Thank you for your support in stabilizing these operational items."
    ],
    ledger: [
      ["Safe Harbor spans", "1 stripped locally"],
      ["Quasi-identifiers", "2 generalized"],
      ["Epsilon spent", "0.00 / 3.00"],
      ["Cloud exposure", "Generic workflow request only"]
    ]
  },
  {
    id: "protocol",
    label: "Protocol Amendment",
    subtitle: "Local-only path",
    routeTitle: "Local only",
    routeText:
      "The task depends directly on compound-specific protocol and regulatory content. NGSP keeps the entire request on device.",
    original:
      "Amendment 4 reduces dose from 50mg to 25mg for cohort 2 after a neutropenia signal observed in patients exposed to SYN-4481. The team is preparing language for the Day 120 agency response and needs to explain whether the compound-specific safety trend justifies eligibility tightening.",
    proxy:
      "No outbound proxy generated. This request remains local because the task and the sensitive study content are inseparable.",
    response: [
      "Local-only handling enforced.",
      "Recommended response structure: background, observed signal, dose modification rationale, eligibility implications, residual uncertainty."
    ],
    ledger: [
      ["Safe Harbor spans", "0 stripped"],
      ["Quasi-identifiers", "3 retained locally"],
      ["Epsilon spent", "0.00 / 3.00"],
      ["Cloud exposure", "None"]
    ]
  }
];

const scenarioList = document.getElementById("scenario-list");
const routeBanner = document.getElementById("route-banner");
const originalText = document.getElementById("original-text");
const proxyText = document.getElementById("proxy-text");
const assistantResponse = document.getElementById("assistant-response");
const privacyLedger = document.getElementById("privacy-ledger");

let activeScenario = scenarios[0];

function renderScenarioButtons() {
  scenarioList.innerHTML = "";

  scenarios.forEach((scenario) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      scenario.id === activeScenario.id
        ? "scenario-button scenario-button-active"
        : "scenario-button";

    button.innerHTML = `
      <strong>${scenario.label}</strong>
      <span>${scenario.subtitle}</span>
    `;

    button.addEventListener("click", () => {
      activeScenario = scenario;
      render();
    });

    scenarioList.appendChild(button);
  });
}

function renderActiveScenario() {
  routeBanner.innerHTML = `
    <strong>${activeScenario.routeTitle}</strong>
    <p>${activeScenario.routeText}</p>
  `;

  originalText.textContent = activeScenario.original;
  proxyText.textContent = activeScenario.proxy;

  assistantResponse.innerHTML = "";
  activeScenario.response.forEach((line) => {
    const item = document.createElement("div");
    item.className = "response-item";
    item.textContent = line;
    assistantResponse.appendChild(item);
  });

  privacyLedger.innerHTML = "";
  activeScenario.ledger.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "ledger-item";
    item.innerHTML = `<strong>${label}</strong><span>${value}</span>`;
    privacyLedger.appendChild(item);
  });
}

function render() {
  renderScenarioButtons();
  renderActiveScenario();
}

render();
