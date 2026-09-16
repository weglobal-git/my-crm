"use client";

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { PackageCheck, Truck, Calendar } from 'lucide-react';
import type { CalendarMonthItemDTO } from '@/lib/calendar/calendar-dto';
import { useDraggable } from '@dnd-kit/core';
import { getCalendarSourceLabel } from '@/lib/calendar/calendar-presentation';
import { preload } from 'swr';
import { calendarFinancialInfoKey, calendarEventDetailKey } from '@/lib/calendar/calendar-cache';
import { getCalendarFinancialInfoAction, getCalendarEventDetailAction } from '@/lib/actions/calendar';

const CalendarFinancialInfoPopover = dynamic(() => import('./CalendarFinancialInfoPopover').then((module) => module.CalendarFinancialInfoPopover), { ssr: false });

interface CalendarItemPillProps {
  item: CalendarMonthItemDTO;
  dragInstanceId: string;
  highlighted?: boolean;
  onClick?: (item: CalendarMonthItemDTO) => void;
  userId?: string;
}

export const CalendarItemPill: React.FC<CalendarItemPillProps> = memo(function CalendarItemPill({ item, dragInstanceId, highlighted = false, onClick, userId }: CalendarItemPillProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [financialAnchor, setFinancialAnchor] = useState<DOMRect | null>(null);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    // Multi-day items are rendered in more than one cell. Every mounted draggable
    // needs a unique id or dnd-kit can retain the wrong DOM node after a drag.
    id: `calendar-item:${item.id}:${dragInstanceId}`,
    data: { item },
    disabled: !item.canEdit,
  });
  const getStyleAndIcon = () => {
    switch (item.sourceType) {
      case 'DEAL_GOODS_READY':
        return {
          bg: 'bg-emerald-950/40 hover:bg-emerald-900/50',
          border: 'border-emerald-700/50',
          text: 'text-emerald-300',
          dot: 'bg-emerald-400',
          icon: <PackageCheck className="w-3 h-3 text-emerald-400 shrink-0" />,
        };
      case 'DEAL_GOODS_LOADING':
        return {
          bg: 'bg-sky-950/40 hover:bg-sky-900/50',
          border: 'border-sky-700/50',
          text: 'text-sky-300',
          dot: 'bg-sky-400',
          icon: <Truck className="w-3 h-3 text-sky-400 shrink-0" />,
        };
      case 'EVENT':
      default:
        return {
          bg: 'bg-[#4E4F50]/40 hover:bg-[#4E4F50]/70',
          border: 'border-[#4E4F50]',
          text: 'text-slate-200',
          dot: 'bg-[#C7F33C]',
          icon: <Calendar className="w-3 h-3 text-[#C7F33C] shrink-0" />,
        };
    }
  };

  const style = getStyleAndIcon();
  const isDeal = item.sourceType !== 'EVENT';
  const sourceLabel = getCalendarSourceLabel(item.sourceType);

  useEffect(() => {
    if (isDragging) setFinancialAnchor(null);
  }, [isDragging]);

  const setRefs = (node: HTMLButtonElement | null) => {
    buttonRef.current = node;
    setNodeRef(node);
  };

  const handleIntent = useCallback(() => {
    if (isDeal) {
      void import('./CalendarFinancialInfoPopover');
      void preload(
        calendarFinancialInfoKey(userId || 'default', item.sourceId),
        async () => {
          const res = await getCalendarFinancialInfoAction(item.sourceId);
          return res.data;
        }
      );
    } else {
      void import('./CalendarEventPanel');
      void preload(
        calendarEventDetailKey(userId || 'default', item.sourceId),
        async () => {
          const res = await getCalendarEventDetailAction(item.sourceId);
          return res.event;
        }
      );
    }
  }, [isDeal, item.sourceId, userId]);

  return (
    <>
      <button
      ref={setRefs}
      {...attributes}
      {...listeners}
      type="button"
      onMouseEnter={handleIntent}
      onFocus={handleIntent}
      onClick={(event) => {
        event.stopPropagation();
        if (isDragging) return;

        if (isDeal) {
          setFinancialAnchor((prev) => {
            if (prev) return null;
            return buttonRef.current ? buttonRef.current.getBoundingClientRect() : null;
          });
        } else {
          onClick?.(item);
        }
      }}
      title={`${item.title} (${item.allDay ? 'All-day' : new Date(item.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
      aria-label={`${sourceLabel}: ${item.title}${item.accountName ? `, ${item.accountName}` : ''}`}
      style={{ opacity: isDragging ? 0.25 : 1 }}
      className={`group w-full min-w-0 touch-none text-left px-2 py-0.5 rounded-md border text-xs font-medium flex items-start gap-1.5 transition-colors select-none ${highlighted ? 'border-[#C7F33C] bg-[#C7F33C]/15' : `${style.bg} ${style.border}`} ${item.canEdit ? 'cursor-pointer' : 'cursor-pointer'} ${style.text}`}
    >
      <span className="mt-0.5">{style.icon}</span>
      <span className="sr-only">{sourceLabel}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate leading-4">{item.title}</span>
        {isDeal && <span className="block truncate text-[10px] font-normal leading-3.5 text-slate-400">{item.accountName || 'No account'}</span>}
      </span>
      </button>
      {financialAnchor && (
        <CalendarFinancialInfoPopover
          opportunityId={item.sourceId}
          initialData={{
            opportunityId: item.sourceId,
            accountName: item.accountName || null,
            topicName: item.title,
            totalValue: null,
            currency: 'THB',
            reserveId: null,
            invoiceNumber: null,
            goodsReadyDate: item.sourceType === 'DEAL_GOODS_READY' ? item.startAt : null,
            goodsLoadingDate: item.sourceType === 'DEAL_GOODS_LOADING' ? item.startAt : null,
            status: 'OPEN',
            revision: 0,
            canEdit: Boolean(item.canEdit),
          }}
          userId={userId}
          anchorRect={financialAnchor}
          triggerRef={buttonRef}
          onClose={() => setFinancialAnchor(null)}
        />
      )}
    </>
  );
});
