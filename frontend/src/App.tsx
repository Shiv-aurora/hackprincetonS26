/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef, type MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ActivityBar from "./components/ActivityBar";
import SideBar from "./components/SideBar";
import TitleBar from "./components/TitleBar";
import Workspace from "./components/Workspace";
import AssistantPanel from "./components/AssistantPanel";
import type { EntityItem, ProxyResponse, SessionStats, RouteResponse, AuditLogEntry } from "./lib/api";
import { analyzeDocument, proxyDocument, fetchAudit, routeDocument } from "./lib/api";
import { DEMO_FILES, type ModelId } from "./lib/demoDocument";

type UIMode = "work" | "chat";

export default function App() {
  const [activeTab, setActiveTab] = useState("RECORDS");
  const [syncScroll, setSyncScroll] = useState(true);
  const [uiMode, setUiMode] = useState<UIMode>("work");

  const [openFiles, setOpenFiles] = useState<string[]>(["SAE_Narrative_Draft_001.txt"]);
  const [activeFileName, setActiveFileName] = useState("SAE_Narrative_Draft_001.txt");
  const [fileRenames, setFileRenames] = useState<Record<string, string>>({});

  const [selectedModel, setSelectedModel] = useState<ModelId>("claude-opus-4");
  const [panelWidth, setPanelWidth] = useState(() => Math.round(window.innerWidth * 0.38));

  const [hoveredPlaceholder, setHoveredPlaceholder] = useState<string | null>(null);

  const [entities, setEntities] = useState<EntityItem[]>([]);
  const [proxyData, setProxyData] = useState<ProxyResponse | null>(null);
  const [auditStats, setAuditStats] = useState<SessionStats | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [routeDecision, setRouteDecision] = useState<RouteResponse | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);

  const loadFile = useCallback(async (fileName: string) => {
    const file = DEMO_FILES[fileName];
    if (!file) return;

    setActiveFileName(fileName);
    setOpenFiles((prev) => (prev.includes(fileName) ? prev : [...prev, fileName]));
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
      setBackendError("Something went wrong while loading the document.");
    } finally {
      setIsLoadingDoc(false);
    }
  }, []);

  const handleFileRename = useCallback((originalName: string, newDisplayName: string) => {
    setFileRenames((prev) => ({ ...prev, [originalName]: newDisplayName }));
  }, []);

  const handleTabClose = useCallback((fileName: string) => {
    setOpenFiles((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((item) => item !== fileName);
      if (activeFileName === fileName) setActiveFileName(next[next.length - 1]);
      return next;
    });
  }, [activeFileName]);

  const handleTabChange = useCallback((fileName: string) => {
    if (fileName !== activeFileName) loadFile(fileName);
  }, [activeFileName, loadFile]);

  useEffect(() => {
    loadFile("SAE_Narrative_Draft_001.txt");
  }, [loadFile]);

  const refreshAudit = useCallback(async () => {
    try {
      const data = await fetchAudit();
      setAuditStats(data.session_stats);
      setAuditLog(data.log ?? []);
    } catch {
      // ignore; demo fallback already handles most cases
    }
  }, []);

  useEffect(() => {
    refreshAudit();
    const id = setInterval(refreshAudit, 5000);
    return () => clearInterval(id);
  }, [refreshAudit]);

  const isResizing = useRef(false);

  const handleResizeStart = useCallback((e: MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMove = (e: globalThis.MouseEvent) => {
      if (!isResizing.current) return;
      const next = window.innerWidth - e.clientX;
      setPanelWidth(Math.max(360, Math.min(Math.round(window.innerWidth * 0.56), next)));
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

  const currentDocument = proxyData?.original ?? DEMO_FILES[activeFileName]?.content ?? "";
  const entityCounts = {
    phi: entities.filter((item) => item.category === "phi").length,
    ip: entities.filter((item) => item.category === "ip").length,
    mnpi: entities.filter((item) => item.category === "mnpi").length,
  };

  return (
    <div className="app-shell flex h-screen w-screen flex-col overflow-hidden bg-surface">
      <TitleBar
        entities={entities}
        auditStats={auditStats}
        activeFileName={activeFileName}
        fileRenames={fileRenames}
        uiMode={uiMode}
        onModeChange={setUiMode}
      />

      <main className="relative flex flex-1 overflow-hidden min-h-0">
        {backendError && (
          <div className="absolute left-4 right-4 top-4 z-40 rounded-2xl surface-alert px-4 py-3 text-[12.5px] font-medium text-[#f8b2a2]">
            ⚠ {backendError}
          </div>
        )}

        <AnimatePresence mode="wait" initial={false}>
          {uiMode === "work" ? (
            <motion.div
              key="work-mode"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="flex flex-1 overflow-hidden"
            >
              <ActivityBar activeTab={activeTab} onTabChange={setActiveTab} />

              <SideBar
                activeTab={activeTab}
                auditStats={auditStats}
                entityCounts={entityCounts}
                openFiles={openFiles}
                activeFileName={activeFileName}
                fileRenames={fileRenames}
                onLoadDocument={loadFile}
                onFileRename={handleFileRename}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
              />

              <div className="surface-main flex min-w-0 flex-1 overflow-hidden">
                <Workspace
                  syncScroll={syncScroll}
                  onToggleSync={() => setSyncScroll((value) => !value)}
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
                  routeDecision={routeDecision}
                  auditLog={auditLog}
                />

                <div className="resize-handle" onMouseDown={handleResizeStart} title="Drag to resize" />

                <AssistantPanel
                  routeDecision={routeDecision}
                  onRequestComplete={refreshAudit}
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  currentDocument={currentDocument}
                  fileKey={activeFileName}
                  uiMode={uiMode}
                  style={{ width: panelWidth, minWidth: panelWidth, maxWidth: panelWidth }}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="chat-mode"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="surface-main flex flex-1 overflow-hidden px-5 py-5 md:px-8 md:py-7"
            >
              <div className="mx-auto flex h-full w-full max-w-[1180px] overflow-hidden rounded-[28px] border border-white/[0.06] bg-[#0f1114] shadow-[0_30px_80px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.03)]">
                <AssistantPanel
                  routeDecision={routeDecision}
                  onRequestComplete={refreshAudit}
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  currentDocument={currentDocument}
                  fileKey={activeFileName}
                  uiMode={uiMode}
                  style={{ width: "100%", minWidth: "100%", maxWidth: "100%", height: "100%" }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
