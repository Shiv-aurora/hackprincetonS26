/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import ActivityBar from './components/ActivityBar';
import SideBar from './components/SideBar';
import TitleBar from './components/TitleBar';
import Workspace from './components/Workspace';
import AssistantPanel from './components/AssistantPanel';
import StatusBar from './components/StatusBar';

export default function App() {
  const [activeTab, setActiveTab] = useState('RECORDS');
  const [syncScroll, setSyncScroll] = useState(true);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-surface">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <ActivityBar activeTab={activeTab} onTabChange={setActiveTab} />
        <SideBar activeTab={activeTab} />
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex overflow-hidden">
            <Workspace syncScroll={syncScroll} onToggleSync={() => setSyncScroll(!syncScroll)} />
            <AssistantPanel />
          </div>
        </main>
      </div>
    </div>
  );
}
