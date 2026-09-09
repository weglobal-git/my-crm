"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BellRing, Bot, FileText } from "lucide-react";
import { DealTypeIcon } from "./DealTypeBadge";
import { Opportunity, Company, User, Tag, OpportunityTag } from "@prisma/client";
import { usePermissions } from "@/providers/PermissionProvider";
import { getOptimizedCloudinaryUrl } from "@/lib/utils";
import { preload } from "swr";
import { getOpportunityActivityLogs } from "@/lib/actions/opportunity";
import { getDealAccelerators } from "@/lib/actions/ai-accelerator";

const formatDateTime = (date: Date | string) => {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
};

interface ParsedLogAttachment {
  url: string;
  filename: string;
  type: string;
  isImage: boolean;
}

function parseLogContent(content: string) {
  const attachments: ParsedLogAttachment[] = [];
  const cleanText = content
    .replace(/\[ATTACHMENT:(https?:\/\/[a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+[^\s\]|]*|blob:[^\]|\s]+)(?:\|([^\]|]*))?(?:\|([^\]|]*))?\]/g, (_match, url, filename = '', type = '') => {
      const isImg =
        type.startsWith('image/') ||
        Boolean(url.match(/\.(jpeg|jpg|png|gif|webp|svg|bmp)(\?.*)?$/i)) ||
        Boolean(url.includes('/image/upload/')) ||
        url.startsWith('blob:');
      attachments.push({
        url,
        filename: filename || 'Attachment',
        type: type || (isImg ? 'image/jpeg' : 'application/octet-stream'),
        isImage: isImg,
      });
      return '';
    })
    .trim();

  const images = attachments.filter((a) => a.isImage);
  const otherFiles = attachments.filter((a) => !a.isImage);

  return { cleanText, images, otherFiles };
}

import type { PendingAcceleratorInfo } from "@/lib/actions/ai-accelerator";

export const PendingAcceleratorsContext = createContext<Record<string, PendingAcceleratorInfo | number>>({});

export type OpportunityWithRelations = Opportunity & {
  company: Company | null;
  owner: User & { departments?: { id: string; name: string }[] };
  teamMembers: User[];
  tags?: (OpportunityTag & { tag: Tag })[];
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

  const dueDate = deal.dueDate ? new Date(deal.dueDate) : null;
  if (dueDate) {
    dueDate.setHours(0, 0, 0, 0);
  }

  // 1. If Due Date is set:
  if (dueDate) {
    // If today is on or past Due Date: ALWAYS RED CARD as long as DueDate remains on the deal!
    if (dueDate <= today) {
      return true;
    }
    // If Due Date is in the future: scheduled for future date, not red yet
    return false;
  }

  // 2. If NO Due Date is set:
  // Standard inactivity: more than 2 days (3 days) without update -> Red Card
  let newestDate: Date | null = null;
  if (deal.activityLogs && deal.activityLogs.length > 0) {
    const validLogs = deal.activityLogs.filter(
      log => log.type === 'COMMENT' && !log.content.startsWith('[DUE DATE:') && !log.content.startsWith('[URGENT_')
    );
    if (validLogs.length > 0) {
      newestDate = new Date(validLogs[0].createdAt);
      newestDate.setHours(0, 0, 0, 0);
    }
  }

  let diffDays = 0;
  if (newestDate) {
    const diffTime = Math.abs(today.getTime() - newestDate.getTime());
    diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  } else if (deal.createdAt) {
    const createdDate = new Date(deal.createdAt);
    createdDate.setHours(0, 0, 0, 0);
    const diffTime = Math.abs(today.getTime() - createdDate.getTime());
    diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  } else {
    diffDays = 999;
  }

  return diffDays > 2;
}

interface KanbanCardProps {
  deal: OpportunityWithRelations;
  isSelected?: boolean;
  onOpenPanel?: (tab: string) => void;
  onPanelIntent?: () => void;
  currentUserId?: string;
  currentUserRole?: string;
}

