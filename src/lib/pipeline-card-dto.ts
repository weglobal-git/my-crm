import { Prisma } from '@prisma/client';

/**
 * Authoritative Prisma select config for Kanban Board Cards.
 * Guarantees that only card-essential fields are fetched over the wire.
 * Heavy relations (system logs, media lists, AI summary, notes) remain strictly on-demand.
 */
export const pipelineCardSelect = Prisma.validator<Prisma.OpportunitySelect>()({
  id: true,
  topic: true,
  type: true,
  status: true,
  value: true,
  currency: true,
  dueDate: true,
  goodsReadyDate: true,
  goodsLoadingDate: true,
  pipelineStageId: true,
  ownerId: true,
  closedAt: true,
  oemProgress: true,
  lossReason: true,
  reserveId: true,
  invoiceId: true,
  isPinned: true,
  hotNote: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { id: true, name: true, displayName: true } },
  owner: { select: { id: true, name: true, email: true, image: true, departments: { select: { id: true, name: true } } } },
  teamMembers: { select: { id: true, name: true, email: true, image: true } },
  activityLogs: {
    where: {
      parentId: null,
      type: 'COMMENT' as const,
      NOT: [
        {
          AND: [
            { content: { startsWith: '[DUE DATE:' } },
            { NOT: { content: { startsWith: '[DUE DATE: Removed]' } } },
          ],
        },
        { content: { startsWith: '[URGENT_' } },
        { content: { startsWith: '[TIER:0H]' } },
      ],
    },
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    select: {
      id: true,
      content: true,
      type: true,
      createdAt: true,
      user: { select: { name: true, image: true } },
    },
  },
});

/**
 * Lean select for Pin/Star mutation to minimize DB response payload.
 */
export const leanOpportunityPinSelect = {
  id: true,
  isPinned: true,
  pipelineStageId: true,
  status: true,
  updatedAt: true,
} as const;

/**
 * Lean select for Hot Note mutation to minimize DB response payload.
 */
export const leanOpportunityHotNoteSelect = {
  id: true,
  hotNote: true,
  pipelineStageId: true,
  status: true,
  updatedAt: true,
} as const;

/**
 * Strongly-typed Card DTO derived directly from Prisma's type system.
 */
export type KanbanCardDTO = Prisma.OpportunityGetPayload<{ select: typeof pipelineCardSelect }>;
export type PipelineCardDTO = KanbanCardDTO;

/**
 * Shared client search predicate matching the product search contract.
 * Covers deal topic, legal company name, trade displayName, sales owner name, invoiceId, and reserveId.
 */
export function matchesPipelineCardSearch(
  deal: {
    topic?: string | null;
    company?: { name?: string | null; displayName?: string | null } | null;
    owner?: { name?: string | null } | null;
    invoiceId?: string | null;
    reserveId?: string | null;
  },
  searchQuery: string
): boolean {
  const q = searchQuery.toLowerCase().trim();
  if (!q) return true;
  return Boolean(
    (deal.topic && deal.topic.toLowerCase().includes(q)) ||
    (deal.company?.name && deal.company.name.toLowerCase().includes(q)) ||
    (deal.company?.displayName && deal.company.displayName.toLowerCase().includes(q)) ||
    (deal.owner?.name && deal.owner.name.toLowerCase().includes(q)) ||
    (deal.invoiceId && deal.invoiceId.toLowerCase().includes(q)) ||
    (deal.reserveId && deal.reserveId.toLowerCase().includes(q))
  );
}

import {
  RED_CARD_WORKING_MS_THRESHOLD,
  WORK_MS_PER_DAY,
  resolveDueDateSchedule,
  resolveWorkdayTimerSchedule,
} from './business-days';
import { getCommentGrantMs, parseTierPrefix } from './pipeline-update-quality';

export interface CardTimingState {
  isRed: boolean;
  isYellow: boolean;
  isDueToday: boolean;
  isPostHolidayCheckIn: boolean;
  threshold: Date | null;
  yellowStart: Date | null;
}

/**
 * Pre-builds merged holiday + personal leave sets once per owner so board rendering and
 * monthly sampling never allocate `new Set([...])` per card.
 */
export function buildEffectiveOffDatesMap(
  companyHolidays: Set<string>,
  userLeavesByOwner?: Map<string, Set<string>>
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  if (!userLeavesByOwner || userLeavesByOwner.size === 0) return map;
  for (const [ownerId, leaves] of userLeavesByOwner.entries()) {
    if (!leaves || leaves.size === 0) continue;
    if (companyHolidays.size === 0) {
      map.set(ownerId, leaves);
    } else {
      const merged = new Set<string>(companyHolidays);
      for (const d of leaves) merged.add(d);
      map.set(ownerId, merged);
    }
  }
  return map;
}

