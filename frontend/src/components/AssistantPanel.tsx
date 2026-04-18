import { Bot, User, MoreHorizontal, Copy, Plus, Route, ArrowUp, X, Sparkles, ChevronDown } from 'lucide-react';

export default function AssistantPanel() {
  return (
    <aside className="w-80 flex flex-col bg-surface-container-lowest border-l border-vscode-border shrink-0">
      {/* Header */}
      <div className="h-9 px-4 flex items-center justify-between bg-surface-container-low border-b border-vscode-border shrink-0">
        <span className="text-[11px] font-medium text-[#bbbbbb] uppercase tracking-wider">Assistant</span>
        <div className="flex items-center gap-1">
           <button className="text-[#858585] hover:text-[#cccccc] p-1"><MoreHorizontal size={14} /></button>
           <button className="text-[#858585] hover:text-[#cccccc] p-1"><X size={14} /></button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        {/* User Message */}
        <div className="flex flex-col gap-1.5 group">
          <div className="flex items-center gap-2">
            <User size={12} className="text-[#858585]" />
            <span className="text-[11px] font-bold text-[#cccccc]">USER_98A</span>
          </div>
          <div className="text-[12px] text-[#cccccc] leading-relaxed bg-[#252526] p-3 rounded border border-vscode-border">
            Extract all entities related to the active compound and summarize the adverse event timeline.
          </div>
        </div>

        {/* Assistant Message */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Bot size={12} className="text-tertiary" />
            <span className="text-[11px] font-bold text-tertiary uppercase">Claude_Clinical_4.7</span>
          </div>
          <div className="text-[12px] text-[#cccccc] font-mono bg-[#1e1e1e] p-3 rounded border border-vscode-border">
            <p className="text-[#6a9955] mb-2 font-bold tracking-tighter cursor-default">&gt; EXTRACTION_PROTOCOL_OK</p>
            
            <div className="space-y-1 mb-4 text-[11px]">
              <p><span className="text-[#858585]">ENTITY:</span> &lt;COMPOUND_X&gt;</p>
              <p><span className="text-[#858585]">MAP:</span> BMS-986253</p>
            </div>

            <div className="border-t border-vscode-border pt-3">
              <p className="text-[#969696] mb-2 uppercase text-[10px] font-bold">TIMELINE:</p>
              <div className="space-y-3 pl-3 border-l border-vscode-border">
                <p><span className="text-[#ce9178]">T-0:</span> Subject on 10mg/kg bi-weekly.</p>
                <p><span className="text-[#ce9178]">T+1 (Oct 15):</span> ED presentation, severe pain.</p>
                <p><span className="text-[#ce9178]">T+1 (Labs):</span> ALT 450 U/L, AST 380 U/L.</p>
                <p><span className="text-[#ce9178]">T+2:</span> Unblinding initiated.</p>
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1 bg-surface-container-high hover:bg-[#37373d] border border-vscode-border rounded text-[11px] text-[#858585] hover:text-[#cccccc] transition-colors">
              <Copy size={12} /> Copy
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1 bg-surface-container-high hover:bg-[#37373d] border border-vscode-border rounded text-[11px] text-[#858585] hover:text-[#cccccc] transition-colors">
              <Plus size={12} /> Audit
            </button>
          </div>
        </div>
      </div>

      {/* Input Area */}
      <div className="p-3 border-t border-vscode-border bg-surface-container-low">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 ">
            <Sparkles size={12} className="text-tertiary" />
            <span className="text-[10px] text-[#858585] uppercase font-bold tracking-wider">Extraction_Engine</span>
          </div>
          <button className="flex items-center gap-1 px-1.5 py-0.5 bg-surface-container-high border border-vscode-border rounded text-[10px] text-[#cccccc] hover:bg-[#3c3c3c] transition-colors">
            <span>Claude-4.7-Opus</span>
            <ChevronDown size={10} />
          </button>
        </div>

        <div className="relative">
          <textarea 
            placeholder="Message Clinical Assistant..."
            className="w-full bg-[#3c3c3c] border border-transparent rounded p-2 text-[12px] text-[#cccccc] focus:outline-none focus:border-[#454545] transition-all resize-none"
            rows={3}
          />
          
          <div className="absolute bottom-2 right-2 flex items-center gap-2">
             <button className="bg-surface-container-high text-[#cccccc] p-1 rounded hover:bg-[#454545] border border-vscode-border transition-colors">
                <ArrowUp size={14} />
             </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
