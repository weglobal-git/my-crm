import 'server-only';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getUserVisibleMenuKeys } from '@/lib/actions/permission';
import type { Role } from '@prisma/client';

export interface CalendarActor {
  id: string;
  name: string | null;
  email?: string | null;
  image?: string | null;
  role: Role;
  departments: string[];
  hasInformationPerm: boolean;
}

/**
 * Extracts the current authenticated user as a CalendarActor.
 * Throws 'Unauthorized' if session is missing.
 */
export async function getCalendarActorFromSession(): Promise<CalendarActor> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const sessionUser = session.user as { id: string; name?: string | null; email?: string | null; role?: string; image?: string | null };
  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      departments: { select: { name: true } },
    },
  });

  if (!dbUser) {
    throw new Error('Unauthorized');
  }

  const role = dbUser.role || 'GENERAL';
  const departments = dbUser.departments.map((d: { name: string }) => d.name);

  // Check pipeline.information menu permission for Goods Ready / Loading access
  let hasInformationPerm = role === 'ADMIN';
  if (!hasInformationPerm) {
    const visibleKeys = await getUserVisibleMenuKeys(dbUser.id);
    hasInformationPerm = visibleKeys.includes('pipeline.information');
  }

  return {
    id: dbUser.id,
    name: dbUser.name,
    email: dbUser.email,
    role,
    departments,
    hasInformationPerm,
  };
}

/**
 * Validates that the current actor has access to the Calendar feature.
 * Admin bypasses menu checks; other roles require the 'calendar' menu permission.
 * Throws 'Unauthorized' or 'Forbidden'.
 */
export async function requireCalendarActor(actorOverride?: CalendarActor): Promise<CalendarActor> {
  const actor = actorOverride ?? (await getCalendarActorFromSession());

  if (actor.role === 'ADMIN') {
    return actor;
  }

  if (!['MANAGEMENT', 'GENERAL'].includes(actor.role)) throw new Error('Forbidden');

  const visibleKeys = await getUserVisibleMenuKeys(actor.id);
  if (!visibleKeys.includes('calendar')) {
    throw new Error('Forbidden');
  }

  return actor;
}

/**
 * Evaluates whether an actor has edit rights for a specific deal date projection.
 * Follows the matrix from Section 6.3 of calendar-project.md:
 * - Goods Ready/Loading: Requires 'pipeline.information', SALES_DEAL, and ownerOrAdmin semantics.
 */
export function canUserEditOpportunityDate(
  actor: CalendarActor,
  opp: {
    ownerId: string;
    type?: string | null;
    owner?: { departments?: { name: string }[] } | null;
    teamMembers?: { id: string; departments?: { name: string }[] }[] | null;
  },
  itemType: 'DEAL_GOODS_READY' | 'DEAL_GOODS_LOADING',
  hasInformationPerm: boolean
): boolean {
  // 1. Check item-specific prerequisite permissions
  if (itemType === 'DEAL_GOODS_READY' || itemType === 'DEAL_GOODS_LOADING') {
    if (!hasInformationPerm) return false;
    if (opp.type && opp.type !== 'SALES_DEAL') return false;
  }

  // 2. Check ownerOrAdmin semantics
  if (actor.role === 'ADMIN') return true;

  if (actor.id === opp.ownerId) return true;

  if (actor.role === 'MANAGEMENT' && actor.departments.length > 0) {
    // Check if deal owner is in actor's departments
    const ownerDepts = opp.owner?.departments?.map(d => d.name) ?? [];
    const ownerMatches = ownerDepts.some(name => actor.departments.includes(name));
    if (ownerMatches) return true;

    // Check if any team member is in actor's departments
    if (opp.teamMembers && opp.teamMembers.length > 0) {
      const teamMatches = opp.teamMembers.some(member => {
        const memberDepts = member.departments?.map(d => d.name) ?? [];
        return memberDepts.some(name => actor.departments.includes(name));
      });
      if (teamMatches) return true;
    }
  }

  // General team members who are not the owner cannot edit deal dates
  return false;
}
