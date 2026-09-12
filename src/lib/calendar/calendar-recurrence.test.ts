import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  expandEventOccurrences,
  getOccurrenceStartFromItemId,
  hasRecurrenceShapeChanged,
  getGridRangeForMonth,
  type CalendarEventMaster,
} from './calendar-recurrence';

describe('Calendar Recurrence Engine (Phase 0 Spike)', () => {
  describe('getGridRangeForMonth', () => {
    it('calculates standard 42-day grid range for September 2026 starting on Sunday', () => {
      // September 2026: Sep 1 is Tuesday, Sep 30 is Wednesday
      // Week starts on Sunday (weekStartsOn: 0)
      // Range should start on Sunday Aug 30, 2026
      // Range should end on Saturday Oct 3, 2026 (or Oct 10 if 6-week layout)
      const { rangeStart, rangeEnd } = getGridRangeForMonth(2026, 8, 0); // monthIndex 8 is September
      assert.equal(rangeStart.getFullYear(), 2026);
      assert.equal(rangeStart.getMonth(), 7); // August
      assert.equal(rangeStart.getDate(), 30); // Aug 30

      assert.equal(rangeEnd.getFullYear(), 2026);
      assert.equal(rangeEnd.getMonth(), 9); // October
      assert.equal(rangeEnd.getDate(), 3); // Oct 3
    });
  });

  describe('Non-recurring event (repeatFrequency: NONE)', () => {
    it('returns single occurrence if within query range', () => {
      const event: CalendarEventMaster = {
        id: 'event-1',
        name: 'Team Meeting',
        allDay: false,
        startAt: new Date('2026-09-15T09:00:00.000Z'),
        endAt: new Date('2026-09-15T10:00:00.000Z'),
        repeatFrequency: 'NONE',
      };

      const occurrences = expandEventOccurrences(event, {
        rangeStart: new Date('2026-09-01T00:00:00.000Z'),
        rangeEnd: new Date('2026-09-30T23:59:59.999Z'),
      });

      assert.equal(occurrences.length, 1);
      assert.equal(occurrences[0].occurrenceId, 'event:event-1:2026-09-15T09:00:00.000Z');
      assert.equal(occurrences[0].isException, false);
    });

    it('returns empty array if outside query range', () => {
      const event: CalendarEventMaster = {
        id: 'event-1',
        name: 'Future Meeting',
        allDay: false,
        startAt: new Date('2026-11-15T09:00:00.000Z'),
        endAt: new Date('2026-11-15T10:00:00.000Z'),
        repeatFrequency: 'NONE',
      };

      const occurrences = expandEventOccurrences(event, {
        rangeStart: new Date('2026-09-01T00:00:00.000Z'),
        rangeEnd: new Date('2026-09-30T23:59:59.999Z'),
      });

      assert.equal(occurrences.length, 0);
    });
  });

  describe('Daily recurrence (DAILY)', () => {
    it('expands daily occurrences across month boundary (Sep to Oct 2026)', () => {
      const event: CalendarEventMaster = {
        id: 'event-daily',
        name: 'Daily Standup',
        allDay: false,
        startAt: new Date('2026-09-28T02:00:00.000Z'),
        endAt: new Date('2026-09-28T02:30:00.000Z'),
        repeatFrequency: 'DAILY',
        repeatUntil: new Date('2026-10-02T02:00:00.000Z'),
      };

      const occurrences = expandEventOccurrences(event, {
        rangeStart: new Date('2026-09-25T00:00:00.000Z'),
        rangeEnd: new Date('2026-10-05T23:59:59.999Z'),
      });

      // Sep 28, 29, 30, Oct 1, Oct 2 = 5 occurrences
      assert.equal(occurrences.length, 5);
      const isoStarts = occurrences.map(o => o.startAt.toISOString().substring(0, 10));
      assert.deepEqual(isoStarts, [
        '2026-09-28',
        '2026-09-29',
        '2026-09-30',
        '2026-10-01',
        '2026-10-02',
      ]);
    });

    it('reaches a recent viewport for a series older than the safety cap', () => {
      const event: CalendarEventMaster = {
        id: 'event-old-daily',
        name: 'Long-running daily event',
        allDay: false,
        startAt: new Date('2020-01-01T02:00:00.000Z'),
        endAt: new Date('2020-01-01T02:30:00.000Z'),
        repeatFrequency: 'DAILY',
      };
      const occurrences = expandEventOccurrences(event, {
        rangeStart: new Date('2026-09-01T00:00:00.000Z'),
        rangeEnd: new Date('2026-09-03T23:59:59.999Z'),
        maxOccurrences: 10,
      });
      assert.deepEqual(occurrences.map((item) => item.startAt.toISOString().slice(0, 10)), [
        '2026-09-01', '2026-09-02', '2026-09-03',
      ]);
    });
  });

  describe('Weekly recurrence (WEEKLY)', () => {
    it('expands weekly occurrences across year boundary (Dec 2026 to Jan 2027)', () => {
      const event: CalendarEventMaster = {
        id: 'event-weekly',
        name: 'Weekly Review',
        allDay: false,
        startAt: new Date('2026-12-16T08:00:00.000Z'),
        endAt: new Date('2026-12-16T09:00:00.000Z'),
        repeatFrequency: 'WEEKLY',
      };

      const occurrences = expandEventOccurrences(event, {
        rangeStart: new Date('2026-12-01T00:00:00.000Z'),
        rangeEnd: new Date('2027-01-15T23:59:59.999Z'),
      });

      // Dec 16, Dec 23, Dec 30, Jan 6, Jan 13 = 5 occurrences
      assert.equal(occurrences.length, 5);
      const isoStarts = occurrences.map(o => o.startAt.toISOString().substring(0, 10));
      assert.deepEqual(isoStarts, [
        '2026-12-16',
        '2026-12-23',
        '2026-12-30',
        '2027-01-06',
        '2027-01-13',
      ]);
    });
  });

  describe('Monthly recurrence (MONTHLY) with Day 31 Rule', () => {
    it('skips months that do not have 31 days (does not clamp to 30 or 28)', () => {
      const event: CalendarEventMaster = {
        id: 'event-monthly-31',
        name: 'Month End Tax Filing',
        allDay: true,
        startAt: new Date('2026-01-31T00:00:00.000Z'),
        endAt: new Date('2026-02-01T00:00:00.000Z'), // 1-day all-day
        repeatFrequency: 'MONTHLY',
      };

      const occurrences = expandEventOccurrences(event, {
        rangeStart: new Date('2026-01-01T00:00:00.000Z'),
        rangeEnd: new Date('2026-12-31T23:59:59.999Z'),
      });

      // Months with 31 days in 2026:
      // Jan 31 (month 0)
      // Feb has 28 days -> SKIPPED
      // Mar 31 (month 2)
      // Apr has 30 days -> SKIPPED
      // May 31 (month 4)
      // Jun has 30 days -> SKIPPED
      // Jul 31 (month 6)
      // Aug 31 (month 7)
      // Sep has 30 days -> SKIPPED
      // Oct 31 (month 9)
      // Nov has 30 days -> SKIPPED
      // Dec 31 (month 11)
      // Total: 7 occurrences
      assert.equal(occurrences.length, 7);
      const months = occurrences.map(o => o.startAt.getUTCMonth());
      assert.deepEqual(months, [0, 2, 4, 6, 7, 9, 11]);

      // Verify every occurrence is on the 31st
      for (const occ of occurrences) {
        assert.equal(occ.startAt.getUTCDate(), 31);
      }
    });
  });

  describe('Yearly recurrence (YEARLY) with Leap Year Feb 29 Rule', () => {
    it('only occurs on leap years for Feb 29 (skips non-leap years 2025, 2026, 2027)', () => {
      const event: CalendarEventMaster = {
        id: 'event-leap',
        name: 'Leap Year Celebration',
        allDay: true,
        startAt: new Date('2024-02-29T00:00:00.000Z'),
        endAt: new Date('2024-03-01T00:00:00.000Z'),
        repeatFrequency: 'YEARLY',
      };

      const occurrences = expandEventOccurrences(event, {
        rangeStart: new Date('2024-01-01T00:00:00.000Z'),
        rangeEnd: new Date('2029-12-31T23:59:59.999Z'),
      });

      // In range 2024 - 2029:
      // 2024 is leap year -> occurrence
      // 2025 non-leap -> skip
      // 2026 non-leap -> skip
      // 2027 non-leap -> skip
      // 2028 is leap year -> occurrence
      // 2029 non-leap -> skip
      assert.equal(occurrences.length, 2);
      assert.equal(occurrences[0].startAt.getUTCFullYear(), 2024);
      assert.equal(occurrences[0].startAt.getUTCMonth(), 1); // Feb
      assert.equal(occurrences[0].startAt.getUTCDate(), 29);

      assert.equal(occurrences[1].startAt.getUTCFullYear(), 2028);
      assert.equal(occurrences[1].startAt.getUTCMonth(), 1); // Feb
      assert.equal(occurrences[1].startAt.getUTCDate(), 29);
    });
  });

  describe('Exceptions handling (CalendarEventException)', () => {
    it('cancels single occurrence when isCancelled is true', () => {
      const event: CalendarEventMaster = {
        id: 'event-daily',
        name: 'Daily Scrums',
        allDay: false,
        startAt: new Date('2026-09-01T03:00:00.000Z'),
        endAt: new Date('2026-09-01T03:30:00.000Z'),
        repeatFrequency: 'DAILY',
        repeatUntil: new Date('2026-09-05T03:00:00.000Z'),
        exceptions: [
          {
            eventId: 'event-daily',
            occurrenceStartAt: new Date('2026-09-03T03:00:00.000Z'),
            isCancelled: true,
          },
        ],
      };

      const occurrences = expandEventOccurrences(event, {
        rangeStart: new Date('2026-09-01T00:00:00.000Z'),
        rangeEnd: new Date('2026-09-05T23:59:59.999Z'),
      });

      // Sep 1, Sep 2, Sep 4, Sep 5 (Sep 3 cancelled) -> 4 occurrences
      assert.equal(occurrences.length, 4);
      const isoStarts = occurrences.map(o => o.startAt.toISOString().substring(0, 10));
      assert.deepEqual(isoStarts, ['2026-09-01', '2026-09-02', '2026-09-04', '2026-09-05']);
    });

    it('overrides start and end time for single occurrence', () => {
      const event: CalendarEventMaster = {
        id: 'event-weekly',
        name: 'Weekly Sync',
        allDay: false,
        startAt: new Date('2026-09-07T04:00:00.000Z'),
        endAt: new Date('2026-09-07T05:00:00.000Z'),
        repeatFrequency: 'WEEKLY',
        repeatUntil: new Date('2026-09-21T04:00:00.000Z'),
        exceptions: [
          {
            eventId: 'event-weekly',
            occurrenceStartAt: new Date('2026-09-14T04:00:00.000Z'),
            overrideStartAt: new Date('2026-09-15T06:00:00.000Z'), // Moved to next day at 06:00
            overrideEndAt: new Date('2026-09-15T07:00:00.000Z'),
            isCancelled: false,
          },
        ],
      };

      const occurrences = expandEventOccurrences(event, {
        rangeStart: new Date('2026-09-01T00:00:00.000Z'),
        rangeEnd: new Date('2026-09-30T23:59:59.999Z'),
      });

      assert.equal(occurrences.length, 3);
      assert.equal(occurrences[0].startAt.toISOString(), '2026-09-07T04:00:00.000Z');
      assert.equal(occurrences[0].isException, false);

      // Overridden occurrence
      assert.equal(occurrences[1].startAt.toISOString(), '2026-09-15T06:00:00.000Z');
      assert.equal(occurrences[1].isException, true);

      assert.equal(occurrences[2].startAt.toISOString(), '2026-09-21T04:00:00.000Z');
      assert.equal(occurrences[2].isException, false);
    });
  });

  describe('DST Timezone Safety Check', () => {
    it('maintains consistent UTC instants across DST transition (e.g. America/New_York March 2026)', () => {
      // US DST spring forward in 2026: Sunday March 8, 2026
      // Standard daily 1-hour meeting at 14:00 UTC (10:00 AM EDT / 9:00 AM EST)
      const event: CalendarEventMaster = {
        id: 'event-dst',
        name: 'Cross-timezone Daily Sync',
        allDay: false,
        startAt: new Date('2026-03-06T14:00:00.000Z'),
        endAt: new Date('2026-03-06T15:00:00.000Z'),
        repeatFrequency: 'DAILY',
        repeatUntil: new Date('2026-03-10T14:00:00.000Z'),
      };

      const occurrences = expandEventOccurrences(event, {
        rangeStart: new Date('2026-03-01T00:00:00.000Z'),
        rangeEnd: new Date('2026-03-15T23:59:59.999Z'),
      });

      assert.equal(occurrences.length, 5); // Mar 6, 7, 8, 9, 10
      for (const occ of occurrences) {
        assert.equal(occ.startAt.getUTCHours(), 14);
        assert.equal(occ.endAt.getUTCHours(), 15);
      }
    });
  });

  describe('Bounded expansion & safety cap', () => {
    it('caps expansion at maxOccurrences to prevent runaway loops', () => {
      const event: CalendarEventMaster = {
        id: 'event-infinite',
        name: 'Never Ending Daily',
        allDay: false,
        startAt: new Date('2020-01-01T00:00:00.000Z'),
        endAt: new Date('2020-01-01T01:00:00.000Z'),
        repeatFrequency: 'DAILY',
        // No repeatUntil (infinite series)
      };

      // Range is 5 years
      const occurrences = expandEventOccurrences(event, {
        rangeStart: new Date('2020-01-01T00:00:00.000Z'),
        rangeEnd: new Date('2025-12-31T23:59:59.999Z'),
        maxOccurrences: 50, // capped
      });

      assert.equal(occurrences.length, 50);
    });
  });

  describe('Stable occurrence identity', () => {
    it('extracts the original occurrence timestamp from normal and overridden item ids', () => {
      const iso = '2026-09-12T09:00:00.000Z';
      assert.equal(getOccurrenceStartFromItemId(`event:event-1:${iso}`, 'event-1'), iso);
      assert.equal(getOccurrenceStartFromItemId(`event:event-1:${iso}:override`, 'event-1'), iso);
      assert.equal(getOccurrenceStartFromItemId('event:other:invalid', 'event-1'), null);
    });

    it('invalidates exceptions only when recurrence timing or pattern changes', () => {
      const current = { startAt: new Date('2026-09-12T09:00:00Z'), endAt: new Date('2026-09-12T10:00:00Z'), allDay: false, timezone: 'Asia/Bangkok', repeatFrequency: 'WEEKLY' as const, repeatUntil: null };
      assert.equal(hasRecurrenceShapeChanged(current, { ...current }), false);
      assert.equal(hasRecurrenceShapeChanged(current, { ...current, repeatFrequency: 'MONTHLY' }), true);
      assert.equal(hasRecurrenceShapeChanged(current, { ...current, startAt: new Date('2026-09-13T09:00:00Z') }), true);
    });
  });
});