function getEffectiveOffDatesForOwner(
  ownerId: string | null | undefined,
  companyHolidays: Set<string>,
  userLeavesByOwner?: Map<string, Set<string>>,
  prebuiltMap?: Map<string, Set<string>>
): Set<string> {
  if (!ownerId) return companyHolidays;
  if (prebuiltMap) {
    return prebuiltMap.get(ownerId) ?? companyHolidays;
  }
  const ownerLeaves = userLeavesByOwner?.get(ownerId);
  if (!ownerLeaves || ownerLeaves.size === 0) return companyHolidays;
  if (companyHolidays.size === 0) return ownerLeaves;
  const merged = new Set<string>(companyHolidays);
  for (const d of ownerLeaves) merged.add(d);
  return merged;
}

export function resolveLatestTimerLog(
  deal: Pick<KanbanCardDTO, 'activityLogs' | 'createdAt'>,
  evaluationDate?: Date
): { baseDate: Date | null; grantMs: number } {
  const evalMs = evaluationDate ? evaluationDate.getTime() : Infinity;

  if (deal.activityLogs && deal.activityLogs.length > 0) {
    let latestLog: KanbanCardDTO['activityLogs'][number] | null = null;
    let latestTime = -Infinity;

    for (const log of deal.activityLogs) {
      const content = log.content || '';
      const isTransferSystemReset =
        log.type === 'SYSTEM_UPDATE' && content.startsWith('Ownership transferred from ');
      const isReopenSystemReset =
        log.type === 'SYSTEM_UPDATE' && content.startsWith('Deal reopened');

      if (log.type !== 'COMMENT' && !isTransferSystemReset && !isReopenSystemReset) continue;
      if (log.type === 'COMMENT') {
        if (content.startsWith('[URGENT_') || content.startsWith('[TIER:0H]')) continue;
        if (content.startsWith('[DUE DATE:') && !content.startsWith('[DUE DATE: Removed]')) {
          continue;
        }
      }
      const createdMs = new Date(log.createdAt).getTime();
      if (createdMs > evalMs) continue;
      if (createdMs > latestTime) {
        latestTime = createdMs;
        latestLog = log;
      }
    }

    if (latestLog) {
      const baseDate = new Date(latestLog.createdAt);
      if (latestLog.type === 'SYSTEM_UPDATE') {
        const grantMs = latestLog.content.startsWith('Ownership transferred from ')
          ? WORK_MS_PER_DAY
          : RED_CARD_WORKING_MS_THRESHOLD;
        return { baseDate, grantMs };
      }
      if (latestLog.content.startsWith('[DUE DATE: Removed]')) {
        // Removing a Due Date grants a 1-workday floor (or preserves higher embedded [TIER:9H:XX] ceiling)
        const lines = latestLog.content.split('\n');
        const tierLine = lines.find((line) => line.startsWith('[TIER:'));
        const grantMs = tierLine
          ? Math.max(WORK_MS_PER_DAY, getCommentGrantMs(tierLine))
          : WORK_MS_PER_DAY;
        return { baseDate, grantMs };
      }
      const parsed = parseTierPrefix(latestLog.content);
      const grantMs = parsed.hasExplicitTier
        ? Math.round(parsed.effectiveHours * 3600 * 1000)
        : RED_CARD_WORKING_MS_THRESHOLD;
      return { baseDate, grantMs };
    }
  }

  return {
    baseDate: deal.createdAt ? new Date(deal.createdAt) : null,
    grantMs: RED_CARD_WORKING_MS_THRESHOLD,
  };
}

/**
 * Single-pass Workday-Aligned 3-Stage Timing Evaluator for Kanban cards and Leaderboard sampling:
 * - Stage 0 (Normal): Before the final eligible working day (`asOfDate < yellowStart`)
 * - Stage 1 (Yellow Card): All day on the final eligible working day (`yellowStart <= asOfDate < redStart`),
 *   giving employees the entire workday to wrap up without evening panic (`0` Red Hours).
 * - Stage 2 (Red Card): Strictly at `08:00:00` of the NEXT active working day (`asOfDate >= redStart`),
 *   respecting Sundays, Company Holidays, and Owner Personal Leaves on both Due Date and Timer cards.
 */
