import { RefreshCcw, X, FileText } from "lucide-react";
import { useRef, useEffect, ReactNode } from "react";
import type { EntityItem, ProxyResponse } from "../lib/api";
import { DEMO_DOCUMENT } from "../lib/demoDocument";

interface WorkspaceProps {
  syncScroll: boolean;
  onToggleSync: () => void;
  entities: EntityItem[];
  proxyData: ProxyResponse | null;
  hoveredPlaceholder: string | null;
  onHoverPlaceholder: (ph: string | null) => void;
}

export default function Workspace({
  syncScroll,
  onToggleSync,
  entities,
  proxyData,
  hoveredPlaceholder,
  onHoverPlaceholder,
}: WorkspaceProps) {
  const originalRef = useRef<HTMLDivElement>(null);
  const proxiedRef = useRef<HTMLDivElement>(null);

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

  return (
    <section className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
      {/* Editor Tabs */}
      <div className="h-9 flex bg-[#252526] overflow-x-auto no-scrollbar shrink-0 border-b border-vscode-border">
        <Tab name="SAE_Narrative_Draft_001.txt" active />
        <Tab name="patient_records.csv" />
        <Tab name="extraction_rules.json" />
      </div>

      {/* Editor Breadcrumbs */}
      <div className="h-6 flex items-center px-4 bg-[#1e1e1e] text-[11px] text-[#969696] gap-1 shrink-0">
        <span className="hover:text-white cursor-pointer transition-colors">Sovereign_OS</span>
        <span className="text-[#969696]/50 select-none">&gt;</span>
        <span className="hover:text-white cursor-pointer transition-colors">SAE_Narrative_Draft_001.txt</span>
      </div>

      {/* Toolbar */}
      <div className="h-9 border-b border-vscode-border flex items-center justify-between px-4 bg-[#1e1e1e] shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-[#6a9955] uppercase font-bold tracking-tighter">
            SOURCE_TEXT
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
                <p className="text-[#cccccc] leading-loose">
                  {renderHighlightedText(text, entities, hoveredPlaceholder, onHoverPlaceholder)}
                </p>
                {entities.length === 0 && (
                  <p className="text-[#969696] text-[11px] mt-4">
                    Loading entity analysis…
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Proxy Text Pane */}
        <div
          ref={proxiedRef}
          className="flex-1 overflow-y-auto bg-[#1e1e1e] font-mono text-[13px] border-l border-vscode-border"
        >
          <div className="flex min-h-full">
            <Gutter lines={20} />
            <div className="flex-1 p-8">
              <div className="max-w-2xl">
                {proxyData ? (
                  <p className="text-zinc-500 leading-loose">
                    {renderProxyText(proxyText, entityMap, hoveredPlaceholder, onHoverPlaceholder)}
                  </p>
                ) : (
                  <p className="text-[#969696] text-[11px]">
                    Loading proxy…
                  </p>
                )}
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

// Split `text` into plain runs and highlighted entity spans; return React nodes.
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
        className={`cursor-pointer border-b border-current border-opacity-30 transition-all hover:bg-white/5 rounded-sm px-0.5 ${
          isActive
            ? "bg-vscode-selection/40 text-white border-white"
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
    nodes.push(<span key={`plain-end`}>{text.slice(cursor)}</span>);
  }

  return nodes;
}

// Split proxy text into plain runs and placeholder token spans; return React nodes.
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
