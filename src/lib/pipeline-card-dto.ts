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
        { content: { startsWith: '[DUE DATE:' } },
        { content: { startsWith: '[URGENT_' } },
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
 * Strongly-typed Card DTO derived directly from Prisma's type system.
 */
export type KanbanCardDTO = Prisma.OpportunityGetPayload<{ select: typeof pipelineCardSelect }>;
export type PipelineCardDTO = KanbanCardDTO;

import {
  calculateElapsedWorkingMs,
  addWorkingMs,
  RED_CARD_WORKING_MS_THRESHOLD,
} from './business-days';

export function checkIsRedCard(
  deal: KanbanCardDTO,
  companyHolidays: Set<string> = new Set(),
  userLeavesByOwner?: Map<string, Set<string>>,
  asOfDate: Date = new Date()
): boolean {
  if (['WON', 'LOST', 'COMPLETED', 'CANCELLED'].includes(deal.status)) {
    return false;
  }

  let effectiveOffDates = companyHolidays;
  if (deal.ownerId && userLeavesByOwner?.has(deal.ownerId)) {
    const ownerLeaves = userLeavesByOwner.get(deal.ownerId)!;
    effectiveOffDates = new Set([...companyHolidays, ...ownerLeaves]);
  }

  const evaluationDate = asOfDate;
  const today = new Date(evaluationDate);
  today.setHours(0, 0, 0, 0);

  const dueDate = deal.dueDate ? new Date(deal.dueDate) : null;
  if (dueDate) {
    dueDate.setHours(0, 0, 0, 0);
  }

  // 1. If Due Date is set:
  if (dueDate) {
    if (dueDate <= today) {
      return true;
    }
    return false;
  }

  // 2. If NO Due Date is set: 28.5 working hours without update -> Red Card
  // Working hours: 08:00 - 17:30, paused on nights, Sundays, Dayoffs & Leaves
  let newestDate: Date | null = null;
  if (deal.activityLogs && deal.activityLogs.length > 0) {
    const validLogs = deal.activityLogs.filter(
      (log) =>
        log.type === 'COMMENT' &&
        new Date(log.createdAt) <= evaluationDate &&
        !log.content.startsWith('[DUE DATE:') &&
        !log.content.startsWith('[URGENT_')
    );
    if (validLogs.length > 0) {
      newestDate = new Date(validLogs[0].createdAt);
    }
  }

  const baseDate = newestDate || (deal.createdAt ? new Date(deal.createdAt) : null);
  if (!baseDate) return true;

  const elapsedWorkingMs = calculateElapsedWorkingMs(baseDate, evaluationDate, effectiveOffDates);
  return elapsedWorkingMs >= RED_CARD_WORKING_MS_THRESHOLD;
}

export function getRedThreshold(
  deal: KanbanCardDTO,
  companyHolidays: Set<string> = new Set(),
  userLeavesByOwner?: Map<string, Set<string>>
): Date | null {
  if (['WON', 'LOST', 'COMPLETED', 'CANCELLED'].includes(deal.status)) {
    return null;
  }

  let effectiveOffDates = companyHolidays;
  if (deal.ownerId && userLeavesByOwner?.has(deal.ownerId)) {
    const ownerLeaves = userLeavesByOwner.get(deal.ownerId)!;
    effectiveOffDates = new Set([...companyHolidays, ...ownerLeaves]);
  }

  const dueDate = deal.dueDate ? new Date(deal.dueDate) : null;
  const now = new Date();

  // If there is an active Due Date:
  if (dueDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueMidnight = new Date(dueDate);
    dueMidnight.setHours(0, 0, 0, 0);

    if (dueMidnight <= today) {
      return dueDate;
    }
    return null;
  }

  // If NO Due Date: 28.5 working hours threshold from latest activity or creation
  let newestDate: Date | null = null;
  if (deal.activityLogs && deal.activityLogs.length > 0) {
    const validLogs = deal.activityLogs.filter(
      (log) =>
        log.type === 'COMMENT' &&
        !log.content.startsWith('[DUE DATE:') &&
        !log.content.startsWith('[URGENT_')
    );
    if (validLogs.length > 0) {
      newestDate = new Date(validLogs[0].createdAt);
    }
  }

  const baseDate = newestDate || (deal.createdAt ? new Date(deal.createdAt) : null);
  if (baseDate) {
    const threshold = addWorkingMs(baseDate, RED_CARD_WORKING_MS_THRESHOLD, effectiveOffDates);
    if (now >= threshold) {
      return threshold;
    }
  }

  return null;
}

export type PendingAcceleratorItem = { count?: number; earliestPendingAt?: string | null } | number;

export function sortDeals<T extends KanbanCardDTO>(
  dealsList: T[],
  pendingAcceleratorsMap: Record<string, PendingAcceleratorItem> = {},
  companyHolidays: Set<string> = new Set(),
  userLeavesByOwner?: Map<string, Set<string>>
): T[] {
  return [...dealsList].sort((a, b) => {
    // 1. Orange Card check (Urgent / Manager Call with pendingCount > 0)
    const aInfo = pendingAcceleratorsMap[a.id];
    const bInfo = pendingAcceleratorsMap[b.id];
    const aPending = (typeof aInfo === 'number' ? aInfo : (aInfo?.count || 0)) > 0;
    const bPending = (typeof bInfo === 'number' ? bInfo : (bInfo?.count || 0)) > 0;
    if (aPending && !bPending) return -1;
    if (!aPending && bPending) return 1;

    // 2. Red Card check
    const aRed = checkIsRedCard(a, companyHolidays, userLeavesByOwner);
    const bRed = checkIsRedCard(b, companyHolidays, userLeavesByOwner);
    if (aRed && !bRed) return -1;
    if (!aRed && bRed) return 1;

    // Sub-sort within Red Cards: longest overdue RedTimer first
    if (aRed && bRed) {
      const aThreshold = getRedThreshold(a, companyHolidays, userLeavesByOwner);
      const bThreshold = getRedThreshold(b, companyHolidays, userLeavesByOwner);
      if (aThreshold && bThreshold) {
        const diff = aThreshold.getTime() - bThreshold.getTime();
        if (diff !== 0) return diff;
      } else if (aThreshold && !bThreshold) {
        return -1;
      } else if (!aThreshold && bThreshold) {
        return 1;
      }
    }

    // 3. Normal Cards: latest activity/update first
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    if (bTime !== aTime) {
      return bTime - aTime;
    }
    return a.id.localeCompare(b.id);
  });
}
