"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Mail, Video, ChevronDown, BellRing, Building2 } from "lucide-react";
import { Opportunity, Company, User, Tag, OpportunityTag, ActivityLog } from "@prisma/client";

const formatDateTime = (date: Date | string) => {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
};

export type OpportunityWithRelations = Opportunity & {
  company: Company | null;
  owner: User;
  teamMembers: User[];
  tags: (OpportunityTag & { tag: Tag })[];
  activityLogs: (ActivityLog & { 
    user: User;
    replies: (ActivityLog & {
      user: User;
    })[];
  })[];
};

export function checkIsRedCard(deal: OpportunityWithRelations) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let newestDate: Date | null = null;
  if (deal.activityLogs && deal.activityLogs.length > 0) {
    newestDate = new Date(deal.activityLogs[0].createdAt);
    newestDate.setHours(0, 0, 0, 0);
  }

  const dueDate = deal.dueDate ? new Date(deal.dueDate) : null;
  if (dueDate) {
    dueDate.setHours(0, 0, 0, 0);
  }

  const isDueOrPast = dueDate ? dueDate <= today : false;

  let diffDays = 0;
  if (newestDate) {
    const diffTime = Math.abs(today.getTime() - newestDate.getTime());
    diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  } else {
    diffDays = 999;
  }

  if (isDueOrPast) return true;
  if (diffDays > 2 && (!dueDate || dueDate <= today)) return true;

  return false;
}

interface KanbanCardProps {
  deal: OpportunityWithRelations;
  onOpenPanel?: (tab: string) => void;
}

export function KanbanCardUI({ deal, isDragging, onOpenPanel }: { deal: OpportunityWithRelations; isDragging?: boolean; onOpenPanel?: (tab: string) => void }) {
  // Compute display values
  const customerName = deal.company?.name || "Unknown Company"; // In old CRM, Project = Company Name
  const contactName = deal.owner.name || "Unassigned"; // Show owner or maybe contact person
  
  const highlight = checkIsRedCard(deal);
  
  return (
    <div
      className={`
        w-full p-3 rounded-[2rem] flex flex-col gap-5
        ${highlight ? "bg-[#d4ff3a]" : "bg-white"}
        ${isDragging ? "opacity-30" : "shadow-sm hover:shadow-md cursor-pointer"}
      `}
    >
      {/* Top row: Avatar, Name, Company, Arrow/Bell */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="relative mr-2 flex-shrink-0">
            <div 
              onClick={(e) => { e.stopPropagation(); onOpenPanel?.('collaborate'); }}
              className="w-12 h-12 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center shrink-0 border-2 border-white shadow-sm cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all relative z-10"
            >
              <img 
                src={deal.owner.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${deal.owner.name || deal.owner.email || "Unknown"}`} 
                alt={contactName}
                className="w-full h-full object-cover" 
              />
            </div>
            {deal.teamMembers && deal.teamMembers.length > 0 && (
              <div 
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-white bg-[#111111] text-white flex items-center justify-center text-[12px] font-bold z-20 cursor-pointer shadow-sm"
                title={`${deal.teamMembers.length} team members`}
                onClick={(e) => { e.stopPropagation(); onOpenPanel?.('collaborate'); }}
              >
                {deal.teamMembers.length}
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <h4 
              onClick={(e) => { e.stopPropagation(); onOpenPanel?.('information'); }}
              className="font-semibold text-slate-900 text-md leading-tight line-clamp-1 cursor-pointer hover:text-blue-600 transition-colors" 
              title={customerName}
            >
              {customerName}
            </h4>
            <div className="font-semibold text-slate-700 text-sm mt-0.5 line-clamp-1" title={deal.topic}>{deal.topic}</div>
            <div className="flex items-center text-[11px] text-slate-500 mt-0.5">
              <Building2 className="w-3 h-3 mr-1" />
              {contactName}
            </div>
          </div>
        </div>
        <button className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-black hover:bg-slate-100 transition-colors shrink-0">
          <BellRing className={`w-4 h-4 ${highlight ? "text-red-500 animate-pulse" : ""}`} />
        </button>
      </div>

      {/* Middle row: Action box & Log */}
      <div 
        onClick={(e) => { e.stopPropagation(); onOpenPanel?.('activity'); }}
        className="flex flex-col gap-2 cursor-pointer hover:opacity-90 transition-opacity"
      >
        {(() => {
          const userLogs = deal.activityLogs?.filter(log => log.type === 'COMMENT') || [];
          
          if (userLogs.length === 0) {
            return (
              <div className={`p-4 rounded-2xl flex flex-col justify-center items-center gap-1 ${highlight ? "bg-white/40" : "bg-slate-50"}`}>
                <p className="text-xs font-medium text-slate-400 italic">No activity yet</p>
              </div>
            );
          }
          
          const latestLog = userLogs[0];
          const content = latestLog.content?.trim() || "(No details)";
          const logUserSeed = latestLog.user?.name || latestLog.user?.email || "System";
          
          return (
            <div className={`p-3.5 rounded-2xl flex flex-col gap-2 ${highlight ? "bg-white/40" : "bg-slate-50"}`}>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-slate-200 overflow-hidden shrink-0">
                  <img src={latestLog.user?.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${logUserSeed}`} alt="Avatar" className="w-full h-full object-cover" />
                </div>
                <span className="text-[11px] font-bold text-slate-900">{latestLog.user?.name || 'Unknown User'}</span>
                <span className="text-[10px] text-slate-400">{formatDateTime(latestLog.createdAt)}</span>
              </div>
              <div className="pl-7">
                <p className="text-xs font-medium text-slate-700 line-clamp-2">{content}</p>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Bottom row: Dropdown and Icons */}
      <div className="flex items-center gap-2 mt-auto">
        <button className={`flex-1 flex items-center justify-between h-12 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors ${highlight ? "bg-white/60 border-transparent hover:bg-white/80" : "bg-white"}`}>
          <span>${(deal.value || 0).toLocaleString()}</span>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </button>
        <button className={`w-12 h-12 flex items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:text-black hover:bg-slate-50 transition-colors shrink-0 ${highlight ? "bg-white/60 border-transparent" : "bg-white"}`}>
          <Mail className="w-5 h-5" />
        </button>
        <button className="w-12 h-12 flex items-center justify-center rounded-full bg-black text-white hover:bg-slate-800 transition-colors shrink-0">
          <Video className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

export function KanbanCard({ deal, onOpenPanel }: KanbanCardProps) {
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
      <KanbanCardUI deal={deal} isDragging={isDragging} onOpenPanel={onOpenPanel} />
    </div>
  );
}
