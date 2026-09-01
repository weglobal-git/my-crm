"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { 
  DndContext, 
  DragOverlay, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  useDroppable,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCardUI, KanbanClockProvider, OpportunityWithRelations, checkIsRedCard } from "./KanbanCard";
import { PipelineStage, User } from "@prisma/client";
import dynamic from "next/dynamic";
import { useDialog } from "@/providers/DialogProvider";
import { moveOpportunity, getPipelineOpportunities, getPipelineOpportunitiesForStage } from "@/lib/actions/opportunity";
import { getMoreCompletedOpportunities } from "@/lib/actions/completed-deals";
import { pusherClient } from "@/lib/pusher";
import useSWR from "swr";

const loadEditDealPanel = () => import("./EditDealPanel");
const EditDealPanel = dynamic(() => loadEditDealPanel().then(mod => mod.EditDealPanel), { ssr: false });
const WonLostModal = dynamic(() => import("./WonLostModal").then(mod => mod.WonLostModal), { ssr: false });

const activeClass = "border-[#C7F33C] bg-[#252728] text-[#C7F33C]";

type PipelineUpdateEvent = {
  action?: string;
  dealId?: string;
  user?: User;
  userId?: string;
  activityLog?: OpportunityWithRelations['activityLogs'][number] & { parentId?: string | null };
  logId?: string;
  nextLatestLog?: OpportunityWithRelations['activityLogs'][number] | null;
  deal?: OpportunityWithRelations;
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

export function DropZone({ id, label, activeClass }: { id: string, label: string, activeClass: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div 
      ref={setNodeRef} 
      className={`flex-1 rounded-xl border-4 border-dashed flex items-center justify-center font-bold text-3xl transition-all duration-200 backdrop-blur-md shadow-2xl
        ${isOver ? activeClass : 'border-slate-600/50 bg-slate-800/80 text-slate-500'}
      `}
    >
      {label}
    </div>
  );
}

import type { TabType } from "./EditDealPanel";

export interface KanbanBoardProps {
  currentUserId: string;
  currentUserRole: string;
  initialStages: PipelineStage[];
  initialOpportunities?: OpportunityWithRelations[];
  isCompletedTab?: boolean;
  initialTab?: string;
  activeTab?: string;
  activeSearch?: string;
}

export function KanbanBoard({ 
  currentUserId, 
  currentUserRole, 
  isCompletedTab, 
  initialStages, 
  initialOpportunities,
  initialTab = 'workspace',
  activeTab,
  activeSearch 
}: KanbanBoardProps) {
  const { toast } = useDialog();
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
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      focusThrottleInterval: 15_000,
      dedupingInterval: 5_000,
    }
  );

  const [loadedMoreDeals, setLoadedMoreDeals] = useState<Record<string, OpportunityWithRelations[]>>({});
  const [hasMoreStages, setHasMoreStages] = useState<Record<string, boolean>>({});
  const [loadingMoreStages, setLoadingMoreStages] = useState<Record<string, boolean>>({});

  // Group opportunities by stageId
  const groupedDeals = useMemo(() => initialStages.reduce((acc, stage) => {
    const fallback = tab === initialTab ? (initialOpportunities || []) : [];
    const baseDeals = (rawOpportunities || fallback).filter(o => o.pipelineStageId === stage.id);
    const extraDeals = loadedMoreDeals[stage.id] || [];
    
    // Merge and deduplicate by ID
    const merged = [...baseDeals, ...extraDeals];
    const uniqueDeals = Array.from(new Map(merged.map(d => [d.id, d])).values());

    uniqueDeals.sort((a, b) => {
      const aRed = checkIsRedCard(a);
      const bRed = checkIsRedCard(b);
      if (aRed && !bRed) return -1;
      if (!aRed && bRed) return 1;
      // If neither or both are red, sort by updatedAt
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    
    acc[stage.id] = uniqueDeals;
    return acc;
  }, {} as Record<string, OpportunityWithRelations[]>), [initialStages, rawOpportunities, tab, initialTab, initialOpportunities, loadedMoreDeals]);

  // Initialize hasMoreStages when rawOpportunities arrives
  useEffect(() => {
    if (!rawOpportunities && !initialOpportunities) return;
    
    setHasMoreStages(prev => {
      const next = { ...prev };
      let changed = false;
      initialStages.forEach(stage => {
        if (next[stage.id] === undefined) {
          const fallback = tab === initialTab ? (initialOpportunities || []) : [];
          const baseDeals = (rawOpportunities || fallback).filter(o => o.pipelineStageId === stage.id);
          next[stage.id] = baseDeals.length === 4;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [rawOpportunities, initialOpportunities, initialStages, tab, initialTab]);

  const [deals, setDeals] = useState<Record<string, OpportunityWithRelations[]>>(groupedDeals);
  const dragOriginRef = useRef<Record<string, OpportunityWithRelations[]> | null>(null);
  const [activeDeal, setActiveDeal] = useState<OpportunityWithRelations | null>(null);
  const [activeWidth, setActiveWidth] = useState<number>(0);
  const [activePanelDeal, setActivePanelDeal] = useState<{deal: OpportunityWithRelations, tab: string} | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [closingTimeout, setClosingTimeout] = useState<NodeJS.Timeout | null>(null);

  // Warm the largest interaction chunk while the browser is idle so the first
  // card click does not have to wait for a network round-trip and JS parsing.
  useEffect(() => {
    const warmPanel = () => { void loadEditDealPanel(); };
    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(warmPanel, { timeout: 2_000 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timer = setTimeout(warmPanel, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleOpenPanel = useCallback((deal: OpportunityWithRelations, tab: string) => {
    if (closingTimeout) clearTimeout(closingTimeout);
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

  const handleLoadMoreStage = async (stageId: string) => {
    const stageDeals = deals[stageId] || [];
    if (stageDeals.length === 0) return;
    
    // Sort deals by updatedAt to find the correct cursor
    const sortedDeals = [...stageDeals].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const cursor = sortedDeals[sortedDeals.length - 1].id;

    setLoadingMoreStages(prev => ({ ...prev, [stageId]: true }));
    try {
      const res = await getPipelineOpportunitiesForStage(stageId, 4, cursor);
      const { data, nextCursor } = JSON.parse(res);
      
      setLoadedMoreDeals(prev => ({
        ...prev,
        [stageId]: [...(prev[stageId] || []), ...data]
      }));

      if (!nextCursor) {
        setHasMoreStages(prev => ({ ...prev, [stageId]: false }));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingMoreStages(prev => ({ ...prev, [stageId]: false }));
    }
  };

  const [wonLostModal, setWonLostModal] = useState<{deal: OpportunityWithRelations, status: "WON" | "LOST"} | null>(null);

  // Real-time updates via Pusher
  useEffect(() => {
    if (isCompletedTab) return;
    
    const channelName = `private-pipeline-${currentUserId}`;
    const channel = pusherClient.subscribe(channelName);
    let hasConnectedOnce = pusherClient.connection.state === 'connected';
    const handleConnected = () => {
      if (hasConnectedOnce) {
        void mutate();
      } else {
        hasConnectedOnce = true;
      }
    };
    const handlePipelineUpdate = (data?: PipelineUpdateEvent) => {
      if (data?.action === 'MEMBER_ADDED' && data.dealId && data.user) {
        const addedUser = data.user;
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
        !data.activityLog.content.startsWith('[DUE DATE:')
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
        mutate(
          (currentData: OpportunityWithRelations[] | undefined) => {
            if (!currentData) return currentData;
            return currentData.map(opp => {
              if (opp.id === updatedDeal.id) {
                return updatedDeal;
              }
              return opp;
            });
          },
          { revalidate: false }
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

  // Infinite Scroll state for completed tab
  const [completedDeals, setCompletedDeals] = useState<OpportunityWithRelations[]>([]);
  const [hasMoreCompleted, setHasMoreCompleted] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
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
          const existingIds = new Set(prev.map(d => d.id));
          const newUnique = nextBatch.filter(d => !existingIds.has(d.id));
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
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
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

    if (overId === "zone-won" || overId === "zone-lost") {
      const deal = activeDeal || deals[findColumnOfDeal(activeId) || ""]?.find(d => d.id === activeId);
      if (deal) {
        setWonLostModal({ deal, status: overId === "zone-won" ? "WON" : "LOST" });
      }
      return;
    }

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
  }, [findColumnOfDeal, toast, activeDeal, deals, mutate]);

  if (isLoading && !rawOpportunities && (!initialOpportunities || initialOpportunities.length === 0)) {
    return (
      <div className="flex w-full h-[calc(100vh-140px)] items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-[#C7F33C]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  return (
    <KanbanClockProvider>
      <div className={`flex gap-2 overflow-x-auto pb-8 hide-scrollbar mx-auto ${isCompletedTab ? 'w-full' : 'w-fit h-[calc(100vh-140px)]'}`}>
        {isCompletedTab ? (
          <div className="w-full max-w-8xl mx-auto flex flex-col gap-8 px-4 pb-12">
            {(() => {
              // Group by year
              const grouped = completedDeals.reduce((acc, deal) => {
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
                          onOpenPanel={(tab) => handleOpenPanel(deal, tab || 'activity')} 
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
            {initialStages.map(col => (
              <KanbanColumn 
                key={col.id} 
                id={col.id} 
                title={col.name} 
                deals={deals[col.id] || []} 
                onDealClick={(deal, tab) => handleOpenPanel(deal, tab || 'activity')}
                isScrollable={true}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                onLoadMore={handleLoadMoreStage}
                isLoadingMore={loadingMoreStages[col.id]}
                hasMore={hasMoreStages[col.id]}
              />
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

      {activeDeal && !isCompletedTab && (
        <div className="fixed bottom-0 left-0 right-0 h-32 p-4 z-50 flex gap-4 animate-in slide-in-from-bottom-10 duration-200">
          <DropZone id="zone-won" label="WON" activeClass="border-emerald-500 bg-emerald-500/20 text-emerald-400" />
          <DropZone id="zone-lost" label="LOST" activeClass="border-rose-500 bg-rose-500/20 text-rose-400" />
        </div>
      )}

      {activePanelDeal && (
        <EditDealPanel 
          deal={activePanelDeal.deal} 
          initialTab={activePanelDeal.tab as TabType}
          isOpen={panelOpen} 
          onClose={handleClosePanel} 
        />
      )}

      {wonLostModal && (
        <WonLostModal
          deal={wonLostModal.deal}
          status={wonLostModal.status}
          onClose={() => setWonLostModal(null)}
          onSuccess={() => {
            setWonLostModal(null);
            mutate();
          }}
        />
      )}
    </KanbanClockProvider>
  );
}
