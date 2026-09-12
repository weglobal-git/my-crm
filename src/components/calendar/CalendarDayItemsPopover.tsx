"use client";

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { CalendarMonthItemDTO } from '@/lib/calendar/calendar-dto';
import { CalendarItemPill } from './CalendarItemPill';
import { useCalendarDialog } from '@/lib/calendar/use-calendar-dialog';

interface CalendarDayItemsPopoverProps {
  date: Date;
  items: CalendarMonthItemDTO[];
  onClose: () => void;
  onItemClick?: (item: CalendarMonthItemDTO) => void;
}

export function CalendarDayItemsPopover({ date, items, onClose, onItemClick }: CalendarDayItemsPopoverProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  useCalendarDialog(true, sectionRef, onClose);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (sectionRef.current && sectionRef.current.contains(target)) {
        return;
      }
      // If clicking inside a child dialog/popover (such as financial info), don't close this popover
      if ((target as Element)?.closest?.('[role="dialog"]')) {
        return;
      }
      onClose();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const label = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(date);

  return createPortal(
    <div className="fixed inset-0 z-[240] pointer-events-none" aria-label={`All items for ${label}`}>
      <section ref={sectionRef} role="dialog" aria-modal="true" aria-labelledby="calendar-day-items-title" tabIndex={-1} onClick={(event) => event.stopPropagation()} className="calendar-dialog pointer-events-auto absolute left-1/2 top-1/2 flex max-h-[70vh] w-[min(300px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-[#4E4F50] bg-[#252728] animate-fade-in-up">
        <header className="flex items-center justify-between border-b border-[#3A3B3C] px-4 py-3">
          <div className="min-w-0 pr-2">
            <h2 id="calendar-day-items-title" className="text-sm font-semibold text-slate-100 truncate">{label}</h2>
            <p className="mt-0.5 text-xs text-slate-400 truncate">{items.length} items · drag to another day</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-[#4E4F50] hover:text-slate-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex flex-col gap-2 overflow-y-auto p-3">
          {items.map((item) => (
            <CalendarItemPill
              key={item.id}
              item={item}
              dragInstanceId={`popover-${dateKey}`}
              onClick={(selected) => { onClose(); onItemClick?.(selected); }}
            />
          ))}
        </div>
      </section>
    </div>,
    document.body,
  );
}
