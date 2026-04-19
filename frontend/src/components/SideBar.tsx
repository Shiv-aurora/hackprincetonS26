import { useEffect, useRef, useState, type ElementType, type Key as ReactKey, type MouseEvent } from "react";
import * as d3 from "d3";
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  FileText,
  FolderOpen,
  ShieldCheck,
  Route,
  Clock,
  Key,
  Server,
  Check,
  Pencil,
  Eye,
  EyeOff,
} from "lucide-react";
import type { SessionStats } from "../lib/api";
import { DEMO_FILES, MODEL_LABELS, formatFileName, type ModelId } from "../lib/demoDocument";

interface SideBarProps {
  activeTab: string;
  auditStats?: SessionStats | null;
  entityCounts?: { phi: number; ip: number; mnpi: number };
  openFiles: string[];
  activeFileName: string;
  fileRenames: Record<string, string>;
  onLoadDocument: (name: string) => void;
  onFileRename: (originalName: string, newDisplayName: string) => void;
  selectedModel: ModelId;
  onModelChange: (model: ModelId) => void;
}

export default function SideBar({
  activeTab,
  auditStats,
  entityCounts,
  openFiles,
  activeFileName,
  fileRenames,
  onLoadDocument,
  onFileRename,
  selectedModel,
  onModelChange,
}: SideBarProps) {
  if (activeTab === "VITALS") {
    return <PrivacyStatsSidebar auditStats={auditStats} entityCounts={entityCounts} />;
  }
  if (activeTab === "PHARMACY") {
    return (
      <KeyVaultSidebar
        selectedModel={selectedModel}
        onModelChange={onModelChange}
      />
    );
  }

  return (
    <RecordsSidebar
      openFiles={openFiles}
      activeFileName={activeFileName}
      fileRenames={fileRenames}
      onLoadDocument={onLoadDocument}
      onFileRename={onFileRename}
    />
  );
}

// ── RECORDS — file explorer ───────────────────────────────────────────────────

interface RecordsSidebarProps {
  openFiles: string[];
  activeFileName: string;
  fileRenames: Record<string, string>;
  onLoadDocument: (name: string) => void;
  onFileRename: (originalName: string, newDisplayName: string) => void;
}

function RecordsSidebar({
  openFiles,
  activeFileName,
  fileRenames,
  onLoadDocument,
  onFileRename,
}: RecordsSidebarProps) {
  const allFiles = Object.keys(DEMO_FILES);

  return (
    <aside className="w-72 surface-left flex flex-col shrink-0 border-r border-white/[0.05]">
      <div className="h-11 px-4 flex items-center">
        <span className="text-[10.5px] font-semibold text-[#7c7c7c] uppercase tracking-widest">
          Patient Records
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* File tree */}
        <div>
          <div className="h-6 flex items-center px-2 hover:bg-white/[0.03] cursor-pointer select-none">
            <ChevronDown size={14} className="text-[#5f6871] mr-1 shrink-0" />
            <span className="text-[10px] font-semibold text-[#7a828b] uppercase tracking-widest">
              Asclepius
            </span>
          </div>

          <div className="py-0.5">
            {allFiles.map((name) => (
              <FileItem
                key={name}
                originalName={name}
                displayName={fileRenames[name] ?? DEMO_FILES[name]?.label ?? formatFileName(name)}
                active={name === activeFileName}
                open={openFiles.includes(name)}
                onClick={() => onLoadDocument(name)}
                onRename={(newName) => onFileRename(name, newName)}
              />
            ))}

            <div className="h-6 flex items-center px-4 hover:bg-white/[0.03] cursor-pointer opacity-40">
              <ChevronRight size={14} className="text-[#5f6871] mr-1 shrink-0" />
              <FolderOpen size={13} className="text-[#5f6871] mr-2 shrink-0" />
              <span className="text-[12px] text-[#9099a2]">Audit Logs</span>
            </div>
          </div>
        </div>

        {/* Clinical context */}
        <div className="mt-3 px-2">
          <div className="h-6 flex items-center px-1 hover:bg-white/[0.03] cursor-pointer mb-2 select-none">
            <ChevronDown size={14} className="text-[#5f6871] mr-1 shrink-0" />
            <span className="text-[10px] font-semibold text-[#5f6871] uppercase tracking-widest">
              Clinical Context
            </span>
          </div>
          <div className="px-3 space-y-3 mb-4">
            {[
              { label: "Patient ID", value: "SUBJ-982-TITAN", mono: true },
              { label: "Primary Diagnosis", value: "Metastatic Gastric Cancer", mono: false },
              { label: "Enrollment Date", value: "2023-08-12", mono: true },
            ].map(({ label, value, mono }) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-[9.5px] text-[#55606a] uppercase tracking-widest">{label}</span>
                <span className={`text-[11.5px] text-[#a0a0a0] ${mono ? "font-mono" : ""}`}>{value}</span>
              </div>
            ))}
            <div className="flex flex-col gap-0.5">
              <span className="text-[9.5px] text-[#55606a] uppercase tracking-widest">Active Compound</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                <span className="px-1.5 py-0.5 bg-phi/10 text-phi text-[9px] rounded border border-phi/20">
                  BMS-986253
                </span>
                <span className="px-1.5 py-0.5 bg-[#20252b] text-[#5f6871] text-[9px] rounded border border-white/[0.05]">
                  +4 more
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.05] p-3">
        <div className="text-[9.5px] text-[#4a535c] mb-1.5 uppercase font-semibold tracking-widest">
          System Health
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
          <span className="text-[10.5px] text-[#9099a2]">Privacy Layer: Active</span>
        </div>
      </div>
    </aside>
  );
}

