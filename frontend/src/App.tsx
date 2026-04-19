/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// App: root component — wraps the full shell with LayoutProvider, ReviewerContextProvider, and wires TitleBar, ActivityBar, SplitterGroup, and BottomDock.
import TitleBar from "./components/TitleBar";
import ActivityBar from "./components/ActivityBar";
import { SplitterGroup } from "./layout/SplitterGroup";
import { BottomDock } from "./layout/BottomDock";
import { LayoutProvider, useLayoutState } from "./layout/useLayoutState";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { ReviewerContextProvider } from "./views/reviewer/ReviewerContext";

// Inner shell that has access to LayoutProvider context.
function AppShell() {
  const { layout, persona, toggleDock, setDockHeight } = useLayoutState();

  // Register all global keyboard shortcuts.
  useKeyboardShortcuts();

  return (
    <div className="app-shell flex h-screen w-screen flex-col overflow-hidden">
      <TitleBar
        uiMode="work"
        onModeChange={() => {
          // Mode toggle is preserved for future use; persona switching drives layout.
        }}
      />

      <main className="relative flex flex-1 overflow-hidden min-h-0">
        <div className="flex flex-1 overflow-hidden min-h-0">
          <ActivityBar />
          <SplitterGroup layout={layout} persona={persona} />
        </div>
      </main>

      <BottomDock
        expanded={layout.bottomDockExpanded}
        heightPct={layout.bottomDockHeightPct}
        onToggle={toggleDock}
        onResize={setDockHeight}
      />
    </div>
  );
}

// Root export — wraps AppShell in the layout context provider and the reviewer shared context.
export default function App() {
  return (
    <LayoutProvider>
      <ReviewerContextProvider>
        <AppShell />
      </ReviewerContextProvider>
    </LayoutProvider>
  );
}
