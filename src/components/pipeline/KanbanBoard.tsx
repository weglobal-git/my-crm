"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { 
  DndContext, 
  DragOverlay, 
  closestCenter, 
  KeyboardSensor, 
  MouseSensor,
  TouchSensor, 
  useSensor, 
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  useDroppable,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCardUI, KanbanClockProvider, OpportunityWithRelations, checkIsRedCard, PendingAcceleratorsContext } from "./KanbanCard";
import { getPendingAcceleratorsMap, type DealAcceleratorsState, type PendingAcceleratorInfo } from "@/lib/actions/ai-accelerator";
import { PipelineStage, User } from "@prisma/client";
import dynamic from "next/dynamic";
import { useDialog } from "@/providers/DialogProvider";
import { useSidebar } from "@/components/layout/SidebarContext";
import { moveOpportunity, getPipelineOpportunities } from "@/lib/actions/opportunity";
import { getMoreCompletedOpportunities } from "@/lib/actions/completed-deals";
import { pusherClient } from "@/lib/pusher";
import { broadcastEventAcrossTabs } from "@/lib/pusher-connection-manager";
import useSWR, { mutate as globalMutate, preload } from "swr";
import { getAllUsers } from "@/lib/actions/users";

const loadEditDealPanel = () => import("./EditDealPanel");
const EditDealPanel = dynamic(() => loadEditDealPanel().then(mod => mod.EditDealPanel), { ssr: false });

const activeClass = "border-[#C7F33C] bg-[#252728] text-[#C7F33C]";

type PipelineUpdateEvent = {
  action?: string;
  dealId?: string;
  user?: User;
  users?: User[];
  userId?: string;
  activityLog?: OpportunityWithRelations['activityLogs'][number] & { parentId?: string | null };
  logId?: string;
  nextLatestLog?: OpportunityWithRelations['activityLogs'][number] | null;
  deal?: OpportunityWithRelations;
  state?: DealAcceleratorsState;
  pendingCount?: number;
};

export function DroppablePlaceholder({ id, label }: { id: string, label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div 
      ref={setNodeRef} 
      className={`flex-1 rounded-xl border-2 border-dashed flex items-center justify-center font-bold text-lg transition-all duration-200
        ${isOver ? activeClass : 'border-[#4E4F50] bg-[#252728]/80 backdrop-blur text-slate-400'}
      `}
    >
      {label}
    </div>
  );
}

import type { TabType } from "./EditDealPanel";

interface KanbanBoardProps {
  currentUserId: string;
  currentUserRole?: string;
  initialStages: PipelineStage[];
  initialOpportunities?: OpportunityWithRelations[];
  initialPendingAccelerators?: Record<string, PendingAcceleratorInfo>;
  isCompletedTab?: boolean;
  initialTab?: string;
  activeTab?: string;
  activeSearch?: string;
  cardTypeFilter?: string;
  ownerFilter?: string;
}

