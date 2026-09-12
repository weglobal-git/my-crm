import type { CalendarItemType, CalendarMonthItemDTO, CalendarSearchResultDTO } from './calendar-dto';

export interface CalendarFilters {
  sources: CalendarItemType[];
  tagIds: string[];
  ownerIds: string[];
  departmentIds: string[];
}

export const EMPTY_CALENDAR_FILTERS: CalendarFilters = { sources: [], tagIds: [], ownerIds: [], departmentIds: [] };
const SOURCE_TYPES: CalendarItemType[] = ['EVENT', 'DEAL_GOODS_READY', 'DEAL_GOODS_LOADING'];

const split = (value: string | null) => value?.split(',').filter(Boolean) || [];

export function parseCalendarFilters(params: URLSearchParams): CalendarFilters {
  return {
    sources: split(params.get('sources')).filter((value): value is CalendarItemType => SOURCE_TYPES.includes(value as CalendarItemType)),
    tagIds: split(params.get('tags')),
    ownerIds: split(params.get('owners')),
    departmentIds: split(params.get('departments')),
  };
}

export function writeCalendarFilters(params: URLSearchParams, filters: CalendarFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  const entries: Array<[string, string[]]> = [['sources', filters.sources], ['tags', filters.tagIds], ['owners', filters.ownerIds], ['departments', filters.departmentIds]];
  for (const [key, values] of entries) {
    if (values.length) {
      next.set(key, [...values].sort().join(','));
    } else {
      next.delete(key);
    }
  }
  return next;
}

export function calendarFilterCount(filters: CalendarFilters): number {
  return filters.sources.length + filters.tagIds.length + filters.ownerIds.length + filters.departmentIds.length;
}

export function filterCalendarItems(items: CalendarMonthItemDTO[], filters: CalendarFilters): CalendarMonthItemDTO[] {
  return items.filter((item) =>
    (filters.sources.length === 0 || filters.sources.includes(item.sourceType)) &&
    (filters.tagIds.length === 0 || filters.tagIds.some((id) => item.tagIds.includes(id))) &&
    (filters.ownerIds.length === 0 || filters.ownerIds.includes(item.owner.id)) &&
    (filters.departmentIds.length === 0 || Boolean(item.departmentId && filters.departmentIds.includes(item.departmentId)))
  );
}

export interface CalendarSearchGroup { dateKey: string; label: string; items: CalendarSearchResultDTO[]; isToday: boolean }

export function groupCalendarSearchResults(items: CalendarSearchResultDTO[], now = new Date()): CalendarSearchGroup[] {
  const todayKey = localDateKey(now);
  const groups = new Map<string, CalendarSearchResultDTO[]>();
  for (const item of items) {
    const key = localDateKey(new Date(item.startAt));
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return [...groups.entries()].map(([dateKey, groupItems]) => {
    const date = new Date(`${dateKey}T12:00:00`);
    return {
      dateKey,
      label: new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(date).toUpperCase(),
      items: groupItems,
      isToday: dateKey === todayKey,
    };
  });
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
