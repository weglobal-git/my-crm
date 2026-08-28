"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanCard, DealType } from "./KanbanCard";

interface KanbanColumnProps {
  id: string;
  title: string;
  deals: DealType[];
}

export function KanbanColumn({ id, title, deals }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({
    id,
    data: {
      type: "Column",
      column: { id, title }
    }
  });

  return (
    <div className="flex flex-col gap-4 w-[350px] shrink-0">
      <div className="flex items-center justify-between px-2">
        <h3 className="font-semibold text-lg text-slate-900">{title}</h3>
        <span className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
          {deals.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className="flex flex-col gap-4 flex-1 p-2 rounded-3xl min-h-[500px]"
      >
        <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          {deals.map((deal) => (
            <KanbanCard key={deal.id} deal={deal} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
