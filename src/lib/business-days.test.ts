import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isWeekend,
  isSunday,
  calculateElapsedWorkingMs,
  addWorkingMs,
  formatLtcDuration,
  isPostHolidayCheckInDay,
  resolveTimelineDueDate,
  MAX_DUE_DATE_HORIZON_DAYS,
  MAX_LONG_LEAD_DUE_DATE_HORIZON_DAYS,
  MIN_LONG_LEAD_DUE_DATE_REASON_LENGTH,
  RED_CARD_WORKING_MS_THRESHOLD,
  toBangkokDateParts,
} from './business-days';

test('Due Date horizon constants support 45-day standard cycles and 180-day long-lead milestones', () => {
  assert.equal(MAX_DUE_DATE_HORIZON_DAYS, 45);
  assert.equal(MAX_LONG_LEAD_DUE_DATE_HORIZON_DAYS, 180);
  assert.equal(MIN_LONG_LEAD_DUE_DATE_REASON_LENGTH, 20);
});

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

test('2 consecutive off-days (Sat-Sun weekend) is 100% auto-paused with 0h penalty', () => {
  // Scenario: Card updated Friday at 12:00
  // Sat Oct 3 (Dayoff) + Sun Oct 4 (Sunday) = 2 consecutive off-days (< 3 days)
  const fri12 = new Date('2026-10-02T12:00:00+07:00');
  const fri17 = new Date('2026-10-02T17:00:00+07:00');
  const sat14 = new Date('2026-10-03T14:00:00+07:00');
  const sun23 = new Date('2026-10-04T23:00:00+07:00');
  const mon0800 = new Date('2026-10-05T08:00:00+07:00');
  const mon1700 = new Date('2026-10-05T17:00:00+07:00');
  const tue1700 = new Date('2026-10-06T17:00:00+07:00');
  const wed1200 = new Date('2026-10-07T12:00:00+07:00');

  const holidays = new Set(['2026-10-03']); // Saturday Dayoff

  // 1. Friday 12:00 to 17:00 = 5 working hours
  assert.equal(calculateElapsedWorkingMs(fri12, fri17, holidays), 5 * 3600 * 1000);

  // 2. Across normal Sat-Sun weekend and Monday 08:00 open: ZERO penalty!
  assert.equal(calculateElapsedWorkingMs(fri12, sat14, holidays), 5 * 3600 * 1000);
  assert.equal(calculateElapsedWorkingMs(fri12, sun23, holidays), 5 * 3600 * 1000);
  assert.equal(calculateElapsedWorkingMs(fri12, mon0800, holidays), 5 * 3600 * 1000);
  assert.equal(isPostHolidayCheckInDay(fri12, mon0800, holidays), false);

  // 3. Monday 17:00 = 5h + 9h = 14h; Tuesday 17:00 = 14h + 9h = 23h; Wednesday 12:00 = 27h!
  assert.equal(calculateElapsedWorkingMs(fri12, mon1700, holidays), 14 * 3600 * 1000);
  assert.equal(calculateElapsedWorkingMs(fri12, tue1700, holidays), 23 * 3600 * 1000);
  assert.equal(calculateElapsedWorkingMs(fri12, wed1200, holidays), RED_CARD_WORKING_MS_THRESHOLD);

  // 4. Symmetrical verification: addWorkingMs(fri12, 27h) returns Wednesday Oct 7 at 12:00
  const thresholdDate = addWorkingMs(fri12, RED_CARD_WORKING_MS_THRESHOLD, holidays);
  const parts = toBangkokDateParts(thresholdDate);
  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 9); // October
  assert.equal(parts.date, 7); // Wednesday 7th
  assert.equal(parts.hours, 12);
  assert.equal(parts.minutes, 0);
});

