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
  Paperclip,
  Sparkles,
  HeartPulse,
  MessageSquareQuote,
  SlidersHorizontal,
  FilePlus2,
} from "lucide-react";
import { useState, useRef, useEffect, type KeyboardEvent, type CSSProperties } from "react";
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
  uiMode: "work" | "chat";
  style?: CSSProperties;
}

const MODEL_ORDER: ModelId[] = ["claude-opus-4", "gpt-5", "gemini-2"];
const LOADING_STEPS = ["Scanning identifiers", "Building proxy", "Generating answer"];

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

const quickPrompts = [
  { icon: HeartPulse, label: "How am I doing today?", prompt: "Give me a concise project status summary and biggest risk in this document." },
  { icon: MessageSquareQuote, label: "Ask any question", prompt: "What stands out as the most important medical or regulatory issue here?" },
  { icon: FilePlus2, label: "Attach files", prompt: "Compare the attached file against the current document and tell me what changed." },
  { icon: SlidersHorizontal, label: "Change models", prompt: "Explain how a different model choice would affect privacy handling and output style." },
];

export default function AssistantPanel({
  routeDecision,
  onRequestComplete,
  selectedModel,
  onModelChange,
  currentDocument,
  fileKey,
  uiMode,
  style,
}: AssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dpAcknowledged, setDpAcknowledged] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [loadingStep, setLoadingStep] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages([]);
    setError(null);
    setDpAcknowledged(false);
    setAttachments([]);
    setInputValue("");
  }, [fileKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    setDpAcknowledged(false);
  }, [inputValue]);

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

  useEffect(() => {
    if (!isLoading) {
      setLoadingStep(0);
      return;
    }
    const id = window.setInterval(() => {
      setLoadingStep((step) => (step + 1) % LOADING_STEPS.length);
    }, 850);
    return () => window.clearInterval(id);
  }, [isLoading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, uiMode === "chat" ? 220 : 160)}px`;
  }, [inputValue, uiMode]);

  const isDpTolerant = routeDecision?.path === "dp_tolerant";
  const sendEnabled = !isLoading && inputValue.trim().length > 0 && (!isDpTolerant || dpAcknowledged);
  const panelClass = uiMode === "chat" ? "surface-agent h-full w-full" : "surface-agent h-full shrink-0 border-l border-white/[0.06]";
  const isEmpty = messages.length === 0 && !isLoading;
  const showChatLanding = isEmpty && uiMode === "chat";
  const showWorkLanding = isEmpty && uiMode === "work";

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
      setError("AI agent failed to respond.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && (e.metaKey || e.ctrlKey || uiMode === "chat")) {
      e.preventDefault();
      handleSend();
    }
  }

  function copyMessage(id: string, content: string) {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  }

  function attachCurrentFile() {
    const label = DEMO_FILES[fileKey]?.label ?? fileKey;
    setAttachments((prev) => (prev.includes(label) ? prev : [...prev, label]));
  }

  function removeAttachment(label: string) {
    setAttachments((prev) => prev.filter((item) => item !== label));
  }

  return (
    <aside className={panelClass} style={style}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
          <div className="flex items-center gap-2.5">
            <div className="h-2 w-2 rounded-full bg-tertiary shadow-[0_0_14px_rgba(106,153,85,0.45)]" />
            <span className="text-[12px] font-medium tracking-[0.02em] text-[#d5d9dd]">AI Agent</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-[#515861]">{uiMode === "chat" ? "focus mode" : "workspace"}</span>
          </div>
          <button
            className="rounded-xl p-2 text-[#666f78] transition-colors duration-150 hover:text-[#aeb5bc]"
            onClick={() => {
              setMessages([]);
              setError(null);
            }}
            title="Clear conversation"
          >
            <X size={13} />
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto ${uiMode === "chat" ? "px-6 py-6 md:px-8" : "px-4 py-4"}`}>
          <div className={`mx-auto flex min-h-full flex-col ${uiMode === "chat" ? "max-w-3xl" : "max-w-none"}`}>
            {showChatLanding && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={uiMode === "chat" ? "pt-8" : "pt-2"}>
                <div className={`mb-6 ${uiMode === "chat" ? "text-left" : "text-left"}`}>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] text-[#91abd8]">
                    <Sparkles size={12} />
                    Sovereign clinical agent
                  </div>
                  <h1 className={`${uiMode === "chat" ? "text-[34px] md:text-[40px]" : "text-[24px]"} max-w-2xl font-semibold leading-[1.08] tracking-[-0.03em] text-white`}>
                    Ask about the study.
                  </h1>
                  <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-[#7e8790]">
                    Rewrite narratives, inspect privacy handling, compare files, or switch models without breaking the privacy path.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {quickPrompts.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <motion.button
                        key={item.label}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05, duration: 0.2 }}
                        onClick={() => {
                          if (item.label === "Attach files") attachCurrentFile();
                          setInputValue(item.prompt);
                        }}
                        className="surface-card rounded-[22px] p-4 text-left transition-colors duration-150 hover:bg-white/[0.05]"
                      >
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.04] text-[#d9e8ff]">
                          <Icon size={16} />
                        </div>
                        <p className="mb-1 text-[16px] font-semibold text-white">{item.label}</p>
                        <p className="text-[12.5px] leading-relaxed text-[#737d86]">{item.prompt}</p>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {showWorkLanding && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-3">
                <div className="surface-soft rounded-2xl px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#6b747d]">Start protected drafting</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {quickPrompts.map((item) => (
                      <button
                        key={item.label}
                        onClick={() => {
                          if (item.label === "Attach files") attachCurrentFile();
                          setInputValue(item.prompt);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-[#b8c0c7] transition-colors hover:text-white"
                      >
                        <item.icon size={12} />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            <div className="mt-2 flex flex-1 flex-col gap-4">
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="flex flex-col gap-2"
                  >
                    {msg.role === "user" ? (
                      <div className="self-end max-w-[86%]">
                        <div className="mb-1.5 flex items-center justify-end gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6b737b]">You</span>
                          <User size={11} className="text-[#626971]" />
                        </div>
                        <div className="surface-soft rounded-[22px] px-4 py-3 text-[14px] leading-[1.7] text-[#e5e8ea]">
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-[94%]">
                        <div className="mb-2 flex items-center gap-2 flex-wrap">
                          <Bot size={11} className="text-tertiary shrink-0" />
                          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-tertiary/80">Agent</span>
                          {msg.routing && (
                            <span className={`rounded-full border px-2 py-1 text-[9.5px] font-semibold ${routeColor[msg.routing.path] ?? "text-[#666] border-vscode-border"}`} title={msg.routing.rationale}>
                              {routeLabel[msg.routing.path] ?? msg.routing.path}
                              {msg.entitiesProxied != null && ` · ${msg.entitiesProxied}`}
                            </span>
                          )}
                        </div>
                        <div className="surface-card rounded-[24px] px-4 py-3.5 text-[14px] leading-[1.8] whitespace-pre-wrap text-[#dae0e5]">
                          {msg.content}
                        </div>
                        <button onClick={() => copyMessage(msg.id, msg.content)} className="mt-2 flex items-center gap-1.5 rounded-xl border border-white/[0.05] bg-white/[0.02] px-2.5 py-1.5 text-[10.5px] text-[#6f7881] transition-colors duration-150 hover:text-[#ccd3da]">
                          {copiedId === msg.id ? <><Check size={10} className="text-tertiary" /> Copied</> : <><Copy size={10} /> Copy</>}
                        </button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {isLoading && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-[94%]">
                  <div className="mb-2 flex items-center gap-2">
                    <Bot size={11} className="text-tertiary" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-tertiary/80">Agent</span>
                  </div>
                  <div className="surface-card rounded-[24px] px-4 py-4">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#15364d] text-[#d7ebff] shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
                        <Sparkles size={16} />
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-white">{LOADING_STEPS[loadingStep]}</p>
                        <p className="text-[11px] text-[#78818a]">Protected generation in progress</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {LOADING_STEPS.map((step, index) => (
                        <div key={step} className="flex items-center gap-2.5">
                          <motion.div
                            className={`h-2 w-2 rounded-full ${index <= loadingStep ? "bg-[#8fd0ff]" : "bg-white/[0.12]"}`}
                            animate={index === loadingStep ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                            transition={{ duration: 0.7, repeat: index === loadingStep ? Infinity : 0 }}
                          />
                          <span className={`text-[12px] ${index <= loadingStep ? "text-[#d6e8ff]" : "text-[#5c6670]"}`}>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {error && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="surface-alert flex max-w-3xl items-start gap-2 rounded-2xl p-4">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0 text-[#f48771]" />
                  <p className="text-[12px] leading-relaxed text-[#f48771]">{error}</p>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        <AnimatePresence>
          {isDpTolerant && !dpAcknowledged && inputValue.trim().length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className={`${uiMode === "chat" ? "px-6 md:px-8" : "px-4"} overflow-hidden`}>
              <div className={`${uiMode === "chat" ? "mx-auto max-w-3xl" : ""}`}>
                <div className="surface-dp rounded-2xl p-4">
                  <div className="mb-3 flex items-start gap-2.5">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0 text-mnpi" />
                    <p className="text-[12px] leading-relaxed text-mnpi/90">
                      This prompt touches MNPI. Confirm the DP-safe path before sending.
                    </p>
                  </div>
                  <div className="flex gap-2.5">
                    <button onClick={() => setDpAcknowledged(true)} className="flex items-center gap-1.5 rounded-xl border border-mnpi/25 bg-mnpi/10 px-3.5 py-2 text-[11px] font-semibold text-mnpi transition-colors hover:bg-mnpi/20">
                      <ShieldCheck size={11} /> Process with DP
                    </button>
                    <button onClick={() => setInputValue("")} className="flex items-center gap-1.5 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-2 text-[11px] font-semibold text-[#8a939b] transition-colors hover:text-[#d0d6db]">
                      <Edit3 size={11} /> Edit prompt
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="shrink-0 border-t border-white/[0.06] px-4 py-4 md:px-5">
          <div className={`${uiMode === "chat" ? "mx-auto max-w-3xl" : ""}`}>
            <div className="surface-card rounded-[24px] px-4 py-3.5">
              <div className="mb-3 flex items-center justify-between gap-3" ref={modelRef}>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={attachCurrentFile} className="inline-flex items-center gap-2 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-[11.5px] text-[#8a939b] transition-colors hover:text-[#d7dce1]">
                    <Paperclip size={13} /> Attach file
                  </button>
                  {attachments.map((label) => (
                    <button key={label} onClick={() => removeAttachment(label)} className="inline-flex items-center gap-2 rounded-xl border border-white/[0.05] bg-white/[0.03] px-3 py-2 text-[11.5px] text-[#d7dce1] transition-colors hover:text-white">
                      <span>{label}</span>
                      <X size={11} className="text-[#6d7379]" />
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <button
                    onClick={() => setModelOpen((value) => !value)}
                    className="flex min-w-[152px] items-center justify-between gap-2 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-[11.5px] text-[#b2b8be] transition-colors duration-150 hover:text-white"
                  >
                    <span className="font-medium">{MODEL_LABELS[selectedModel]}</span>
                    <ChevronDown size={12} className={`transition-transform duration-150 ${modelOpen ? "rotate-180" : ""}`} />
                  </button>
                  {modelOpen && (
                    <div className="absolute bottom-full right-0 z-50 mb-2 w-48 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#12161b] py-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
                      {MODEL_ORDER.map((id) => (
                        <button
                          key={id}
                          onClick={() => { onModelChange(id); setModelOpen(false); }}
                          className={`flex w-full items-center justify-between px-4 py-3 text-left text-[12px] transition-colors duration-100 ${selectedModel === id ? "bg-white/[0.05] text-white" : "text-[#7d848b] hover:bg-white/[0.04] hover:text-white"}`}
                        >
                          {MODEL_LABELS[id]}
                          {selectedModel === id && <Check size={11} className="text-tertiary" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={uiMode === "chat" ? "Ask about the study" : "Ask about this document"}
                disabled={isLoading}
                className={`w-full resize-none border-none bg-transparent leading-[1.7] text-[#f2f4f6] placeholder:text-[#596069] focus:outline-none disabled:opacity-50 ${uiMode === "chat" ? "min-h-[110px] text-[15px]" : "min-h-[72px] text-[13.5px]"}`}
                rows={1}
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-[10.5px] text-[#6f7780]">
                  <Sparkles size={11} className="text-[#8fcfff]" />
                  {uiMode === "chat" ? "Protected agent mode" : "NGSP proxy active"}
                </div>
                <button
                  onClick={handleSend}
                  disabled={!sendEnabled}
                  title={isDpTolerant && !dpAcknowledged ? "Confirm DP processing first" : "Send"}
                  className="rounded-2xl bg-primary-container p-3 text-white shadow-[0_10px_30px_rgba(0,120,212,0.3)] transition-all duration-150 hover:bg-[#0a88f5] disabled:cursor-not-allowed disabled:bg-[#222a31] disabled:opacity-30"
                >
                  <ArrowUp size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
