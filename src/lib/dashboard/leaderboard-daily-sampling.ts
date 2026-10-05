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
} from '@/lib/business-days';
import { checkIsRedCard, type KanbanCardDTO } from '@/lib/pipeline-card-dto';
import type {
  DailyCardHealthRecord,
  RedCardMiniDetail,
  UserMonthlyCardHealthSummary,
} from './leaderboard-types';
import { getCardHealthScoreFromRedRate } from './leaderboard-scoring';

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

  // Determine calendar boundary for this month
  const daysInMonth = new Date(year, month, 0).getDate();
  const isCurrentMonth =
    year === asOfDate.getFullYear() && month === asOfDate.getMonth() + 1;
  const isFutureMonth =
    year > asOfDate.getFullYear() ||
    (year === asOfDate.getFullYear() && month > asOfDate.getMonth() + 1);

  // If month is in future, maxDay is 0 (no days to sample)
  const maxDay = isFutureMonth
    ? 0
    : isCurrentMonth
    ? Math.min(asOfDate.getDate(), daysInMonth)
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
    // Cutoff is 23:00 on that day (full 08:00–17:00 working day = 9h per card)
    const evalDate = new Date(year, month - 1, day, 23, 0, 0, 0);

    const dateKey = formatDateToDateKey(evalDate);
    const dayOfWeek = evalDate.getDay();
    const isSunday = dayOfWeek === 0;
    const isCompanyHoliday = companyHolidays.has(dateKey);

    const workStart = new Date(year, month - 1, day, WORK_DAY_START_HOUR, WORK_DAY_START_MINUTE, 0, 0);
    const workEnd = new Date(year, month - 1, day, WORK_DAY_END_HOUR, WORK_DAY_END_MINUTE, 0, 0);

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
        if (d.closedAt) {
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
        const isRed = checkIsRedCard(card, companyHolidays, leavesByUser, evalDate);
        if (isRed) {
          const effectiveOff = new Set([
            ...companyHolidays,
            ...(userLeaves || []),
          ]);

          let redStartTime: Date;
          if (card.dueDate) {
            const due = new Date(card.dueDate);
            due.setHours(8, 0, 0, 0);
            redStartTime = due;
          } else {
            let newestDate: Date | null = null;
            if (card.activityLogs && card.activityLogs.length > 0) {
              const validLogs = card.activityLogs.filter(
                (log) =>
                  log.type === 'COMMENT' &&
                  new Date(log.createdAt) <= evalDate &&
                  !log.content.startsWith('[DUE DATE:') &&
                  !log.content.startsWith('[URGENT_')
              );
              if (validLogs.length > 0) {
                newestDate = new Date(validLogs[0].createdAt);
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
    const { points, label, badge, status } = getCardHealthScoreFromRedRate(
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
