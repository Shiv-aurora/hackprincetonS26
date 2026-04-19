/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// App: root component — wraps the full shell with LayoutProvider, ReviewerContextProvider, and wires TitleBar, ActivityBar, SplitterGroup, and BottomDock.
import { Component, useState, type ReactNode, type ErrorInfo } from "react";
import TitleBar from "./components/TitleBar";
import ActivityBar from "./components/ActivityBar";
import { SplitterGroup } from "./layout/SplitterGroup";
import { BottomDock } from "./layout/BottomDock";
import { LayoutProvider, useLayoutState } from "./layout/useLayoutState";
import { ChatView } from "./layout/placeholders/ChatView";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { ReviewerContextProvider } from "./views/reviewer/ReviewerContext";
import { AuthProvider } from "./lib/auth";
import AuthGate from "./components/AuthGate";

// Catches unhandled render errors and shows a readable message instead of a blank screen.
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("App crash:", error, info); }
  render() {
    if (this.state.error) {
      const msg = (this.state.error as Error).message;
      return (
        <div style={{ background: "#0d1117", color: "#f48771", fontFamily: "monospace", padding: 32, minHeight: "100vh" }}>
          <strong>App crashed — open DevTools console for full trace.</strong>
          <pre style={{ marginTop: 16, whiteSpace: "pre-wrap", fontSize: 13 }}>{msg}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Inner shell that has access to LayoutProvider context.
function AppShell() {
  const { layout, persona, toggleDock, setDockHeight } = useLayoutState();
  const [uiMode, setUiMode] = useState<"work" | "chat">("work");

  // Register all global keyboard shortcuts.
  useKeyboardShortcuts();

  return (
    <div className="app-shell flex h-screen w-screen flex-col overflow-hidden">
      <TitleBar
        uiMode={uiMode}
        onModeChange={setUiMode}
      />

      <main className="relative flex flex-1 overflow-hidden min-h-0">
        {uiMode === "chat" ? (
          <div className="flex flex-1 overflow-hidden min-h-0">
            <ChatView paneSlot="main" persona={persona} uiMode="chat" />
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden min-h-0">
            <ActivityBar />
            <SplitterGroup layout={layout} persona={persona} />
          </div>
        )}
      </main>

      {uiMode === "work" && (
        <BottomDock
          expanded={layout.bottomDockExpanded}
          heightPct={layout.bottomDockHeightPct}
          onToggle={toggleDock}
          onResize={setDockHeight}
        />
      )}
    </div>
  );
}

// Root export — wraps AppShell in auth, layout, and reviewer context providers.
export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AuthGate>
          <LayoutProvider>
            <ReviewerContextProvider>
              <AppShell />
            </ReviewerContextProvider>
          </LayoutProvider>
        </AuthGate>
      </AuthProvider>
    </ErrorBoundary>
  );
}
