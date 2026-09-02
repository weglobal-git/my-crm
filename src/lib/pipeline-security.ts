import 'server-only';

import { getServerSession } from 'next-auth';
import type { Prisma, Role } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { pusherServer } from '@/lib/pusher';

export type PipelineActor = {
  id: string;
  role: Role;
  departments: string[];
};

async function getPipelineActorFromSession(): Promise<PipelineActor> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Unauthorized');

  const role = session.user.role as Role;
  const departments = Array.isArray(session.user.departments)
    ? session.user.departments.filter((name): name is string => typeof name === 'string')
    : [];

  if (!['ADMIN', 'MANAGEMENT', 'GENERAL'].includes(role)) throw new Error('Forbidden');

  return { id: session.user.id, role, departments };
}

async function hasPipelinePermission(actor: PipelineActor) {
  if (actor.role === 'ADMIN') return true;

  const pipelinePermission = await prisma.departmentMenuPermission.findFirst({
    where: {
      visible: true,
      menuItem: { key: 'pipeline' },
      department: { users: { some: { id: actor.id } } },
    },
    select: { id: true },
  });
  return Boolean(pipelinePermission);
}

export async function requirePipelineActor(actorOverride?: PipelineActor): Promise<PipelineActor> {
  const actor = actorOverride ?? await getPipelineActorFromSession();
  if (!await hasPipelinePermission(actor)) throw new Error('Forbidden');
  return actor;
}

export function getOpportunityAccessWhere(actor: PipelineActor): Prisma.OpportunityWhereInput {
  if (actor.role === 'ADMIN') return {};

  if (actor.role === 'MANAGEMENT' && actor.departments.length > 0) {
    return {
      OR: [
        { owner: { departments: { some: { name: { in: actor.departments } } } } },
        { teamMembers: { some: { departments: { some: { name: { in: actor.departments } } } } } },
      ],
    };
  }

  return {
    OR: [
      { ownerId: actor.id },
      { teamMembers: { some: { id: actor.id } } },
    ],
  };
}

export async function requireOpportunityAccess(
  opportunityId: string,
  options: { ownerOrAdmin?: boolean; adminOnly?: boolean; actor?: PipelineActor } = {},
) {
  const actor = options.actor ?? await getPipelineActorFromSession();
  const [pipelineAllowed, opportunity] = await Promise.all([
    hasPipelinePermission(actor),
    prisma.opportunity.findFirst({
      where: { id: opportunityId, ...getOpportunityAccessWhere(actor) },
      select: { id: true, ownerId: true },
    }),
  ]);

  if (!pipelineAllowed || !opportunity) throw new Error('Forbidden');
  if (options.adminOnly && actor.role !== 'ADMIN') throw new Error('Forbidden');
  if (options.ownerOrAdmin && actor.role !== 'ADMIN' && opportunity.ownerId !== actor.id) {
    throw new Error('Forbidden');
  }

  return { actor, opportunity };
}

export async function getPipelineRecipientUserIds(opportunityId: string): Promise<string[]> {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: {
      ownerId: true,
      owner: { select: { departments: { select: { id: true } } } },
      teamMembers: {
        select: { id: true, departments: { select: { id: true } } },
      },
    },
  });
  if (!opportunity) return [];

  const departmentIds = new Set(opportunity.owner.departments.map(department => department.id));
  for (const member of opportunity.teamMembers) {
    for (const department of member.departments) departmentIds.add(department.id);
  }

  const directUserIds = [opportunity.ownerId, ...opportunity.teamMembers.map(member => member.id)];
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { role: 'ADMIN' },
        { id: { in: directUserIds } },
        ...(departmentIds.size > 0
          ? [{ role: 'MANAGEMENT' as const, departments: { some: { id: { in: [...departmentIds] } } } }]
          : []),
      ],
    },
    select: { id: true },
  });

  return users.map(user => user.id);
}

export async function notifyPrivatePipelineUpdate(
  opportunityId: string,
  payload: unknown,
  additionalRecipientIds: string[] = [],
) {
  try {
    const recipientIds = new Set([
      ...(await getPipelineRecipientUserIds(opportunityId)),
      ...additionalRecipientIds,
    ]);
    if (recipientIds.size === 0) return;

    const channels = [...recipientIds].map(userId => `private-pipeline-${userId}`);
    await pusherServer.trigger(channels, 'pipeline-updated', payload);
  } catch (error) {
    console.error('Private pipeline Pusher trigger error:', error);
  }
}
