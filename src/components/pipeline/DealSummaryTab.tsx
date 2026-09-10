'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Check, Sparkles, AlertCircle, RefreshCw, Zap } from 'lucide-react';
import {
  getDealSummaryPromptConfig,
  saveDealSummaryPromptConfig,
  resetDealSummaryPromptConfig,
  type DealSummaryResponse,
} from '@/lib/actions/deal-summary';
import { useDialog } from '@/providers/DialogProvider';

export interface DealSummaryTabProps {
  dealId: string;
  summaryViewMode: 'summary' | 'prompt';
  dealSummaryResponse: DealSummaryResponse | null | undefined;
  isLoadingDealSummary: boolean;
  isGeneratingSummary: boolean;
  summaryError: string | null;
  isAdmin: boolean;
  onGenerateSummary: () => Promise<void>;
  toast: (options: {
    title: string;
    description?: string;
    type?: 'success' | 'error' | 'warning' | 'info';
  }) => void;
}

function formatDateTime(date: Date | string) {
  const d = new Date(date);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function DealSummaryTab({
  summaryViewMode,
  dealSummaryResponse,
  isLoadingDealSummary,
  isGeneratingSummary,
  summaryError,
  isAdmin,
  onGenerateSummary,
  toast,
}: DealSummaryTabProps) {
  const { confirm } = useDialog();

  // Admin Prompt Configuration State
  const [systemInstructionInput, setSystemInstructionInput] = useState('');
  const [taskInstructionInput, setTaskInstructionInput] = useState('');
  const [jsonSchemaInput, setJsonSchemaInput] = useState('');
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);

  // Stable refs for Prompt Settings textareas
  const systemInstructionRef = useRef<HTMLTextAreaElement | null>(null);
  const taskInstructionRef = useRef<HTMLTextAreaElement | null>(null);
  const jsonSchemaRef = useRef<HTMLTextAreaElement | null>(null);

  const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    if (summaryViewMode === 'prompt') {
      const timer = setTimeout(() => {
        autoResizeTextarea(systemInstructionRef.current);
        autoResizeTextarea(taskInstructionRef.current);
        autoResizeTextarea(jsonSchemaRef.current);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [summaryViewMode, systemInstructionInput, taskInstructionInput, jsonSchemaInput]);

  // Automatically load prompt configuration when switching to prompt view
  useEffect(() => {
    if (summaryViewMode === 'prompt' && isAdmin) {
      let isMounted = true;
      setIsLoadingPrompt(true);
      getDealSummaryPromptConfig()
        .then((config) => {
          if (!isMounted) return;
          setSystemInstructionInput(config.systemInstruction);
          setTaskInstructionInput(config.taskInstruction);
          setJsonSchemaInput(config.jsonSchema);
        })
        .catch(() => {
          if (!isMounted) return;
          toast({
            title: 'Error',
            description: 'Failed to load prompt configuration',
            type: 'error',
          });
        })
        .finally(() => {
          if (isMounted) setIsLoadingPrompt(false);
        });
      return () => {
        isMounted = false;
      };
    }
  }, [summaryViewMode, isAdmin, toast]);

  const handleSavePrompt = async () => {
    if (!systemInstructionInput.trim()) {
      toast({
        title: 'Validation Error',
        description: 'System instruction cannot be empty.',
        type: 'warning',
      });
      return;
    }
    if (!taskInstructionInput.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Task instruction cannot be empty.',
        type: 'warning',
      });
      return;
    }
    if (jsonSchemaInput.trim()) {
      try {
        JSON.parse(jsonSchemaInput);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid JSON format';
        toast({
          title: 'JSON Schema Error',
          description: `รูปแบบ JSON Schema ไม่ถูกต้อง: ${msg}`,
          type: 'warning',
        });
        return;
      }
    }
    setIsSavingPrompt(true);
    try {
      await saveDealSummaryPromptConfig({
        systemInstruction: systemInstructionInput,
        taskInstruction: taskInstructionInput,
        customInstruction: '',
        jsonSchema: jsonSchemaInput,
      });
      toast({
        title: 'Prompt Saved',
        description: 'AI Summary prompt configuration updated successfully.',
        type: 'success',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save prompt configuration';
      toast({ title: 'Error', description: msg, type: 'error' });
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleResetPrompt = async () => {
    const isConfirmed = await confirm({
      title: 'Reset AI Prompt',
      description: 'Are you sure you want to reset prompts and JSON schema to system defaults?',
      confirmText: 'Reset',
      variant: 'danger',
    });
    if (!isConfirmed) return;
    setIsSavingPrompt(true);
    try {
      const res = await resetDealSummaryPromptConfig();
      setSystemInstructionInput(res.data.systemInstruction);
      setTaskInstructionInput(res.data.taskInstruction);
      setJsonSchemaInput(res.data.jsonSchema);
      toast({
        title: 'Prompt Reset',
        description: 'Prompt and schema restored to default configuration.',
        type: 'success',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset prompt configuration';
      toast({ title: 'Error', description: msg, type: 'error' });
    } finally {
      setIsSavingPrompt(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 mt-2">
      {summaryViewMode === 'prompt' && isAdmin ? (
        <div className="flex flex-col gap-5 pb-24">
          {isLoadingPrompt ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 text-[#C7F33C] animate-spin" />
              <p className="text-xs text-slate-400">Loading prompt configuration...</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* 1. System Instruction */}
              <div className="flex flex-col gap-2 p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                    1. System Instruction (Core Rules & Persona)
                  </span>
                </div>
                <textarea
                  ref={systemInstructionRef}
                  value={systemInstructionInput}
                  onChange={(e) => {
                    setSystemInstructionInput(e.target.value);
                    autoResizeTextarea(e.target);
                  }}
                  className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl p-3.5 text-xs text-slate-100 font-mono leading-relaxed focus:border-[#C7F33C] focus:outline-none transition-colors resize-none overflow-hidden"
                  placeholder="Enter system prompt instruction..."
                />
              </div>

              {/* 2. Task Instruction */}
              <div className="flex flex-col gap-2 p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                    2. Task Instructions (Analysis Topics & Guidelines)
                  </span>
                </div>
                <textarea
                  ref={taskInstructionRef}
                  value={taskInstructionInput}
                  onChange={(e) => {
                    setTaskInstructionInput(e.target.value);
                    autoResizeTextarea(e.target);
                  }}
                  className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl p-3.5 text-xs text-slate-100 font-mono leading-relaxed focus:border-[#C7F33C] focus:outline-none transition-colors resize-none overflow-hidden"
                  placeholder="Enter task instruction and topics..."
                />
              </div>

              {/* 3. JSON Schema (Structured Output Definition) */}
              <div className="flex flex-col gap-2 p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]">
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
                  rows={12}
                  className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl p-3.5 text-xs text-slate-100 font-mono leading-relaxed focus:border-[#C7F33C] focus:outline-none transition-colors resize-none overflow-hidden"
                  placeholder="Enter JSON Schema..."
                />
              </div>

              {/* Bottom Action Row */}
              <div className="flex items-center justify-between pt-4 border-t border-[#4E4F50]">
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
                  className="px-6 py-2.5 text-xs font-bold bg-[#C7F33C] hover:bg-[#b0d635] text-black rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSavingPrompt ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>{isSavingPrompt ? 'Saving...' : 'Save Prompt'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Standard Deal Summary View */
        <>
          {/* 1. Loading Initial State */}
          {isLoadingDealSummary && (
            <div className="flex flex-col gap-4 mt-2 w-full animate-pulse">
              <div className="h-28 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]" />
              <div className="h-24 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]" />
              <div className="h-24 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]" />
            </div>
          )}

          {/* 2. Generating in Progress */}
          {!isLoadingDealSummary && isGeneratingSummary && (
            <div className="flex flex-col items-center justify-center p-8 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#C7F33C]/10 border border-[#C7F33C]/30 flex items-center justify-center text-[#C7F33C] animate-pulse">
                <Sparkles className="w-7 h-7 animate-spin" />
              </div>
              <div className="flex flex-col gap-1.5">
                <h4 className="text-base font-semibold text-slate-100">
                  Analyzing deal and recent activity logs...
                </h4>
                <p className="text-xs text-slate-400 max-w-sm">
                  Extracting key updates, customer discussions, blockers, and next steps with AI.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#C7F33C]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Usually takes around 3–5 seconds</span>
              </div>
            </div>
          )}

          {/* 3. Empty State (No summary yet) */}
          {!isLoadingDealSummary && !isGeneratingSummary && !dealSummaryResponse?.data && (
            <div className="flex flex-col items-center justify-center p-8 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] text-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-[#C7F33C]/10 border border-[#C7F33C]/30 flex items-center justify-center text-[#C7F33C]">
                <Sparkles className="w-7 h-7" />
              </div>
              <div className="flex flex-col gap-2 max-w-md">
                <h4 className="text-lg font-bold text-slate-100">Instant Deal Summary</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Save time reading lengthy activity logs. AI summarizes the current status, key
                  highlights, blockers, and next steps in one click.
                </p>
              </div>

              {summaryError && (
                <div className="w-full max-w-md p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 text-left flex flex-col gap-2">
                  <div className="flex items-center gap-2 font-medium text-amber-300">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Alert</span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-300">{summaryError}</p>
                </div>
              )}

              <button
                type="button"
                onClick={onGenerateSummary}
                disabled={isGeneratingSummary}
                className="px-6 py-2.5 rounded-full bg-[#C7F33C] hover:bg-[#b0d635] text-black font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                ✨ Summarize Deal
              </button>
            </div>
          )}

          {/* 4. Ready State (Summary Content) */}
          {!isLoadingDealSummary && !isGeneratingSummary && dealSummaryResponse?.data && (
            <div className="flex flex-col gap-4">
              {/* Outdated Warning Notice */}
              {dealSummaryResponse.isOutdated && (
                <div className="p-2 bg-[#3A3B3C] border border-[#C7F33C]/50 rounded-2xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-[#C7F33C]/10 border border-[#C7F33C]/30 flex items-center justify-center text-[#C7F33C] shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-100">New Activity</span>
                        {dealSummaryResponse.newerActivitiesCount &&
                        dealSummaryResponse.newerActivitiesCount > 0 ? (
                          <span className="px-1.5 py-0.5 rounded-full bg-[#C7F33C] text-black font-bold text-xs">
                            +{dealSummaryResponse.newerActivitiesCount}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isGeneratingSummary}
                    onClick={onGenerateSummary}
                    className="px-3.5 py-1.5 rounded-xl bg-[#C7F33C] hover:bg-[#b0d635] text-black text-xs font-bold shrink-0 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isGeneratingSummary ? 'animate-spin' : ''}`}
                    />
                    <span>Re-Summarize</span>
                  </button>
                </div>
              )}

              {summaryError && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{summaryError}</span>
                </div>
              )}

              {/* Section 1: CURRENT STATUS */}
              {dealSummaryResponse.data.overview && (
                <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                    <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                      CURRENT STATUS
                    </span>
                  </div>
                  <p className="text-xs text-slate-100 leading-relaxed whitespace-pre-wrap font-normal">
                    {dealSummaryResponse.data.overview}
                  </p>
                </div>
              )}

              {/* Section 2: KEY HIGHLIGHTS */}
              {Array.isArray(dealSummaryResponse.data.keyHighlights) &&
                dealSummaryResponse.data.keyHighlights.length > 0 && (
                  <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                      <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                        KEY HIGHLIGHTS
                      </span>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {dealSummaryResponse.data.keyHighlights.map((point, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-slate-100 leading-relaxed flex items-start gap-2.5"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#C7F33C] mt-1.5 shrink-0" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {/* Section 3: BLOCKERS & RISKS */}
              {Array.isArray(dealSummaryResponse.data.blockers) &&
                dealSummaryResponse.data.blockers.length > 0 && (
                  <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-400" />
                      <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                        BLOCKERS & RISKS
                      </span>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {dealSummaryResponse.data.blockers.map((blocker, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-slate-100 leading-relaxed flex items-start gap-2.5"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                          <span>{blocker}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {/* Section 4: RECOMMENDED NEXT STEPS */}
              {Array.isArray(dealSummaryResponse.data.nextSteps) &&
                dealSummaryResponse.data.nextSteps.length > 0 && (
                  <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                      <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                        RECOMMENDED NEXT STEPS
                      </span>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {dealSummaryResponse.data.nextSteps.map((step, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-slate-100 leading-relaxed flex items-start gap-2.5"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#C7F33C] mt-2 shrink-0" />
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {/* Dynamic Dimensions from Custom JSON Schema */}
              {Object.entries(dealSummaryResponse.data).map(([key, value]) => {
                if (['overview', 'keyHighlights', 'blockers', 'nextSteps'].includes(key)) {
                  return null;
                }
                if (value === undefined || value === null || value === '') return null;

                const formattedTitle = key
                  .replace(/([A-Z])/g, ' $1')
                  .replace(/[_-]/g, ' ')
                  .toUpperCase()
                  .trim();

                return (
                  <div
                    key={key}
                    className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] flex flex-col gap-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                      <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                        {formattedTitle}
                      </span>
                    </div>
                    {Array.isArray(value) ? (
                      <ul className="flex flex-col gap-2">
                        {value.map((item, idx) => (
                          <li
                            key={idx}
                            className="text-xs text-slate-100 leading-relaxed flex items-start gap-2.5"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-[#C7F33C] mt-2 shrink-0" />
                            <span>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : typeof value === 'object' ? (
                      <pre className="text-xs text-slate-200 bg-[#252728] p-3 rounded-xl overflow-x-auto font-mono">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-xs text-slate-100 leading-relaxed whitespace-pre-wrap font-normal">
                        {String(value)}
                      </p>
                    )}
                  </div>
                );
              })}

              {/* Footer Actions */}
              <div className="flex items-center justify-between pt-4 pb-6 border-t border-[#3A3B3C]">
                <div className="flex items-center justify-between w-full">
                  {dealSummaryResponse?.usage && (
                    <div
                      className="text-xs px-2.5 py-2 rounded-xl bg-[#252728] text-slate-300 flex items-center gap-1.5 font-mono"
                      title={`Tokens: ${dealSummaryResponse.usage.inputTokens.toLocaleString()} input, ${dealSummaryResponse.usage.outputTokens.toLocaleString()} output`}
                    >
                      <Zap className="w-3.5 h-3.5 text-[#C7F33C]" />
                      <span>{dealSummaryResponse.usage.totalTokens.toLocaleString()} tokens</span>
                      <span className="text-[#4E4F50]">•</span>
                      <span className="text-[#C7F33C] font-semibold">
                        ≈{' '}
                        {dealSummaryResponse.usage.costThb < 0.01
                          ? '<0.01'
                          : dealSummaryResponse.usage.costThb.toFixed(2)}{' '}
                        THB
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
