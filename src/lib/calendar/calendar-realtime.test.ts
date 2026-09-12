import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarEventIntersectsRange,
  decideCalendarRealtimeEvent,
  filterCalendarAudienceCandidates,
  getCalendarEventAffectedRange,
  isCalendarRealtimeEvent,
  type CalendarRealtimeEvent,
} from './calendar-realtime';

function event(overrides: Partial<CalendarRealtimeEvent> = {}): CalendarRealtimeEvent {
  return {
    schemaVersion: 1,
    eventId: 'delivery-1',
    action: 'ITEM_UPDATED',
    itemId: 'event-1',
    sourceType: 'EVENT',
    revision: 2,
    affectedRange: { startAt: '2026-09-10T00:00:00.000Z', endAt: '2026-09-11T00:00:00.000Z' },
    ...overrides,
  };
}

describe('Calendar realtime event contract', () => {
  it('validates the minimal envelope and range intersection', () => {
    assert.equal(isCalendarRealtimeEvent(event()), true);
    assert.equal(isCalendarRealtimeEvent({ eventId: 'missing-contract' }), false);
    assert.equal(calendarEventIntersectsRange(event(), '2026-09-01T00:00:00.000Z', '2026-09-30T23:59:59.999Z'), true);
    assert.equal(calendarEventIntersectsRange(event(), '2026-10-01T00:00:00.000Z', '2026-10-31T23:59:59.999Z'), false);
  });

  it('deduplicates deliveries and rejects out-of-order revisions', () => {
    const seen = new Set<string>();
    const revisions = new Map<string, number>();
    const own = new Set<string>();
    assert.equal(decideCalendarRealtimeEvent(event(), seen, revisions, own), 'REVALIDATE');
    assert.equal(decideCalendarRealtimeEvent(event(), seen, revisions, own), 'IGNORE');
    assert.equal(decideCalendarRealtimeEvent(event({ eventId: 'delivery-old', revision: 1 }), seen, revisions, own), 'IGNORE');
  });

  it('suppresses own echo and maps deletes to item removal', () => {
    const seen = new Set<string>();
    const revisions = new Map<string, number>();
    const own = new Set(['mutation-own']);
    assert.equal(decideCalendarRealtimeEvent(event({ mutationId: 'mutation-own' }), seen, revisions, own), 'IGNORE');
    assert.equal(own.has('mutation-own'), false);
    assert.equal(decideCalendarRealtimeEvent(event({ eventId: 'delivery-delete', action: 'ITEM_DELETED', revision: 3 }), seen, revisions, own), 'REMOVE');
  });

  it('keeps only admins or candidates with Calendar menu access', () => {
    assert.deepEqual(filterCalendarAudienceCandidates([
      { id: 'admin', role: 'ADMIN', departments: [] },
      { id: 'allowed', role: 'GENERAL', departments: [{ permissions: [{ id: 'permission' }] }] },
      { id: 'blocked', role: 'MANAGEMENT', departments: [{ permissions: [] }] },
      { id: 'guest', role: 'GUEST', departments: [{ permissions: [{ id: 'permission' }] }] },
    ]), ['admin', 'allowed']);
  });

  it('covers future occurrences when invalidating recurring series', () => {
    const bounded = getCalendarEventAffectedRange({
      startAt: new Date('2026-01-01T09:00:00.000Z'), endAt: new Date('2026-01-01T10:00:00.000Z'),
      repeatFrequency: 'MONTHLY', repeatUntil: new Date('2026-12-01T09:00:00.000Z'),
    });
    assert.equal(bounded.endAt.toISOString(), '2026-12-01T10:00:00.000Z');
    const unbounded = getCalendarEventAffectedRange({ ...bounded, repeatFrequency: 'DAILY', repeatUntil: null });
    assert.equal(unbounded.endAt.getUTCFullYear(), 2100);
  });
});
