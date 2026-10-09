import {
  calculateElapsedWorkingMs,
  addWorkingMs,
  formatDateToDateKey,
  RED_CARD_WORKING_MS_THRESHOLD,
  WORK_DAY_START_HOUR,
  WORK_DAY_START_MINUTE,
  WORK_DAY_END_HOUR,
  WORK_DAY_END_MINUTE,
  WORK_HOURS_PER_DAY,
  toBangkokDateParts,
  createBangkokDate,
} from '@/lib/business-days';
import { checkIsRedCard, type KanbanCardDTO } from '@/lib/pipeline-card-dto';
import { isDueDateFulfilled } from '@/lib/pipeline-opportunities';
import type {
  RedCardMiniDetail,
  UserMonthlyCardHealthSummary,
} from './leaderboard-types';
import { getCardHealthScoreFromRedRate } from './leaderboard-scoring';

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parses a due date string from a `[DUE DATE: ...]` activity log into Bangkok calendar Date.
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

/**
 * Reconstructs the effective Due Date of a deal as it stood at a historical evaluation date (Asia/Bangkok).
 * Accounts for timeline of [DUE DATE: ...] logs and subsequent fulfilling comments.
 */
export function resolveEffectiveDueDateAt(card: KanbanCardDTO, evalDate: Date): Date | null {
  // If card has no activity logs, fall back to card.dueDate if deal existed on/before evalDate
  if (!card.activityLogs || card.activityLogs.length === 0) {
    if (card.dueDate && (!card.createdAt || new Date(card.createdAt) <= evalDate)) {
      return new Date(card.dueDate);
    }
    return null;
  }

  const hasEverHadDueDateLogs = card.activityLogs.some((l) => l.content.startsWith('[DUE DATE:'));

  let activeDueDate: Date | null = null;
  // If deal currently has card.dueDate set in DB and never had any [DUE DATE: logs (e.g. legacy migrated),
  // initialize with card.dueDate
  if (!hasEverHadDueDateLogs && card.dueDate && (!card.createdAt || new Date(card.createdAt) <= evalDate)) {
    activeDueDate = new Date(card.dueDate);
  }

  // Evaluate all logs up to evalDate in chronological order (oldest to newest)
  const relevantLogs = card.activityLogs
    .filter((log) => new Date(log.createdAt).getTime() <= evalDate.getTime())
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  for (const log of relevantLogs) {
    if (log.content.startsWith('[DUE DATE:')) {
      const match = log.content.match(/\[DUE DATE:\s*([^\]\n]+)\]/i);
      if (match) {
        activeDueDate = parseDueDateString(match[1]);
      }
    } else if (
      log.type === 'COMMENT' &&
      !log.content.startsWith('[URGENT_') &&
      activeDueDate
    ) {
      // If a regular comment was posted on or after the active due date's calendar day,
      // it fulfilled and cleared the active due date at that point in time.
      if (isDueDateFulfilled(activeDueDate, log.createdAt)) {
        activeDueDate = null;
      }
    }
  }

  return activeDueDate;
}

