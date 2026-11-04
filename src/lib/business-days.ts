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
export const LONG_HOLIDAY_OFF_STREAK_DAYS = 3; // >= 3 consecutive off-days triggers Post-Holiday 9h Check-In Cap
export const HEAVY_LOAD_SHIELD_MIN_ACTIVE_CARDS = 10; // >= 10 active cards with only 1 Red Card triggers Heavy-Load Shield (+half clean day credit)
export const MAX_DUE_DATE_HORIZON_DAYS = 45; // Standard future Due Date horizon (covers 30d credit terms + billing cycle)
export const MAX_LONG_LEAD_DUE_DATE_HORIZON_DAYS = 180; // Extended horizon for Trademark / Booth / Hold / Staggered Shipment with >= 20 chars reason
export const MIN_LONG_LEAD_DUE_DATE_REASON_LENGTH = 20;

export const BANGKOK_OFFSET_MS = 7 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const WORK_START_OFFSET_MS = (WORK_DAY_START_HOUR * 60 + WORK_DAY_START_MINUTE) * 60 * 1000;
const WORK_END_OFFSET_MS = (WORK_DAY_END_HOUR * 60 + WORK_DAY_END_MINUTE) * 60 * 1000;

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
 * - Short weekends / leaves (1–2 consecutive off-days: 100% paused, zero penalty)
 * - Long holidays (>= 3 consecutive off-days): clamps remaining time at first workday 08:00
 *   to at most 9 working hours (Post-Holiday Check-In Cap) when `ceilingMs > WORK_MS_PER_DAY`.
 */
