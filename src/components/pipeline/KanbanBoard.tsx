"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCardUI, OpportunityWithRelations, checkIsRedCard } from "./KanbanCard";
import { PipelineStage } from "@prisma/client";
import { moveOpportunity } from "@/lib/actions/opportunity";
import { getMoreCompletedOpportunities } from "@/lib/actions/completed-deals";
import { EditDealPanel, TabType } from "./EditDealPanel";
import { useDialog } from "@/providers/DialogProvider";
import { pusherClient } from "@/lib/pusher";

interface KanbanBoardProps {
  currentUserId?: string;
  currentUserRole?: string;
  isCompletedTab?: boolean;
  initialStages: PipelineStage[];
  initialOpportunities: OpportunityWithRelations[];
}

export function KanbanBoard({ currentUserId, currentUserRole, isCompletedTab, initialStages, initialOpportunities }: KanbanBoardProps) {
  const { toast } = useDialog();
  // Group opportunities by stageId
  const initialDeals = initialStages.reduce((acc, stage) => {
    const stageDeals = initialOpportunities.filter(o => o.pipelineStageId === stage.id);
    stageDeals.sort((a, b) => {
      const aRed = checkIsRedCard(a);
      const bRed = checkIsRedCard(b);
      if (aRed && !bRed) return -1;
      if (!aRed && bRed) return 1;
      return 0;
    });
    acc[stage.id] = stageDeals;
    return acc;
  }, {} as Record<string, OpportunityWithRelations[]>);

  const [deals, setDeals] = useState<Record<string, OpportunityWithRelations[]>>(initialDeals);
  const [activeDeal, setActiveDeal] = useState<OpportunityWithRelations | null>(null);
  const [activeWidth, setActiveWidth] = useState<number>(0);
  const [selectedDeal, setSelectedDeal] = useState<{deal: OpportunityWithRelations, tab: string} | null>(null);
  
  const router = useRouter();

  // Real-time updates via Pusher
  useEffect(() => {
    if (isCompletedTab) return;
    
    const channel = pusherClient.subscribe('pipeline');
    channel.bind('pipeline-updated', () => {
      router.refresh();
    });

    return () => {
      pusherClient.unsubscribe('pipeline');
    };
  }, [router, isCompletedTab]);

  // Sync state when props update (only if not dragging)
  useEffect(() => {
    if (activeDeal) return; // Don't interrupt drag operations

    const newDeals = initialStages.reduce((acc, stage) => {
      const stageDeals = initialOpportunities.filter(o => o.pipelineStageId === stage.id);
      stageDeals.sort((a, b) => {
        const aRed = checkIsRedCard(a);
        const bRed = checkIsRedCard(b);
        if (aRed && !bRed) return -1;
        if (!aRed && bRed) return 1;
        return 0;
      });
      acc[stage.id] = stageDeals;
      return acc;
    }, {} as Record<string, OpportunityWithRelations[]>);

    setTimeout(() => {
      setDeals(newDeals);

      setSelectedDeal(prev => {
        if (!prev) return prev;
        const freshDeal = initialOpportunities.find(o => o.id === prev.deal.id);
        if (freshDeal) return { ...prev, deal: freshDeal };
        return prev;
      });
    }, 0);
  }, [initialOpportunities, initialStages, activeDeal]);

  // Infinite Scroll state for completed tab
  const [completedDeals, setCompletedDeals] = useState<OpportunityWithRelations[]>([]);
  const [hasMoreCompleted, setHasMoreCompleted] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  useEffect(() => {
    if (isCompletedTab) {
      const t = setTimeout(() => {
        setCompletedDeals(initialOpportunities);
        setHasMoreCompleted(initialOpportunities.length === 20); // assuming page size is 20
      }, 0);
      return () => clearTimeout(t);
    }
  }, [initialOpportunities, isCompletedTab]);

  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('search') || undefined;

  const loadMoreCompleted = useCallback(async () => {
    if (isLoadingMore || !hasMoreCompleted) return;
    setIsLoadingMore(true);
    try {
      // We pass the current length to skip
      const nextBatch = await getMoreCompletedOpportunities(completedDeals.length, searchQuery);
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
      await moveOpportunity(activeId, columnId);
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast({ title: "Error", description: "Error moving opportunity: " + error.message, type: "error" });
      }
      // Ideally revert state here on failure
    }
  }, [findColumnOfDeal, toast]);

  return (
    <>
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
                          onOpenPanel={(tab) => setSelectedDeal({ deal, tab: tab || 'activity' })} 
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
                onDealClick={(deal, tab) => setSelectedDeal({ deal, tab: tab || 'activity' })}
                isScrollable={true}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
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

      {selectedDeal && (
        <EditDealPanel 
          deal={selectedDeal.deal} 
          initialTab={selectedDeal.tab as TabType}
          isOpen={!!selectedDeal} 
          onClose={() => setSelectedDeal(null)} 
        />
      )}
    </>
  );
}
