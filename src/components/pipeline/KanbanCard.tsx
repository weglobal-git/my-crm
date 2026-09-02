"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BellRing, CircleDollarSign, Wrench, Handshake, Wand2 } from "lucide-react";
import { Opportunity, Company, User, Tag, OpportunityTag } from "@prisma/client";
import { usePermissions } from "@/providers/PermissionProvider";
import { getOptimizedCloudinaryUrl } from "@/lib/utils";
import { preload } from "swr";
import { getOpportunityActivityLogs } from "@/lib/actions/opportunity";

const formatDateTime = (date: Date | string) => {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
};

export type OpportunityWithRelations = Opportunity & {
  company: Company | null;
  owner: User;
  teamMembers: User[];
  tags: (OpportunityTag & { tag: Tag })[];
  activityLogs: { 
    id: string; 
    createdAt: Date; 
    content: string; 
    type: string; 
    user: { name: string | null; image: string | null } | null 
  }[];
};

export function checkIsRedCard(deal: OpportunityWithRelations) {
  if (['WON', 'LOST', 'COMPLETED', 'CANCELLED'].includes(deal.status)) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let newestDate: Date | null = null;
  if (deal.activityLogs && deal.activityLogs.length > 0) {
    const validLogs = deal.activityLogs.filter(log => log.type === 'COMMENT' && !log.content.startsWith('[DUE DATE:'));
    if (validLogs.length > 0) {
      newestDate = new Date(validLogs[0].createdAt);
      newestDate.setHours(0, 0, 0, 0);
    }
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
  onPanelIntent?: () => void;
}

function getRedThreshold(deal: OpportunityWithRelations): Date | null {
  if (['WON', 'LOST', 'COMPLETED', 'CANCELLED'].includes(deal.status)) {
    return null;
  }

  let newestDate: Date | null = null;
  if (deal.activityLogs && deal.activityLogs.length > 0) {
    const validLogs = deal.activityLogs.filter(log => log.type === 'COMMENT' && !log.content.startsWith('[DUE DATE:'));
    if (validLogs.length > 0) {
      newestDate = new Date(validLogs[0].createdAt);
    }
  }

  const dueDate = deal.dueDate ? new Date(deal.dueDate) : null;
  const thresholds: Date[] = [];

  if (dueDate) {
    thresholds.push(dueDate);
  }
  
  if (newestDate) {
    // 3 days threshold
    thresholds.push(new Date(newestDate.getTime() + 3 * 24 * 60 * 60 * 1000));
  } else if (deal.createdAt) {
    // fallback to createdAt if no activity
    thresholds.push(new Date(new Date(deal.createdAt).getTime() + 3 * 24 * 60 * 60 * 1000));
  }

  if (thresholds.length === 0) return null;

  const earliestThreshold = new Date(Math.min(...thresholds.map(t => t.getTime())));
  const now = new Date();

  // If we are past the threshold, return it
  if (now > earliestThreshold) {
    return earliestThreshold;
  }

  return null;
}

const KanbanClockContext = createContext(0);

export function KanbanClockProvider({ children }: { children: React.ReactNode }) {
  const [currentMinute, setCurrentMinute] = useState(() => Math.floor(Date.now() / 60_000));

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMinute(Math.floor(Date.now() / 60_000));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  return <KanbanClockContext.Provider value={currentMinute}>{children}</KanbanClockContext.Provider>;
}

function RedTimer({ threshold }: { threshold: Date }) {
  const currentMinute = useContext(KanbanClockContext);
  const nowMs = currentMinute * 60_000;

  const diffMs = Math.max(0, nowMs - threshold.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  const days = Math.floor(diffSec / (24 * 3600));
  const hours = Math.floor((diffSec % (24 * 3600)) / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);

  const pad = (n: number) => n.toString().padStart(2, '0');
  
  if (days > 0) {
    return <span className="text-slate-700 tabular-nums font-medium text-[10px] tracking-wide">{days}DAY | {pad(hours)}:{pad(minutes)}</span>;
  }
  return <span className="text-slate-700 tabular-nums font-medium text-[10px] tracking-wide">{pad(hours)}:{pad(minutes)}</span>;
}

import React from 'react';

export const KanbanCardUI = React.memo(function KanbanCardUI({ deal, isDragging, onOpenPanel, onPanelIntent }: KanbanCardProps & { isDragging?: boolean }) {
  const { visibleRightMenus } = usePermissions();
  const rightMenus = visibleRightMenus('pipeline') || [];
  
  const canView = (tabKey: string) => rightMenus.some(menu => menu.key === `pipeline.${tabKey}`);
  const canViewInformation = canView('information');

  // Compute display values
  const customerName = deal.company?.name || "Unknown Company"; // In old CRM, Project = Company Name
  const contactName = deal.owner.name || deal.owner.email || "Unknown Contact";
  const highlight = checkIsRedCard(deal);
  
  const handlePrefetch = () => {
    onPanelIntent?.();
    if (!canView('activity')) return;
    preload(
      ['activity-logs', deal.id, 'COMMENT', ''],
      async ([, id, typeFilter, cursor]: [string, string, string, string]) => {
        return getOpportunityActivityLogs(
          id,
          10,
          cursor || undefined,
          typeFilter as 'COMMENT' | 'SYSTEM_UPDATE',
        );
      }
    );
  };

  return (
    <div
      className={`
        flex flex-col gap-4 p-2 rounded-[24px] relative overflow-visible group/card h-[220px]
        ${highlight ? "bg-[#C7F33C]" : "bg-[#3A3B3C]"}
        ${isDragging ? "opacity-30" : "cursor-pointer"}
      `}
      onClick={() => onOpenPanel?.('')}
      onMouseEnter={handlePrefetch}
    >


      {/* Top row: Avatar, Name, Company, Arrow/Bell */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <div 
              onClick={(e) => { 
                e.stopPropagation(); 
                if (canView('collaborate')) onOpenPanel?.('collaborate'); 
              }}
              className={`w-12 h-12 rounded-full overflow-hidden flex items-center justify-center shrink-0 border-2 cursor-pointer transition-all relative ${highlight ? 'border-[#C7F33C]' : 'border-[#3A3B3C]'}`}
            >
              <img 
                src={deal.owner.image ? getOptimizedCloudinaryUrl(deal.owner.image, 100) : `https://api.dicebear.com/7.x/notionists/svg?seed=${deal.owner.name || deal.owner.email || "Unknown"}`} 
                alt={contactName}
                className="w-full h-full object-cover" 
              />
            </div>
            {deal.teamMembers && deal.teamMembers.length > 0 && (
              <div 
                className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 flex items-center justify-center text-[12px] font-bold z-20 cursor-pointer ${highlight ? 'bg-black text-[#C7F33C] border-[#C7F33C]' : 'bg-slate-300 text-black border-[#3A3B3C]'}`}
                title={`${deal.teamMembers.length} team members`}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  if (canView('collaborate')) onOpenPanel?.('collaborate'); 
                }}
              >
                {deal.teamMembers.length}
              </div>
            )}
            
            <div className={`absolute -bottom-1 -left-1 w-6 h-6 rounded-full flex items-center justify-center z-20 ${highlight ? 'border-[#C7F33C]' : 'border-[#3A3B3C]'}`}>
              {deal.type === 'SALES_DEAL' && (
                <div className={`w-full h-full rounded-full flex items-center justify-center ${highlight ? 'bg-[#C7F33C] text-slate-800' : 'bg-[#C7F33C] text-black'}`}>
                  <CircleDollarSign className="w-5.5 h-5.5" />
                </div>
              )}
              {deal.type === 'INTERNAL_TASK' && (
                <div className={`w-full h-full rounded-full flex items-center justify-center ${highlight ? 'bg-[#C7F33C] text-slate-800' : 'bg-slate-700 text-slate-300'}`}>
                  <Wrench className="w-5.5 h-5.5" />
                </div>
              )}
              {deal.type === 'PARTNERSHIP' && (
                <div className={`w-full h-full rounded-full flex items-center justify-center ${highlight ? 'bg-[#C7F33C] text-slate-800' : 'bg-indigo-500 text-white'}`}>
                  <Handshake className="w-5.5 h-5.5" />
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col flex-1 min-w-0 pr-1 pl-1">
            <div className="flex items-center gap-1.5 mb-1">
              <div className={`font-semibold text-[13px] leading-tight truncate ${highlight ? 'text-slate-900' : 'text-slate-100'}`} title={deal.topic}>{deal.topic}</div>
              {deal.activityLogs?.some(log => log.type === 'SYSTEM_UPDATE' && (log as any).sourceDomainEventId) && (
                <div title="AI Summary Available" className="w-4 h-4 rounded flex items-center justify-center bg-[#C7F33C]/20 border border-[#C7F33C]/30 shrink-0">
                  <Wand2 className="w-2.5 h-2.5 text-[#C7F33C]" />
                </div>
              )}
            </div>
            <div className={`flex items-center text-[11px] truncate ${highlight ? 'text-slate-700' : 'text-slate-400'}`}>
              {contactName}
            </div>
          </div>
        </div>
        
        {deal.dueDate && (
          <div className="flex-shrink-0 ml-auto" title={`Due: ${new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(deal.dueDate))}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${highlight ? 'bg-black/20 text-red-50 hover:bg-black/40' : 'bg-[#252728] text-[#C7F33C] hover:bg-[#4E4F50]'}`}>
              <BellRing className="w-4 h-4" />
            </div>
          </div>
        )}
      </div>

      {/* Middle row: Action box & Log */}
      <div 
        onClick={(e) => { 
          e.stopPropagation(); 
          if (canView('activity')) onOpenPanel?.('activity'); 
        }}
        className="flex flex-col gap-2 cursor-pointer hover:opacity-90 transition-opacity flex-1 overflow-hidden"
      >
        {(() => {
          const latestLog = deal.activityLogs?.find(log => log.type === 'COMMENT' && !log.content.startsWith('[DUE DATE:'));
          if (!latestLog) {
            return (
              <div className="flex flex-col justify-center gap-1 mt-1">
                <p className={`text-xs font-medium italic ${highlight ? 'text-slate-600' : 'text-slate-500'}`}>No activity yet</p>
              </div>
            );
          }
          
          return (
            <div className="flex flex-col gap-2 mt-1 flex-1 overflow-hidden">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className={`pl-4 text-[10px] font-medium ${highlight ? 'text-slate-700' : 'text-slate-400'}`}>{formatDateTime(latestLog.createdAt)}</span>
                </div>
                <div className="flex items-start gap-2 px-2">
                  <div className={`w-5 h-5 rounded-full overflow-hidden shrink-0 flex items-center justify-center ${highlight ? 'bg-white/40' : 'bg-[#4E4F50]'}`}>
                    {latestLog.user?.image ? (
                      <img src={getOptimizedCloudinaryUrl(latestLog.user.image, 100)} alt={latestLog.user.name || ''} className="w-full h-full object-cover" />
                    ) : (
                      <span className={`text-[9px] font-medium ${highlight ? 'text-slate-700' : 'text-slate-300'}`}>
                        {latestLog.user?.name?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    )}
                  </div>
                  <div className={`text-[11px] font-medium line-clamp-4 leading-tight mt-0.5 ${highlight ? 'text-slate-800' : 'text-slate-300'}`}>
                    {latestLog.content}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Bottom row: Customer Name & Timer */}
      {(canViewInformation || (highlight && getRedThreshold(deal))) && (
        <div className="flex justify-between items-end mt-auto">
          {canViewInformation ? (
            <div 
              onClick={(e) => { e.stopPropagation(); onOpenPanel?.('information'); }}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium flex items-center justify-center cursor-pointer transition-colors max-w-[150px]
                ${highlight ? "border-transparent bg-black/20 font-mono tracking-wide hover:bg-black/40 text-slate-700" : "bg-[#4E4F50] text-slate-100 hover:bg-slate-500"}
              `}
              title={customerName}
            >
              <span className="truncate">{customerName}</span>
            </div>
          ) : (
            <div></div> /* Empty div to push timer to the right if customer name is hidden */
          )}

          {highlight && getRedThreshold(deal) && (
            <div className="px-3 py-1.5 rounded-full bg-black/20 flex items-center justify-center min-w-[90px] ml-auto">
              <RedTimer threshold={getRedThreshold(deal)!} />
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export const KanbanCard = React.memo(function KanbanCard({ deal, onOpenPanel, onPanelIntent, currentUserId, currentUserRole }: KanbanCardProps & { currentUserId?: string, currentUserRole?: string }) {
  const canDrag = currentUserRole === 'ADMIN' || deal.ownerId === currentUserId;

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
    disabled: !canDrag,
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
      {...(canDrag ? listeners : {})}
      onPointerEnter={onPanelIntent}
      onFocusCapture={onPanelIntent}
      className={`touch-none ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <KanbanCardUI deal={deal} isDragging={isDragging} onOpenPanel={onOpenPanel} onPanelIntent={onPanelIntent} />
    </div>
  );
});
