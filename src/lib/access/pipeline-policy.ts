import 'server-only';

import type { Prisma, Role } from '@prisma/client';
import type { PipelineActor } from '@/lib/pipeline-security';

/**
 * Pure authorization policy evaluation for Pipeline and Opportunities.
 * Enforces server-side authority without database coupling.
 */

export interface OpportunityAccessCheckSubject {
  id: string;
  ownerId?: string | null;
  owner?: {
    id: string;
    departments?: Array<{ id?: string; name: string }>;
  } | null;
  teamMembers?: Array<{
    id: string;
    departments?: Array<{ id?: string; name: string }>;
  }>;
}

/**
 * Evaluates whether an actor has permission to access the Pipeline workspace.
 * ADMIN has unconditional access; MANAGEMENT and GENERAL require explicit menu permission.
 */
export function canActorAccessPipeline(
  role: Role | string,
  hasPipelineMenuPermission: boolean
): boolean {
  if (role === 'ADMIN') return true;
  if (role !== 'MANAGEMENT' && role !== 'GENERAL') return false;
  return hasPipelineMenuPermission;
}

/**
 * Builds the authoritative Prisma SQL where filter for opportunity access.
 * ADMIN: unconditional access (empty object {})
 * MANAGEMENT: union of owner departments and team member departments matching manager's departments
 * GENERAL: owned deals or deals where the actor is a direct team member
 */
export function buildOpportunityAccessWhere(actor: PipelineActor): Prisma.OpportunityWhereInput {
  if (actor.role === 'ADMIN') return {};

  const hasDeptIds = Boolean(actor.departmentIds && actor.departmentIds.length > 0);
  const hasDeptNames = Boolean(actor.departments && actor.departments.length > 0);

  if (actor.role === 'MANAGEMENT' && (hasDeptIds || hasDeptNames)) {
    if (hasDeptIds) {
      return {
        OR: [
          { owner: { departments: { some: { id: { in: actor.departmentIds } } } } },
          { teamMembers: { some: { departments: { some: { id: { in: actor.departmentIds } } } } } },
        ],
      };
    }
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

/**
 * Pure evaluator to check if a specific opportunity record is accessible by an actor.
 * Matches the Prisma query semantics exactly for unit testing and in-memory authorization.
 */
export function evaluateOpportunityAccess(
  actor: PipelineActor,
  opp: OpportunityAccessCheckSubject
): boolean {
  // ADMIN has access to everything
  if (actor.role === 'ADMIN') return true;

  const hasDeptIds = Boolean(actor.departmentIds && actor.departmentIds.length > 0);
  const hasDeptNames = Boolean(actor.departments && actor.departments.length > 0);

  // MANAGEMENT with assigned departments: check owner departments OR team member departments
  if (actor.role === 'MANAGEMENT' && (hasDeptIds || hasDeptNames)) {
    const managerDeptIds = new Set(actor.departmentIds || []);
    const managerDeptNames = new Set(actor.departments || []);

    const matchesDept = (d: { id?: string; name: string }) =>
      Boolean((d.id && managerDeptIds.has(d.id)) || managerDeptNames.has(d.name));

    // 1. Check if deal owner belongs to any of the manager's departments
    if (opp.owner?.departments && opp.owner.departments.some(matchesDept)) {
      return true;
    }

    // 2. Check if any team member belongs to any of the manager's departments
    if (opp.teamMembers && opp.teamMembers.some(tm => tm.departments?.some(matchesDept))) {
      return true;
    }

    return false;
  }

  // GENERAL (or MANAGEMENT without departments): only direct owner or team member
  if (opp.ownerId === actor.id || opp.owner?.id === actor.id) return true;
  if (opp.teamMembers && opp.teamMembers.some(tm => tm.id === actor.id)) return true;

  return false;
}
