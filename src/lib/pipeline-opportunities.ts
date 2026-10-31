import 'server-only';

import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getOpportunityAccessWhere, type PipelineActor } from '@/lib/pipeline-security';

import { pipelineCardSelect, type KanbanCardDTO, type PipelineCardDTO } from './pipeline-card-dto';
import { recordPipelineActionMetric } from './pipeline-action-telemetry';

import { toBangkokDateParts, createBangkokDate, isDueDateFulfilled } from './business-days';

export { isDueDateFulfilled };
export const pipelineOpportunitySelect = pipelineCardSelect;
export type { KanbanCardDTO, PipelineCardDTO };

/**
 * Builds the authoritative server SQL search where clause for Pipeline.
 * Matches: topic, company legal name, company displayName, deal owner name, invoiceId, and reserveId.
 */
export function buildPipelineSearchWhere(searchQuery?: string): Prisma.OpportunityWhereInput {
  const trimmed = searchQuery?.trim();
  if (!trimmed) return {};
  return {
    OR: [
      { topic: { contains: trimmed, mode: 'insensitive' } },
      { company: { name: { contains: trimmed, mode: 'insensitive' } } },
      { company: { displayName: { contains: trimmed, mode: 'insensitive' } } },
      { owner: { name: { contains: trimmed, mode: 'insensitive' } } },
      { invoiceId: { contains: trimmed, mode: 'insensitive' } },
      { reserveId: { contains: trimmed, mode: 'insensitive' } },
    ],
  };
}

export async function getPipelineOpportunitiesListForActor(
  actor: PipelineActor,
  tab: string,
  searchQuery?: string,
  limit?: number,
): Promise<{ data: KanbanCardDTO[]; dbDurationMs: number; totalDurationMs: number }> {
  const startedAt = performance.now();
  const isCompleted = tab === 'completed';
  const where: Prisma.OpportunityWhereInput = {
    ...getOpportunityAccessWhere(actor),
    status: isCompleted
      ? { in: ['WON', 'LOST', 'COMPLETED', 'CANCELLED'] }
      : 'OPEN',
    ...(isCompleted ? {} : { pipelineStageId: { not: null } }),
  };

  if (searchQuery) {
    const searchWhere = buildPipelineSearchWhere(searchQuery);
    if (searchWhere.OR) {
      where.AND = [{ OR: searchWhere.OR }];
    }
  }

  // For completed archive, default page 1 limit is 20.
  // For active board, Kanban requires all active deals across stages to calculate
  // column cards, stage revenue totals, and client-side searching accurately.
  // We do not hard-cap active cards without a stage-level pagination or virtualization contract.
  const effectiveLimit = limit !== undefined ? limit : (isCompleted ? 20 : undefined);

  const dbStart = performance.now();
  const data = await prisma.opportunity.findMany({
    // `npm run build` regenerates Prisma Client. A running dev process can
    // retain the older client in memory until it is restarted.
    ...(process.env.NODE_ENV === 'production' ? { relationLoadStrategy: 'join' as const } : {}),
    where,
    select: pipelineOpportunitySelect,
    orderBy: isCompleted
      ? [{ closedAt: { sort: 'desc' as const, nulls: 'last' as const } }, { id: 'desc' as const }]
      : { updatedAt: 'desc' as const },
    take: effectiveLimit,
  });
  const dbDurationMs = performance.now() - dbStart;
  const totalDurationMs = performance.now() - startedAt;

  return { data: data as unknown as KanbanCardDTO[], dbDurationMs, totalDurationMs };
}

export async function getPipelineOpportunitiesForActor(
  actor: PipelineActor,
  tab: string,
  searchQuery?: string,
  limit?: number,
) {
  const isCompleted = tab === 'completed';
  const { data, dbDurationMs, totalDurationMs } = await getPipelineOpportunitiesListForActor(
    actor,
    tab,
    searchQuery,
    limit
  );

  const serialized = JSON.stringify(data);
  const payloadBytes = Buffer.byteLength(serialized, 'utf8');
  if (!isCompleted && payloadBytes > 1_500_000) {
    console.warn(`[PIPELINE_PAYLOAD_WARNING] Active board payload size (${payloadBytes} bytes, ${data.length} deals) exceeded 1.5MB budget for user ${actor.id}`);
  }

  recordPipelineActionMetric({
    action: 'getPipelineOpportunities',
    role: actor.role,
    status: 'SUCCESS',
    durationMs: totalDurationMs,
    dbDurationMs,
    payloadSizeBytes: payloadBytes,
  });

  return serialized;
}

/**
 * Maintenance helper to batch clean up legacy fulfilled due dates.
 * This is designed for governed background/cron jobs, NEVER interactive board reads.
 */
export async function maintainFulfilledDueDates(): Promise<number> {
  const nowParts = toBangkokDateParts(new Date());
  const endOfTodayBangkok = createBangkokDate(
    nowParts.year,
    nowParts.month,
    nowParts.date,
    23,
    59,
    59,
    999
  );

  const candidates = await prisma.opportunity.findMany({
    where: {
      dueDate: { lte: endOfTodayBangkok },
    },
    select: {
      id: true,
      dueDate: true,
      activityLogs: {
        where: {
          parentId: null,
          type: 'COMMENT',
          NOT: [
            { content: { startsWith: '[DUE DATE:' } },
            { content: { startsWith: '[URGENT_' } },
            { content: { startsWith: '[TIER:0H]' } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const expiredFulfilledIds: string[] = [];
  for (const opp of candidates) {
    if (opp.dueDate && opp.activityLogs.length > 0) {
      if (isDueDateFulfilled(opp.dueDate, opp.activityLogs[0].createdAt)) {
        expiredFulfilledIds.push(opp.id);
      }
    }
  }

  if (expiredFulfilledIds.length > 0) {
    const res = await prisma.opportunity.updateMany({
      where: { id: { in: expiredFulfilledIds } },
      data: { dueDate: null },
    });
    console.log(`[PIPELINE-MAINTENANCE] Cleared ${res.count} fulfilled due dates.`);
    return res.count;
  }
  return 0;
}
