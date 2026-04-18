import { ChevronDown, ChevronRight, FileCode, FileText, FolderOpen } from 'lucide-react';

interface SideBarProps {
  activeTab: string;
}

export default function SideBar({ activeTab }: SideBarProps) {
  return (
    <aside className="w-64 bg-surface-container-lowest flex flex-col shrink-0 border-r border-vscode-border">
      <div className="h-9 px-4 flex items-center justify-between">
        <span className="text-[11px] font-medium text-[#bbbbbb] uppercase tracking-wider">Explorer</span>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <div className="group">
          <div className="h-6 flex items-center px-1 bg-surface-container-highest/20 cursor-pointer">
            <ChevronDown size={16} className="text-[#cccccc] mr-1" />
            <span className="text-[11px] font-bold text-[#cccccc] uppercase tracking-tighter">Sovereign_OS</span>
          </div>
          
          <div className="py-1">
             <FileItem name="SAE_Narrative_Draft_001.txt" icon={FileText} active />
             <FileItem name="patient_records.csv" icon={FileCode} />
             <FileItem name="extraction_rules.json" icon={FileCode} />
             
             <div className="h-6 flex items-center px-4 hover:bg-surface-container-high/30 cursor-pointer">
                <ChevronRight size={16} className="text-[#cccccc] mr-1" />
                <FolderOpen size={16} className="text-[#cccccc] mr-2" />
                <span className="text-[13px] text-[#cccccc]">logs</span>
             </div>
          </div>
        </div>

        <div className="mt-4 group px-1">
          <div className="h-6 flex items-center px-1 bg-surface-container-highest/20 cursor-pointer mb-2">
            <ChevronDown size={16} className="text-[#cccccc] mr-1" />
            <span className="text-[11px] font-bold text-[#cccccc] uppercase tracking-tighter">Clinical_Context</span>
          </div>
          <div className="px-4 space-y-3">
             <div className="flex flex-col gap-1">
                <span className="text-[10px] text-[#858585] uppercase">Patient ID</span>
                <span className="text-[12px] text-[#cccccc] font-mono">SUBJ-982-TITAN</span>
             </div>
             <div className="flex flex-col gap-1">
                <span className="text-[10px] text-[#858585] uppercase">Primary Diagnosis</span>
                <span className="text-[12px] text-[#cccccc]">Metastatic Gastric Cancer</span>
             </div>
             <div className="flex flex-col gap-1">
                <span className="text-[10px] text-[#858585] uppercase">Enrollment Date</span>
                <span className="text-[12px] text-[#cccccc] font-mono">2023-08-12</span>
             </div>
             <div className="flex flex-col gap-1">
                <span className="text-[10px] text-[#858585] uppercase">Active Meds</span>
                <div className="flex flex-wrap gap-1">
                   <span className="px-1.5 py-0.5 bg-phi/10 text-phi text-[9px] rounded-sm border border-phi/20">BMS-986253</span>
                   <span className="px-1.5 py-0.5 bg-vscode-border text-[#cccccc] text-[9px] rounded-sm border border-vscode-border">+4 more</span>
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className="mt-auto border-t border-vscode-border p-4 bg-surface-container-lowest/50">
        <div className="text-[10px] text-[#858585] mb-2 uppercase font-bold tracking-tight">System Health</div>
        <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-tertiary" />
            <span className="text-[11px] text-[#cccccc]">Core Node Status: Optimized</span>
        </div>
      </div>
    </aside>
  );
}

function FileItem({ name, icon: Icon, active }: { name: string, icon: any, active?: boolean }) {
  return (
    <div className={`h-6 flex items-center px-4 hover:bg-surface-container-high/30 cursor-pointer ${active ? 'bg-vscode-selection/30 text-white' : 'text-[#cccccc]'}`}>
      <Icon size={16} className={`${active ? 'text-primary-container' : 'text-[#cccccc]'} mr-2`} />
      <span className="text-[13px] truncate">{name}</span>
    </div>
  );
}
