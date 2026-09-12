import { addDays } from 'date-fns';
import type { CalendarItemType, CalendarMonthItemDTO } from './calendar-dto';

export function getCalendarSourceLabel(sourceType: CalendarItemType): string {
  if (sourceType === 'DEAL_GOODS_READY') return 'Goods Ready';
  if (sourceType === 'DEAL_GOODS_LOADING') return 'Goods Loading';
  return 'Event';
}

export function indexCalendarItemsByLocalDate(items: CalendarMonthItemDTO[]): Map<string, CalendarMonthItemDTO[]> {
  const map = new Map<string, CalendarMonthItemDTO[]>();
  for (const item of items) {
    const start = new Date(item.startAt);
    const end = new Date(item.endAt);
    const dates: Date[] = [];
    if (item.sourceType === 'DEAL_GOODS_READY' || item.sourceType === 'DEAL_GOODS_LOADING') {
      // Opportunity Goods dates are date-only business milestones. Their DTO keeps
      // a one-day endAt for drag duration, but a stored timestamp may contain a
      // non-midnight time. Expanding against that exact end would incorrectly
      // paint the same milestone on the following calendar day.
      dates.push(start);
    } else if (item.allDay) {
      let current = new Date(start);
      current.setHours(0, 0, 0, 0);
      while (current < end && dates.length < 42) {
        dates.push(current);
        current = addDays(current, 1);
      }
    } else {
      dates.push(start);
    }
    for (const date of dates) {
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
  }
  return map;
}
