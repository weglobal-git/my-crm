import React, { useState, useRef, useEffect } from 'react';
import { PhoneCall, Sparkles, Trash2, Loader2, Send, Check } from 'lucide-react';
import { AcceleratorQuestion } from '@/lib/actions/ai-accelerator';

export interface AcceleratorQuestionCardProps {
  question: AcceleratorQuestion;
  canDelete?: boolean;
  onDelete?: (questionId: string) => void;
  onAnswer?: (questionId: string, answer: string) => Promise<void> | void;
  isAnswering?: boolean;
  isDeleting?: boolean;
  variant?: 'activity' | 'panel';
}

export const formatQuestionDate = (date: Date | string) => {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleDateString('en-GB', { month: 'short' });
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
};

export function AcceleratorQuestionCard({
  question,
  canDelete = false,
  onDelete,
  onAnswer,
  isAnswering = false,
  isDeleting = false,
  variant = 'panel',
}: AcceleratorQuestionCardProps) {
  const [answerText, setAnswerText] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isPending = question.status === 'PENDING';
  const isManager = question.source === 'MANAGER';

  useEffect(() => {
    if (!isAnswering) {
      setSelectedChoice(null);
    }
  }, [isAnswering]);

  const adjustTextareaHeight = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.min(Math.max(el.scrollHeight, 28), 120);
    el.style.height = `${nextHeight}px`;
  };

  useEffect(() => {
    if (!answerText && inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [answerText]);

  const handleSend = () => {
    if (!answerText.trim() || isAnswering) return;
    const clean = answerText.trim();
    setAnswerText('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    onAnswer?.(question.id, clean);
  };

  return (
    <div
      className={`rounded-2xl transition-all ${
        isPending
          ? isManager
            ? 'bg-[#2A2318] border-2 border-[#F59E0B] shadow-lg shadow-amber-500/10'
            : 'bg-[#231E2F] border-2 border-purple-500 shadow-lg shadow-purple-500/10'
          : 'bg-[#3A3B3C]'
      } p-2 flex flex-col gap-3 w-full text-left`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#4E4F50]/30">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {isManager ? (
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1 shrink-0 ${
                isPending ? 'bg-[#F59E0B] text-slate-950' : 'bg-[#F59E0B]/20 text-amber-300 border border-[#F59E0B]/30'
              }`}
            >
              <span>Manager Call</span>
            </span>
          ) : (
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1 shrink-0 ${
                isPending
                  ? 'bg-purple-600 text-white'
                  : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>AI Accelerator</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-amber-200/90">
            {question.createdAt ? formatQuestionDate(question.createdAt) : ''}
          </span>
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete?.(question.id)}
              disabled={isDeleting}
              className="p-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
              title="Delete Question"
            >
              {isDeleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Question Text */}
      <p className="text-xs sm:text-sm font-semibold text-slate-100 leading-relaxed whitespace-pre-wrap">
        {question.question}
      </p>

      {/* Pending State: Choices & Reply Input */}
      {isPending ? (
        <div className="flex flex-col gap-2.5 pt-1">
          {/* Preset Choices if AI generated */}
          {question.choices && question.choices.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {question.choices.map((choice, cIdx) => {
                const isSelected = isAnswering && selectedChoice === choice;
                return (
                  <button
                    key={cIdx}
                    type="button"
                    onClick={() => {
                      setSelectedChoice(choice);
                      onAnswer?.(question.id, choice);
                    }}
                    disabled={isAnswering}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1C1C1D] text-xs font-medium transition-all cursor-pointer disabled:opacity-60 ${
                      isManager
                        ? 'hover:bg-[#F59E0B] hover:text-slate-950 text-amber-200 border border-amber-500/40'
                        : 'hover:bg-purple-600 hover:text-white text-purple-200 border border-purple-500/40'
                    } ${
                      isSelected
                        ? isManager
                          ? 'bg-[#F59E0B] text-slate-950 border-[#F59E0B] font-bold shadow-sm'
                          : 'bg-purple-600 text-white border-purple-600 font-bold shadow-sm'
                        : ''
                    }`}
                  >
                    {isSelected && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                    <span>{choice}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Auto-expanding Input Box with Send Button Inside (Like EditDealPanel) */}
          <div className={`flex items-end gap-1 bg-[#1C1C1D] px-2 py-1 rounded-xl border transition-all ${
            isManager
              ? 'border-amber-500/40 focus-within:border-amber-400'
              : 'border-purple-500/40 focus-within:border-purple-400'
          }`}>
            <textarea
              ref={inputRef}
              rows={1}
              value={answerText}
              disabled={isAnswering}
              onChange={(e) => {
                setAnswerText(e.target.value);
                adjustTextareaHeight(e.target);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (e.shiftKey) {
                    setTimeout(() => adjustTextareaHeight(inputRef.current), 0);
                    return;
                  }
                  const isMobileDevice =
                    typeof window !== 'undefined' &&
                    ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
                    window.innerWidth < 768;

                  if (!isMobileDevice) {
                    e.preventDefault();
                    handleSend();
                  } else {
                    setTimeout(() => adjustTextareaHeight(inputRef.current), 0);
                  }
                }
              }}
              placeholder="Answer here..."
              style={{ height: 'auto', minHeight: '28px', maxHeight: '120px' }}
              className="flex-1 bg-transparent border-none pl-1 text-white text-[13px] sm:text-[14px] focus:outline-none placeholder:text-slate-400 min-w-0 resize-none overflow-y-auto leading-5 hide-scrollbar py-1"
            />

            {/* Send Button / Indicator (Anchored to bottom, height 28px) */}
            {isAnswering ? (
              <div className="w-7 h-7 flex items-center justify-center shrink-0 self-end">
                <Loader2 className={`w-4 h-4 animate-spin ${isManager ? 'text-[#F59E0B]' : 'text-purple-400'}`} />
              </div>
            ) : answerText.trim() ? (
              <button
                type="button"
                onClick={handleSend}
                className={`w-7 h-7 flex items-center justify-center shrink-0 rounded-full transition-colors cursor-pointer self-end ${
                  isManager
                    ? 'text-[#F59E0B] hover:bg-amber-500/20'
                    : 'text-purple-400 hover:bg-purple-500/20'
                }`}
                title="Answer (Enter)"
              >
                <Send className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        /* Answered State: Reply-style response with respondent's profile */
        <div className="mt-1 pt-3 border-t border-[#4E4F50]/40 flex gap-2.5 items-start">
          {/* Respondent Avatar */}
          <div className="w-8 h-8 rounded-full bg-[#4E4F50] shrink-0 overflow-hidden border border-[#4E4F50]/80 shadow-sm mt-0.5">
            <img
              src={
                question.answeredByImage ||
                `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(question.answeredBy || 'User')}`
              }
              alt={question.answeredBy || 'User'}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Reply Bubble / Container */}
          <div className="flex-1 min-w-0 bg-[#3A3B3C] rounded-2xl rounded-tl-sm flex flex-col gap-1.5">
            {/* Header: User Name + Answer Badge + Timestamp */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-bold text-slate-100 truncate">
                  {question.answeredBy || 'ผู้ใช้งาน'}
                </span>
              </div>
              {question.answeredAt && (
                <span className="text-xs text-slate-400 font-normal shrink-0">
                  {formatQuestionDate(question.answeredAt)}
                </span>
              )}
            </div>

            {/* Answer Message */}
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
              {question.answer}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
