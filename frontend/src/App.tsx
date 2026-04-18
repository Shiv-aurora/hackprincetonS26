/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";
import ActivityBar from "./components/ActivityBar";
import SideBar from "./components/SideBar";
import TitleBar from "./components/TitleBar";
import Workspace from "./components/Workspace";
import AssistantPanel from "./components/AssistantPanel";
import StatusBar from "./components/StatusBar";
import type { EntityItem, ProxyResponse, SessionStats } from "./lib/api";
import { analyzeDocument, proxyDocument, fetchAudit } from "./lib/api";
import { DEMO_DOCUMENT } from "./lib/demoDocument";

export default function App() {
  const [activeTab, setActiveTab] = useState("RECORDS");
  const [syncScroll, setSyncScroll] = useState(true);

  // Placeholder string of the currently hovered entity (syncs document ↔ proxy panes).
  const [hoveredPlaceholder, setHoveredPlaceholder] = useState<string | null>(null);

  // Data loaded from the backend on mount.
  const [entities, setEntities] = useState<EntityItem[]>([]);
  const [proxyData, setProxyData] = useState<ProxyResponse | null>(null);
  const [auditStats, setAuditStats] = useState<SessionStats | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);

  // Load the demo document analysis and proxy on first render.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [analyzeResult, proxyResult] = await Promise.all([
          analyzeDocument(DEMO_DOCUMENT),
          proxyDocument(DEMO_DOCUMENT),
        ]);
        if (!cancelled) {
          setEntities(analyzeResult.entities);
          setProxyData(proxyResult);
          setBackendError(null);
        }
      } catch {
        if (!cancelled) {
          setBackendError(
            "Backend not running. Start with: uvicorn backend.main:app --port 8000"
          );
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Refresh audit stats (called on mount, every 5 s, and after each /api/complete call).
  const refreshAudit = useCallback(async () => {
    try {
      const data = await fetchAudit();
      setAuditStats(data.session_stats);
    } catch {
      // Silently ignore — backend may still be starting.
    }
  }, []);

  useEffect(() => {
    refreshAudit();
    const interval = setInterval(refreshAudit, 5000);
    return () => clearInterval(interval);
  }, [refreshAudit]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-surface">
      <TitleBar entities={entities} auditStats={auditStats} />
      <div className="flex flex-1 overflow-hidden">
        <ActivityBar activeTab={activeTab} onTabChange={setActiveTab} />
        <SideBar activeTab={activeTab} />
        <main className="flex-1 flex flex-col overflow-hidden">
          {backendError && (
            <div className="shrink-0 px-4 py-2 bg-[#5a1d1d] border-b border-[#be1100] text-[12px] text-[#f48771] font-mono">
              ⚠ {backendError}
            </div>
          )}
          <div className="flex-1 flex overflow-hidden">
            <Workspace
              syncScroll={syncScroll}
              onToggleSync={() => setSyncScroll(!syncScroll)}
              entities={entities}
              proxyData={proxyData}
              hoveredPlaceholder={hoveredPlaceholder}
              onHoverPlaceholder={setHoveredPlaceholder}
            />
            <AssistantPanel onRequestComplete={refreshAudit} />
          </div>
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