export function calculateElapsedWorkingMs(
  from: Date,
  to: Date = new Date(),
  holidays: Set<string> = new Set(),
  options?: {
    ceilingMs?: number;
    stopAtMs?: number;
    personalLeaves?: Set<string>;
  }
): number {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (fromMs >= toMs) return 0;

  const ceilingMs = options?.ceilingMs ?? RED_CARD_WORKING_MS_THRESHOLD;
  const stopAtMs = options?.stopAtMs;
  const personalLeaves = options?.personalLeaves;
  const checkHolidayKeys = holidays.size > 0 || (personalLeaves !== undefined && personalLeaves.size > 0);

  let totalMs = 0;
  const fromParts = toBangkokDateParts(from);
  const toParts = toBangkokDateParts(to);

  let curMidnightMs = createBangkokDate(fromParts.year, fromParts.month, fromParts.date, 0, 0, 0).getTime();
  const endMidnightMs = createBangkokDate(toParts.year, toParts.month, toParts.date, 0, 0, 0).getTime();
  const fromMidnightMs = curMidnightMs;

  let dayOfWeek = fromParts.day;
  let companyOffStreak = 0;

  while (curMidnightMs <= endMidnightMs) {
    let isCompanyOff = dayOfWeek === 0;
    let isPersonalLeave = false;
    if (checkHolidayKeys) {
      const bkk = new Date(curMidnightMs + BANGKOK_OFFSET_MS);
      const dateKey = `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, '0')}-${String(bkk.getUTCDate()).padStart(2, '0')}`;
      if (!isCompanyOff && holidays.has(dateKey)) {
        isCompanyOff = true;
      }
      if (!isCompanyOff && personalLeaves?.has(dateKey)) {
        isPersonalLeave = true;
      }
    }

    if (isCompanyOff || isPersonalLeave) {
      if (isCompanyOff && curMidnightMs > fromMidnightMs) {
        companyOffStreak++;
      }
    } else {
      const workStartMs = curMidnightMs + WORK_START_OFFSET_MS;
      const workEndMs = curMidnightMs + WORK_END_OFFSET_MS;

      // Post-Holiday Check-In Cap: after >= 3 consecutive company off-days, clamp remaining window to <= 9h
      // once the return workday's 08:00 begins (never turns a clean card Red at 08:00 AM, requires check-in by 17:00)
      if (
        companyOffStreak >= LONG_HOLIDAY_OFF_STREAK_DAYS &&
        ceilingMs > WORK_MS_PER_DAY &&
        toMs >= workStartMs
      ) {
        const minElapsedAfterLongBreak = ceilingMs - WORK_MS_PER_DAY;
        if (totalMs < minElapsedAfterLongBreak) {
          totalMs = minElapsedAfterLongBreak;
        }
      }
      companyOffStreak = 0;

      const periodStart = fromMs > workStartMs ? fromMs : workStartMs;
      const periodEnd = toMs < workEndMs ? toMs : workEndMs;

      if (periodEnd > periodStart) {
        totalMs += periodEnd - periodStart;
      }

      if (stopAtMs !== undefined && totalMs >= stopAtMs) {
        return totalMs;
      }
    }

    curMidnightMs += DAY_MS;
    dayOfWeek = (dayOfWeek + 1) % 7;
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
 * Sundays, company holidays, and user leaves in Asia/Bangkok time.
 * Short off-day streaks (1–2 days) are 100% paused; long holiday streaks (>= 3 days)
 * apply the Post-Holiday Check-In Cap (clamping remainingMs to <= 9h on return day).
 */
export function addWorkingMs(
  startDate: Date,
  msToAdd: number,
  holidays: Set<string> = new Set(),
  personalLeaves?: Set<string>
): Date {
  if (msToAdd <= 0) return new Date(startDate);

  let remainingMs = msToAdd;
  let curMs = startDate.getTime();
  const startParts = toBangkokDateParts(startDate);
  const startMidnightMs = createBangkokDate(startParts.year, startParts.month, startParts.date, 0, 0, 0).getTime();
  const checkHolidayKeys = holidays.size > 0 || (personalLeaves !== undefined && personalLeaves.size > 0);

  let curMidnightMs = startMidnightMs;
  let dayOfWeek = startParts.day;
  let companyOffStreak = 0;

  while (remainingMs > 0) {
    let isCompanyOff = dayOfWeek === 0;
    let isPersonalLeave = false;
    if (checkHolidayKeys) {
      const bkk = new Date(curMidnightMs + BANGKOK_OFFSET_MS);
      const dateKey = `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, '0')}-${String(bkk.getUTCDate()).padStart(2, '0')}`;
      if (!isCompanyOff && holidays.has(dateKey)) {
        isCompanyOff = true;
      }
      if (!isCompanyOff && personalLeaves?.has(dateKey)) {
        isPersonalLeave = true;
      }
    }

    const nextMidnightMs = curMidnightMs + DAY_MS;
    const nextDayStartMs = nextMidnightMs + WORK_START_OFFSET_MS;

    if (isCompanyOff || isPersonalLeave) {
      if (isCompanyOff && curMidnightMs > startMidnightMs) {
        companyOffStreak++;
      }
      curMs = nextDayStartMs;
      curMidnightMs = nextMidnightMs;
      dayOfWeek = (dayOfWeek + 1) % 7;
      continue;
    }

    // Working day: apply Post-Holiday Check-In Cap if returning from >= 3 consecutive company off-days
    if (companyOffStreak >= LONG_HOLIDAY_OFF_STREAK_DAYS) {
      if (remainingMs > WORK_MS_PER_DAY) {
        remainingMs = WORK_MS_PER_DAY;
      }
    }
    companyOffStreak = 0;

    const workStartMs = curMidnightMs + WORK_START_OFFSET_MS;
    const workEndMs = curMidnightMs + WORK_END_OFFSET_MS;

    if (curMs < workStartMs) {
      curMs = workStartMs;
    }

    if (curMs >= workEndMs) {
      curMs = nextDayStartMs;
      curMidnightMs = nextMidnightMs;
      dayOfWeek = (dayOfWeek + 1) % 7;
      continue;
    }

    const availableMsToday = workEndMs - curMs;

    if (remainingMs <= availableMsToday) {
      curMs += remainingMs;
      remainingMs = 0;
      break;
    } else {
      remainingMs -= availableMsToday;
      curMs = nextDayStartMs;
      curMidnightMs = nextMidnightMs;
      dayOfWeek = (dayOfWeek + 1) % 7;
    }
  }

  return new Date(curMs);
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

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Checks whether an activity comment fulfills an opportunity's due date in Asia/Bangkok time.
 * Returns true if comment was posted on or after the due date's calendar day.
 */
export function isDueDateFulfilled(
  dueDate: Date | string | null | undefined,
  commentDate: Date | string | null | undefined
): boolean {
  if (!dueDate || !commentDate) return false;
  const dObj = new Date(dueDate);
  const cObj = new Date(commentDate);
  if (isNaN(dObj.getTime()) || isNaN(cObj.getTime())) return false;

  const dParts = toBangkokDateParts(dObj);
  const cParts = toBangkokDateParts(cObj);

  const dueMidnight = createBangkokDate(dParts.year, dParts.month, dParts.date, 0, 0, 0);
  const commentMidnight = createBangkokDate(cParts.year, cParts.month, cParts.date, 0, 0, 0);
  return commentMidnight.getTime() >= dueMidnight.getTime();
}

/**
 * Checks whether two timestamps fall on the exact same calendar day in Asia/Bangkok.
 */
export function isSameBangkokCalendarDay(
  dateA: Date | string | null | undefined,
  dateB: Date | string | null | undefined
): boolean {
  if (!dateA || !dateB) return false;
  const a = new Date(dateA);
  const b = new Date(dateB);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return false;
  const pa = toBangkokDateParts(a);
  const pb = toBangkokDateParts(b);
  return pa.year === pb.year && pa.month === pb.month && pa.date === pb.date;
}

/**
 * Formats a Date into canonical "DD MMM YYYY" (e.g. "30 Oct 2026") in Asia/Bangkok timezone.
 * Used for `[DUE DATE: DD MMM YYYY]` logs and preview banners so client and server never drift.
 */
export function formatBangkokDueDateDisplay(date: Date | string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const parts = toBangkokDateParts(d);
  const day = String(parts.date).padStart(2, '0');
  const month = SHORT_MONTH_NAMES[parts.month] ?? '';
  return `${day} ${month} ${parts.year}`;
}

/**
 * Formats a Date into compact pill text in Asia/Bangkok timezone:
 * - default (`includeYear: true, padDay: false`): "30Oct26" or "7Oct26" (ActivityFeedTab / ActivityCommentItem)
 * - Kanban card (`includeYear: false, padDay: true`): "30Oct" or "07Oct"
 */
export function formatBangkokDueDateShort(
  date: Date | string,
  options?: { includeYear?: boolean; padDay?: boolean }
): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const includeYear = options?.includeYear ?? true;
  const padDay = options?.padDay ?? false;
  const parts = toBangkokDateParts(d);
  const day = padDay ? String(parts.date).padStart(2, '0') : String(parts.date);
  const month = SHORT_MONTH_NAMES[parts.month] ?? '';
  if (!includeYear) {
    return `${day}${month}`;
  }
  const year = String(parts.year).slice(-2);
  return `${day}${month}${year}`;
}

/**
 * Parses a due date string from a `[DUE DATE: ...]` activity log into Bangkok midnight Date.
 */
export function parseDueDateString(raw: string): Date | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,?\s*\d{1,2}[:.]\d{2}(?::\d{2})?/, '').trim();
  const lower = cleaned.toLowerCase();
  if (lower === 'removed' || lower === 'none' || lower === 'null') {
    return null;
  }

  // 1. Try DD Month YYYY (e.g. "07 Oct 2026", "7 October 2026")
  const enMatch = cleaned.match(/^(\d{1,2})\s+([a-zA-Z]{3,})\s+(\d{4})$/);
  if (enMatch) {
    const day = parseInt(enMatch[1], 10);
    const mStr = enMatch[2].toLowerCase().slice(0, 3);
    const month = MONTH_NAME_MAP[mStr];
    const year = parseInt(enMatch[3], 10);
    if (month !== undefined) {
      return createBangkokDate(year, month, day, 0, 0, 0);
    }
  }

  // 2. Try DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    return createBangkokDate(year, month, day, 0, 0, 0);
  }

  // 3. Try ISO YYYY-MM-DD
  const isoMatch = cleaned.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    return createBangkokDate(year, month, day, 0, 0, 0);
  }

  // 4. Fallback Date.parse
  const parsedTimestamp = Date.parse(cleaned);
  if (!isNaN(parsedTimestamp)) {
    const p = toBangkokDateParts(new Date(parsedTimestamp));
    return createBangkokDate(p.year, p.month, p.date, 0, 0, 0);
  }

  return null;
}

