"use client";

import { useRef, useCallback } from "react";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanCard, OpportunityWithRelations } from "./KanbanCard";

interface KanbanColumnProps {
  id: string;
  title: string;
  deals: OpportunityWithRelations[];
  onDealClick?: (deal: OpportunityWithRelations, tab?: string) => void;
  hideTitle?: boolean;
  isScrollable?: boolean;
  currentUserId?: string;
  currentUserRole?: string;
  onLoadMore?: (stageId: string) => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
}

export function KanbanColumn({ id, title, deals, onDealClick, hideTitle, isScrollable, currentUserId, currentUserRole, onLoadMore, isLoadingMore, hasMore }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({
    id,
    data: {
      type: "Column",
      column: { id, title }
    }
  });

  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastDealElementRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) observerRef.current.disconnect();
    if (isLoadingMore) return;
    
    if (node) {
      observerRef.current = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && hasMore) {
          onLoadMore?.(id);
        }
      });
      observerRef.current.observe(node);
    }
  }, [isLoadingMore, hasMore, onLoadMore, id]);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-4 w-[320px] shrink-0 ${isScrollable ? 'h-full max-h-full' : ''}`}
    >
      {!hideTitle && (
        <div className="flex items-center justify-between px-2 py-2 sticky top-0 z-10 bg-[#252728]">
          <h3 className="font-semibold text-lg text-slate-100">{title}</h3>
          <span className="w-8 h-8 flex items-center justify-center rounded-full bg-[#3A3B3C] text-sm font-semibold text-slate-300">
            {deals.length}
          </span>
        </div>
      )}

      <div className={`flex flex-col gap-4 flex-1 p-2 rounded-3xl hide-scrollbar ${isScrollable ? 'overflow-y-auto min-h-0' : 'min-h-[500px]'}`}>
        <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          {deals.map((deal) => (
            <KanbanCard key={deal.id} deal={deal} onOpenPanel={(tab) => onDealClick?.(deal, tab)} currentUserId={currentUserId} currentUserRole={currentUserRole} />
          ))}
        </SortableContext>
        
        {hasMore && (
          <div ref={lastDealElementRef} className="w-full py-4 flex justify-center">
            {isLoadingMore && (
              <div className="animate-spin w-4 h-4 border-2 border-[#da6986] border-t-transparent rounded-full" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