export function getRedThreshold(deal: OpportunityWithRelations): Date | null {
  if (['WON', 'LOST', 'COMPLETED', 'CANCELLED'].includes(deal.status)) {
    return null;
  }

  const dueDate = deal.dueDate ? new Date(deal.dueDate) : null;
  const now = new Date();

  // If there is an active Due Date:
  if (dueDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueMidnight = new Date(dueDate);
    dueMidnight.setHours(0, 0, 0, 0);

    if (dueMidnight <= today) {
      return dueDate;
    }
    return null;
  }

  // If NO Due Date: 3 days threshold from latest activity or creation
  let newestDate: Date | null = null;
  if (deal.activityLogs && deal.activityLogs.length > 0) {
    const validLogs = deal.activityLogs.filter(
      log => log.type === 'COMMENT' && !log.content.startsWith('[DUE DATE:') && !log.content.startsWith('[URGENT_')
    );
    if (validLogs.length > 0) {
      newestDate = new Date(validLogs[0].createdAt);
    }
  }

  let baseDate = newestDate;
  if (!baseDate && deal.createdAt) {
    baseDate = new Date(deal.createdAt);
  }

  if (baseDate) {
    const threeDaysAfter = new Date(baseDate.getTime() + 3 * 24 * 60 * 60 * 1000);
    if (now > threeDaysAfter) {
      return threeDaysAfter;
    }
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
    return <span className="text-slate-700 tabular-nums font-medium text-xs tracking-wide">{days}DAY | {pad(hours)}:{pad(minutes)}</span>;
  }
  return <span className="text-slate-700 tabular-nums font-medium text-xs tracking-wide">{pad(hours)}:{pad(minutes)}</span>;
}

import React from 'react';

