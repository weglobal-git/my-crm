import 'server-only';

import { getServerSession } from 'next-auth';
import type { Prisma, Role } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { pusherServer } from '@/lib/pusher-server';

export type PipelineActor = {
  id: string;
  name?: string | null;
  role: Role;
  departments: string[];
};

async function getPipelineActorFromSession(): Promise<PipelineActor> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  let userId = session.user.id;
  let name = session.user.name;
  let role = session.user.role as Role;
  let departments = Array.isArray(session.user.departments)
    ? session.user.departments.filter((name): name is string => typeof name === 'string')
    : [];

  if (!userId && session.user.email) {
    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { departments: true }
    });
    if (dbUser) {
      userId = dbUser.id;
      name = dbUser.name;
      role = dbUser.role;
      departments = dbUser.departments.map((d: { name: string }) => d.name);
    }
  }

  if (!userId) throw new Error('Unauthorized');
  if (!['ADMIN', 'MANAGEMENT', 'GENERAL'].includes(role)) throw new Error('Forbidden');

  return { id: userId, name, role, departments };
}

// In-memory TTL caches to optimize latency and eliminate duplicate queries
const pipelinePermissionCache = new Map<string, { expiresAt: number; allowed: boolean }>();
const pipelineRecipientCache = new Map<string, { expiresAt: number; userIds: string[] }>();

async function hasPipelinePermission(actor: PipelineActor) {
  if (actor.role === 'ADMIN') return true;

  const now = Date.now();
  const cached = pipelinePermissionCache.get(actor.id);
  if (cached && cached.expiresAt > now) {
    return cached.allowed;
  }

  const pipelinePermission = await prisma.departmentMenuPermission.findFirst({
    where: {
      visible: true,
      menuItem: { key: 'pipeline' },
      department: { users: { some: { id: actor.id } } },
    },
    select: { id: true },
  });
  const allowed = Boolean(pipelinePermission);
  pipelinePermissionCache.set(actor.id, { expiresAt: now + 30_000, allowed });
  return allowed;
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
  if (options.ownerOrAdmin && !['ADMIN', 'MANAGEMENT'].includes(actor.role) && opportunity.ownerId !== actor.id) {
    throw new Error('Forbidden');
  }

  return { actor, opportunity };
}

export function invalidatePipelineRecipientCache(opportunityId?: string) {
  if (opportunityId) {
    pipelineRecipientCache.delete(opportunityId);
  } else {
    pipelineRecipientCache.clear();
  }
}

export async function getPipelineRecipientUserIds(opportunityId: string): Promise<string[]> {
  const now = Date.now();
  const cached = pipelineRecipientCache.get(opportunityId);
  if (cached && cached.expiresAt > now) {
    return cached.userIds;
  }

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

  const departmentIds = new Set<string>();
  if (opportunity.owner?.departments) {
    for (const d of opportunity.owner.departments) {
      if (d.id) departmentIds.add(d.id);
    }
  }
  for (const member of opportunity.teamMembers || []) {
    for (const d of member.departments || []) {
      if (d.id) departmentIds.add(d.id);
    }
  }

  const directUserIds = [
    ...(opportunity.ownerId ? [opportunity.ownerId] : []),
    ...(opportunity.teamMembers || []).map((m: { id: string }) => m.id),
  ];

  // Include ADMINs, direct deal owners/members, and all colleagues in the deal's departments
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { role: 'ADMIN' },
        ...(directUserIds.length > 0 ? [{ id: { in: directUserIds } }] : []),
        ...(departmentIds.size > 0
          ? [{ departments: { some: { id: { in: [...departmentIds] } } } }]
          : []),
      ],
    },
    select: { id: true },
  });

  const userIds = users.map((user: { id: string }) => user.id);
  pipelineRecipientCache.set(opportunityId, { expiresAt: now + 10_000, userIds });
  return userIds;
}

export async function notifyPrivatePipelineUpdate(

  opportunityId: string,
  payload: unknown,
  additionalRecipientIds: string[] = [],
) {
  try {
    const rawRecipients = await getPipelineRecipientUserIds(opportunityId);
    const recipientIds = new Set([
      ...rawRecipients,
      ...additionalRecipientIds,
    ]);
    console.log(`[PUSHER-SERVER-TRIGGER] notifyPrivatePipelineUpdate for deal="${opportunityId}", recipients count=${recipientIds.size}:`, [...recipientIds]);
    if (recipientIds.size === 0) {
      console.warn(`[PUSHER-SERVER-TRIGGER] No recipients found for deal="${opportunityId}", aborting trigger.`);
      return;
    }

    const channels = [...recipientIds].map(userId => `private-pipeline-${userId}`);
    const action = (payload as { action?: string } | null | undefined)?.action || "UNKNOWN";
    console.log(`[PUSHER-SERVER-TRIGGER] Triggering event="pipeline-updated" action="${action}" on ${channels.length} channels:`, channels);
    const response = await pusherServer.trigger(channels, 'pipeline-updated', payload);
    console.log(`[PUSHER-SERVER-TRIGGER] Pusher trigger response status: ${response?.status || 'OK'}`);
  } catch (error) {
    console.error('[PUSHER-SERVER-TRIGGER] Private pipeline Pusher trigger error:', error);
  }
}

