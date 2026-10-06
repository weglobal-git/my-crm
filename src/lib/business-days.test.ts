import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isWeekend,
  isSunday,
  calculateElapsedWorkingMs,
  addWorkingMs,
  formatLtcDuration,
  RED_CARD_WORKING_MS_THRESHOLD,
  toBangkokDateParts,
} from './business-days';

test('isSunday and isWeekend accurately identify days', () => {
  const saturday = new Date('2026-10-03T10:00:00+07:00'); // Sat
  const sunday = new Date('2026-10-04T10:00:00+07:00'); // Sun
  const monday = new Date('2026-10-05T10:00:00+07:00'); // Mon

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
  const mon1630 = new Date('2026-10-05T16:30:00+07:00');
  const tue830 = new Date('2026-10-06T08:30:00+07:00');

  const elapsed = calculateElapsedWorkingMs(mon1630, tue830);
  assert.equal(elapsed, 60 * 60 * 1000);
});

test('calculateElapsedWorkingMs works on Saturdays unless set as Dayoff', () => {
  // Friday Oct 2, 2026 16:30 to Saturday Oct 3, 2026 09:00
  // Fri 16:30 to 17:00 = 30 min
  // Sat 08:00 to 09:00 = 60 min
  // Total = 90 minutes
  const fri1630 = new Date('2026-10-02T16:30:00+07:00');
  const sat09 = new Date('2026-10-03T09:00:00+07:00');

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
  const sat1700 = new Date('2026-10-03T17:00:00+07:00');
  const mon0900 = new Date('2026-10-05T09:00:00+07:00');
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
  const mon08 = new Date('2026-10-05T08:00:00+07:00');
  const threshold = addWorkingMs(mon08, RED_CARD_WORKING_MS_THRESHOLD);
  const parts = toBangkokDateParts(threshold);

  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 9); // October
  assert.equal(parts.date, 7); // Wednesday 7th
  assert.equal(parts.hours, 17);
  assert.equal(parts.minutes, 0);

  // And the elapsed working ms between mon08 and threshold is exactly 27 hours
  const elapsed = calculateElapsedWorkingMs(mon08, threshold);
  assert.equal(elapsed, RED_CARD_WORKING_MS_THRESHOLD);
});

test('formatLtcDuration formats days correctly', () => {
  assert.equal(formatLtcDuration(25), '25D');
  assert.equal(formatLtcDuration(102), '3M12D');
  assert.equal(formatLtcDuration(425), '1Y2M');
});

test('2 consecutive off-days (Sat-Sun) adds single +9h fixed on next workday', () => {
  // Scenario: Card updated Friday at 12:00
  // Sat Oct 3 (Dayoff) + Sun Oct 4 (Sunday) = 2 consecutive off-days
  const fri12 = new Date('2026-10-02T12:00:00+07:00');
  const fri17 = new Date('2026-10-02T17:00:00+07:00');
  const sat14 = new Date('2026-10-03T14:00:00+07:00');
  const sun23 = new Date('2026-10-04T23:00:00+07:00');
  const mon0730 = new Date('2026-10-05T07:30:00+07:00');
  const mon0800 = new Date('2026-10-05T08:00:00+07:00');
  const mon1700 = new Date('2026-10-05T17:00:00+07:00');
  const tue1200 = new Date('2026-10-06T12:00:00+07:00');

  const holidays = new Set(['2026-10-03']); // Saturday Dayoff

  // 1. Friday 12:00 to 17:00 = 5 working hours
  assert.equal(calculateElapsedWorkingMs(fri12, fri17, holidays), 5 * 3600 * 1000);

  // 2. During weekend (Sat afternoon / Sun night / Mon early morning), penalty must NOT take effect yet
  assert.equal(calculateElapsedWorkingMs(fri12, sat14, holidays), 5 * 3600 * 1000);
  assert.equal(calculateElapsedWorkingMs(fri12, sun23, holidays), 5 * 3600 * 1000);
  assert.equal(calculateElapsedWorkingMs(fri12, mon0730, holidays), 5 * 3600 * 1000);

  // 3. At Monday 08:00 (workday opens), 2-day off streak completes -> +9h penalty applies!
  // Elapsed = 5h + 9h = 14 working hours
  assert.equal(calculateElapsedWorkingMs(fri12, mon0800, holidays), 14 * 3600 * 1000);

  // 4. At Monday 17:00, elapsed = 14h + 9h = 23 working hours (deal is still green/yellow, not red!)
  assert.equal(calculateElapsedWorkingMs(fri12, mon1700, holidays), 23 * 3600 * 1000);

  // 5. At Tuesday 12:00, elapsed = 23h + 4h = 27 working hours -> RED CARD threshold reached!
  assert.equal(calculateElapsedWorkingMs(fri12, tue1200, holidays), RED_CARD_WORKING_MS_THRESHOLD);

  // 6. Symmetrical verification: addWorkingMs(fri12, 27h) must return exactly Tuesday 12:00
  const thresholdDate = addWorkingMs(fri12, RED_CARD_WORKING_MS_THRESHOLD, holidays);
  const parts = toBangkokDateParts(thresholdDate);
  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 9); // October
  assert.equal(parts.date, 6); // Tuesday 6th
  assert.equal(parts.hours, 12);
  assert.equal(parts.minutes, 0);
});

