// Chat view wrapper — delegates to the existing AssistantPanel component.
import type React from "react";
import type { ViewProps } from "../ViewRegistry";
import AssistantPanel from "../../components/AssistantPanel";
import { useState, useCallback } from "react";
import { fetchAudit } from "../../lib/api";
import type { RouteResponse } from "../../lib/api";
import type { ModelId } from "../../lib/demoDocument";
import { DEMO_FILES } from "../../lib/demoDocument";

// Wraps AssistantPanel so it can be mounted as a view inside the pane container.
export const ChatView: React.FC<ViewProps & { uiMode?: "work" | "chat" }> = ({
  uiMode = "work",
}) => {
  const [selectedModel, setSelectedModel] = useState<ModelId>("claude-opus-4");
  const [routeDecision] = useState<RouteResponse | null>(null);
  const defaultFile = "SAE_Narrative_Draft_001.txt";
  const currentDocument = DEMO_FILES[defaultFile]?.content ?? "";

  // Refresh audit stats after each completion call.
  const refreshAudit = useCallback(async () => {
    try {
      await fetchAudit();
    } catch {
      // ignore; demo mode is self-contained
    }
  }, []);

  return (
    <AssistantPanel
      routeDecision={routeDecision}
      onRequestComplete={refreshAudit}
      selectedModel={selectedModel}
      onModelChange={setSelectedModel}
      currentDocument={currentDocument}
      fileKey={defaultFile}
      uiMode={uiMode}
      style={{ width: "100%", height: "100%", minWidth: 0 }}
    />
  );
};
