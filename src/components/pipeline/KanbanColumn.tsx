"use client";

import { useEffect, useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Check, Loader2, Pencil, RotateCcw, X } from "lucide-react";
import { KanbanCard, OpportunityWithRelations, checkIsRedCard } from "./KanbanCard";
import { updatePipelineStageDepartmentTitle } from "@/lib/actions/pipeline-stage-title";
import { useDialog } from "@/providers/DialogProvider";

interface KanbanColumnProps {
  id: string;
  title: string;
  defaultTitle?: string;
  departmentId?: string;
  canEditTitle?: boolean;
  onTitleChanged?: (stageId: string, title: string | null) => void;
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
  defaultTitle = title,
  departmentId,
  canEditTitle = false,
  onTitleChanged,
  deals, 
  onDealClick, 
  hideTitle, 
  isScrollable, 
  currentUserId, 
  currentUserRole, 
  onDealIntent,
  selectedCardId,
}: KanbanColumnProps) {
  const { toast } = useDialog();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);

  useEffect(() => {
    if (!isEditingTitle) setDraftTitle(title);
  }, [isEditingTitle, title]);

  const saveTitle = async (value: string) => {
    if (!departmentId || isSavingTitle) return;
    const trimmed = value.trim();
    if (trimmed === title || (!trimmed && title === defaultTitle)) {
      setIsEditingTitle(false);
      setDraftTitle(title);
      return;
    }

    setIsSavingTitle(true);
    try {
      const result = await updatePipelineStageDepartmentTitle(id, departmentId, trimmed);
      onTitleChanged?.(id, result.title);
      setDraftTitle(result.title || defaultTitle);
      setIsEditingTitle(false);
      toast({
        title: result.title ? 'Column renamed' : 'Column title reset',
        description: result.title || defaultTitle,
        type: 'success',
      });
    } catch (error) {
      toast({
        title: 'Unable to rename column',
        description: error instanceof Error ? error.message : 'Please try again.',
        type: 'error',
      });
    } finally {
      setIsSavingTitle(false);
    }
  };

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
          <div className="group/title flex items-center gap-1.5 min-w-0 flex-1">
            {isEditingTitle ? (
              <div className="flex items-center gap-1 min-w-0 flex-1">
                <input
                  autoFocus
                  value={draftTitle}
                  maxLength={80}
                  disabled={isSavingTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void saveTitle(draftTitle);
                    if (event.key === 'Escape') {
                      setDraftTitle(title);
                      setIsEditingTitle(false);
                    }
                  }}
                  className="h-8 min-w-0 flex-1 rounded-lg bg-[#3A3B3C] border border-[#C7F33C] px-2 text-sm font-semibold text-slate-100 focus:outline-none disabled:opacity-60"
                  aria-label={`Rename ${defaultTitle} column`}
                />
                <button
                  type="button"
                  onClick={() => void saveTitle(draftTitle)}
                  disabled={isSavingTitle}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[#C7F33C] hover:bg-[#3A3B3C] disabled:opacity-50 cursor-pointer"
                  aria-label="Save column title"
                >
                  {isSavingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraftTitle(title);
                    setIsEditingTitle(false);
                  }}
                  disabled={isSavingTitle}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-[#3A3B3C] disabled:opacity-50 cursor-pointer"
                  aria-label="Cancel renaming column"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <h3 className="font-semibold text-base md:text-lg text-slate-100 truncate">{title}</h3>
                {canEditTitle && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsEditingTitle(true)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-[#3A3B3C] opacity-0 group-hover/title:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                      aria-label={`Rename ${title} column`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {title !== defaultTitle && (
                      <button
                        type="button"
                        onClick={() => void saveTitle('')}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-[#3A3B3C] opacity-0 group-hover/title:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                        aria-label={`Reset column title to ${defaultTitle}`}
                        title={`Reset to ${defaultTitle}`}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </>
                )}
              </>
            )}
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
