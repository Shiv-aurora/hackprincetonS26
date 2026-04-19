import {
  RefreshCcw, X, FileText, FileCode, ShieldAlert, ChevronDown,
  LayoutPanelLeft, Flame, Share2, GitBranch, ClipboardList,
  CheckCircle2, XCircle,
} from "lucide-react";
import { useRef, useEffect, useState, useCallback, type ReactNode, type MouseEvent, type Key } from "react";
import * as d3 from "d3";
import { AnimatePresence, motion } from "framer-motion";
import type { EntityItem, ProxyResponse, AuditLogEntry, RouteResponse } from "../lib/api";
import { DEMO_FILES, formatFileName } from "../lib/demoDocument";

// ── Types ──────────────────────────────────────────────────────────────────────

type ViewMode = 1 | 2 | 3 | 4 | 5;

interface SegmentedText {
  text: string;
  start: number;
  end: number;
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  category: "phi" | "ip" | "mnpi";
}

type GraphLink = d3.SimulationLinkDatum<GraphNode> & { count: number };

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<string, string> = {
  phi: "#ce9178",
  ip: "#4fc1ff",
  mnpi: "#dcdcaa",
};

const ROUTE_STYLE: Record<string, { label: string; cls: string }> = {
  abstract_extractable: { label: "abstract", cls: "text-tertiary bg-tertiary/10 border-tertiary/25" },
  dp_tolerant: { label: "dp protected", cls: "text-mnpi bg-mnpi/8 border-mnpi/25" },
  local_only: { label: "local only", cls: "text-ip bg-ip/8 border-ip/20" },
};

const VIEW_MODES: { id: ViewMode; icon: typeof FileText; label: string; tooltip: string }[] = [
  { id: 1, icon: LayoutPanelLeft, label: "Compare", tooltip: "Side-by-side original vs proxy" },
  { id: 2, icon: Flame, label: "Heatmap", tooltip: "What would have leaked" },
  { id: 3, icon: Share2, label: "Graph", tooltip: "Entity relationship graph" },
  { id: 4, icon: GitBranch, label: "Routing", tooltip: "Per-sentence routing transparency" },
  { id: 5, icon: ClipboardList, label: "Audit", tooltip: "Session audit timeline" },
];

// ── Props ──────────────────────────────────────────────────────────────────────

interface WorkspaceProps {
  syncScroll: boolean;
  onToggleSync: () => void;
  entities: EntityItem[];
  proxyData: ProxyResponse | null;
  isLoading: boolean;
  hoveredPlaceholder: string | null;
  onHoverPlaceholder: (ph: string | null) => void;
  openFiles: string[];
  activeFileName: string;
  fileRenames: Record<string, string>;
  onTabChange: (name: string) => void;
  onTabClose: (name: string) => void;
  onFileRename: (originalName: string, newDisplayName: string) => void;
  routeDecision?: RouteResponse | null;
  auditLog?: AuditLogEntry[];
}