export interface TimelineDueDateLogEntry {
  content: string;
  type: string;
  createdAt: Date | string;
  parentId?: string | null;
}

/**
 * Reconstructs the effective Due Date from a deal's top-level comment timeline up to `evalDate`.
 * Shared between Leaderboard monthly sampling and server-side Admin log edit/delete reconciliation.
 */
export function resolveTimelineDueDate(params: {
  logs: TimelineDueDateLogEntry[] | null | undefined;
  fallbackDueDate?: Date | string | null;
  dealCreatedAt?: Date | string | null;
  evalDate?: Date;
}): Date | null {
  const { logs, fallbackDueDate, dealCreatedAt, evalDate = new Date() } = params;
  const topLevelLogs = (logs ?? []).filter((l) => !l.parentId);

  if (topLevelLogs.length === 0) {
    if (fallbackDueDate && (!dealCreatedAt || new Date(dealCreatedAt) <= evalDate)) {
      return new Date(fallbackDueDate);
    }
    return null;
  }

  const hasEverHadDueDateLogs = topLevelLogs.some((l) => l.content.startsWith('[DUE DATE:'));

  let activeDueDate: Date | null = null;
  if (!hasEverHadDueDateLogs && fallbackDueDate && (!dealCreatedAt || new Date(dealCreatedAt) <= evalDate)) {
    activeDueDate = new Date(fallbackDueDate);
  }

  const relevantLogs = topLevelLogs
    .filter((log) => new Date(log.createdAt).getTime() <= evalDate.getTime())
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  for (const log of relevantLogs) {
    if (log.content.startsWith('[DUE DATE:')) {
      const match = log.content.match(/\[DUE DATE:\s*([^\]\n]+)\]/i);
      if (match) {
        activeDueDate = parseDueDateString(match[1]);
      }
    } else if (
      (log.type === 'COMMENT' &&
        !log.content.startsWith('[URGENT_') &&
        !log.content.startsWith('[TIER:0H]')) ||
      (log.type === 'SYSTEM_UPDATE' &&
        (log.content.startsWith('Deal reopened') ||
          log.content.startsWith('Ownership transferred from ')))
    ) {
      if (activeDueDate && isDueDateFulfilled(activeDueDate, log.createdAt)) {
        activeDueDate = null;
      }
    }
  }

  return activeDueDate;
}

