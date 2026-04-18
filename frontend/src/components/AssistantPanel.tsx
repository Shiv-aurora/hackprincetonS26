import {
  Bot,
  User,
  MoreHorizontal,
  Copy,
  ArrowUp,
  X,
  Sparkles,
  ChevronDown,
  AlertTriangle,
  ShieldCheck,
  Edit3,
} from "lucide-react";
import { useState, useRef, useEffect, KeyboardEvent } from "react";
import type { CompleteResponse, RouteResponse } from "../lib/api";
import { completeRequest } from "../lib/api";
import { DEMO_DOCUMENT, DEMO_PROMPT } from "../lib/demoDocument";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  routing?: { path: string; rationale: string };
  entitiesProxied?: number;
}

interface AssistantPanelProps {
  routeDecision: RouteResponse | null;
  onRequestComplete: () => void;
}

export default function AssistantPanel({
  routeDecision,
  onRequestComplete,
}: AssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState(DEMO_PROMPT);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // dp_tolerant acknowledgement: user must confirm before Send is enabled.
  const [dpAcknowledged, setDpAcknowledged] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reset acknowledgement each time input changes (new request needs fresh consent).
  useEffect(() => {
    setDpAcknowledged(false);
  }, [inputValue]);

  const isDpTolerant = routeDecision?.path === "dp_tolerant";
  const sendEnabled = !isLoading && inputValue.trim().length > 0 && (!isDpTolerant || dpAcknowledged);

  async function handleSend() {
    const prompt = inputValue.trim();
    if (!sendEnabled || !prompt) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setDpAcknowledged(false);
    setIsLoading(true);
    setError(null);

    try {
      const result: CompleteResponse = await completeRequest(
        DEMO_DOCUMENT,
        prompt,
        "claude-opus-4"
      );

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.response_rehydrated,
        routing: result.routing,
        entitiesProxied: result.entities_proxied,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      onRequestComplete();
    } catch {
      setError("Backend not reachable. Start with: uvicorn backend.main:app --port 8000");
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  }

  const routeLabel: Record<string, string> = {
    abstract_extractable: "Abstract",
    dp_tolerant: "DP",
    local_only: "Local",
  };

  const routeColor: Record<string, string> = {
    abstract_extractable: "text-tertiary border-tertiary/30 bg-tertiary/10",
    dp_tolerant: "text-mnpi border-mnpi/30 bg-mnpi/10",
    local_only: "text-ip border-ip/30 bg-ip/10",
  };

  return (
    <aside className="w-80 flex flex-col bg-surface-container-lowest border-l border-vscode-border shrink-0">
      {/* Header */}
      <div className="h-9 px-4 flex items-center justify-between bg-surface-container-low border-b border-vscode-border shrink-0">
        <span className="text-[11px] font-medium text-[#bbbbbb] uppercase tracking-wider">
          AI Assistant
        </span>
        <div className="flex items-center gap-1">
          <button className="text-[#858585] hover:text-[#cccccc] p-1">
            <MoreHorizontal size={14} />
          </button>
          <button
            className="text-[#858585] hover:text-[#cccccc] p-1"
            onClick={() => { setMessages([]); setError(null); }}
            title="Clear conversation"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        {messages.length === 0 && !isLoading && (
          <div className="text-[11px] text-[#858585] space-y-2">
            <p className="text-[#969696] font-mono">Try:</p>
            <p className="font-mono text-[#6a9955]">&gt; Rewrite this in ICH E2B format.</p>
            <p className="font-mono text-[#6a9955]">&gt; Summarize the adverse event timeline.</p>
            <p className="font-mono text-[#6a9955]">&gt; List all sensitive identifiers found.</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col gap-1.5 group">
            {msg.role === "user" ? (
              <>
                <div className="flex items-center gap-2">
                  <User size={12} className="text-[#858585]" />
                  <span className="text-[11px] font-bold text-[#cccccc]">USER</span>
                </div>
                <div className="text-[12px] text-[#cccccc] leading-relaxed bg-[#252526] p-3 rounded border border-vscode-border">
                  {msg.content}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <Bot size={12} className="text-tertiary shrink-0" />
                  <span className="text-[11px] font-bold text-tertiary uppercase">
                    Claude_Clinical
                  </span>
                  {msg.routing && (
                    <span
                      className={`ml-auto text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border font-mono ${
                        routeColor[msg.routing.path] ?? "text-[#858585] border-vscode-border"
                      }`}
                      title={msg.routing.rationale}
                    >
                      {routeLabel[msg.routing.path] ?? msg.routing.path}
                      {msg.entitiesProxied != null && ` · ${msg.entitiesProxied} proxied`}
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-[#cccccc] font-mono bg-[#1e1e1e] p-3 rounded border border-vscode-border whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                  {msg.content}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(msg.content)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-surface-container-high hover:bg-[#37373d] border border-vscode-border rounded text-[11px] text-[#858585] hover:text-[#cccccc] transition-colors"
                  >
                    <Copy size={12} /> Copy
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Bot size={12} className="text-tertiary" />
              <span className="text-[11px] font-bold text-tertiary uppercase">Claude_Clinical</span>
            </div>
            <div className="text-[12px] text-[#969696] font-mono bg-[#1e1e1e] p-3 rounded border border-vscode-border">
              <span className="animate-pulse">Routing through privacy layer…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-[#5a1d1d]/50 border border-[#be1100]/30 rounded">
            <AlertTriangle size={12} className="text-[#f48771] mt-0.5 shrink-0" />
            <p className="text-[11px] text-[#f48771] font-mono">{error}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* dp_tolerant warning banner — shown when document requires DP routing */}
      {isDpTolerant && !dpAcknowledged && inputValue.trim().length > 0 && (
        <div className="shrink-0 mx-3 mb-2 p-3 bg-[#2d2400]/80 border border-mnpi/20 rounded-md">
          <div className="flex items-start gap-2 mb-2.5">
            <AlertTriangle size={12} className="text-mnpi shrink-0 mt-0.5" />
            <p className="text-[11px] text-mnpi leading-relaxed">
              This document contains MNPI that can't be fully abstracted. Proceed with differential-privacy protection?
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setDpAcknowledged(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-mnpi/10 border border-mnpi/30 text-mnpi text-[10px] font-bold uppercase rounded hover:bg-mnpi/20 transition-colors"
            >
              <ShieldCheck size={11} /> Process with DP
            </button>
            <button
              onClick={() => setInputValue("")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-container-high border border-vscode-border text-[#858585] text-[10px] font-bold uppercase rounded hover:text-[#cccccc] transition-colors"
            >
              <Edit3 size={11} /> Edit request
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-3 border-t border-vscode-border bg-surface-container-low shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Sparkles size={12} className="text-tertiary" />
            <span className="text-[10px] text-[#858585] uppercase font-bold tracking-wider">
              Privacy_Engine
            </span>
          </div>
          <button className="flex items-center gap-1 px-1.5 py-0.5 bg-surface-container-high border border-vscode-border rounded text-[10px] text-[#cccccc] hover:bg-[#3c3c3c] transition-colors">
            <span>Claude-Opus-4</span>
            <ChevronDown size={10} />
          </button>
        </div>

        <div className="relative">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message AI Assistant… (⌘↵ to send)"
            disabled={isLoading}
            className="w-full bg-[#3c3c3c] border border-transparent rounded p-2 text-[12px] text-[#cccccc] focus:outline-none focus:border-[#454545] transition-all resize-none disabled:opacity-50"
            rows={3}
          />
          <div className="absolute bottom-2 right-2">
            <button
              onClick={handleSend}
              disabled={!sendEnabled}
              className="bg-surface-container-high text-[#cccccc] p-1 rounded hover:bg-[#454545] border border-vscode-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={
                isDpTolerant && !dpAcknowledged
                  ? "Confirm DP processing above first"
                  : "Send (⌘↵)"
              }
            >
              <ArrowUp size={14} />
            </button>
          </div>
        </div>
        <p className="text-[10px] text-[#858585] mt-1">⌘↵ to send</p>
      </div>
    </aside>
  );
}
