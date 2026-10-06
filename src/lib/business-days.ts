/**
 * Business Days & Working Hours Calculation Helpers
 * - Working hours: 08:00 to 17:00 (9 hours / day)
 * - Night time (17:00 to 08:00 next day) is completely paused
 * - Sundays (day 0) are weekly day-offs (paused)
 * - Saturdays (day 6) are active working days UNLESS explicitly marked in holidays (Dayoff)
 * - Company holidays (Dayoff) & User leaves (Take Leave) are completely paused
 * - Red Card Threshold = 27 working hours (3 working days * 9 hours)
 */

export const WORK_DAY_START_HOUR = 8;
export const WORK_DAY_START_MINUTE = 0;
export const WORK_DAY_END_HOUR = 17;
export const WORK_DAY_END_MINUTE = 0;
export const WORK_HOURS_PER_DAY = 9;
export const WORK_MS_PER_DAY = 9 * 3600 * 1000; // 32,400,000 ms
export const RED_CARD_WORKING_HOURS_THRESHOLD = 27; // 3 working days = 27 working hours
export const RED_CARD_WORKING_MS_THRESHOLD = 27 * 3600 * 1000; // 97,200,000 ms

export const BANGKOK_OFFSET_MS = 7 * 3600 * 1000;

export interface BangkokDateParts {
  year: number;
  month: number; // 0-11
  date: number; // 1-31
  day: number; // 0-6 (0 = Sunday)
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

/**
 * Extracts date and time components in Asia/Bangkok (UTC+7) regardless of the host system timezone.
 */
export function toBangkokDateParts(date: Date): BangkokDateParts {
  const bkk = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return {
    year: bkk.getUTCFullYear(),
    month: bkk.getUTCMonth(),
    date: bkk.getUTCDate(),
    day: bkk.getUTCDay(),
    hours: bkk.getUTCHours(),
    minutes: bkk.getUTCMinutes(),
    seconds: bkk.getUTCSeconds(),
    milliseconds: bkk.getUTCMilliseconds(),
  };
}

/**
 * Creates a Date representing an exact instant in Asia/Bangkok (UTC+7).
 */
export function createBangkokDate(
  year: number,
  monthIndex: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0,
  ms = 0
): Date {
  return new Date(Date.UTC(year, monthIndex, day, hours, minutes, seconds, ms) - BANGKOK_OFFSET_MS);
}

export function formatDateToDateKey(date: Date): string {
  const parts = toBangkokDateParts(date);
  const y = parts.year;
  const m = String(parts.month + 1).padStart(2, '0');
  const d = String(parts.date).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isSunday(date: Date): boolean {
  return toBangkokDateParts(date).day === 0;
}

export function isWeekend(date: Date): boolean {
  const day = toBangkokDateParts(date).day;
  return day === 0 || day === 6; // Sunday or Saturday
}

/**
 * Counts elapsed working days between from and to (exclusive of starting date).
 * Skips Sundays and any date in companyHolidays (which includes Dayoff Saturdays & leaves).
 */
export function countElapsedBusinessDays(
  from: Date,
  to: Date = new Date(),
  companyHolidays: Set<string> = new Set()
): number {
  const fromParts = toBangkokDateParts(from);
  const toParts = toBangkokDateParts(to);

  let current = createBangkokDate(fromParts.year, fromParts.month, fromParts.date, 0, 0, 0);
  const target = createBangkokDate(toParts.year, toParts.month, toParts.date, 0, 0, 0);

  if (current >= target) {
    return 0;
  }

  let count = 0;
  current = new Date(current.getTime() + 24 * 3600 * 1000);

  while (current <= target) {
    const curParts = toBangkokDateParts(current);
    const dayOfWeek = curParts.day;
    const dateKey = `${curParts.year}-${String(curParts.month + 1).padStart(2, '0')}-${String(curParts.date).padStart(2, '0')}`;

    // Skip Sunday (0) and any holiday/leave in companyHolidays
    if (dayOfWeek !== 0 && !companyHolidays.has(dateKey)) {
      count++;
    }

    current = new Date(current.getTime() + 24 * 3600 * 1000);
  }

  return count;
}

/**
 * Calculates elapsed working time in milliseconds between from and to.
 * Working window: 08:00 - 17:00 (9 hours/day) in Asia/Bangkok
 * Pauses:
 * - Nights (17:00 to 08:00 next day)
 * - Sundays (day 0)
 * - Any date in holidays set (Company Dayoffs, Dayoff Saturdays, and User Leaves)
 */
export function calculateElapsedWorkingMs(
  from: Date,
  to: Date = new Date(),
  holidays: Set<string> = new Set()
): number {
  if (from >= to) return 0;

  let totalMs = 0;
  const fromParts = toBangkokDateParts(from);
  const toParts = toBangkokDateParts(to);

  let curMidnight = createBangkokDate(fromParts.year, fromParts.month, fromParts.date, 0, 0, 0);
  const endMidnight = createBangkokDate(toParts.year, toParts.month, toParts.date, 0, 0, 0);
  const fromMidnightTime = curMidnight.getTime();

  let currentOffStreak = 0;
  let holidayPenaltyMs = 0;

  while (curMidnight <= endMidnight) {
    const curParts = toBangkokDateParts(curMidnight);
    const dayOfWeek = curParts.day;
    const dateKey = `${curParts.year}-${String(curParts.month + 1).padStart(2, '0')}-${String(curParts.date).padStart(2, '0')}`;

    // Skip Sunday (0) and any holiday/leave
    const isOff = dayOfWeek === 0 || holidays.has(dateKey);

    if (isOff) {
      // Off-days strictly after the update's calendar date accumulate into a consecutive off-day streak
      if (curMidnight.getTime() > fromMidnightTime) {
        currentOffStreak++;
      }
    } else {
      const workStart = createBangkokDate(curParts.year, curParts.month, curParts.date, WORK_DAY_START_HOUR, WORK_DAY_START_MINUTE, 0);
      const workEnd = createBangkokDate(curParts.year, curParts.month, curParts.date, WORK_DAY_END_HOUR, WORK_DAY_END_MINUTE, 0);

      // If we just completed a consecutive off-day streak >= 2, apply +9h fixed once for that streak
      // Only active once the working window of this working day begins (to >= workStart)
      if (currentOffStreak >= 2 && to.getTime() >= workStart.getTime()) {
        holidayPenaltyMs += WORK_MS_PER_DAY;
      }
      currentOffStreak = 0;

      const periodStart = Math.max(from.getTime(), workStart.getTime());
      const periodEnd = Math.min(to.getTime(), workEnd.getTime());

      if (periodEnd > periodStart) {
        totalMs += (periodEnd - periodStart);
      }
    }

    curMidnight = new Date(curMidnight.getTime() + 24 * 3600 * 1000);
  }

  return totalMs + holidayPenaltyMs;
}

/**
 * Backwards-compatible alias for working milliseconds calculation.
 */
export function calculateElapsedBusinessMs(
  from: Date,
  to: Date = new Date(),
  companyHolidays: Set<string> = new Set()
): number {
  return calculateElapsedWorkingMs(from, to, companyHolidays);
}

/**
 * Adds working milliseconds to a starting date, skipping non-working hours,
 * Sundays, company holidays, and user leaves in Asia/Bangkok time.
 * If a consecutive off-day streak >= 2 is crossed, consumes +9h fixed once for that streak.
 */
export function addWorkingMs(
  startDate: Date,
  msToAdd: number,
  holidays: Set<string> = new Set()
): Date {
  if (msToAdd <= 0) return new Date(startDate);

  let remainingMs = msToAdd;
  let cur = new Date(startDate);
  const startParts = toBangkokDateParts(startDate);
  const startMidnightTime = createBangkokDate(startParts.year, startParts.month, startParts.date, 0, 0, 0).getTime();

  let currentOffStreak = 0;

  while (remainingMs > 0) {
    const curParts = toBangkokDateParts(cur);
    const dayOfWeek = curParts.day;
    const dateKey = `${curParts.year}-${String(curParts.month + 1).padStart(2, '0')}-${String(curParts.date).padStart(2, '0')}`;
    const isOff = dayOfWeek === 0 || holidays.has(dateKey);

    const curMidnightTime = createBangkokDate(curParts.year, curParts.month, curParts.date, 0, 0, 0).getTime();
    const nextDayStart = createBangkokDate(curParts.year, curParts.month, curParts.date + 1, WORK_DAY_START_HOUR, WORK_DAY_START_MINUTE, 0);

    if (isOff) {
      if (curMidnightTime > startMidnightTime) {
        currentOffStreak++;
      }
      cur = nextDayStart;
      continue;
    }

    // It's a working day!
    // Check if we just completed a streak of >= 2 off-days
    if (currentOffStreak >= 2) {
      currentOffStreak = 0;
      if (remainingMs <= WORK_MS_PER_DAY) {
        // The holiday penalty completed the remaining threshold right at the start of this working day!
        const workStart = createBangkokDate(curParts.year, curParts.month, curParts.date, WORK_DAY_START_HOUR, WORK_DAY_START_MINUTE, 0);
        return workStart;
      }
      remainingMs -= WORK_MS_PER_DAY;
    } else {
      currentOffStreak = 0;
    }

    const workStart = createBangkokDate(curParts.year, curParts.month, curParts.date, WORK_DAY_START_HOUR, WORK_DAY_START_MINUTE, 0);
    const workEnd = createBangkokDate(curParts.year, curParts.month, curParts.date, WORK_DAY_END_HOUR, WORK_DAY_END_MINUTE, 0);

    if (cur < workStart) {
      cur = workStart;
    }

    if (cur >= workEnd) {
      cur = nextDayStart;
      continue;
    }

    const availableMsToday = workEnd.getTime() - cur.getTime();

    if (remainingMs <= availableMsToday) {
      cur = new Date(cur.getTime() + remainingMs);
      remainingMs = 0;
      break;
    } else {
      remainingMs -= availableMsToday;
      cur = nextDayStart;
    }
  }

  return cur;
}

/**
 * Formats a duration in days into concise human-readable tags:
 * - <= 30 days: "25D"
 * - <= 365 days: "3M12D"
 * - > 365 days: "1Y2M"
 */
export function formatLtcDuration(totalDays: number): string {
  if (totalDays <= 0) return '0D';
  if (totalDays < 30) {
    return `${totalDays}D`;
  }

  if (totalDays < 365) {
    const months = Math.floor(totalDays / 30);
    const remainingDays = totalDays % 30;
    if (remainingDays === 0) return `${months}M`;
    return `${months}M${remainingDays}D`;
  }

  const years = Math.floor(totalDays / 365);
  const remainingMonths = Math.floor((totalDays % 365) / 30);
  if (remainingMonths === 0) return `${years}Y`;
  return `${years}Y${remainingMonths}M`;
}
