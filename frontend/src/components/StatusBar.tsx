import { GitBranch, Wifi, Bell, CheckCircle2, ChevronRight, Share2, Command } from 'lucide-react';

export default function StatusBar() {
  return (
    <footer className="h-6 bg-vscode-status flex items-center justify-between px-3 shrink-0 text-white select-none">
      <div className="flex items-center h-full gap-4">
        <div className="flex items-center gap-1.5 px-2 h-full hover:bg-white/10 cursor-pointer transition-colors bg-white/5">
            <Command size={12} />
            <span className="text-[11px] font-medium tracking-tighter">Clinical_Actions</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 h-full hover:bg-white/10 cursor-pointer transition-colors">
            <GitBranch size={14} />
            <span className="text-[11px] font-medium tracking-tighter">main*</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 h-full hover:bg-white/10 cursor-pointer transition-colors">
            <Refresh size={14} />
            <span className="text-[11px] font-medium tracking-tighter cursor-default">Synchronized</span>
        </div>
        <div className="flex items-center gap-1.5 h-full">
            <div className="flex items-center gap-1 px-2 h-full hover:bg-white/10 cursor-pointer transition-colors">
                <span className="text-[11px]">0</span>
            </div>
            <div className="flex items-center gap-1 px-2 h-full hover:bg-white/10 cursor-pointer transition-colors">
                <span className="text-[11px]">0</span>
            </div>
        </div>
      </div>

      <div className="flex items-center h-full gap-4">
         <div className="flex items-center gap-1 px-2 h-full hover:bg-white/10 cursor-pointer transition-colors">
            <span className="text-[11px]">Spaces: 4</span>
         </div>
         <div className="flex items-center gap-1 px-2 h-full hover:bg-white/10 cursor-pointer transition-colors">
            <span className="text-[11px]">UTF-8</span>
         </div>
         <div className="flex items-center gap-1 px-2 h-full hover:bg-white/10 cursor-pointer transition-colors">
            <span className="text-[11px]">TypeScript JSX</span>
         </div>
         <div className="flex items-center gap-1 px-2 h-full hover:bg-white/10 cursor-pointer transition-colors">
            <CheckCircle2 size={12} className="text-white/80" />
            <span className="text-[11px]">Prettier</span>
         </div>
         <div className="flex items-center gap-1 px-2 h-full hover:bg-white/10 cursor-pointer transition-colors">
            <Bell size={14} />
         </div>
      </div>
    </footer>
  );
}

function Refresh({ size, className }: { size: number, className?: string }) {
    return (
        <svg 
            width={size} 
            height={size} 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className={className}
        >
            <path d="M21 2v6h-6" />
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M3 22v-6h6" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
    )
}
