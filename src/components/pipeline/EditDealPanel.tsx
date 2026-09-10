"use client";

import { X, MoreHorizontal, MessageSquare, Trash2, Download, Loader2, RefreshCw, Sparkles, Copy, Check, AlertCircle, Bot, UserPlus, Save, Image as ImageIcon, Link2, FileText, ArrowRightLeft, PhoneCall } from "lucide-react";
import { OpportunityWithRelations } from "./KanbanCard";

import { deleteActivityLog, addSystemLog, getOpportunityActivityLogs, updateOpportunity } from "@/lib/actions/opportunity";
import type { TeamMemberItem } from "./DealTeamMembersSection";
import { useDealMembersMutation } from "@/hooks/useDealMembersMutation";
import { getLatestDealSummary, generateDealSummary } from "@/lib/actions/deal-summary";
import { getDealAccelerators, generateDealAccelerators, answerDealAccelerator, deleteDealAcceleratorQuestion, type DealAcceleratorsState, type AcceleratorQuestion } from "@/lib/actions/ai-accelerator";
import { getAllUsers } from "@/lib/actions/users";
import { requestDealTransfer } from "@/lib/actions/notification";
import { MemberSelectDrawer } from "./MemberSelectDrawer";
import { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo, Fragment } from "react";
import useSWR, { useSWRConfig, mutate } from "swr";
import useSWRInfinite from "swr/infinite";
import { useSession } from "next-auth/react";
import { User, OpportunityType, Role } from "@prisma/client";
import { usePermissions } from "@/providers/PermissionProvider";
import { IconMap } from "@/lib/menu-registry";
import { useDialog } from "@/providers/DialogProvider";
import { CustomerTab, type CustomerTabRef } from "./CustomerTab";
import { NotesTab } from "./NotesTab";
import { SharedMediaTab } from "./SharedMediaTab";
import { EditDealMainBar } from "./EditDealMainBar";
import { EditDealSubBar, SubBarTab, SubBarActionItem } from "./EditDealSubBar";
import { DealActionsDrawer } from "./DealActionsDrawer";
import { RewriteCommentModal } from "./RewriteCommentModal";
import { ActivityFeedTab } from "./ActivityFeedTab";
import { DealSystemLogsTab } from "./DealSystemLogsTab";
import { DealManagerCallTab } from "./DealManagerCallTab";
import { DealSummaryTab } from "./DealSummaryTab";
import { DealCollaborateTab } from "./DealCollaborateTab";
import { DealImageLightbox } from "./DealImageLightbox";
import { clearAllDraftsForDeal } from "@/lib/deal-draft-store";
import { applyOptimisticTopicPatch, rollbackTopicPatch, shouldAcceptRevision, normalizeRevision } from "@/lib/deal-topic-sync";
import { rollbackDeletedPageItem } from "@/lib/pipeline-delete-rollback";
import { dealSummaryKey } from "@/lib/pipeline-activity-cache";
import {
  isPendingAcceleratorsKey,
  decrementPendingBadge,
  incrementPendingBadge,
  setPendingBadgeCount,
} from "@/lib/deal-accelerators-sync";
import { HighlightText, renderCommentText } from "@/components/ui/HighlightText";
export { renderCommentText };
import { pusherClient } from "@/lib/pusher";
import { useSwipeToClose } from "@/hooks/useSwipeToClose";
import {
  applyActivityEvent,
  activityFeedKey,
  type ActivityLogPage,
  type ActivityLogWithRelations,
  type ActivityUpdateEvent,
} from "@/lib/pipeline-activity-cache";

