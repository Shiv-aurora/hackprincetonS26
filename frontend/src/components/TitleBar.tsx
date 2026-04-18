import { Layout, Split, MoreHorizontal, X, Minus, Square } from 'lucide-react';

export default function TitleBar() {
  return (
    <header className="h-8 bg-[#1f1f1f] flex items-center justify-between px-3 z-50 shrink-0 border-b border-vscode-border select-none">
      <div className="flex items-center gap-4 h-full">
        <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-primary-container rounded-sm flex items-center justify-center p-0.5">
                <Layout size={10} className="text-white" />
            </div>
            <div className="flex items-center gap-2 text-[12px] text-[#969696]">
                <span>File</span>
                <span>Edit</span>
                <span>Selection</span>
                <span>View</span>
                <span>Go</span>
            </div>
        </div>
      </div>

      <div className="flex-1 flex justify-center h-full items-center">
        <div className="bg-[#2c2c2c] px-24 py-0.5 rounded-md border border-[#3e3e3e] text-[11px] text-[#cccccc] flex items-center gap-2 min-w-[300px] max-w-[600px] justify-center hover:bg-[#323232] cursor-default transition-colors">
            <span>Sovereign_OS</span>
            <span className="text-zinc-600">—</span>
            <span>SAE_Narrative_Draft_001.txt</span>
        </div>
      </div>

      <div className="flex items-center gap-4 h-full">
        <div className="flex items-center gap-1">
            <button className="text-[#cccccc] hover:bg-white/10 p-1.5 rounded transition-colors"><Split size={14} /></button>
            <button className="text-[#cccccc] hover:bg-white/10 p-1.5 rounded transition-colors"><MoreHorizontal size={14} /></button>
        </div>
        <div className="flex items-center">
            <button className="text-[#cccccc] hover:bg-white/10 px-3 h-full transition-colors"><Minus size={14} /></button>
            <button className="text-[#cccccc] hover:bg-white/10 px-3 h-full transition-colors"><Square size={12} /></button>
            <button className="text-[#cccccc] hover:bg-[#e81123] px-3 h-full transition-colors"><X size={14} /></button>
        </div>
      </div>
    </header>
  );
}
