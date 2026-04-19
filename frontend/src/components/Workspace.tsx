import {
  RefreshCcw, X, FileText, FileCode, ShieldAlert, ChevronDown,
  LayoutPanelLeft, Flame, Share2, GitBranch, ClipboardList,
  CheckCircle2, XCircle,
} from "lucide-react";
import { useRef, useEffect, useState, useCallback, type ReactNode, type MouseEvent, type Key } from "react";
import * as d3 from "d3";
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
    <section className="flex-1 flex flex-col min-w-0 bg-surface overflow-hidden">

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div className="h-[34px] flex bg-[#0f0f0f] overflow-x-auto shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
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
      <div className="h-9 flex items-center justify-between px-3 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.035)", background: "rgba(15,15,15,0.7)" }}>
        <div className="flex items-center gap-0.5">
          {VIEW_MODES.map((m) => {
            const Icon = m.icon;
            const active = viewMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setViewMode(m.id)}
                title={m.tooltip}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-medium transition-all duration-150 select-none ${
                  active
                    ? "bg-white/[0.07] text-[#c8c8c8]"
                    : "text-[#3a3a3a] hover:text-[#777] hover:bg-white/[0.03]"
                }`}
              >
                <Icon size={10} />
                {m.label}
              </button>
            );
          })}
        </div>
        {viewMode === 1 && (
          <button
            onClick={onToggleSync}
            className={`text-[10px] flex items-center gap-1.5 transition-colors duration-150 px-2 py-1 rounded ${
              syncScroll ? "text-primary-fixed/50" : "text-[#2a2a2a]"
            }`}
          >
            <RefreshCcw size={9} />
            Sync
          </button>
        )}
      </div>

      {/* ── "What would have leaked" banner ─────────────────────────────── */}
      {viewMode === 1 && !bannerDismissed && totalCount > 0 && !isLoading && (
        <div className="shrink-0 glass-warning">
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
        {viewMode === 1 && (
          <ComparisonView
            text={text} proxyText={proxyText} entityMap={entityMap}
            entities={entities} isLoading={isLoading}
            syncScroll={syncScroll}
            hoveredPlaceholder={hoveredPlaceholder}
            onHoverPlaceholder={onHoverPlaceholder}
          />
        )}
        {viewMode === 2 && (
          <HeatmapView
            text={text} entities={entities} isLoading={isLoading}
            phiCount={phiCount} ipCount={ipCount} mnpiCount={mnpiCount}
          />
        )}
        {viewMode === 3 && (
          <ForceGraphView entities={entities} text={text} isLoading={isLoading} />
        )}
        {viewMode === 4 && (
          <RoutingView text={text} entities={entities} isLoading={isLoading} />
        )}
        {viewMode === 5 && (
          <AuditTimelineView auditLog={auditLog} />
        )}
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
    <div className="flex-1 flex overflow-hidden">
      {/* Original */}
      <div ref={originalRef} className="flex-1 overflow-y-auto">
        <div className="p-6 pr-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-1 rounded-full bg-tertiary/60" />
            <span className="text-[9.5px] text-[#3a3a3a] uppercase tracking-widest font-semibold">Original</span>
          </div>
          <div className="max-w-2xl">
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
      <div ref={proxiedRef} className="flex-1 overflow-y-auto" style={{ background: "rgba(10,10,10,0.5)" }}>
        <div className="p-6 pr-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-1 rounded-full bg-[#4a4a4a]" />
            <span className="text-[9.5px] text-[#2e2e2e] uppercase tracking-widest font-semibold">NGSP Proxy — safe version</span>
          </div>
          <div className="max-w-2xl">
            {isLoading ? <Skeleton dim /> : proxyText ? (
              <p className="doc-text text-[#4a4a4a]">
                {renderProxyText(proxyText, entityMap, hoveredPlaceholder, onHoverPlaceholder)}
              </p>
            ) : (
              <p className="text-[#2a2a2a] text-[11px] italic">Proxy will appear here once loaded…</p>
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
      {/* Leak counter */}
      <div className="max-w-2xl mb-6 p-4 glass-warning rounded-2xl">
        <p className="text-[15px] font-semibold text-[#e0907b] leading-snug mb-2">
          {total > 0 ? `${total} sensitive items would be exposed to an unprotected LLM` : "No sensitive items detected in this document."}
        </p>
        {total > 0 && (
          <div className="flex gap-5 mt-1">
            {phiCount > 0 && <span className="text-[12px] text-phi font-semibold">{phiCount} PHI</span>}
            {ipCount > 0 && <span className="text-[12px] text-ip font-semibold">{ipCount} IP</span>}
            {mnpiCount > 0 && <span className="text-[12px] text-mnpi font-semibold">{mnpiCount} MNPI</span>}
          </div>
        )}
      </div>

      {/* Heatmap segments */}
      <div className="max-w-2xl space-y-2">
        {segments.map((seg, i) => {
          const segEntities = densities[i];
          const intensity = segEntities.length / maxDensity;
          // D3 color scale: neutral → warm red
          const bg = d3.interpolateRgb("rgba(0,0,0,0)", "rgba(160,30,30,0.38)")(intensity);
          const hasPhi = segEntities.some((e) => e.category === "phi");
          const hasIp = segEntities.some((e) => e.category === "ip");
          const hasMnpi = segEntities.some((e) => e.category === "mnpi");

          return (
            <div
              key={i}
              className="px-4 py-3 rounded-xl transition-all duration-300 relative"
              style={{ background: bg }}
            >
              <p className="doc-text pr-20">
                {renderHighlightedSegment(seg.text, segEntities, seg.start)}
              </p>
              {segEntities.length > 0 && (
                <div className="absolute right-3 top-3 flex gap-1">
                  {hasPhi && <span className="w-1.5 h-1.5 rounded-full bg-phi" title="PHI" />}
                  {hasIp && <span className="w-1.5 h-1.5 rounded-full bg-ip" title="IP" />}
                  {hasMnpi && <span className="w-1.5 h-1.5 rounded-full bg-mnpi" title="MNPI" />}
                  <span className="text-[9px] text-[#666] font-mono ml-1">{segEntities.length}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="max-w-2xl mt-6 flex items-center gap-4 text-[10px] text-[#333]">
        <div className="flex items-center gap-2">
          <div className="w-16 h-2 rounded-full" style={{ background: "linear-gradient(90deg, rgba(0,0,0,0), rgba(160,30,30,0.38))" }} />
          <span>low → high sensitivity</span>
        </div>
        <span className="text-[#222]">·</span>
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

    // Glow filter
    const defs = svg.append("defs");
    const filter = defs.append("filter").attr("id", "node-glow").attr("x", "-60%").attr("y", "-60%").attr("width", "220%").attr("height", "220%");
    filter.append("feGaussianBlur").attr("stdDeviation", "5").attr("result", "coloredBlur");
    const merge = filter.append("feMerge");
    merge.append("feMergeNode").attr("in", "coloredBlur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    const filterEdge = defs.append("filter").attr("id", "edge-glow");
    filterEdge.append("feGaussianBlur").attr("stdDeviation", "2").attr("result", "coloredBlur");
    const merge2 = filterEdge.append("feMerge");
    merge2.append("feMergeNode").attr("in", "coloredBlur");
    merge2.append("feMergeNode").attr("in", "SourceGraphic");

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

    // Simulation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = d3.forceSimulation<any>(nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links as GraphLink[]).id((d: GraphNode) => d.id).distance(130).strength(0.4))
      .force("charge", d3.forceManyBody().strength(-280))
      .force("center", d3.forceCenter(W / 2, H / 2).strength(0.05))
      .force("collision", d3.forceCollide(48));

    const g = svg.append("g");

    // Zoom + pan
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    svg.call((d3.zoom<SVGSVGElement, unknown>() as any)
      .scaleExtent([0.3, 4])
      .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => g.attr("transform", event.transform.toString()))
    );

    // Edge lines
    const linkG = g.append("g");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkEl = linkG.selectAll<SVGLineElement, any>("line")
      .data(links)
      .join("line")
      .attr("stroke", "rgba(255,255,255,0.06)")
      .attr("stroke-width", (d: GraphLink) => Math.max(1, (d.count) * 1.2))
      .attr("filter", "url(#edge-glow)");

    // Node groups
    const nodeG = g.append("g");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeEl = nodeG.selectAll<SVGGElement, any>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "grab")
      .call(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (d3.drag<SVGGElement, any>() as any)
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

    // Outer glow ring
    nodeEl.append("circle")
      .attr("r", 28)
      .attr("fill", (d: GraphNode) => CATEGORY_COLOR[d.category] + "12")
      .attr("filter", "url(#node-glow)");

    // Main circle
    nodeEl.append("circle")
      .attr("r", 22)
      .attr("fill", (d: GraphNode) => CATEGORY_COLOR[d.category] + "18")
      .attr("stroke", (d: GraphNode) => CATEGORY_COLOR[d.category])
      .attr("stroke-width", 1.5);

    // Label
    nodeEl.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.15em")
      .attr("font-size", "9.5")
      .attr("font-family", "Inter, sans-serif")
      .attr("fill", (d: GraphNode) => CATEGORY_COLOR[d.category])
      .attr("pointer-events", "none")
      .text((d: GraphNode) => (d.label.length > 13 ? d.label.slice(0, 13) + "…" : d.label));

    // Category tag
    nodeEl.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "1.6em")
      .attr("font-size", "7")
      .attr("font-family", "Inter, sans-serif")
      .attr("fill", (d: GraphNode) => CATEGORY_COLOR[d.category] + "70")
      .attr("pointer-events", "none")
      .text((d: GraphNode) => d.category.toUpperCase());

    // Hover
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

    // Tick
    sim.on("tick", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      linkEl
        .attr("x1", (d: any) => d.source.x ?? 0)
        .attr("y1", (d: any) => d.source.y ?? 0)
        .attr("x2", (d: any) => d.target.x ?? 0)
        .attr("y2", (d: any) => d.target.y ?? 0);
      nodeEl.attr("transform", (d: GraphNode) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => { sim.stop(); };
  }, [entities, text]);

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center"><Spinner /></div>;
  }

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden">
      {entities.length === 0 ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[#2a2a2a]">
          <Share2 size={28} />
          <p className="text-[11.5px]">No entities detected — load a document with sensitive content</p>
        </div>
      ) : (
        <>
          <svg ref={svgRef} className="w-full h-full" />
          {/* Legend overlay */}
          <div className="absolute top-4 right-4 flex flex-col gap-1.5 glass-sm rounded-xl px-3 py-2.5 text-[10px]">
            {(["phi", "ip", "mnpi"] as const).map((cat) => (
              <div key={cat} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLOR[cat] }} />
                <span style={{ color: CATEGORY_COLOR[cat] }}>{cat.toUpperCase()}</span>
              </div>
            ))}
            <div className="mt-1 pt-1 border-t border-white/5 text-[#2a2a2a]">
              drag · scroll to zoom
            </div>
          </div>
          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute pointer-events-none glass-sm rounded-lg px-3 py-2 text-[10.5px] z-50"
              style={{ left: tooltip.x + 12, top: tooltip.y }}
            >
              <p style={{ color: CATEGORY_COLOR[tooltip.category] }} className="font-semibold">{tooltip.label}</p>
              <p className="text-[#555]">{tooltip.category.toUpperCase()} · {tooltip.sub}</p>
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
        <p className="text-[11px] text-[#3a3a3a] mb-3">Each clause shows which NGSP routing path handles it.</p>
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
              <div className="flex-1 py-2 px-3 rounded-xl transition-all duration-150 doc-text text-[#c0c0c0] group-hover:bg-white/[0.02]">
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
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[#2a2a2a] select-none">
        <ClipboardList size={28} />
        <div className="text-center">
          <p className="text-[12px] font-medium text-[#333]">No requests yet</p>
          <p className="text-[10.5px] text-[#2a2a2a] mt-1">Send a message via the AI Agent to generate audit entries.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="max-w-2xl">
        <p className="text-[9.5px] text-[#333] uppercase tracking-widest font-semibold mb-4">Session Audit Log</p>
        <div className="space-y-2">
          {[...auditLog].reverse().map((entry, i) => {
            const style = ROUTE_STYLE[entry.route] ?? { label: entry.route, cls: "text-[#555] bg-white/5 border-white/10" };
            const ts = new Date(entry.timestamp);
            const timeStr = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            return (
              <div key={entry.audit_id} className="flex items-start gap-3 p-3 rounded-xl glass transition-all duration-150 hover:bg-white/[0.03]">
                {/* Index */}
                <span className="text-[9px] text-[#2a2a2a] font-mono w-5 text-right shrink-0 mt-0.5">
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
                    <span className="text-[9px] text-[#2e2e2e] font-mono tabular ml-auto">{timeStr}</span>
                  </div>
                  <p className="text-[10.5px] text-[#4a4a4a] mt-1">
                    {entry.entities_count} entit{entry.entities_count === 1 ? "y" : "ies"} proxied
                    <span className="mx-1 text-[#222]">·</span>
                    <span className="font-mono text-[#2a2a2a] text-[9px]">{entry.audit_id.slice(0, 12)}…</span>
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
        <div key={i} className={`h-2.5 rounded-sm ${dim ? "bg-[#191919]" : "bg-[#1d1d1d]"}`} style={{ width: `${w * 100}%` }} />
      ))}
    </div>
  );
}

function Spinner() {
  return (
    <div className="loading-dots text-[#333] flex gap-1.5">
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
          ? "bg-surface text-[#c8c8c8]"
          : "bg-transparent text-[#4a4a4a] hover:text-[#777]"
      }`}
      style={{ borderRight: "1px solid rgba(255,255,255,0.04)" }}
    >
      {active && <div className="absolute top-0 left-0 right-0 h-px bg-[#0078d4]/70" />}
      <Icon size={12} className={active ? "text-[#888] shrink-0" : "text-[#333] shrink-0"} />
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
            : "bg-[#181818] border-[#252525] text-[#383838] hover:text-[#555] hover:border-[#2e2e2e]"
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
