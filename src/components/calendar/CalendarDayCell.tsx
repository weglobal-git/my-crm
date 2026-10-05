"use client";

import React, { memo, useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import type { CalendarMonthItemDTO } from '@/lib/calendar/calendar-dto';
import { CalendarItemPill } from './CalendarItemPill';
import { useDroppable } from '@dnd-kit/core';
import { Coffee, Check, UserCheck } from 'lucide-react';
import type { UserLeaveDTO } from '@/lib/actions/holiday';

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
  userId?: string;
  isCompanyHoliday?: boolean;
  onToggleHoliday?: (dateStr: string) => void;
  userLeaves?: UserLeaveDTO[];
  isCurrentUserOnLeave?: boolean;
  onToggleUserLeave?: (dateStr: string) => void;
  showDayoff?: boolean;
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
  userId,
  isCompanyHoliday = false,
  onToggleHoliday,
  userLeaves = [],
  isCurrentUserOnLeave = false,
  onToggleUserLeave,
  showDayoff = true,
}: CalendarDayCellProps) {
  const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const { setNodeRef, isOver } = useDroppable({ id: `calendar-day:${dateKey}`, data: { date: date.toISOString() }, disabled: compact });
  const dayNumber = date.getDate();
  const [showAllItems, setShowAllItems] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dayoffButtonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [hasScrollbar, setHasScrollbar] = useState(false);

  useLayoutEffect(() => {
    if (!isDropdownOpen) return;
    const updatePosition = () => {
      const rect = dayoffButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 220;
      const menuHeight = 116;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const top = spaceBelow >= menuHeight ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4);
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - menuWidth - 8);
      setDropdownPosition({ left, top });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent | PointerEvent) => {
      const target = e.target as Node;
      if (
        dayoffButtonRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setIsDropdownOpen(false);
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [isDropdownOpen]);

  const handleOpenDropdown = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isDropdownOpen && dayoffButtonRef.current) {
      const rect = dayoffButtonRef.current.getBoundingClientRect();
      const menuWidth = 220;
      const menuHeight = 116;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const top = spaceBelow >= menuHeight ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4);
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - menuWidth - 8);
      setDropdownPosition({ left, top });
    }
    setIsDropdownOpen((prev) => !prev);
  };

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
      <span className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isToday ? 'bg-[#C7F33C] text-black' : isCompanyHoliday ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40' : isCurrentMonth ? 'text-slate-200' : 'text-slate-600'} ${selected && !isToday ? 'ring-1 ring-[#C7F33C]' : ''}`}>{dayNumber}</span>
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
      className={`group/cell relative min-h-[105px] h-full flex flex-col p-1.5 border-r border-b border-[#3A3B3C]/70 transition-colors select-none focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#C7F33C] ${
        showDayoff && isCompanyHoliday
          ? 'bg-amber-950/20 border-amber-800/30'
          : isCurrentMonth
          ? 'bg-[#2E3033]'
          : 'bg-[#222324] text-slate-600'
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
        <div className="flex items-center gap-1.5">
          <span
            className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold transition-colors ${
              isToday
                ? 'bg-[#C7F33C] text-black font-bold'
                : (showDayoff && isCompanyHoliday)
                ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40 font-bold'
                : isCurrentMonth
                ? 'text-slate-300'
                : 'text-slate-600'
            }`}
          >
            {dayNumber}
          </span>

          {!compact && (onToggleHoliday || onToggleUserLeave) && (
            <div className="relative">
              <button
                ref={dayoffButtonRef}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={handleOpenDropdown}
                className={`p-1 rounded-full transition-all cursor-pointer ${
                  showDayoff && isCompanyHoliday
                    ? 'text-amber-400 bg-amber-400/20 ring-1 ring-amber-400/50 opacity-100'
                    : showDayoff && isCurrentUserOnLeave
                    ? 'text-[#C7F33C] bg-[#C7F33C]/20 ring-1 ring-[#C7F33C]/50 opacity-100'
                    : isDropdownOpen
                    ? 'text-amber-400 bg-[#3A3B3C] ring-1 ring-amber-400/50 opacity-100'
                    : 'text-slate-500 hover:text-amber-400 hover:bg-[#3A3B3C] opacity-25 hover:opacity-100 group-hover/cell:opacity-80'
                }`}
                title="Company Day-Off & Leave options"
                aria-label="Company Day-Off & Leave options"
              >
                <Coffee className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* User Leave Profile Icons right beside Dayoff */}
          {showDayoff && userLeaves && userLeaves.length > 0 && (
            <div className="flex items-center -space-x-1 ml-0.5">
              {userLeaves.slice(0, 2).map((leave) => (
                <div
                  key={leave.userId}
                  className={`w-4 h-4 rounded-full border border-[#4E4F50] bg-[#1E1F20] overflow-hidden flex items-center justify-center shrink-0 ${
                    leave.userId === userId ? 'ring-1 ring-[#C7F33C]' : ''
                  }`}
                  title={`On Leave: ${leave.userName}${leave.userId === userId ? ' (You)' : ''}`}
                >
                  {leave.userImage ? (
                    <img src={leave.userImage} alt={leave.userName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[8px] font-bold text-slate-200">
                      {(leave.userName?.[0] || 'U').toUpperCase()}
                    </span>
                  )}
                </div>
              ))}
              {userLeaves.length > 2 && (
                <span className="w-3.5 h-3.5 rounded-full bg-[#3A3B3C] text-[8px] font-bold text-slate-300 flex items-center justify-center">
                  +{userLeaves.length - 2}
                </span>
              )}
            </div>
          )}
        </div>

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
              userId={userId}
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
          userId={userId}
        />
      )}

      {/* Portaled Dayoff / Leave Dropdown */}
      {isDropdownOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: dropdownPosition.left,
            top: dropdownPosition.top,
            zIndex: 450,
            width: 210,
          }}
          className="rounded-xl border border-[#4E4F50] bg-[#252728] p-1.5 shadow-2xl text-xs text-slate-200"
        >
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-[#3A3B3C] mb-1">
            {new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(date)}
          </div>

          {/* Option 1: Company Day-Off */}
          {onToggleHoliday && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                onToggleHoliday(`${y}-${m}-${d}`);
                setIsDropdownOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-colors cursor-pointer text-left ${
                isCompanyHoliday
                  ? 'bg-amber-500/15 text-amber-300 font-semibold'
                  : 'hover:bg-[#3A3B3C] text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Coffee className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Company's Day-Off</span>
              </div>
              {isCompanyHoliday && <Check className="w-3.5 h-3.5 text-amber-400" />}
            </button>
          )}

          {/* Option 2: Take Leave (ลาหยุด) */}
          {onToggleUserLeave && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                onToggleUserLeave(`${y}-${m}-${d}`);
                setIsDropdownOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-colors cursor-pointer text-left mt-0.5 ${
                isCurrentUserOnLeave
                  ? 'bg-[#C7F33C]/15 text-[#C7F33C] font-semibold'
                  : 'hover:bg-[#3A3B3C] text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <UserCheck className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />
                <span>Take Leave (ลาหยุด)</span>
              </div>
              {isCurrentUserOnLeave && <Check className="w-3.5 h-3.5 text-[#C7F33C]" />}
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
});
