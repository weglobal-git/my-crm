"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
import { KanbanCardUI, DealType } from "./KanbanCard";

// Initial Mock Data
const INITIAL_COLUMNS = [
  { id: "lead", title: "New Lead" },
  { id: "contacted", title: "Contacted" },
  { id: "proposal", title: "Proposal" },
  { id: "won", title: "Won" },
];

const INITIAL_DEALS: DealType[] = [
  { id: "deal-1", customerName: "Jane Doe", companyName: "Marosoft Inc.", title: "Schedule Discovery Call", date: "28 03 2026 01:20 pm", value: 12500, highlight: true },
  { id: "deal-2", customerName: "Alexander", companyName: "TechFlow", title: "Follow up Email", date: "29 03 2026 10:00 am", value: 8400 },
  { id: "deal-3", customerName: "Christopher", companyName: "Nexus Corp", title: "Send Proposal", date: "30 03 2026 03:00 pm", value: 45000 },
  { id: "deal-4", customerName: "Penelope", companyName: "Global Trade", title: "Contract Review", date: "31 03 2026 11:30 am", value: 120000 },
];

function findColumnOfDeal(deals: Record<string, DealType[]>, dealId: string | number): string | null {
  for (const [colId, colDeals] of Object.entries(deals)) {
    if (colDeals.some(d => d.id === dealId)) return colId;
  }
  return null;
}

export function KanbanBoard() {
  const [deals, setDeals] = useState<Record<string, DealType[]>>({
    "lead": [INITIAL_DEALS[0], INITIAL_DEALS[1]],
    "contacted": [INITIAL_DEALS[2]],
    "proposal": [INITIAL_DEALS[3]],
    "won": [],
  });

  const [activeDeal, setActiveDeal] = useState<DealType | null>(null);
  const [activeWidth, setActiveWidth] = useState<number>(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const dealId = active.id as string;
    
    // Capture the width of the original element so the overlay matches exactly
    const el = active.rect.current.initial;
    if (el) {
      setActiveWidth(el.width);
    }

    // Find the deal data
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

    const activeCol = findColumnOfDeal(deals, activeId);
    // Check if hovering over a deal or a column
    let overCol = findColumnOfDeal(deals, overId);
    if (!overCol) {
      // Maybe hovering over a column droppable directly
      if (INITIAL_COLUMNS.some(c => c.id === overId)) {
        overCol = overId;
      }
    }

    if (!activeCol || !overCol || activeCol === overCol) return;

    // Move deal from one column to another
    setDeals(prev => {
      const sourceItems = [...prev[activeCol]];
      const destItems = [...prev[overCol]];

      const activeIndex = sourceItems.findIndex(d => d.id === activeId);
      if (activeIndex === -1) return prev;

      const [item] = sourceItems.splice(activeIndex, 1);

      // If overId is a deal in dest column, insert at that position
      const overIndex = destItems.findIndex(d => d.id === overId);
      if (overIndex !== -1) {
        destItems.splice(overIndex, 0, item);
      } else {
        // Dropped on column itself - append to end
        destItems.push(item);
      }

      return {
        ...prev,
        [activeCol]: sourceItems,
        [overCol]: destItems,
      };
    });
  }, [deals]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDeal(null);
    setActiveWidth(0);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    const columnId = findColumnOfDeal(deals, activeId);
    if (!columnId) return;

    // Same column reorder
    const overCol = findColumnOfDeal(deals, overId);
    if (overCol === columnId) {
      setDeals(prev => {
        const items = [...prev[columnId]];
        const activeIndex = items.findIndex(d => d.id === activeId);
        const overIndex = items.findIndex(d => d.id === overId);

        if (activeIndex !== -1 && overIndex !== -1) {
          return {
            ...prev,
            [columnId]: arrayMove(items, activeIndex, overIndex),
          };
        }
        return prev;
      });
    }
  }, [deals]);

  return (
    <div className="w-full flex gap-6 overflow-x-auto pb-8 custom-scrollbar">
      <DndContext
        id="kanban-dnd"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {INITIAL_COLUMNS.map(col => (
          <KanbanColumn 
            key={col.id} 
            id={col.id} 
            title={col.title} 
            deals={deals[col.id]} 
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
  );
}