/**
 * Checks whether `evalDate` falls on the first working day (`00:00–16:59:59` Bangkok)
 * immediately following a consecutive off-day streak of `>= LONG_HOLIDAY_OFF_STREAK_DAYS` (3+ days),
 * and `baseDate` occurred strictly before that off-day streak.
 */
export function isPostHolidayCheckInDay(
  baseDate: Date,
  evalDate: Date = new Date(),
  holidays: Set<string> = new Set(),
  personalLeaves?: Set<string>
): boolean {
  const evalParts = toBangkokDateParts(evalDate);
  // Only show Post-Holiday Check-in before 17:00 on an active working day
  if (evalParts.day === 0) return false;
  const evalDateKey = `${evalParts.year}-${String(evalParts.month + 1).padStart(2, '0')}-${String(evalParts.date).padStart(2, '0')}`;
  if (holidays.has(evalDateKey) || personalLeaves?.has(evalDateKey)) return false;

  const evalWorkEnd = createBangkokDate(
    evalParts.year,
    evalParts.month,
    evalParts.date,
    WORK_DAY_END_HOUR,
    WORK_DAY_END_MINUTE,
    0
  );
  if (evalDate.getTime() >= evalWorkEnd.getTime()) return false;

  const evalMidnightMs = createBangkokDate(evalParts.year, evalParts.month, evalParts.date, 0, 0, 0).getTime();
  const baseParts = toBangkokDateParts(baseDate);
  const baseMidnightMs = createBangkokDate(baseParts.year, baseParts.month, baseParts.date, 0, 0, 0).getTime();
  if (baseMidnightMs >= evalMidnightMs) return false;

  // Count consecutive company off-days immediately preceding `evalDate` (skipping personal leave days cleanly)
  let companyStreak = 0;
  let cursorMidnightMs = evalMidnightMs - DAY_MS;
  while (cursorMidnightMs > baseMidnightMs) {
    const p = toBangkokDateParts(new Date(cursorMidnightMs));
    const key = `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.date).padStart(2, '0')}`;
    const isCompanyOff = p.day === 0 || holidays.has(key);
    const isPersonal = !isCompanyOff && Boolean(personalLeaves?.has(key));
    if (isCompanyOff) {
      companyStreak += 1;
    } else if (!isPersonal) {
      break;
    }
    cursorMidnightMs -= DAY_MS;
  }

  return companyStreak >= LONG_HOLIDAY_OFF_STREAK_DAYS;
}

