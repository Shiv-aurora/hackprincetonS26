import { RefreshCcw, X, FileText, ShieldAlert, ChevronDown } from "lucide-react";
import { useRef, useEffect, ReactNode, useState } from "react";
import type { EntityItem, ProxyResponse } from "../lib/api";
import { DEMO_DOCUMENT } from "../lib/demoDocument";

interface WorkspaceProps {
  syncScroll: boolean;
  onToggleSync: () => void;
  entities: EntityItem[];
  proxyData: ProxyResponse | null;
  isLoading: boolean;
  hoveredPlaceholder: string | null;
  onHoverPlaceholder: (ph: string | null) => void;
}

export default function Workspace({
  syncScroll,
  onToggleSync,
  entities,
  proxyData,
  isLoading,
  hoveredPlaceholder,
  onHoverPlaceholder,
}: WorkspaceProps) {
  const originalRef = useRef<HTMLDivElement>(null);
  const proxiedRef = useRef<HTMLDivElement>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [bannerExpanded, setBannerExpanded] = useState(false);

  useEffect(() => {
    if (!syncScroll) return;
    const original = originalRef.current;
    const proxied = proxiedRef.current;
    if (!original || !proxied) return;

    const handleOriginalScroll = () => { proxied.scrollTop = original.scrollTop; };
    const handleProxiedScroll = () => { original.scrollTop = proxied.scrollTop; };

    original.addEventListener("scroll", handleOriginalScroll);
    proxied.addEventListener("scroll", handleProxiedScroll);
    return () => {
      original.removeEventListener("scroll", handleOriginalScroll);
      proxied.removeEventListener("scroll", handleProxiedScroll);
    };
  }, [syncScroll]);

  const text = proxyData?.original ?? DEMO_DOCUMENT;
  const proxyText = proxyData?.proxy ?? "";
  const entityMap = proxyData?.entity_map ?? {};

  const phiCount = entities.filter((e) => e.category === "phi").length;
  const ipCount = entities.filter((e) => e.category === "ip").length;
  const mnpiCount = entities.filter((e) => e.category === "mnpi").length;
  const totalCount = entities.length;
  const showBanner = !bannerDismissed && totalCount > 0;

  return (
    <section className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
      {/* Editor Tabs */}
      <div className="h-9 flex bg-[#252526] overflow-x-auto shrink-0 border-b border-vscode-border">
        <Tab name="SAE_Narrative_Draft_001.txt" active />
        <Tab name="patient_records.csv" />
        <Tab name="extraction_rules.json" />
      </div>

      {/* Breadcrumbs */}
      <div className="h-6 flex items-center px-4 bg-[#1e1e1e] text-[11px] text-[#969696] gap-1 shrink-0">
        <span className="hover:text-white cursor-pointer transition-colors">Sovereign_OS</span>
        <span className="text-[#969696]/50 select-none">&gt;</span>
        <span className="hover:text-white cursor-pointer transition-colors">SAE_Narrative_Draft_001.txt</span>
      </div>

      {/* Toolbar */}
      <div className="h-9 border-b border-vscode-border flex items-center justify-between px-4 bg-[#1e1e1e] shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-[#6a9955] uppercase font-bold tracking-tighter">
            Original
          </span>
          <div className="h-3 w-px bg-vscode-border" />
          <button
            onClick={onToggleSync}
            className={`font-mono text-[11px] flex items-center gap-1 transition-colors ${
              syncScroll ? "text-primary-fixed" : "text-zinc-600"
            }`}
          >
            <RefreshCcw size={12} /> Sync_Scroll: {syncScroll ? "ON" : "OFF"}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-phi" />
            <span className="text-[10px] text-zinc-500">PHI</span>
          </span>
          <span className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-ip" />
            <span className="text-[10px] text-zinc-500">IP</span>
          </span>
          <span className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-mnpi" />
            <span className="text-[10px] text-zinc-500">MNPI</span>
          </span>
        </div>
      </div>

      {/* "What would have leaked" banner */}
      {showBanner && (
        <div className="shrink-0 border-b border-[#be1100]/30 bg-[#5a1d1d]/40">
          <div className="flex items-center gap-2 px-4 py-1.5">
            <ShieldAlert size={12} className="text-[#f48771] shrink-0" />
            <span className="text-[11px] text-[#f48771] flex-1">
              If you pasted this directly into ChatGPT:{" "}
              <span className="text-phi font-bold">{phiCount} PHI</span>
              <span className="text-[#858585]"> · </span>
              <span className="text-ip font-bold">{ipCount} IP</span>
              <span className="text-[#858585]"> · </span>
              <span className="text-mnpi font-bold">{mnpiCount} MNPI</span>
              <span className="text-[#858585]"> — {totalCount} items would be exposed.</span>
            </span>
            <button
              onClick={() => setBannerExpanded(!bannerExpanded)}
              className="text-[10px] text-[#858585] hover:text-[#cccccc] transition-colors flex items-center gap-0.5 shrink-0"
            >
              Details
              <ChevronDown size={10} className={`transition-transform ${bannerExpanded ? "rotate-180" : ""}`} />
            </button>
            <button
              onClick={() => setBannerDismissed(true)}
              className="text-[#858585] hover:text-[#cccccc] transition-colors shrink-0 ml-1"
              title="Dismiss"
            >
              <X size={12} />
            </button>
          </div>
          {bannerExpanded && (
            <div className="px-4 pb-2 pt-0 text-[11px] text-[#858585] font-mono space-y-0.5">
              {[
                { tier: "phi", label: "PHI (HIPAA identifiers)", count: phiCount, color: "text-phi" },
                { tier: "ip", label: "IP (compound codes, doses, timing)", count: ipCount, color: "text-ip" },
                { tier: "mnpi", label: "MNPI (efficacy data, amendments)", count: mnpiCount, color: "text-mnpi" },
              ].map(({ tier, label, count, color }) => (
                count > 0 && (
                  <div key={tier} className="flex items-center gap-2">
                    <span className={`${color} font-bold w-4 text-right`}>{count}</span>
                    <span>{label}</span>
                  </div>
                )
              ))}
              <p className="text-[#606060] pt-1">NGSP proxy mode active — identifiers replaced before any cloud transmission.</p>
            </div>
          )}
        </div>
      )}

      {/* Document Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Original Text Pane */}
        <div
          ref={originalRef}
          className="flex-1 overflow-y-auto font-mono text-[13px] leading-relaxed relative bg-[#1e1e1e]"
        >
          <div className="flex min-h-full">
            <Gutter lines={20} />
            <div className="flex-1 p-8">
              <div className="max-w-2xl">
                {isLoading ? (
                  <div className="space-y-2 animate-pulse">
                    <div className="h-3 bg-[#2d2d2d] rounded w-full" />
                    <div className="h-3 bg-[#2d2d2d] rounded w-5/6" />
                    <div className="h-3 bg-[#2d2d2d] rounded w-4/5" />
                    <div className="h-3 bg-[#2d2d2d] rounded w-full" />
                    <div className="h-3 bg-[#2d2d2d] rounded w-3/4" />
                  </div>
                ) : (
                  <p className="text-[#cccccc] leading-loose">
                    {renderHighlightedText(text, entities, hoveredPlaceholder, onHoverPlaceholder)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Safe Version (Proxy) Pane */}
        <div
          ref={proxiedRef}
          className="flex-1 overflow-y-auto bg-[#1e1e1e] font-mono text-[13px] border-l border-vscode-border"
        >
          <div className="flex min-h-full">
            <Gutter lines={20} />
            <div className="flex-1">
              {/* Proxy pane header */}
              <div className="h-7 flex items-center px-4 border-b border-vscode-border/50 bg-[#252526]/50 shrink-0">
                <span className="font-mono text-[10px] text-[#6a9955] uppercase font-bold tracking-tighter">
                  Safe Version
                </span>
              </div>
              <div className="p-8">
                <div className="max-w-2xl">
                  {isLoading ? (
                    <div className="space-y-2 animate-pulse">
                      <div className="h-3 bg-[#2d2d2d] rounded w-full" />
                      <div className="h-3 bg-[#2d2d2d] rounded w-4/5" />
                      <div className="h-3 bg-[#2d2d2d] rounded w-5/6" />
                      <div className="h-3 bg-[#2d2d2d] rounded w-3/4" />
                      <div className="h-3 bg-[#2d2d2d] rounded w-full" />
                    </div>
                  ) : proxyData ? (
                    <p className="text-zinc-500 leading-loose">
                      {renderProxyText(proxyText, entityMap, hoveredPlaceholder, onHoverPlaceholder)}
                    </p>
                  ) : (
                    <p className="text-[#969696] text-[11px]">Loading safe version…</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Gutter({ lines }: { lines: number }) {
  return (
    <div className="w-10 bg-[#1e1e1e] border-r border-vscode-border flex flex-col items-center pt-8 text-[#858585] text-[12px] select-none sticky left-0 shrink-0">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-6 leading-relaxed">{i + 1}</div>
      ))}
    </div>
  );
}

function Tab({ name, active }: { name: string; active?: boolean }) {
  return (
    <div
      className={`h-full min-w-[150px] max-w-[240px] flex items-center px-3 gap-2 cursor-pointer border-r border-[#1e1e1e] group relative ${
        active ? "bg-[#1e1e1e] text-white" : "bg-[#2d2d2d] text-[#969696] hover:bg-[#323232]"
      }`}
    >
      <FileText size={16} className={active ? "text-[#cccccc]" : "text-[#969696]"} />
      <span className="text-[13px] truncate">{name}</span>
      <button
        className={`ml-auto p-0.5 rounded-sm hover:bg-white/10 transition-colors ${
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <X size={12} />
      </button>
      {active && <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-[#969696]/30" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Text renderers
// ---------------------------------------------------------------------------

// Split `text` into plain runs and highlighted entity spans, returning React nodes.
function renderHighlightedText(
  text: string,
  entities: EntityItem[],
  hoveredPlaceholder: string | null,
  onHover: (ph: string | null) => void
): ReactNode[] {
  const sorted = [...entities].sort((a, b) => a.start - b.start);
  const nodes: ReactNode[] = [];
  let cursor = 0;

  const colorClass: Record<string, string> = {
    phi: "text-phi",
    ip: "text-ip",
    mnpi: "text-mnpi",
  };

  for (const entity of sorted) {
    if (entity.start > cursor) {
      nodes.push(
        <span key={`plain-${cursor}`}>{text.slice(cursor, entity.start)}</span>
      );
    }
    const isActive = hoveredPlaceholder === entity.placeholder;
    nodes.push(
      <span
        key={entity.placeholder}
        className={`cursor-pointer border-b border-current border-opacity-40 transition-all hover:bg-white/5 rounded-sm px-0.5 ${
          isActive
            ? "bg-vscode-selection/40 !text-white border-white"
            : colorClass[entity.category] ?? "text-[#cccccc]"
        }`}
        onMouseEnter={() => onHover(entity.placeholder)}
        onMouseLeave={() => onHover(null)}
        title={`${entity.subcategory} (${entity.category.toUpperCase()})`}
      >
        {entity.text}
      </span>
    );
    cursor = entity.end;
  }

  if (cursor < text.length) {
    nodes.push(<span key="plain-end">{text.slice(cursor)}</span>);
  }

  return nodes;
}

// Split proxy text at placeholder tokens and render them as styled badges.
function renderProxyText(
  proxyText: string,
  entityMap: Record<string, string>,
  hoveredPlaceholder: string | null,
  onHover: (ph: string | null) => void
): ReactNode[] {
  const placeholderRegex = /<[A-Z_]+_\d+>/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = placeholderRegex.exec(proxyText)) !== null) {
    if (match.index > cursor) {
      nodes.push(<span key={key++}>{proxyText.slice(cursor, match.index)}</span>);
    }
    const placeholder = match[0];
    const isActive = hoveredPlaceholder === placeholder;
    nodes.push(
      <span
        key={key++}
        className={`px-1 rounded-sm transition-all border font-mono select-none cursor-pointer inline-block leading-none ${
          isActive
            ? "bg-vscode-selection/50 border-primary-container text-white"
            : "bg-[#252526] border-vscode-border text-zinc-600 hover:text-zinc-400 hover:border-zinc-700"
        }`}
        onMouseEnter={() => onHover(placeholder)}
        onMouseLeave={() => onHover(null)}
        title={entityMap[placeholder] ?? placeholder}
      >
        {placeholder}
      </span>
    );
    cursor = match.index + placeholder.length;
  }

  if (cursor < proxyText.length) {
    nodes.push(<span key={key++}>{proxyText.slice(cursor)}</span>);
  }

  return nodes;
}
