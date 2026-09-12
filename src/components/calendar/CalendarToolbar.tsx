"use client";

import React from 'react';
import { ChevronLeft, ChevronRight, Filter, Plus, Search } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';

interface CalendarToolbarProps {
  currentYear: number;
  currentMonth: number; // 1-12
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  activeFilterCount?: number;
  onOpenFilters?: () => void;
  onNewEventClick?: () => void;
  onOpenSearch?: () => void;
  isDragging?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const CalendarToolbar: React.FC<CalendarToolbarProps> = ({
  currentYear,
  currentMonth,
  onPrevMonth,
  onNextMonth,
  onToday,
  activeFilterCount = 0,
  onOpenFilters,
  onNewEventClick,
  onOpenSearch,
  isDragging = false,
}) => {
  const { setNodeRef: setPrevDropRef, isOver: isPrevOver } = useDroppable({ id: 'calendar-nav:previous', disabled: !isDragging });
  const { setNodeRef: setNextDropRef, isOver: isNextOver } = useDroppable({ id: 'calendar-nav:next', disabled: !isDragging });
  const monthName = MONTH_NAMES[currentMonth - 1] || '';

  return (
    <div className="hidden items-center justify-between gap-4 py-1 md:flex shrink-0 select-none">
      {/* Left side: Navigation */}
      <div className="flex items-center justify-between gap-2 sm:justify-start sm:gap-3">
        <button
          type="button"
          onClick={onToday}
          className="px-3 py-1.5 rounded-xl border border-[#4E4F50] bg-[#3A3B3C] text-xs font-semibold text-slate-200 hover:bg-[#4E4F50] hover:text-white transition-colors cursor-pointer"
        >
          Today
        </button>

        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <button
            ref={setPrevDropRef}
            type="button"
            onClick={onPrevMonth}
            aria-label="Previous Month"
            className={`w-14 h-7 flex items-center justify-center rounded-xl border bg-[#3A3B3C] text-slate-300 hover:bg-[#4E4F50] hover:text-white transition-colors cursor-pointer ${isPrevOver ? 'border-[#C7F33C] bg-[#C7F33C]/10' : 'border-[#4E4F50]'}`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="min-w-32 flex-1 text-center text-base font-bold text-slate-100 tracking-tight sm:min-w-44 sm:text-lg">
            {monthName} {currentYear}
          </h1>
          <button
            ref={setNextDropRef}
            type="button"
            onClick={onNextMonth}
            aria-label="Next Month"
            className={`w-14 h-7 flex items-center justify-center rounded-xl border bg-[#3A3B3C] text-slate-300 hover:bg-[#4E4F50] hover:text-white transition-colors cursor-pointer ${isNextOver ? 'border-[#C7F33C] bg-[#C7F33C]/10' : 'border-[#4E4F50]'}`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </div>

      {/* Right side: Actions */}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onOpenSearch} aria-label="Search calendar" className="flex h-8 w-8 items-center justify-center rounded-full border border-[#4E4F50] bg-[#3A3B3C] text-slate-400 hover:bg-[#4E4F50] hover:text-white transition-colors">
          <Search className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onOpenFilters}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#4E4F50] bg-[#3A3B3C] text-xs font-medium text-slate-300 hover:bg-[#4E4F50] hover:text-white transition-colors cursor-pointer"
        >
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-[#C7F33C] text-black text-[10px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onNewEventClick}
          className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-[#C7F33C] text-black text-xs font-semibold hover:bg-[#b0d635] transition-colors cursor-pointer"
          title="Create a new event"
        >
          <Plus className="w-4 h-4" />
          <span>New event</span>
        </button>
      </div>
    </div>
  );
};
