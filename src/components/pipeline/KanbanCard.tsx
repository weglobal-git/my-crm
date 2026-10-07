"use client";
import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BellRing, FileText, Loader2, Star, ListTodo, Flame } from "lucide-react";
import { DealTypeIcon } from "./DealTypeBadge";
import { usePermissions } from "@/providers/PermissionProvider";
import { getOptimizedCloudinaryUrl } from "@/lib/utils";
import { preload, useSWRConfig } from "swr";
import { getOpportunityActivityLogs, updateOpportunityHotNote } from "@/lib/actions/opportunity";
import { getDealAccelerators } from "@/lib/actions/ai-accelerator";
import type { DealTodoItem } from "@/lib/actions/notes";

function formatShortDueDate(dateVal: Date | string): string {
  try {
    const d = new Date(dateVal);
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleString('en-US', { month: 'short' });
    return `${day}${month}`;
  } catch {
    return '';
  }
}

function formatDealCurrency(val: number, curr?: string | null): string {
  try {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: curr || 'THB',
      maximumFractionDigits: 0,
    }).format(val);
  } catch {
    return `฿${val.toLocaleString()}`;
  }
}


import { parseLogContent, type ParsedLogAttachment } from "@/lib/pipeline-activity-cache";
export { parseLogContent, type ParsedLogAttachment };

import type { PendingAcceleratorInfo } from "@/lib/actions/ai-accelerator";
import {
  checkIsRedCard,
  getRedThreshold,
  type KanbanCardDTO,
  type PipelineCardDTO,
} from "@/lib/pipeline-card-dto";

export { checkIsRedCard, getRedThreshold };
export type { KanbanCardDTO, PipelineCardDTO };
export type OpportunityWithRelations = KanbanCardDTO;

export const PendingAcceleratorsContext = createContext<Record<string, PendingAcceleratorInfo | number>>({});
export const PendingTodosContext = createContext<Record<string, DealTodoItem[]>>({});

