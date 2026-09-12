import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns';
import type { CalendarMonthItemDTO } from './calendar-dto';

export const CALENDAR_EDGE_HOVER_DELAY_MS = 600;
export const CALENDAR_EDGE_HOVER_COOLDOWN_MS = 900;

export function getAdjacentCalendarMonth(year: number, month: number, offset: -1 | 1) {
  const target = new Date(year, month - 1 + offset, 1);
  return { year: target.getFullYear(), month: target.getMonth() + 1 };
}

export function getCalendarEdgeDirection(overId: string, now: number, cooldownUntil: number): -1 | 1 | null {
  if (now < cooldownUntil) return null;
  if (overId === 'calendar-nav:previous') return -1;
  if (overId === 'calendar-nav:next') return 1;
  return null;
}

export function moveCalendarItemToDate(item: CalendarMonthItemDTO, targetDate: Date) {
  const oldStart = new Date(item.startAt);
  const oldEnd = new Date(item.endAt);
  if (Number.isNaN(oldStart.getTime()) || Number.isNaN(oldEnd.getTime())) throw new Error('Invalid calendar item range');

  let startAt: Date;
  let endAt: Date;
  if (item.allDay) {
    const dayCount = Math.max(1, differenceInCalendarDays(startOfDay(oldEnd), startOfDay(oldStart)));
    startAt = startOfDay(targetDate);
    endAt = addDays(startAt, dayCount);
  } else {
    startAt = new Date(targetDate);
    startAt.setHours(oldStart.getHours(), oldStart.getMinutes(), oldStart.getSeconds(), oldStart.getMilliseconds());
    endAt = new Date(startAt.getTime() + Math.max(1, oldEnd.getTime() - oldStart.getTime()));
  }
  return { startAt: startAt.toISOString(), endAt: endAt.toISOString() };
}

export function isRecurringCalendarOccurrence(item: CalendarMonthItemDTO) {
  return item.sourceType === 'EVENT' && item.id !== item.sourceId;
}
