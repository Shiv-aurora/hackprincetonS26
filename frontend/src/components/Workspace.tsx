import { RefreshCcw, X, FileText, FileCode, ShieldAlert, ChevronDown } from "lucide-react";
import { useRef, useEffect, ReactNode, useState, type MouseEvent, type Key } from "react";
import type { EntityItem, ProxyResponse } from "../lib/api";
import { DEMO_FILES } from "../lib/demoDocument";

interface WorkspaceProps {
  syncScroll: boolean;
  onToggleSync: () => void;
  entities: EntityItem[];
  proxyData: ProxyResponse | null;
  isLoading: boolean;
  hoveredPlaceholder: string | null;
  onHoverPlaceholder: (ph: string | null) => void;
  // file management
  openFiles: string[];
  activeFileName: string;
  fileRenames: Record<string, string>;
  onTabChange: (name: string) => void;
  onTabClose: (name: string) => void;
  onFileRename: (originalName: string, newDisplayName: string) => void;
}

export default function Workspace({
  syncScroll,
  onToggleSync,
  entities,
  proxyData,
  isLoading,
  hoveredPlaceholder,
  onHoverPlaceholder,
  openFiles,
  activeFileName,
  fileRenames,
  onTabChange,
  onTabClose,
  onFileRename,
}: WorkspaceProps) {
  const originalRef = useRef<HTMLDivElement>(null);
  const proxiedRef = useRef<HTMLDivElement>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [bannerExpanded, setBannerExpanded] = useState(false);

  // Reset banner when file changes
  useEffect(() => {
    setBannerDismissed(false);
    setBannerExpanded(false);
  }, [activeFileName]);

  // Synchronized scrolling
  useEffect(() => {
    if (!syncScroll) return;
    const original = originalRef.current;
    const proxied = proxiedRef.current;
    if (!original || !proxied) return;
    const syncA = () => { proxied.scrollTop = original.scrollTop; };
    const syncB = () => { original.scrollTop = proxied.scrollTop; };
    original.addEventListener("scroll", syncA);
    proxied.addEventListener("scroll", syncB);
    return () => {
      original.removeEventListener("scroll", syncA);
      proxied.removeEventListener("scroll", syncB);
    };
  }, [syncScroll]);

  const text = proxyData?.original ?? DEMO_FILES[activeFileName]?.content ?? "";
  const proxyText = proxyData?.proxy ?? "";
  const entityMap = proxyData?.entity_map ?? {};

  const phiCount = entities.filter((e) => e.category === "phi").length;
  const ipCount = entities.filter((e) => e.category === "ip").length;
  const mnpiCount = entities.filter((e) => e.category === "mnpi").length;
  const totalCount = entities.length;
  const showBanner = !bannerDismissed && totalCount > 0 && !isLoading;

  const gutterLines = Math.max(20, text.split("\n").length + 2);

  return (
    <section className="flex-1 flex flex-col min-w-0 bg-surface overflow-hidden">
      {/* ── Editor Tabs ─────────────────────────────────────────────────── */}
      <div className="h-[34px] flex bg-[#161616] overflow-x-auto shrink-0 border-b border-vscode-border">
        {openFiles.map((name) => (
          <Tab
            key={name}
            originalName={name}
            displayName={fileRenames[name] ?? name}
            active={name === activeFileName}
            onClick={() => onTabChange(name)}
            onClose={(e) => {
              e.stopPropagation();
              onTabClose(name);
            }}
            onRename={(newName) => onFileRename(name, newName)}
          />
        ))}
      </div>

      {/* ── Breadcrumbs ─────────────────────────────────────────────────── */}
      <div className="h-[22px] flex items-center px-4 bg-[#1a1a1a] text-[10.5px] text-[#7a7a7a] gap-1.5 shrink-0 border-b border-vscode-border/40">
        <span className="hover:text-[#cccccc] cursor-pointer transition-colors duration-150">Sovereign_OS</span>
        <span className="text-[#3a3a3a] select-none">/</span>
        <span className="text-[#b0b0b0]">{fileRenames[activeFileName] ?? activeFileName}</span>
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="h-8 border-b border-vscode-border flex items-center justify-between px-4 bg-[#191919] shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-tertiary uppercase font-semibold tracking-widest">
            Original
          </span>
          <div className="h-2.5 w-px bg-vscode-border" />
          <button
            onClick={onToggleSync}
            className={`font-mono text-[10px] flex items-center gap-1.5 transition-colors duration-150 ${
              syncScroll ? "text-primary-fixed" : "text-[#555]"
            }`}
          >
            <RefreshCcw size={10} />
            Sync {syncScroll ? "ON" : "OFF"}
          </button>
        </div>
        <div className="flex items-center gap-3">
          {[
            { label: "PHI", cls: "bg-phi" },
            { label: "IP", cls: "bg-ip" },
            { label: "MNPI", cls: "bg-mnpi" },
          ].map(({ label, cls }) => (
            <span key={label} className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${cls}`} />
              <span className="text-[9.5px] text-[#555] tracking-widest uppercase">{label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── "What would have leaked" banner ────────────────────────────── */}
      {showBanner && (
        <div className="shrink-0 glass-warning">
          <div className="flex items-center gap-2 px-4 py-1.5">
            <ShieldAlert size={11} className="text-[#f48771] shrink-0" />
            <span className="text-[11px] text-[#e0907b] flex-1 leading-snug">
              Pasting directly into ChatGPT would expose{" "}
              <span className="text-phi font-semibold tabular">{phiCount} PHI</span>
              <span className="text-[#555] mx-1">·</span>
              <span className="text-ip font-semibold tabular">{ipCount} IP</span>
              <span className="text-[#555] mx-1">·</span>
              <span className="text-mnpi font-semibold tabular">{mnpiCount} MNPI</span>
              <span className="text-[#888]"> — {totalCount} items total.</span>
            </span>
            <button
              onClick={() => setBannerExpanded((v) => !v)}
              className="text-[10px] text-[#666] hover:text-[#aaa] transition-colors flex items-center gap-0.5 shrink-0"
            >
              Details
              <ChevronDown
                size={9}
                className={`transition-transform duration-200 ${bannerExpanded ? "rotate-180" : ""}`}
              />
            </button>
            <button
              onClick={() => setBannerDismissed(true)}
              className="text-[#555] hover:text-[#aaa] transition-colors shrink-0 ml-1"
            >
              <X size={11} />
            </button>
          </div>
          {bannerExpanded && (
            <div className="px-4 pb-2 text-[10.5px] text-[#777] font-mono space-y-0.5">
              {phiCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-phi font-bold w-4 text-right tabular">{phiCount}</span>
                  <span>PHI — HIPAA Safe Harbor identifiers</span>
                </div>
              )}
              {ipCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-ip font-bold w-4 text-right tabular">{ipCount}</span>
                  <span>IP — compound codes, doses, timing</span>
                </div>
              )}
              {mnpiCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-mnpi font-bold w-4 text-right tabular">{mnpiCount}</span>
                  <span>MNPI — efficacy data, amendments, DSMB</span>
                </div>
              )}
              <p className="text-[#444] pt-0.5">
                NGSP proxy active — all identifiers replaced before cloud transmission.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Document Area ───────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Original pane */}
        <div
          ref={originalRef}
          className="flex-1 overflow-y-auto font-mono text-[12.5px] leading-relaxed bg-surface"
        >
          <div className="flex min-h-full">
            <Gutter lines={gutterLines} />
            <div className="flex-1 p-6 pr-8">
              <div className="max-w-2xl">
                {isLoading ? (
                  <Skeleton />
                ) : (
                  <p className="text-[#c8c8c8] leading-[1.9]">
                    {renderHighlightedText(text, entities, hoveredPlaceholder, onHoverPlaceholder)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Proxy pane */}
        <div
          ref={proxiedRef}
          className="flex-1 overflow-y-auto bg-[#141414] font-mono text-[12.5px] border-l border-vscode-border"
        >
          <div className="flex min-h-full">
            <Gutter lines={gutterLines} dim />
            <div className="flex-1">
              <div className="h-7 flex items-center px-4 border-b border-vscode-border/40 bg-[#161616] shrink-0">
                <span className="font-mono text-[9.5px] text-tertiary/80 uppercase font-semibold tracking-widest">
                  Safe Version — proxy only
                </span>
              </div>
              <div className="p-6 pr-8">
                <div className="max-w-2xl">
                  {isLoading ? (
                    <Skeleton dim />
                  ) : proxyData ? (
                    <p className="text-[#6a6a6a] leading-[1.9]">
                      {renderProxyText(proxyText, entityMap, hoveredPlaceholder, onHoverPlaceholder)}
                    </p>
                  ) : (
                    <p className="text-[#444] text-[11px]">Proxy will appear here once loaded…</p>
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

// ── Sub-components ────────────────────────────────────────────────────────────

function Gutter({ lines, dim }: { lines: number; dim?: boolean }) {
  return (
    <div
      className={`w-10 shrink-0 flex flex-col items-end pr-3 pt-6 select-none sticky left-0 ${
        dim ? "bg-[#141414] text-[#2e2e2e]" : "bg-surface text-[#3a3a3a]"
      } text-[11px] font-mono`}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-[1.9em] leading-[1.9]">
          {i + 1}
        </div>
      ))}
    </div>
  );
}

function Skeleton({ dim }: { dim?: boolean }) {
  const bars = [1, 0.9, 0.95, 0.75, 0.88, 0.92, 0.7];
  return (
    <div className="space-y-2.5 animate-pulse">
      {bars.map((w, i) => (
        <div
          key={i}
          className={`h-2.5 rounded-sm ${dim ? "bg-[#1f1f1f]" : "bg-[#232323]"}`}
          style={{ width: `${w * 100}%` }}
        />
      ))}
    </div>
  );
}

function getFileIcon(name: string) {
  if (name.endsWith(".csv") || name.endsWith(".json")) return FileCode;
  return FileText;
}

interface TabProps {
  key?: Key;
  originalName: string;
  displayName: string;
  active: boolean;
  onClick: () => void;
  onClose: (e: MouseEvent) => void;
  onRename: (newName: string) => void;
}

function Tab({ originalName, displayName, active, onClick, onClose, onRename }: TabProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  const inputRef = useRef<HTMLInputElement>(null);
  const Icon = getFileIcon(originalName);

  const startEdit = (e: MouseEvent) => {
    e.stopPropagation();
    setDraft(displayName);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== displayName) onRename(trimmed);
    setEditing(false);
  };

  return (
    <div
      onClick={onClick}
      onDoubleClick={startEdit}
      className={`h-full min-w-[140px] max-w-[220px] flex items-center px-3 gap-2 cursor-pointer border-r select-none group relative transition-colors duration-100 ${
        active
          ? "bg-surface text-[#d4d4d4] border-vscode-border"
          : "bg-[#141414] text-[#777] border-[#1f1f1f] hover:bg-[#1a1a1a] hover:text-[#aaa]"
      }`}
      title={`${displayName} — double-click to rename`}
    >
      {active && (
        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-[#0078d4]/80" />
      )}
      <Icon
        size={13}
        className={active ? "text-[#aaa] shrink-0" : "text-[#555] shrink-0"}
      />
      {editing ? (
        <input
          ref={inputRef}
          className="flex-1 bg-transparent text-[12px] text-[#d4d4d4] outline-none border-b border-primary-container min-w-0"
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
        <span className="text-[12px] truncate flex-1">{displayName}</span>
      )}
      <button
        onClick={onClose}
        className={`shrink-0 p-0.5 rounded-sm hover:bg-white/10 transition-colors ${
          active ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
        }`}
      >
        <X size={11} />
      </button>
    </div>
  );
}

// ── Text renderers ────────────────────────────────────────────────────────────

function renderHighlightedText(
  text: string,
  entities: EntityItem[],
  hoveredPlaceholder: string | null,
  onHover: (ph: string | null) => void,
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
        className={`cursor-pointer border-b border-current border-opacity-50 transition-all duration-100 rounded-[2px] px-[1px] ${
          isActive
            ? "bg-vscode-selection/40 !text-white"
            : colorClass[entity.category] ?? "text-[#c8c8c8]"
        }`}
        onMouseEnter={() => onHover(entity.placeholder)}
        onMouseLeave={() => onHover(null)}
        title={`${entity.subcategory} — ${entity.category.toUpperCase()}`}
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
        className={`px-1 py-0.5 rounded-[3px] transition-all duration-100 border font-mono select-none cursor-pointer inline-block leading-none text-[11px] ${
          isActive
            ? "bg-vscode-selection/50 border-primary-container text-white"
            : "bg-[#1f1f1f] border-[#2e2e2e] text-[#4a4a4a] hover:text-[#707070] hover:border-[#3a3a3a]"
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