// ── FileItem with inline rename ───────────────────────────────────────────────

interface FileItemProps {
  key?: ReactKey;
  originalName: string;
  displayName: string;
  active: boolean;
  open: boolean;
  onClick: () => void;
  onRename: (newName: string) => void;
}

function FileItem({ originalName, displayName, active, open, onClick, onRename }: FileItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);

  const isJson = originalName.endsWith(".json");
  const isCsv = originalName.endsWith(".csv");
  const Icon: ElementType = isJson || isCsv ? FileCode : FileText;

  const startEdit = (e: MouseEvent) => {
    e.stopPropagation();
    setDraft(displayName);
    setEditing(true);
  };

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== displayName) onRename(trimmed);
    setEditing(false);
  };

  return (
    <div
      onClick={!editing ? onClick : undefined}
      className={`h-7 flex items-center px-3 gap-2 cursor-pointer group transition-colors duration-100 ${
        active
          ? "bg-[#1d2d3c] text-[#d5dbe0]"
          : "text-[#adb5bc] hover:bg-white/[0.04] hover:text-[#bbb]"
      }`}
      title={`${displayName}${active ? " (active)" : " — click to open"} · double-click to rename`}
    >
      <Icon
        size={13}
        className={`shrink-0 ${active ? "text-primary-fixed/70" : "text-[#5f6871]"}`}
      />
      {editing ? (
        <input
          autoFocus
          className="flex-1 bg-transparent text-[12px] text-[#d5dbe0] outline-none border-b border-primary-container min-w-0"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") setEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
              <span className="text-[12.5px] truncate flex-1">{displayName}</span>
          {open && !active && (
            <div className="w-1 h-1 rounded-full bg-[#555] shrink-0" title="Open" />
          )}
          {active && (
            <div className="w-1.5 h-1.5 rounded-full bg-primary-container/60 shrink-0" />
          )}
          <button
            onClick={startEdit}
            className="opacity-0 group-hover:opacity-100 text-[#5f6871] hover:text-[#d0d7de] transition-all duration-100 p-0.5 rounded shrink-0"
            title="Rename"
          >
            <Pencil size={9} />
          </button>
        </>
      )}
    </div>
  );
}

// ── VITALS — privacy session stats with D3 donut ──────────────────────────────

interface PrivacyStatsSidebarProps {
  auditStats?: SessionStats | null;
  entityCounts?: { phi: number; ip: number; mnpi: number };
}

