import {
  calculateElapsedWorkingMs,
  addWorkingMs,
  formatDateToDateKey,
  WORK_DAY_START_HOUR,
  WORK_DAY_START_MINUTE,
  WORK_DAY_END_HOUR,
  WORK_DAY_END_MINUTE,
  WORK_HOURS_PER_DAY,
  toBangkokDateParts,
  createBangkokDate,
  parseDueDateString,
  resolveTimelineDueDate,
} from '@/lib/business-days';
import {
  buildEffectiveOffDatesMap,
  checkIsRedCard,
  resolveLatestTimerLog,
  type KanbanCardDTO,
} from '@/lib/pipeline-card-dto';
import type {
  RedCardMiniDetail,
  UserMonthlyCardHealthSummary,
} from './leaderboard-types';
import { getCardHealthScoreFromRedRate } from './leaderboard-scoring';

export { parseDueDateString };

/**
 * Reconstructs the effective Due Date of a deal as it stood at a historical evaluation date (Asia/Bangkok).
 * Accounts for timeline of [DUE DATE: ...] logs and subsequent fulfilling comments.
 */
export function resolveEffectiveDueDateAt(card: KanbanCardDTO, evalDate: Date): Date | null {
  return resolveTimelineDueDate({
    logs: card.activityLogs,
    fallbackDueDate: card.dueDate,
    dealCreatedAt: card.createdAt,
    evalDate,
  });
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
      graceDaysCount: 0,
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

  // Pre-index deals by ownerId with precomputed timestamps and build off-dates map once outside the day loop
  const prebuiltOffDatesMap = buildEffectiveOffDatesMap(companyHolidays, leavesByUser);
  const dealsByOwner = new Map<
    string,
    Array<{ card: KanbanCardDTO; createdMs: number | null; closedMs: number | null }>
  >();
  for (const d of deals) {
    if (!d.ownerId) continue;
    const createdMs = d.createdAt ? new Date(d.createdAt).getTime() : null;
    const closedMs = d.status !== 'OPEN' && d.closedAt ? new Date(d.closedAt).getTime() : null;
    let list = dealsByOwner.get(d.ownerId);
    if (!list) {
      list = [];
      dealsByOwner.set(d.ownerId, list);
    }
    list.push({ card: d, createdMs, closedMs });
  }

  // Iterate day by day from day 1 to maxDay
  for (let day = 1; day <= maxDay; day++) {
    // Cutoff is 23:00 Bangkok time on that day (full 08:00–17:00 working day = 9h per card)
    const evalDate = createBangkokDate(year, month - 1, day, 23, 0, 0, 0);
    const evalMs = evalDate.getTime();

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

      // Find cards owned by user active at evalDate using pre-indexed owner bucket
      const ownerEntries = dealsByOwner.get(user.id);
      const activeDeals: KanbanCardDTO[] = [];
      if (ownerEntries) {
        for (const entry of ownerEntries) {
          if (entry.createdMs !== null && entry.createdMs > evalMs) continue;
          if (entry.closedMs !== null && entry.closedMs <= evalMs) continue;
          activeDeals.push(entry.card);
        }
      }

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

        const isRed = checkIsRedCard(
          effectiveCard,
          companyHolidays,
          leavesByUser,
          evalDate,
          prebuiltOffDatesMap
        );
        if (isRed) {
          // Only re-evaluate against live `asOfDate` when sampling the current day in progress
          // (e.g., 08:00–16:59:59 Amber Due Today grace window or mid-day check-in).
          if (isCurrentMonth && day === asOfParts.date) {
            const effectiveCurrentDueDate = resolveEffectiveDueDateAt(card, asOfDate);
            const effectiveCurrentCard: KanbanCardDTO = {
              ...card,
              dueDate: effectiveCurrentDueDate,
            };
            const isRedCurrent = checkIsRedCard(
              effectiveCurrentCard,
              companyHolidays,
              leavesByUser,
              asOfDate,
              prebuiltOffDatesMap
            );
            if (!isRedCurrent) {
              continue;
            }
          }

          let redStartTime: Date;
          if (effectiveDueDate) {
            const dueParts = toBangkokDateParts(new Date(effectiveDueDate));
            redStartTime = createBangkokDate(
              dueParts.year,
              dueParts.month,
              dueParts.date,
              WORK_DAY_START_HOUR,
              WORK_DAY_START_MINUTE,
              0,
              0
            );
          } else {
            const { baseDate: resolvedBaseDate, grantMs } = resolveLatestTimerLog(card, evalDate);
            const baseDate = resolvedBaseDate || workStart;
            redStartTime = addWorkingMs(baseDate, grantMs, companyHolidays, userLeaves);
          }

          // Working hours red today (between 08:00 and 17:00, up to 9h max)
          const windowStart = Math.max(redStartTime.getTime(), workStart.getTime());
          const windowEnd = Math.min(evalMs, workEnd.getTime());
          const redMsToday = windowEnd > windowStart ? windowEnd - windowStart : 0;
          const redHoursToday = Math.round((redMsToday / (3600 * 1000)) * 10) / 10;

          // Total overdue working hours accumulated up to evalDate
          const totalOverdueMs = calculateElapsedWorkingMs(
            redStartTime,
            evalDate,
            companyHolidays,
            { ceilingMs: 0, personalLeaves: userLeaves }
          );
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

      const isGraceShieldDay = activeCardsCount >= 15 && redCardsCount === 1;
      if (redCardsCount === 0) {
        userSummary.cleanDaysCount += 1;
      } else {
        userSummary.redDaysCount += 1;
        if (isGraceShieldDay) {
          userSummary.graceDaysCount = (userSummary.graceDaysCount ?? 0) + 1;
        }
      }

      userSummary.totalRedHours += redHours;
      userSummary.totalRedCardHours += totalRedCardHoursToday;
      userSummary.totalCardHours += totalCardHours;

      userSummary.dailyRecords.push({
        dateKey,
        dayIndex: day,
        dayOfWeek,
        isOffDay: false,
        isGraceShieldDay,
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

    // Assign fixed score from Red Rate ladder.
    // Use monthly card-hours exposure so closing all open deals on the final day does not zero out earned XP.
    const effectiveCardExposure =
      summary.currentActiveCards > 0
        ? summary.currentActiveCards
        : summary.totalCardHours > 0
        ? 1
        : 0;
    const { points, badge, status } = getCardHealthScoreFromRedRate(
      summary.avgMonthlyRedRate,
      effectiveCardExposure
    );
    summary.totalCardHealthXp = points;
    summary.redRateTier = badge;
    summary.kpiStatus = status;
    summary.baseTierXp = points;
  }

  return result;
}