export const KanbanCardUI = React.memo(function KanbanCardUI({ deal, isDragging, isSelected, onOpenPanel, onPanelIntent }: KanbanCardProps & { isDragging?: boolean }) {
  const { visibleRightMenus } = usePermissions();
  const rightMenus = visibleRightMenus('pipeline') || [];
  const pendingAcceleratorsMap = useContext(PendingAcceleratorsContext);
  
  const canView = (tabKey: string) => rightMenus.some(menu => menu.key === `pipeline.${tabKey}`);
  const canViewInformation = canView('information');

  // Compute display values
  const isInternal = deal.type === 'INTERNAL_TASK';
  const customerName = isInternal 
    ? (deal.company?.displayName || deal.company?.name || null)
    : (deal.company?.displayName || deal.company?.name || "No Customer");
  const contactName = deal.owner.name || deal.owner.email || "Unknown Contact";
  const pendingEntry = pendingAcceleratorsMap[deal.id];
  const pendingCount = typeof pendingEntry === 'number' ? pendingEntry : (pendingEntry?.count || 0);
  const isOrange = pendingCount > 0;
  const highlight = checkIsRedCard(deal);

  if (deal.topic?.includes("Light Test Deal") || deal.topic?.toLowerCase().includes("test")) {
    console.log(`[CARD-RENDER] "${deal.topic}" (id=${deal.id}) -> pendingCount=${pendingCount}, isOrange=${isOrange}, highlight=${highlight}`);
  }
  
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
    preload(
      ['deal-accelerators', deal.id],
      () => getDealAccelerators(deal.id)
    );
  };

  return (
    <div
      id={`deal-card-${deal.id}`}
      data-deal-id={deal.id}
      style={{ outline: 'none' }}
      className={`
        flex flex-col gap-2 p-2.5 md:p-2 rounded-2xl md:rounded-[24px] relative overflow-visible group/card h-[220px] transition-all duration-150 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 select-none
        ${isOrange ? "bg-[#F59E0B]" : highlight ? "bg-[#C7F33C]" : "bg-[#3A3B3C]"}
        ${isDragging ? "opacity-30" : "cursor-pointer"}
        ${isSelected ? "md:ring-2 md:ring-white md:ring-offset-2 md:ring-offset-[#1C1C1D] md:shadow-2xl md:shadow-black/80 md:scale-[1.015] md:z-20" : ""}
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
              className={`w-12 h-12 rounded-full overflow-hidden flex items-center justify-center shrink-0 border-2 cursor-pointer hover:border-black/50 hover:border-solid transition-all relative ${isOrange ? 'border-[#F59E0B]' : highlight ? 'border-[#C7F33C]' : 'border-[#3A3B3C]'}`}
            >
              <img 
                src={deal.owner.image ? getOptimizedCloudinaryUrl(deal.owner.image, 100) : `https://api.dicebear.com/7.x/notionists/svg?seed=${deal.owner.name || deal.owner.email || "Unknown"}`} 
                alt={contactName}
                className="w-full h-full object-cover" 
              />
            </div>
            {deal.teamMembers && deal.teamMembers.length > 0 && (
              <div 
                className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 flex items-center justify-center text-[12px] font-bold z-20 cursor-pointer ${isOrange ? 'bg-slate-950 text-amber-400 border-[#F59E0B]' : highlight ? 'bg-black text-[#C7F33C] border-[#C7F33C]' : 'bg-slate-300 text-black border-[#3A3B3C]'}`}
                title={`${deal.teamMembers.length} team members`}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  if (canView('collaborate')) onOpenPanel?.('collaborate'); 
                }}
              >
                {deal.teamMembers.length}
              </div>
            )}
            
            <div className={`absolute -bottom-1 -left-1 w-6 h-6 rounded-full flex items-center justify-center z-20 ${isOrange ? 'border-[#F59E0B]' : highlight ? 'border-[#a7cc31]' : 'border-[#3A3B3C]'}`}>
              <DealTypeIcon type={deal.type} size="sm" highlight={highlight} isOrange={isOrange} />
            </div>
          </div>
          <div className="flex flex-col flex-1 min-w-0 pr-1 pl-1">
            <div className="flex items-center gap-1.5 mb-1">
              <div className={`font-semibold text-[13px] leading-tight truncate ${isOrange ? 'text-slate-950 font-bold' : highlight ? 'text-slate-900' : 'text-slate-100'}`} title={deal.topic}>{deal.topic}</div>
            </div>
            <div className={`flex items-center text-xs truncate ${isOrange ? 'text-slate-900 font-medium' : highlight ? 'text-slate-700' : 'text-slate-400'}`}>
              {contactName}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-0.5 shrink-0 ml-auto">
          {deal.dueDate && (
            <div 
              className="flex-shrink-0" 
              title={`Due: ${new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(deal.dueDate))}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isOrange ? 'bg-black/20 text-slate-950 hover:bg-black/30' : highlight ? 'bg-black/15 text-slate-900 hover:bg-black/25' : 'bg-[#252728] text-[#C7F33C] hover:bg-[#4E4F50]'}`}>
                <BellRing className="w-4 h-4" />
              </div>
            </div>
          )}
          {canView('summary') && canView('activity') && (
            <div className="relative">
              <button
                type="button"
                aria-label={`Open Manager Call for ${deal.topic}`}
                title={pendingCount > 0 ? `Manager Call มี ${pendingCount} คำถามรอคำตอบด่วน` : "Open AI Summary"}
                onPointerDown={event => event.stopPropagation()}
                onKeyDown={event => event.stopPropagation()}
                onClick={event => { 
                  event.stopPropagation(); 
                  onOpenPanel?.(pendingCount > 0 ? 'manager-call' : 'summary'); 
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-100 ${
                  isOrange 
                    ? 'bg-slate-950 text-amber-400 hover:bg-slate-900' 
                    : highlight 
                    ? 'bg-black/15 text-slate-900 hover:bg-black/25' 
                    : 'bg-[#252728] text-[#C7F33C] hover:bg-[#4E4F50]'
                }`}
              >
                <Bot className="w-4 h-4" aria-hidden="true" />
              </button>
              {pendingCount > 0 && (
                <span 
                  className={`absolute -top-1 -right-1 w-4 h-4 rounded-full font-black text-xs leading-none flex items-center justify-center animate-bounce pointer-events-none ${isOrange ? 'bg-slate-950 text-amber-400 ring-1 ring-amber-400' : 'bg-amber-400 text-slate-950'}`}
                  title="Manager Call รอคำตอบด่วน"
                >
                  !
                </span>
              )}
            </div>
          )}
        </div>
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
          const latestLog = deal.activityLogs?.find(log => log.type === 'COMMENT' && !log.content.startsWith('[DUE DATE:') && !log.content.startsWith('[URGENT_'));
          if (!latestLog) {
            return (
              <div className="flex flex-col justify-center gap-1 mt-1">
                <p className={`text-xs font-medium italic ${highlight ? 'text-slate-600' : 'text-slate-500'}`}>No activity yet</p>
              </div>
            );
          }
          
          const { cleanText, images, otherFiles } = parseLogContent(latestLog.content);
          
          return (
            <div className="flex flex-col gap-2 mt-1 flex-1 overflow-hidden">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className={`pl-4 text-xs font-medium ${isOrange ? 'text-slate-900 font-semibold' : highlight ? 'text-slate-700' : 'text-slate-400'}`}>{formatDateTime(latestLog.createdAt)}</span>
                </div>
                <div className="flex items-start gap-2 px-2">
                  <div className={`w-5 h-5 rounded-full overflow-hidden shrink-0 flex items-center justify-center ${isOrange ? 'bg-black/25' : highlight ? 'bg-white/40' : 'bg-[#4E4F50]'}`}>
                    {latestLog.user?.image ? (
                      <img src={getOptimizedCloudinaryUrl(latestLog.user.image, 100)} alt={latestLog.user.name || ''} className="w-full h-full object-cover" />
                    ) : (
                      <span className={`text-[9px] font-medium ${isOrange ? 'text-slate-950 font-bold' : highlight ? 'text-slate-700' : 'text-slate-300'}`}>
                        {latestLog.user?.name?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1 overflow-hidden">
                    {cleanText && (
                      <div className={`text-xs font-medium whitespace-pre-wrap break-words ${images.length > 0 ? 'line-clamp-2' : 'line-clamp-4'} leading-tight mt-0.5 ${isOrange ? 'text-slate-950 font-medium' : highlight ? 'text-slate-800' : 'text-slate-300'}`}>
                        {cleanText}
                      </div>
                    )}

                    {images.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {images.slice(0, 3).map((img, idx) => (
                          <div
                            key={idx}
                            className={`${cleanText ? 'w-10 h-10' : 'w-12 h-12'} rounded-lg overflow-hidden border border-[#4E4F50]/60 bg-[#1C1C1D] shrink-0 relative`}
                          >
                            <img
                              src={getOptimizedCloudinaryUrl(img.url, 150)}
                              alt={img.filename}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = "https://placehold.co/100x100/252728/4E4F50?text=IMG";
                              }}
                            />
                          </div>
                        ))}
                        {images.length > 3 && (
                          <div className={`${cleanText ? 'w-10 h-10' : 'w-12 h-12'} rounded-lg bg-[#252728] border border-[#4E4F50] flex items-center justify-center text-xs font-bold text-slate-300 shrink-0`}>
                            +{images.length - 3}
                          </div>
                        )}
                      </div>
                    )}

                    {images.length === 0 && otherFiles.length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-[#252728] px-2 py-1 rounded-md border border-[#4E4F50]/60 w-fit max-w-full mt-0.5">
                        <FileText className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                        <span className="truncate">{otherFiles[0].filename}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Bottom row: Customer Name & Timer */}
      {(customerName || isOrange || (highlight && getRedThreshold(deal))) && (
        <div className="flex justify-between items-end mt-auto">
          {customerName ? (
            <div 
              onClick={(e) => { 
                e.stopPropagation(); 
                if (canViewInformation && deal.type === 'SALES_DEAL') {
                  onOpenPanel?.('information');
                } else if (canView('notes')) {
                  onOpenPanel?.('notes');
                } else {
                  onOpenPanel?.('activity');
                }
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center justify-center cursor-pointer transition-colors max-w-[150px]
                ${isOrange ? "border-transparent bg-black/20 font-mono tracking-wide hover:bg-black/30 text-slate-900 font-semibold" : highlight ? "border-transparent bg-black/20 font-mono tracking-wide hover:bg-black/40 text-slate-700" : "bg-[#4E4F50] text-slate-100 hover:bg-slate-500"}
              `}
              title={customerName}
            >
              <span className="truncate">{customerName}</span>
            </div>
          ) : (
            <div></div> /* Empty div to push timer to the right if customer name is hidden */
          )}

          {isOrange ? (
            <div 
              onClick={(e) => {
                e.stopPropagation();
                onOpenPanel?.('manager-call');
              }}
              className="px-2.5 py-1 rounded-full bg-slate-950 text-amber-400 font-bold text-xs tracking-wide flex items-center gap-1 shadow-sm ml-auto cursor-pointer hover:bg-slate-900"
              title="ดูและตอบ Manager Call"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0" />
              <span>Urgent ({pendingCount})</span>
            </div>
          ) : (
            highlight && getRedThreshold(deal) && (
              <div className="px-3 py-1.5 rounded-full bg-black/20 flex items-center justify-center min-w-[90px] ml-auto">
                <RedTimer threshold={getRedThreshold(deal)!} />
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
});

export const KanbanCard = React.memo(function KanbanCard({ 
  deal, 
  isSelected,
  onOpenPanel, 
  onPanelIntent, 
  currentUserId, 
  currentUserRole 
}: KanbanCardProps) {
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
      style={{ ...style, outline: 'none' }}
      {...attributes}
      tabIndex={-1}
      {...(canDrag ? listeners : {})}
      onPointerEnter={onPanelIntent}
      onFocusCapture={onPanelIntent}
      data-deal-id={deal.id}
      className={`${isDragging ? 'touch-none' : 'touch-manipulation'} ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''} outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0`}
    >
      <KanbanCardUI 
        deal={deal} 
        isDragging={isDragging} 
        isSelected={isSelected}
        onOpenPanel={onOpenPanel} 
        onPanelIntent={onPanelIntent} 
      />
    </div>
  );
});
