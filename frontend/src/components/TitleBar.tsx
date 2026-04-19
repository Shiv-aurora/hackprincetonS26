import { Layout, ShieldCheck, MessageSquareText, PanelsTopLeft } from "lucide-react";
import { motion } from "framer-motion";
import type { EntityItem, SessionStats } from "../lib/api";
import { DEMO_FILES, formatFileName } from "../lib/demoDocument";

interface TitleBarProps {
  entities?: EntityItem[];
  auditStats?: SessionStats | null;
  activeFileName?: string;
  fileRenames?: Record<string, string>;
  uiMode: "work" | "chat";
  onModeChange: (mode: "work" | "chat") => void;
}

export default function TitleBar({
  entities = [],
  auditStats,
  activeFileName = "",
  fileRenames = {},
  uiMode,
  onModeChange,
}: TitleBarProps) {
  const phiCount = entities.filter((e) => e.category === "phi").length;
  const ipCount = entities.filter((e) => e.category === "ip").length;
  const mnpiCount = entities.filter((e) => e.category === "mnpi").length;

  const displayLabel = fileRenames[activeFileName]
    ?? DEMO_FILES[activeFileName]?.label
    ?? formatFileName(activeFileName)
    ?? "Untitled";

  return (
    <header className="surface-header h-14 shrink-0 border-b border-white/[0.05] px-5 md:px-6">
      <div className="flex h-full items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#13324a] text-[#d8ecff] shadow-[0_8px_24px_rgba(6,23,38,0.45)]">
            <Layout size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold tracking-[0.02em] text-white">Asclepius</div>
            <div className="truncate text-[12px] text-[#6d7680]">{displayLabel}</div>
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 justify-center lg:flex">
          <div className="truncate text-[12px] uppercase tracking-[0.18em] text-[#4b525a]">Clinical privacy workspace</div>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2 text-[12px] font-mono tabular"
            title={
              auditStats
                ? `${auditStats.total_requests} requests · ${auditStats.proxied} proxied`
                : "Entity counts for loaded document"
            }
          >
            <ShieldCheck size={16} className="text-tertiary/80" />
            <span className="text-phi">{phiCount}</span>
            <span className="text-[#2f353b]">·</span>
            <span className="text-ip">{ipCount}</span>
            <span className="text-[#2f353b]">·</span>
            <span className="text-mnpi">{mnpiCount}</span>
            {auditStats && auditStats.total_requests > 0 && (
              <>
                <span className="text-[#2f353b]">·</span>
                <span className="text-[#7b848d]">{auditStats.total_requests}</span>
              </>
            )}
          </div>

          <ModeToggle uiMode={uiMode} onModeChange={onModeChange} />
        </div>
      </div>
    </header>
  );
}

function ModeToggle({
  uiMode,
  onModeChange,
}: {
  uiMode: "work" | "chat";
  onModeChange: (mode: "work" | "chat") => void;
}) {
  const options = [
    { id: "work" as const, label: "Work", icon: PanelsTopLeft },
    { id: "chat" as const, label: "Chat", icon: MessageSquareText },
  ];

  return (
    <div className="relative flex items-center rounded-2xl border border-white/[0.06] bg-[#14181c] p-1">
      {options.map((option) => {
        const Icon = option.icon;
        const active = uiMode === option.id;
        return (
          <button
            key={option.id}
            onClick={() => onModeChange(option.id)}
            className={`relative z-10 flex min-w-[98px] items-center justify-center gap-2.5 rounded-xl px-4 py-2 text-[13px] font-medium transition-colors ${
              active ? "text-white" : "text-[#6b7178] hover:text-[#c6cbd1]"
            }`}
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                className="absolute inset-0 rounded-xl bg-[#20262d] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_20px_rgba(0,0,0,0.35)]"
                transition={{ type: "spring", stiffness: 360, damping: 30 }}
              />
            )}
            <Icon size={17} className="relative z-10" />
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
