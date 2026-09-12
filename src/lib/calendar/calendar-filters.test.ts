import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarFilterCount, filterCalendarItems, groupCalendarSearchResults, parseCalendarFilters, writeCalendarFilters } from './calendar-filters';
import type { CalendarMonthItemDTO, CalendarSearchResultDTO } from './calendar-dto';

const base: CalendarMonthItemDTO = {
  id: 'event-1', sourceType: 'EVENT', sourceId: 'event-1', title: 'Review', startAt: '2026-09-12T03:00:00.000Z', endAt: '2026-09-12T04:00:00.000Z',
  allDay: false, color: null, tagIds: ['tag-1'], owner: { id: 'owner-1', name: 'One', image: null }, departmentId: 'dept-1', canEdit: true, revision: 1,
};

test('calendar filters round-trip through URL and count selected values', () => {
  const filters = { sources: ['EVENT'] as CalendarMonthItemDTO['sourceType'][], tagIds: ['tag-1'], ownerIds: ['owner-1'], departmentIds: [] };
  const params = writeCalendarFilters(new URLSearchParams('month=2026-09'), filters);
  const parsed = parseCalendarFilters(params);
  assert.deepEqual(parsed, filters);
  assert.equal(params.get('month'), '2026-09');
  assert.equal(calendarFilterCount(parsed), 3);
});

test('calendar filters only reduce the authorized month snapshot locally', () => {
  const other = { ...base, id: 'ready-1', sourceType: 'DEAL_GOODS_READY' as const, tagIds: [], owner: { ...base.owner, id: 'owner-2' } };
  const filtered = filterCalendarItems([base, other], { sources: ['EVENT'], tagIds: ['tag-1'], ownerIds: [], departmentIds: [] });
  assert.deepEqual(filtered.map((item) => item.id), ['event-1']);
});

test('search grouping preserves ordered dates and identifies today', () => {
  const today = new Date(2026, 8, 12, 12);
  const items = [
    { ...base, id: 'past', startAt: new Date(2026, 8, 11, 9).toISOString(), matchContext: null },
    { ...base, id: 'today', startAt: new Date(2026, 8, 12, 9).toISOString(), matchContext: null },
    { ...base, id: 'future', startAt: new Date(2026, 8, 13, 9).toISOString(), matchContext: null },
  ] as CalendarSearchResultDTO[];
  const groups = groupCalendarSearchResults(items, today);
  assert.deepEqual(groups.map((group) => group.items[0].id), ['past', 'today', 'future']);
  assert.equal(groups.filter((group) => group.isToday).length, 1);
});