export interface WorkdayDeadlineSchedule {
  /** 00:00:00 Asia/Bangkok on the final eligible working day (Yellow Card warning all day) */
  yellowStart: Date;
  /** 23:59:59.999 Asia/Bangkok on the Yellow Card working day (same-day wrap-up window) */
  yellowEnd: Date;
  /** 08:00:00 Asia/Bangkok on the NEXT active working day after Yellow day (Red Card begins here) */
  redStart: Date;
  /** True when >= 3 consecutive company off-days clamped remaining window to 1 return working day */
  isPostHolidayCap: boolean;
  /** Effective number of active working days granted after Day 0 */
  grantWorkdays: number;
}

function formatMidnightMsToDateKey(midnightMs: number): string {
  const bkk = new Date(midnightMs + BANGKOK_OFFSET_MS);
  return `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, '0')}-${String(bkk.getUTCDate()).padStart(2, '0')}`;
}

function findNextActiveWorkdayMidnightMs(
  startMidnightMs: number,
  startDayOfWeek: number,
  holidays: Set<string>,
  personalLeaves?: Set<string>
): { midnightMs: number; dayOfWeek: number } {
  const checkHolidayKeys = holidays.size > 0 || (personalLeaves !== undefined && personalLeaves.size > 0);
  let curMidnightMs = startMidnightMs;
  let dayOfWeek = startDayOfWeek;

  for (let guard = 0; guard < 730; guard++) {
    let isOff = dayOfWeek === 0;
    if (!isOff && checkHolidayKeys) {
      const dateKey = formatMidnightMsToDateKey(curMidnightMs);
      if (holidays.has(dateKey) || personalLeaves?.has(dateKey)) {
        isOff = true;
      }
    }
    if (!isOff) {
      return { midnightMs: curMidnightMs, dayOfWeek };
    }
    curMidnightMs += DAY_MS;
    dayOfWeek = (dayOfWeek + 1) % 7;
  }

  return { midnightMs: curMidnightMs, dayOfWeek };
}

/**
 * Workday-Aligned Card Lifecycle Schedule for timer-based updates (+9h = 1 workday, +27h = 3 workdays).
 * - Regardless of exact hour/minute posted on Day 0 (e.g. 09:30 or 16:50), Day 0 is the update day.
 * - Counts full active working days after Day 0 (skipping Sundays, Company Holidays, and Owner Personal Leaves).
 * - If >= 3 consecutive company off-days occur, clamps remaining workdays on return day to 1 (Post-Holiday Check-In).
 * - The final eligible workday is a Yellow Card all day (`yellowStart` 00:00 -> `redStart` next workday 08:00).
 * - Flips to Red Card strictly at `08:00:00` of the NEXT active working day (`redStart`).
 */
export function resolveWorkdayTimerSchedule(
  baseDate: Date,
  grantMs: number,
  holidays: Set<string> = new Set(),
  personalLeaves?: Set<string>
): WorkdayDeadlineSchedule {
  if (grantMs <= 0) {
    const t = new Date(baseDate);
    return {
      yellowStart: t,
      yellowEnd: t,
      redStart: t,
      isPostHolidayCap: false,
      grantWorkdays: 0,
    };
  }

  const grantWorkdays = Math.max(1, Math.ceil(grantMs / WORK_MS_PER_DAY - 1e-6));
  const baseParts = toBangkokDateParts(baseDate);
  const baseMidnightMs = createBangkokDate(baseParts.year, baseParts.month, baseParts.date, 0, 0, 0).getTime();
  const checkHolidayKeys = holidays.size > 0 || (personalLeaves !== undefined && personalLeaves.size > 0);

  let curMidnightMs = baseMidnightMs + DAY_MS;
  let dayOfWeek = (baseParts.day + 1) % 7;
  let remaining = grantWorkdays;
  let companyOffStreak = 0;
  let isPostHolidayCap = false;
  let yellowMidnightMs = curMidnightMs;
  let yellowDayOfWeek = dayOfWeek;

  for (let guard = 0; guard < 730; guard++) {
    let isCompanyOff = dayOfWeek === 0;
    let isPersonalLeave = false;
    if (checkHolidayKeys) {
      const dateKey = formatMidnightMsToDateKey(curMidnightMs);
      if (!isCompanyOff && holidays.has(dateKey)) {
        isCompanyOff = true;
      }
      if (!isCompanyOff && personalLeaves?.has(dateKey)) {
        isPersonalLeave = true;
      }
    }

    if (isCompanyOff || isPersonalLeave) {
      if (isCompanyOff) {
        companyOffStreak += 1;
      }
    } else {
      if (companyOffStreak >= LONG_HOLIDAY_OFF_STREAK_DAYS && remaining > 1) {
        remaining = 1;
        isPostHolidayCap = true;
      }
      companyOffStreak = 0;
      remaining -= 1;

      if (remaining <= 0) {
        yellowMidnightMs = curMidnightMs;
        yellowDayOfWeek = dayOfWeek;
        break;
      }
    }

    curMidnightMs += DAY_MS;
    dayOfWeek = (dayOfWeek + 1) % 7;
  }

  const nextActive = findNextActiveWorkdayMidnightMs(
    yellowMidnightMs + DAY_MS,
    (yellowDayOfWeek + 1) % 7,
    holidays,
    personalLeaves
  );

  return {
    yellowStart: new Date(yellowMidnightMs),
    yellowEnd: new Date(yellowMidnightMs + DAY_MS - 1),
    redStart: new Date(nextActive.midnightMs + WORK_START_OFFSET_MS),
    isPostHolidayCap,
    grantWorkdays,
  };
}