// ── Main component ─────────────────────────────────────────────────────────────

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
  routeDecision,
  auditLog = [],
}: WorkspaceProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(1);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [bannerExpanded, setBannerExpanded] = useState(false);

  useEffect(() => {
    setBannerDismissed(false);
    setBannerExpanded(false);
  }, [activeFileName]);

  const text = proxyData?.original ?? DEMO_FILES[activeFileName]?.content ?? "";
  const proxyText = proxyData?.proxy ?? "";
  const entityMap = proxyData?.entity_map ?? {};
  const phiCount = entities.filter((e) => e.category === "phi").length;
  const ipCount = entities.filter((e) => e.category === "ip").length;
  const mnpiCount = entities.filter((e) => e.category === "mnpi").length;
  const totalCount = entities.length;

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-transparent">

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div className="surface-toolbar flex h-[36px] shrink-0 overflow-x-auto border-b border-white/[0.04]">
        {openFiles.map((name) => (
          <Tab
            key={name}
            originalName={name}
            displayName={fileRenames[name] ?? DEMO_FILES[name]?.label ?? formatFileName(name)}
            active={name === activeFileName}
            onClick={() => onTabChange(name)}
            onClose={(e) => { e.stopPropagation(); onTabClose(name); }}
            onRename={(n) => onFileRename(name, n)}
          />
        ))}
      </div>

      {/* ── Mode toolbar ──────────────────────────────────────────────────── */}
      <div className="surface-toolbar shrink-0 border-b border-white/[0.04] px-4 py-3">
        <div className="flex items-center justify-between gap-4 mb-2.5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-[#4c4c4c] font-semibold mb-1">Workspace</p>
          </div>
          {viewMode === 1 && (
            <button
              onClick={onToggleSync}
              className={`text-[11px] flex items-center gap-2 transition-colors duration-150 px-3 py-2 rounded-xl ${
                syncScroll ? "surface-accent text-primary-fixed" : "surface-soft text-[#7d8790]"
              }`}
            >
              <RefreshCcw size={12} />
              Sync panes
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {VIEW_MODES.map((m) => {
            const Icon = m.icon;
            const active = viewMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setViewMode(m.id)}
                title={m.tooltip}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-[11.5px] font-medium transition-all duration-150 select-none ${
                  active
                    ? "surface-accent text-[#dff1ff] shadow-[0_12px_30px_rgba(0,120,212,0.18)]"
                    : "surface-soft text-[#74808a] hover:text-[#d4d9df]"
                }`}
              >
                <Icon size={12} />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── "What would have leaked" banner ─────────────────────────────── */}
      {viewMode === 1 && !bannerDismissed && totalCount > 0 && !isLoading && (
        <div className="surface-alert shrink-0">
          <div className="flex items-center gap-2 px-4 py-1.5">
            <ShieldAlert size={11} className="text-[#f48771] shrink-0" />
            <span className="text-[11px] text-[#e0907b] flex-1 leading-snug">
              Pasting unprotected would expose{" "}
              <span className="text-phi font-semibold">{phiCount} PHI</span>
              <span className="text-[#444] mx-1">·</span>
              <span className="text-ip font-semibold">{ipCount} IP</span>
              <span className="text-[#444] mx-1">·</span>
              <span className="text-mnpi font-semibold">{mnpiCount} MNPI</span>
            </span>
            <button
              onClick={() => setBannerExpanded((v) => !v)}
              className="text-[10px] text-[#555] hover:text-[#aaa] flex items-center gap-0.5 shrink-0 transition-colors"
            >
              Details
              <ChevronDown size={9} className={`transition-transform duration-200 ${bannerExpanded ? "rotate-180" : ""}`} />
            </button>
            <button onClick={() => setBannerDismissed(true)} className="text-[#444] hover:text-[#aaa] transition-colors shrink-0 ml-1">
              <X size={11} />
            </button>
          </div>
          {bannerExpanded && (
            <div className="px-4 pb-2 space-y-0.5 text-[10.5px] text-[#555]">
              {phiCount > 0 && <div className="flex gap-2"><span className="text-phi tabular w-4 text-right">{phiCount}</span><span>PHI — HIPAA Safe Harbor identifiers (names, dates, sites)</span></div>}
              {ipCount > 0 && <div className="flex gap-2"><span className="text-ip tabular w-4 text-right">{ipCount}</span><span>IP — compound codes, doses, study timing</span></div>}
              {mnpiCount > 0 && <div className="flex gap-2"><span className="text-mnpi tabular w-4 text-right">{mnpiCount}</span><span>MNPI — efficacy data, amendments, DSMB results</span></div>}
              <p className="text-[#333] pt-0.5">NGSP proxy active — all replaced before transmission.</p>
            </div>
          )}
        </div>
      )}

      {/* ── View content ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <AnimatePresence mode="wait" initial={false}>
          {viewMode === 1 && (
            <motion.div key="compare-view" className="flex-1 min-h-0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.24 }}>
              <ComparisonView
                text={text} proxyText={proxyText} entityMap={entityMap}
                entities={entities} isLoading={isLoading}
                syncScroll={syncScroll}
                hoveredPlaceholder={hoveredPlaceholder}
                onHoverPlaceholder={onHoverPlaceholder}
              />
            </motion.div>
          )}
          {viewMode === 2 && (
            <motion.div key="heatmap-view" className="flex-1 min-h-0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.24 }}>
              <HeatmapView
                text={text} entities={entities} isLoading={isLoading}
                phiCount={phiCount} ipCount={ipCount} mnpiCount={mnpiCount}
              />
            </motion.div>
          )}
          {viewMode === 3 && (
            <motion.div key="graph-view" className="flex-1 min-h-0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.24 }}>
              <ForceGraphView entities={entities} text={text} isLoading={isLoading} />
            </motion.div>
          )}
          {viewMode === 4 && (
            <motion.div key="routing-view" className="flex-1 min-h-0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.24 }}>
              <RoutingView text={text} entities={entities} isLoading={isLoading} />
            </motion.div>
          )}
          {viewMode === 5 && (
            <motion.div key="audit-view" className="flex-1 min-h-0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.24 }}>
              <AuditTimelineView auditLog={auditLog} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

// ── MODE 1: Comparison View ───────────────────────────────────────────────────

function ComparisonView({
  text, proxyText, entityMap, entities, isLoading, syncScroll,
  hoveredPlaceholder, onHoverPlaceholder,
}: {
  text: string; proxyText: string; entityMap: Record<string, string>;
  entities: EntityItem[]; isLoading: boolean; syncScroll: boolean;
  hoveredPlaceholder: string | null; onHoverPlaceholder: (p: string | null) => void;
}) {
  const originalRef = useRef<HTMLDivElement>(null);
  const proxiedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!syncScroll) return;
    const a = originalRef.current, b = proxiedRef.current;
    if (!a || !b) return;
    const syncA = () => { b.scrollTop = a.scrollTop; };
    const syncB = () => { a.scrollTop = b.scrollTop; };
    a.addEventListener("scroll", syncA);
    b.addEventListener("scroll", syncB);
    return () => { a.removeEventListener("scroll", syncA); b.removeEventListener("scroll", syncB); };
  }, [syncScroll]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Original */}
      <div ref={originalRef} className="flex-1 overflow-y-auto">
        <div className="p-6 pr-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-1 rounded-full bg-tertiary/60" />
            <span className="text-[10px] text-[#69737d] uppercase tracking-widest font-semibold">Original</span>
          </div>
          <div className="surface-card max-w-3xl rounded-[26px] px-6 py-5">
            {isLoading ? <Skeleton /> : (
              <p className="doc-text">
                {renderHighlightedText(text, entities, hoveredPlaceholder, onHoverPlaceholder)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px shrink-0" style={{ background: "rgba(255,255,255,0.04)" }} />

      {/* Proxy */}
      <div ref={proxiedRef} className="flex-1 overflow-y-auto bg-[#14171b]">
        <div className="p-6 pr-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-1 rounded-full bg-[#4a4a4a]" />
            <span className="text-[10px] text-[#69737d] uppercase tracking-widest font-semibold">Proxy</span>
          </div>
          <div className="surface-soft max-w-3xl rounded-[26px] px-6 py-5">
            {isLoading ? <Skeleton dim /> : proxyText ? (
              <p className="doc-text text-[#a2acb6]">
                {renderProxyText(proxyText, entityMap, hoveredPlaceholder, onHoverPlaceholder)}
              </p>
            ) : (
              <p className="text-[#596069] text-[11px] italic">Proxy will appear here once loaded…</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MODE 2: Heatmap View ──────────────────────────────────────────────────────

function HeatmapView({
  text, entities, isLoading, phiCount, ipCount, mnpiCount,
}: {
  text: string; entities: EntityItem[]; isLoading: boolean;
  phiCount: number; ipCount: number; mnpiCount: number;
}) {
  const total = phiCount + ipCount + mnpiCount;

  if (isLoading) {
    return (
      <div className="flex-1 p-8">
        <div className="max-w-2xl mx-auto"><Skeleton /></div>
      </div>
    );
  }

  const segments = splitIntoSentences(text);
  const densities = segments.map((seg) =>
    entities.filter((e) => e.start >= seg.start && e.start < seg.end)
  );
  const maxDensity = Math.max(1, ...densities.map((d) => d.length));

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="max-w-4xl mb-6 grid grid-cols-1 md:grid-cols-4 gap-3">
        {[
          { label: "Total exposed", value: total, tone: "text-[#ffd5cc]" },
          { label: "PHI", value: phiCount, tone: "text-phi" },
          { label: "IP", value: ipCount, tone: "text-ip" },
          { label: "MNPI", value: mnpiCount, tone: "text-mnpi" },
        ].map((card) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="surface-card rounded-[24px] px-4 py-4"
          >
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#535353] font-semibold mb-2">{card.label}</p>
            <p className={`text-[28px] leading-none font-semibold ${card.tone}`}>{card.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Leak counter */}
      <div className="max-w-4xl mb-6 p-5 glass-warning rounded-[26px]">
        <p className="text-[17px] font-semibold text-[#ffd5cc] leading-snug mb-2">
          {total > 0 ? `${total} sensitive items would be exposed to an unprotected LLM` : "No sensitive items detected in this document."}
        </p>
        {total > 0 && (
          <div className="flex gap-5 mt-1 text-[13px]">
            {phiCount > 0 && <span className="text-phi font-semibold">{phiCount} PHI</span>}
            {ipCount > 0 && <span className="text-ip font-semibold">{ipCount} IP</span>}
            {mnpiCount > 0 && <span className="text-mnpi font-semibold">{mnpiCount} MNPI</span>}
          </div>
        )}
      </div>

      {/* Heatmap segments */}
      <div className="max-w-4xl space-y-3">
        {segments.map((seg, i) => {
          const segEntities = densities[i];
          const intensity = segEntities.length / maxDensity;
          const bg = d3.interpolateRgb("rgba(255,255,255,0.025)", "rgba(160,30,30,0.55)")(intensity);
          const hasPhi = segEntities.some((e) => e.category === "phi");
          const hasIp = segEntities.some((e) => e.category === "ip");
          const hasMnpi = segEntities.some((e) => e.category === "mnpi");

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.2 }}
              className="px-5 py-4 rounded-[24px] transition-all duration-300 relative border border-white/[0.05] overflow-hidden"
              style={{ background: bg, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}
            >
              <motion.div
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{ background: "linear-gradient(180deg, #4fc1ff, #f48771)" }}
                animate={{ opacity: [0.45, 1, 0.45] }}
                transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.08 }}
              />
              <p className="doc-text pr-28">
                {renderHighlightedSegment(seg.text, segEntities, seg.start)}
              </p>
              {segEntities.length > 0 && (
                <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
                  <div className="flex gap-1.5">
                    {hasPhi && <span className="w-2 h-2 rounded-full bg-phi shadow-[0_0_12px_rgba(206,145,120,0.55)]" title="PHI" />}
                    {hasIp && <span className="w-2 h-2 rounded-full bg-ip shadow-[0_0_12px_rgba(79,193,255,0.55)]" title="IP" />}
                    {hasMnpi && <span className="w-2 h-2 rounded-full bg-mnpi shadow-[0_0_12px_rgba(220,220,170,0.55)]" title="MNPI" />}
                  </div>
                  <div className="surface-soft rounded-xl px-2.5 py-1.5 text-[10px] text-[#d7d7d7] font-mono">
                    risk {segEntities.length}
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="max-w-4xl mt-6 flex items-center gap-4 text-[11px] text-[#68717a]">
        <div className="flex items-center gap-2">
          <div className="w-20 h-2 rounded-full" style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.03), rgba(160,30,30,0.55))" }} />
          <span>low → high sensitivity</span>
        </div>
        <span className="text-[#384049]">·</span>
        <span>Colored dots = sensitivity tier</span>
      </div>
    </div>
  );
}

// ── MODE 3: Force Graph View ──────────────────────────────────────────────────

function ForceGraphView({ entities, text, isLoading }: { entities: EntityItem[]; text: string; isLoading: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; category: string; sub: string } | null>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || entities.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const W = containerRef.current.clientWidth;
    const H = containerRef.current.clientHeight;
    svg.attr("width", W).attr("height", H);

    // Build nodes (unique entities)
    const nodeMap = new Map<string, GraphNode>();
    const entitySubcats = new Map<string, string>();
    for (const e of entities) {
      if (!nodeMap.has(e.placeholder)) {
        nodeMap.set(e.placeholder, { id: e.placeholder, label: e.text, category: e.category });
        entitySubcats.set(e.placeholder, e.subcategory);
      }
    }
    const nodes: GraphNode[] = Array.from(nodeMap.values());

    // Build edges from sentence co-occurrence
    const linkCounts = new Map<string, number>();
    const sentences = splitIntoSentences(text);
    for (const sent of sentences) {
      const inSent = entities.filter((e) => e.start >= sent.start && e.start < sent.end);
      const uniqueIds = [...new Set(inSent.map((e) => e.placeholder))];
      for (let i = 0; i < uniqueIds.length; i++) {
        for (let j = i + 1; j < uniqueIds.length; j++) {
          const key = [uniqueIds[i], uniqueIds[j]].sort().join("|||");
          linkCounts.set(key, (linkCounts.get(key) ?? 0) + 1);
        }
      }
    }
    const links: GraphLink[] = Array.from(linkCounts.entries()).map(([key, count]) => {
      const [source, target] = key.split("|||");
      return { source, target, count } as GraphLink;
    });

    const marginX = 120;
    const marginY = 110;
    const clusterX: Record<GraphNode["category"], number> = {
      phi: W * 0.22,
      ip: W * 0.5,
      mnpi: W * 0.78,
    };
    const clusterY: Record<GraphNode["category"], number> = {
      phi: H * 0.46,
      ip: H * 0.34,
      mnpi: H * 0.58,
    };

    nodes.forEach((node, index) => {
      const jitter = ((index % 5) - 2) * 14;
      node.x = clusterX[node.category] + jitter;
      node.y = clusterY[node.category] + jitter;
    });

    const g = svg.append("g");
    const zoneData = [
      { id: "phi", label: "PHI cluster", x: 24, y: 54, w: W / 3 - 34, h: H - 112 },
      { id: "ip", label: "IP cluster", x: W / 3 + 10, y: 26, w: W / 3 - 20, h: H - 80 },
      { id: "mnpi", label: "MNPI cluster", x: (W / 3) * 2 + 10, y: 54, w: W / 3 - 34, h: H - 112 },
    ];

    g.append("g")
      .selectAll("rect")
      .data(zoneData)
      .join("rect")
      .attr("x", (d) => d.x)
      .attr("y", (d) => d.y)
      .attr("rx", 28)
      .attr("ry", 28)
      .attr("width", (d) => Math.max(0, d.w))
      .attr("height", (d) => Math.max(0, d.h))
      .attr("fill", "rgba(255,255,255,0.018)")
      .attr("stroke", "rgba(255,255,255,0.045)");

    g.append("g")
      .selectAll("text")
      .data(zoneData)
      .join("text")
      .attr("x", (d) => d.x + 18)
      .attr("y", (d) => d.y + 20)
      .attr("fill", "#5f6973")
      .attr("font-size", "10.5")
      .attr("font-weight", "600")
      .attr("letter-spacing", "0.18em")
      .text((d) => d.label.toUpperCase());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = d3.forceSimulation<any>(nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links as GraphLink[]).id((d: GraphNode) => d.id).distance(88).strength(0.28))
      .force("charge", d3.forceManyBody().strength(-72))
      .force("x", d3.forceX<GraphNode>((d) => clusterX[d.category]).strength(0.28))
      .force("y", d3.forceY<GraphNode>((d) => clusterY[d.category]).strength(0.22))
      .force("collision", d3.forceCollide(34))
      .force("center", d3.forceCenter(W / 2, H / 2).strength(0.08))
      .alpha(0.95)
      .alphaDecay(0.06);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.85, 1.8])
      .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr("transform", event.transform.toString());
      });
    svg.call(zoom);

    const linkEl = g.append("g")
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", "rgba(186,196,208,0.18)")
      .attr("stroke-width", (d: GraphLink) => Math.min(3.2, 1 + d.count * 0.7));

    const nodeEl = g.append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "grab")
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on("start", (event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on("drag", (event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
            d.fx = event.x; d.fy = event.y;
          })
          .on("end", (event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
      );

    nodeEl.append("circle")
      .attr("r", 25)
      .attr("fill", (d: GraphNode) => CATEGORY_COLOR[d.category] + "12");

    nodeEl.append("circle")
      .attr("r", 18)
      .attr("fill", (d: GraphNode) => CATEGORY_COLOR[d.category] + "18")
      .attr("stroke", (d: GraphNode) => CATEGORY_COLOR[d.category])
      .attr("stroke-width", 1.4);

    nodeEl.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.15em")
      .attr("font-size", "9")
      .attr("font-family", "Inter, sans-serif")
      .attr("fill", (d: GraphNode) => CATEGORY_COLOR[d.category])
      .attr("pointer-events", "none")
      .text((d: GraphNode) => (d.label.length > 11 ? d.label.slice(0, 11) + "…" : d.label));

    nodeEl.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "1.6em")
      .attr("font-size", "6.5")
      .attr("font-family", "Inter, sans-serif")
      .attr("fill", (d: GraphNode) => CATEGORY_COLOR[d.category] + "70")
      .attr("pointer-events", "none")
      .text((d: GraphNode) => d.category.toUpperCase());

    nodeEl
      .on("mouseenter", (event: MouseEvent, d: GraphNode) => {
        const rect = (event.target as Element).closest("svg")?.getBoundingClientRect();
        const sub = entitySubcats.get(d.id) ?? "";
        setTooltip({
          x: event.clientX - (rect?.left ?? 0),
          y: event.clientY - (rect?.top ?? 0) - 40,
          label: d.label,
          category: d.category,
          sub,
        });
      })
      .on("mouseleave", () => setTooltip(null));

    sim.on("tick", () => {
      const minX = marginX;
      const maxX = W - marginX;
      const minY = marginY;
      const maxY = H - marginY;
      nodes.forEach((node) => {
        node.x = Math.max(minX, Math.min(maxX, node.x ?? clusterX[node.category]));
        node.y = Math.max(minY, Math.min(maxY, node.y ?? clusterY[node.category]));
      });

      linkEl
        .attr("x1", (d) => (typeof d.source === "object" ? d.source.x ?? 0 : 0))
        .attr("y1", (d) => (typeof d.source === "object" ? d.source.y ?? 0 : 0))
        .attr("x2", (d) => (typeof d.target === "object" ? d.target.x ?? 0 : 0))
        .attr("y2", (d) => (typeof d.target === "object" ? d.target.y ?? 0 : 0));
      nodeEl.attr("transform", (d: GraphNode) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => { sim.stop(); };
  }, [entities, text]);

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center"><Spinner /></div>;
  }

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden px-5 py-5">
      {entities.length === 0 ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[#4f5862]">
          <Share2 size={28} />
          <p className="text-[11.5px]">No entities detected — load a document with sensitive content</p>
        </div>
      ) : (
        <>
          <div className="surface-card h-full overflow-hidden rounded-[28px]">
            <svg ref={svgRef} className="h-full w-full" />
          </div>
          {/* Legend overlay */}
          <div className="surface-soft absolute right-9 top-9 flex flex-col gap-1.5 rounded-xl px-3 py-2.5 text-[10px]">
            {(["phi", "ip", "mnpi"] as const).map((cat) => (
              <div key={cat} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLOR[cat] }} />
                <span style={{ color: CATEGORY_COLOR[cat] }}>{cat.toUpperCase()}</span>
              </div>
            ))}
            <div className="mt-1 border-t border-white/5 pt-1 text-[#6c7680]">
              bounded cluster graph
            </div>
          </div>
          {/* Tooltip */}
          {tooltip && (
            <div
              className="surface-soft absolute z-50 rounded-lg px-3 py-2 text-[10.5px] pointer-events-none"
              style={{ left: tooltip.x + 12, top: tooltip.y }}
            >
              <p style={{ color: CATEGORY_COLOR[tooltip.category] }} className="font-semibold">{tooltip.label}</p>
              <p className="text-[#6e7882]">{tooltip.category.toUpperCase()} · {tooltip.sub}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── MODE 4: Routing Transparency View ─────────────────────────────────────────

function RoutingView({ text, entities, isLoading }: { text: string; entities: EntityItem[]; isLoading: boolean }) {
  if (isLoading) {
    return <div className="flex-1 p-8 max-w-2xl mx-auto"><Skeleton /></div>;
  }

  const segments = splitIntoSentences(text);

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      {/* Header */}
      <div className="max-w-2xl mb-5">
        <p className="text-[11px] text-[#5f6973] mb-3">Each clause shows which NGSP routing path handles it.</p>
        <div className="flex gap-3 text-[10px]">
          {Object.entries(ROUTE_STYLE).map(([key, val]) => (
            <span key={key} className={`px-2 py-0.5 rounded-md border ${val.cls}`}>{val.label}</span>
          ))}
        </div>
      </div>

      {/* Sentence rows */}
      <div className="max-w-2xl space-y-1.5">
        {segments.map((seg, i) => {
          const segEntities = entities.filter((e) => e.start >= seg.start && e.start < seg.end);
          const route = getRouteForSentence(segEntities);
          const style = ROUTE_STYLE[route];

          return (
            <div key={i} className="flex items-start gap-3 group">
              <div className="doc-text flex-1 rounded-xl px-3 py-2 text-[#c0c7ce] transition-all duration-150 group-hover:bg-white/[0.02]">
                {renderHighlightedSegment(seg.text, segEntities, seg.start)}
              </div>
              <span className={`shrink-0 mt-2.5 text-[9.5px] font-semibold px-2 py-0.5 rounded-md border ${style.cls} whitespace-nowrap`}>
                → {style.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── MODE 5: Audit Timeline View ───────────────────────────────────────────────

function AuditTimelineView({ auditLog }: { auditLog: AuditLogEntry[] }) {
  if (auditLog.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[#4f5862] select-none">
        <ClipboardList size={28} />
        <div className="text-center">
          <p className="text-[12px] font-medium text-[#b9c1c8]">No requests yet</p>
          <p className="text-[10.5px] text-[#5f6973] mt-1">Send a message via the AI Agent to generate audit entries.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="max-w-2xl">
        <p className="text-[9.5px] text-[#6d7680] uppercase tracking-widest font-semibold mb-4">Session Audit Log</p>
        <div className="space-y-2">
          {[...auditLog].reverse().map((entry, i) => {
            const style = ROUTE_STYLE[entry.route] ?? { label: entry.route, cls: "text-[#555] bg-white/5 border-white/10" };
            const ts = new Date(entry.timestamp);
            const timeStr = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            return (
              <div key={entry.audit_id} className="surface-card flex items-start gap-3 rounded-xl p-3 transition-all duration-150 hover:bg-white/[0.04]">
                {/* Index */}
                <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-[9px] text-[#4f5862]">
                  {auditLog.length - i}
                </span>
                {/* Status icon */}
                <div className="mt-0.5 shrink-0">
                  {entry.blocked ? (
                    <XCircle size={12} className="text-error" />
                  ) : (
                    <CheckCircle2 size={12} className="text-tertiary/60" />
                  )}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[9.5px] font-semibold px-1.5 py-0.5 rounded-md border ${style.cls}`}>
                      {style.label}
                    </span>
                    {entry.blocked && (
                      <span className="text-[9px] text-error font-mono">BLOCKED</span>
                    )}
                    <span className="ml-auto font-mono tabular text-[9px] text-[#5d6670]">{timeStr}</span>
                  </div>
                  <p className="mt-1 text-[10.5px] text-[#7a838b]">
                    {entry.entities_count} entit{entry.entities_count === 1 ? "y" : "ies"} proxied
                    <span className="mx-1 text-[#384049]">·</span>
                    <span className="font-mono text-[#56606a] text-[9px]">{entry.audit_id.slice(0, 12)}…</span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Skeleton({ dim }: { dim?: boolean }) {
  const bars = [1, 0.9, 0.95, 0.75, 0.88, 0.92, 0.7];
  return (
    <div className="space-y-3 animate-pulse">
      {bars.map((w, i) => (
        <div key={i} className={`h-2.5 rounded-sm ${dim ? "bg-[#1e2328]" : "bg-[#242a31]"}`} style={{ width: `${w * 100}%` }} />
      ))}
    </div>
  );
}

function Spinner() {
  return (
    <div className="loading-dots flex gap-1.5 text-[#68717b]">
      <span /><span /><span />
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
    const t = draft.trim();
    if (t && t !== displayName) onRename(t);
    setEditing(false);
  };

  return (
    <div
      onClick={onClick}
      onDoubleClick={startEdit}
      title={`${displayName} — double-click to rename`}
      className={`h-full min-w-[140px] max-w-[220px] flex items-center px-3 gap-2 cursor-pointer border-r select-none group relative transition-colors duration-100 ${
        active
          ? "bg-[#171b20] text-[#d0d7de]"
          : "bg-transparent text-[#6d7680] hover:text-[#c0c7ce]"
      }`}
      style={{ borderRight: "1px solid rgba(255,255,255,0.04)" }}
    >
      {active && <div className="absolute top-0 left-0 right-0 h-px bg-[#0078d4]/70" />}
      <Icon size={12} className={active ? "text-[#94a0ab] shrink-0" : "text-[#4d5660] shrink-0"} />
      {editing ? (
        <input
          ref={inputRef}
          className="flex-1 bg-transparent text-[12px] text-[#d4d4d4] outline-none border-b border-primary-container min-w-0"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="text-[12px] truncate flex-1">{displayName}</span>
      )}
      <button
        onClick={onClose}
        className={`shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors ${
          active ? "opacity-40 hover:opacity-100" : "opacity-0 group-hover:opacity-40 hover:!opacity-100"
        }`}
      >
        <X size={10} />
      </button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function splitIntoSentences(text: string): SegmentedText[] {
  const segments: SegmentedText[] = [];
  const re = /[^.!?\n]+(?:[.!?]+(?=\s|$)|\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[0].trim();
    if (t) segments.push({ text: t, start: m.index, end: m.index + m[0].length });
  }
  return segments;
}

function getRouteForSentence(segEntities: EntityItem[]): string {
  if (segEntities.some((e) => e.category === "mnpi")) return "dp_tolerant";
  if (segEntities.some((e) => e.category === "phi" || e.category === "ip")) return "abstract_extractable";
  return "local_only";
}

// ── Text renderers ────────────────────────────────────────────────────────────

function renderHighlightedText(
  text: string, entities: EntityItem[],
  hoveredPlaceholder: string | null, onHover: (ph: string | null) => void
): ReactNode[] {
  const sorted = [...entities].sort((a, b) => a.start - b.start);
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const entity of sorted) {
    if (entity.start > cursor) nodes.push(<span key={`p-${cursor}`}>{text.slice(cursor, entity.start)}</span>);
    const isActive = hoveredPlaceholder === entity.placeholder;
    const color = `text-${entity.category}`;
    nodes.push(
      <span
        key={entity.placeholder + cursor}
        className={`cursor-pointer border-b border-current border-opacity-40 transition-all duration-100 rounded-[2px] px-[1px] ${
          isActive ? "bg-vscode-selection/40 !text-white" : color
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

  if (cursor < text.length) nodes.push(<span key="tail">{text.slice(cursor)}</span>);
  return nodes;
}

function renderHighlightedSegment(text: string, segEntities: EntityItem[], offset: number): ReactNode[] {
  // Re-map entity positions relative to this segment
  const remapped = segEntities.map((e) => ({
    ...e,
    start: e.start - offset,
    end: e.end - offset,
  })).filter((e) => e.start >= 0 && e.end <= text.length);

  const sorted = [...remapped].sort((a, b) => a.start - b.start);
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const entity of sorted) {
    if (entity.start > cursor) nodes.push(<span key={`p-${cursor}`}>{text.slice(cursor, entity.start)}</span>);
    nodes.push(
      <span
        key={`e-${entity.start}`}
        className={`border-b border-current border-opacity-40 rounded-[2px] px-[1px] text-${entity.category}`}
        title={`${entity.subcategory} — ${entity.category.toUpperCase()}`}
      >
        {entity.text}
      </span>
    );
    cursor = entity.end;
  }
  if (cursor < text.length) nodes.push(<span key="tail">{text.slice(cursor)}</span>);
  return nodes;
}

function renderProxyText(
  proxyText: string, entityMap: Record<string, string>,
  hoveredPlaceholder: string | null, onHover: (ph: string | null) => void
): ReactNode[] {
  const placeholderRegex = /<[A-Z_]+_\d+>/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = placeholderRegex.exec(proxyText)) !== null) {
    if (match.index > cursor) nodes.push(<span key={key++}>{proxyText.slice(cursor, match.index)}</span>);
    const placeholder = match[0];
    const isActive = hoveredPlaceholder === placeholder;
    nodes.push(
      <span
        key={key++}
        className={`px-1 py-0.5 rounded-[3px] transition-all duration-100 border font-mono select-none cursor-pointer inline-block leading-none text-[10.5px] ${
          isActive
            ? "bg-vscode-selection/50 border-primary-container text-white"
            : "bg-[#1c232a] border-[#343d46] text-[#8f98a3] hover:text-[#d5dde5] hover:border-[#55606b]"
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

  if (cursor < proxyText.length) nodes.push(<span key={key++}>{proxyText.slice(cursor)}</span>);
  return nodes;
}
