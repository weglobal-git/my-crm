import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { getAdjacentCalendarMonth, getCalendarEdgeDirection, moveCalendarItemToDate } from './calendar-move';
import type { CalendarMonthItemDTO } from './calendar-dto';

const base: CalendarMonthItemDTO = {
  id: 'event-1', sourceId: 'event-1', sourceType: 'EVENT', title: 'Test',
  startAt: '2026-09-30T03:30:00.000Z', endAt: '2026-09-30T05:00:00.000Z', allDay: false,
  color: null, tagIds: [], owner: { id: 'u1', name: 'User', image: null }, departmentId: 'd1', canEdit: true, revision: 1,
};

describe('Calendar move operation', () => {
  test('preserves local start time and timed duration across a month boundary', () => {
    const moved = moveCalendarItemToDate(base, new Date(2026, 9, 2));
    assert.equal(new Date(moved.startAt).getHours(), new Date(base.startAt).getHours());
    assert.equal(Date.parse(moved.endAt) - Date.parse(moved.startAt), 90 * 60 * 1000);
    assert.equal(new Date(moved.startAt).getMonth(), 9);
  });

  test('preserves the calendar-day span of an all-day multi-day item', () => {
    const moved = moveCalendarItemToDate({ ...base, allDay: true, startAt: '2026-09-29T00:00:00.000Z', endAt: '2026-10-02T00:00:00.000Z' }, new Date(2026, 11, 31));
    assert.equal(differenceInDays(moved.startAt, moved.endAt), 3);
  });

  test('navigates year boundaries once and respects the edge-hover cooldown clock', () => {
    assert.deepEqual(getAdjacentCalendarMonth(2026, 12, 1), { year: 2027, month: 1 });
    assert.deepEqual(getAdjacentCalendarMonth(2026, 1, -1), { year: 2025, month: 12 });
    assert.equal(getCalendarEdgeDirection('calendar-nav:next', 1_000, 0), 1);
    assert.equal(getCalendarEdgeDirection('calendar-nav:next', 1_100, 1_900), null);
    assert.equal(getCalendarEdgeDirection('calendar-day:2026-09-11', 2_000, 0), null);
  });

  test('keeps all-day span across a DST boundary without assuming 24-hour days', () => {
    const priorTimezone = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      const start = new Date(2026, 2, 7);
      const end = new Date(2026, 2, 10);
      const moved = moveCalendarItemToDate({ ...base, allDay: true, startAt: start.toISOString(), endAt: end.toISOString() }, new Date(2026, 2, 14));
      assert.equal(differenceInDays(moved.startAt, moved.endAt), 3);
    } finally {
      process.env.TZ = priorTimezone;
    }
  });
});

function differenceInDays(start: string, end: string) {
  const left = new Date(start); left.setHours(0, 0, 0, 0);
  const right = new Date(end); right.setHours(0, 0, 0, 0);
  return Math.round((right.getTime() - left.getTime()) / 86_400_000);
}
