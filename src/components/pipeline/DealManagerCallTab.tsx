'use client';

import React, { useState, useRef, useLayoutEffect, useCallback, useEffect } from 'react';
import { Target, Loader2, Check } from 'lucide-react';
import { mutate } from 'swr';
import {
  updateDealTargetGoal,
  type DealAcceleratorsState,
  type AcceleratorQuestion,
} from '@/lib/actions/ai-accelerator';
import { AcceleratorQuestionCard } from './AcceleratorQuestionCard';

export interface DealManagerCallTabProps {
  dealId: string;
  dealTopic?: string | null;
  acceleratorsState: DealAcceleratorsState | null | undefined;
  mutateAccelerators: (data?: any, shouldRevalidate?: boolean) => Promise<any>;
  pendingQuestions: AcceleratorQuestion[];
  answeredQuestions: AcceleratorQuestion[];
  isOwner: boolean;
  isAdmin: boolean;
  canUseManagerCall: boolean;
  onAnswerAccelerator: (questionId: string, answer: string) => Promise<void>;
  onDeleteAcceleratorQuestion: (questionId: string) => Promise<void>;
  isAnsweringQuestionId?: string | null;
  isDeletingQuestionId?: string | null;
}

export function DealManagerCallTab({
  dealId,
  dealTopic,
  acceleratorsState,
  mutateAccelerators,
  pendingQuestions,
  answeredQuestions,
  isOwner,
  isAdmin,
  canUseManagerCall,
  onAnswerAccelerator,
  onDeleteAcceleratorQuestion,
  isAnsweringQuestionId,
  isDeletingQuestionId,
}: DealManagerCallTabProps) {
  const [goalInput, setGoalInput] = useState(() => acceleratorsState?.targetGoal || dealTopic || '');
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const goalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const saveGoalDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const adjustGoalTextareaHeight = useCallback(() => {
    if (goalTextareaRef.current) {
      goalTextareaRef.current.style.height = 'auto';
      goalTextareaRef.current.style.height = `${goalTextareaRef.current.scrollHeight}px`;
    }
  }, []);

  // Sync goalInput during render when source goal updates
  const currentGoal = acceleratorsState?.targetGoal || dealTopic || '';
  const [prevSourceGoal, setPrevSourceGoal] = useState(currentGoal);
  if (currentGoal !== prevSourceGoal) {
    setPrevSourceGoal(currentGoal);
    setGoalInput(currentGoal);
  }

  useLayoutEffect(() => {
    adjustGoalTextareaHeight();
  }, [goalInput, adjustGoalTextareaHeight]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (saveGoalDebounceRef.current) {
        clearTimeout(saveGoalDebounceRef.current);
      }
    };
  }, []);

  const handleAutoSaveGoal = useCallback(
    (newGoal: string) => {
      if (saveGoalDebounceRef.current) {
        clearTimeout(saveGoalDebounceRef.current);
      }
      saveGoalDebounceRef.current = setTimeout(async () => {
        const trimmed = newGoal.trim();
        if (!trimmed || trimmed === acceleratorsState?.targetGoal) return;
        setIsSavingGoal(true);
        try {
          const res = await updateDealTargetGoal(dealId, trimmed);
          if (res.success && res.data) {
            void mutate(['deal-accelerators', dealId], { success: true, data: res.data }, false);
            await mutateAccelerators({ success: true, data: res.data }, false);
          }
        } catch (err) {
          console.error('Failed to auto-save target goal:', err);
        } finally {
          setIsSavingGoal(false);
        }
      }, 800);
    },
    [dealId, acceleratorsState?.targetGoal, mutateAccelerators]
  );

  const handleBlurGoal = async () => {
    if (saveGoalDebounceRef.current) {
      clearTimeout(saveGoalDebounceRef.current);
    }
    const trimmed = goalInput.trim();
    if (!trimmed || trimmed === acceleratorsState?.targetGoal) return;
    setIsSavingGoal(true);
    try {
      const res = await updateDealTargetGoal(dealId, trimmed);
      if (res.success && res.data) {
        void mutate(['deal-accelerators', dealId], { success: true, data: res.data }, false);
        await mutateAccelerators({ success: true, data: res.data }, false);
      }
    } catch (err) {
      console.error('Failed to save target goal on blur:', err);
    } finally {
      setIsSavingGoal(false);
    }
  };

  const [acceleratorTab, setAcceleratorTab] = useState<'pending' | 'answered'>('pending');

  // Smart transition: when pending reaches 0, default to answered tab if history exists
  const [prevPendingCount, setPrevPendingCount] = useState(pendingQuestions.length);
  if (pendingQuestions.length !== prevPendingCount) {
    setPrevPendingCount(pendingQuestions.length);
    if (pendingQuestions.length === 0 && answeredQuestions.length > 0) {
      setAcceleratorTab('answered');
    }
  }

  return (
    <div className="flex flex-col gap-5 mt-2">
      {/* Target Goal Milestone (Direct Editable with Auto-Save) */}
      <div className="flex flex-col gap-2 p-4 rounded-2xl bg-[#3A3B3C] border border-[#4E4F50]/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
            <Target className="w-4 h-4 text-[#F59E0B]" />
            <span>TARGET GOAL</span>
            <span className="text-slate-500 font-normal">
              ({acceleratorsState?.goalSource === 'USER_OVERRIDE' ? 'Custom' : 'AI Inferred'})
            </span>
          </div>
          {isSavingGoal && (
            <span className="text-xs text-amber-400/80 flex items-center gap-1 font-medium">
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving...
            </span>
          )}
        </div>

        <textarea
          ref={goalTextareaRef}
          value={goalInput}
          disabled={!isOwner && !isAdmin}
          onChange={(e) => {
            setGoalInput(e.target.value);
            adjustGoalTextareaHeight();
            handleAutoSaveGoal(e.target.value);
          }}
          onBlur={handleBlurGoal}
          placeholder="Define the primary goal of this deal..."
          rows={1}
          className="w-full bg-transparent border-none text-xs text-slate-200 leading-relaxed italic resize-none focus:outline-none placeholder:text-slate-500 py-1 px-0 overflow-hidden disabled:opacity-80"
        />
      </div>

      {/* Sub-tabs: Pending Calls vs Answered History */}
      <div className="flex items-center gap-2 border-b border-[#4E4F50] pb-2">
        <button
          type="button"
          onClick={() => setAcceleratorTab('pending')}
          className={`text-xs font-bold px-3.5 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer ${
            acceleratorTab === 'pending'
              ? 'bg-[#F59E0B] text-slate-950'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#3A3B3C]'
          }`}
        >
          <span>Pending Calls</span>
          {pendingQuestions.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-xs font-bold ${
                acceleratorTab === 'pending'
                  ? 'bg-slate-950 text-[#F59E0B]'
                  : 'bg-[#F59E0B] text-slate-950'
              }`}
            >
              {pendingQuestions.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setAcceleratorTab('answered')}
          className={`text-xs font-bold px-3.5 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer ${
            acceleratorTab === 'answered'
              ? 'bg-[#F59E0B] text-slate-950'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#3A3B3C]'
          }`}
        >
          <span>Answered History</span>
          {answeredQuestions.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-xs font-bold ${
                acceleratorTab === 'answered'
                  ? 'bg-slate-950 text-[#F59E0B]'
                  : 'bg-[#4E4F50] text-slate-200'
              }`}
            >
              {answeredQuestions.length}
            </span>
          )}
        </button>
      </div>

      {/* Content: Pending or Answered */}
      {acceleratorTab === 'pending' ? (
        pendingQuestions.length > 0 ? (
          <div className="flex flex-col gap-3">
            {pendingQuestions.map((q) => (
              <AcceleratorQuestionCard
                key={q.id}
                question={q}
                canDelete={canUseManagerCall}
                onDelete={onDeleteAcceleratorQuestion}
                onAnswer={onAnswerAccelerator}
                isAnswering={isAnsweringQuestionId === q.id}
                isDeleting={isDeletingQuestionId === q.id}
                variant="panel"
              />
            ))}
          </div>
        ) : (
          <div className="p-8 rounded-2xl bg-[#3A3B3C] border border-[#4E4F50] text-center flex flex-col items-center gap-2">
            <Check className="w-8 h-8 text-[#C7F33C]" />
            <p className="text-sm font-semibold text-slate-200">No Question Remaining </p>
            <p className="text-xs text-slate-400">
              All questions from Manager and AI have been answered
            </p>
          </div>
        )
      ) : answeredQuestions.length > 0 ? (
        <div className="flex flex-col gap-3">
          {answeredQuestions.map((q) => (
            <AcceleratorQuestionCard
              key={q.id}
              question={q}
              canDelete={canUseManagerCall}
              onDelete={onDeleteAcceleratorQuestion}
              isDeleting={isDeletingQuestionId === q.id}
              variant="panel"
            />
          ))}
        </div>
      ) : (
        <div className="p-8 rounded-2xl bg-[#3A3B3C] border border-[#4E4F50] text-center flex flex-col items-center gap-2">
          <p className="text-xs text-slate-400">No History</p>
        </div>
      )}
    </div>
  );
}