function EntityDonut({ phi, ip, mnpi }: { phi: number; ip: number; mnpi: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const total = phi + ip + mnpi;

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const size = 100;
    const r = size / 2;

    svg.attr("width", size).attr("height", size);
    const g = svg.append("g").attr("transform", `translate(${r},${r})`);

    if (total === 0) {
      g.append("circle")
        .attr("r", r * 0.72)
        .attr("fill", "none")
        .attr("stroke", "#222")
        .attr("stroke-width", r * 0.26);
      g.append("text")
        .attr("text-anchor", "middle").attr("dy", "0.4em")
        .attr("font-size", "13").attr("fill", "#444")
        .attr("font-family", "Inter, sans-serif")
        .text("—");
      return;
    }

    const segments = [
      { value: phi, color: "#ce9178" },
      { value: ip, color: "#4fc1ff" },
      { value: mnpi, color: "#dcdcaa" },
    ].filter((d) => d.value > 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pie = d3.pie<any>().value((d) => d.value).sort(null).padAngle(0.05);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arc = d3.arc<any>().innerRadius(r * 0.56).outerRadius(r - 4);

    g.selectAll("path")
      .data(pie(segments))
      .join("path")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .attr("d", (d: any) => arc(d))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .attr("fill", (d: any) => d.data.color)
      .attr("opacity", 0.85);

    g.append("text")
      .attr("text-anchor", "middle").attr("dy", "0.35em")
      .attr("font-size", "16").attr("font-weight", "600")
      .attr("fill", "#c8c8c8").attr("font-family", "Inter, sans-serif")
      .text(String(total));
  }, [phi, ip, mnpi, total]);

  return <svg ref={svgRef} />;
}