export interface OwnerFilterContextType {
  ownerFilter: string;
  onOwnerFilterChange?: (ownerId: string) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export const OwnerFilterContext = createContext<OwnerFilterContextType>({ ownerFilter: 'ALL' });
export const CompanyHolidaysContext = createContext<Set<string>>(new Set());
export const UserLeavesContext = createContext<Map<string, Set<string>>>(new Map());

export interface PinnedDealsContextType {
  pinnedDealIds: Set<string>;
  togglePinDeal: (dealId: string) => void;
}

export const PinnedDealsContext = createContext<PinnedDealsContextType>({
  pinnedDealIds: new Set(),
  togglePinDeal: () => {},
});

interface KanbanCardProps {
  deal: OpportunityWithRelations;
  isSelected?: boolean;
  onOpenPanel?: (tab: string) => void;
  onDealClick?: (deal: OpportunityWithRelations, tab?: string) => void;
  onPanelIntent?: () => void;
  currentUserId?: string;
  currentUserRole?: string;
  currentOwnerFilter?: string;
  onFilterByOwner?: (ownerId: string) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}


export const KanbanCardUI = React.memo(function KanbanCardUI({
  deal,
  isDragging,
  isSelected,
  onOpenPanel,
  onPanelIntent,
  currentOwnerFilter,
  onFilterByOwner,
  searchQuery,
  onSearchChange,
}: KanbanCardProps & { isDragging?: boolean }) {
  const { canSee } = usePermissions();
  const pendingAcceleratorsMap = useContext(PendingAcceleratorsContext);
  const pendingTodosMap = useContext(PendingTodosContext);
  const { pinnedDealIds, togglePinDeal } = useContext(PinnedDealsContext);
  const { mutate: globalMutate } = useSWRConfig();
  const isPinned = pinnedDealIds.has(deal.id) || (pinnedDealIds.size === 0 && Boolean(deal.isPinned));

  const dealTodos = pendingTodosMap[deal.id] || [];
  const hasPriorityTodo = dealTodos.some(t => t.isPinned);

  const [isTodoPopoverOpen, setIsTodoPopoverOpen] = useState(false);
  const [todoPopoverPos, setTodoPopoverPos] = useState({ left: 0, top: 0 });
  const todoButtonRef = useRef<HTMLButtonElement>(null);
  const todoLeaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const updateTodoPopoverPosition = useCallback(() => {
    const rect = todoButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const popoverWidth = 270;
    const estimatedHeight = 180;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const top = spaceBelow >= estimatedHeight ? rect.bottom + 6 : Math.max(8, rect.top - estimatedHeight - 6);
    const left = Math.min(Math.max(8, rect.right - popoverWidth), window.innerWidth - popoverWidth - 8);
    setTodoPopoverPos({ left, top });
  }, []);

  const handleTodoMouseEnter = useCallback(() => {
    if (todoLeaveTimerRef.current) {
      clearTimeout(todoLeaveTimerRef.current);
      todoLeaveTimerRef.current = null;
    }
    updateTodoPopoverPosition();
    setIsTodoPopoverOpen(true);
  }, [updateTodoPopoverPosition]);

  const handleTodoMouseLeave = useCallback(() => {
    todoLeaveTimerRef.current = setTimeout(() => {
      setIsTodoPopoverOpen(false);
    }, 150);
  }, []);

  useEffect(() => {
    return () => {
      if (todoLeaveTimerRef.current) {
        clearTimeout(todoLeaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isTodoPopoverOpen) return;
    window.addEventListener('resize', updateTodoPopoverPosition);
    window.addEventListener('scroll', updateTodoPopoverPosition, true);
    return () => {
      window.removeEventListener('resize', updateTodoPopoverPosition);
      window.removeEventListener('scroll', updateTodoPopoverPosition, true);
    };
  }, [isTodoPopoverOpen, updateTodoPopoverPosition]);

  useEffect(() => {
    if (isDragging) {
      setIsTodoPopoverOpen(false);
    }
  }, [isDragging]);

  const [hotNote, setHotNote] = useState(deal.hotNote || '');
  const [isSavingHotNote, setIsSavingHotNote] = useState(false);
  const hotNoteDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const hotNoteMutationIdRef = useRef(0);

  useEffect(() => {
    setHotNote(deal.hotNote || '');
  }, [deal.hotNote]);

  const hasHotNote = Boolean((hotNote && hotNote.trim().length > 0) || (deal.hotNote && deal.hotNote.trim().length > 0));

  const handleTogglePin = useCallback(() => {
    togglePinDeal(deal.id);
  }, [deal.id, togglePinDeal]);

  const saveHotNote = useCallback(async (textToSave: string) => {
    const currentSaved = deal.hotNote || '';
    const trimmed = textToSave.trim();
    if (trimmed === currentSaved) return;

    const mutationId = ++hotNoteMutationIdRef.current;
    setIsSavingHotNote(true);
    void globalMutate(
      (key) => Array.isArray(key) && key[0] === 'pipeline-deals',
      (current: OpportunityWithRelations[] | undefined) => {
        if (!current) return current;
        return current.map(item => item.id === deal.id ? { ...item, hotNote: trimmed || null } : item);
      },
      false
    );

    try {
      await updateOpportunityHotNote(deal.id, trimmed || null);
    } catch (error) {
      console.error('Failed to save quick note:', error);
      if (mutationId === hotNoteMutationIdRef.current) {
        void globalMutate((key) => Array.isArray(key) && key[0] === 'pipeline-deals');
      }
    } finally {
      if (mutationId === hotNoteMutationIdRef.current) {
        setIsSavingHotNote(false);
      }
    }
  }, [deal.id, deal.hotNote, globalMutate]);

  const handleChangeHotNote = (val: string) => {
    setHotNote(val);
    if (hotNoteDebounceRef.current) {
      clearTimeout(hotNoteDebounceRef.current);
    }
    hotNoteDebounceRef.current = setTimeout(() => {
      void saveHotNote(val);
    }, 400);
  };

  const handleBlurHotNote = () => {
    if (hotNoteDebounceRef.current) {
      clearTimeout(hotNoteDebounceRef.current);
    }
    void saveHotNote(hotNote);
  };

  const {
    ownerFilter: contextOwnerFilter,
    onOwnerFilterChange: contextOnOwnerFilterChange,
    searchQuery: contextSearchQuery,
    onSearchChange: contextOnSearchChange,
  } = useContext(OwnerFilterContext);
  const activeOwnerFilter = currentOwnerFilter ?? contextOwnerFilter;
  const handleOwnerFilterChange = onFilterByOwner ?? contextOnOwnerFilterChange;
  const activeSearchQuery = searchQuery ?? contextSearchQuery;
  const handleSearchChange = onSearchChange ?? contextOnSearchChange;
  
  const canView = useCallback((tabKey: string) => canSee(`pipeline.${tabKey}`), [canSee]);
  const canViewInformation = canView('information');

  // Compute display values
  const isInternal = deal.type === 'INTERNAL_TASK';
  const customerName = isInternal 
    ? (deal.company?.displayName || deal.company?.name || null)
    : (deal.company?.displayName || deal.company?.name || "No Customer");
  const rawCompanyName = deal.company?.displayName || deal.company?.name;
  const isCompanyFiltered = Boolean(
    rawCompanyName &&
    activeSearchQuery &&
    activeSearchQuery.trim().toLowerCase() === rawCompanyName.trim().toLowerCase()
  );
  const contactName = deal.owner.name || deal.owner.email || "Unknown Contact";
  const targetOwnerId = deal.ownerId || deal.owner?.id;
  const isOwnerFiltered = Boolean(targetOwnerId && activeOwnerFilter === targetOwnerId);
  const pendingEntry = pendingAcceleratorsMap[deal.id];
  const pendingCount = typeof pendingEntry === 'number' ? pendingEntry : (pendingEntry?.count || 0);
  const isOrange = pendingCount > 0;
  const companyHolidays = useContext(CompanyHolidaysContext);
  const userLeavesByOwner = useContext(UserLeavesContext);
  const highlight = checkIsRedCard(deal, companyHolidays, userLeavesByOwner);

  const latestLog = useMemo(() => {
    return deal.activityLogs?.find(
      (log) =>
        log.type === 'COMMENT' &&
        !log.content.startsWith('[DUE DATE:') &&
        !log.content.startsWith('[URGENT_')
    );
  }, [deal.activityLogs]);

  const parsedLog = useMemo(() => {
    if (!latestLog?.content) return null;
    return parseLogContent(latestLog.content);
  }, [latestLog?.content]);
  
  const handlePrefetch = () => {
    onPanelIntent?.();
    if (!canView('activity')) return;
    void preload(
      ['activity-logs', deal.id, 'COMMENT', ''],
      async ([, id, typeFilter, cursor]: [string, string, string, string]) => {
        try {
          return await getOpportunityActivityLogs(
            id,
            10,
            cursor || undefined,
            typeFilter as 'COMMENT' | 'SYSTEM_UPDATE',
          );
        } catch (error) {
          // A card can remain briefly in the client cache after access changes.
          // Treat access loss during an optional hover prefetch as an empty result;
          // the server remains authoritative and the next board refresh removes it.
          if (error instanceof Error && error.message === 'Forbidden') {
            return { data: [], nextCursor: undefined };
          }
          throw error;
        }
      }
    ).catch((error: unknown) => {
      console.error('Failed to prefetch opportunity activity logs', error);
    });
    void preload(
      ['deal-accelerators', deal.id],
      () => getDealAccelerators(deal.id)
    ).catch((error: unknown) => {
      console.error('Failed to prefetch deal accelerators', error);
    });
  };

  return (
    <div
      id={`deal-card-${deal.id}`}
      data-deal-id={deal.id}
      style={{ outline: 'none' }}
      className={`
        flex flex-col gap-2 p-2.5 md:p-2 rounded-2xl md:rounded-[24px] relative overflow-visible group/card h-[220px] transition-all duration-150 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 select-none hover:z-30
        ${isOrange ? "bg-[#F59E0B]" : highlight ? "bg-[#C7F33C]" : "bg-[#3A3B3C]"}
        ${isDragging ? "opacity-30" : "cursor-pointer"}
        ${isSelected ? "md:ring-2 md:ring-white md:ring-offset-2 md:ring-offset-[#1C1C1D] md:shadow-2xl md:shadow-black/80 md:scale-[1.015] md:z-20" : ""}
      `}
      onClick={() => onOpenPanel?.('')}
      onMouseEnter={handlePrefetch}
    >
      {/* Quick Note Capsule Input */}
      <div 
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className={`absolute -top-3.5 left-1/2 -translate-x-1/2 z-40 transition-all duration-200 ${
          hasHotNote
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 group-hover/card:opacity-100 focus-within:opacity-100 pointer-events-none group-hover/card:pointer-events-auto focus-within:pointer-events-auto'
        }`}
      >
        <div 
          className="relative flex items-center shadow-md rounded-full"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            value={hotNote}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => handleChangeHotNote(e.target.value)}
            onBlur={handleBlurHotNote}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            placeholder="Quick Note"
            className="w-32 sm:w-44 h-7 px-3 text-xs font-semibold text-slate-800 bg-slate-100 rounded-full border border-[#3A3B3C] outline-none placeholder:text-slate-400 text-center cursor-text truncate focus:w-48 transition-all"
          />
          {isSavingHotNote && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
              <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
            </span>
          )}
        </div>
      </div>


      {/* Top row: Avatar, Name, Company, Arrow/Bell */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <div 
              onClick={(e) => { 
                e.stopPropagation(); 
                if (e.metaKey || e.ctrlKey) {
                  if (targetOwnerId && handleOwnerFilterChange) {
                    handleOwnerFilterChange(isOwnerFiltered ? 'ALL' : targetOwnerId);
                    return;
                  }
                }
                if (canView('collaborate')) onOpenPanel?.('collaborate'); 
              }}
              title={
                isOwnerFiltered
                  ? `${contactName} (⌘+Click to clear filter)`
                  : `${contactName} (⌘+Click to filter by owner)`
              }
              className={`w-12 h-12 rounded-full overflow-hidden flex items-center justify-center shrink-0 border-2 cursor-pointer hover:border-black/50 hover:border-solid transition-all relative ${
                isOwnerFiltered
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1C1C1D] border-white'
                  : isOrange
                  ? 'border-[#F59E0B]'
                  : highlight
                  ? 'border-[#C7F33C]'
                  : 'border-[#3A3B3C]'
              }`}
            >
              <img 
                src={deal.owner.image ? getOptimizedCloudinaryUrl(deal.owner.image, 100) : `https://api.dicebear.com/7.x/notionists/svg?seed=${deal.owner.name || deal.owner.email || "Unknown"}`} 
                alt={contactName}
                loading="lazy"
                decoding="async"
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
            <div className={`flex items-center gap-1.5 text-xs truncate ${isOrange ? 'text-slate-900 font-medium' : highlight ? 'text-slate-700' : 'text-slate-400'}`}>
              <span className="truncate">{contactName}</span>
              {deal.type === 'SALES_DEAL' && deal.value != null && deal.value > 0 && (
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0 tabular-nums ${
                  isOrange 
                    ? 'bg-black/20 text-slate-950 border border-black/10' 
                    : highlight 
                    ? 'bg-black/15 text-slate-900 border border-black/10' 
                    : 'bg-[#252728] text-[#C7F33C] border border-[#C7F33C]'
                }`}>
                  {formatDealCurrency(deal.value, deal.currency)}
                </span>
              )}
            </div>
          </div>
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
          if (!latestLog) {
            return (
              <div className="flex flex-col justify-center gap-1 mt-1">
                <p className={`text-xs font-medium italic ${highlight ? 'text-slate-600' : 'text-slate-500'}`}>No activity yet</p>
              </div>
            );
          }
          
          const cleanText = parsedLog?.cleanText || '';
          const images = parsedLog?.images || [];
          const otherFiles = parsedLog?.otherFiles || [];
          
          return (
            <div className="flex flex-col gap-2 mt-1 flex-1 overflow-hidden">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-start gap-2 px-2">
                  <div className={`w-5 h-5 rounded-full overflow-hidden shrink-0 flex items-center justify-center ${isOrange ? 'bg-black/25' : highlight ? 'bg-white/40' : 'bg-[#4E4F50]'}`}>
                    {latestLog.user?.image ? (
                      <img src={getOptimizedCloudinaryUrl(latestLog.user.image, 100)} alt={latestLog.user.name || ''} loading="lazy" decoding="async" className="w-full h-full object-cover" />
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
                            className={`${cleanText ? 'w-10 h-10' : 'w-12 h-12'} rounded-lg overflow-hidden border border-[#4E4F50]/60 bg-[#1C1C1D] shrink-0 relative flex items-center justify-center`}
                          >
                            {img.url === 'uploading...' ? (
                              <div className="w-full h-full flex items-center justify-center bg-[#252728]">
                                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                              </div>
                            ) : (
                              <img
                                src={
                                  img.url.startsWith('blob:') || img.url.startsWith('data:')
                                    ? img.url
                                    : getOptimizedCloudinaryUrl(img.url, 150)
                                }
                                alt={img.filename}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.onerror = null;
                                  e.currentTarget.src = "https://placehold.co/100x100/252728/4E4F50?text=IMG";
                                }}
                              />
                            )}
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

      {/* Bottom row: Customer Name & Quick Go */}
      <div className="flex justify-between items-end mt-auto gap-2">
        {customerName ? (
          <div 
            onClick={(e) => { 
              e.stopPropagation(); 
              if (e.metaKey || e.ctrlKey) {
                if (rawCompanyName && handleSearchChange) {
                  handleSearchChange(isCompanyFiltered ? '' : rawCompanyName);
                  return;
                }
              }
              if (canViewInformation && deal.type === 'SALES_DEAL') {
                onOpenPanel?.('information');
              } else if (canView('notes')) {
                onOpenPanel?.('notes');
              } else {
                onOpenPanel?.('activity');
              }
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center justify-center cursor-pointer transition-colors max-w-[130px] shrink-0
              ${isCompanyFiltered ? "ring-2 ring-white ring-offset-2 ring-offset-[#1C1C1D] border-white font-bold" : ""}
              ${isOrange ? "border-transparent bg-black/20 font-medium tracking-wide hover:bg-black/30 text-slate-900 font-semibold" : highlight ? "border-transparent bg-black/20 font-mono tracking-wide hover:bg-black/40 text-slate-700" : "bg-[#4E4F50] text-slate-100 hover:bg-slate-500"}
            `}
            title={
              rawCompanyName
                ? isCompanyFiltered
                  ? `${customerName} (⌘+Click to clear search)`
                  : `${customerName} (⌘+Click to search account)`
                : customerName
            }
          >
            <span className="truncate">{customerName}</span>
          </div>
        ) : (
          <div />
        )}

        {/* Quick Go Shortcut Buttons */}
        <div 
          className="flex items-center gap-0.5 ml-auto shrink-0 min-h-[28px]" 
          onClick={(e) => e.stopPropagation()}
        >
          {isOrange && (
            <div 
              onClick={(e) => {
                e.stopPropagation();
                onOpenPanel?.('manager-call');
              }}
              className="px-2.5 py-1 rounded-full bg-slate-950 text-amber-400 font-bold text-xs tracking-wide flex items-center gap-1 shadow-sm cursor-pointer hover:bg-slate-900 shrink-0 transition-all duration-150 animate-in fade-in"
              title="ดูและตอบ Manager Call"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0" />
              <span>Urgent ({pendingCount})</span>
            </div>
          )}

          {/* Star Pin Button (visible on hover, or always when pinned) */}
          <button
            type="button"
            aria-label={isPinned ? "Unpin deal" : "Pin deal to top"}
            title={isPinned ? "Unpin deal (currently pinned to top)" : "Pin deal to top of column"}
            onClick={(e) => {
              e.stopPropagation();
              void handleTogglePin();
            }}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
              isPinned
                ? 'opacity-100'
                : 'opacity-0 group-hover/card:opacity-100 pointer-events-none group-hover/card:pointer-events-auto'
            } ${
              isPinned
                ? isOrange
                  ? 'bg-slate-950 text-amber-400 shadow-sm'
                  : highlight
                  ? 'bg-black/25 text-amber-500 shadow-sm'
                  : 'bg-amber-400/20 text-amber-400 border border-amber-400/50 shadow-sm'
                : isOrange
                ? 'bg-black/20 text-slate-800 hover:bg-black/30 hover:text-slate-950'
                : highlight
                ? 'bg-black/15 text-slate-700 hover:bg-black/25 hover:text-slate-900'
                : 'bg-[#252728] text-slate-400 hover:bg-[#4E4F50] hover:text-amber-400'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${isPinned ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>

          {/* To-Do Shortcut Button (only when there are incomplete todos) */}
          {dealTodos.length > 0 ? (
            <button
              ref={todoButtonRef}
              type="button"
              aria-label={`View ${dealTodos.length} pending To-Do tasks`}
              title={`To-Do: ${dealTodos.length} pending tasks (Click to open)`}
              onClick={(e) => {
                e.stopPropagation();
                if (canView('notes')) onOpenPanel?.('notes');
              }}
              onMouseEnter={handleTodoMouseEnter}
              onMouseLeave={handleTodoMouseLeave}
              className={`h-7 px-2.5 rounded-full flex items-center gap-1 text-xs font-medium tracking-wide transition-all duration-150 animate-in fade-in ${
                isOrange
                  ? 'bg-black/20 text-slate-950 hover:bg-black/30'
                  : highlight
                  ? 'bg-black/15 text-slate-900 hover:bg-black/25'
                  : hasPriorityTodo
                  ? 'bg-amber-400/20 text-amber-400 border border-amber-400/40 hover:bg-amber-400/30'
                  : 'bg-[#252728] text-sky-400 hover:bg-[#4E4F50]'
              }`}
            >
              <ListTodo className="w-3.5 h-3.5 shrink-0" />
              <span className="font-mono">{dealTodos.length}</span>
            </button>
          ) : null}

          {/* Bell Due Date Button (only when Due Date is set) */}
          {deal.dueDate ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (canView('activity')) onOpenPanel?.('activity');
              }}
              title={`Due: ${new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(deal.dueDate))}`}
              className={`h-7 px-2.5 rounded-full flex items-center gap-1 text-xs font-medium tracking-wide transition-colors ${
                isOrange
                  ? 'bg-black/20 text-slate-950 hover:bg-black/30'
                  : highlight
                  ? 'bg-black/15 text-slate-900 hover:bg-black/25'
                  : 'bg-[#252728] text-[#C7F33C] hover:bg-[#4E4F50]'
              }`}
            >
              <BellRing className="w-3.5 h-3.5 shrink-0" />
              <span className="font-mono">{formatShortDueDate(deal.dueDate)}</span>
            </button>
          ) : null}


        </div>
      </div>

      {/* Portaled To-Do Hover Popover Modal */}
      {isTodoPopoverOpen && dealTodos.length > 0 && typeof document !== 'undefined' && createPortal(
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={handleTodoMouseEnter}
          onMouseLeave={handleTodoMouseLeave}
          style={{
            position: 'fixed',
            left: todoPopoverPos.left,
            top: todoPopoverPos.top,
            zIndex: 450,
            width: 270,
          }}
          className="rounded-xl border border-[#4E4F50] bg-[#252728] p-2 shadow-2xl text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-100 select-none cursor-default"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-1.5 pb-1.5 border-b border-[#3A3B3C] text-[11px] font-semibold text-slate-300">
            <div className="flex items-center gap-1.5">
              <ListTodo className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>To-Do List</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 bg-[#3A3B3C] px-1.5 py-0.5 rounded-full font-medium">
              {dealTodos.length} pending
            </span>
          </div>

          {/* Todo Items List */}
          <div className="custom-scrollbar max-h-56 overflow-y-auto pt-1.5 flex flex-col gap-1 pr-0.5">
            {dealTodos.map((todo) => (
              <div
                key={todo.id}
                className={`flex items-start gap-1.5 px-2 py-1.5 rounded-lg text-left transition-colors ${
                  todo.isPinned
                    ? 'bg-amber-500/15 border border-amber-500/30 text-amber-200'
                    : 'bg-[#1E1F20]/60 hover:bg-[#3A3B3C]/50 text-slate-200'
                }`}
              >
                {todo.isPinned ? (
                  <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                  </div>
                )}
                <span className="text-xs break-words line-clamp-3 leading-snug flex-1">
                  {todo.content}
                </span>
              </div>
            ))}
          </div>

          {/* Footer with Click Action Hint */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsTodoPopoverOpen(false);
              if (canView('notes')) onOpenPanel?.('notes');
            }}
            className="w-full mt-1.5 pt-1.5 border-t border-[#3A3B3C] text-[10px] text-center text-slate-400 hover:text-sky-300 transition-colors cursor-pointer"
          >
            Click to open To-Do tab ↗
          </button>
        </div>,
        document.body
      )}
    </div>
  );
});

export const KanbanCard = React.memo(function KanbanCard({ 
  deal, 
  isSelected,
  onOpenPanel, 
  onDealClick,
  onPanelIntent, 
  currentUserId, 
  currentUserRole,
  currentOwnerFilter,
  onFilterByOwner,
  searchQuery,
  onSearchChange,
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

  const handleOpenPanel = useCallback((tab: string) => {
    if (onOpenPanel) {
      onOpenPanel(tab);
    } else if (onDealClick) {
      onDealClick(deal, tab);
    }
  }, [onOpenPanel, onDealClick, deal]);

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
      className={`${isDragging ? 'touch-none' : 'touch-manipulation'} ${canDrag ? 'cursor-grab active:cursor-pointer' : ''} outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 relative hover:z-30 focus-within:z-30`}
    >
      <KanbanCardUI 
        deal={deal} 
        isDragging={isDragging} 
        isSelected={isSelected}
        onOpenPanel={handleOpenPanel} 
        onPanelIntent={onPanelIntent} 
        currentOwnerFilter={currentOwnerFilter}
        onFilterByOwner={onFilterByOwner}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
      />
    </div>
  );
});
