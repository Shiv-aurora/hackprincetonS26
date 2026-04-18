import {
  Bot,
  User,
  Copy,
  ArrowUp,
  X,
  ChevronDown,
  AlertTriangle,
  ShieldCheck,
  Edit3,
  Check,
} from "lucide-react";
import { useState, useRef, useEffect, KeyboardEvent, CSSProperties } from "react";
import type { CompleteResponse, RouteResponse } from "../lib/api";
import { completeRequest } from "../lib/api";
import { DEMO_FILES, MODEL_LABELS, type ModelId } from "../lib/demoDocument";

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
  selectedModel: ModelId;
  onModelChange: (model: ModelId) => void;
  currentDocument: string;
  fileKey: string;
  style?: CSSProperties;
}

const MODEL_ORDER: ModelId[] = ["claude-opus-4", "gpt-5", "gemini-2"];

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

export default function AssistantPanel({
  routeDecision,
  onRequestComplete,
  selectedModel,
  onModelChange,
  currentDocument,
  fileKey,
  style,
}: AssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dpAcknowledged, setDpAcknowledged] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  // Reset conversation and prompt when active file changes
  useEffect(() => {
    setMessages([]);
    setError(null);
    setDpAcknowledged(false);
    const file = DEMO_FILES[fileKey];
    setInputValue(file?.prompt ?? "");
  }, [fileKey]);

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Reset DP acknowledgement when input changes
  useEffect(() => {
    setDpAcknowledged(false);
  }, [inputValue]);

  // Close model dropdown on outside click
  useEffect(() => {
    if (!modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelOpen]);

  const isDpTolerant = routeDecision?.path === "dp_tolerant";
  const sendEnabled =
    !isLoading && inputValue.trim().length > 0 && (!isDpTolerant || dpAcknowledged);

  async function handleSend() {
    const prompt = inputValue.trim();
    if (!sendEnabled || !prompt) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: prompt };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setDpAcknowledged(false);
    setIsLoading(true);
    setError(null);

    try {
      const result: CompleteResponse = await completeRequest(currentDocument, prompt, selectedModel);
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.response_rehydrated,
        routing: result.routing,
        entitiesProxied: result.entities_proxied,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      onRequestComplete();
    } catch {
      setError("Backend unreachable — run: uvicorn backend.main:app --port 8000");
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

  function copyMessage(id: string, content: string) {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  }

  return (
    <aside
      className="flex flex-col bg-surface-container-lowest border-l border-vscode-border shrink-0 overflow-hidden"
      style={style}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="h-[34px] px-4 flex items-center justify-between bg-[#161616] border-b border-vscode-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
          <span className="text-[11px] font-semibold text-[#c8c8c8] tracking-tight">
            AI Assistant
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="text-[#555] hover:text-[#aaa] p-1.5 rounded transition-colors duration-150"
            onClick={() => { setMessages([]); setError(null); }}
            title="Clear conversation"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── Messages ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-4 pb-8 select-none">
            <div className="w-10 h-10 rounded-xl glass-sm flex items-center justify-center">
              <Bot size={18} className="text-tertiary/70" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-[11.5px] text-[#555] font-medium">Clinical AI ready</p>
              <p className="text-[10.5px] text-[#3a3a3a]">⌘↵ to send</p>
            </div>
            <div className="space-y-1.5 w-full max-w-[200px]">
              {[
                "Rewrite in ICH E2B format.",
                "Summarize the AE timeline.",
                "List all sensitive identifiers.",
              ].map((hint) => (
                <button
                  key={hint}
                  onClick={() => setInputValue(hint)}
                  className="w-full text-left px-2.5 py-1.5 rounded-md glass text-[10.5px] text-[#5a5a5a] hover:text-[#9a9a9a] transition-colors duration-150 leading-snug"
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col gap-1.5 message-enter group">
            {msg.role === "user" ? (
              <>
                <div className="flex items-center gap-1.5">
                  <User size={10} className="text-[#555]" />
                  <span className="text-[10px] font-semibold text-[#666] uppercase tracking-wider">You</span>
                </div>
                <div className="text-[12px] text-[#c8c8c8] leading-relaxed glass-sm rounded-lg px-3 py-2">
                  {msg.content}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Bot size={10} className="text-tertiary shrink-0" />
                  <span className="text-[10px] font-semibold text-tertiary/80 uppercase tracking-wider">
                    Claude
                  </span>
                  {msg.routing && (
                    <span
                      className={`ml-auto text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border font-mono tabular ${
                        routeColor[msg.routing.path] ?? "text-[#666] border-vscode-border"
                      }`}
                      title={msg.routing.rationale}
                    >
                      {routeLabel[msg.routing.path] ?? msg.routing.path}
                      {msg.entitiesProxied != null && ` · ${msg.entitiesProxied}↗`}
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-[#c0c0c0] font-mono bg-[#121212] px-3 py-2.5 rounded-lg border border-vscode-border whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                  {msg.content}
                </div>
                <button
                  onClick={() => copyMessage(msg.id, msg.content)}
                  className="self-start flex items-center gap-1 px-2 py-1 rounded glass text-[10px] text-[#555] hover:text-[#aaa] transition-colors duration-150"
                >
                  {copiedId === msg.id ? (
                    <><Check size={10} className="text-tertiary" /> Copied</>
                  ) : (
                    <><Copy size={10} /> Copy</>
                  )}
                </button>
              </>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex flex-col gap-1.5 message-enter">
            <div className="flex items-center gap-1.5">
              <Bot size={10} className="text-tertiary" />
              <span className="text-[10px] font-semibold text-tertiary/80 uppercase tracking-wider">Claude</span>
            </div>
            <div className="flex items-center gap-2 font-mono bg-[#121212] px-3 py-2.5 rounded-lg border border-vscode-border">
              <span className="text-[10px] text-[#555] mr-1">Routing</span>
              <span className="loading-dots text-[#555] flex gap-1">
                <span /><span /><span />
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-2.5 glass-warning rounded-lg message-enter">
            <AlertTriangle size={11} className="text-[#f48771] mt-0.5 shrink-0" />
            <p className="text-[10.5px] text-[#f48771] font-mono leading-relaxed">{error}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── DP warning ────────────────────────────────────────────────────── */}
      {isDpTolerant && !dpAcknowledged && inputValue.trim().length > 0 && (
        <div className="shrink-0 mx-2 mb-2 p-2.5 glass-dp rounded-lg">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle size={11} className="text-mnpi shrink-0 mt-0.5" />
            <p className="text-[10.5px] text-mnpi/90 leading-relaxed">
              Document contains MNPI that can't be fully abstracted.
              Continue with differential-privacy protection?
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setDpAcknowledged(true)}
              className="flex items-center gap-1 px-2.5 py-1 bg-mnpi/10 border border-mnpi/25 text-mnpi text-[9.5px] font-semibold uppercase rounded-md hover:bg-mnpi/20 transition-colors"
            >
              <ShieldCheck size={10} /> Process with DP
            </button>
            <button
              onClick={() => setInputValue("")}
              className="flex items-center gap-1 px-2.5 py-1 glass border-vscode-border text-[#777] text-[9.5px] font-semibold uppercase rounded-md hover:text-[#bbb] transition-colors"
            >
              <Edit3 size={10} /> Edit
            </button>
          </div>
        </div>
      )}

      {/* ── Input area ────────────────────────────────────────────────────── */}
      <div className="p-2.5 border-t border-vscode-border bg-[#161616] shrink-0">
        {/* Model selector */}
        <div className="flex items-center justify-end mb-2" ref={modelRef}>
          <div className="relative">
            <button
              onClick={() => setModelOpen((v) => !v)}
              className="flex items-center gap-1 px-2 py-1 glass rounded-md text-[10.5px] text-[#888] hover:text-[#c8c8c8] transition-colors duration-150 min-w-[110px] justify-between"
            >
              <span className="font-medium">{MODEL_LABELS[selectedModel]}</span>
              <ChevronDown
                size={10}
                className={`transition-transform duration-150 ${modelOpen ? "rotate-180" : ""}`}
              />
            </button>
            {modelOpen && (
              <div className="absolute bottom-full mb-1 right-0 w-36 glass-panel rounded-lg overflow-hidden z-50 py-1">
                {MODEL_ORDER.map((id) => (
                  <button
                    key={id}
                    onClick={() => { onModelChange(id); setModelOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors duration-100 flex items-center justify-between ${
                      selectedModel === id
                        ? "text-[#c8c8c8] bg-white/5"
                        : "text-[#666] hover:text-[#c8c8c8] hover:bg-white/5"
                    }`}
                  >
                    {MODEL_LABELS[id]}
                    {selectedModel === id && <Check size={10} className="text-tertiary" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Textarea + send */}
        <div className="relative">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this document… (⌘↵ to send)"
            disabled={isLoading}
            className="w-full bg-[#1f1f1f] border border-vscode-border rounded-lg p-2.5 pr-9 text-[12px] text-[#d4d4d4] placeholder:text-[#3a3a3a] focus:outline-none focus:border-[#333] transition-colors duration-150 resize-none disabled:opacity-50 leading-relaxed"
            rows={3}
          />
          <button
            onClick={handleSend}
            disabled={!sendEnabled}
            title={isDpTolerant && !dpAcknowledged ? "Confirm DP processing first" : "Send (⌘↵)"}
            className="absolute bottom-2 right-2 bg-[#1f1f1f] text-[#888] p-1 rounded-md hover:bg-[#2c2c2c] hover:text-[#d4d4d4] border border-vscode-border transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowUp size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}
