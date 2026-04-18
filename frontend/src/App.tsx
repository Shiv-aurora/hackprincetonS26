/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef, type MouseEvent } from "react";
import ActivityBar from "./components/ActivityBar";
import SideBar from "./components/SideBar";
import TitleBar from "./components/TitleBar";
import Workspace from "./components/Workspace";
import AssistantPanel from "./components/AssistantPanel";
import StatusBar from "./components/StatusBar";
import type { EntityItem, ProxyResponse, SessionStats, RouteResponse } from "./lib/api";
import { analyzeDocument, proxyDocument, fetchAudit, routeDocument } from "./lib/api";
import { DEMO_FILES, type ModelId } from "./lib/demoDocument";

export default function App() {
  // ── Tab / active view ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("RECORDS");
  const [syncScroll, setSyncScroll] = useState(true);

  // ── File management ────────────────────────────────────────────────────────
  const [openFiles, setOpenFiles] = useState<string[]>(["SAE_Narrative_Draft_001.txt"]);
  const [activeFileName, setActiveFileName] = useState("SAE_Narrative_Draft_001.txt");
  const [fileRenames, setFileRenames] = useState<Record<string, string>>({});

  // ── Model selection ────────────────────────────────────────────────────────
  const [selectedModel, setSelectedModel] = useState<ModelId>("claude-opus-4");

  // ── Panel resize ───────────────────────────────────────────────────────────
  const [panelWidth, setPanelWidth] = useState(330);
  const isResizing = useRef(false);

  // ── Hover cross-link (entity ↔ placeholder) ────────────────────────────────
  const [hoveredPlaceholder, setHoveredPlaceholder] = useState<string | null>(null);

  // ── Backend data ───────────────────────────────────────────────────────────
  const [entities, setEntities] = useState<EntityItem[]>([]);
  const [proxyData, setProxyData] = useState<ProxyResponse | null>(null);
  const [auditStats, setAuditStats] = useState<SessionStats | null>(null);
  const [routeDecision, setRouteDecision] = useState<RouteResponse | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);

  // ── Load a demo file (analyze + proxy + route) ─────────────────────────────
  const loadFile = useCallback(async (fileName: string) => {
    const file = DEMO_FILES[fileName];
    if (!file) return;

    setActiveFileName(fileName);
    setOpenFiles((prev) =>
      prev.includes(fileName) ? prev : [...prev, fileName]
    );
    setIsLoadingDoc(true);
    setEntities([]);
    setProxyData(null);
    setRouteDecision(null);

    try {
      const [analyzeResult, proxyResult, routeResult] = await Promise.all([
        analyzeDocument(file.content),
        proxyDocument(file.content),
        routeDocument(file.content),
      ]);
      setEntities(analyzeResult.entities);
      setProxyData(proxyResult);
      setRouteDecision(routeResult);
      setBackendError(null);
    } catch {
      setBackendError(
        "Backend not running. Start with: uvicorn backend.main:app --port 8000"
      );
    } finally {
      setIsLoadingDoc(false);
    }
  }, []);

  // ── Rename a file (in-memory display name only) ────────────────────────────
  const handleFileRename = useCallback(
    (originalName: string, newDisplayName: string) => {
      setFileRenames((prev) => ({ ...prev, [originalName]: newDisplayName }));
    },
    []
  );

  // ── Close a tab (keep at least one open) ──────────────────────────────────
  const handleTabClose = useCallback(
    (fileName: string) => {
      setOpenFiles((prev) => {
        if (prev.length <= 1) return prev; // never close last tab
        const next = prev.filter((f) => f !== fileName);
        if (activeFileName === fileName) {
          setActiveFileName(next[next.length - 1]);
        }
        return next;
      });
    },
    [activeFileName]
  );

  // ── Switch active tab (load if switching to a different file) ─────────────
  const handleTabChange = useCallback(
    (fileName: string) => {
      if (fileName === activeFileName) return;
      loadFile(fileName);
    },
    [activeFileName, loadFile]
  );

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadFile("SAE_Narrative_Draft_001.txt");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Poll audit stats every 5 s ────────────────────────────────────────────
  const refreshAudit = useCallback(async () => {
    try {
      const data = await fetchAudit();
      setAuditStats(data.session_stats);
    } catch {
      // silently ignore — backend may be starting
    }
  }, []);

  useEffect(() => {
    refreshAudit();
    const id = setInterval(refreshAudit, 5000);
    return () => clearInterval(id);
  }, [refreshAudit]);

  // ── Panel resize via mouse drag ───────────────────────────────────────────
  const handleResizeStart = useCallback((e: MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const next = window.innerWidth - e.clientX;
      setPanelWidth(Math.max(260, Math.min(Math.round(window.innerWidth * 0.55), next)));
    };
    const onUp = () => {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ── Current document content ──────────────────────────────────────────────
  const currentDocument =
    proxyData?.original ?? DEMO_FILES[activeFileName]?.content ?? "";

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-surface">
      <TitleBar entities={entities} auditStats={auditStats} />

      <div className="flex flex-1 overflow-hidden">
        <ActivityBar activeTab={activeTab} onTabChange={setActiveTab} />

        <SideBar
          activeTab={activeTab}
          auditStats={auditStats}
          openFiles={openFiles}
          activeFileName={activeFileName}
          fileRenames={fileRenames}
          onLoadDocument={loadFile}
          onFileRename={handleFileRename}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />

        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {backendError && (
            <div className="shrink-0 px-4 py-2 glass-warning text-[11.5px] text-[#f48771] font-mono tracking-tight">
              ⚠ {backendError}
            </div>
          )}
          <div className="flex flex-1 overflow-hidden">
            <Workspace
              syncScroll={syncScroll}
              onToggleSync={() => setSyncScroll((s) => !s)}
              entities={entities}
              proxyData={proxyData}
              isLoading={isLoadingDoc}
              hoveredPlaceholder={hoveredPlaceholder}
              onHoverPlaceholder={setHoveredPlaceholder}
              openFiles={openFiles}
              activeFileName={activeFileName}
              fileRenames={fileRenames}
              onTabChange={handleTabChange}
              onTabClose={handleTabClose}
              onFileRename={handleFileRename}
            />

            {/* Drag-to-resize handle */}
            <div
              className="resize-handle"
              onMouseDown={handleResizeStart}
              title="Drag to resize"
            />

            <AssistantPanel
              routeDecision={routeDecision}
              onRequestComplete={refreshAudit}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              currentDocument={currentDocument}
              fileKey={activeFileName}
              style={{ width: panelWidth, minWidth: panelWidth, maxWidth: panelWidth }}
            />
          </div>
        </main>
      </div>

      <StatusBar />
    </div>
  );
}
