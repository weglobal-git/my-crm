"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { EditDealPanel, TabType } from "./EditDealPanel";
import { useDialog } from "@/providers/DialogProvider";

interface KanbanBoardProps {
  initialStages: PipelineStage[];
  initialOpportunities: OpportunityWithRelations[];
}

export function KanbanBoard({ initialStages, initialOpportunities }: KanbanBoardProps) {
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

  // Cross-user Real-time polling
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, 15000); // Poll every 15 seconds
    return () => clearInterval(interval);
  }, [router]);

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
      <div className="w-full flex gap-6 overflow-x-auto pb-8 hide-scrollbar">
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
