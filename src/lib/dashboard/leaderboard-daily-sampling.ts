import {
  calculateElapsedWorkingMs,
  formatDateToDateKey,
  HEAVY_LOAD_SHIELD_MIN_ACTIVE_CARDS,
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
  evaluateCardTimingState,
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

interface DealOwnerActiveSegment {
  card: KanbanCardDTO;
  ownerId: string;
  startMs: number;
  endMs: number;
}

const HANDOVER_MARKER_REGEX = /\[HANDOVER:([^\]\s-]+)->([^\]\s]+)\]/;
const SYSTEM_TRANSFER_REGEX = /^Ownership transferred from (.+?) to (.+?)\.?$/i;

function normalizeUserName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase();
}

/**
 * Reconstructs chronological `[startMs, endMs)` intervals during which a deal was:
 * 1) actively `OPEN` (excluding closed -> reopened dormant gaps), AND
 * 2) owned by a specific user (splitting historical ownership across `[HANDOVER:old->new]`
 *    or `SYSTEM_UPDATE: Ownership transferred from X to Y` events so new owners never
 *    inherit retroactive Red Hours from prior owners).
 */
function buildDealOwnerActiveSegments(
  card: KanbanCardDTO,
  userIdByName: Map<string, string>
): DealOwnerActiveSegment[] {
  const createdMs = card.createdAt ? new Date(card.createdAt).getTime() : -Infinity;
  const logsAsc = [...(card.activityLogs ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // 1. Reconstruct ownership intervals
  const transferEvents: Array<{
    atMs: number;
    fromOwnerId: string | null;
    toOwnerId: string | null;
    isExact: boolean;
  }> = [];

  for (const log of logsAsc) {
    const content = log.content || '';
    const atMs = new Date(log.createdAt).getTime();

    const handoverMatch = content.match(HANDOVER_MARKER_REGEX);
    if (handoverMatch) {
      transferEvents.push({
        atMs,
        fromOwnerId: handoverMatch[1] || null,
        toOwnerId: handoverMatch[2] || null,
        isExact: true,
      });
      continue;
    }

    if (log.type === 'SYSTEM_UPDATE') {
      const sysMatch = content.match(SYSTEM_TRANSFER_REGEX);
      if (sysMatch) {
        const nearExact = transferEvents.some(
          (ev) => ev.isExact && Math.abs(ev.atMs - atMs) <= 10_000
        );
        if (!nearExact) {
          const fromId = userIdByName.get(normalizeUserName(sysMatch[1])) ?? '__external__';
          const toId = userIdByName.get(normalizeUserName(sysMatch[2])) ?? '__external__';
          transferEvents.push({
            atMs,
            fromOwnerId: fromId,
            toOwnerId: toId,
            isExact: false,
          });
        }
      }
    }
  }

  const ownerIntervals: Array<{ ownerId: string; startMs: number; endMs: number }> = [];
  if (transferEvents.length === 0) {
    if (card.ownerId) {
      ownerIntervals.push({ ownerId: card.ownerId, startMs: createdMs, endMs: Infinity });
    }
  } else {
    let cursorMs = createdMs;
    for (let i = 0; i < transferEvents.length; i++) {
      const ev = transferEvents[i];
      if (ev.fromOwnerId && ev.fromOwnerId !== '__external__' && ev.atMs > cursorMs) {
        ownerIntervals.push({
          ownerId: ev.fromOwnerId,
          startMs: cursorMs,
          endMs: ev.atMs,
        });
      }
      cursorMs = Math.max(cursorMs, ev.atMs);
    }
    const finalOwnerId =
      card.ownerId ||
      transferEvents[transferEvents.length - 1].toOwnerId ||
      null;
    if (finalOwnerId && finalOwnerId !== '__external__') {
      ownerIntervals.push({
        ownerId: finalOwnerId,
        startMs: cursorMs,
        endMs: Infinity,
      });
    }
  }

  if (ownerIntervals.length === 0) return [];

  // 2. Reconstruct OPEN lifecycle intervals (excluding [closedAt, reopenedAt) gaps)
  const lifecycleEvents: Array<{ atMs: number; kind: 'CLOSE' | 'REOPEN' }> = [];
  for (const log of logsAsc) {
    const content = log.content || '';
    const atMs = new Date(log.createdAt).getTime();
    if (log.type === 'SYSTEM_UPDATE') {
      if (
        content.startsWith('Deal marked as Won') ||
        content.startsWith('Task completed successfully') ||
        content.startsWith('Deal marked as Lost')
      ) {
        lifecycleEvents.push({ atMs, kind: 'CLOSE' });
      } else if (content.startsWith('Deal reopened')) {
        const nearReopen = lifecycleEvents.some(
          (ev) => ev.kind === 'REOPEN' && Math.abs(ev.atMs - atMs) <= 10_000
        );
        if (!nearReopen) {
          lifecycleEvents.push({ atMs, kind: 'REOPEN' });
        }
      }
    } else if (log.type === 'COMMENT' && content.includes('[REOPEN]')) {
      const nearReopen = lifecycleEvents.some(
        (ev) => ev.kind === 'REOPEN' && Math.abs(ev.atMs - atMs) <= 10_000
      );
      if (!nearReopen) {
        lifecycleEvents.push({ atMs, kind: 'REOPEN' });
      }
    }
  }

  const openIntervals: Array<{ startMs: number; endMs: number }> = [];
  if (lifecycleEvents.length === 0) {
    const closedMs =
      card.status !== 'OPEN' && card.closedAt ? new Date(card.closedAt).getTime() : Infinity;
    if (closedMs > createdMs) {
      openIntervals.push({ startMs: createdMs, endMs: closedMs });
    }
  } else {
    let isOpen = true;
    let openStartMs = createdMs;
    for (const ev of lifecycleEvents) {
      if (ev.kind === 'CLOSE' && isOpen) {
        if (ev.atMs > openStartMs) {
          openIntervals.push({ startMs: openStartMs, endMs: ev.atMs });
        }
        isOpen = false;
      } else if (ev.kind === 'REOPEN' && !isOpen) {
        openStartMs = ev.atMs;
        isOpen = true;
      }
    }
    if (isOpen) {
      const finalEndMs =
        card.status !== 'OPEN' && card.closedAt
          ? Math.max(openStartMs, new Date(card.closedAt).getTime())
          : Infinity;
      if (finalEndMs > openStartMs) {
        openIntervals.push({ startMs: openStartMs, endMs: finalEndMs });
      }
    }
  }

  // 3. Intersect ownership intervals with open intervals
  const segments: DealOwnerActiveSegment[] = [];
  for (const own of ownerIntervals) {
    for (const open of openIntervals) {
      const s = Math.max(own.startMs, open.startMs);
      const e = Math.min(own.endMs, open.endMs);
      if (e > s) {
        segments.push({
          card,
          ownerId: own.ownerId,
          startMs: s,
          endMs: e,
        });
      }
    }
  }

  return segments;
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
  const asOfMs = asOfDate.getTime();

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

  const userIdByName = new Map<string, string>();
  for (const user of departmentUsers) {
    const norm = normalizeUserName(user.name);
    if (norm) userIdByName.set(norm, user.id);
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

  const prebuiltOffDatesMap = buildEffectiveOffDatesMap(companyHolidays, leavesByUser);
  const segmentsByOwner = new Map<string, DealOwnerActiveSegment[]>();
  for (const deal of deals) {
    const segs = buildDealOwnerActiveSegments(deal, userIdByName);
    for (const seg of segs) {
      let list = segmentsByOwner.get(seg.ownerId);
      if (!list) {
        list = [];
        segmentsByOwner.set(seg.ownerId, list);
      }
      list.push(seg);
    }
  }

  // Iterate day by day from day 1 to maxDay
  for (let day = 1; day <= maxDay; day++) {
    const isToday = isCurrentMonth && day === asOfParts.date;
    const dayEndCutoff = createBangkokDate(year, month - 1, day, 23, 0, 0, 0);
    const dayCutoffMs = isToday ? asOfMs : dayEndCutoff.getTime();

    const dateKey = formatDateToDateKey(dayEndCutoff);
    const dayOfWeek = toBangkokDateParts(dayEndCutoff).day;
    const isSunday = dayOfWeek === 0;
    const isCompanyHoliday = companyHolidays.has(dateKey);

    const workStart = createBangkokDate(
      year,
      month - 1,
      day,
      WORK_DAY_START_HOUR,
      WORK_DAY_START_MINUTE,
      0,
      0
    );
    const workEnd = createBangkokDate(
      year,
      month - 1,
      day,
      WORK_DAY_END_HOUR,
      WORK_DAY_END_MINUTE,
      0,
      0
    );
    const workStartMs = workStart.getTime();
    const workEndMs = workEnd.getTime();
    const sampleWorkEndMs = isToday ? Math.min(asOfMs, workEndMs) : workEndMs;

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

      const ownerSegments = segmentsByOwner.get(user.id) ?? [];
      const activeSegmentsToday: DealOwnerActiveSegment[] = [];
      const seenCardIdsToday = new Set<string>();
      const minActiveEndMs = Math.min(workStartMs, dayCutoffMs);

      for (const seg of ownerSegments) {
        if (seg.startMs > dayCutoffMs) continue;
        if (seg.endMs <= minActiveEndMs) continue;
        // If a card wasn't closed/transferred during working hours, only include if active past workStart (or before workStart on today pre-08:00)
        if (dayCutoffMs >= workStartMs && seg.endMs <= workStartMs) continue;
        activeSegmentsToday.push(seg);
        seenCardIdsToday.add(seg.card.id);
      }

      const activeCardsCount = seenCardIdsToday.size;
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

      const redCardDetailsByDeal = new Map<string, RedCardMiniDetail>();

      // Before 08:00 on the current day, today's workday hasn't begun yet (0 red hours today)
      if (!isToday || asOfMs >= workStartMs) {
        for (const seg of activeSegmentsToday) {
          const checkInstantMs = Math.max(workStartMs, seg.startMs);
          if (checkInstantMs > dayCutoffMs || checkInstantMs >= workEndMs) continue;

          const checkInstantDate = new Date(checkInstantMs);
          const effectiveDueAtCheck = resolveEffectiveDueDateAt(seg.card, checkInstantDate);
          const cardForOwnerAtCheck: KanbanCardDTO = {
            ...seg.card,
            ownerId: user.id,
            status: 'OPEN',
            dueDate: effectiveDueAtCheck,
          };

          const initialTiming = evaluateCardTimingState(
            cardForOwnerAtCheck,
            companyHolidays,
            leavesByUser,
            checkInstantDate,
            prebuiltOffDatesMap
          );

          if (!initialTiming.isRed) continue;

          const redStartTime = initialTiming.threshold ?? checkInstantDate;

          // Find exact timestamp when the Red Card was cleared (comment, due date update/removal, close, or transfer out)
          // Note: clearing late in the day stops further Red Hours at `firstClearMs`, NEVER erasing earlier Red Hours!
          let firstClearMs = Math.min(dayCutoffMs, seg.endMs);
          const candidateClearTimes: number[] = [];
          for (const log of seg.card.activityLogs ?? []) {
            const logMs = new Date(log.createdAt).getTime();
            if (logMs > checkInstantMs && logMs <= firstClearMs) {
              candidateClearTimes.push(logMs);
            }
          }
          candidateClearTimes.sort((a, b) => a - b);

          for (const tMs of candidateClearTimes) {
            const tDate = new Date(tMs);
            const dueAtT = resolveEffectiveDueDateAt(seg.card, tDate);
            const stateAtT = evaluateCardTimingState(
              {
                ...seg.card,
                ownerId: user.id,
                status: 'OPEN',
                dueDate: dueAtT,
              },
              companyHolidays,
              leavesByUser,
              tDate,
              prebuiltOffDatesMap
            );
            if (!stateAtT.isRed) {
              firstClearMs = tMs;
              break;
            }
          }

          const windowStart = Math.max(workStartMs, redStartTime.getTime(), seg.startMs);
          const windowEnd = Math.min(sampleWorkEndMs, firstClearMs, seg.endMs);
          const redMsToday = windowEnd > windowStart ? windowEnd - windowStart : 0;
          const redHoursToday = Math.round((redMsToday / (3600 * 1000)) * 10) / 10;

          const effectiveOverdueEnd = new Date(Math.min(dayCutoffMs, firstClearMs, seg.endMs));
          const totalOverdueMs = calculateElapsedWorkingMs(
            redStartTime,
            effectiveOverdueEnd,
            companyHolidays,
            { ceilingMs: 0, personalLeaves: userLeaves }
          );
          const totalOverdueHours = Math.round((totalOverdueMs / (3600 * 1000)) * 10) / 10;

          const prev = redCardDetailsByDeal.get(seg.card.id);
          if (prev) {
            prev.redHoursToday = Math.round((prev.redHoursToday + redHoursToday) * 10) / 10;
            prev.overdueWorkingHours = Math.max(prev.overdueWorkingHours, totalOverdueHours);
          } else {
            redCardDetailsByDeal.set(seg.card.id, {
              dealId: seg.card.id,
              topic: seg.card.topic,
              companyName: seg.card.company?.displayName || seg.card.company?.name,
              overdueWorkingHours: totalOverdueHours,
              redHoursToday,
            });
          }
        }
      }

      const redCardDetails = Array.from(redCardDetailsByDeal.values());
      let totalRedCardHoursToday = 0;
      let maxRedHoursToday = 0;
      for (const detail of redCardDetails) {
        totalRedCardHoursToday += detail.redHoursToday;
        if (detail.redHoursToday > maxRedHoursToday) {
          maxRedHoursToday = detail.redHoursToday;
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

      const isGraceShieldDay =
        activeCardsCount >= HEAVY_LOAD_SHIELD_MIN_ACTIVE_CARDS && redCardsCount === 1;
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

    if (isCurrentMonth) {
      // Live snapshot at `asOfDate` so "Current Red Cards" matches the live Pipeline board
      // (while `dailyRecords` retains any earlier daytime Red Hours that were cleared mid-day).
      const ownerSegments = segmentsByOwner.get(user.id) ?? [];
      let liveActive = 0;
      let liveRed = 0;
      for (const seg of ownerSegments) {
        if (seg.startMs <= asOfMs && seg.endMs > asOfMs) {
          liveActive += 1;
          const liveDue = resolveEffectiveDueDateAt(seg.card, asOfDate);
          const liveState = evaluateCardTimingState(
            {
              ...seg.card,
              ownerId: user.id,
              status: 'OPEN',
              dueDate: liveDue,
            },
            companyHolidays,
            leavesByUser,
            asOfDate,
            prebuiltOffDatesMap
          );
          if (liveState.isRed) {
            liveRed += 1;
          }
        }
      }
      summary.currentActiveCards = liveActive;
      summary.currentRedCards = liveRed;
    } else {
      // Past month: snapshot from the final working day record of that month
      const latestWorkRecord = [...summary.dailyRecords]
        .reverse()
        .find((r) => !r.isOffDay);

      if (latestWorkRecord) {
        summary.currentActiveCards = latestWorkRecord.activeCardsCount;
        summary.currentRedCards = latestWorkRecord.redCardsCount;
      }
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