test('>= 3 consecutive company off-days (e.g. Songkran) applies Post-Holiday Check-In Cap (clamps remaining window to <= 9h on return day)', () => {
  // Scenario: 5 consecutive off-days: Sat Oct 3, Sun Oct 4, Mon Oct 5, Tue Oct 6, Wed Oct 7
  // Deal updated Friday Oct 2 at 12:00 (only 5h elapsed before break, 22h remaining)
  const fri12 = new Date('2026-10-02T12:00:00+07:00');
  const wed23 = new Date('2026-10-07T23:00:00+07:00');
  const thu0800 = new Date('2026-10-08T08:00:00+07:00');
  const thu1400 = new Date('2026-10-08T14:00:00+07:00');
  const thu1700 = new Date('2026-10-08T17:00:00+07:00');

  const songkranHolidays = new Set(['2026-10-03', '2026-10-05', '2026-10-06', '2026-10-07']);

  // During the break, timer remains paused at 5h
  assert.equal(calculateElapsedWorkingMs(fri12, wed23, songkranHolidays), 5 * 3600 * 1000);

  // At Thursday 08:00 (first workday back), remaining window clamps to 9h (elapsed = 27h - 9h = 18h).
  // Card is NEVER Red at 08:00 AM! It shows Post-Holiday Check-In until 17:00.
  assert.equal(calculateElapsedWorkingMs(fri12, thu0800, songkranHolidays), 18 * 3600 * 1000);
  assert.equal(isPostHolidayCheckInDay(fri12, thu0800, songkranHolidays), true);
  assert.equal(isPostHolidayCheckInDay(fri12, thu1400, songkranHolidays), true);

  // At Thursday 17:00, if still not checked in, elapsed reaches 18h + 9h = 27h (Red Card)
  assert.equal(calculateElapsedWorkingMs(fri12, thu1700, songkranHolidays), RED_CARD_WORKING_MS_THRESHOLD);
  assert.equal(isPostHolidayCheckInDay(fri12, thu1700, songkranHolidays), false);

  // Symmetric check with addWorkingMs: threshold is Thursday Oct 8 at 17:00
  const threshold = addWorkingMs(fri12, RED_CARD_WORKING_MS_THRESHOLD, songkranHolidays);
  const parts = toBangkokDateParts(threshold);
  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 9); // October
  assert.equal(parts.date, 8); // Thursday Oct 8
  assert.equal(parts.hours, 17);
  assert.equal(parts.minutes, 0);
});

test('personal leaves (>= 3 days) pause 100% cleanly without triggering company Post-Holiday Check-In Cap', () => {
  const tue12 = new Date('2026-10-06T12:00:00+07:00');
  const sat0800 = new Date('2026-10-10T08:00:00+07:00');
  const personalLeaves = new Set(['2026-10-07', '2026-10-08', '2026-10-09']); // Wed, Thu, Fri leave

  // Only Tuesday's 5h elapsed; personal leave does not shrink remaining window on Saturday return
  assert.equal(
    calculateElapsedWorkingMs(tue12, sat0800, new Set(), { personalLeaves }),
    5 * 3600 * 1000
  );
  assert.equal(isPostHolidayCheckInDay(tue12, sat0800, new Set(), personalLeaves), false);
});

test('resolveTimelineDueDate: [TIER:0H] note does NOT fulfill an active Due Date', () => {
  const logs = [
    {
      content: '[DUE DATE: 10 Oct 2026]',
      type: 'COMMENT',
      createdAt: '2026-10-05T10:00:00+07:00',
    },
    {
      content: '[TIER:0H]ติดตามลูกค้าครับ',
      type: 'COMMENT',
      createdAt: '2026-10-10T11:00:00+07:00',
    },
  ];

  const activeAfter0h = resolveTimelineDueDate({ logs, evalDate: new Date('2026-10-10T18:00:00+07:00') });
  assert.ok(activeAfter0h !== null, '0H note must NOT clear active due date');

  const logsWith9h = [
    ...logs,
    {
      content: '[TIER:9H] Called client and confirmed meeting Monday morning.',
      type: 'COMMENT',
      createdAt: '2026-10-10T14:00:00+07:00',
    },
  ];
  const activeAfter9h = resolveTimelineDueDate({ logs: logsWith9h, evalDate: new Date('2026-10-10T18:00:00+07:00') });
  assert.equal(activeAfter9h, null, '9H real follow-up fulfills and clears active due date');
});
