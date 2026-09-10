import 'server-only';

import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getOpportunityAccessWhere, type PipelineActor } from '@/lib/pipeline-security';

import { pipelineCardSelect, type KanbanCardDTO, type PipelineCardDTO } from './pipeline-card-dto';

export const pipelineOpportunitySelect = pipelineCardSelect;
export type { KanbanCardDTO, PipelineCardDTO };

export async function getPipelineOpportunitiesForActor(
  actor: PipelineActor,
  tab: string,
  searchQuery?: string,
) {
  const isCompleted = tab === 'completed';
  const where: Prisma.OpportunityWhereInput = {
    ...getOpportunityAccessWhere(actor),
    status: isCompleted
      ? { in: ['WON', 'LOST', 'COMPLETED', 'CANCELLED'] }
      : 'OPEN',
    ...(isCompleted ? {} : { pipelineStageId: { not: null } }),
  };

  if (searchQuery) {
    where.AND = [{
      OR: [
        { topic: { contains: searchQuery, mode: 'insensitive' } },
        { company: { name: { contains: searchQuery, mode: 'insensitive' } } },
      ],
    }];
  }

  const data = await prisma.opportunity.findMany({
    // `npm run build` regenerates Prisma Client. A running dev process can
    // retain the older client in memory until it is restarted.
    ...(process.env.NODE_ENV === 'production' ? { relationLoadStrategy: 'join' as const } : {}),
    where,
    select: pipelineOpportunitySelect,
    orderBy: tab === 'completed' ? { closedAt: 'desc' as const } : { updatedAt: 'desc' as const },
    take: tab === 'completed' ? 20 : undefined,
  });

  // Auto-clear due dates that have already been fulfilled:
  // If a deal's due date has arrived/passed (today >= dueDate) and an activity update
  // was posted on or after that due date, clear the due date so it doesn't linger.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiredFulfilledIds: string[] = [];
  data.forEach((opp) => {
    if (opp.dueDate) {
      const dueMidnight = new Date(opp.dueDate);
      dueMidnight.setHours(0, 0, 0, 0);
      if (dueMidnight <= today && opp.activityLogs && opp.activityLogs.length > 0) {
        const latestLogDate = new Date(opp.activityLogs[0].createdAt);
        latestLogDate.setHours(0, 0, 0, 0);
        if (latestLogDate >= dueMidnight) {
          opp.dueDate = null;
          expiredFulfilledIds.push(opp.id);
        }
      }
    }
  });

  if (expiredFulfilledIds.length > 0) {
    prisma.opportunity.updateMany({
      where: { id: { in: expiredFulfilledIds } },
      data: { dueDate: null },
    }).catch((err: unknown) => console.error("Failed to auto-clear fulfilled due dates:", err));
  }

  return JSON.stringify(data);
}
