import { RefreshCcw, X, Info, FileText } from 'lucide-react';
import { useRef, useEffect, ReactNode } from 'react';

interface WorkspaceProps {
  syncScroll: boolean;
  onToggleSync: () => void;
}

export default function Workspace({ syncScroll, onToggleSync }: WorkspaceProps) {
  const originalRef = useRef<HTMLDivElement>(null);
  const proxiedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!syncScroll) return;

    const original = originalRef.current;
    const proxied = proxiedRef.current;

    if (!original || !proxied) return;

    const handleOriginalScroll = () => {
      proxied.scrollTop = original.scrollTop;
    };

    const handleProxiedScroll = () => {
      original.scrollTop = proxied.scrollTop;
    };

    original.addEventListener('scroll', handleOriginalScroll);
    proxied.addEventListener('scroll', handleProxiedScroll);

    return () => {
      original.removeEventListener('scroll', handleOriginalScroll);
      proxied.removeEventListener('scroll', handleProxiedScroll);
    };
  }, [syncScroll]);

  return (
    <section className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
      {/* Editor Tabs */}
      <div className="h-9 flex bg-[#252526] overflow-x-auto no-scrollbar shrink-0 border-b border-vscode-border">
        <Tab name="SAE_Narrative_Draft_001.txt" active />
        <Tab name="patient_records.csv" />
        <Tab name="extraction_rules.json" />
      </div>

      {/* Editor Breadcrumbs */}
      <div className="h-6 flex items-center px-4 bg-[#1e1e1e] text-[11px] text-[#969696] gap-1 shrink-0">
        <span className="hover:text-white cursor-pointer transition-colors">Sovereign_OS</span>
        <span className="text-[#969696]/50 select-none">&gt;</span>
        <span className="hover:text-white cursor-pointer transition-colors">SAE_Narrative_Draft_001.txt</span>
      </div>

      {/* Toolbar (VS Code Style) */}
      <div className="h-9 border-b border-vscode-border flex items-center justify-between px-4 bg-[#1e1e1e] shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-[#6a9955] uppercase font-bold tracking-tighter">SOURCE_TEXT</span>
          <div className="h-3 w-px bg-vscode-border"></div>
          <button 
            onClick={onToggleSync}
            className={`font-mono text-[11px] flex items-center gap-1 transition-colors ${syncScroll ? 'text-primary-fixed' : 'text-zinc-600'}`}
          >
            <RefreshCcw size={12} /> Sync_Scroll: {syncScroll ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-phi"></div> <span className="text-[10px] text-zinc-500">PHI</span></span>
            <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-ip"></div> <span className="text-[10px] text-zinc-500">IP</span></span>
            <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-mnpi"></div> <span className="text-[10px] text-zinc-500">MNPI</span></span>
            <div className="h-3 w-px bg-vscode-border ml-1"></div>
            <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-[#dcdcaa]"></div> <span className="text-[10px] text-zinc-500">DIAGNOSIS</span></span>
            <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-[#b5cea8]"></div> <span className="text-[10px] text-zinc-500">PROCEDURE</span></span>
        </div>
      </div>

      {/* Document Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Original Text */}
        <div 
          ref={originalRef}
          className="flex-1 overflow-y-auto font-mono text-[13px] leading-relaxed relative bg-[#1e1e1e]"
        >
          <div className="flex min-h-full">
            {/* Gutter */}
            <div className="w-10 bg-[#1e1e1e] border-r border-vscode-border flex flex-col items-center pt-8 text-[#858585] text-[12px] select-none sticky left-0 shrink-0">
               {Array.from({length: 40}).map((_, i) => (
                 <div key={i} className="h-6 leading-relaxed">{i + 1}</div>
               ))}
            </div>

            <div className="flex-1 p-8">
                <div className="max-w-2xl space-y-6">
                    <p className="text-[#cccccc]">
                        Patient <Highlight type="phi">John Doe</Highlight> (DOB: <Highlight type="phi">04/12/1975</Highlight>), a 48-year-old male, was enrolled in the phase III trial for <Highlight type="ip">Project Titan</Highlight> at site <Highlight type="phi">Massachusetts General Hospital</Highlight>.
                    </p>

                    <p className="text-[#cccccc]">
                        On <Highlight type="phi">October 15, 2023</Highlight>, the subject presented to the <Highlight type="phi">emergency department</Highlight> with complaints of <Highlight type="diagnosis">severe abdominal pain</Highlight>. The subject had been receiving <Highlight active>BMS-986253</Highlight> at a dose of 10mg/kg bi-weekly.
                    </p>

                    <p className="text-[#cccccc]">
                        Initial lab results indicated <Highlight type="diagnosis">elevated liver enzymes</Highlight> (ALT: 450 U/L, AST: 380 U/L). The principal investigator, <Highlight type="phi">Dr. Sarah Jenkins</Highlight>, assessed the event as possibly related to the study drug. <Highlight type="procedure">Unblinding procedures</Highlight> were initiated following protocol <Highlight type="ip">T-889-Alpha</Highlight>.
                    </p>

                    <p className="text-[#cccccc]">
                        Note regarding <Highlight type="mnpi">Q4 Earnings Impact</Highlight>: Potential delay in regulatory submission for the <Highlight type="ip">Gastro-oncology portfolio</Highlight> if safety signal is confirmed across broader cohort.
                    </p>
                </div>
            </div>
          </div>
        </div>

        {/* Proxied Text */}
        <div 
          ref={proxiedRef}
          className="flex-1 overflow-y-auto bg-[#1e1e1e] font-mono text-[13px] border-l border-vscode-border"
        >
          <div className="flex min-h-full">
             <div className="w-10 bg-[#1e1e1e] border-r border-vscode-border flex flex-col items-center pt-8 text-[#858585] text-[12px] select-none sticky left-0 shrink-0">
               {Array.from({length: 40}).map((_, i) => (
                 <div key={i} className="h-6 leading-relaxed">{i + 1}</div>
               ))}
            </div>
            
            <div className="flex-1 p-8">
                <div className="max-w-2xl space-y-6">
                    <div className="mb-8 p-4 border border-vscode-border bg-[#252526] rounded-md flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-tertiary">
                            <Info size={14} />
                            <span className="text-[11px] font-bold uppercase tracking-wider">Sanitization_Report</span>
                        </div>
                        <p className="text-[11px] text-zinc-500">Security protocol AES-256 applied. All PII data mapped to synthetic tokens.</p>
                    </div>

                    <p className="text-zinc-500">
                        Patient <ProxyToken>&lt;PATIENT_NAME_1&gt;</ProxyToken> (DOB: <ProxyToken>&lt;DATE_1&gt;</ProxyToken>), a 48-year-old male, was enrolled in the phase III trial for <ProxyToken>&lt;PROJECT_NAME_1&gt;</ProxyToken> at site <ProxyToken>&lt;LOCATION_1&gt;</ProxyToken>.
                    </p>

                    <p className="text-zinc-500">
                        On <ProxyToken>&lt;DATE_2&gt;</ProxyToken>, the subject presented to the emergency department with complaints of severe abdominal pain. The subject had been receiving <ProxyToken active>&lt;COMPOUND_X&gt;</ProxyToken> at a dose of 10mg/kg bi-weekly.
                    </p>

                    <p className="text-zinc-500">
                        Initial lab results indicated elevated liver enzymes (ALT: 450 U/L, AST: 380 U/L). The principal investigator, <ProxyToken>&lt;PI_NAME_1&gt;</ProxyToken>, assessed the event as possibly related to the study drug. Unblinding procedures were initiated following protocol <ProxyToken>&lt;PROTOCOL_ID_1&gt;</ProxyToken>.
                    </p>

                    <p className="text-zinc-500">
                        Note regarding <ProxyToken>&lt;BUSINESS_IMPACT_1&gt;</ProxyToken>: Potential delay in regulatory submission for the <ProxyToken>&lt;PORTFOLIO_NAME_1&gt;</ProxyToken> if safety signal is confirmed across broader cohort.
                    </p>
                </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Tab({ name, active }: { name: string; active?: boolean }) {
  return (
    <div className={`h-full min-w-[150px] max-w-[240px] flex items-center px-3 gap-2 cursor-pointer border-r border-[#1e1e1e] group relative ${active ? 'bg-[#1e1e1e] text-white' : 'bg-[#2d2d2d] text-[#969696] hover:bg-[#323232]'}`}>
      <FileText size={16} className={active ? 'text-[#cccccc]' : 'text-[#969696]'} />
      <span className="text-[13px] truncate">{name}</span>
      <button className={`ml-auto p-0.5 rounded-sm hover:bg-white/10 transition-colors ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <X size={12} />
      </button>
      {active && <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-[#969696]/30" />}
    </div>
  );
}

function Highlight({ children, type, active }: { children: ReactNode; type?: 'phi' | 'ip' | 'mnpi' | 'diagnosis' | 'procedure'; active?: boolean }) {
  const colors = {
    phi: 'text-phi',
    ip: 'text-ip',
    mnpi: 'text-mnpi',
    diagnosis: 'text-[#dcdcaa]',
    procedure: 'text-[#b5cea8]',
  };

  return (
    <span className={`cursor-pointer border-b border-transparent transition-all hover:bg-white/5 active:bg-vscode-selection/40 rounded-sm px-0.5 leading-none h-fit inline-block ${active ? 'bg-vscode-selection/40 text-white' : (type ? colors[type] : 'text-[#cccccc]')}`}>
      {children}
    </span>
  );
}

function ProxyToken({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <span className={`px-1 rounded-sm transition-all border font-mono select-none ${
      active 
        ? 'bg-vscode-selection/50 border-primary-container text-white' 
        : 'bg-[#252526] border-vscode-border text-zinc-600 hover:text-zinc-400 hover:border-zinc-700'
    } cursor-pointer inline-block leading-none`}>
      {children}
    </span>
  );
}
