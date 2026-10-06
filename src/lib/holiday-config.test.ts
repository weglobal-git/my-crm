import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHolidayDates, parseUserLeaves, toggleHolidayDate, toggleUserLeave } from './holiday-config';

test('holiday config tolerates empty or malformed stored JSON', () => {
  assert.deepEqual(parseHolidayDates(null), []);
  assert.deepEqual(parseHolidayDates('{broken'), []);
  assert.deepEqual(parseUserLeaves('{}'), []);
});

test('holiday dates toggle deterministically and remain sorted', () => {
  assert.deepEqual(toggleHolidayDate(['2026-10-20'], '2026-10-06'), ['2026-10-06', '2026-10-20']);
  assert.deepEqual(toggleHolidayDate(['2026-10-06', '2026-10-20'], '2026-10-06'), ['2026-10-20']);
});

test('user leave toggle only changes the targeted user and date', () => {
  const leaves = [
    { userId: 'user-a', userName: 'A', dateStr: '2026-10-06' },
    { userId: 'user-b', userName: 'B', dateStr: '2026-10-06' },
  ];
  assert.deepEqual(toggleUserLeave(leaves, leaves[0]), [leaves[1]]);
  assert.deepEqual(
    toggleUserLeave(leaves, { userId: 'user-a', userName: 'A', dateStr: '2026-10-07' }),
    [...leaves, { userId: 'user-a', userName: 'A', dateStr: '2026-10-07' }],
  );
});
