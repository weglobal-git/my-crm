"use client";

import React, { memo, useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { CalendarMonthItemDTO } from '@/lib/calendar/calendar-dto';
import { CalendarItemPill } from './CalendarItemPill';
import { useDroppable } from '@dnd-kit/core';

const CalendarDayItemsPopover = dynamic(() => import('./CalendarDayItemsPopover').then((module) => module.CalendarDayItemsPopover), { ssr: false });

interface CalendarDayCellProps {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  items: CalendarMonthItemDTO[];
  maxVisibleItems?: number;
  onItemClick?: (item: CalendarMonthItemDTO) => void;
  onDayClick?: (date: Date) => void;
  highlightedItemId?: string | null;
  compact?: boolean;
  selected?: boolean;
}

export const CalendarDayCell: React.FC<CalendarDayCellProps> = memo(function CalendarDayCell({
  date,
  isCurrentMonth,
  isToday,
  items,
  onItemClick,
  onDayClick,
  highlightedItemId,
  compact = false,
  selected = false,
}: CalendarDayCellProps) {
  const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const { setNodeRef, isOver } = useDroppable({ id: `calendar-day:${dateKey}`, data: { date: date.toISOString() }, disabled: compact });
  const dayNumber = date.getDate();
  const [showAllItems, setShowAllItems] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [hasScrollbar, setHasScrollbar] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || items.length === 0) {
      setHasScrollbar(false);
      return;
    }

    const checkOverflow = () => {
      const isOverflowing = container.scrollHeight > container.clientHeight;
      setHasScrollbar((prev) => (prev !== isOverflowing ? isOverflowing : prev));
    };

    const rafId = requestAnimationFrame(checkOverflow);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        checkOverflow();
      });
      resizeObserver.observe(container);
      if (contentRef.current) {
        resizeObserver.observe(contentRef.current);
      }
    }

    return () => {
      cancelAnimationFrame(rafId);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [items]);

  if (compact) {
    const sourceColors = Array.from(new Set(items.map((item) => item.sourceType))).map((source) =>
      source === 'DEAL_GOODS_READY' ? 'bg-emerald-400' : source === 'DEAL_GOODS_LOADING' ? 'bg-sky-400' : 'bg-[#C7F33C]'
    );
    return <button ref={setNodeRef} type="button" onClick={() => onDayClick?.(date)} role="gridcell" aria-selected={selected}
      aria-label={`${new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' }).format(date)}, ${items.length} items`}
      className={`min-h-12 border-r border-b border-[#3A3B3C]/70 px-1 py-1.5 text-center focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#C7F33C] ${isCurrentMonth ? 'bg-[#2A2C2D]/60' : 'bg-[#222324]/80'} ${selected ? 'bg-[#3A3B3C]' : ''}`}>
      <span className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isToday ? 'bg-[#C7F33C] text-black' : isCurrentMonth ? 'text-slate-200' : 'text-slate-600'} ${selected && !isToday ? 'ring-1 ring-[#C7F33C]' : ''}`}>{dayNumber}</span>
      <span className="mt-1 flex h-1.5 items-center justify-center gap-0.5" aria-hidden="true">
        {sourceColors.slice(0, 3).map((color) => <span key={color} className={`h-1.5 w-1.5 rounded-full ${color}`} />)}
      </span>
    </button>;
  }

  return (
    <div
      ref={setNodeRef}
      onClick={() => onDayClick?.(date)}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
          event.preventDefault(); onDayClick?.(date);
        }
      }}
      role="gridcell"
      tabIndex={0}
      aria-label={`${new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(date)}, ${items.length} items${isToday ? ', today' : ''}`}
      className={`relative isolate min-h-[105px] h-full flex flex-col p-1.5 border-r border-b border-[#3A3B3C]/70 transition-colors select-none focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#C7F33C] ${
        isCurrentMonth ? 'bg-[#2A2C2D]/60 hover:bg-[#323435]/70' : 'bg-[#222324]/80 text-slate-600'
      }`}
    >
      {isOver && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-1 z-20 rounded-lg border-2 border-[#C7F33C] bg-[#C7F33C]/10"
        />
      )}

      {/* Day header */}
      <div className="relative z-10 flex items-center justify-between mb-1">
        <span
          className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold transition-colors ${
            isToday
              ? 'bg-[#C7F33C] text-black font-bold'
              : isCurrentMonth
              ? 'text-slate-300'
              : 'text-slate-600'
          }`}
        >
          {dayNumber}
        </span>

        {hasScrollbar && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAllItems(true);
            }}
            className="text-[10px] font-semibold text-slate-400 hover:text-[#C7F33C] hover:bg-[#3A3B3C]/60 px-1.5 py-0.5 rounded transition-colors"
            title={`View all ${items.length} items`}
          >
            {Math.max(1, items.length - 2)} more
          </button>
        )}
      </div>

      {/* Item pills container */}
      <div
        ref={containerRef}
        className="custom-scrollbar relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5"
      >
        <div ref={contentRef} className="flex flex-col gap-1 pb-1">
          {items.map((item) => (
            <CalendarItemPill
              key={item.id}
              item={item}
              dragInstanceId={dateKey}
              highlighted={item.id === highlightedItemId}
              onClick={(clickedItem) => onItemClick?.(clickedItem)}
            />
          ))}
        </div>
      </div>
      {showAllItems && (
        <CalendarDayItemsPopover
          date={date}
          items={items}
          onClose={() => setShowAllItems(false)}
          onItemClick={onItemClick}
        />
      )}
    </div>
  );
});
