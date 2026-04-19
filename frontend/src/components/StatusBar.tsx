import { GitBranch, Bell, CheckCircle2, Command } from "lucide-react";

export default function StatusBar() {
  return (
    <footer className="h-[22px] bg-vscode-status flex items-center justify-between px-2 shrink-0 select-none overflow-hidden">
      {/* Left cluster */}
      <div className="flex items-center h-full">
        <div className="flex items-center gap-1 px-2 h-full hover:bg-white/10 cursor-pointer transition-colors duration-100">
          <Command size={10} />
          <span className="text-[10px] font-medium tracking-tight text-white/90">Clinical_Actions</span>
        </div>
        <div className="flex items-center gap-1 px-2 h-full hover:bg-white/10 cursor-pointer transition-colors duration-100 text-white/80">
          <GitBranch size={11} />
          <span className="text-[10px] font-medium tracking-tight">main</span>
        </div>
        <div className="flex items-center gap-1 px-2 h-full text-white/60">
          <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
          <span className="text-[10px] tracking-tight">Synchronized</span>
        </div>
        <div className="flex items-center h-full text-white/50 text-[10px]">
          <div className="flex items-center px-2 h-full hover:bg-white/10 cursor-pointer transition-colors duration-100">
            <span>0</span>
          </div>
          <div className="flex items-center px-2 h-full hover:bg-white/10 cursor-pointer transition-colors duration-100">
            <span>0</span>
          </div>
        </div>
      </div>

      {/* Right cluster */}
      <div className="flex items-center h-full text-white/70">
        <div className="flex items-center px-2 h-full hover:bg-white/10 cursor-pointer transition-colors duration-100">
          <span className="text-[10px]">Spaces: 2</span>
        </div>
        <div className="flex items-center px-2 h-full hover:bg-white/10 cursor-pointer transition-colors duration-100">
          <span className="text-[10px]">UTF-8</span>
        </div>
        <div className="flex items-center px-2 h-full hover:bg-white/10 cursor-pointer transition-colors duration-100">
          <span className="text-[10px]">Plain Text</span>
        </div>
        <div className="flex items-center gap-1 px-2 h-full hover:bg-white/10 cursor-pointer transition-colors duration-100">
          <CheckCircle2 size={10} className="text-white/60" />
          <span className="text-[10px]">Prettier</span>
        </div>
        <div className="flex items-center px-2 h-full hover:bg-white/10 cursor-pointer transition-colors duration-100">
          <Bell size={11} />
        </div>
      </div>
    </footer>
  );
}