const formatDateTime = (date: Date | string) => {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

export type TabType = 'activity' | 'system' | 'collaborate' | 'information' | 'notes' | 'sharedMedia' | 'summary' | 'manager-call';

interface EditDealPanelProps {
  deal: OpportunityWithRelations;
  initialTab?: TabType;
  isOpen: boolean;
  onClose: () => void;
  onDealClosed?: (dealId: string, status: "WON" | "LOST") => void;
}

export function EditDealPanel({ deal, initialTab = 'activity', isOpen, onClose, onDealClosed }: EditDealPanelProps) {
  const { dragOffset, isDragging, isDismissed, swipeHandlers } = useSwipeToClose({
    onClose,
    isOpen,
  });
  const { mutate } = useSWRConfig();
  const [activitySearchQuery, setActivitySearchQuery] = useState("");
  const { visibleRightMenus, canSee, isAdmin: isPermAdmin } = usePermissions();
  const canUseSalesDeal = canSee("pipeline.information");
  const rawRightMenus = visibleRightMenus("pipeline");
  const rightMenus = rawRightMenus.filter(m => {
    if (m.key === 'pipeline.information') {
      return deal.type === 'SALES_DEAL';
    }
    return true;
  });

  // Try to find the initial tab matching a visible right menu, fallback to the first one available
  const allowedInitialTab = (initialTab === 'manager-call')
    ? 'manager-call'
    : rightMenus.find(m => m.key.endsWith(`.${initialTab}`)) ? initialTab : (rightMenus[0]?.key.split('.').pop() as TabType || 'activity');
  const [activeTab, setActiveTab] = useState<TabType>(allowedInitialTab === ('duedate' as TabType) ? 'activity' : allowedInitialTab);

  const { toast, confirm } = useDialog();
  const [showRewriteModal, setShowRewriteModal] = useState(false);

  // Lightbox Preview State (Supports multi-image gallery with Next/Prev)
  const [previewLightbox, setPreviewLightbox] = useState<{
    images: string[];
    currentIndex: number;
  } | null>(null);

  const handleOpenPreview = useCallback((url: string, index?: number, allUrls?: string[]) => {
    if (allUrls && allUrls.length > 0) {
      const initialIdx = typeof index === 'number' ? index : allUrls.indexOf(url);
      setPreviewLightbox({
        images: allUrls,
        currentIndex: initialIdx >= 0 ? initialIdx : 0
      });
    } else {
      setPreviewLightbox({
        images: [url],
        currentIndex: 0
      });
    }
  }, [setPreviewLightbox]);


  // Topic state & Concurrency Tracking (Pillar 3)
  const [topic, setTopic] = useState(deal.topic || 'Untitled Deal');
  const lastTopicRevisionRef = useRef<number>(normalizeRevision(deal.updatedAt));
  const pendingTopicMutationRef = useRef<string | null>(null);

  useEffect(() => {
    if (deal.topic && deal.topic !== topic) {
      const incomingRev = normalizeRevision(deal.updatedAt);
      if (shouldAcceptRevision(lastTopicRevisionRef.current, incomingRev) && !pendingTopicMutationRef.current) {
        setTopic(deal.topic);
        lastTopicRevisionRef.current = incomingRev;
      }
    }
  }, [deal.topic, deal.updatedAt]);

  const handleTopicSave = useCallback(
    async (newTopic: string) => {
      const trimmed = newTopic.trim();
      if (!trimmed || trimmed === topic) return;

      const previousTopic = topic;
      const mutationId = `topic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      pendingTopicMutationRef.current = mutationId;

      // 1. Optimistic Paint on header & SWR cache instantly (< 10ms)
      setTopic(trimmed);
      void mutate(
        (key) => Array.isArray(key) && key[0] === 'pipeline-deals',
        (deals: OpportunityWithRelations[] | undefined) =>
          applyOptimisticTopicPatch(deals, deal.id, trimmed),
        { revalidate: false }
      );

      // 2. Fire server action in background
      try {
        const updated = await updateOpportunity(deal.id, { topic: trimmed }, mutationId);
        const serverRevision = normalizeRevision(updated?.updatedAt) || Date.now();
        if (shouldAcceptRevision(lastTopicRevisionRef.current, serverRevision)) {
          lastTopicRevisionRef.current = serverRevision;
        }

        // Record system log asynchronously without blocking user flow
        void addSystemLog(deal.id, `Changed topic from "${previousTopic}" to "${trimmed}".`).catch((err) => {
          console.warn('[EditDealPanel] Failed to log topic change:', err);
        });

        toast({ title: 'Success', description: 'Topic updated successfully', type: 'success' });
      } catch (error) {
        // 3. Granular Rollback on definite failure
        console.error('[EditDealPanel] Failed to update topic:', error);
        setTopic(previousTopic);
        void mutate(
          (key) => Array.isArray(key) && key[0] === 'pipeline-deals',
          (deals: OpportunityWithRelations[] | undefined) =>
            rollbackTopicPatch(deals, deal.id, previousTopic),
          { revalidate: false }
        );
        const msg = error instanceof Error ? error.message : 'Failed to update topic';
        toast({ title: 'Error', description: msg, type: 'error' });
        throw error;
      } finally {
        pendingTopicMutationRef.current = null;
      }
    },
    [deal.id, topic, mutate, toast]
  );


  const [isSearching, setIsSearching] = useState(false);
  const [showHamburgerMenu, setShowHamburgerMenu] = useState(false);
  const hamburgerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleHamburgerClickOutside = (e: MouseEvent) => {
      if (hamburgerMenuRef.current && !hamburgerMenuRef.current.contains(e.target as Node)) {
        setShowHamburgerMenu(false);
      }
    };
    if (showHamburgerMenu) {
      document.addEventListener('mousedown', handleHamburgerClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleHamburgerClickOutside);
  }, [showHamburgerMenu]);

  // Users state for ownership transfer & member invite (backed by SWR "all-users" cache)
  const { data: allCachedUsers } = useSWR<Awaited<ReturnType<typeof getAllUsers>>>("all-users", getAllUsers, {
    revalidateOnFocus: false,
    dedupingInterval: 120_000,
  });
  const users = allCachedUsers || [];
  const [isTransferring, setIsTransferring] = useState(false);
  const [prevDealId, setPrevDealId] = useState(deal.id);
  const [dealType, setDealType] = useState(deal.type);

  if (deal.id !== prevDealId) {
    setPrevDealId(deal.id);
    setDealType(deal.type);
  }

  const { data: session } = useSession();
  const isAdmin = Boolean(
    isPermAdmin ||
    (session?.user as Record<string, unknown>)?.role === "ADMIN" ||
    session?.user?.email === "weglobal.server@gmail.com"
  );
  const isOwner = Boolean(
    (session?.user?.id && (session.user.id === deal.ownerId || session.user.id === deal.owner?.id)) ||
    (session?.user?.email && deal.owner?.email && session.user.email.toLowerCase() === deal.owner.email.toLowerCase())
  );
  const isTeamMember = Boolean(
    deal.teamMembers?.some(tm => 
      (session?.user?.id && tm.id === session.user.id) ||
      (session?.user?.email && tm.email && session.user.email.toLowerCase() === tm.email.toLowerCase())
    )
  );
  const userRole = (session?.user as Record<string, unknown>)?.role as string | undefined;
  const userDepartments = ((session?.user as Record<string, unknown>)?.departments as string[]) || [];
  const isManagerOfOwner = Boolean(
    userRole === "MANAGEMENT" &&
    (deal.owner as { departments?: { id: string; name: string }[] })?.departments?.some(d => userDepartments.includes(d.name))
  );
  const canInvite = isOwner || isTeamMember || isAdmin;
  const canDelete = isAdmin || isOwner;
  const canCloseDeal = (isAdmin || isOwner || isManagerOfOwner) && deal.status === "OPEN";
  const canConvert = deal.status === "OPEN" && dealType === 'INTERNAL_TASK' && (isOwner || isAdmin || isManagerOfOwner) && (canUseSalesDeal || isAdmin);
  const canConvertToInternal = isAdmin && deal.status === "OPEN" && dealType === 'SALES_DEAL';
  const hasCardActions = Boolean(canCloseDeal || canConvert || canConvertToInternal || canDelete);
  const canEditDueDate = isOwner || isAdmin;
  const canEditTopic = isOwner || isAdmin || isTeamMember;
  const canUseManagerCall = Boolean(isAdmin || isManagerOfOwner);


  // Card Actions Drawer State (Standard Component)
  const [isActionsDrawerOpen, setIsActionsDrawerOpen] = useState(false);

  // Tab Sub-States
  const [sharedMediaSubTab, setSharedMediaSubTab] = useState<"images" | "links" | "files">("images");
  const [noteSearchQuery, setNoteSearchQuery] = useState("");
  const [isSearchingNotes, setIsSearchingNotes] = useState(false);
  const customerTabRef = useRef<CustomerTabRef>(null);
  const [isSavingCustomerTab, setIsSavingCustomerTab] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setActiveTab(allowedInitialTab), 0);
    return () => clearTimeout(t);
  }, [allowedInitialTab, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      clearAllDraftsForDeal(deal.id);
    }
  }, [isOpen, deal.id]);

  // Team Members State & Mutation Hook
  const {
    localTeamMembers,
    setLocalTeamMembers,
    isAddingMembers,
    isRemovingId,
    handleAddMembers,
    handleRemoveMember,
    applyPusherMemberEvent,
  } = useDealMembersMutation({
    dealId: deal.id,
    initialMembers: (deal.teamMembers || []) as TeamMemberItem[],
    dealUpdatedAt: deal.updatedAt,
    currentUserId: session?.user?.id,
    isOwner,
    isAdmin,
    onSelfLeft: onClose,
    toast,
  });
  const getKey = (pageIndex: number, previousPageData: { data: ActivityLogWithRelations[], nextCursor?: string } | null) => {
    return activityFeedKey(deal.id, activeTab, isOpen, previousPageData);
  };

  const {
    data: rawLocalActivityPages,
    mutate: loadActivityLogs,
    size,
    setSize,
    isValidating: isLoadingLogs
  } = useSWRInfinite<{ data: ActivityLogWithRelations[], nextCursor?: string }>(
    getKey,
    async ([, id, typeFilter, cursor]: [string, string, string, string]) => {
      try {
        const res = await getOpportunityActivityLogs(
          id,
          10,
          cursor || undefined,
          typeFilter as 'COMMENT' | 'SYSTEM_UPDATE',
        );
        return res as { data: ActivityLogWithRelations[], nextCursor?: string };
      } catch (err) {
        if (err instanceof Error && err.message === 'Forbidden') {
          return { data: [], nextCursor: undefined };
        }
        throw err;
      }
    }
  );

  const allLogs = rawLocalActivityPages ? rawLocalActivityPages.flatMap(page => page.data) : [];
  const {
    data: dealSummaryResponse,
    mutate: mutateDealSummary,
    isLoading: isLoadingDealSummary,
  } = useSWR(
    dealSummaryKey(deal.id, activeTab, isOpen),
    ([, id]) => getLatestDealSummary(id),
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isCopiedSummary, setIsCopiedSummary] = useState(false);

  // AI Deal Accelerators State
  const {
    data: acceleratorsResponse,
    mutate: mutateAccelerators,
  } = useSWR(
    isOpen ? ['deal-accelerators', deal.id] : null,
    ([, id]) => getDealAccelerators(id),
    { revalidateOnFocus: false, dedupingInterval: 5000 }
  );

  const acceleratorsState = acceleratorsResponse?.data;
  const [isGeneratingAccelerators, setIsGeneratingAccelerators] = useState(false);
  const [isAnsweringQuestionId, setIsAnsweringQuestionId] = useState<string | null>(null);
  const [isDeletingQuestionId, setIsDeletingQuestionId] = useState<string | null>(null);
  // Revalidate accelerators state when entering Manager tab only if data is not yet loaded
  useEffect(() => {
    if (isOpen && activeTab === 'manager-call' && !acceleratorsResponse?.data) {
      void mutateAccelerators();
    }
  }, [isOpen, activeTab, mutateAccelerators, acceleratorsResponse?.data]);

  // Deduplicate pending and answered questions so no duplicate cards ever render in the Manager tab
  const { pendingQuestions, answeredQuestions } = useMemo(() => {
    const rawQuestions = acceleratorsState?.questions || [];

    // 1. Collect all answered question texts (trimmed, lowercased)
    const answeredMap = new Map<string, AcceleratorQuestion>();
    for (const q of rawQuestions) {
      if (q.status === 'ANSWERED') {
        const key = q.question.trim().toLowerCase();
        if (!answeredMap.has(key) || new Date(q.answeredAt || q.createdAt || 0) > new Date(answeredMap.get(key)!.answeredAt || answeredMap.get(key)!.createdAt || 0)) {
          answeredMap.set(key, q);
        }
      }
    }

    // 2. Pending questions: exclude any question text that was already answered, and keep only 1 pending per question text
    const pendingMap = new Map<string, AcceleratorQuestion>();
    for (const q of rawQuestions) {
      if (q.status === 'PENDING') {
        const key = q.question.trim().toLowerCase();
        if (answeredMap.has(key)) continue;
        if (!pendingMap.has(key) || new Date(q.createdAt || 0) > new Date(pendingMap.get(key)!.createdAt || 0)) {
          pendingMap.set(key, q);
        }
      }
    }

    return {
      pendingQuestions: Array.from(pendingMap.values()),
      answeredQuestions: Array.from(answeredMap.values()),
    };
  }, [acceleratorsState?.questions]);
  const pendingQuestionsCount = pendingQuestions.length;

  // Pure clock state for live elapsed wait timer
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    if (pendingQuestions.length === 0) return;
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, [pendingQuestions.length]);

  const getElapsedWaitText = () => {
    if (!pendingQuestions || pendingQuestions.length === 0) return '';
    let earliestCreatedAt: Date | null = null;
    for (const q of pendingQuestions) {
      if (q.createdAt) {
        const d = new Date(q.createdAt);
        if (!earliestCreatedAt || d < earliestCreatedAt) {
          earliestCreatedAt = d;
        }
      }
    }
    if (!earliestCreatedAt) return '';
    const diffMs = Math.max(0, currentTime - earliestCreatedAt.getTime());
    const diffSec = Math.floor(diffMs / 1000);
    const days = Math.floor(diffSec / (24 * 3600));
    const hours = Math.floor((diffSec % (24 * 3600)) / 3600);
    const minutes = Math.floor((diffSec % 3600) / 60);
    const pad = (n: number) => n.toString().padStart(2, '0');

    if (days > 0) {
      return `${days}DAY | ${pad(hours)}:${pad(minutes)}`;
    }
    return `${pad(hours)}:${pad(minutes)}`;
  };

  const handleAnswerAccelerator = async (questionId: string, answer: string) => {
    if (!answer.trim() || isAnsweringQuestionId) return;
    const cleanAnswer = answer.trim();
    setIsAnsweringQuestionId(questionId);
    const previousState = acceleratorsResponse;

    // 1. Optimistic UI update (< 10ms)
    if (acceleratorsState) {
      const targetQ = acceleratorsState.questions?.find(q => q.id === questionId);
      const targetText = targetQ?.question?.trim()?.toLowerCase();

      const updatedQuestions = (acceleratorsState.questions || []).map(q => {
        if (q.id === questionId || (targetText && q.question.trim().toLowerCase() === targetText)) {
          return {
            ...q,
            status: 'ANSWERED' as const,
            answer: cleanAnswer,
            answeredBy: session?.user?.name || 'คุณ',
            answeredByImage: session?.user?.image || null,
            answeredAt: new Date().toISOString(),
          };
        }
        return q;
      });

      // Deduplicate answered questions so only 1 entry per question text exists
      const seen = new Set<string>();
      const dedupedQuestions: AcceleratorQuestion[] = [];
      for (const q of updatedQuestions) {
        if (q.status === 'ANSWERED') {
          const key = q.question.trim().toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
        }
        dedupedQuestions.push(q);
      }

      const optimisticState = {
        ...acceleratorsState,
        questions: dedupedQuestions,
        updatedAt: new Date().toISOString(),
      };
      void mutate(['deal-accelerators', deal.id], { success: true, data: optimisticState }, false);
      void mutateAccelerators({ success: true, data: optimisticState }, false);

      // Optimistically decrement pending counter on board preserving object structure
      void mutate(
        isPendingAcceleratorsKey,
        (prevMap: Record<string, { count: number; earliestPendingAt: string | null }> | undefined) =>
          decrementPendingBadge(prevMap, deal.id),
        false
      );

      // Optimistically remove the urgent call log from local activity logs
      if (loadActivityLogs) {
        void loadActivityLogs(
          (currentPages) => {
            if (!currentPages) return currentPages;
            return currentPages.map((page) => ({
              ...page,
              data: page.data.filter(l => {
                if (l.content.startsWith(`[URGENT_CALL:${questionId}]`)) return false;
                if (targetQ && l.content.startsWith(`[URGENT_CALL:${targetQ.id}]`)) return false;
                if (targetText && l.content.startsWith('[URGENT_CALL:') && l.content.toLowerCase().includes(targetText)) return false;
                return true;
              }),
            }));
          },
          false
        );
      }
    }

    const rollbackAnswerPendingBadge = () => {
      void mutate(
        isPendingAcceleratorsKey,
        (prevMap: Record<string, { count: number; earliestPendingAt: string | null }> | undefined) =>
          incrementPendingBadge(prevMap, deal.id),
        false
      );
    };

    // 2. Fire server action in background without blocking UI or triggering redundant GET re-fetches
    try {
      const res = await answerDealAccelerator(deal.id, questionId, cleanAnswer);
      if (res.success && res.data) {
        void mutate(['deal-accelerators', deal.id], { success: true, data: res.data }, false);
        void mutateAccelerators({ success: true, data: res.data }, false);
      } else {
        console.error('Failed to answer accelerator:', res.error);
        if (previousState) {
          void mutate(['deal-accelerators', deal.id], previousState, false);
          void mutateAccelerators(previousState, false);
        }
        rollbackAnswerPendingBadge();
        void loadActivityLogs();
        toast({ title: 'บันทึกคำตอบไม่สำเร็จ', description: res.error || 'เกิดข้อผิดพลาดในการบันทึกคำตอบ', type: 'error' });
      }
    } catch (err) {
      console.error('Failed to answer accelerator:', err);
      if (previousState) {
        void mutate(['deal-accelerators', deal.id], previousState, false);
        void mutateAccelerators(previousState, false);
      }
      rollbackAnswerPendingBadge();
      void loadActivityLogs();
      const errMsg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกคำตอบ';
      toast({ title: 'บันทึกคำตอบไม่สำเร็จ', description: errMsg, type: 'error' });
    } finally {
      setIsAnsweringQuestionId(null);
    }
  };

  const handleDeleteAcceleratorQuestion = async (questionId: string) => {
    if (isDeletingQuestionId) return;
    setIsDeletingQuestionId(questionId);
    const targetQ = acceleratorsState?.questions?.find(q => q.id === questionId);
    const isPendingQ = targetQ?.status === 'PENDING';

    const rollbackDeletePendingBadge = () => {
      if (!isPendingQ) return;
      void mutate(
        isPendingAcceleratorsKey,
        (prevMap: Record<string, { count: number; earliestPendingAt: string | null }> | undefined) =>
          incrementPendingBadge(prevMap, deal.id),
        false
      );
    };

    try {
      const previousState = acceleratorsResponse;

      // 1. Optimistically remove question from Accelerators State
      if (previousState?.data) {
        const updatedQuestions = previousState.data.questions.filter(q => q.id !== questionId);
        const newState = { ...previousState.data, questions: updatedQuestions };
        void mutate(['deal-accelerators', deal.id], { success: true, data: newState }, false);
        void mutateAccelerators({ success: true, data: newState }, false);
      }

      // 2. If it was pending, optimistically decrement badge count preserving object structure
      if (isPendingQ) {
        void mutate(
          isPendingAcceleratorsKey,
          (prevMap: Record<string, { count: number; earliestPendingAt: string | null }> | undefined) =>
            decrementPendingBadge(prevMap, deal.id),
          false
        );
      }

      // 3. Optimistically remove from local activity logs
      if (loadActivityLogs) {
        void loadActivityLogs(
          (currentPages) => {
            if (!currentPages) return currentPages;
            return currentPages.map((page) => ({
              ...page,
              data: page.data.filter(l => !l.content.startsWith(`[URGENT_CALL:${questionId}]`)),
            }));
          },
          false
        );
      }

      // 4. Fire server action in background without re-fetching all deals or logs
      const res = await deleteDealAcceleratorQuestion(deal.id, questionId);
      if (!res.success) {
        console.error('Failed to delete question:', res.error);
        if (previousState) {
          void mutate(['deal-accelerators', deal.id], previousState, false);
          void mutateAccelerators(previousState, false);
        }
        rollbackDeletePendingBadge();
        void loadActivityLogs();
        toast({ title: 'ลบคำถามไม่สำเร็จ', description: res.error || 'เกิดข้อผิดพลาดในการลบคำถาม', type: 'error' });
      } else if (res.data) {
        void mutate(['deal-accelerators', deal.id], { success: true, data: res.data }, false);
        void mutateAccelerators({ success: true, data: res.data }, false);
      }
    } catch (err) {
      console.error('Failed to delete question:', err);
      if (acceleratorsResponse) {
        void mutate(['deal-accelerators', deal.id], acceleratorsResponse, false);
        void mutateAccelerators(acceleratorsResponse, false);
      }
      rollbackDeletePendingBadge();
      void loadActivityLogs();
      const errMsg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลบคำถาม';
      toast({ title: 'ลบคำถามไม่สำเร็จ', description: errMsg, type: 'error' });
    } finally {
      setIsDeletingQuestionId(null);
    }
  };

  const handleRefreshAccelerators = async () => {
    setIsGeneratingAccelerators(true);
    try {
      const res = await generateDealAccelerators(deal.id, acceleratorsState?.targetGoal);
      if (res.success && res.data) {
        const newAiQuestions = (res.data.questions || []).filter(q => q.source === 'AI' && q.status === 'PENDING');
        const oldPendingAiIds = new Set(
          (acceleratorsState?.questions || [])
            .filter(q => q.source === 'AI' && q.status === 'PENDING')
            .map(q => q.id)
        );

        // Optimistically synchronize ActivityLog in memory to prevent duplicate cards during DB roundtrip
        if (loadActivityLogs) {
          const newAiLogs = newAiQuestions.map(q => ({
            id: `synth_log_${q.id}`,
            content: `[URGENT_CALL:${q.id}] ${q.question}`,
            type: 'COMMENT',
            opportunityId: deal.id,
            userId: session?.user?.id || '',
            createdAt: new Date(),
            updatedAt: new Date(),
            isEdited: false,
            parentId: null,
            user: {
              id: session?.user?.id || '',
              name: 'AI Assistant',
              image: null,
              email: null,
              role: 'ADMIN' as Role,
            },
            replies: [],
          })) as unknown as ActivityLogWithRelations[];

          void loadActivityLogs(
            (currentPages) => {
              if (!currentPages || currentPages.length === 0) {
                return [{ data: newAiLogs }];
              }
              const cleanedPages = currentPages.map(page => ({
                ...page,
                data: page.data.filter(l => {
                  if (!l.content.startsWith('[URGENT_CALL:')) return true;
                  const match = l.content.match(/^\[URGENT_CALL:([^\]]+)\]/);
                  const id = match ? match[1] : '';
                  return !oldPendingAiIds.has(id);
                }),
              }));
              cleanedPages[0] = {
                ...cleanedPages[0],
                data: [...newAiLogs, ...cleanedPages[0].data],
              };
              return cleanedPages;
            },
            false
          );
        }

        void mutate(['deal-accelerators', deal.id], { success: true, data: res.data }, false);
        await mutateAccelerators({ success: true, data: res.data }, false);

        const pendingCount = (res.data.questions || []).filter(q => q.status === 'PENDING').length;
        void mutate(
          isPendingAcceleratorsKey,
          (prevMap: Record<string, { count: number; earliestPendingAt: string | null }> | undefined) =>
            setPendingBadgeCount(prevMap, deal.id, pendingCount),
          false
        );
      } else {
        console.error('Failed to generate accelerators:', res.error);
        toast({ title: 'AI Accelerator Error', description: res.error || 'ไม่สามารถสร้างคำถาม AI ได้', type: 'error' });
      }
    } catch (err) {
      console.error('Failed to generate accelerators:', err);
      const errMsg = err instanceof Error ? err.message : 'ไม่สามารถเชื่อมต่อกับ AI ได้';
      toast({ title: 'AI Accelerator Error', description: errMsg, type: 'error' });
    } finally {
      setIsGeneratingAccelerators(false);
    }
  };

  // Deal Summary View Mode State ('summary' | 'prompt')
  const [summaryViewMode, setSummaryViewMode] = useState<'summary' | 'prompt'>('summary');

  const handleGenerateSummary = async () => {
    setIsGeneratingSummary(true);
    setSummaryError(null);
    try {
      // Also generate accelerators if none exist yet
      if (!acceleratorsState) {
        generateDealAccelerators(deal.id).then(accRes => {
          if (accRes.success && accRes.data) {
            void mutateAccelerators(accRes, false);
            const pCount = (accRes.data.questions || []).filter(q => q.status === 'PENDING').length;
            void mutate(
              isPendingAcceleratorsKey,
              (prevMap: Record<string, { count: number; earliestPendingAt: string | null }> | undefined) =>
                setPendingBadgeCount(prevMap, deal.id, pCount),
              false
            );
          }
        }).catch(() => {});
      }

      const res = await generateDealSummary(deal.id);
      if (res.success && res.data) {
        await mutateDealSummary(res, false);
        toast({ title: 'AI Summary Ready', description: 'Deal summary generated successfully.', type: 'success' });
      } else {
        const errorMsg = res.message || 'Unable to generate summary.';
        setSummaryError(errorMsg);
        toast({ title: 'Error', description: errorMsg, type: 'error' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection error occurred.';
      setSummaryError(msg);
      toast({ title: 'Error', description: msg, type: 'error' });
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleCopySummary = () => {
    if (!dealSummaryResponse?.data) return;
    const { overview, keyHighlights, blockers, nextSteps } = dealSummaryResponse.data;

    // Additional custom fields from JSON schema
    const extraSections = Object.entries(dealSummaryResponse.data)
      .filter(([k, v]) => !['overview', 'keyHighlights', 'blockers', 'nextSteps'].includes(k) && v)
      .map(([k, v]) => {
        const title = k.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').toUpperCase().trim();
        if (Array.isArray(v)) {
          return `[${title}]\n${v.map(item => `• ${item}`).join('\n')}\n`;
        }
        return `[${title}]\n${typeof v === 'object' ? JSON.stringify(v, null, 2) : v}\n`;
      });

    const text = [
      `📌 Deal Summary: ${deal.topic}`,
      dealSummaryResponse.generatedAt ? `(As of: ${formatDateTime(dealSummaryResponse.generatedAt)})` : '',
      '',
      overview ? `[CURRENT STATUS]\n${overview}\n` : '',
      keyHighlights?.length ? `[KEY HIGHLIGHTS]\n${keyHighlights.map(k => `• ${k}`).join('\n')}\n` : '',
      blockers?.length ? `[BLOCKERS & RISKS]\n${blockers.map(b => `• ${b}`).join('\n')}\n` : '',
      nextSteps?.length ? `[RECOMMENDED NEXT STEPS]\n${nextSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n` : '',
      ...extraSections,
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(text);
    setIsCopiedSummary(true);
    toast({ title: 'Copied', description: 'Summary copied to clipboard.', type: 'success' });
    setTimeout(() => setIsCopiedSummary(false), 2000);
  };

  useEffect(() => {
    if (!isOpen) return;
    if (!session?.user?.id) return;
    const channelName = `private-pipeline-${session.user.id}`;
    console.log(`[PANEL-PUSHER] Subscribing to: "${channelName}" for deal (id=${deal.id})`);
    const channel = pusherClient.subscribe(channelName);

    const onSubSucceeded = () => {
      console.log(`[PANEL-PUSHER] Subscribed successfully to: "${channelName}"`);
    };
    const onSubError = (status: unknown) => {
      console.warn(`[PANEL-PUSHER] Subscription issue for channel "${channelName}":`, status);
    };
    channel.bind('pusher:subscription_succeeded', onSubSucceeded);
    channel.bind('pusher:subscription_error', onSubError);

    const handleUpdate = (data?: ActivityUpdateEvent & {
      dealId?: string;
      action?: string;
      state?: DealAcceleratorsState;
      pendingCount?: number;
      question?: AcceleratorQuestion;
      questions?: AcceleratorQuestion[];
      deletedQuestionId?: string;
      questionId?: string;
      answeredQuestion?: AcceleratorQuestion;
    }) => {
      console.log(`[PANEL-PUSHER] Received event: action="${data?.action}" dealId="${data?.dealId}" (current deal.id="${deal.id}")`);
      if (data?.dealId === deal.id) {
        if (data?.action?.startsWith('ACTIVITY_')) {
          loadActivityLogs(pages => applyActivityEvent(pages, data as ActivityUpdateEvent), { revalidate: false });
          void mutate(['opportunity-shared-media', deal.id]);
        } else if (data?.action === 'DEAL_SUMMARY_UPDATED') {
          void mutate(['deal-summary-on-demand', deal.id]);
        } else if (data?.action === 'DEAL_ACCELERATORS_UPDATED') {
          if (data?.state) {
            void mutate(['deal-accelerators', deal.id], { success: true, data: data.state }, false);
            void mutateAccelerators({ success: true, data: data.state }, false);
          } else {
            void mutate(['deal-accelerators', deal.id]);
            void mutateAccelerators();
          }

          // Realtime in-memory Activity feed delta update (0ms sync across all connected clients)
          if (loadActivityLogs) {
            const questionToAdd = data?.question || (data?.questions && data.questions[0]);
            const deletedQId = data?.deletedQuestionId || data?.questionId;

            void loadActivityLogs(
              (currentPages) => {
                if (!currentPages || currentPages.length === 0) {
                  if (questionToAdd && questionToAdd.status === 'PENDING') {
                    const syntheticLog = {
                      id: `pusher_log_${questionToAdd.id}`,
                      content: `[URGENT_CALL:${questionToAdd.id}] ${questionToAdd.question}`,
                      type: 'COMMENT',
                      opportunityId: deal.id,
                      userId: questionToAdd.askedByUserId || '',
                      createdAt: questionToAdd.createdAt ? new Date(questionToAdd.createdAt) : new Date(),
                      updatedAt: questionToAdd.createdAt ? new Date(questionToAdd.createdAt) : new Date(),
                      isEdited: false,
                      parentId: null,
                      user: {
                        id: questionToAdd.askedByUserId || '',
                        name: questionToAdd.askedBy || (questionToAdd.source === 'MANAGER' ? 'Manager' : 'AI Assistant'),
                        image: questionToAdd.askedByImage || null,
                        email: null,
                        role: (questionToAdd.source === 'MANAGER' ? 'MANAGEMENT' : 'ADMIN') as Role,
                      },
                      replies: [],
                    } as unknown as ActivityLogWithRelations;
                    return [{ data: [syntheticLog] }];
                  }
                  return currentPages;
                }

                let updatedPages = currentPages;
                // 1. If a question was deleted or answered, remove its log immediately
                if (deletedQId) {
                  updatedPages = updatedPages.map(page => ({
                    ...page,
                    data: page.data.filter(l => !l.content.startsWith(`[URGENT_CALL:${deletedQId}]`)),
                  }));
                }
                if (data?.answeredQuestion?.question) {
                  const answeredText = data.answeredQuestion.question.trim().toLowerCase();
                  updatedPages = updatedPages.map(page => ({
                    ...page,
                    data: page.data.filter(l => {
                      if (data.answeredQuestion?.id && l.content.startsWith(`[URGENT_CALL:${data.answeredQuestion.id}]`)) return false;
                      if (l.content.startsWith('[URGENT_CALL:') && l.content.toLowerCase().includes(answeredText)) return false;
                      return true;
                    }),
                  }));
                }

                // 2. If a new pending question was received, prepend synthetic log if not present
                if (questionToAdd && questionToAdd.status === 'PENDING') {
                  const alreadyExists = updatedPages.some(page =>
                    page.data.some(l => l.content.startsWith(`[URGENT_CALL:${questionToAdd.id}]`))
                  );
                  if (!alreadyExists) {
                    const syntheticLog = {
                      id: `pusher_log_${questionToAdd.id}`,
                      content: `[URGENT_CALL:${questionToAdd.id}] ${questionToAdd.question}`,
                      type: 'COMMENT',
                      opportunityId: deal.id,
                      userId: questionToAdd.askedByUserId || '',
                      createdAt: questionToAdd.createdAt ? new Date(questionToAdd.createdAt) : new Date(),
                      updatedAt: questionToAdd.createdAt ? new Date(questionToAdd.createdAt) : new Date(),
                      isEdited: false,
                      parentId: null,
                      user: {
                        id: questionToAdd.askedByUserId || '',
                        name: questionToAdd.askedBy || (questionToAdd.source === 'MANAGER' ? 'Manager' : 'AI Assistant'),
                        image: questionToAdd.askedByImage || null,
                        email: null,
                        role: (questionToAdd.source === 'MANAGER' ? 'MANAGEMENT' : 'ADMIN') as Role,
                      },
                      replies: [],
                    } as unknown as ActivityLogWithRelations;

                    updatedPages = [
                      {
                        ...updatedPages[0],
                        data: [syntheticLog, ...updatedPages[0].data],
                      },
                      ...updatedPages.slice(1),
                    ];
                  }
                }

                return updatedPages;
              },
              false
            );
          }

          if (typeof data?.pendingCount === 'number') {
            const pendingCount = data.pendingCount;
            void mutate(
              isPendingAcceleratorsKey,
              (prevMap: Record<string, { count: number; earliestPendingAt: string | null }> | undefined) =>
                setPendingBadgeCount(prevMap, deal.id, pendingCount),
              false
            );
          }
        } else if (data?.action === 'MEMBERS_ADDED' || data?.action === 'MEMBER_ADDED' || data?.action === 'MEMBER_REMOVED') {
          applyPusherMemberEvent(data);
        } else if (data?.action === 'OPPORTUNITY_UPDATED') {
          void mutate(['deal-summary-on-demand', deal.id]);
        }
      }
    };

    channel.bind('pipeline-updated', handleUpdate);

    return () => {
      channel.unbind('pusher:subscription_succeeded', onSubSucceeded);
      channel.unbind('pusher:subscription_error', onSubError);
      channel.unbind('pipeline-updated', handleUpdate);
    };
  }, [deal.id, isOpen, loadActivityLogs, mutate, mutateAccelerators, session?.user?.id]);
  const uniqueLogsMap = new Map();
  allLogs.forEach(log => {
    if (!uniqueLogsMap.has(log.id)) {
      uniqueLogsMap.set(log.id, log);
    }
  });
  const localActivityLogs = Array.from(uniqueLogsMap.values()) as ActivityLogWithRelations[];

  const hasMoreLogs = rawLocalActivityPages ? !!rawLocalActivityPages[rawLocalActivityPages.length - 1]?.nextCursor : false;
  const isLoadingMore = isLoadingLogs && size > 0 && rawLocalActivityPages && typeof rawLocalActivityPages[size - 1] === "undefined";

  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastLogElementRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) observerRef.current.disconnect();
    if (isLoadingMore) return; // Disconnect before returning early

    if (node) {
      observerRef.current = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && hasMoreLogs) {
          setSize(prev => prev + 1);
        }
      });
      observerRef.current.observe(node);
    }
  }, [isLoadingMore, hasMoreLogs, setSize]);

  const handleDeleteSystemLog = async (logId: string) => {
    if (!session?.user?.id) return;
    const targetLog = rawLocalActivityPages?.flatMap((p) => p.data).find((l) => l.id === logId);

    // 1. Optimistically remove from local activity logs (<10ms)
    if (loadActivityLogs) {
      void loadActivityLogs(
        (currentPages) =>
          currentPages
            ? currentPages.map((page) => ({
                ...page,
                data: page.data.filter((l) => l.id !== logId),
              }))
            : currentPages,
        { revalidate: false }
      );
    }

    // 2. Fire server action
    try {
      await deleteActivityLog(logId);
    } catch (e) {
      if (targetLog && loadActivityLogs) {
        void loadActivityLogs(
          (currentPages) => rollbackDeletedPageItem(currentPages, targetLog),
          { revalidate: false }
        );
      }
      if (e instanceof Error) toast({ title: "Error", description: "Failed to delete log: " + e.message, type: "error" });
    }
  };

  const handleTransfer = async (newOwnerId: string) => {
    if (deal.ownerId === newOwnerId || (!isOwner && !isAdmin)) return;
    setIsTransferring(true);
    try {
      await requestDealTransfer(deal.id, newOwnerId);

      const allKnownUsers = (allCachedUsers && allCachedUsers.length > 0) ? allCachedUsers : users;
      const newOwner = allKnownUsers.find((u: { id: string; name?: string | null }) => u.id === newOwnerId);
      if (session?.user?.id && newOwner) {
        void addSystemLog(deal.id, `Transferred ownership to ${newOwner.name}`).catch((err) => {
          console.warn('[EditDealPanel] Failed to log deal transfer:', err);
        });
      }
      toast({ title: "Success", description: "Transfer request sent successfully", type: "success" });
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to transfer ownership", type: "error" });
    } finally {
      setIsTransferring(false);
    }
  };



  const [mounted, setMounted] = useState(false);

  const [showTransferDrawer, setShowTransferDrawer] = useState(false);
  const [showInviteDrawer, setShowInviteDrawer] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timeout);
  }, []);

  const [internalIsOpen, setInternalIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const t = requestAnimationFrame(() => {
        requestAnimationFrame(() => setInternalIsOpen(true));
      });
      return () => cancelAnimationFrame(t);
    } else {
      const t = setTimeout(() => setInternalIsOpen(false), 0);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Set body dataset attribute for global query/check
  useEffect(() => {
    if (isOpen) {
      document.body.dataset.dealPanelOpen = "true";
      return () => {
        delete document.body.dataset.dealPanelOpen;
      };
    }
  }, [isOpen]);

  // Desktop Keyboard Shortcuts inside EditDealPanel
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. ESCAPE key: close panel or sub-modals
      if (e.key === 'Escape') {
        e.preventDefault();
        if (previewLightbox) {
          setPreviewLightbox(null);
          return;
        }
        if (isActionsDrawerOpen) {
          setIsActionsDrawerOpen(false);
          return;
        }
        if (showInviteDrawer) {
          setShowInviteDrawer(false);
          return;
        }
        if (showTransferDrawer) {
          setShowTransferDrawer(false);
          return;
        }
        if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
          (document.activeElement as HTMLElement).blur();
        }
        onClose();
        return;
      }

      // Check if user is currently typing in an input/textarea
      const target = e.target as HTMLElement | null;
      const isInputFocused = Boolean(
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName || "")
      );

      // 2. "T" or "ะ" key: Focus textarea to type (Activity or Note or whatever tab is active)
      const isTKey = e.key === 't' || e.key === 'T' || e.key === 'ะ' || e.code === 'KeyT';
      if (!isInputFocused && isTKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const panelEl = document.querySelector('[data-deal-panel-open="true"]');
        const ta = panelEl?.querySelector('textarea:not([disabled])') as HTMLTextAreaElement | null;
        if (ta) {
          ta.focus();
        } else {
          const firstInput = panelEl?.querySelector('input:not([disabled]):not([type="hidden"])') as HTMLInputElement | null;
          firstInput?.focus();
        }
        return;
      }

      // 3. TAB key: Switch sub-tabs in EditDealSubBar
      if (e.key === 'Tab') {
        // Do not intercept if user is in a form input (e.g. Customer info inputs)
        if (target?.tagName === 'INPUT') {
          return;
        }

        // Sub-tabs for Activity/System/Manager
        const isActivityGroup = activeTab === 'activity' || activeTab === 'system' || activeTab === 'manager-call';
        if (isActivityGroup) {
          e.preventDefault();
          if (isInputFocused) target?.blur();
          const activitySubTabs: TabType[] = ['activity', 'system'];
          if (canUseManagerCall) activitySubTabs.push('manager-call');
          const currentIdx = activitySubTabs.indexOf(activeTab);
          const nextIdx = e.shiftKey
            ? (currentIdx - 1 + activitySubTabs.length) % activitySubTabs.length
            : (currentIdx + 1) % activitySubTabs.length;
          setActiveTab(activitySubTabs[nextIdx]);
          return;
        }

        // Sub-tabs for SharedMedia
        if (activeTab === 'sharedMedia') {
          e.preventDefault();
          if (isInputFocused) target?.blur();
          const mediaTabs: ("images" | "links" | "files")[] = ['images', 'links', 'files'];
          const currentIdx = mediaTabs.indexOf(sharedMediaSubTab);
          const nextIdx = e.shiftKey
            ? (currentIdx - 1 + mediaTabs.length) % mediaTabs.length
            : (currentIdx + 1) % mediaTabs.length;
          setSharedMediaSubTab(mediaTabs[nextIdx]);
          return;
        }

        // Sub-tabs for Summary
        if (activeTab === 'summary' && isAdmin) {
          e.preventDefault();
          if (isInputFocused) target?.blur();
          const summaryTabs: ("summary" | "prompt")[] = ['summary', 'prompt'];
          const currentIdx = summaryTabs.indexOf(summaryViewMode);
          const nextIdx = (currentIdx + 1) % summaryTabs.length;
          setSummaryViewMode(summaryTabs[nextIdx]);
          return;
        }
      }

      // 4. ARROW UP / ARROW DOWN: Switch Tab Sidebar menu
      // MUST NOT INTERCEPT if user is currently typing in an input/textarea!
      if (!isInputFocused && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();

        // Extract available tab IDs from rightMenus
        const sidebarTabs: TabType[] = rightMenus.map(m => m.key.split('.').pop() as TabType);
        if (sidebarTabs.length === 0) return;

        // Current tab in sidebar (if system or manager-call, mapped to activity in sidebar)
        const currentSidebarTab = (activeTab === 'system' || activeTab === 'manager-call') ? 'activity' : activeTab;
        const currentIdx = sidebarTabs.indexOf(currentSidebarTab);

        const nextIdx = e.key === 'ArrowDown'
          ? (currentIdx + 1) % sidebarTabs.length
          : (currentIdx - 1 + sidebarTabs.length) % sidebarTabs.length;

        setActiveTab(sidebarTabs[nextIdx]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    activeTab,
    rightMenus,
    sharedMediaSubTab,
    summaryViewMode,
    canUseManagerCall,
    isAdmin,
    previewLightbox,
    isActionsDrawerOpen,
    showInviteDrawer,
    showTransferDrawer,
    onClose,
  ]);

  if (!isOpen && !mounted) return null;

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-opacity duration-300 ${internalIsOpen && !isDismissed ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={
          isDismissed
            ? {
                opacity: 0,
                transition: "opacity 0.2s ease-out",
                pointerEvents: "none",
              }
            : dragOffset > 0
            ? {
                opacity: Math.max(0, 1 - dragOffset / 350),
                transition: isDragging ? "none" : "opacity 0.2s ease-out",
              }
            : undefined
        }
        onClick={onClose}
      />

      <div
        data-deal-panel-open={internalIsOpen && !isDismissed ? "true" : undefined}
        {...swipeHandlers}
        style={
          isDismissed
            ? {
                transform: "translateX(100%)",
                opacity: 0,
                transition: "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease-out",
                pointerEvents: "none",
              }
            : dragOffset > 0
            ? {
                transform: `translateX(${dragOffset}px)`,
                transition: isDragging ? "none" : "transform 0.2s ease-out",
              }
            : undefined
        }
        className={`fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[600px] md:max-w-[calc(100vw-32px)] z-[101] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right ${internalIsOpen && !isDismissed ? "opacity-100 translate-y-0 md:translate-x-0 scale-100" : "opacity-0 translate-y-4 md:translate-y-0 md:translate-x-8 scale-[0.97] pointer-events-none"}`}
      >
        <div className="flex flex-col w-full h-full rounded-none md:rounded-2xl overflow-hidden border-0 md:border border-[#3A3B3C]">
          {/* Top Row: Tab Sidebar + Main Panel Content */}
          <div className="flex flex-col md:flex-row w-full flex-1 min-h-0 overflow-hidden">
            {/* Tab Sidebar (desktop only) */}
            <div className="hidden md:flex w-16 bg-[#252728] border-r border-[#1C1C1D] flex-col items-center py-3 gap-3 z-10 shrink-0 overflow-y-auto hide-scrollbar">
          {rightMenus.map(menu => {
            const tabId = menu.key.split('.').pop() as TabType;
            const Icon = tabId === 'summary' || menu.key === 'pipeline.summary' 
              ? Bot 
              : (menu.iconName ? IconMap[menu.iconName] || MessageSquare : MessageSquare);
            return (
              <button
                key={menu.key}
                onClick={() => setActiveTab(tabId)}
                title={menu.label}
                className={`
                  flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200
                  ${activeTab === tabId || (activeTab === 'system' && tabId === 'activity')
                    ? "bg-[#C7F33C] text-black "
                    : "text-slate-400 hover:bg-[#C7F33C] hover:text-[#111111]"}
                `}
              >
                <Icon className="h-5 w-5" strokeWidth={activeTab === tabId || (activeTab === 'system' && tabId === 'activity') ? 2.5 : 2} />
              </button>
            )
          })}
        </div>

        {/* Main Panel Content */}
        <div className="w-full flex-1 bg-[#252728] flex flex-col min-w-0 h-full">
          {/* Main Bar (Card-level controls & actions) */}
          <EditDealMainBar
            dealType={dealType}
            topic={topic}
            onTopicSave={handleTopicSave}
            canEditTopic={canEditTopic}
            companyName={deal.company?.name}
            companyDisplayName={deal.company?.displayName}
            hasActions={hasCardActions}
            onOpenActions={() => setIsActionsDrawerOpen(true)}
            onClose={onClose}
          />

          {/* Sub Bar (Tab-specific navigation & actions) */}
          {(() => {
            if (activeTab === 'activity' || activeTab === 'system' || activeTab === 'manager-call') {
              const pendingCount = pendingQuestionsCount;
              const subTabs: SubBarTab[] = [
                { id: 'activity', label: 'Activity' },
                { id: 'system', label: 'System' },
                {
                  id: 'manager-call',
                  label: 'Manager',
                  badge: pendingCount > 0 ? (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#F59E0B] text-slate-950">
                      {pendingCount}
                    </span>
                  ) : undefined,
                },
              ];

              const actions: SubBarActionItem[] = [];
              if (canUseManagerCall) {
                actions.push({
                  id: 'recall',
                  label: isGeneratingAccelerators ? 'Calling AI...' : 'Recall',
                  icon: Sparkles,
                  loading: isGeneratingAccelerators,
                  disabled: isGeneratingAccelerators,
                  onClick: handleRefreshAccelerators,
                });
              }

              return (
                <EditDealSubBar
                  tabs={subTabs}
                  activeTab={activeTab}
                  onTabChange={(tabId) => setActiveTab(tabId as TabType)}
                  actions={actions.length > 0 ? actions : undefined}
                  search={activeTab !== 'manager-call' ? {
                    isActive: isSearching,
                    query: activitySearchQuery,
                    placeholder: 'Search updates...',
                    onToggle: () => setIsSearching(prev => !prev),
                    onChange: setActivitySearchQuery,
                    onClear: () => setActivitySearchQuery(''),
                  } : undefined}
                />
              );
            }

            if (activeTab === 'collaborate') {
              const collaborateActions: SubBarActionItem[] = [];
              if (canInvite) {
                collaborateActions.push({
                  id: 'add',
                  label: 'Add',
                  icon: UserPlus,
                  onClick: () => {
                    setShowInviteDrawer(true);
                    setShowTransferDrawer(false);
                  },
                });
              }
              if (isOwner || isAdmin) {
                collaborateActions.push({
                  id: 'transfer',
                  label: 'Transfer',
                  icon: ArrowRightLeft,
                  onClick: () => {
                    setShowTransferDrawer(true);
                    setShowInviteDrawer(false);
                  },
                });
              }

              return (
                <EditDealSubBar
                  leftContent={<div />}
                  actions={collaborateActions.length > 0 ? collaborateActions : undefined}
                />
              );
            }

            if (activeTab === 'information') {
              return (
                <EditDealSubBar
                  leftContent={<div />}
                  actions={[
                    {
                      id: 'save',
                      label: isSavingCustomerTab ? 'Saving...' : 'Save',
                      icon: Save,
                      loading: isSavingCustomerTab,
                      onClick: async () => {
                        setIsSavingCustomerTab(true);
                        try {
                          await customerTabRef.current?.save();
                        } finally {
                          setIsSavingCustomerTab(false);
                        }
                      },
                    }
                  ]}
                />
              );
            }

            if (activeTab === 'notes') {
              return (
                <EditDealSubBar
                  leftContent={<div />}
                  search={{
                    isActive: isSearchingNotes,
                    query: noteSearchQuery,
                    placeholder: 'Search notes...',
                    onToggle: () => setIsSearchingNotes(prev => !prev),
                    onChange: setNoteSearchQuery,
                    onClear: () => setNoteSearchQuery(''),
                  }}
                />
              );
            }

            if (activeTab === 'sharedMedia') {
              return (
                <EditDealSubBar
                  tabs={[
                    { id: 'images', label: 'Photos', icon: ImageIcon },
                    { id: 'links', label: 'Links', icon: Link2 },
                    { id: 'files', label: 'Files', icon: FileText },
                  ]}
                  activeTab={sharedMediaSubTab}
                  onTabChange={(tabId) => setSharedMediaSubTab(tabId as "images" | "links" | "files")}
                />
              );
            }

            if (activeTab === 'summary') {
              const summaryActions: SubBarActionItem[] = [
                {
                  id: 'copy',
                  label: isCopiedSummary ? 'Copied' : 'Copy',
                  icon: isCopiedSummary ? Check : Copy,
                  onClick: handleCopySummary,
                },
                {
                  id: 'resummarize',
                  label: isGeneratingSummary ? 'Re-summarizing...' : 'Re-Summarize',
                  icon: RefreshCw,
                  loading: isGeneratingSummary,
                  disabled: isGeneratingSummary,
                  onClick: handleGenerateSummary,
                },
              ];

              const summaryTabs: SubBarTab[] = [
                { id: 'summary', label: 'Summary' },
              ];
              if (isAdmin) {
                summaryTabs.push({ id: 'prompt', label: 'Prompt' });
              }

              return (
                <EditDealSubBar
                  tabs={summaryTabs}
                  activeTab={summaryViewMode}
                  onTabChange={(tabId) => setSummaryViewMode(tabId as "summary" | "prompt")}
                  actions={summaryViewMode === 'summary' ? summaryActions : undefined}
                />
              );
            }

            return null;
          })()}

          {activeTab === 'activity' ? (
            <ActivityFeedTab
              deal={deal}
              localActivityLogs={localActivityLogs}
              loadActivityLogs={loadActivityLogs}
              isLoadingLogs={isLoadingLogs}
              hasMoreLogs={hasMoreLogs}
              isLoadingMore={isLoadingMore}
              lastLogElementRef={lastLogElementRef}
              rawLocalActivityPages={rawLocalActivityPages}
              acceleratorsState={acceleratorsState}
              acceleratorsResponse={acceleratorsResponse}
              mutateAccelerators={mutateAccelerators}
              mutateDealSummary={mutateDealSummary}
              pendingQuestions={pendingQuestions}
              getElapsedWaitText={getElapsedWaitText}
              setActiveTab={setActiveTab}
              session={session}
              activitySearchQuery={activitySearchQuery}
              canEditDueDate={canEditDueDate}
              canUseManagerCall={canUseManagerCall}
              onAnswerAccelerator={handleAnswerAccelerator}
              onDeleteAcceleratorQuestion={handleDeleteAcceleratorQuestion}
              onOpenPreview={handleOpenPreview}
              onShowRewriteModal={() => setShowRewriteModal(true)}
              toast={toast}
            />
          ) : (
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 flex flex-col gap-8 custom-scrollbar">

              {activeTab === 'summary' && (
                <DealSummaryTab
                  dealId={deal.id}
                  summaryViewMode={summaryViewMode}
                  dealSummaryResponse={dealSummaryResponse}
                  isLoadingDealSummary={isLoadingDealSummary}
                  isGeneratingSummary={isGeneratingSummary}
                  summaryError={summaryError}
                  isAdmin={isAdmin}
                  onGenerateSummary={handleGenerateSummary}
                  toast={toast}
                />
              )}

              {activeTab === 'system' && (
                <DealSystemLogsTab
                  localActivityLogs={localActivityLogs}
                  isLoadingLogs={isLoadingLogs}
                  rawLocalActivityPages={rawLocalActivityPages}
                  activitySearchQuery={activitySearchQuery}
                  session={session}
                  onDeleteSystemLog={handleDeleteSystemLog}
                />
              )}

              {activeTab === 'manager-call' && (
                <DealManagerCallTab
                  dealId={deal.id}
                  dealTopic={deal.topic}
                  acceleratorsState={acceleratorsState}
                  mutateAccelerators={mutateAccelerators}
                  pendingQuestions={pendingQuestions}
                  answeredQuestions={answeredQuestions}
                  isOwner={isOwner}
                  isAdmin={isAdmin}
                  canUseManagerCall={canUseManagerCall}
                  onAnswerAccelerator={handleAnswerAccelerator}
                  onDeleteAcceleratorQuestion={handleDeleteAcceleratorQuestion}
                  isAnsweringQuestionId={isAnsweringQuestionId}
                  isDeletingQuestionId={isDeletingQuestionId}
                />
              )}

            {activeTab === 'collaborate' && (
              <DealCollaborateTab
                deal={deal}
                teamMembers={localTeamMembers}
                allUsers={users as unknown as TeamMemberItem[]}
                isOwner={isOwner}
                isAdmin={isAdmin}
                currentUserId={session?.user?.id}
                currentUserEmail={session?.user?.email}
                isRemovingId={isRemovingId}
                onRemoveMember={handleRemoveMember}
              />
            )}

            {activeTab === 'information' && (
              <CustomerTab ref={customerTabRef} deal={deal} onClose={onClose} />
            )}

            {activeTab === 'notes' && (
              <NotesTab deal={deal} searchQuery={noteSearchQuery} />
            )}

            {['sharedMedia'].includes(activeTab) && (
              <SharedMediaTab
                deal={deal}
                activityLogs={localActivityLogs}
                onImageClick={handleOpenPreview}
                activeSubTab={sharedMediaSubTab}
                onSubTabChange={setSharedMediaSubTab}
                hideHeader={true}
              />
            )}
          </div>
          )}
        </div>
      </div>

          {/* Activity Tab Bottom Dock (Full width across bottom of panel) */}
          <div id="deal-panel-activity-dock" className="w-full shrink-0 z-10 empty:hidden" />

          {/* Notes Tab Bottom Dock (Full width across bottom of panel) */}
          <div id="deal-panel-notes-dock" className="w-full shrink-0 z-10 empty:hidden" />

          {/* Mobile Bottom Tab Bar (Icons only - no text) */}
          {rightMenus.length > 0 && (
            <div className="flex md:hidden w-full h-12 border-t border-[#1C1C1D] bg-[#252728] items-center justify-around p-3 shrink-0 z-10">
              {rightMenus.map(menu => {
                const tabId = menu.key.split('.').pop() as TabType;
                const Icon = tabId === 'summary' || menu.key === 'pipeline.summary' 
                  ? Bot 
                  : (menu.iconName ? IconMap[menu.iconName] || MessageSquare : MessageSquare);
                const isActive = activeTab === tabId || (activeTab === 'system' && tabId === 'activity');
                return (
                  <button
                    key={menu.key}
                    type="button"
                    onClick={() => {
                      setActiveTab(tabId);
                    }}
                    title={menu.label}
                    className={`flex items-center justify-center h-9 w-9 rounded-full transition-all duration-200 cursor-pointer ${
                      isActive
                        ? "bg-[#C7F33C] text-black"
                        : "text-slate-400 hover:bg-[#3A3B3C]/50 hover:text-slate-200"
                    }`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>



      {/* Lightbox Overlay */}
      <DealImageLightbox
        lightbox={previewLightbox}
        onClose={() => setPreviewLightbox(null)}
        onNavigate={(idx) => setPreviewLightbox(prev => prev ? { ...prev, currentIndex: idx } : null)}
      />

      {/* Standard Deal Actions Drawer (Won, Lost, Convert, Delete) */}
      <DealActionsDrawer
        isOpen={isActionsDrawerOpen && hasCardActions}
        onClose={() => setIsActionsDrawerOpen(false)}
        deal={deal}
        canCloseDeal={canCloseDeal}
        canConvert={canConvert}
        canConvertToInternal={canConvertToInternal}
        canDelete={canDelete}
        onNavigateToInformation={() => setActiveTab('information')}
        onDealClosed={(dealId, status) => {
          setIsActionsDrawerOpen(false);
          onDealClosed?.(dealId, status);
          onClose();
        }}
        onDealConverted={(newType) => {
          const targetType = (newType as OpportunityType) || (dealType === 'INTERNAL_TASK' ? OpportunityType.SALES_DEAL : OpportunityType.INTERNAL_TASK);
          setDealType(targetType);
          setIsActionsDrawerOpen(false);
          if (targetType === OpportunityType.SALES_DEAL) {
            setActiveTab('information');
          } else {
            setActiveTab('activity');
          }
        }}
        onDealDeleted={(dealId) => {
          setIsActionsDrawerOpen(false);
          onDealClosed?.(dealId, "LOST");
          onClose();
        }}
      />

      {/* Invite Members Drawer (Multi-select) */}
      <MemberSelectDrawer
        isOpen={showInviteDrawer}
        onClose={() => setShowInviteDrawer(false)}
        title="Invite Team Members"
        subtitle="Select department or individual members to add to this card."
        mode="multiple"
        dealId={deal.id}
        currentOwnerId={deal.ownerId}
        excludeUserIds={[deal.ownerId, ...(localTeamMembers?.map(tm => tm.id) || [])]}
        onConfirmMultiple={async (selectedIds) => {
          await handleAddMembers(selectedIds, users as unknown as TeamMemberItem[]);
          setShowInviteDrawer(false);
        }}
        isSubmitting={isAddingMembers}
      />

      {/* Transfer Ownership Drawer (Single-select) */}
      <MemberSelectDrawer
        isOpen={showTransferDrawer}
        onClose={() => setShowTransferDrawer(false)}
        title="Transfer Ownership"
        subtitle="Select a new deal owner. You will remain on the deal as a collaborator."
        mode="single"
        dealId={deal.id}
        currentOwnerId={deal.ownerId}
        excludeUserIds={[deal.ownerId]}
        onConfirmSingle={async (selectedId) => {
          await handleTransfer(selectedId);
          setShowTransferDrawer(false);
        }}
        isSubmitting={isTransferring}
      />

      {/* AI Rewriter Modal */}
      <RewriteCommentModal
        isOpen={showRewriteModal}
        onClose={() => setShowRewriteModal(false)}
        dealId={deal.id}
        dealTopic={deal.topic}
        isAdmin={isAdmin}
        onPostSuccess={() => {
          setActiveTab('activity');
          void loadActivityLogs();
        }}
      />
    </>
  );
}
