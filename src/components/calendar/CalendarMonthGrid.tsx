"use client";

import React, { useMemo } from 'react';
import { addDays } from 'date-fns';
import type { CalendarMonthItemDTO } from '@/lib/calendar/calendar-dto';
import { CalendarDayCell } from './CalendarDayCell';
import { indexCalendarItemsByLocalDate } from '@/lib/calendar/calendar-presentation';

interface CalendarMonthGridProps {
  rangeStart: Date;
  rangeEnd: Date;
  currentYear: number;
  currentMonth: number; // 1-12
  items: CalendarMonthItemDTO[];
  onItemClick?: (item: CalendarMonthItemDTO) => void;
  onDayClick?: (date: Date) => void;
  highlightedItemId?: string | null;
  compact?: boolean;
  selectedDateKey?: string | null;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const CalendarMonthGrid: React.FC<CalendarMonthGridProps> = ({
  rangeStart,
  rangeEnd,
  currentYear,
  currentMonth,
  items,
  onItemClick,
  onDayClick,
  highlightedItemId,
  compact = false,
  selectedDateKey = null,
}) => {
  // Generate all 35 or 42 day cells between rangeStart and rangeEnd
  const days = useMemo(() => {
    const list: Date[] = [];
    let cur = new Date(rangeStart);
    // Normalize to start of day
    cur.setHours(0, 0, 0, 0);

    const end = new Date(rangeEnd);
    end.setHours(23, 59, 59, 999);

    while (cur <= end && list.length < 42) {
      list.push(new Date(cur));
      cur = addDays(cur, 1);
    }
    return list;
  }, [rangeStart, rangeEnd]);

  // Today's date string for comparison
  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  }, []);

  // Pre-index items by local date string for O(1) cell lookup
  const itemsByDateKey = useMemo(() => indexCalendarItemsByLocalDate(items), [items]);

  return (
    <div className={`${compact ? 'shrink-0' : 'flex-1 min-h-0'} flex flex-col border border-[#3A3B3C] rounded-2xl overflow-hidden bg-[#252728]`} role="grid" aria-label={`${currentYear}-${String(currentMonth).padStart(2, '0')} calendar`}>
      {/* 7-column weekday headers */}
      <div className="grid grid-cols-7 border-b border-[#3A3B3C] bg-[#2E3031]/80 shrink-0" role="row">
        {WEEKDAY_NAMES.map((name, index) => (
          <div
            key={name}
            role="columnheader"
            className={`py-2 text-center text-xs font-semibold select-none ${
              index === 0 || index === 6 ? 'text-slate-400' : 'text-slate-300'
            }`}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Grid of days */}
      <div className={`${compact ? 'grid-rows-6' : 'flex-1 min-h-0 auto-rows-fr'} grid grid-cols-7`} role="rowgroup">
        {days.map((date) => {
          const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
          const isCurrentMonth = date.getMonth() === currentMonth - 1 && date.getFullYear() === currentYear;
          const isToday = dateKey === todayStr;
          const cellItems = itemsByDateKey.get(dateKey) ?? [];

          return (
            <CalendarDayCell
              key={dateKey}
              date={date}
              isCurrentMonth={isCurrentMonth}
              isToday={isToday}
              items={cellItems}
              onItemClick={onItemClick}
              onDayClick={onDayClick}
              highlightedItemId={highlightedItemId}
              compact={compact}
              selected={selectedDateKey === dateKey}
            />
          );
        })}
      </div>
    </div>
  );
};
