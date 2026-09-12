'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import useSWR, { useSWRConfig, type KeyedMutator } from 'swr';
import { useDropzone } from 'react-dropzone';
import imageCompression from 'browser-image-compression';
import {
  PhoneCall,
  BellRing,
  Sparkles,
  Send,
  Loader2,
  X,
  Paperclip,
  ListTodo,
} from 'lucide-react';
import type { Role } from '@prisma/client';
import type { Session } from 'next-auth';
import type { OpportunityWithRelations } from '@/components/pipeline/KanbanCard';
import type { DealAcceleratorsState, AcceleratorQuestion } from '@/lib/actions/ai-accelerator';
import { createManagerCallQuestion } from '@/lib/actions/ai-accelerator';
import type { DealSummaryResponse } from '@/lib/actions/deal-summary';
import { getNotes } from '@/lib/actions/notes';
import { getIncompleteTodosCount, type DealTodoNote } from '@/lib/deal-todo-sync';
import { addActivityLog, updateDueDateWithLog } from '@/lib/actions/opportunity';
import {
  type ActivityLogPage,
  type ActivityLogWithRelations,
  replaceOptimisticActivity,
} from '@/lib/pipeline-activity-cache';
import {
  ActivityComment,
  formatShortDueDate,
  MIN_DUE_DATE_REASON_LENGTH,
} from './ActivityCommentItem';
import { ChatAttachmentButton } from './ChatAttachmentButton';
import { useDealDraft } from '@/lib/deal-draft-store';
import {
  isPendingAcceleratorsKey,
  incrementPendingBadge,
  decrementPendingBadge,
} from '@/lib/deal-accelerators-sync';
import { rollbackDueDate } from '@/lib/pipeline-delete-rollback';

export interface ActivityFeedTabProps {
  deal: OpportunityWithRelations;
  localActivityLogs: ActivityLogWithRelations[];
  loadActivityLogs: (
    data?: (currentPages?: ActivityLogPage[]) => ActivityLogPage[] | undefined,
    opts?: { revalidate?: boolean }
  ) => Promise<ActivityLogPage[] | undefined>;
  isLoadingLogs: boolean;
  hasMoreLogs: boolean;
  isLoadingMore?: boolean;
  lastLogElementRef?: (node: HTMLDivElement | null) => void;
  rawLocalActivityPages?: ActivityLogPage[];
  acceleratorsState?: DealAcceleratorsState;
  acceleratorsResponse?: { data?: DealAcceleratorsState };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mutateAccelerators: any;
  mutateDealSummary?: KeyedMutator<DealSummaryResponse>;
  pendingQuestions: AcceleratorQuestion[];
  getElapsedWaitText: () => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setActiveTab: (tab: any) => void;
  session: Session | null;
  activitySearchQuery?: string;
  canEditDueDate: boolean;
  canUseManagerCall: boolean;
  onAnswerAccelerator?: (questionId: string, answer: string) => Promise<void>;
  onDeleteAcceleratorQuestion?: (questionId: string) => Promise<void> | void;
  onOpenPreview?: (url: string, index?: number, allUrls?: string[]) => void;
  onShowRewriteModal?: () => void;
  toast: (options: { title: string; description: string; type: 'success' | 'error' | 'warning' | 'info' }) => void;
}

