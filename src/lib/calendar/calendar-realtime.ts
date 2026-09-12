import type { CalendarItemType } from './calendar-dto';

export const CALENDAR_CHANNEL_EVENT = 'calendar-updated';

export type CalendarRealtimeAction =
  | 'ITEM_CREATED'
  | 'ITEM_UPDATED'
  | 'ITEM_DELETED'
  | 'PERMISSION_CHANGED';

export interface CalendarRealtimeEvent {
  schemaVersion: 1;
  eventId: string;
  action: CalendarRealtimeAction;
  itemId: string;
  sourceType: CalendarItemType;
  revision: number;
  mutationId?: string;
  affectedRange: { startAt: string; endAt: string };
}

export function isCalendarRealtimeEvent(value: unknown): value is CalendarRealtimeEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<CalendarRealtimeEvent>;
  return event.schemaVersion === 1 && typeof event.eventId === 'string' &&
    ['ITEM_CREATED', 'ITEM_UPDATED', 'ITEM_DELETED', 'PERMISSION_CHANGED'].includes(event.action || '') &&
    typeof event.itemId === 'string' && Number.isInteger(event.revision) && (event.revision ?? -1) >= 0 &&
    ['EVENT', 'DEAL_GOODS_READY', 'DEAL_GOODS_LOADING'].includes(event.sourceType || '') &&
    typeof event.affectedRange?.startAt === 'string' && Number.isFinite(Date.parse(event.affectedRange.startAt)) &&
    typeof event.affectedRange?.endAt === 'string' && Number.isFinite(Date.parse(event.affectedRange.endAt));
}

export function calendarEventIntersectsRange(
  event: CalendarRealtimeEvent,
  rangeStart: string,
  rangeEnd: string
): boolean {
  return Date.parse(event.affectedRange.startAt) <= Date.parse(rangeEnd) &&
    Date.parse(event.affectedRange.endAt) >= Date.parse(rangeStart);
}

export function getCalendarEventAffectedRange(event: {
  startAt: Date;
  endAt: Date;
  repeatFrequency: string;
  repeatUntil: Date | null;
}): { startAt: Date; endAt: Date } {
  if (event.repeatFrequency === 'NONE') return { startAt: event.startAt, endAt: event.endAt };
  const duration = Math.max(0, event.endAt.getTime() - event.startAt.getTime());
  return {
    startAt: event.startAt,
    endAt: event.repeatUntil
      ? new Date(event.repeatUntil.getTime() + duration)
      : new Date('2100-12-31T23:59:59.999Z'),
  };
}

export type CalendarRealtimeDecision = 'IGNORE' | 'REMOVE' | 'REVALIDATE';

export interface CalendarAudienceCandidate {
  id: string;
  role: string;
  departments: Array<{ permissions: Array<{ id: string }> }>;
}

export function filterCalendarAudienceCandidates(candidates: CalendarAudienceCandidate[]): string[] {
  return candidates
    .filter((user) => user.role === 'ADMIN' || (
      ['MANAGEMENT', 'GENERAL'].includes(user.role) &&
      user.departments.some((department) => department.permissions.length > 0)
    ))
    .map((user) => user.id);
}

export function decideCalendarRealtimeEvent(
  event: CalendarRealtimeEvent,
  seenEventIds: Set<string>,
  latestRevisions: Map<string, number>,
  ownMutationIds: Set<string>
): CalendarRealtimeDecision {
  if (seenEventIds.has(event.eventId)) return 'IGNORE';
  seenEventIds.add(event.eventId);
  if (seenEventIds.size > 500) {
    const oldest = seenEventIds.values().next().value;
    if (oldest) seenEventIds.delete(oldest);
  }

  const latestRevision = latestRevisions.get(event.itemId) ?? 0;
  if (event.revision < latestRevision) return 'IGNORE';
  latestRevisions.set(event.itemId, event.revision);

  if (event.mutationId && ownMutationIds.delete(event.mutationId)) return 'IGNORE';
  return event.action === 'ITEM_DELETED' ? 'REMOVE' : 'REVALIDATE';
}