export function evaluateCardTimingState(
  deal: KanbanCardDTO,
  companyHolidays: Set<string> = new Set(),
  userLeavesByOwner?: Map<string, Set<string>>,
  asOfDate: Date = new Date(),
  _prebuiltOffDatesMap?: Map<string, Set<string>>
): CardTimingState {
  if (['WON', 'LOST', 'COMPLETED', 'CANCELLED'].includes(deal.status)) {
    return {
      isRed: false,
      isYellow: false,
      isDueToday: false,
      isPostHolidayCheckIn: false,
      threshold: null,
      yellowStart: null,
    };
  }

  const evalMs = asOfDate.getTime();
  const ownerPersonalLeaves = deal.ownerId ? userLeavesByOwner?.get(deal.ownerId) : undefined;

  // 1. If Due Date is set: Holiday & Personal-Leave-aware 3-stage workday evaluation in Asia/Bangkok
  if (deal.dueDate) {
    const dueSchedule = resolveDueDateSchedule(deal.dueDate, companyHolidays, ownerPersonalLeaves);

    if (evalMs >= dueSchedule.redStart.getTime()) {
      return {
        isRed: true,
        isYellow: false,
        isDueToday: false,
        isPostHolidayCheckIn: false,
        threshold: dueSchedule.redStart,
        yellowStart: dueSchedule.yellowStart,
      };
    }

    if (evalMs >= dueSchedule.yellowStart.getTime()) {
      return {
        isRed: false,
        isYellow: true,
        isDueToday: true,
        isPostHolidayCheckIn: false,
        threshold: null,
        yellowStart: dueSchedule.yellowStart,
      };
    }

    return {
      isRed: false,
      isYellow: false,
      isDueToday: false,
      isPostHolidayCheckIn: false,
      threshold: null,
      yellowStart: dueSchedule.yellowStart,
    };
  }

  // 2. No Due Date: Workday-aligned evaluation (+1 workday or +3 workdays) with Post-Holiday Check-In Cap
  const { baseDate, grantMs } = resolveLatestTimerLog(deal, asOfDate);
  if (!baseDate) {
    return {
      isRed: true,
      isYellow: false,
      isDueToday: false,
      isPostHolidayCheckIn: false,
      threshold: asOfDate,
      yellowStart: null,
    };
  }

  if (grantMs <= 0) {
    return {
      isRed: true,
      isYellow: false,
      isDueToday: false,
      isPostHolidayCheckIn: false,
      threshold: baseDate,
      yellowStart: baseDate,
    };
  }

  const timerSchedule = resolveWorkdayTimerSchedule(
    baseDate,
    grantMs,
    companyHolidays,
    ownerPersonalLeaves
  );

  if (evalMs >= timerSchedule.redStart.getTime()) {
    return {
      isRed: true,
      isYellow: false,
      isDueToday: false,
      isPostHolidayCheckIn: false,
      threshold: timerSchedule.redStart,
      yellowStart: timerSchedule.yellowStart,
    };
  }

  if (evalMs >= timerSchedule.yellowStart.getTime()) {
    return {
      isRed: false,
      isYellow: true,
      isDueToday: false,
      isPostHolidayCheckIn: timerSchedule.isPostHolidayCap,
      threshold: null,
      yellowStart: timerSchedule.yellowStart,
    };
  }

  return {
    isRed: false,
    isYellow: false,
    isDueToday: false,
    isPostHolidayCheckIn: false,
    threshold: null,
    yellowStart: timerSchedule.yellowStart,
  };
}

export function checkIsDueToday(
  deal: KanbanCardDTO,
  asOfDate: Date = new Date(),
  companyHolidays: Set<string> = new Set(),
  userLeavesByOwner?: Map<string, Set<string>>
): boolean {
  if (['WON', 'LOST', 'COMPLETED', 'CANCELLED'].includes(deal.status) || !deal.dueDate) {
    return false;
  }
  return evaluateCardTimingState(deal, companyHolidays, userLeavesByOwner, asOfDate).isDueToday;
}

export function checkIsYellowCard(
  deal: KanbanCardDTO,
  companyHolidays: Set<string> = new Set(),
  userLeavesByOwner?: Map<string, Set<string>>,
  asOfDate: Date = new Date(),
  prebuiltOffDatesMap?: Map<string, Set<string>>
): boolean {
  return evaluateCardTimingState(
    deal,
    companyHolidays,
    userLeavesByOwner,
    asOfDate,
    prebuiltOffDatesMap
  ).isYellow;
}