/**
 * Workday-Aligned Schedule for explicit `Due Date` cards (with Holiday & Personal Leave protection):
 * - If `dueDate` falls on a Sunday, Company Holiday, or the owner's Personal Leave, the Yellow Card day
 *   shifts automatically to the owner's first active return working day.
 * - That effective working day is a Yellow Card all day (`yellowStart` -> `redStart`).
 * - Flips to Red Card strictly at `08:00:00` of the NEXT active working day (`redStart`).
 */
export function resolveDueDateSchedule(
  dueDate: Date | string,
  holidays: Set<string> = new Set(),
  personalLeaves?: Set<string>
): WorkdayDeadlineSchedule {
  const dueParts = toBangkokDateParts(new Date(dueDate));
  const rawDueMidnightMs = createBangkokDate(dueParts.year, dueParts.month, dueParts.date, 0, 0, 0).getTime();

  const yellowDay = findNextActiveWorkdayMidnightMs(
    rawDueMidnightMs,
    dueParts.day,
    holidays,
    personalLeaves
  );
  const nextActive = findNextActiveWorkdayMidnightMs(
    yellowDay.midnightMs + DAY_MS,
    (yellowDay.dayOfWeek + 1) % 7,
    holidays,
    personalLeaves
  );

  return {
    yellowStart: new Date(yellowDay.midnightMs),
    yellowEnd: new Date(yellowDay.midnightMs + DAY_MS - 1),
    redStart: new Date(nextActive.midnightMs + WORK_START_OFFSET_MS),
    isPostHolidayCap: false,
    grantWorkdays: 1,
  };
}

/**
 * Counts how many active working days remain strictly after `fromDate`'s Bangkok calendar day
 * up to and including `targetYellowStart`'s Bangkok calendar day.
 * Used for Non-Punitive Ceiling preservation so posting an extra short update never shortens a prior window.
 */
export function countRemainingActiveWorkdaysAfter(
  fromDate: Date,
  targetYellowStart: Date,
  holidays: Set<string> = new Set(),
  personalLeaves?: Set<string>
): number {
  const fromParts = toBangkokDateParts(fromDate);
  const targetParts = toBangkokDateParts(targetYellowStart);
  let curMidnightMs = createBangkokDate(fromParts.year, fromParts.month, fromParts.date, 0, 0, 0).getTime() + DAY_MS;
  const endMidnightMs = createBangkokDate(targetParts.year, targetParts.month, targetParts.date, 0, 0, 0).getTime();
  if (curMidnightMs > endMidnightMs) return 0;

  const checkHolidayKeys = holidays.size > 0 || (personalLeaves !== undefined && personalLeaves.size > 0);
  let dayOfWeek = (fromParts.day + 1) % 7;
  let count = 0;

  while (curMidnightMs <= endMidnightMs) {
    let isOff = dayOfWeek === 0;
    if (!isOff && checkHolidayKeys) {
      const dateKey = formatMidnightMsToDateKey(curMidnightMs);
      if (holidays.has(dateKey) || personalLeaves?.has(dateKey)) {
        isOff = true;
      }
    }
    if (!isOff) {
      count += 1;
    }
    curMidnightMs += DAY_MS;
    dayOfWeek = (dayOfWeek + 1) % 7;
  }

  return count;
}
