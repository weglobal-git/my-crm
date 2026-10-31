'use client';

import React from 'react';
import { CheckCircle2, Clock, Info, Sparkles } from 'lucide-react';
import type {
  UpdateGrade,
  UpdateQualityEvaluation,
  UpdateTier,
} from '@/lib/pipeline-update-quality';

export interface PostSendCoachingFeedback {
  tier: UpdateTier;
  grade?: UpdateGrade;
  message: string;
}

interface ActivityUpdateQualityBarProps {
  evaluation: UpdateQualityEvaluation;
  isVisible: boolean;
  postSendFeedback: PostSendCoachingFeedback | null;
  onDismissFeedback: () => void;
}

export const ActivityUpdateQualityBar = React.memo(function ActivityUpdateQualityBar({
  evaluation,
  isVisible,
  postSendFeedback,
  onDismissFeedback,
}: ActivityUpdateQualityBarProps) {
  const showLiveMeter = isVisible && evaluation.reason !== 'IDLE';
  if (!postSendFeedback && !showLiveMeter) {
    return null;
  }

  const feedbackGrade =
    postSendFeedback?.grade ??
    (postSendFeedback?.tier === '27H'
      ? 'PROGRESS_27H'
      : postSendFeedback?.tier === '9H'
      ? 'BRIEF_9H'
      : 'NOTE_0H');

  return (
    <>
      {postSendFeedback && (
        <div
          onClick={onDismissFeedback}
          role="status"
          className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${
            feedbackGrade === 'PROGRESS_27H'
              ? 'bg-[#C7F33C]/12 border-[#C7F33C]/40 text-[#C7F33C]'
              : feedbackGrade === 'OUTREACH_27H'
              ? 'bg-emerald-500/12 border-emerald-400/35 text-emerald-300'
              : feedbackGrade === 'BRIEF_9H'
              ? 'bg-sky-500/12 border-sky-400/35 text-sky-300'
              : 'bg-amber-500/12 border-amber-400/35 text-amber-300'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {feedbackGrade === 'PROGRESS_27H' ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#C7F33C]" />
            ) : feedbackGrade === 'OUTREACH_27H' ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-300" />
            ) : feedbackGrade === 'BRIEF_9H' ? (
              <Clock className="w-3.5 h-3.5 shrink-0 text-sky-300" />
            ) : (
              <Info className="w-3.5 h-3.5 shrink-0 text-amber-300" />
            )}
            <span className="truncate">{postSendFeedback.message}</span>
          </div>
          <span className="text-[10px] opacity-70 shrink-0">Dismiss</span>
        </div>
      )}

      {showLiveMeter && (
        <div className="flex items-center justify-between gap-2 px-1.5 py-0.5">
          <div
            className={`text-[11px] font-medium flex items-center gap-1.5 min-w-0 ${
              evaluation.grade === 'PROGRESS_27H'
                ? 'text-[#C7F33C]'
                : evaluation.grade === 'OUTREACH_27H'
                ? 'text-emerald-300'
                : evaluation.grade === 'BRIEF_9H'
                ? 'text-sky-300'
                : 'text-amber-300'
            }`}
          >
            {evaluation.requiresAiGrading ? (
              <Sparkles
                className={`w-3 h-3 shrink-0 ${
                  evaluation.grade === 'PROGRESS_27H'
                    ? 'text-[#C7F33C]'
                    : evaluation.grade === 'OUTREACH_27H'
                    ? 'text-emerald-300'
                    : 'text-sky-300'
                }`}
              />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-amber-400" />
            )}
            <span className="truncate">{evaluation.liveHint}</span>
          </div>
        </div>
      )}
    </>
  );
});