test('3 to 5 consecutive off-days (e.g. Songkran) adds only a single +9h fixed block', () => {
  // Scenario: 5 consecutive off-days: Sat Oct 3, Sun Oct 4, Mon Oct 5, Tue Oct 6, Wed Oct 7
  // Deal updated Friday Oct 2 at 12:00
  const fri12 = new Date('2026-10-02T12:00:00+07:00');
  const thu0800 = new Date('2026-10-08T08:00:00+07:00');
  const thu1700 = new Date('2026-10-08T17:00:00+07:00');
  const fri1200NextWeek = new Date('2026-10-09T12:00:00+07:00');

  const songkranHolidays = new Set(['2026-10-03', '2026-10-05', '2026-10-06', '2026-10-07']);

  // On Thursday morning, despite 5 days of holiday, only a single +9h is added (not 18h or 27h)
  // Elapsed = 5h (Fri) + 9h (fixed penalty) = 14h
  assert.equal(calculateElapsedWorkingMs(fri12, thu0800, songkranHolidays), 14 * 3600 * 1000);

  // End of Thursday = 14h + 9h = 23h
  assert.equal(calculateElapsedWorkingMs(fri12, thu1700, songkranHolidays), 23 * 3600 * 1000);

  // Friday next week at 12:00 = 23h + 4h = 27h (RED CARD)
  assert.equal(calculateElapsedWorkingMs(fri12, fri1200NextWeek, songkranHolidays), RED_CARD_WORKING_MS_THRESHOLD);

  // Symmetric check with addWorkingMs
  const threshold = addWorkingMs(fri12, RED_CARD_WORKING_MS_THRESHOLD, songkranHolidays);
  const parts = toBangkokDateParts(threshold);
  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 9); // October
  assert.equal(parts.date, 9); // Friday Oct 9
  assert.equal(parts.hours, 12);
  assert.equal(parts.minutes, 0);
});

test('single off-day (< 2 days) does not add the 9h penalty', () => {
  // Tuesday 12:00 to Thursday 12:00, with ONLY Wednesday Oct 7 as holiday
  const tue12 = new Date('2026-10-06T12:00:00+07:00');
  const wed23 = new Date('2026-10-07T23:00:00+07:00');
  const thu0800 = new Date('2026-10-08T08:00:00+07:00');
  const thu1700 = new Date('2026-10-08T17:00:00+07:00');

  const singleHoliday = new Set(['2026-10-07']);

  // During Wednesday night: only Tuesday 5h
  assert.equal(calculateElapsedWorkingMs(tue12, wed23, singleHoliday), 5 * 3600 * 1000);

  // Thursday 08:00: streak was only 1 (< 2), so NO penalty added!
  assert.equal(calculateElapsedWorkingMs(tue12, thu0800, singleHoliday), 5 * 3600 * 1000);

  // Thursday 17:00: 5h + 9h = 14h
  assert.equal(calculateElapsedWorkingMs(tue12, thu1700, singleHoliday), 14 * 3600 * 1000);
});
