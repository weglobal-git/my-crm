"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowUpRight, Mail, Video, ChevronDown, Calendar, Building2 } from "lucide-react";

export interface DealType {
  id: string;
  customerName: string;
  companyName: string;
  title: string;
  value: number;
  date: string;
  highlight?: boolean;
}

interface KanbanCardProps {
  deal: DealType;
}

/**
 * Pure UI component — no dnd-kit hooks.
 * Used both inside SortableContext items and inside DragOverlay.
 */
export function KanbanCardUI({ deal, isDragging }: { deal: DealType; isDragging?: boolean }) {
  return (
    <div
      className={`
        w-full p-6 rounded-[2rem] flex flex-col gap-5
        ${deal.highlight ? "bg-lime-green" : "bg-white"}
        ${isDragging ? "opacity-30" : "shadow-sm hover:shadow-md"}
      `}
    >
      {/* Top row: Avatar, Name, Company, Arrow */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center shrink-0">
            <img 
              src={`https://api.dicebear.com/7.x/notionists/svg?seed=${deal.customerName}`} 
              alt={deal.customerName}
              className="w-full h-full object-cover" 
            />
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 text-lg leading-tight">{deal.customerName}</h4>
            <div className="flex items-center text-sm text-slate-500 mt-0.5">
              <Building2 className="w-3 h-3 mr-1" />
              {deal.companyName}
            </div>
          </div>
        </div>
        <button className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-black hover:bg-slate-100 transition-colors shrink-0">
          <ArrowUpRight className="w-5 h-5" />
        </button>
      </div>

      {/* Middle row: Action box */}
      <div className={`p-4 rounded-2xl flex items-center gap-4 ${deal.highlight ? "bg-white/40" : "bg-slate-50"}`}>
        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0">
          <Video className="w-5 h-5 text-indigo-500" />
        </div>
        <div>
          <h5 className="font-semibold text-slate-900 leading-tight">{deal.title}</h5>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex -space-x-2">
              <div className="w-5 h-5 rounded-full bg-blue-200 border border-white"></div>
              <div className="w-5 h-5 rounded-full bg-green-200 border border-white"></div>
            </div>
            <div className="flex items-center text-xs font-medium text-slate-500">
              <Calendar className="w-3 h-3 mr-1" />
              {deal.date}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row: Dropdown and Icons */}
      <div className="flex items-center gap-2 mt-auto">
        <button className={`flex-1 flex items-center justify-between h-12 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors ${deal.highlight ? "bg-white/60 border-transparent hover:bg-white/80" : "bg-white"}`}>
          <span>${deal.value.toLocaleString()}</span>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </button>
        <button className={`w-12 h-12 flex items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:text-black hover:bg-slate-50 transition-colors ${deal.highlight ? "bg-white/60 border-transparent" : "bg-white"}`}>
          <Mail className="w-5 h-5" />
        </button>
        <button className="w-12 h-12 flex items-center justify-center rounded-full bg-black text-white hover:bg-slate-800 transition-colors">
          <Video className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Sortable wrapper — attaches dnd-kit hooks.
 * The drag handle is the entire card surface.
 */
export function KanbanCard({ deal }: KanbanCardProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: deal.id,
    data: {
      type: "Deal",
      deal,
    },
  });

  const style: React.CSSProperties = {
    transition,
    transform: CSS.Transform.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="touch-none cursor-grab active:cursor-grabbing"
    >
      <KanbanCardUI deal={deal} isDragging={isDragging} />
    </div>
  );
}
