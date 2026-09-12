import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { getDealDateAffectedRange, parseCalendarDealDateMutation } from './calendar-deal-date';

describe('Calendar deal date mutation contract', () => {
  test('maps each source to its canonical Opportunity field', () => {
    assert.equal(parseCalendarDealDateMutation({ sourceType: 'DEAL_GOODS_READY', value: null }).field, 'goodsReadyDate');
    assert.equal(parseCalendarDealDateMutation({ sourceType: 'DEAL_GOODS_LOADING', value: null }).field, 'goodsLoadingDate');
  });

  test('rejects invalid dates and covers both old and new months for realtime recovery', () => {
    assert.throws(() => parseCalendarDealDateMutation({ sourceType: 'DEAL_GOODS_READY', value: 'invalid' }), /Invalid date/);
    const range = getDealDateAffectedRange(new Date('2026-09-30T00:00:00.000Z'), new Date('2026-10-02T00:00:00.000Z'));
    assert.equal(range.startAt.toISOString(), '2026-09-30T00:00:00.000Z');
    assert.equal(range.endAt.toISOString(), '2026-10-03T00:00:00.000Z');
  });
});
