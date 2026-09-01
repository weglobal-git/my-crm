import 'server-only';

import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getOpportunityAccessWhere, type PipelineActor } from '@/lib/pipeline-security';

export const pipelineOpportunitySelect = {
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
  company: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true, email: true, image: true } },
  teamMembers: { select: { id: true, name: true, image: true } },
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
  activityLogs: {
    where: {
      parentId: null,
      type: 'COMMENT' as const,
      NOT: { content: { startsWith: '[DUE DATE:' } },
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
};

export async function getPipelineOpportunitiesForActor(
  actor: PipelineActor,
  tab: string,
  searchQuery?: string,
) {
  const where: Prisma.OpportunityWhereInput = {
    ...getOpportunityAccessWhere(actor),
    status: tab === 'completed'
      ? { in: ['WON', 'LOST', 'COMPLETED', 'CANCELLED'] }
      : 'OPEN',
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

  return JSON.stringify(data);
}
