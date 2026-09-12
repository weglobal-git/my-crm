import type { CalendarItemType } from './calendar-dto';

export type CalendarDealDateSource = Exclude<CalendarItemType, 'EVENT'>;

export type CalendarDealDateField = 'goodsReadyDate' | 'goodsLoadingDate';

const fieldBySource: Record<CalendarDealDateSource, CalendarDealDateField> = {
  DEAL_GOODS_READY: 'goodsReadyDate',
  DEAL_GOODS_LOADING: 'goodsLoadingDate',
};

export function parseCalendarDealDateMutation(input: {
  sourceType: CalendarDealDateSource;
  value: string | null;
  reason?: string;
}) {
  const field = fieldBySource[input.sourceType];
  if (!field) throw new Error('Invalid deal date input');
  const value = input.value === null ? null : new Date(input.value);
  if (value && Number.isNaN(value.getTime())) throw new Error('Invalid date');
  return { field, value };
}

export function getDealDateAffectedRange(before: Date | null, after: Date | null) {
  const points = [before, after].filter((date): date is Date => Boolean(date));
  const startAt = points.length ? new Date(Math.min(...points.map((date) => date.getTime()))) : new Date(0);
  const endAt = points.length ? new Date(Math.max(...points.map((date) => date.getTime())) + 86_400_000) : startAt;
  return { startAt, endAt };
}
