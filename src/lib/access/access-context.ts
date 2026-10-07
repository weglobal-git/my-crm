import 'server-only';

import { cache } from 'react';
import { getServerSession } from 'next-auth';
import type { Role } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import type { PipelineActor } from '@/lib/pipeline-security';

export interface AccessContext {
  userId: string;
  name?: string | null;
  role: Role;
  departments: string[];
  departmentIds: string[];
  hasPipelineAccess: boolean;
}

// In-memory TTL cache for user menu permissions to avoid redundant Neon Postgres queries across server actions
const userPipelineAccessCache = new Map<string, { expiresAt: number; hasAccess: boolean }>();

export function clearUserPipelineAccessCache(userId?: string) {
  if (userId) userPipelineAccessCache.delete(userId);
  else userPipelineAccessCache.clear();
}

/**
 * Request-scoped Access Context resolver.
 * Wrapped in React.cache() to deduplicate session reads across multiple callers in a single request.
 * Resolves exclusively from authenticated server session.
 */
export const resolveAccessContext = cache(async (): Promise<AccessContext> => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  let userId = session.user.id;
  let name = session.user.name;
  let role = session.user.role as Role;
  let departments = Array.isArray(session.user.departments)
    ? session.user.departments.filter((d): d is string => typeof d === 'string')
    : [];
  let departmentIds = Array.isArray(session.user.departmentIds)
    ? session.user.departmentIds.filter((d): d is string => typeof d === 'string')
    : [];

  if (!userId && session.user.email) {
    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { departments: true },
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

  let hasPipelineAccess = role === 'ADMIN';
  if (!hasPipelineAccess) {
    const now = Date.now();
    const cached = userPipelineAccessCache.get(userId);
    if (cached && cached.expiresAt > now) {
      hasPipelineAccess = cached.hasAccess;
    } else {
      const perm = await prisma.departmentMenuPermission.findFirst({
        where: {
          visible: true,
          menuItem: { key: 'pipeline' },
          department: { users: { some: { id: userId } } },
        },
        select: { id: true },
      });
      hasPipelineAccess = Boolean(perm);
      userPipelineAccessCache.set(userId, { expiresAt: now + 30_000, hasAccess: hasPipelineAccess });
    }
  }

  return {
    userId,
    name,
    role,
    departments,
    departmentIds,
    hasPipelineAccess,
  };
});

/**
 * Converts AccessContext to standard PipelineActor for backwards compatibility.
 */
export function toPipelineActor(context: AccessContext): PipelineActor {
  return {
    id: context.userId,
    name: context.name,
    role: context.role,
    departments: context.departments,
    departmentIds: context.departmentIds,
  };
}
