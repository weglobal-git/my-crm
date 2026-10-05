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

export function formatDateToDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isSunday(date: Date): boolean {
  return date.getDay() === 0;
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
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
  const current = new Date(from);
  current.setHours(0, 0, 0, 0);

  const target = new Date(to);
  target.setHours(0, 0, 0, 0);

  if (current >= target) {
    return 0;
  }

  let count = 0;
  current.setDate(current.getDate() + 1);

  while (current <= target) {
    const dayOfWeek = current.getDay();
    const dateKey = formatDateToDateKey(current);

    // Skip Sunday (0) and any holiday/leave in companyHolidays
    if (dayOfWeek !== 0 && !companyHolidays.has(dateKey)) {
      count++;
    }

    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * Calculates elapsed working time in milliseconds between from and to.
 * Working window: 08:00 - 17:00 (9 hours/day)
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
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);

  const endLimit = new Date(to);
  endLimit.setHours(0, 0, 0, 0);

  while (cur <= endLimit) {
    const dayOfWeek = cur.getDay();
    const dateKey = formatDateToDateKey(cur);

    // Skip Sunday (0) and any holiday/leave
    const isOff = dayOfWeek === 0 || holidays.has(dateKey);

    if (!isOff) {
      const year = cur.getFullYear();
      const month = cur.getMonth();
      const day = cur.getDate();

      const workStart = new Date(year, month, day, WORK_DAY_START_HOUR, WORK_DAY_START_MINUTE, 0, 0);
      const workEnd = new Date(year, month, day, WORK_DAY_END_HOUR, WORK_DAY_END_MINUTE, 0, 0);

      const periodStart = Math.max(from.getTime(), workStart.getTime());
      const periodEnd = Math.min(to.getTime(), workEnd.getTime());

      if (periodEnd > periodStart) {
        totalMs += (periodEnd - periodStart);
      }
    }

    cur.setDate(cur.getDate() + 1);
  }

  return totalMs;
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
 * Sundays, company holidays, and user leaves.
 */
export function addWorkingMs(
  startDate: Date,
  msToAdd: number,
  holidays: Set<string> = new Set()
): Date {
  if (msToAdd <= 0) return new Date(startDate);

  let remainingMs = msToAdd;
  const cur = new Date(startDate);

  while (remainingMs > 0) {
    const dayOfWeek = cur.getDay();
    const dateKey = formatDateToDateKey(cur);
    const isOff = dayOfWeek === 0 || holidays.has(dateKey);

    if (isOff) {
      // Jump to 08:00 next day
      cur.setDate(cur.getDate() + 1);
      cur.setHours(WORK_DAY_START_HOUR, WORK_DAY_START_MINUTE, 0, 0);
      continue;
    }

    const year = cur.getFullYear();
    const month = cur.getMonth();
    const day = cur.getDate();

    const workStart = new Date(year, month, day, WORK_DAY_START_HOUR, WORK_DAY_START_MINUTE, 0, 0);
    const workEnd = new Date(year, month, day, WORK_DAY_END_HOUR, WORK_DAY_END_MINUTE, 0, 0);

    // If cur is before 08:00 on a working day, advance to 08:00
    if (cur < workStart) {
      cur.setTime(workStart.getTime());
    }

    // If cur is at or after 17:30 on a working day, advance to next day 08:00
    if (cur >= workEnd) {
      cur.setDate(cur.getDate() + 1);
      cur.setHours(WORK_DAY_START_HOUR, WORK_DAY_START_MINUTE, 0, 0);
      continue;
    }

    const availableMsToday = workEnd.getTime() - cur.getTime();

    if (remainingMs <= availableMsToday) {
      cur.setTime(cur.getTime() + remainingMs);
      remainingMs = 0;
      break;
    } else {
      remainingMs -= availableMsToday;
      cur.setDate(cur.getDate() + 1);
      cur.setHours(WORK_DAY_START_HOUR, WORK_DAY_START_MINUTE, 0, 0);
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
