"use client";

import { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanCard, OpportunityWithRelations, checkIsRedCard } from "./KanbanCard";

interface KanbanColumnProps {
  id: string;
  title: string;
  deals: OpportunityWithRelations[];
  onDealClick?: (deal: OpportunityWithRelations, tab?: string) => void;
  hideTitle?: boolean;
  isScrollable?: boolean;
  currentUserId?: string;
  currentUserRole?: string;
  onDealIntent?: () => void;
  selectedCardId?: string | null;
}

export function KanbanColumn({ 
  id, 
  title, 
  deals, 
  onDealClick, 
  hideTitle, 
  isScrollable, 
  currentUserId, 
  currentUserRole, 
  onDealIntent,
  selectedCardId,
}: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({
    id,
    data: {
      type: "Column",
      column: { id, title }
    }
  });

  const redCardsCount = useMemo(() => deals.filter(checkIsRedCard).length, [deals]);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-2 w-full shrink-0 ${isScrollable ? 'h-full max-h-full' : ''}`}
    >
      {!hideTitle && (
        <div className="hidden md:flex items-center justify-between px-2 py-2 sticky top-0 z-10 bg-[#252728]">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-semibold text-base md:text-lg text-slate-100 truncate">{title}</h3>
          </div>

          <span 
            className="h-7 md:h-8 px-2.5 min-w-[2rem] md:min-w-[2.25rem] flex items-center justify-center rounded-full bg-[#3A3B3C] text-xs font-semibold shrink-0 tabular-nums select-none"
            title={`Red Cards: ${redCardsCount} | ทั้งหมด: ${deals.length}`}
          >
            <span className={redCardsCount > 0 ? "text-[#C7F33C] font-bold" : "text-slate-400"}>
              {redCardsCount}
            </span>
            <span className="text-slate-500 font-normal mx-0.5">|</span>
            <span className="text-slate-300">
              {deals.length}
            </span>
          </span>
        </div>
      )}

      <div className={`flex flex-col gap-3 md:gap-4 flex-1 p-1 pb-16 md:p-2 hide-scrollbar ${isScrollable ? 'overflow-y-auto min-h-0' : 'min-h-[500px]'}`}>
        <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          {deals.map((deal) => (
            <KanbanCard
              key={deal.id}
              deal={deal}
              isSelected={deal.id === selectedCardId}
              onOpenPanel={(tab) => onDealClick?.(deal, tab)}
              onPanelIntent={onDealIntent}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