export function calculateDailySamplingForMonth(params: {
  departmentUsers: Array<{ id: string; name?: string | null; image?: string | null }>;
  deals: KanbanCardDTO[];
  month: number;
  year: number;
  companyHolidays: Set<string>;
  leavesByUser: Map<string, Set<string>>;
  asOfDate?: Date;
}): Map<string, UserMonthlyCardHealthSummary> {
  const {
    departmentUsers,
    deals,
    month,
    year,
    companyHolidays,
    leavesByUser,
    asOfDate = new Date(),
  } = params;

  const result = new Map<string, UserMonthlyCardHealthSummary>();

  // Determine calendar boundary for this month in Asia/Bangkok
  const asOfParts = toBangkokDateParts(asOfDate);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const isCurrentMonth =
    year === asOfParts.year && month === asOfParts.month + 1;
  const isFutureMonth =
    year > asOfParts.year ||
    (year === asOfParts.year && month > asOfParts.month + 1);

  // If month is in future, maxDay is 0 (no days to sample)
  const maxDay = isFutureMonth
    ? 0
    : isCurrentMonth
    ? Math.min(asOfParts.date, daysInMonth)
    : daysInMonth;

  // Initialize summary for each user
  for (const user of departmentUsers) {
    result.set(user.id, {
      userId: user.id,
      totalWorkingDays: 0,
      cleanDaysCount: 0,
      redDaysCount: 0,
      offDaysCount: 0,
      totalRedHours: 0,
      avgDailyRedHours: 0,
      avgMonthlyHealthRate: 0,
      avgMonthlyRedRate: 0,
      totalCardHours: 0,
      totalRedCardHours: 0,
      currentActiveCards: 0,
      currentRedCards: 0,
      dailyRecords: [],
    });
  }

  // Iterate day by day from day 1 to maxDay
  for (let day = 1; day <= maxDay; day++) {
    // Cutoff is 23:00 Bangkok time on that day (full 08:00–17:00 working day = 9h per card)
    const evalDate = createBangkokDate(year, month - 1, day, 23, 0, 0, 0);

    const dateKey = formatDateToDateKey(evalDate);
    const dayOfWeek = toBangkokDateParts(evalDate).day;
    const isSunday = dayOfWeek === 0;
    const isCompanyHoliday = companyHolidays.has(dateKey);

    const workStart = createBangkokDate(year, month - 1, day, WORK_DAY_START_HOUR, WORK_DAY_START_MINUTE, 0, 0);
    const workEnd = createBangkokDate(year, month - 1, day, WORK_DAY_END_HOUR, WORK_DAY_END_MINUTE, 0, 0);

    for (const user of departmentUsers) {
      const userSummary = result.get(user.id)!;
      const userLeaves = leavesByUser.get(user.id);
      const isUserLeave = userLeaves?.has(dateKey) ?? false;
      const isOffDay = isSunday || isCompanyHoliday || isUserLeave;
      const offDayReason = isSunday
        ? 'Sunday'
        : isCompanyHoliday
        ? 'Dayoff'
        : isUserLeave
        ? 'Leave'
        : undefined;

      if (isOffDay) {
        userSummary.offDaysCount += 1;
        userSummary.dailyRecords.push({
          dateKey,
          dayIndex: day,
          dayOfWeek,
          isOffDay: true,
          offDayReason,
          activeCardsCount: 0,
          cleanCardsCount: 0,
          redCardsCount: 0,
          redHours: 0,
          totalCardHours: 0,
          redCardHoursToday: 0,
          dailyRedRate: 0,
          healthRate: 100,
          redCardDetails: [],
        });
        continue;
      }

      // Active working day
      userSummary.totalWorkingDays += 1;

      // Find cards owned by user active at evalDate
      const activeDeals = deals.filter((d) => {
        if (d.ownerId !== user.id) return false;
        const created = d.createdAt ? new Date(d.createdAt) : null;
        if (created && created > evalDate) return false;
        if (d.status !== 'OPEN' && d.closedAt) {
          const closed = new Date(d.closedAt);
          if (closed <= evalDate) return false;
        }
        return true;
      });

      const activeCardsCount = activeDeals.length;
      if (activeCardsCount === 0) {
        userSummary.dailyRecords.push({
          dateKey,
          dayIndex: day,
          dayOfWeek,
          isOffDay: false,
          isNoCards: true,
          activeCardsCount: 0,
          cleanCardsCount: 0,
          redCardsCount: 0,
          redHours: 0,
          totalCardHours: 0,
          redCardHoursToday: 0,
          dailyRedRate: 0,
          healthRate: 100,
          redCardDetails: [],
        });
        continue;
      }

      const redCardDetails: RedCardMiniDetail[] = [];
      let totalRedCardHoursToday = 0;
      let maxRedHoursToday = 0;

      for (const card of activeDeals) {
        const effectiveDueDate = resolveEffectiveDueDateAt(card, evalDate);
        const effectiveCard: KanbanCardDTO = {
          ...card,
          dueDate: effectiveDueDate,
        };

        const isRed = checkIsRedCard(effectiveCard, companyHolidays, leavesByUser, evalDate);
        if (isRed) {
          // If sampling for the current day in progress, verify that the card is actually red
          // at asOfDate so we don't prematurely penalize a deal before its deadline today.
          const effectiveCurrentDueDate = resolveEffectiveDueDateAt(card, asOfDate);
          const effectiveCurrentCard: KanbanCardDTO = {
            ...card,
            dueDate: effectiveCurrentDueDate,
          };
          const isRedCurrent =
            isCurrentMonth && day === asOfParts.date
              ? checkIsRedCard(effectiveCurrentCard, companyHolidays, leavesByUser, asOfDate)
              : true;

          if (!isRedCurrent) {
            continue;
          }

          const effectiveOff = new Set([
            ...companyHolidays,
            ...(userLeaves || []),
          ]);

          let redStartTime: Date;
          if (effectiveDueDate) {
            const dueParts = toBangkokDateParts(new Date(effectiveDueDate));
            redStartTime = createBangkokDate(dueParts.year, dueParts.month, dueParts.date, WORK_DAY_START_HOUR, WORK_DAY_START_MINUTE, 0, 0);
          } else {
            let newestDate: Date | null = null;
            if (card.activityLogs && card.activityLogs.length > 0) {
              const validLogs = card.activityLogs.filter(
                (log) =>
                  log.type === 'COMMENT' &&
                  new Date(log.createdAt).getTime() <= evalDate.getTime() &&
                  !log.content.startsWith('[DUE DATE:') &&
                  !log.content.startsWith('[URGENT_')
              );
              if (validLogs.length > 0) {
                const latest = validLogs.reduce((latestLog, curLog) =>
                  new Date(curLog.createdAt).getTime() > new Date(latestLog.createdAt).getTime()
                    ? curLog
                    : latestLog
                );
                newestDate = new Date(latest.createdAt);
              }
            }
            const baseDate = newestDate || (card.createdAt ? new Date(card.createdAt) : workStart);
            redStartTime = addWorkingMs(baseDate, RED_CARD_WORKING_MS_THRESHOLD, effectiveOff);
          }

          // Working hours red today (between 08:00 and 17:30, up to 9.5h max)
          const windowStart = Math.max(redStartTime.getTime(), workStart.getTime());
          const windowEnd = Math.min(evalDate.getTime(), workEnd.getTime());
          const redMsToday = windowEnd > windowStart ? windowEnd - windowStart : 0;
          const redHoursToday = Math.round((redMsToday / (3600 * 1000)) * 10) / 10;

          // Total overdue working hours accumulated up to evalDate
          const totalOverdueMs = calculateElapsedWorkingMs(redStartTime, evalDate, effectiveOff);
          const totalOverdueHours = Math.round((totalOverdueMs / (3600 * 1000)) * 10) / 10;

          // A card is only an overdue red card for this day if it actually accumulated overdue working hours
          // (either during today's working hours or carried over from prior days).
          // If a card reached the 27h limit at exactly workEnd (17:00), it had 0 red hours during
          // today's work hours and 0 overdue hours at cutoff; overdue penalty only begins the next workday.
          if (redHoursToday > 0 || totalOverdueHours > 0) {
            redCardDetails.push({
              dealId: card.id,
              topic: card.topic,
              companyName: card.company?.displayName || card.company?.name,
              overdueWorkingHours: totalOverdueHours,
              redHoursToday,
            });

            totalRedCardHoursToday += redHoursToday;
            if (redHoursToday > maxRedHoursToday) {
              maxRedHoursToday = redHoursToday;
            }
          }
        }
      }

      totalRedCardHoursToday = Math.round(totalRedCardHoursToday * 10) / 10;
      // Each card represents WORK_HOURS_PER_DAY (9 hours) per workday (08:00–17:00)
      const totalCardHours = Math.round(activeCardsCount * WORK_HOURS_PER_DAY * 10) / 10;
      // Daily Red Rate % = (Total Red Card Hours / Total Card Hours) * 100
      const dailyRedRate =
        totalCardHours > 0
          ? Math.min(100, Math.round((totalRedCardHoursToday / totalCardHours) * 1000) / 10)
          : 0;
      const healthRate = Math.max(0, Math.round((100 - dailyRedRate) * 10) / 10);
      const redCardsCount = redCardDetails.length;
      const cleanCardsCount = Math.max(0, activeCardsCount - redCardsCount);
      const redHours = maxRedHoursToday;

      if (redCardsCount === 0) {
        userSummary.cleanDaysCount += 1;
      } else {
        userSummary.redDaysCount += 1;
      }

      userSummary.totalRedHours += redHours;
      userSummary.totalRedCardHours += totalRedCardHoursToday;
      userSummary.totalCardHours += totalCardHours;

      userSummary.dailyRecords.push({
        dateKey,
        dayIndex: day,
        dayOfWeek,
        isOffDay: false,
        activeCardsCount,
        cleanCardsCount,
        redCardsCount,
        redHours,
        totalCardHours,
        redCardHoursToday: totalRedCardHoursToday,
        dailyRedRate,
        healthRate,
        redCardDetails,
      });
    }
  }

  // Calculate monthly aggregates
  for (const user of departmentUsers) {
    const summary = result.get(user.id)!;
    summary.totalRedHours = Math.round(summary.totalRedHours * 10) / 10;
    summary.totalRedCardHours = Math.round(summary.totalRedCardHours * 10) / 10;
    summary.totalCardHours = Math.round(summary.totalCardHours * 10) / 10;

    if (summary.totalCardHours > 0) {
      // Monthly Red Rate % = (Total Red Card Hours ÷ Total Card Hours) × 100
      summary.avgMonthlyRedRate =
        Math.min(100, Math.round((summary.totalRedCardHours / summary.totalCardHours) * 10000) / 100);
      summary.avgMonthlyHealthRate =
        Math.max(0, Math.round((100 - summary.avgMonthlyRedRate) * 100) / 100);
    } else {
      summary.avgMonthlyRedRate = 0;
      summary.avgMonthlyHealthRate = 0;
    }

    if (summary.totalWorkingDays > 0) {
      summary.avgDailyRedHours =
        Math.round((summary.totalRedHours / summary.totalWorkingDays) * 10) / 10;
    }

    // Set latest active / red cards count from the most recent working day record
    const latestWorkRecord = [...summary.dailyRecords]
      .reverse()
      .find((r) => !r.isOffDay);

    if (latestWorkRecord) {
      summary.currentActiveCards = latestWorkRecord.activeCardsCount;
      summary.currentRedCards = latestWorkRecord.redCardsCount;
    }

    // Assign fixed score from Red Rate ladder
    const { points, badge, status } = getCardHealthScoreFromRedRate(
      summary.avgMonthlyRedRate,
      summary.currentActiveCards
    );
    summary.totalCardHealthXp = points;
    summary.redRateTier = badge;
    summary.kpiStatus = status;
    summary.baseTierXp = points;
  }

  return result;
}
