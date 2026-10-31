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
  calculateElapsedWorkingMs,
  addWorkingMs,
  RED_CARD_WORKING_MS_THRESHOLD,
  WORK_MS_PER_DAY,
  WORK_DAY_END_HOUR,
  WORK_DAY_END_MINUTE,
  toBangkokDateParts,
  createBangkokDate,
  isPostHolidayCheckInDay,
} from './business-days';
import { getCommentGrantMs, parseTierPrefix } from './pipeline-update-quality';

export interface CardTimingState {
  isRed: boolean;
  isDueToday: boolean;
  isPostHolidayCheckIn: boolean;
  threshold: Date | null;
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
      if (log.type !== 'COMMENT') continue;
      const content = log.content || '';
      if (content.startsWith('[URGENT_') || content.startsWith('[TIER:0H]')) continue;
      if (content.startsWith('[DUE DATE:') && !content.startsWith('[DUE DATE: Removed]')) {
        continue;
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
      if (latestLog.content.startsWith('[DUE DATE: Removed]')) {
        // Removing a Due Date grants a 9h grace floor (or preserves higher embedded [TIER:9H:XX] ceiling)
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
 * Single-pass timing evaluator for Kanban cards and Leaderboard sampling.
 * - Stage 1 (00:00–16:59:59 Bangkok on Due Date): `isDueToday = true`, `isRed = false`
 * - Stage 2 (>= 17:00:00 Bangkok on Due Date, or past days): `isRed = true`
 * - No Due Date: uses latest timer-eligible comment's granted window (+9h or +27h) + Post-Holiday Check-In Cap
 */
export function evaluateCardTimingState(
  deal: KanbanCardDTO,
  companyHolidays: Set<string> = new Set(),
  userLeavesByOwner?: Map<string, Set<string>>,
  asOfDate: Date = new Date(),
  prebuiltOffDatesMap?: Map<string, Set<string>>
): CardTimingState {
  if (['WON', 'LOST', 'COMPLETED', 'CANCELLED'].includes(deal.status)) {
    return { isRed: false, isDueToday: false, isPostHolidayCheckIn: false, threshold: null };
  }

  const evalMs = asOfDate.getTime();

  // 1. If Due Date is set: 2-stage evaluation in Asia/Bangkok
  if (deal.dueDate) {
    const dueParts = toBangkokDateParts(new Date(deal.dueDate));
    const dueMidnight = createBangkokDate(dueParts.year, dueParts.month, dueParts.date, 0, 0, 0);
    const dueWorkEnd = createBangkokDate(
      dueParts.year,
      dueParts.month,
      dueParts.date,
      WORK_DAY_END_HOUR,
      WORK_DAY_END_MINUTE,
      0
    );

    if (evalMs >= dueWorkEnd.getTime()) {
      return {
        isRed: true,
        isDueToday: false,
        isPostHolidayCheckIn: false,
        threshold: dueWorkEnd,
      };
    }

    if (evalMs >= dueMidnight.getTime()) {
      return {
        isRed: false,
        isDueToday: true,
        isPostHolidayCheckIn: false,
        threshold: null,
      };
    }

    return {
      isRed: false,
      isDueToday: false,
      isPostHolidayCheckIn: false,
      threshold: null,
    };
  }

  // 2. No Due Date: evaluate working-hours ceiling (+9h or +27h) with Post-Holiday Check-In Cap
  const ownerPersonalLeaves = deal.ownerId ? userLeavesByOwner?.get(deal.ownerId) : undefined;

  const { baseDate, grantMs } = resolveLatestTimerLog(deal, asOfDate);
  if (!baseDate) {
    return { isRed: true, isDueToday: false, isPostHolidayCheckIn: false, threshold: asOfDate };
  }

  if (grantMs <= 0) {
    return { isRed: true, isDueToday: false, isPostHolidayCheckIn: false, threshold: baseDate };
  }

  const elapsedWorkingMs = calculateElapsedWorkingMs(baseDate, asOfDate, companyHolidays, {
    ceilingMs: grantMs,
    stopAtMs: grantMs,
    personalLeaves: ownerPersonalLeaves,
  });

  if (elapsedWorkingMs >= grantMs) {
    const threshold = addWorkingMs(baseDate, grantMs, companyHolidays, ownerPersonalLeaves);
    return {
      isRed: true,
      isDueToday: false,
      isPostHolidayCheckIn: false,
      threshold,
    };
  }

  const isPostHoliday = isPostHolidayCheckInDay(
    baseDate,
    asOfDate,
    companyHolidays,
    ownerPersonalLeaves
  );
  return {
    isRed: false,
    isDueToday: false,
    isPostHolidayCheckIn: isPostHoliday,
    threshold: null,
  };
}

export function checkIsDueToday(deal: KanbanCardDTO, asOfDate: Date = new Date()): boolean {
  if (['WON', 'LOST', 'COMPLETED', 'CANCELLED'].includes(deal.status) || !deal.dueDate) {
    return false;
  }
  const dueParts = toBangkokDateParts(new Date(deal.dueDate));
  const dueMidnight = createBangkokDate(dueParts.year, dueParts.month, dueParts.date, 0, 0, 0);
  const dueWorkEnd = createBangkokDate(
    dueParts.year,
    dueParts.month,
    dueParts.date,
    WORK_DAY_END_HOUR,
    WORK_DAY_END_MINUTE,
    0
  );
  const t = asOfDate.getTime();
  return t >= dueMidnight.getTime() && t < dueWorkEnd.getTime();
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

    // 2.5 Amber Warning Cards (Due Today 08:00–17:00 or Post-Holiday Check-In Day) above normal cards
    const aAmber = Boolean(aState?.isDueToday || aState?.isPostHolidayCheckIn);
    const bAmber = Boolean(bState?.isDueToday || bState?.isPostHolidayCheckIn);
    if (aAmber && !bAmber) return -1;
    if (!aAmber && bAmber) return 1;

    // 3. Normal Cards: latest activity/update first
    const aTime = updatedMsMap.get(a.id) ?? 0;
    const bTime = updatedMsMap.get(b.id) ?? 0;
    if (bTime !== aTime) {
      return bTime - aTime;
    }
    return a.id.localeCompare(b.id);
  });
}
