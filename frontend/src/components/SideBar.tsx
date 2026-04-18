import type { ElementType } from "react";
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
} from "lucide-react";
import type { SessionStats } from "../lib/api";

interface SideBarProps {
  activeTab: string;
  auditStats?: SessionStats | null;
}

export default function SideBar({ activeTab, auditStats }: SideBarProps) {
  if (activeTab === "VITALS") {
    return <PrivacyStatsSidebar auditStats={auditStats} />;
  }

  if (activeTab === "PHARMACY") {
    return <SettingsSidebar />;
  }

  // Default RECORDS view — document explorer + clinical context.
  return (
    <aside className="w-64 bg-surface-container-lowest flex flex-col shrink-0 border-r border-vscode-border">
      <div className="h-9 px-4 flex items-center justify-between">
        <span className="text-[11px] font-medium text-[#bbbbbb] uppercase tracking-wider">Explorer</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="group">
          <div className="h-6 flex items-center px-1 bg-surface-container-highest/20 cursor-pointer">
            <ChevronDown size={16} className="text-[#cccccc] mr-1" />
            <span className="text-[11px] font-bold text-[#cccccc] uppercase tracking-tighter">Sovereign_OS</span>
          </div>

          <div className="py-1">
            <FileItem name="SAE_Narrative_Draft_001.txt" icon={FileText} active />
            <FileItem name="patient_records.csv" icon={FileCode} />
            <FileItem name="extraction_rules.json" icon={FileCode} />

            <div className="h-6 flex items-center px-4 hover:bg-surface-container-high/30 cursor-pointer">
              <ChevronRight size={16} className="text-[#cccccc] mr-1" />
              <FolderOpen size={16} className="text-[#cccccc] mr-2" />
              <span className="text-[13px] text-[#cccccc]">logs</span>
            </div>
          </div>
        </div>

        <div className="mt-4 group px-1">
          <div className="h-6 flex items-center px-1 bg-surface-container-highest/20 cursor-pointer mb-2">
            <ChevronDown size={16} className="text-[#cccccc] mr-1" />
            <span className="text-[11px] font-bold text-[#cccccc] uppercase tracking-tighter">Clinical_Context</span>
          </div>
          <div className="px-4 space-y-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[#858585] uppercase">Patient ID</span>
              <span className="text-[12px] text-[#cccccc] font-mono">SUBJ-982-TITAN</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[#858585] uppercase">Primary Diagnosis</span>
              <span className="text-[12px] text-[#cccccc]">Metastatic Gastric Cancer</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[#858585] uppercase">Enrollment Date</span>
              <span className="text-[12px] text-[#cccccc] font-mono">2023-08-12</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[#858585] uppercase">Active Meds</span>
              <div className="flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 bg-phi/10 text-phi text-[9px] rounded-sm border border-phi/20">BMS-986253</span>
                <span className="px-1.5 py-0.5 bg-vscode-border text-[#cccccc] text-[9px] rounded-sm border border-vscode-border">+4 more</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-auto border-t border-vscode-border p-4 bg-surface-container-lowest/50">
        <div className="text-[10px] text-[#858585] mb-2 uppercase font-bold tracking-tight">System Health</div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-tertiary" />
          <span className="text-[11px] text-[#cccccc]">Core Node Status: Optimized</span>
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// VITALS — Privacy session stats
// ---------------------------------------------------------------------------

function PrivacyStatsSidebar({ auditStats }: { auditStats?: SessionStats | null }) {
  return (
    <aside className="w-64 bg-surface-container-lowest flex flex-col shrink-0 border-r border-vscode-border">
      <div className="h-9 px-4 flex items-center gap-2">
        <ShieldCheck size={13} className="text-tertiary" />
        <span className="text-[11px] font-medium text-[#bbbbbb] uppercase tracking-wider">
          Privacy Stats
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Session counters */}
        <div>
          <p className="text-[10px] text-[#858585] uppercase font-bold tracking-tight mb-2">
            Session Activity
          </p>
          <div className="space-y-1.5">
            {[
              { label: "Total requests", value: auditStats?.total_requests ?? 0, icon: Clock },
              { label: "Proxied to cloud", value: auditStats?.proxied ?? 0, icon: Route, color: "text-tertiary" },
              { label: "Answered locally", value: auditStats?.local_only ?? 0, icon: Server, color: "text-ip" },
              { label: "Blocked (canary)", value: auditStats?.blocked ?? 0, icon: ShieldCheck, color: "text-error" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon size={11} className={color ?? "text-[#858585]"} />
                  <span className="text-[11px] text-[#858585]">{label}</span>
                </div>
                <span className={`text-[12px] font-mono font-bold ${color ?? "text-[#cccccc]"}`}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Privacy guarantee */}
        <div className="p-3 bg-tertiary/5 border border-tertiary/20 rounded-md">
          <p className="text-[10px] text-[#858585] uppercase font-bold mb-1">Privacy Guarantee</p>
          <p className="text-[11px] text-[#858585] leading-relaxed">
            All requests route through the NGSP proxy layer. PHI, IP, and MNPI identifiers are replaced before cloud transmission and restored locally.
          </p>
        </div>

        {/* DP budget indicator */}
        <div>
          <p className="text-[10px] text-[#858585] uppercase font-bold tracking-tight mb-2">
            DP Budget (ε)
          </p>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-[#858585]">Session cap</span>
              <span className="font-mono text-[#cccccc]">ε = 3.0</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[#858585]">Spent</span>
              <span className="font-mono text-tertiary">ε ≈ 0.0</span>
            </div>
            <div className="h-1.5 bg-[#2d2d2d] rounded-full mt-1">
              <div className="h-full w-0 bg-tertiary rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// PHARMACY — Settings
// ---------------------------------------------------------------------------

function SettingsSidebar() {
  const apiKey = typeof window !== "undefined"
    ? (import.meta.env as Record<string, string | undefined>).VITE_API_URL ?? "http://localhost:8000"
    : "http://localhost:8000";

  return (
    <aside className="w-64 bg-surface-container-lowest flex flex-col shrink-0 border-r border-vscode-border">
      <div className="h-9 px-4 flex items-center gap-2">
        <Key size={13} className="text-[#858585]" />
        <span className="text-[11px] font-medium text-[#bbbbbb] uppercase tracking-wider">
          Settings
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <p className="text-[10px] text-[#858585] uppercase font-bold tracking-tight mb-2">
            Backend
          </p>
          <div className="space-y-2">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[#858585]">API URL</span>
              <span className="text-[11px] text-[#cccccc] font-mono bg-[#252526] px-2 py-1 rounded border border-vscode-border break-all">
                {apiKey}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[#858585]">Mode</span>
              <span className="text-[11px] text-mnpi font-mono bg-mnpi/5 px-2 py-1 rounded border border-mnpi/20">
                Mock (offline demo)
              </span>
            </div>
          </div>
        </div>

        <div>
          <p className="text-[10px] text-[#858585] uppercase font-bold tracking-tight mb-2">
            Model
          </p>
          <div className="space-y-1.5">
            {[
              { id: "claude-opus-4", label: "Claude Opus 4", active: true, note: "Default" },
              { id: "gemini-2", label: "Gemini 2", active: false, note: "Optional" },
              { id: "gpt-5", label: "GPT-5", active: false, note: "Optional" },
            ].map((m) => (
              <div
                key={m.id}
                className={`flex items-center justify-between px-2 py-1.5 rounded border ${
                  m.active
                    ? "border-tertiary/30 bg-tertiary/5"
                    : "border-vscode-border bg-transparent opacity-50"
                }`}
              >
                <span className={`text-[11px] font-mono ${m.active ? "text-[#cccccc]" : "text-[#858585]"}`}>
                  {m.label}
                </span>
                <span className={`text-[9px] uppercase font-bold ${m.active ? "text-tertiary" : "text-[#858585]"}`}>
                  {m.note}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 bg-[#252526] border border-vscode-border rounded-md">
          <p className="text-[10px] text-[#858585] mb-1">To enable real API calls:</p>
          <p className="text-[11px] font-mono text-[#969696]">
            Set <span className="text-phi">ANTHROPIC_API_KEY</span> in <span className="text-ip">.env</span>
          </p>
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function FileItem({ name, icon: Icon, active }: { name: string; icon: ElementType; active?: boolean }) {
  return (
    <div
      className={`h-6 flex items-center px-4 hover:bg-surface-container-high/30 cursor-pointer ${
        active ? "bg-vscode-selection/30 text-white" : "text-[#cccccc]"
      }`}
    >
      <Icon size={16} className={`${active ? "text-primary-container" : "text-[#cccccc]"} mr-2`} />
      <span className="text-[13px] truncate">{name}</span>
    </div>
  );
}
