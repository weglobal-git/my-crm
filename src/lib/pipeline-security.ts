import 'server-only';

import { getServerSession } from 'next-auth';
import type { Prisma, Role } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { pusherServer } from '@/lib/pusher-server';
import { buildOpportunityAccessWhere } from '@/lib/access/pipeline-policy';
import { resolveAccessContext, toPipelineActor, type AccessContext } from '@/lib/access/access-context';
import { can, requireCapability, type PipelineCapability } from '@/lib/access/pipeline-capabilities';

export { can, requireCapability, type PipelineCapability };

export type PipelineActor = {
  id: string;
  name?: string | null;
  role: Role;
  departments: string[];
  departmentIds?: string[];
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
  let departmentIds = Array.isArray(session.user.departmentIds)
    ? session.user.departmentIds.filter((id): id is string => typeof id === 'string')
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
      departmentIds = dbUser.departments.map((d: { id: string }) => d.id);
    }
  }

  if (!userId) throw new Error('Unauthorized');
  if (!['ADMIN', 'MANAGEMENT', 'GENERAL'].includes(role)) throw new Error('Forbidden');

  return { id: userId, name, role, departments, departmentIds };
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

export async function requirePipelineActor(): Promise<PipelineActor> {
  const context = await resolveAccessContext();
  if (!context.hasPipelineAccess) throw new Error('Forbidden');
  return toPipelineActor(context);
}

export function getOpportunityAccessWhere(actor: PipelineActor): Prisma.OpportunityWhereInput {
  return buildOpportunityAccessWhere(actor);
}

export async function requireOpportunityAccess(
  opportunityId: string,
  options: {
    capability?: PipelineCapability;
    ownerOrAdmin?: boolean;
    adminOnly?: boolean;
    actor?: PipelineActor;
    context?: AccessContext;
  } = {},
) {
  const context = options.context ?? (options.actor ? undefined : await resolveAccessContext());
  const actor: PipelineActor = options.actor ?? (context
    ? toPipelineActor(context)
    : await getPipelineActorFromSession());

  const pipelineAllowed = context ? context.hasPipelineAccess : await hasPipelinePermission(actor);
  if (!pipelineAllowed) throw new Error('Forbidden');

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, ...buildOpportunityAccessWhere(actor) },
    select: {
      id: true,
      ownerId: true,
      type: true,
      status: true,
      updatedAt: true,
      owner: { select: { id: true, departments: { select: { id: true, name: true } } } },
      teamMembers: { select: { id: true, departments: { select: { id: true, name: true } } } },
    },
  });

  if (!opportunity) throw new Error('Forbidden');

  // Capability vocabulary as primary authority
  if (options.capability) {
    requireCapability(actor, options.capability, opportunity);
  } else if (options.adminOnly) {
    if (actor.role !== 'ADMIN') throw new Error('Forbidden');
  } else if (options.ownerOrAdmin) {
    requireCapability(actor, 'deal:manage_members', opportunity);
  } else {
    requireCapability(actor, 'deal:view', opportunity);
  }

  return { actor, opportunity, context };
}

export type OpportunityDateField = 'goodsReadyDate' | 'goodsLoadingDate' | 'dueDate';

/** Shared server-side policy for every deal-date mutation entry point. */
export async function requireOpportunityDateEdit(
  opportunityId: string,
  field: OpportunityDateField,
  actorOverride?: PipelineActor,
) {
  const access = await requireOpportunityAccess(opportunityId, {
    actor: actorOverride,
    capability: 'deal:edit_dates',
  });
  const opportunity = access.opportunity;

  if (['WON', 'LOST', 'COMPLETED', 'CANCELLED'].includes(opportunity.status)) {
    throw new Error('ARCHIVED_DEAL');
  }

  if (field === 'goodsReadyDate' || field === 'goodsLoadingDate') {
    if (opportunity.type !== 'SALES_DEAL') throw new Error('Forbidden');
    if (access.actor.role !== 'ADMIN') {
      const allowed = await prisma.departmentMenuPermission.findFirst({
        where: {
          visible: true,
          menuItem: { key: 'pipeline.information' },
          department: { users: { some: { id: access.actor.id } } },
        },
        select: { id: true },
      });
      if (!allowed) throw new Error('Forbidden');
    }
  }

  return { ...access, opportunity };
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

/**
 * Resolves all user IDs authorized to view the Pipeline workspace.
 * Limited to ADMIN or users belonging to a department with visible pipeline permission.
 */
export async function resolvePipelineAudience(): Promise<string[]> {
  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { role: 'ADMIN' },
          {
            departments: {
              some: {
                permissions: {
                  some: {
                    visible: true,
                    menuItem: { key: 'pipeline' },
                  },
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  } catch (err) {
    console.error('[PIPELINE-SECURITY] Failed to resolve pipeline audience:', err);
    return [];
  }
}

/**
 * Broadcasts a lightweight pipeline notification across all authorized pipeline users.
 * Uses batching of 90 channels per trigger call to respect Pusher limits.
 */
export async function notifyPipelineAudience(payload: unknown): Promise<void> {
  try {
    const recipientIds = await resolvePipelineAudience();
    if (recipientIds.length === 0) return;

    const action = (payload as { action?: string } | null | undefined)?.action || 'UNKNOWN';
    console.log(`[PUSHER-SERVER-TRIGGER] notifyPipelineAudience action="${action}" to ${recipientIds.length} recipients`);

    for (let i = 0; i < recipientIds.length; i += 90) {
      const channels = recipientIds.slice(i, i + 90).map((uid) => `private-pipeline-${uid}`);
      await pusherServer.trigger(channels, 'pipeline-updated', payload);
    }
  } catch (error) {
    console.error('[PUSHER-SERVER-TRIGGER] notifyPipelineAudience error:', error);
  }
}
