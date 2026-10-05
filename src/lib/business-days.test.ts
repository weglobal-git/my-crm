import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isWeekend,
  isSunday,
  countElapsedBusinessDays,
  calculateElapsedWorkingMs,
  calculateElapsedBusinessMs,
  addWorkingMs,
  formatLtcDuration,
  RED_CARD_WORKING_MS_THRESHOLD,
} from './business-days';

test('isSunday and isWeekend accurately identify days', () => {
  const saturday = new Date('2026-10-03T10:00:00'); // Sat
  const sunday = new Date('2026-10-04T10:00:00'); // Sun
  const monday = new Date('2026-10-05T10:00:00'); // Mon

  assert.equal(isSunday(sunday), true);
  assert.equal(isSunday(saturday), false);
  assert.equal(isSunday(monday), false);

  assert.equal(isWeekend(saturday), true);
  assert.equal(isWeekend(sunday), true);
  assert.equal(isWeekend(monday), false);
});

test('calculateElapsedWorkingMs pauses overnight and on Sundays', () => {
  // Monday 16:30 to Tuesday 08:30:
  // Mon 16:30 to 17:00 = 30 minutes
  // Overnight 17:00 to 08:00 = 0
  // Tue 08:00 to 08:30 = 30 minutes
  // Total = 60 minutes = 3,600,000 ms
  const mon1630 = new Date('2026-10-05T16:30:00');
  const tue830 = new Date('2026-10-06T08:30:00');

  const elapsed = calculateElapsedWorkingMs(mon1630, tue830);
  assert.equal(elapsed, 60 * 60 * 1000);
});

test('calculateElapsedWorkingMs works on Saturdays unless set as Dayoff', () => {
  // Friday Oct 2, 2026 16:30 to Saturday Oct 3, 2026 09:00
  // Fri 16:30 to 17:00 = 30 min
  // Sat 08:00 to 09:00 = 60 min
  // Total = 90 minutes
  const fri1630 = new Date('2026-10-02T16:30:00');
  const sat09 = new Date('2026-10-03T09:00:00');

  // Case 1: Working Saturday
  const workingSatElapsed = calculateElapsedWorkingMs(fri1630, sat09);
  assert.equal(workingSatElapsed, 90 * 60 * 1000);

  // Case 2: Saturday marked as Dayoff
  const holidays = new Set(['2026-10-03']);
  const dayoffSatElapsed = calculateElapsedWorkingMs(fri1630, sat09, holidays);
  assert.equal(dayoffSatElapsed, 30 * 60 * 1000); // only Friday's 30 min
});

test('calculateElapsedWorkingMs pauses on Sundays', () => {
  // Saturday Oct 3, 2026 17:00 (Dayoff) through Monday Oct 5, 2026 09:00
  // Sat: 0 (Dayoff)
  // Sun: 0 (Sunday)
  // Mon: 08:00 to 09:00 = 60 minutes
  const sat1700 = new Date('2026-10-03T17:00:00');
  const mon0900 = new Date('2026-10-05T09:00:00');
  const holidays = new Set(['2026-10-03']);

  const elapsed = calculateElapsedWorkingMs(sat1700, mon0900, holidays);
  assert.equal(elapsed, 60 * 60 * 1000);
});

test('addWorkingMs correctly calculates 27 working hours threshold', () => {
  // Monday Oct 5, 2026 at 08:00
  // 3 working days = 27 working hours:
  // Mon: 08:00 to 17:00 = 9h
  // Tue: 08:00 to 17:00 = 9h
  // Wed: 08:00 to 17:00 = 9h
  // Exactly 27 hours completed at Wednesday Oct 7, 2026 at 17:00
  const mon08 = new Date('2026-10-05T08:00:00');
  const threshold = addWorkingMs(mon08, RED_CARD_WORKING_MS_THRESHOLD);

  assert.equal(threshold.getFullYear(), 2026);
  assert.equal(threshold.getMonth(), 9); // October
  assert.equal(threshold.getDate(), 7); // Wednesday 7th
  assert.equal(threshold.getHours(), 17);
  assert.equal(threshold.getMinutes(), 0);

  // And the elapsed working ms between mon08 and threshold is exactly 27 hours
  const elapsed = calculateElapsedWorkingMs(mon08, threshold);
  assert.equal(elapsed, RED_CARD_WORKING_MS_THRESHOLD);
});

test('formatLtcDuration formats days correctly', () => {
  assert.equal(formatLtcDuration(25), '25D');
  assert.equal(formatLtcDuration(102), '3M12D');
  assert.equal(formatLtcDuration(425), '1Y2M');
});
