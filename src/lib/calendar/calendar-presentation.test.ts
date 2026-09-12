import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CalendarMonthItemDTO } from './calendar-dto';
import { getCalendarSourceLabel, indexCalendarItemsByLocalDate } from './calendar-presentation';

function item(id: string, startAt: string, endAt: string, allDay = false): CalendarMonthItemDTO {
  return { id, sourceId: id, sourceType: 'EVENT', title: id, startAt, endAt, allDay, color: '#fff', tagIds: [], owner: { id: 'u', name: 'U', image: null }, departmentId: 'd', canEdit: true, revision: 1 };
}

function dealItem(sourceType: 'DEAL_GOODS_READY' | 'DEAL_GOODS_LOADING'): CalendarMonthItemDTO {
  return {
    ...item('deal-1', '2026-09-12T08:30:00.000Z', '2026-09-13T08:30:00.000Z', true),
    sourceId: 'opportunity-1',
    sourceType,
  };
}

describe('calendar dense-month presentation', () => {
  it('indexes a dense fixture once into bounded day buckets', () => {
    const dense = Array.from({ length: 1_000 }, (_, index) => item(`e-${index}`, '2026-09-12T03:00:00.000Z', '2026-09-12T04:00:00.000Z'));
    const indexed = indexCalendarItemsByLocalDate(dense);
    assert.equal(indexed.size, 1);
    assert.equal([...indexed.values()][0].length, 1_000);
  });

  it('bounds malformed or very long all-day spans to the visible grid size', () => {
    const indexed = indexCalendarItemsByLocalDate([item('long', '2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z', true)]);
    assert.equal(indexed.size, 42);
  });

  it('renders each Goods date on exactly one day when its stored timestamp is not midnight', () => {
    for (const sourceType of ['DEAL_GOODS_READY', 'DEAL_GOODS_LOADING'] as const) {
      const indexed = indexCalendarItemsByLocalDate([dealItem(sourceType)]);
      assert.equal(indexed.size, 1);
      assert.equal([...indexed.values()][0].length, 1);
    }
  });

  it('exposes source meaning independently from color and icon', () => {
    assert.equal(getCalendarSourceLabel('EVENT'), 'Event');
    assert.equal(getCalendarSourceLabel('DEAL_GOODS_READY'), 'Goods Ready');
    assert.equal(getCalendarSourceLabel('DEAL_GOODS_LOADING'), 'Goods Loading');
  });
});
