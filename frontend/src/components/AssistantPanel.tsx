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
import { AnimatePresence, motion } from "framer-motion";
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
  dp_tolerant: "DP Protected",
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
      setError("AI backend is offline. Start the backend server to enable live responses.");
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
      className="flex flex-col shrink-0 overflow-hidden"
      style={{ ...style, background: "rgba(12,12,12,0.82)", backdropFilter: "blur(52px) saturate(200%)", WebkitBackdropFilter: "blur(52px) saturate(200%)", borderLeft: "1px solid rgba(255,255,255,0.055)" }}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="h-[34px] px-4 flex items-center justify-between bg-[#111]/60 border-b border-white/[0.08] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
          <span className="text-[11.5px] font-medium text-[#c8c8c8] tracking-tight">
            AI Agent
          </span>
        </div>
        <button
          className="text-[#555] hover:text-[#aaa] p-1.5 rounded transition-colors duration-150"
          onClick={() => { setMessages([]); setError(null); }}
          title="Clear conversation"
        >
          <X size={13} />
        </button>
      </div>

      {/* ── Messages ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-4">
        {messages.length === 0 && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center h-full gap-4 pb-8 select-none"
          >
            <div className="w-12 h-12 rounded-2xl glass-sm flex items-center justify-center">
              <Bot size={20} className="text-tertiary/70" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-[12px] text-[#666] font-medium">Ready to assist</p>
              <p className="text-[10.5px] text-[#3a3a3a]">⌘↵ to send</p>
            </div>
            <div className="space-y-1.5 w-full max-w-[220px]">
              {[
                "Rewrite in ICH E2B format.",
                "Summarize the adverse event timeline.",
                "List all sensitive identifiers.",
              ].map((hint) => (
                <button
                  key={hint}
                  onClick={() => setInputValue(hint)}
                  className="w-full text-left px-3 py-2 rounded-xl glass text-[11px] text-[#5a5a5a] hover:text-[#9a9a9a] transition-colors duration-150 leading-snug"
                >
                  {hint}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="flex flex-col gap-1.5 group"
            >
              {msg.role === "user" ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <User size={10} className="text-[#555]" />
                    <span className="text-[10px] font-semibold text-[#666] uppercase tracking-wider">You</span>
                  </div>
                  <div className="text-[12.5px] text-[#c8c8c8] leading-relaxed glass-sm rounded-xl px-3.5 py-2.5">
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
                        className={`ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded-md border ${
                          routeColor[msg.routing.path] ?? "text-[#666] border-vscode-border"
                        }`}
                        title={msg.routing.rationale}
                      >
                        {routeLabel[msg.routing.path] ?? msg.routing.path}
                        {msg.entitiesProxied != null && ` · ${msg.entitiesProxied} proxied`}
                      </span>
                    )}
                  </div>
                  <div className="text-[12.5px] text-[#c0c0c0] glass px-3.5 py-3 rounded-xl whitespace-pre-wrap leading-[1.75] max-h-80 overflow-y-auto">
                    {msg.content}
                  </div>
                  <button
                    onClick={() => copyMessage(msg.id, msg.content)}
                    className="self-start flex items-center gap-1 px-2 py-1 rounded-lg glass text-[10px] text-[#555] hover:text-[#aaa] transition-colors duration-150"
                  >
                    {copiedId === msg.id ? (
                      <><Check size={10} className="text-tertiary" /> Copied</>
                    ) : (
                      <><Copy size={10} /> Copy</>
                    )}
                  </button>
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-1.5"
          >
            <div className="flex items-center gap-1.5">
              <Bot size={10} className="text-tertiary" />
              <span className="text-[10px] font-semibold text-tertiary/80 uppercase tracking-wider">Claude</span>
            </div>
            <div className="flex items-center gap-2.5 glass px-3.5 py-3 rounded-xl">
              <span className="text-[10.5px] text-[#555]">Analyzing</span>
              <span className="loading-dots text-[#555] flex gap-1">
                <span /><span /><span />
              </span>
            </div>
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 p-3 glass-warning rounded-xl"
          >
            <AlertTriangle size={11} className="text-[#f48771] mt-0.5 shrink-0" />
            <p className="text-[11px] text-[#f48771] leading-relaxed">{error}</p>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── DP warning ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isDpTolerant && !dpAcknowledged && inputValue.trim().length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 mx-2 mb-2 overflow-hidden"
          >
            <div className="p-3 glass-dp rounded-xl">
              <div className="flex items-start gap-2 mb-2.5">
                <AlertTriangle size={11} className="text-mnpi shrink-0 mt-0.5" />
                <p className="text-[11px] text-mnpi/90 leading-relaxed">
                  Document contains sensitive data that requires differential-privacy protection before cloud routing.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDpAcknowledged(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-mnpi/10 border border-mnpi/25 text-mnpi text-[10px] font-semibold rounded-lg hover:bg-mnpi/20 transition-colors"
                >
                  <ShieldCheck size={10} /> Process with DP
                </button>
                <button
                  onClick={() => setInputValue("")}
                  className="flex items-center gap-1 px-3 py-1.5 glass text-[#777] text-[10px] font-semibold rounded-lg hover:text-[#bbb] transition-colors"
                >
                  <Edit3 size={10} /> Edit
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Input area ────────────────────────────────────────────────────── */}
      <div className="p-3 border-t border-white/[0.07] bg-[#0e0e0e]/60 shrink-0">
        {/* Model selector */}
        <div className="flex items-center justify-end mb-2.5" ref={modelRef}>
          <div className="relative">
            <button
              onClick={() => setModelOpen((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 glass rounded-lg text-[10.5px] text-[#888] hover:text-[#c8c8c8] transition-colors duration-150 min-w-[120px] justify-between"
            >
              <span className="font-medium">{MODEL_LABELS[selectedModel]}</span>
              <ChevronDown
                size={10}
                className={`transition-transform duration-150 ${modelOpen ? "rotate-180" : ""}`}
              />
            </button>
            {modelOpen && (
              <div className="absolute bottom-full mb-1.5 right-0 w-40 glass-panel rounded-xl overflow-hidden z-50 py-1.5">
                {MODEL_ORDER.map((id) => (
                  <button
                    key={id}
                    onClick={() => { onModelChange(id); setModelOpen(false); }}
                    className={`w-full text-left px-3.5 py-2 text-[11.5px] transition-colors duration-100 flex items-center justify-between ${
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
            className="w-full glass rounded-xl p-3 pr-10 text-[12.5px] text-[#d4d4d4] placeholder:text-[#333] focus:outline-none transition-colors duration-150 resize-none disabled:opacity-50 leading-[1.65]"
            rows={3}
          />
          <button
            onClick={handleSend}
            disabled={!sendEnabled}
            title={isDpTolerant && !dpAcknowledged ? "Confirm DP processing first" : "Send (⌘↵)"}
            className="absolute bottom-2.5 right-2.5 bg-primary-container/80 text-white p-1.5 rounded-lg hover:bg-primary-container transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-[#222]"
          >
            <ArrowUp size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}