export function ActivityFeedTab({
  deal,
  localActivityLogs,
  loadActivityLogs,
  isLoadingLogs,
  hasMoreLogs,
  isLoadingMore = false,
  lastLogElementRef,
  rawLocalActivityPages,
  acceleratorsState,
  acceleratorsResponse,
  mutateAccelerators,
  mutateDealSummary,
  pendingQuestions,
  getElapsedWaitText,
  setActiveTab,
  session,
  activitySearchQuery = '',
  canEditDueDate,
  canUseManagerCall,
  onAnswerAccelerator,
  onDeleteAcceleratorQuestion,
  onOpenPreview,
  onShowRewriteModal,
  toast,
}: ActivityFeedTabProps) {
  const { mutate } = useSWRConfig();

  // Shared Deal Notes SWR Cache for To-Do announcement bar
  const { data: dealNotes = [] } = useSWR<DealTodoNote[]>(
    ['deal-notes', deal.id],
    () => getNotes(deal.id),
    { revalidateOnFocus: true, revalidateOnReconnect: true, dedupingInterval: 5_000 }
  );
  const pendingTodosCount = getIncompleteTodosCount(dealNotes);

  // In-Memory Draft Preservation Hook
  const { draft, updateDraft, clearCurrentDraft } = useDealDraft(deal.id, 'activity');

  const [newLog, setNewLog] = useState(draft.text || '');
  const [pendingDueDate, setPendingDueDate] = useState<Date | 'REMOVE' | null>(draft.pendingDueDate || null);
  const [pendingAttachments, setPendingAttachments] = useState<File[]>(draft.pendingAttachments || []);
  const [isManagerCallMode, setIsManagerCallMode] = useState(draft.isManagerCallMode || false);

  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedPopupDate, setSelectedPopupDate] = useState<Date | null>(null);

  const [isSubmittingLog, setIsSubmittingLog] = useState(false);
  const [isSendingManagerCall, setIsSendingManagerCall] = useState(false);
  const [dockEl, setDockEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setDockEl(document.getElementById('deal-panel-activity-dock'));
    });
  }, []);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const isSubmittingLogRef = useRef(false);
  const isSendingManagerCallRef = useRef(false);

  const adjustTextareaHeight = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.min(Math.max(el.scrollHeight, 28), 120);
    el.style.height = `${nextHeight}px`;
  };

  // Close calendar popup on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setShowCalendar(false);
      }
    };
    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCalendar]);

  // Adjust height when input value is hydrated from draft
  useEffect(() => {
    if (inputRef.current) {
      adjustTextareaHeight(inputRef.current);
    }
  }, [newLog]);

  // File Dropzone configuration
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      setPendingAttachments((prev) => {
        const next = [...prev, ...acceptedFiles];
        updateDraft({ pendingAttachments: next });
        return next;
      });
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    [updateDraft]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  });

  // Handle Send Manager Call
  const handleSendManagerCall = async () => {
    if (isSendingManagerCallRef.current || !newLog.trim()) return;
    const questionText = newLog.trim();
    isSendingManagerCallRef.current = true;
    setIsSendingManagerCall(true);

    // 1. Clear input immediately synchronously
    setNewLog('');
    updateDraft({ text: '', isManagerCallMode: false });
    if (inputRef.current) {
      inputRef.current.value = '';
      adjustTextareaHeight(inputRef.current);
    }
    setIsManagerCallMode(false);

    // 2. Optimistic UI (< 10ms): Render question instantly without waiting for network
    const optimisticQId = `acc_mgr_${Date.now()}`;
    const optimisticQuestion: AcceleratorQuestion = {
      id: optimisticQId,
      question: questionText,
      reason: 'คำถามด่วนจากฝ่ายบริหาร (Manager Call)',
      status: 'PENDING',
      source: 'MANAGER',
      createdAt: new Date().toISOString(),
      askedBy: session?.user?.name || 'Manager',
      askedByImage: session?.user?.image || null,
    };

    const previousState = acceleratorsResponse;
    const baseState: DealAcceleratorsState = acceleratorsState || {
      targetGoal: deal.topic || 'บรรลุเป้าหมายการ์ด',
      goalSource: 'AI_INFERRED',
      questions: [],
    };
    const newState: DealAcceleratorsState = {
      ...baseState,
      questions: [...(baseState.questions || []), optimisticQuestion],
      updatedAt: new Date().toISOString(),
    };
    void mutate(['deal-accelerators', deal.id], { success: true, data: newState }, false);
    void mutateAccelerators({ success: true, data: newState }, false);

    const optimisticLog = {
      id: `opt_log_${Date.now()}`,
      content: `[URGENT_CALL:${optimisticQId}] ${questionText}`,
      type: 'COMMENT',
      opportunityId: deal.id,
      userId: session?.user?.id || '',
      createdAt: new Date(),
      updatedAt: new Date(),
      isEdited: false,
      parentId: null,
      user: {
        id: session?.user?.id || '',
        name: session?.user?.name || 'Manager',
        email: session?.user?.email || null,
        image: session?.user?.image || null,
        role: ((session?.user as Record<string, unknown>)?.role || 'MANAGEMENT') as Role,
      },
      replies: [],
    } as unknown as ActivityLogWithRelations;

    if (loadActivityLogs) {
      void loadActivityLogs((currentPages) => {
        if (!currentPages || currentPages.length === 0) {
          return [{ data: [optimisticLog] }];
        }
        return [
          {
            ...currentPages[0],
            data: [optimisticLog, ...currentPages[0].data],
          },
          ...currentPages.slice(1),
        ];
      }, { revalidate: false });
    }

    // Optimistically increment badge count
    void mutate(
      isPendingAcceleratorsKey,
      (prevMap: Record<string, { count: number; earliestPendingAt: string | null }> | undefined) =>
        incrementPendingBadge(prevMap, deal.id),
      false
    );

    // Rollback helper for pending-accelerators badge
    const rollbackPendingBadge = () => {
      void mutate(
        isPendingAcceleratorsKey,
        (prevMap: Record<string, { count: number; earliestPendingAt: string | null }> | undefined) =>
          decrementPendingBadge(prevMap, deal.id),
        false
      );
    };

    // 3. Fire server action in background
    try {
      const res = await createManagerCallQuestion(deal.id, questionText, optimisticQId);
      if (!res.success) {
        if (previousState) {
          void mutate(['deal-accelerators', deal.id], previousState, false);
          void mutateAccelerators(previousState, false);
        }
        rollbackPendingBadge();
        void loadActivityLogs();
        setNewLog(questionText);
        updateDraft({ text: questionText });
        toast({
          title: 'ส่งคำถามไม่สำเร็จ',
          description: res.error || 'เกิดข้อผิดพลาดในการส่งคำถามด่วน',
          type: 'error',
        });
        return;
      }
      if (res.data) {
        void mutate(['deal-accelerators', deal.id], { success: true, data: res.data }, false);
        void mutateAccelerators({ success: true, data: res.data }, false);
      }
      clearCurrentDraft();
    } catch (err) {
      if (previousState) {
        void mutate(['deal-accelerators', deal.id], previousState, false);
        void mutateAccelerators(previousState, false);
      }
      rollbackPendingBadge();
      void loadActivityLogs();
      setNewLog(questionText);
      updateDraft({ text: questionText });
      const errMsg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการส่งคำถามด่วน';
      toast({ title: 'ส่งคำถามไม่สำเร็จ', description: errMsg, type: 'error' });
    } finally {
      setIsSendingManagerCall(false);
      isSendingManagerCallRef.current = false;
    }
  };

  // Handle Add Log (Comment & Due Date update)
  const handleAddLog = async () => {
    if (isSubmittingLogRef.current) return;
    if (!newLog.trim() && pendingAttachments.length === 0 && !pendingDueDate) return;

    isSubmittingLogRef.current = true;
    const fakeId = `temp-${Date.now()}`;
    const currentNewLog = newLog;
    const currentDueDate = pendingDueDate;
    const currentAttachments = [...pendingAttachments];

    // Format content for instant optimistic display
    let optimisticContent = currentNewLog.trim();
    if (currentDueDate) {
      const dateStr =
        currentDueDate === 'REMOVE'
          ? 'Removed'
          : new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(
              currentDueDate
            );
      optimisticContent = `[DUE DATE: ${dateStr}]\nReason: ${optimisticContent || 'No reason provided'}`;
    }

    if (currentAttachments.length > 0) {
      const attachInfo = currentAttachments.map((f) => {
        const previewUrl = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(f) : 'uploading...';
        return `[ATTACHMENT:${previewUrl}|${f.name}|${f.type}]`;
      }).join('\n');
      optimisticContent = (optimisticContent + '\n' + attachInfo).trim();
    }

    const optimisticLog = {
      id: fakeId,
      content: optimisticContent,
      type: 'COMMENT',
      createdAt: new Date(),
      opportunityId: deal.id,
      userId: session?.user?.id || '',
      user: {
        id: session?.user?.id || '',
        name: session?.user?.name || '',
        image: session?.user?.image || '',
        email: session?.user?.email || '',
        role: 'GENERAL',
      },
      replies: [],
    } as unknown as ActivityLogWithRelations;

    // 2. Inject into SWR Cache instantly (0ms delay)
    loadActivityLogs(
      (currentPages) => {
        if (!currentPages) return currentPages;
        const newPages = [...currentPages];
        if (newPages[0]) {
          newPages[0] = {
            ...newPages[0],
            data: [optimisticLog, ...newPages[0].data],
          };
        }
        return newPages;
      },
      { revalidate: false }
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    mutate(
      (key) => Array.isArray(key) && key[0] === 'pipeline-deals',
      (currentData: OpportunityWithRelations[] | undefined) => {
        if (!currentData) return currentData;
        return currentData.map((opp) => {
          if (opp.id === deal.id) {
            const isDueExpired = opp.dueDate && new Date(opp.dueDate) <= today;
            const updatedDueDate = currentDueDate
              ? currentDueDate === 'REMOVE'
                ? null
                : currentDueDate
              : isDueExpired
              ? null
              : opp.dueDate;
            return {
              ...opp,
              dueDate: updatedDueDate,
              activityLogs: [optimisticLog, ...(opp.activityLogs || [])],
            };
          }
          return opp;
        });
      },
      { revalidate: false }
    );

    // Notify AI Summary
    void mutateDealSummary?.(
      (current) => {
        if (!current?.data) return current;
        return {
          ...current,
          isOutdated: true,
          newerActivitiesCount: (current.newerActivitiesCount || 0) + 1,
        };
      },
      { revalidate: false }
    );

    // 3. Clear UI instantly for snappy feel and wipe in-memory draft
    setNewLog('');
    setPendingDueDate(null);
    setPendingAttachments([]);
    setShowCalendar(false);
    clearCurrentDraft();

    // 4. Perform heavy lifting in background
    setIsSubmittingLog(true);
    try {
      let attachmentText = '';

      if (currentAttachments.length > 0) {
        for (const file of currentAttachments) {
          const isImage = file.type.startsWith('image/');
          let fileToUpload = file;

          if (isImage) {
            fileToUpload = await imageCompression(file, {
              maxSizeMB: 1,
              maxWidthOrHeight: 1920,
              useWebWorker: true,
            });
          }

          const fileBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(fileToUpload);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = (error) => reject(error);
          });

          const response = await fetch('/api/upload/opportunity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              opportunityId: deal.id,
              fileBase64,
              fileName: file.name,
              fileType: file.type,
              size: fileToUpload.size,
              isRaw: !isImage,
            }),
          });

          const data = await response.json();
          if (data.success && data.attachment?.cloudinaryUrl) {
            attachmentText += `\n[ATTACHMENT:${data.attachment.cloudinaryUrl}|${file.name}|${file.type}]`;
          }
        }
      }

      const finalLog = (currentNewLog.trim() + attachmentText).trim() || 'Updated deal';
      const mutationId = `due-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      let persistedLog: ActivityLogWithRelations | null = null;
      if (currentDueDate === 'REMOVE') {
        const res = await updateDueDateWithLog(deal.id, null, finalLog, mutationId);
        persistedLog = (res?.activityLog as unknown as ActivityLogWithRelations) || null;
      } else if (currentDueDate instanceof Date) {
        const res = await updateDueDateWithLog(deal.id, currentDueDate, finalLog, mutationId);
        persistedLog = (res?.activityLog as unknown as ActivityLogWithRelations) || null;
      } else {
        persistedLog = (await addActivityLog(deal.id, finalLog)) as ActivityLogWithRelations;
      }

      if (persistedLog) {
        loadActivityLogs(
          (pages) => replaceOptimisticActivity(pages, fakeId, persistedLog as ActivityLogWithRelations),
          { revalidate: false }
        );
        mutate(
          (key) => Array.isArray(key) && key[0] === 'pipeline-deals',
          (currentData: OpportunityWithRelations[] | undefined) => {
            if (!currentData) return currentData;
            return currentData.map((opp) => {
              if (opp.id === deal.id) {
                return {
                  ...opp,
                  activityLogs: (opp.activityLogs || []).map((l) => (l.id === fakeId ? (persistedLog as unknown as typeof l) : l)),
                };
              }
              return opp;
            });
          },
          { revalidate: false }
        );
      } else {
        loadActivityLogs();
      }

      if (currentAttachments.length > 0 || finalLog.includes('http')) {
        void mutate(['opportunity-shared-media', deal.id]);
      }
    } catch (e) {
      // Revert if error
      setNewLog(currentNewLog);
      setPendingDueDate(currentDueDate);
      setPendingAttachments(currentAttachments);
      updateDraft({
        text: currentNewLog,
        pendingDueDate: currentDueDate,
        pendingAttachments: currentAttachments,
      });
      loadActivityLogs();
      mutate(
        (key) => Array.isArray(key) && key[0] === 'pipeline-deals',
        (currentData: OpportunityWithRelations[] | undefined) => {
          if (!currentData) return currentData;
          const restored = rollbackDueDate(currentData, deal.id, deal.dueDate);
          return restored?.map((opp) =>
            opp.id === deal.id ? { ...opp, activityLogs: deal.activityLogs || [] } : opp
          );
        },
        { revalidate: false }
      );
      if (e instanceof Error) {
        toast({ title: 'Error', description: 'Failed to add log: ' + e.message, type: 'error' });
      }
    } finally {
      setIsSubmittingLog(false);
      isSubmittingLogRef.current = false;
      if (inputRef.current) {
        adjustTextareaHeight(inputRef.current);
      }
    }
  };

  // Comments processing
  let comments = localActivityLogs.filter((log) => log.type === 'COMMENT' && !log.parentId);

  // Filter out answered Manager Call questions from feed
  comments = comments.filter((log) => {
    if (!log.content.startsWith('[URGENT_CALL:')) return true;
    if (!acceleratorsState) return false;
    const match = log.content.match(/^\[URGENT_CALL:([^\]]+)\]\s*([\s\S]*)$/);
    const qId = match ? match[1] : '';
    const qText = match ? match[2].trim() : '';
    const targetQ =
      acceleratorsState.questions?.find((q) => q.id === qId && q.question.trim() === qText) ||
      acceleratorsState.questions?.find((q) => q.id === qId && q.status === 'PENDING') ||
      acceleratorsState.questions?.find((q) => q.id === qId);
    if (targetQ) {
      return targetQ.status === 'PENDING';
    }
    return false;
  });

  // Fallback: If pending questions are not in comments yet, synthesize
  const pendingAccelerators = acceleratorsState?.questions?.filter((q) => q.status === 'PENDING') || [];
  if (pendingAccelerators.length > 0) {
    const existingQIds = new Set(
      comments
        .filter((log) => log.content.startsWith('[URGENT_CALL:'))
        .map((log) => {
          const match = log.content.match(/^\[URGENT_CALL:([^\]]+)\]/);
          return match ? match[1] : '';
        })
        .filter(Boolean)
    );

    const missingQuestions = pendingAccelerators.filter((q) => {
      if (existingQIds.has(q.id)) return false;
      const isTextAlreadyPresent = comments.some((log) => {
        if (!log.content.startsWith('[URGENT_CALL:')) return false;
        const match = log.content.match(/^\[URGENT_CALL:[^\]]+\]\s*([\s\S]*)$/);
        return match && match[1].trim() === q.question.trim();
      });
      return !isTextAlreadyPresent;
    });

    if (missingQuestions.length > 0) {
      const syntheticLogs = missingQuestions.map((q) => ({
        id: `synth_log_${q.id}`,
        content: `[URGENT_CALL:${q.id}] ${q.question}`,
        type: 'COMMENT',
        opportunityId: deal.id,
        userId: q.askedByUserId || session?.user?.id || '',
        createdAt: q.createdAt ? new Date(q.createdAt) : new Date(),
        updatedAt: q.createdAt ? new Date(q.createdAt) : new Date(),
        isEdited: false,
        parentId: null,
        user: {
          id: q.askedByUserId || session?.user?.id || '',
          name: q.askedBy || (q.source === 'MANAGER' ? 'Manager' : 'AI Assistant'),
          image: q.askedByImage || null,
          email: null,
          role: (q.source === 'MANAGER' ? 'MANAGEMENT' : 'ADMIN') as Role,
        },
        replies: [],
      })) as unknown as ActivityLogWithRelations[];

      comments = [...syntheticLogs, ...comments];
    }
  }

  if (activitySearchQuery.trim()) {
    const query = activitySearchQuery.toLowerCase();
    comments = comments.filter(
      (log) => log.content?.toLowerCase().includes(query) || log.user?.name?.toLowerCase().includes(query)
    );
  }

  const groupedComments = comments.reduce((acc, log) => {
    const year = new Date(log.createdAt).getFullYear();
    if (!acc[year]) acc[year] = [];
    acc[year].push(log);
    return acc;
  }, {} as Record<number, typeof comments>);

  const sortedYears = Object.keys(groupedComments)
    .map(Number)
    .sort((a, b) => b - a);

  const activeDueDate =
    pendingDueDate && pendingDueDate !== 'REMOVE'
      ? pendingDueDate
      : !pendingDueDate && deal.dueDate
      ? deal.dueDate
      : null;
  const isDuePending = Boolean(pendingDueDate);
  const isDueValid = isDuePending ? newLog.trim().length >= MIN_DUE_DATE_REASON_LENGTH : true;
  const hasSubmitContent = isDuePending ? true : newLog.trim().length > 0 || pendingAttachments.length > 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full">
      {/* Sticky/Pinned Top Announcements Container */}
      {(pendingQuestions.length > 0 || pendingTodosCount > 0) && (
        <div className="px-2 pt-2 pb-1 flex flex-col gap-1 shrink-0 bg-[#252728] z-20">
          {/* Urgent Call Announcement Bar */}
          {pendingQuestions.length > 0 && (
            <div
              onClick={() => setActiveTab('manager-call')}
              className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 flex items-center justify-between gap-3 text-amber-300 hover:bg-amber-500/15 transition cursor-pointer shadow-sm"
            >
              <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
                <PhoneCall className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
                <span className="font-bold text-xs text-amber-400 shrink-0">Manager Call</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 shrink-0">
                  {pendingQuestions.length} Pending
                </span>
                <span className="text-xs text-amber-200/90 font-mono font-medium tracking-wide tabular-nums shrink-0">
                  {getElapsedWaitText()}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('manager-call');
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold shrink-0 hover:bg-amber-400 transition cursor-pointer shadow"
              >
                Answer
              </button>
            </div>
          )}

          {/* To-Do Announcement Bar */}
          {pendingTodosCount > 0 && (
            <div
              onClick={() => setActiveTab('notes')}
              className="bg-[#C7F33C]/10 border border-[#C7F33C]/30 rounded-xl px-3 py-2 flex items-center justify-between gap-3 text-[#C7F33C] hover:bg-[#C7F33C]/15 transition cursor-pointer shadow-sm"
            >
              <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
                <ListTodo className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />
                <span className="font-bold text-xs text-[#C7F33C] shrink-0">To-Do Tasks</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#C7F33C]/20 text-[#C7F33C] font-bold border border-[#C7F33C]/30 shrink-0">
                  {pendingTodosCount} {pendingTodosCount === 1 ? 'Pending' : 'Pending'}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('notes');
                }}
                className="px-2.5 py-1 rounded-lg bg-[#C7F33C] text-slate-950 text-xs font-bold shrink-0 hover:bg-[#b8e42f] transition cursor-pointer shadow"
              >
                View To-Do
              </button>
            </div>
          )}
        </div>
      )}

      {/* Scrollable Feed Timeline Container */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 flex flex-col gap-6 custom-scrollbar">

      {/* Feed List */}
      <div className="flex flex-col gap-6">
        {isLoadingLogs && !rawLocalActivityPages ? (
          <div className="flex flex-col gap-6 w-full mt-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-[#3A3B3C] shrink-0" />
                <div className="flex flex-col gap-2 flex-1">
                  <div className="w-3/4 h-16 bg-[#3A3B3C] rounded-2xl rounded-tl-sm" />
                  <div className="w-24 h-3 bg-[#3A3B3C] rounded-full ml-2" />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-10 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]">
            <p className="text-xs text-slate-300 font-medium">
              {activitySearchQuery.trim() ? 'No updates found.' : 'No updates yet.'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {activitySearchQuery.trim() ? 'Try searching for something else.' : 'Be the first to post an update on this deal.'}
            </p>
          </div>
        ) : (
          sortedYears.map((year) => (
            <div key={year} className="flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <h3 className="font-semibold text-xl text-slate-100">{year}</h3>
                <div className="h-px bg-[#4E4F50] flex-1"></div>
              </div>
              {groupedComments[year].map((log) => (
                <ActivityComment
                  key={log.id}
                  log={log}
                  dealId={deal.id}
                  currentUser={
                    session?.user as unknown as {
                      id: string;
                      name?: string | null;
                      image?: string | null;
                      email?: string | null;
                      role?: string;
                    }
                  }
                  refresh={() => loadActivityLogs()}
                  mutateLogs={loadActivityLogs}
                  searchQuery={activitySearchQuery}
                  acceleratorsState={acceleratorsState}
                  onAnswerQuestion={onAnswerAccelerator}
                  onDeleteQuestion={onDeleteAcceleratorQuestion}
                  canUseManagerCall={canUseManagerCall}
                  onReplyClick={(username) => {
                    setNewLog((prev) => {
                      const next = prev ? `${prev} @${username} ` : `@${username} `;
                      updateDraft({ text: next });
                      return next;
                    });
                    if (inputRef.current) inputRef.current.focus();
                  }}
                  onImageClick={onOpenPreview}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Infinite Scroll Loader */}
      {hasMoreLogs && (
        <div ref={lastLogElementRef} className="py-4 flex justify-center mt-2">
          {isLoadingMore ? (
            <Loader2 className="w-6 h-6 animate-spin text-[#C7F33C]" />
          ) : (
            <span className="text-xs text-slate-400">Scroll for more</span>
          )}
        </div>
      )}
      </div>

      {/* Sticky Bottom Input Bar (docked in deal-panel-activity-dock for full width) */}
      {(() => {
        const bar = (
          <div className="bg-[#252728] border-t border-[#1C1C1D] shrink-0 z-10 flex flex-col gap-1.5 relative w-full p-2.5 pt-2">
        {/* Mini Calendar Popup */}
        {canEditDueDate && showCalendar && (
          <div
            ref={calendarRef}
            className="absolute bottom-[100%] left-4 mb-2 bg-[#3A3B3C] border border-[#4E4F50] rounded-2xl p-4 z-50 w-[280px]"
          >
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() =>
                  setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))
                }
                className="p-1 hover:bg-[#4E4F50] rounded-full text-slate-400 cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <span className="font-bold text-slate-100 text-xs">
                {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </span>
              <button
                onClick={() =>
                  setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))
                }
                className="p-1 hover:bg-[#4E4F50] rounded-full text-slate-400 cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
                <div key={day} className="text-xs font-bold text-slate-400">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() }).map(
                (_, i) => (
                  <div key={`empty-${i}`} className="h-8"></div>
                )
              )}
              {Array.from({
                length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate(),
              }).map((_, i) => {
                const date = i + 1;
                const cellDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), date);
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const isToday =
                  date === new Date().getDate() &&
                  calendarMonth.getMonth() === new Date().getMonth() &&
                  calendarMonth.getFullYear() === new Date().getFullYear();
                const isPast = cellDate < today;
                const isSelected =
                  selectedPopupDate?.getDate() === date &&
                  selectedPopupDate?.getMonth() === calendarMonth.getMonth() &&
                  selectedPopupDate?.getFullYear() === calendarMonth.getFullYear();

                return (
                  <button
                    key={date}
                    onClick={() => {
                      const newDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), date);
                      newDate.setHours(0, 0, 0, 0);
                      setSelectedPopupDate(newDate);
                    }}
                    disabled={isPast}
                    className={`
                      h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all
                      ${isPast ? 'text-slate-500 cursor-not-allowed' : 'cursor-pointer'}
                      ${!isPast && !isSelected ? 'hover:bg-[#4E4F50] text-slate-300' : ''}
                      ${isToday && !isSelected ? 'border border-[#C7F33C]' : ''}
                      ${isSelected ? 'bg-[#C7F33C] !text-black hover:bg-[#b0d635]' : ''}
                    `}
                  >
                    {date}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 mt-4">
              {deal.dueDate && (
                <button
                  onClick={() => {
                    setPendingDueDate('REMOVE');
                    updateDraft({ pendingDueDate: 'REMOVE' });
                    setShowCalendar(false);
                    setTimeout(() => inputRef.current?.focus(), 50);
                  }}
                  className="flex-1 py-2 rounded-xl text-xs font-bold text-red-400 bg-red-900/30 hover:bg-red-900/50 cursor-pointer"
                >
                  Remove
                </button>
              )}
              <button
                onClick={() => {
                  setPendingDueDate(selectedPopupDate);
                  updateDraft({ pendingDueDate: selectedPopupDate });
                  setShowCalendar(false);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
                disabled={!selectedPopupDate}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#c3ff00] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {deal.dueDate ? 'Change' : 'Confirm'}
              </button>
            </div>
          </div>
        )}

        {/* Attachments Preview */}
        {pendingAttachments.length > 0 && (
          <div className="px-2 pb-1.5 flex flex-wrap gap-2 items-center">
            {pendingAttachments.map((file, idx) => {
              const isImg = file.type.startsWith('image/');
              const objectUrl = isImg ? URL.createObjectURL(file) : null;
              return (
                <div
                  key={idx}
                  className="relative group/att rounded-lg overflow-hidden border border-[#4E4F50] bg-[#252728] flex items-center justify-center"
                >
                  {isImg && objectUrl ? (
                    <img src={objectUrl} alt="preview" className="h-10 w-10 object-cover" />
                  ) : (
                    <div className="h-10 w-10 flex items-center justify-center text-slate-400">
                      <Paperclip className="w-4 h-4" />
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setPendingAttachments((prev) => {
                        const next = prev.filter((_, i) => i !== idx);
                        updateDraft({ pendingAttachments: next });
                        return next;
                      });
                    }}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover/att:opacity-100 transition-opacity scale-75 hover:scale-100 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Due Date Mode Banner */}
        {pendingDueDate && !isManagerCallMode && (
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#C7F33C]/10 border border-[#C7F33C]/30 rounded-xl text-[#C7F33C] text-xs font-semibold animate-in fade-in">
            <div className="flex items-center gap-2 min-w-0">
              <BellRing className="w-3.5 h-3.5 text-[#C7F33C] shrink-0 animate-pulse" />
              <span className="truncate">
                {pendingDueDate === 'REMOVE'
                  ? 'Remove Due Date'
                  : `Due Date: ${new Intl.DateTimeFormat('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    }).format(pendingDueDate)}`}
                <span className="text-slate-300 font-normal ml-1.5">
                  (Provide at least {MIN_DUE_DATE_REASON_LENGTH} characters
                  {newLog.trim().length > 0 ? (
                    newLog.trim().length >= MIN_DUE_DATE_REASON_LENGTH ? (
                      <span className="text-[#C7F33C] ml-1 font-bold">✓</span>
                    ) : (
                      <span className="text-amber-400 ml-1 font-mono">
                        {newLog.trim().length}/{MIN_DUE_DATE_REASON_LENGTH}
                      </span>
                    )
                  ) : null}
                  )
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setPendingDueDate(null);
                updateDraft({ pendingDueDate: null });
              }}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0 ml-2"
              title="Cancel Due Date"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Manager Call Mode Banner */}
        {isManagerCallMode && (
          <div className="flex items-center justify-between px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-400 text-xs font-semibold animate-in fade-in">
            <div className="flex items-center gap-2">
              <PhoneCall className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>Manager Call Mode: Send urgent question to deal owner.</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsManagerCallMode(false);
                updateDraft({ isManagerCallMode: false });
              }}
              className="p-1 rounded-md text-amber-300/80 hover:text-white hover:bg-amber-500/20 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Auto-expanding Chat Input */}
        <div
          {...getRootProps()}
          className={`flex items-end gap-1 bg-[#3A3B3C] px-2 py-1.5 border rounded-xl transition-all ${
            isManagerCallMode
              ? 'border-[#F59E0B] bg-[#342a1d]'
              : pendingDueDate
              ? 'border-[#C7F33C] bg-[#292e21]'
              : isDragActive
              ? 'border-[#C7F33C] bg-[#4E4F50]'
              : 'border-[#4E4F50]'
          }`}
        >
          <input {...getInputProps()} />

          {/* Left Action Buttons: Attach, Due Date, Rewriter, Manager Call */}
          <div className="flex items-center shrink-0 h-7 self-end">
            {session?.user?.id && !isManagerCallMode && (
              <ChatAttachmentButton
                onFileSelect={(files) => {
                  setPendingAttachments((prev) => {
                    const next = [...prev, ...files];
                    updateDraft({ pendingAttachments: next });
                    return next;
                  });
                }}
              />
            )}
            {canEditDueDate && !isManagerCallMode && (
              <button
                type="button"
                onClick={() => setShowCalendar(!showCalendar)}
                title={activeDueDate ? `Due: ${formatShortDueDate(activeDueDate)} (Click to change)` : 'Set Due Date'}
                className={`h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  pendingDueDate === 'REMOVE'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40 text-xs px-2.5 gap-1.5'
                    : activeDueDate
                    ? 'bg-[#C7F33C] text-black font-bold text-xs px-2.5 gap-1.5'
                    : 'w-7 px-0 hover:bg-[#4E4F50] text-slate-300'
                }`}
              >
                <BellRing className="w-3.5 h-3.5 shrink-0" />
                {pendingDueDate === 'REMOVE' ? (
                  <span className="whitespace-nowrap tracking-tight font-semibold">Remove Due</span>
                ) : activeDueDate ? (
                  <span className="whitespace-nowrap tracking-tight">{formatShortDueDate(activeDueDate)}</span>
                ) : null}
              </button>
            )}
            {/* Rewriter Button */}
            {!isManagerCallMode && onShowRewriteModal && (
              <button
                type="button"
                onClick={onShowRewriteModal}
                title="AI Rewriter (สรุปและเรียบเรียงข้อความ)"
                className="h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer w-7 px-0 hover:bg-[#4E4F50] text-slate-300"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              </button>
            )}
            {canUseManagerCall && (
              <button
                type="button"
                onClick={() => {
                  setIsManagerCallMode((prev) => {
                    const next = !prev;
                    updateDraft({ isManagerCallMode: next });
                    return next;
                  });
                }}
                title={isManagerCallMode ? 'Cancel Manager Call mode' : 'Manager Call (Urgent question)'}
                className={`h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  isManagerCallMode
                    ? 'bg-[#F59E0B] text-slate-950 font-bold text-xs px-2.5 gap-1.5 shadow-sm'
                    : 'w-7 px-0 hover:bg-[#4E4F50] text-amber-400'
                }`}
              >
                <PhoneCall className="w-3.5 h-3.5 shrink-0" />
                {isManagerCallMode && <span className="whitespace-nowrap tracking-tight">Manager Call</span>}
              </button>
            )}
          </div>

          {/* Auto-adjusting Textarea */}
          <textarea
            ref={inputRef}
            rows={1}
            value={newLog}
            onChange={(e) => {
              setNewLog(e.target.value);
              updateDraft({ text: e.target.value });
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
                  if (isManagerCallMode) {
                    handleSendManagerCall();
                  } else {
                    if (pendingDueDate && newLog.trim().length < MIN_DUE_DATE_REASON_LENGTH) {
                      toast({
                        title: 'จำเป็นต้องระบุเหตุผล',
                        description: `กรุณาระบุเหตุผลในการตั้ง/เปลี่ยน Due Date อย่างน้อย ${MIN_DUE_DATE_REASON_LENGTH} ตัวอักษร`,
                        type: 'warning',
                      });
                      inputRef.current?.focus();
                      return;
                    }
                    handleAddLog();
                  }
                } else {
                  setTimeout(() => adjustTextareaHeight(inputRef.current), 0);
                }
              }
            }}
            placeholder={
              isManagerCallMode ? ' Urgent Question...' : isDragActive ? 'Drop files here...' : 'Write an update...'
            }
            style={{ height: 'auto', minHeight: '28px', maxHeight: '120px' }}
            className="flex-1 bg-transparent border-none pl-1 text-white text-[16px] focus:outline-none placeholder:text-slate-400 min-w-0 resize-none overflow-y-auto leading-5 hide-scrollbar py-1"
          />

          {/* Send Button */}
          {isSubmittingLog || isSendingManagerCall ? (
            <div className="w-7 h-7 flex items-center justify-center shrink-0 self-end">
              <Loader2
                className={`w-4 h-4 animate-spin ${isManagerCallMode ? 'text-[#F59E0B]' : 'text-[#C7F33C]'}`}
              />
            </div>
          ) : hasSubmitContent ? (
            <button
              type="button"
              disabled={isDuePending && !isDueValid}
              onClick={() => {
                if (isManagerCallMode) {
                  handleSendManagerCall();
                } else {
                  if (isDuePending && !isDueValid) {
                    toast({
                      title: 'จำเป็นต้องระบุเหตุผล',
                      description: `กรุณาระบุเหตุผลในการตั้ง/เปลี่ยน Due Date อย่างน้อย ${MIN_DUE_DATE_REASON_LENGTH} ตัวอักษร`,
                      type: 'warning',
                    });
                    inputRef.current?.focus();
                    return;
                  }
                  handleAddLog();
                }
              }}
              className={`w-7 h-7 flex items-center justify-center shrink-0 rounded-full transition-colors cursor-pointer self-end ${
                isDuePending && !isDueValid
                  ? 'text-slate-500 opacity-40 cursor-not-allowed'
                  : isManagerCallMode
                  ? 'text-[#F59E0B] hover:bg-amber-500/20'
                  : 'text-[#C7F33C] hover:bg-black/20'
              }`}
              title={
                isDuePending && !isDueValid
                  ? `ระบุเหตุผลอีกอย่างน้อย ${MIN_DUE_DATE_REASON_LENGTH - newLog.trim().length} ตัวอักษร`
                  : 'Send (Enter)'
              }
            >
              <Send className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>
    );
    return dockEl ? createPortal(bar, dockEl) : bar;
  })()}
</div>
);
}