function PrivacyStatsSidebar({ auditStats, entityCounts }: PrivacyStatsSidebarProps) {
  const phi = entityCounts?.phi ?? 0;
  const ip = entityCounts?.ip ?? 0;
  const mnpi = entityCounts?.mnpi ?? 0;

  return (
    <aside className="w-72 surface-left flex flex-col shrink-0 border-r border-white/[0.05]">
      <div className="h-11 px-4 flex items-center gap-2">
        <ShieldCheck size={12} className="text-tertiary" />
        <span className="text-[10px] font-semibold text-[#7a828b] uppercase tracking-widest">
          Privacy Monitor
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* D3 Donut chart */}
        <div className="flex flex-col items-center gap-3">
          <EntityDonut phi={phi} ip={ip} mnpi={mnpi} />
          <div className="flex items-center gap-4 text-[10.5px]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-phi inline-block" />
              <span className="text-[#7a828b]">PHI <span className="text-[#d0d7de] font-semibold tabular">{phi}</span></span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-ip inline-block" />
              <span className="text-[#7a828b]">IP <span className="text-[#d0d7de] font-semibold tabular">{ip}</span></span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-mnpi inline-block" />
              <span className="text-[#7a828b]">MNPI <span className="text-[#d0d7de] font-semibold tabular">{mnpi}</span></span>
            </span>
          </div>
        </div>

        {/* Session counters */}
        <div>
          <p className="text-[9.5px] text-[#55606a] uppercase font-semibold tracking-widest mb-3">
            Session Activity
          </p>
          <div className="space-y-2">
            {[
              { label: "Total requests", value: auditStats?.total_requests ?? 0, icon: Clock, color: undefined },
              { label: "Routed to cloud", value: auditStats?.proxied ?? 0, icon: Route, color: "text-tertiary" },
              { label: "Answered locally", value: auditStats?.local_only ?? 0, icon: Server, color: "text-ip" },
              { label: "Blocked (canary)", value: auditStats?.blocked ?? 0, icon: ShieldCheck, color: "text-error" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon size={10} className={color ?? "text-[#55606a]"} />
                  <span className="text-[11px] text-[#9099a2]">{label}</span>
                </div>
                <span className={`text-[12px] font-mono font-bold tabular ${color ?? "text-[#adb5bc]"}`}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Privacy guarantee */}
        <div className="p-3 glass rounded-lg">
          <p className="text-[9.5px] text-[#55606a] uppercase font-semibold mb-1.5 tracking-widest">
            Privacy Guarantee
          </p>
          <p className="text-[10.5px] text-[#5a5a5a] leading-relaxed">
            All requests route through the NGSP proxy layer. PHI, IP, and MNPI
            identifiers are replaced before cloud transmission.
          </p>
        </div>

        {/* DP budget */}
        <div>
          <p className="text-[9.5px] text-[#55606a] uppercase font-semibold tracking-widest mb-2">
            DP Budget (ε)
          </p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-[#5f6871]">Session cap</span>
              <span className="font-mono text-[#adb5bc] tabular">ε = 3.0</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[#5f6871]">Spent</span>
              <span className="font-mono text-tertiary tabular">ε ≈ 0.0</span>
            </div>
            <div className="h-1 bg-[#1f1f1f] rounded-full mt-1 overflow-hidden">
              <div className="h-full w-0 bg-tertiary rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── KEY VAULT — API key & model config ────────────────────────────────────────

const MODEL_ORDER: ModelId[] = ["claude-opus-4", "gpt-5", "gemini-2"];
const MODEL_NOTES: Record<ModelId, string> = {
  "claude-opus-4": "Default",
  "gpt-5": "Optional",
  "gemini-2": "Optional",
};

interface KeyVaultSidebarProps {
  selectedModel: ModelId;
  onModelChange: (model: ModelId) => void;
}

function KeyVaultSidebar({ selectedModel, onModelChange }: KeyVaultSidebarProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [connected, setConnected] = useState(false);

  const handleConnect = () => {
    if (apiKey.trim().length > 10) setConnected(true);
  };

  return (
    <aside className="w-72 surface-left flex flex-col shrink-0 border-r border-white/[0.05]">
      <div className="h-11 px-4 flex items-center gap-2">
        <Key size={12} className="text-[#5f6871]" />
        <span className="text-[10px] font-semibold text-[#7a828b] uppercase tracking-widest">
          Key Vault
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* API Key input */}
        <div>
          <p className="text-[9.5px] text-[#55606a] uppercase font-semibold tracking-widest mb-2.5">
            API Connection
          </p>
          <div className="space-y-2">
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setConnected(false); }}
                placeholder="Paste your API key…"
                className="w-full bg-[#171b20] border border-white/[0.05] rounded-lg px-3 py-2 pr-8 text-[11.5px] text-[#d5dbe0] placeholder:text-[#454d56] focus:outline-none focus:border-[#333] transition-colors duration-150"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#444] hover:text-[#adb5bc] transition-colors"
              >
                {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
            <button
              onClick={handleConnect}
              disabled={apiKey.trim().length < 10}
              className={`w-full py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-150 ${
                connected
                  ? "bg-tertiary/10 border border-tertiary/25 text-tertiary"
                  : "glass border-white/[0.05] text-[#adb5bc] hover:text-[#c8c8c8] hover:border-[#333] disabled:opacity-30 disabled:cursor-not-allowed"
              }`}
            >
              {connected ? (
                <span className="flex items-center justify-center gap-1.5">
                  <Check size={11} /> Connected
                </span>
              ) : (
                "Connect"
              )}
            </button>
          </div>
          <p className="text-[9.5px] text-[#454d56] mt-1.5 leading-relaxed">
            Keys are stored in memory only and never persisted.
          </p>
        </div>

        {/* Model selector */}
        <div>
          <p className="text-[9.5px] text-[#55606a] uppercase font-semibold tracking-widest mb-2">
            AI Model
          </p>
          <div className="space-y-1.5">
            {MODEL_ORDER.map((id) => {
              const active = selectedModel === id;
              return (
                <button
                  key={id}
                  onClick={() => onModelChange(id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all duration-150 ${
                    active
                      ? "border-tertiary/25 bg-tertiary/5 ring-1 ring-tertiary/10"
                      : "border-white/[0.05] bg-transparent hover:border-[#333] hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className={`text-[11.5px] font-medium ${active ? "text-[#c8c8c8]" : "text-[#9099a2]"}`}>
                      {MODEL_LABELS[id]}
                    </span>
                    <span className={`text-[9px] ${active ? "text-tertiary/70" : "text-[#4a535c]"}`}>
                      {MODEL_NOTES[id]}
                    </span>
                  </div>
                  {active && <Check size={12} className="text-tertiary shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Privacy note */}
        <div className="p-3 glass rounded-lg">
          <p className="text-[9.5px] text-[#55606a] uppercase font-semibold mb-1.5 tracking-widest">
            Privacy Mode
          </p>
          <p className="text-[10.5px] text-[#5a5a5a] leading-relaxed">
            Running in offline demo mode. All sensitive identifiers are proxied — no raw clinical data reaches any external service.
          </p>
        </div>
      </div>
    </aside>
  );
}