export function checkIsRedCard(
  deal: KanbanCardDTO,
  companyHolidays: Set<string> = new Set(),
  userLeavesByOwner?: Map<string, Set<string>>,
  asOfDate: Date = new Date(),
  prebuiltOffDatesMap?: Map<string, Set<string>>
): boolean {
  return evaluateCardTimingState(
    deal,
    companyHolidays,
    userLeavesByOwner,
    asOfDate,
    prebuiltOffDatesMap
  ).isRed;
}

export function getRedThreshold(
  deal: KanbanCardDTO,
  companyHolidays: Set<string> = new Set(),
  userLeavesByOwner?: Map<string, Set<string>>,
  asOfDate: Date = new Date(),
  prebuiltOffDatesMap?: Map<string, Set<string>>
): Date | null {
  return evaluateCardTimingState(
    deal,
    companyHolidays,
    userLeavesByOwner,
    asOfDate,
    prebuiltOffDatesMap
  ).threshold;
}

export type PendingAcceleratorItem = { count?: number; earliestPendingAt?: string | null } | number;

export function sortDeals<T extends KanbanCardDTO>(
  dealsList: T[],
  pendingAcceleratorsMap: Record<string, PendingAcceleratorItem> = {},
  companyHolidays: Set<string> = new Set(),
  userLeavesByOwner?: Map<string, Set<string>>,
  precomputedTimingMap?: Map<string, CardTimingState>
): T[] {
  const offDatesMap = precomputedTimingMap
    ? undefined
    : buildEffectiveOffDatesMap(companyHolidays, userLeavesByOwner);

  const timingState = new Map<string, CardTimingState>();
  const updatedMsMap = new Map<string, number>();

  for (const deal of dealsList) {
    const state =
      precomputedTimingMap?.get(deal.id) ??
      evaluateCardTimingState(deal, companyHolidays, userLeavesByOwner, new Date(), offDatesMap);
    timingState.set(deal.id, state);
    updatedMsMap.set(deal.id, deal.updatedAt ? new Date(deal.updatedAt).getTime() : 0);
  }

  return [...dealsList].sort((a, b) => {
    // 0. Star / Pinned Card check (Rule 0: pinned cards are ALWAYS at the top above all other rules)
    const aPinned = Boolean(a.isPinned);
    const bPinned = Boolean(b.isPinned);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;

    // 1. Orange Card check (Urgent / Manager Call with pendingCount > 0)
    const aInfo = pendingAcceleratorsMap[a.id];
    const bInfo = pendingAcceleratorsMap[b.id];
    const aPending = (typeof aInfo === 'number' ? aInfo : (aInfo?.count || 0)) > 0;
    const bPending = (typeof bInfo === 'number' ? bInfo : (bInfo?.count || 0)) > 0;
    if (aPending && !bPending) return -1;
    if (!aPending && bPending) return 1;

    // 2. Red Card check
    const aState = timingState.get(a.id);
    const bState = timingState.get(b.id);
    const aRed = aState?.isRed ?? false;
    const bRed = bState?.isRed ?? false;
    if (aRed && !bRed) return -1;
    if (!aRed && bRed) return 1;

    // Sub-sort within Red Cards: longest overdue RedTimer first
    if (aRed && bRed) {
      const aThreshold = aState?.threshold ?? null;
      const bThreshold = bState?.threshold ?? null;
      if (aThreshold && bThreshold) {
        const diff = aThreshold.getTime() - bThreshold.getTime();
        if (diff !== 0) return diff;
      } else if (aThreshold && !bThreshold) {
        return -1;
      } else if (!aThreshold && bThreshold) {
        return 1;
      }
    }

    // 2.5 Yellow Warning Cards (all final eligible workday cards: Due Today, Timer Final Day, or Post-Holiday Check-In) above normal cards
    const aYellow = Boolean(aState?.isYellow || aState?.isDueToday || aState?.isPostHolidayCheckIn);
    const bYellow = Boolean(bState?.isYellow || bState?.isDueToday || bState?.isPostHolidayCheckIn);
    if (aYellow && !bYellow) return -1;
    if (!aYellow && bYellow) return 1;

    // 3. Normal Cards: latest activity/update first
    const aTime = updatedMsMap.get(a.id) ?? 0;
    const bTime = updatedMsMap.get(b.id) ?? 0;
    if (bTime !== aTime) {
      return bTime - aTime;
    }
    return a.id.localeCompare(b.id);
  });
}
