"use client";

import { useState, useRef, useEffect } from "react";
import { X, Sparkles, Send, Loader2, Copy, Check, Trash2 } from "lucide-react";
import {
  rewriteRawComment,
  getRewritePromptConfig,
  saveRewritePromptConfig,
  resetRewritePromptConfig,
} from "@/lib/actions/ai-rewrite";
import {
  DEFAULT_REWRITE_SYSTEM_INSTRUCTION,
  DEFAULT_REWRITE_TASK_INSTRUCTION,
  DEFAULT_REWRITE_JSON_SCHEMA,
} from "@/lib/constants/ai-rewrite";
import { addActivityLog } from "@/lib/actions/opportunity";
import { useDialog } from "@/providers/DialogProvider";

interface RewriteCommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealId: string;
  dealTopic?: string;
  isAdmin?: boolean;
  onPostSuccess?: () => void;
}

export function RewriteCommentModal({
  isOpen,
  onClose,
  dealId,
  dealTopic,
  isAdmin = false,
  onPostSuccess,
}: RewriteCommentModalProps) {
  const { toast } = useDialog();
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const systemInstructionRef = useRef<HTMLTextAreaElement>(null);
  const taskInstructionRef = useRef<HTMLTextAreaElement>(null);
  const jsonSchemaRef = useRef<HTMLTextAreaElement>(null);

  const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // Tab State: 'rewrite' | 'prompt'
  const [activeTab, setActiveTab] = useState<'rewrite' | 'prompt'>('rewrite');

  // Rewrite Tab States
  const [rawText, setRawText] = useState("");
  const [rewrittenText, setRewrittenText] = useState("");
  const [isRewriting, setIsRewriting] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Prompt Tab States
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [systemInstructionInput, setSystemInstructionInput] = useState(DEFAULT_REWRITE_SYSTEM_INSTRUCTION);
  const [taskInstructionInput, setTaskInstructionInput] = useState(DEFAULT_REWRITE_TASK_INSTRUCTION);
  const [jsonSchemaInput, setJsonSchemaInput] = useState(JSON.stringify(DEFAULT_REWRITE_JSON_SCHEMA, null, 2));

  const isPromptActive = isOpen && activeTab === 'prompt';
  const [prevPromptActive, setPrevPromptActive] = useState(isPromptActive);
  if (isPromptActive !== prevPromptActive) {
    setPrevPromptActive(isPromptActive);
    if (isPromptActive) {
      setIsLoadingPrompt(true);
    }
  }

  // Focus raw input on open
  useEffect(() => {
    if (isOpen && activeTab === 'rewrite') {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeTab]);

  // Load Prompt Configuration when opening Prompt Tab
  useEffect(() => {
    if (isOpen && activeTab === 'prompt') {
      let isMounted = true;
      getRewritePromptConfig()
        .then((cfg) => {
          if (!isMounted) return;
          setSystemInstructionInput(cfg.systemInstruction || DEFAULT_REWRITE_SYSTEM_INSTRUCTION);
          setTaskInstructionInput(cfg.taskInstruction || DEFAULT_REWRITE_TASK_INSTRUCTION);
          setJsonSchemaInput(cfg.jsonSchema || JSON.stringify(DEFAULT_REWRITE_JSON_SCHEMA, null, 2));
        })
        .catch((err) => {
          console.error("Failed to load rewrite prompt config:", err);
          toast({
            title: "Failed to load prompt",
            description: err instanceof Error ? err.message : "Could not load prompt settings.",
            type: "error",
          });
        })
        .finally(() => {
          if (isMounted) setIsLoadingPrompt(false);
        });
      return () => {
        isMounted = false;
      };
    }
  }, [isOpen, activeTab, toast]);

  // Auto-resize Prompt textareas according to their text content
  useEffect(() => {
    if (isOpen && activeTab === 'prompt' && !isLoadingPrompt) {
      const timer = setTimeout(() => {
        autoResizeTextarea(systemInstructionRef.current);
        autoResizeTextarea(taskInstructionRef.current);
        autoResizeTextarea(jsonSchemaRef.current);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeTab, isLoadingPrompt, systemInstructionInput, taskInstructionInput, jsonSchemaInput]);

  const handleRewrite = async () => {
    const textToProcess = rawText.trim();
    if (!textToProcess) {
      toast({
        title: "Text is required",
        description: "Please paste a conversation or raw notes to rewrite.",
        type: "warning",
      });
      inputRef.current?.focus();
      return;
    }

    setIsRewriting(true);
    try {
      const res = await rewriteRawComment(dealId, textToProcess);
      if (res.success && res.rewrittenText) {
        setRewrittenText(res.rewrittenText);
        toast({
          title: "Rewritten successfully",
          description: "You can review and edit the text directly before posting.",
          type: "success",
        });
        setTimeout(() => {
          outputRef.current?.focus();
        }, 100);
      } else {
        toast({
          title: "Rewrite failed",
          description: res.message || res.error || "An error occurred while calling AI.",
          type: "error",
        });
      }
    } catch (err: unknown) {
      console.error("[RewriteCommentModal] Error:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to connect to AI.",
        type: "error",
      });
    } finally {
      setIsRewriting(false);
    }
  };

  const handlePost = async () => {
    const content = rewrittenText.trim();
    if (!content) {
      toast({
        title: "No content to post",
        description: "Please rewrite or enter text in the output box before posting.",
        type: "warning",
      });
      return;
    }

    setIsPosting(true);
    try {
      await addActivityLog(dealId, content);
      toast({
        title: "Posted to Activity",
        description: "Your update has been recorded to the deal timeline.",
        type: "success",
      });
      setRawText("");
      setRewrittenText("");
      onPostSuccess?.();
      onClose();
    } catch (err: unknown) {
      console.error("[RewriteCommentModal] Failed to post activity:", err);
      toast({
        title: "Post failed",
        description: err instanceof Error ? err.message : "Could not post activity comment.",
        type: "error",
      });
    } finally {
      setIsPosting(false);
    }
  };

  const handleCopy = async () => {
    if (!rewrittenText.trim()) return;
    try {
      await navigator.clipboard.writeText(rewrittenText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      toast({
        title: "Copied to clipboard",
        description: "Rewritten text has been copied.",
        type: "success",
      });
    } catch {
      toast({ title: "Failed to copy", type: "error" });
    }
  };

  const handleClear = () => {
    setRawText("");
    inputRef.current?.focus();
  };

  const handleSavePrompt = async () => {
    setIsSavingPrompt(true);
    try {
      await saveRewritePromptConfig({
        systemInstruction: systemInstructionInput,
        taskInstruction: taskInstructionInput,
        jsonSchema: jsonSchemaInput,
      });
      toast({
        title: "Prompt Saved",
        description: "AI Rewriter prompt configuration updated successfully.",
        type: "success",
      });
    } catch (err: unknown) {
      console.error("Failed to save prompt config:", err);
      toast({
        title: "Save Failed",
        description: err instanceof Error ? err.message : "Could not save prompt config.",
        type: "error",
      });
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleResetPrompt = async () => {
    setIsSavingPrompt(true);
    try {
      const res = await resetRewritePromptConfig();
      if (res.data) {
        setSystemInstructionInput(res.data.systemInstruction);
        setTaskInstructionInput(res.data.taskInstruction);
        setJsonSchemaInput(res.data.jsonSchema || JSON.stringify(DEFAULT_REWRITE_JSON_SCHEMA, null, 2));
        setTimeout(() => {
          autoResizeTextarea(systemInstructionRef.current);
          autoResizeTextarea(taskInstructionRef.current);
          autoResizeTextarea(jsonSchemaRef.current);
        }, 50);
      }
      toast({
        title: "Prompt Reset",
        description: "AI Rewriter prompt restored to system defaults.",
        type: "success",
      });
    } catch (err: unknown) {
      console.error("Failed to reset prompt config:", err);
      toast({
        title: "Reset Failed",
        description: err instanceof Error ? err.message : "Could not reset prompt config.",
        type: "error",
      });
    } finally {
      setIsSavingPrompt(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-[130] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => {
          if (!isRewriting && !isPosting && !isSavingPrompt) {
            onClose();
          }
        }}
      />

      {/* Floating Card Modal (Same size and positioning as DealActionsDrawer) */}
      <div
        className={`fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[450px] md:max-w-[calc(100vw-32px)] z-[131] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right ${
          isOpen
            ? "opacity-100 translate-y-0 md:translate-x-0 scale-100"
            : "opacity-0 translate-y-4 md:translate-x-8 scale-[0.97] pointer-events-none"
        }`}
      >
        <div
          ref={modalRef}
          className="w-full bg-[#252728] border-0 md:border border-[#3A3B3C] flex flex-col h-full rounded-none md:rounded-2xl overflow-hidden shadow-2xl"
        >
          {/* Header with Title & Sub-bar style Tabs */}
          <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-[#1C1C1D] shrink-0 bg-[#252728]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-purple-950/60 border border-purple-800/60 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-purple-400" />
              </div>
              <div className="flex flex-col min-w-0">
                <h2 className="text-sm font-bold text-slate-100 truncate">
                  AI Rewriter
                </h2>
                <p className="text-[11px] text-slate-400 truncate max-w-[120px] sm:max-w-[170px]">
                  {dealTopic || "Deal Activity"}
                </p>
              </div>
            </div>

            {/* Sub-bar style Tab Switcher (Matching EditDealSubBar.tsx) */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-[#1C1C1D] p-0.5 rounded-lg" role="tablist">
                <button
                  type="button"
                  onClick={() => setActiveTab('rewrite')}
                  role="tab"
                  aria-selected={activeTab === 'rewrite'}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors flex items-center cursor-pointer ${
                    activeTab === 'rewrite'
                      ? "bg-[#3A3B3C] text-[#C7F33C]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Rewrite
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('prompt')}
                    role="tab"
                    aria-selected={activeTab === 'prompt'}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors flex items-center cursor-pointer ${
                      activeTab === 'prompt'
                        ? "bg-[#3A3B3C] text-[#C7F33C]"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Prompt
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={isRewriting || isPosting || isSavingPrompt}
                className="p-1.5 hover:bg-[#3A3B3C] rounded-full transition-colors text-slate-400 hover:text-slate-200 shrink-0 cursor-pointer disabled:opacity-40"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* TAB 1: REWRITE (Equal 50/50 height boxes with embedded icon-only controls) */}
          {activeTab === 'rewrite' && (
            <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden bg-[#1F2021] min-h-0">
              {/* Top Box: Raw Input (Equal Height) */}
              <div className="flex-1 flex flex-col bg-[#252728] border border-[#3A3B3C] rounded-xl overflow-hidden min-h-0 transition-colors">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#3A3B3C]/50 bg-[#2A2B2C]/40 text-xs text-slate-400 shrink-0">
                  <span className="font-medium text-slate-300">
                    Raw Chat / Notes
                  </span>
                  {rawText && (
                    <button
                      type="button"
                      onClick={handleClear}
                      title="Clear text"
                      className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <textarea
                  ref={inputRef}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Paste chat conversation (LINE, WhatsApp) or raw notes here..."
                  className="w-full flex-1 bg-transparent p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none resize-none leading-relaxed font-sans min-h-0 overflow-y-auto custom-scrollbar"
                />

                {/* Minimal Icon Button inside Raw Input Box */}
                <div className="flex items-center justify-end px-3 py-1.5 border-t border-[#3A3B3C]/40 bg-[#252728] shrink-0">
                  <button
                    type="button"
                    onClick={handleRewrite}
                    disabled={!rawText.trim() || isRewriting}
                    title="Rewrite with AI"
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                      !rawText.trim() || isRewriting
                        ? "bg-[#3A3B3C] text-slate-600 cursor-not-allowed"
                        : "bg-purple-600 hover:bg-purple-500 text-white active:scale-95 shadow-purple-900/50"
                    }`}
                  >
                    {isRewriting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-200" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Bottom Box: Rewritten Output (Equal Height, Live Editable) */}
              <div className="flex-1 flex flex-col bg-[#252728] border border-[#3A3B3C] rounded-xl overflow-hidden min-h-0 transition-colors">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#3A3B3C]/50 bg-[#2A2B2C]/40 text-xs shrink-0">
                  <span className="font-semibold text-purple-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    Rewritten Result (Live Editable)
                  </span>
                  {rewrittenText && (
                    <button
                      type="button"
                      onClick={handleCopy}
                      title="Copy to clipboard"
                      className="p-1 text-slate-400 hover:text-slate-200 rounded transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-green-400" />
                          <span className="text-green-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <textarea
                  ref={outputRef}
                  value={rewrittenText}
                  onChange={(e) => setRewrittenText(e.target.value)}
                  placeholder="Rewritten summary will appear here. You can edit directly before posting..."
                  className="w-full flex-1 bg-transparent p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none resize-none leading-relaxed font-sans min-h-0 overflow-y-auto custom-scrollbar"
                />
              </div>
            </div>
          )}

          {/* TAB 2: PROMPT (Admin Only - Matching EditDealPanel.tsx:L2964-L3030) */}
          {activeTab === 'prompt' && isAdmin && (
            <div className="flex-1 flex flex-col gap-4 p-4 overflow-y-auto min-h-0 bg-[#1F2021] custom-scrollbar">
              {isLoadingPrompt ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-7 h-7 text-[#C7F33C] animate-spin" />
                  <p className="text-xs text-slate-400">Loading prompt configuration...</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* 1. System Instruction (Core Rules & Persona) */}
                  <div className="flex flex-col gap-2 p-3.5 bg-[#252728] rounded-xl border border-[#3A3B3C]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                        1. System Instruction (Role & Persona)
                      </span>
                    </div>
                    <textarea
                      ref={systemInstructionRef}
                      value={systemInstructionInput}
                      onChange={(e) => {
                        setSystemInstructionInput(e.target.value);
                        autoResizeTextarea(e.target);
                      }}
                      className="w-full bg-[#1C1C1D] border border-[#3A3B3C] rounded-lg p-3 text-xs text-slate-100 font-mono leading-relaxed focus:border-[#C7F33C] focus:outline-none transition-colors resize-none overflow-hidden"
                      placeholder="Enter system prompt instruction (e.g. SB INTERLAB role)..."
                    />
                  </div>

                  {/* 2. Task Instruction */}
                  <div className="flex flex-col gap-2 p-3.5 bg-[#252728] rounded-xl border border-[#3A3B3C]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                        2. Task Instructions (Summary Guidelines)
                      </span>
                    </div>
                    <textarea
                      ref={taskInstructionRef}
                      value={taskInstructionInput}
                      onChange={(e) => {
                        setTaskInstructionInput(e.target.value);
                        autoResizeTextarea(e.target);
                      }}
                      className="w-full bg-[#1C1C1D] border border-[#3A3B3C] rounded-lg p-3 text-xs text-slate-100 font-mono leading-relaxed focus:border-[#C7F33C] focus:outline-none transition-colors resize-none overflow-hidden"
                      placeholder="Enter task instruction and guidelines..."
                    />
                  </div>

                  {/* 3. JSON Schema */}
                  <div className="flex flex-col gap-2 p-3.5 bg-[#252728] rounded-xl border border-[#3A3B3C]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                        3. JSON Schema (Structured Output Definition)
                      </span>
                    </div>
                    <textarea
                      ref={jsonSchemaRef}
                      value={jsonSchemaInput}
                      onChange={(e) => {
                        setJsonSchemaInput(e.target.value);
                        autoResizeTextarea(e.target);
                      }}
                      className="w-full bg-[#1C1C1D] border border-[#3A3B3C] rounded-lg p-3 text-xs text-slate-100 font-mono leading-relaxed focus:border-[#C7F33C] focus:outline-none transition-colors resize-none overflow-hidden"
                      placeholder="Enter JSON Schema..."
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="p-3.5 sm:p-4 border-t border-[#1C1C1D] bg-[#252728] flex items-center justify-between gap-3 shrink-0">
            {activeTab === 'rewrite' ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isPosting}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-[#3A3B3C] transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePost}
                  disabled={!rewrittenText.trim() || isPosting || isRewriting}
                  className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md ${
                    !rewrittenText.trim() || isPosting || isRewriting
                      ? "bg-[#3A3B3C] text-slate-500 border border-[#4E4F50] cursor-not-allowed opacity-50"
                      : "bg-[#C7F33C] text-black hover:bg-[#b5e028] active:scale-[0.98]"
                  }`}
                >
                  {isPosting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-black" />
                      <span>Posting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Post to Activity</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleResetPrompt}
                  disabled={isSavingPrompt || isLoadingPrompt}
                  className="px-4 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Reset to Default
                </button>
                <button
                  type="button"
                  onClick={handleSavePrompt}
                  disabled={isSavingPrompt || isLoadingPrompt}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#C7F33C] hover:bg-[#b0d635] text-black transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {isSavingPrompt ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Prompt</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