export function KanbanBoard({ 
  currentUserId, 
  currentUserRole, 
  isCompletedTab, 
  initialStages, 
  initialOpportunities, 
  initialPendingAccelerators, 
  initialTab = 'workspace',
  activeTab,
  activeSearch,
  cardTypeFilter = 'ALL',
  ownerFilter = 'ALL',
}: KanbanBoardProps) {
  const { toast } = useDialog();
  const { setColumnNavConfig } = useSidebar();
  const searchParams = useSearchParams();
  
  const tab = activeTab || searchParams.get('tab') || 'workspace';
  const searchQuery = activeSearch !== undefined ? activeSearch : (searchParams.get('search') || '');

  const { data: rawOpportunities, mutate, isLoading } = useSWR<OpportunityWithRelations[]>(
    ['pipeline-deals', tab, searchQuery],
    async () => {
      const res = await getPipelineOpportunities(tab, searchQuery);
      return (typeof res === 'string' ? JSON.parse(res) : res) as OpportunityWithRelations[];
    },
    { 
      fallbackData: tab === initialTab ? initialOpportunities : undefined,
      // The initial snapshot was fetched by the Server Component. Avoid an
      // immediate duplicate Server Action after hydration.
      revalidateOnMount: !(tab === initialTab && initialOpportunities !== undefined),
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      focusThrottleInterval: 15_000,
      dedupingInterval: 5_000,
    }
  );

  // Infinite Scroll state for completed tab
  const [completedDeals, setCompletedDeals] = useState<OpportunityWithRelations[]>([]);
  const [hasMoreCompleted, setHasMoreCompleted] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const allDealIds = useMemo(() => {
    const fallback = tab === initialTab ? (initialOpportunities || []) : [];
    const source = rawOpportunities || fallback;
    const ids = source.map(d => d.id);
    if (isCompletedTab) {
      completedDeals.forEach(d => {
        if (!ids.includes(d.id)) ids.push(d.id);
      });
    }
    return ids;
  }, [rawOpportunities, initialOpportunities, tab, initialTab, isCompletedTab, completedDeals]);

  const { data: pendingAcceleratorsMap = initialPendingAccelerators || {}, mutate: mutatePendingAccelerators } = useSWR(
    allDealIds.length > 0 ? ['pending-accelerators', allDealIds.slice(0, 100).sort().join(',')] : null,
    () => getPendingAcceleratorsMap(allDealIds),
    { 
      fallbackData: initialPendingAccelerators,
      revalidateOnMount: !initialPendingAccelerators,
      revalidateOnFocus: false, 
      dedupingInterval: 10_000 
    }
  );

  // Group opportunities by stageId
  const groupedDeals = useMemo(() => initialStages.reduce((acc, stage) => {
    const fallback = tab === initialTab ? (initialOpportunities || []) : [];
    let stageDeals = (rawOpportunities || fallback).filter(o => o.pipelineStageId === stage.id);
    if (cardTypeFilter && cardTypeFilter !== 'ALL') {
      stageDeals = stageDeals.filter(o => o.type === cardTypeFilter);
    }
    if (ownerFilter && ownerFilter !== 'ALL') {
      stageDeals = stageDeals.filter(o => o.ownerId === ownerFilter || o.owner?.id === ownerFilter);
    }
    stageDeals.sort((a, b) => {
      const aInfo = pendingAcceleratorsMap[a.id];
      const bInfo = pendingAcceleratorsMap[b.id];
      const aPending = (typeof aInfo === 'number' ? aInfo : (aInfo?.count || 0)) > 0;
      const bPending = (typeof bInfo === 'number' ? bInfo : (bInfo?.count || 0)) > 0;
      if (aPending && !bPending) return -1;
      if (!aPending && bPending) return 1;

      const aRed = checkIsRedCard(a);
      const bRed = checkIsRedCard(b);
      if (aRed && !bRed) return -1;
      if (!aRed && bRed) return 1;
      return 0;
    });
    acc[stage.id] = stageDeals;
    return acc;
  }, {} as Record<string, OpportunityWithRelations[]>), [initialStages, rawOpportunities, tab, initialTab, initialOpportunities, cardTypeFilter, ownerFilter, pendingAcceleratorsMap]);

  const [deals, setDeals] = useState<Record<string, OpportunityWithRelations[]>>(groupedDeals);
  const dragOriginRef = useRef<Record<string, OpportunityWithRelations[]> | null>(null);
  const [activeDeal, setActiveDeal] = useState<OpportunityWithRelations | null>(null);
  const [activeWidth, setActiveWidth] = useState<number>(0);
  const [activePanelDeal, setActivePanelDeal] = useState<{deal: OpportunityWithRelations, tab: TabType} | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [closingTimeout, setClosingTimeout] = useState<NodeJS.Timeout | null>(null);
  const rawOpportunitiesRef = useRef(rawOpportunities);
  useEffect(() => {
    rawOpportunitiesRef.current = rawOpportunities;
  }, [rawOpportunities]);
  const tabRef = useRef(tab);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);
  const initialTabRef = useRef(initialTab);
  useEffect(() => {
    initialTabRef.current = initialTab;
  }, [initialTab]);
  const initialOpportunitiesRef = useRef(initialOpportunities);
  useEffect(() => {
    initialOpportunitiesRef.current = initialOpportunities;
  }, [initialOpportunities]);
  const mutatePendingAcceleratorsRef = useRef(mutatePendingAccelerators);
  useEffect(() => {
    mutatePendingAcceleratorsRef.current = mutatePendingAccelerators;
  }, [mutatePendingAccelerators]);

  const preloadEditDealPanel = useCallback(() => {
    void loadEditDealPanel();
    void preload("all-users", getAllUsers);
  }, []);

  const handleOpenPanel = useCallback(async (deal: OpportunityWithRelations, tab: TabType) => {
    if (closingTimeout) clearTimeout(closingTimeout);
    await loadEditDealPanel();
    setActivePanelDeal({ deal, tab });
    setPanelOpen(true);
  }, [closingTimeout]);

  const handleClosePanel = useCallback(() => {
    setPanelOpen(false);
    const t = setTimeout(() => {
      setActivePanelDeal(null);
    }, 300);
    setClosingTimeout(t);
  }, []);

  // Real-time updates via Pusher
  useEffect(() => {
    if (isCompletedTab) return;
    
    const channelName = `private-pipeline-${currentUserId}`;
    console.log(`[KANBAN-PUSHER] Subscribing to: "${channelName}" (isCompletedTab=${isCompletedTab})`);
    const channel = pusherClient.subscribe(channelName);

    const onSubSucceeded = () => {
      console.log(`[KANBAN-PUSHER] Subscribed successfully to: "${channelName}"`);
    };
    const onSubError = (status: unknown) => {
      console.warn(`[KANBAN-PUSHER] Subscription issue for channel "${channelName}":`, status);
    };
    channel.bind('pusher:subscription_succeeded', onSubSucceeded);
    channel.bind('pusher:subscription_error', onSubError);

    let hasConnectedOnce = pusherClient.connection.state === 'connected';
    const handleConnected = () => {
      if (hasConnectedOnce) {
        console.log(`[KANBAN-PUSHER] Pusher re-connected, triggering SWR mutate()`);
        void mutate();
      } else {
        hasConnectedOnce = true;
      }
    };
    const handlePipelineUpdate = (data?: PipelineUpdateEvent) => {
      console.log(`[KANBAN-PUSHER] Received event "pipeline-updated": action="${data?.action}", dealId="${data?.dealId}"`, data);
      broadcastEventAcrossTabs(channelName, 'pipeline-updated', data);
      if (data?.action === 'MEMBER_ADDED' && data.dealId && data.user) {
        const addedUser = data.user;

        // If the deal is not in our current data, we probably just got added to it.
        // We need to fetch it to show it on the board.
        const dealExists = rawOpportunitiesRef.current?.some(opp => opp.id === data.dealId);
        if (!dealExists) {
          mutate();
          return;
        }

        mutate(
          (currentData: OpportunityWithRelations[] | undefined) => {
            if (!currentData) return currentData;
            return currentData.map(opp => {
              if (opp.id === data.dealId) {
                const isExisting = (opp.teamMembers || []).some(u => u.id === addedUser.id);
                if (!isExisting) {
                  return { ...opp, teamMembers: [...(opp.teamMembers || []), addedUser] };
                }
              }
              return opp;
            });
          },
          { revalidate: false }
        );
      } else if (data?.action === 'MEMBERS_ADDED' && data.dealId && data.users) {
        const addedUsers = data.users;
        const dealExists = rawOpportunitiesRef.current?.some(opp => opp.id === data.dealId);
        if (!dealExists) {
          mutate();
          return;
        }

        mutate(
          (currentData: OpportunityWithRelations[] | undefined) => {
            if (!currentData) return currentData;
            return currentData.map(opp => {
              if (opp.id === data.dealId) {
                const currentMembers = opp.teamMembers || [];
                const newMembers = addedUsers.filter(u => !currentMembers.some(existing => existing.id === u.id));
                if (newMembers.length > 0) {
                  return { ...opp, teamMembers: [...currentMembers, ...newMembers] };
                }
              }
              return opp;
            });
          },
          { revalidate: false }
        );
      } else if (data?.action === 'MEMBER_REMOVED' && data.dealId && data.userId) {
        mutate(
          (currentData: OpportunityWithRelations[] | undefined) => {
            if (!currentData) return currentData;
            return currentData.map(opp => {
              if (opp.id === data.dealId) {
                return { ...opp, teamMembers: (opp.teamMembers || []).filter(u => u.id !== data.userId) };
              }
              return opp;
            });
          },
          { revalidate: false }
        );
      } else if (
        data?.action === 'ACTIVITY_ADDED' &&
        data.dealId &&
        data.activityLog &&
        !data.activityLog.parentId &&
        data.activityLog.type === 'COMMENT' &&
        !data.activityLog.content.startsWith('[DUE DATE:') &&
        !data.activityLog.content.startsWith('[URGENT_')
      ) {
        const addedActivityLog = data.activityLog;
        mutate(
          (currentData: OpportunityWithRelations[] | undefined) => {
            if (!currentData) return currentData;
            return currentData.map(opp => {
              if (opp.id === data.dealId) {
                return { ...opp, activityLogs: [addedActivityLog] };
              }
              return opp;
            });
          },
          { revalidate: false }
        );
      } else if (data?.action === 'ACTIVITY_UPDATED' && data.dealId && data.activityLog) {
        const updatedActivityLog = data.activityLog;
        mutate(
          (currentData: OpportunityWithRelations[] | undefined) => {
            if (!currentData) return currentData;
            return currentData.map(opp => {
              if (opp.id === data.dealId) {
                // Only replace if the currently shown log is the one being updated
                const updatedLogs = opp.activityLogs.map(log => 
                  log.id === updatedActivityLog.id ? updatedActivityLog : log
                );
                return { ...opp, activityLogs: updatedLogs };
              }
              return opp;
            });
          },
          { revalidate: false }
        );
      } else if (data?.action === 'ACTIVITY_DELETED' && data.dealId && data.logId) {
        mutate(
          (currentData: OpportunityWithRelations[] | undefined) => {
            if (!currentData) return currentData;
            return currentData.map(opp => {
              if (opp.id === data.dealId) {
                // If we deleted the log currently shown (or if it was just cleared by Optimistic UI),
                // replace with the nextLatestLog (if provided) or empty array
                const isCurrentlyShown = opp.activityLogs.some(log => log.id === data.logId);
                const isEmpty = opp.activityLogs.length === 0;
                
                if (isCurrentlyShown || isEmpty) {
                  return { ...opp, activityLogs: data.nextLatestLog ? [data.nextLatestLog] : [] };
                }
                return opp;
              }
              return opp;
            });
          },
          { revalidate: false }
        );
      } else if (data?.action === 'DEAL_ACCELERATORS_UPDATED') {
        const dealId = data.dealId;
        const pendingCount = data.pendingCount;
        console.log(`[KANBAN-PUSHER] Handling DEAL_ACCELERATORS_UPDATED: dealId="${dealId}", pendingCount=${pendingCount}`);
        if (dealId) {
          if (data.state) {
            void globalMutate(['deal-accelerators', dealId], { success: true, data: data.state }, false);
          } else {
            void globalMutate(['deal-accelerators', dealId]);
          }
        }
        if (dealId && typeof pendingCount === 'number') {
          void mutatePendingAcceleratorsRef.current(
            (prev) => {
              const next = { ...(prev || {}) };
              if (pendingCount === 0) {
                delete next[dealId];
              } else {
                const current = next[dealId];
                if (typeof current === 'object' && current !== null) {
                  next[dealId] = {
                    ...current,
                    count: pendingCount,
                  };
                } else {
                  next[dealId] = {
                    count: pendingCount,
                    earliestPendingAt: new Date().toISOString(),
                  };
                }
              }
              return next;
            },
            false
          );
          void globalMutate(
            key => Array.isArray(key) && key[0] === 'pending-accelerators',
            (prevMap: Record<string, { count: number; earliestPendingAt: string | null }> | undefined) => {
              if (!prevMap) return prevMap;
              const next = { ...prevMap };
              if (pendingCount === 0) {
                delete next[dealId];
              } else {
                const current = next[dealId];
                if (typeof current === 'object' && current !== null) {
                  next[dealId] = {
                    ...current,
                    count: pendingCount,
                  };
                } else {
                  next[dealId] = {
                    count: pendingCount,
                    earliestPendingAt: new Date().toISOString(),
                  };
                }
              }
              return next;
            },
            false
          );
        }
        return;
      } else if (data?.action?.startsWith('ACTIVITY_')) {
        // Ignore activity log updates for the board, as they don't affect Kanban columns directly.
        // This prevents the massive 10-second full board refetch bottleneck.
        return;
      } else if (data?.action?.startsWith('NOTE_')) {
        // Ignore note updates for the board to prevent full refetches
        return;
      } else if (data?.action === 'OPPORTUNITY_CREATED' && data.deal) {
        const createdDeal = data.deal;
        mutate(
          (currentData: OpportunityWithRelations[] | undefined) => {
            if (!currentData) return currentData;
            // Prevent duplicate creation
            if (currentData.some(opp => opp.id === createdDeal.id)) return currentData;
            return [createdDeal, ...currentData];
          },
          { revalidate: false }
        );
      } else if (data?.action === 'OPPORTUNITY_UPDATED' && data.deal) {
        const updatedDeal = data.deal;
        if (!isCompletedTab && updatedDeal.status !== 'OPEN') {
          // Deal was closed (WON/LOST) - immediately remove from all active board columns
          setDeals(prev => {
            const next = { ...prev };
            for (const colId in next) {
              next[colId] = next[colId].filter(opp => opp.id !== updatedDeal.id);
            }
            return next;
          });
        }
        mutate(
          (currentData: OpportunityWithRelations[] | undefined) => {
            const source = currentData || (tabRef.current === initialTabRef.current ? (initialOpportunitiesRef.current || []) : []);
            if (!isCompletedTab && updatedDeal.status !== 'OPEN') {
              return source.filter(opp => opp.id !== updatedDeal.id);
            }
            return source.map(opp => {
              if (opp.id === updatedDeal.id) {
                return updatedDeal;
              }
              return opp;
            });
          },
          { revalidate: true }
        );
      } else if (data?.action === 'OPPORTUNITY_DELETED' && data.dealId) {
        mutate(
          (currentData: OpportunityWithRelations[] | undefined) => {
            if (!currentData) return currentData;
            return currentData.filter(opp => opp.id !== data.dealId);
          },
          { revalidate: false }
        );
      } else {
        mutate(); // Revalidate SWR cache entirely for unknown actions
      }
    };

    channel.bind('pipeline-updated', handlePipelineUpdate);
    pusherClient.connection.bind('connected', handleConnected);

    return () => {
      // This channel is shared with EditDealPanel. Only remove this component's
      // handler; unsubscribing the channel here would disconnect the panel too.
      channel.unbind('pusher:subscription_succeeded', onSubSucceeded);
      channel.unbind('pusher:subscription_error', onSubError);
      channel.unbind('pipeline-updated', handlePipelineUpdate);
      pusherClient.connection.unbind('connected', handleConnected);
    };
  }, [currentUserId, isCompletedTab, mutate]);

  // Sync state when props update (only if not dragging)
  useEffect(() => {
    if (activeDeal) return; // Don't interrupt drag operations

    setTimeout(() => {
      setDeals(groupedDeals);

      if (panelOpen) {
        setActivePanelDeal(prev => {
          if (!prev) return prev;
          const fallback = tab === initialTab ? (initialOpportunities || []) : [];
          const freshDeal = (rawOpportunities || fallback).find(o => o.id === prev.deal.id);
          if (freshDeal) return { ...prev, deal: freshDeal };
          return prev;
        });
      }
    }, 0);
  }, [groupedDeals, activeDeal, panelOpen, rawOpportunities, tab, initialTab, initialOpportunities]);


  useEffect(() => {
    if (isCompletedTab) {
      const t = setTimeout(() => {
        if (rawOpportunities) {
          setCompletedDeals(rawOpportunities);
          setHasMoreCompleted(rawOpportunities.length === 20);
        } else if (tab === initialTab) {
          setCompletedDeals(initialOpportunities || []);
          setHasMoreCompleted((initialOpportunities || []).length === 20);
        } else {
          setCompletedDeals([]);
        }
      }, 0);
      return () => clearTimeout(t);
    }
  }, [rawOpportunities, initialOpportunities, isCompletedTab, tab, initialTab]);



  const loadMoreCompleted = useCallback(async () => {
    if (isLoadingMore || !hasMoreCompleted) return;
    setIsLoadingMore(true);
    try {
      // We pass the current length to skip
      const nextBatch = await getMoreCompletedOpportunities(completedDeals.length, searchQuery || undefined);
      if (nextBatch.length === 0) {
        setHasMoreCompleted(false);
      } else {
        setCompletedDeals(prev => {
          // avoid duplicates
          const existingIds = new Set(prev.map((d: OpportunityWithRelations) => d.id));
          const newUnique = nextBatch.filter((d: OpportunityWithRelations) => !existingIds.has(d.id));
          return [...prev, ...newUnique] as OpportunityWithRelations[];
        });
        if (nextBatch.length < 20) setHasMoreCompleted(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMoreCompleted, completedDeals.length, searchQuery]);

  // Intersection observer for infinite scrolling
  useEffect(() => {
    if (!isCompletedTab || !hasMoreCompleted) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        loadMoreCompleted();
      }
    }, { rootMargin: '200px' });
    
    const target = document.getElementById('completed-load-more');
    if (target) observer.observe(target);
    
    return () => observer.disconnect();
  }, [isCompletedTab, hasMoreCompleted, loadMoreCompleted]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const findColumnOfDeal = useCallback((dealId: string) => {
    for (const [colId, colDeals] of Object.entries(deals)) {
      if (colDeals.some(d => d.id === dealId)) return colId;
    }
    return null;
  }, [deals]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const dealId = active.id as string;
    dragOriginRef.current = deals;
    
    const el = active.rect.current.initial;
    if (el) setActiveWidth(el.width);

    for (const colDeals of Object.values(deals)) {
      const deal = colDeals.find(d => d.id === dealId);
      if (deal) {
        setActiveDeal(deal);
        break;
      }
    }
  }, [deals]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    if (activeId === overId) return;

    const activeCol = findColumnOfDeal(activeId);
    let overCol = findColumnOfDeal(overId);
    if (!overCol && initialStages.some(c => c.id === overId)) {
      overCol = overId;
    }

    if (!activeCol || !overCol || activeCol === overCol) return;

    setDeals(prev => {
      const sourceItems = [...prev[activeCol]];
      const destItems = [...prev[overCol]];
      const activeIndex = sourceItems.findIndex(d => d.id === activeId);
      if (activeIndex === -1) return prev;
      
      const [item] = sourceItems.splice(activeIndex, 1);
      const overIndex = destItems.findIndex(d => d.id === overId);
      if (overIndex !== -1) destItems.splice(overIndex, 0, item);
      else destItems.push(item);

      return { ...prev, [activeCol]: sourceItems, [overCol]: destItems };
    });
  }, [initialStages, findColumnOfDeal]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDeal(null);
    setActiveWidth(0);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const columnId = findColumnOfDeal(activeId);
    if (!columnId) return;

    const overCol = findColumnOfDeal(overId);
    if (overCol === columnId && activeId !== overId) {
      setDeals(prev => {
        const items = [...prev[columnId]];
        const activeIndex = items.findIndex(d => d.id === activeId);
        const overIndex = items.findIndex(d => d.id === overId);
        if (activeIndex !== -1 && overIndex !== -1) {
          return { ...prev, [columnId]: arrayMove(items, activeIndex, overIndex) };
        }
        return prev;
      });
      return;
    }

    try {
      await mutate(
        currentData => currentData?.map(deal =>
          deal.id === activeId ? { ...deal, pipelineStageId: columnId } : deal
        ),
        { revalidate: false }
      );
      await moveOpportunity(activeId, columnId);
    } catch (error: unknown) {
      const originalDeals = dragOriginRef.current;
      const originalDeal = originalDeals
        ? Object.values(originalDeals).flat().find(deal => deal.id === activeId)
        : undefined;
      if (originalDeals) setDeals(originalDeals);
      if (originalDeal) {
        await mutate(
          currentData => currentData?.map(deal => deal.id === activeId ? originalDeal : deal),
          { revalidate: false }
        );
      } else {
        await mutate();
      }
      if (error instanceof Error) {
        toast({ title: "Error", description: "Error moving opportunity: " + error.message, type: "error" });
      }
    } finally {
      dragOriginRef.current = null;
    }
  }, [findColumnOfDeal, toast, mutate]);

  const boardContainerRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);

  const scrollToColumn = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(initialStages.length - 1, index));
    const stage = initialStages[clamped];
    const container = boardContainerRef.current;
    const el = stage ? columnRefs.current[stage.id] : null;

    if (stage && el && container) {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      const targetLeft = isMobile
        ? Math.max(0, el.offsetLeft - Math.max(0, (container.clientWidth - el.offsetWidth) / 2))
        : Math.max(0, Math.min(container.scrollWidth - container.clientWidth, el.offsetLeft - 16));

      container.scrollTo({
        left: targetLeft,
        behavior: "smooth",
      });
      setActiveColumnIndex(clamped);
    }
  }, [initialStages]);

  // Sync activeColumnIndex when boardContainer is scrolled horizontally
  useEffect(() => {
    const container = boardContainerRef.current;
    if (!container || isCompletedTab) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!container) return;
        const scrollLeft = container.scrollLeft;
        let closestIndex = 0;
        let minDiff = Infinity;
        initialStages.forEach((stage, idx) => {
          const el = columnRefs.current[stage.id];
          if (el) {
            const diff = Math.abs(el.offsetLeft - scrollLeft);
            if (diff < minDiff) {
              minDiff = diff;
              closestIndex = idx;
            }
          }
        });
        setActiveColumnIndex((prev) => (prev !== closestIndex ? closestIndex : prev));
      }, 50);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      clearTimeout(timeoutId);
      container.removeEventListener("scroll", handleScroll);
    };
  }, [initialStages, isCompletedTab]);

  // Register column navigation with SidebarContext for floating buttons
  useEffect(() => {
    if (isCompletedTab || initialStages.length === 0) {
      setColumnNavConfig(null);
      return;
    }

    const currentStage = initialStages[activeColumnIndex];
    const currentCount = currentStage ? (deals[currentStage.id]?.length ?? 0) : 0;
    setColumnNavConfig({
      hasPrev: activeColumnIndex > 0,
      hasNext: activeColumnIndex < initialStages.length - 1,
      onPrev: () => scrollToColumn(activeColumnIndex - 1),
      onNext: () => scrollToColumn(activeColumnIndex + 1),
      currentTitle: currentStage?.name || "",
      currentIndex: activeColumnIndex,
      totalColumns: initialStages.length,
      currentCount,
    });

    return () => setColumnNavConfig(null);
  }, [isCompletedTab, initialStages, activeColumnIndex, scrollToColumn, setColumnNavConfig, deals]);

  if (isLoading && !rawOpportunities && (!initialOpportunities || initialOpportunities.length === 0)) {
    return (
      <div className="flex w-full h-full items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-[#C7F33C]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  return (
    <PendingAcceleratorsContext.Provider value={pendingAcceleratorsMap}>
      <KanbanClockProvider>
        <div 
          ref={boardContainerRef}
          className={`relative flex gap-1 ${isCompletedTab ? 'overflow-x-auto' : 'overflow-x-hidden xl:overflow-x-auto touch-pan-y xl:touch-auto'} hide-scrollbar scroll-smooth w-full max-w-full min-w-0 ${isCompletedTab ? '' : 'h-full'}`}
        >
        {isCompletedTab ? (
          <div className="w-full max-w-8xl mx-auto flex flex-col gap-8 px-4 pb-12">
            {(() => {
              let dealsToDisplay = completedDeals;
              if (cardTypeFilter && cardTypeFilter !== 'ALL') {
                dealsToDisplay = dealsToDisplay.filter(d => d.type === cardTypeFilter);
              }
              if (ownerFilter && ownerFilter !== 'ALL') {
                dealsToDisplay = dealsToDisplay.filter(d => d.ownerId === ownerFilter || d.owner?.id === ownerFilter);
              }
              const grouped = dealsToDisplay.reduce((acc, deal) => {
                // Determine completion date by goodsLoadingDate or fallback to updated/createdAt
                const date = deal.goodsLoadingDate || deal.updatedAt || deal.createdAt;
                const year = new Date(date).getFullYear();
                if (!acc[year]) acc[year] = [];
                acc[year].push(deal);
                return acc;
              }, {} as Record<number, OpportunityWithRelations[]>);

              const sortedYears = Object.keys(grouped).map(Number).sort((a, b) => b - a);

              return sortedYears.map(year => (
                <div key={year} className="flex flex-col gap-4">
                  <h3 className="font-semibold text-2xl text-slate-100">{year}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 px-8 pt-6">
                    {grouped[year].map(deal => (
                      <div key={deal.id} className="cursor-pointer">
                        <KanbanCardUI 
                          deal={deal} 
                          onOpenPanel={(tab) => handleOpenPanel(deal, (tab || 'activity') as TabType)} 
                          onPanelIntent={preloadEditDealPanel}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
            {hasMoreCompleted && (
              <div id="completed-load-more" className="flex justify-center py-8">
                {isLoadingMore ? (
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#da6986]"></div>
                ) : (
                  <div className="h-8"></div>
                )}
              </div>
            )}
          </div>
        ) : (
          <DndContext
            id="kanban-dnd"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {initialStages.map((col) => (
              <div
                key={col.id}
                ref={(el) => { columnRefs.current[col.id] = el; }}
                className="w-[calc(100vw-32px)] max-w-[380px] shrink-0 md:w-[320px] lg:shrink lg:w-0 lg:flex-1 lg:min-w-0"
              >
                <KanbanColumn 
                  id={col.id} 
                  title={col.name} 
                  deals={deals[col.id] || []} 
                  onDealClick={(deal, tab) => handleOpenPanel(deal, (tab || 'activity') as TabType)}
                  isScrollable={true}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                  onDealIntent={preloadEditDealPanel}
                />
              </div>
            ))}

            <DragOverlay dropAnimation={null}>
              {activeDeal ? (
                <div style={{ width: activeWidth || undefined }}>
                  <KanbanCardUI deal={activeDeal} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {activePanelDeal && (
        <EditDealPanel
          deal={activePanelDeal.deal}
          initialTab={activePanelDeal.tab}
          isOpen={panelOpen}
          onClose={handleClosePanel}
          onDealClosed={(dealId) => {
            // Optimistically remove from active board columns immediately
            setDeals(prev => {
              const next = { ...prev };
              for (const colId in next) {
                next[colId] = next[colId].filter(d => d.id !== dealId);
              }
              return next;
            });
            void mutate(
              (currentData: OpportunityWithRelations[] | undefined) => {
                const source = currentData || (tab === initialTab ? (initialOpportunities || []) : []);
                return source.filter(d => d.id !== dealId);
              },
              { revalidate: true }
            );
          }}
        />
      )}
      </KanbanClockProvider>
    </PendingAcceleratorsContext.Provider>
  );
}
