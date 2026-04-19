import { Layout, MoreHorizontal, X, Minus, Square, ShieldCheck } from "lucide-react";
import type { EntityItem, SessionStats } from "../lib/api";
import { DEMO_FILES, formatFileName } from "../lib/demoDocument";

interface TitleBarProps {
  entities?: EntityItem[];
  auditStats?: SessionStats | null;
  activeFileName?: string;
  fileRenames?: Record<string, string>;
}

export default function TitleBar({ entities = [], auditStats, activeFileName = "", fileRenames = {} }: TitleBarProps) {
  const phiCount = entities.filter((e) => e.category === "phi").length;
  const ipCount = entities.filter((e) => e.category === "ip").length;
  const mnpiCount = entities.filter((e) => e.category === "mnpi").length;
  const totalEntities = entities.length;

  const displayLabel = fileRenames[activeFileName]
    ?? DEMO_FILES[activeFileName]?.label
    ?? formatFileName(activeFileName)
    ?? "Untitled";

  return (
    <header className="h-8 bg-[#111111] flex items-center justify-between px-3 z-50 shrink-0 border-b border-vscode-border select-none">
      {/* Left: app icon + menu */}
      <div className="flex items-center gap-4 h-full">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-primary-container rounded-[4px] flex items-center justify-center">
            <Layout size={9} className="text-white" />
          </div>
          <div className="flex items-center gap-3 text-[11.5px] text-[#555]">
            {["File", "Edit", "View", "Go"].map((item) => (
              <span key={item} className="hover:text-[#aaa] cursor-pointer transition-colors duration-100">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Center: window title */}
      <div className="flex-1 flex justify-center h-full items-center">
        <div className="glass px-3 py-0.5 rounded-md text-[11px] text-[#888] flex items-center gap-2 hover:text-[#bbb] cursor-default transition-colors duration-150">
          <span className="text-[#666]">Sovereign OS</span>
          <span className="text-[#2e2e2e]">—</span>
          <span>{displayLabel}</span>
        </div>
      </div>

      {/* Right: privacy pill + window controls */}
      <div className="flex items-center gap-3 h-full">
        {totalEntities > 0 && (
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md glass text-[9.5px] font-mono tabular"
            title={
              auditStats
                ? `${auditStats.total_requests} requests · ${auditStats.proxied} proxied`
                : "Entity counts for loaded document"
            }
          >
            <ShieldCheck size={9} className="text-tertiary/70" />
            <span className="text-phi">{phiCount}</span>
            <span className="text-[#2e2e2e]">·</span>
            <span className="text-ip">{ipCount}</span>
            <span className="text-[#2e2e2e]">·</span>
            <span className="text-mnpi">{mnpiCount}</span>
            {auditStats && auditStats.total_requests > 0 && (
              <>
                <span className="text-[#2e2e2e]">·</span>
                <span className="text-[#555]">{auditStats.total_requests}</span>
              </>
            )}
          </div>
        )}

        <button className="text-[#666] hover:text-[#ccc] p-1.5 rounded transition-colors duration-100">
          <MoreHorizontal size={13} />
        </button>

        <div className="flex items-center">
          <button className="text-[#555] hover:bg-white/8 px-3 h-full transition-colors duration-100">
            <Minus size={13} />
          </button>
          <button className="text-[#555] hover:bg-white/8 px-3 h-full transition-colors duration-100">
            <Square size={11} />
          </button>
          <button className="text-[#555] hover:bg-[#e81123] hover:text-white px-3 h-full transition-colors duration-100">
            <X size={13} />
          </button>
        </div>
      </div>
    </header>
  );
}
