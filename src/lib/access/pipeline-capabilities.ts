import 'server-only';

import type { PipelineActor } from '@/lib/pipeline-security';
import {
  evaluateOpportunityAccess,
  type OpportunityAccessCheckSubject,
} from './pipeline-policy';

export type PipelineCapability =
  | 'pipeline:view'
  | 'pipeline:manage_stages'
  | 'deal:create'
  | 'deal:view'
  | 'deal:edit_card'
  | 'deal:edit_dates'
  | 'deal:move_stage'
  | 'deal:transfer_owner'
  | 'deal:delete'
  | 'deal:comment'
  | 'deal:edit_own_comment'
  | 'deal:manage_members'
  | 'deal:interact';

export interface DealCapabilitySubject extends OpportunityAccessCheckSubject {
  status?: string;
  commentAuthorId?: string;
}

/**
 * Pure server authorization evaluator based on domain capabilities.
 * Guarantees deny-by-default and zero database coupling.
 */
export function can(
  actor: PipelineActor,
  capability: PipelineCapability,
  subject?: DealCapabilitySubject,
  options: { hasPipelineMenuPermission?: boolean } = {}
): boolean {
  if (!actor || !actor.role) return false;
  if (!['ADMIN', 'MANAGEMENT', 'GENERAL'].includes(actor.role)) return false;

  // 1. Universal business invariants (enforced for ALL roles, including ADMIN)
  if (capability === 'deal:edit_dates') {
    if (subject?.status && ['WON', 'LOST', 'COMPLETED', 'CANCELLED'].includes(subject.status)) {
      return false;
    }
  }

  // 2. ADMIN bypass for operations not blocked by universal business invariants
  if (actor.role === 'ADMIN') return true;

  // 3. Deny-by-default capability evaluation for non-admin roles
  switch (capability) {
    case 'pipeline:view': {
      // Explicit permission evidence is required for non-admins; defaults to false (deny-by-default)
      return Boolean(options.hasPipelineMenuPermission);
    }

    case 'pipeline:manage_stages': {
      // Stage column configurations are restricted to ADMIN or MANAGEMENT
      return actor.role === 'MANAGEMENT';
    }

    case 'deal:create': {
      // Any authenticated actor with pipeline access can create opportunities
      return true;
    }

    case 'deal:view': {
      if (!subject) return false;
      return evaluateOpportunityAccess(actor, subject);
    }

    case 'deal:edit_card': {
      // Editing fast card state (pin, quick hotNote) requires read access to the deal
      if (!subject) return false;
      return evaluateOpportunityAccess(actor, subject);
    }

    case 'deal:edit_dates': {
      if (!subject) return false;
      // Archived deals cannot have their dates modified
      if (subject.status && ['WON', 'LOST', 'COMPLETED', 'CANCELLED'].includes(subject.status)) {
        return false;
      }
      // Must have deal view access
      if (!evaluateOpportunityAccess(actor, subject)) return false;
      // MANAGEMENT can edit dates within their departments; GENERAL can only edit if owner
      if (actor.role === 'MANAGEMENT') return true;
      return subject.ownerId === actor.id || subject.owner?.id === actor.id;
    }

    case 'deal:move_stage': {
      if (!subject) return false;
      if (!evaluateOpportunityAccess(actor, subject)) return false;
      // MANAGEMENT can move deals in their departments; GENERAL must be owner or team member
      if (actor.role === 'MANAGEMENT') return true;
      const isOwner = subject.ownerId === actor.id || subject.owner?.id === actor.id;
      const isMember = subject.teamMembers?.some(tm => tm.id === actor.id);
      return Boolean(isOwner || isMember);
    }

    case 'deal:transfer_owner': {
      if (!subject) return false;
      if (!evaluateOpportunityAccess(actor, subject)) return false;
      // MANAGEMENT can transfer deals in their departments; GENERAL must be current owner
      if (actor.role === 'MANAGEMENT') return true;
      return subject.ownerId === actor.id || subject.owner?.id === actor.id;
    }

    case 'deal:delete': {
      if (!subject) return false;
      // Only ADMIN or current owner can delete a deal
      return subject.ownerId === actor.id || subject.owner?.id === actor.id;
    }

    case 'deal:comment': {
      // Adding/replying to activity comments requires deal access
      if (!subject) return false;
      return evaluateOpportunityAccess(actor, subject);
    }

    case 'deal:edit_own_comment': {
      if (!subject) return false;
      if (!evaluateOpportunityAccess(actor, subject)) return false;
      return Boolean(subject.commentAuthorId && subject.commentAuthorId === actor.id);
    }

    case 'deal:manage_members': {
      if (!subject) return false;
      if (!evaluateOpportunityAccess(actor, subject)) return false;
      // MANAGEMENT can manage members in department deals; GENERAL must be deal owner
      if (actor.role === 'MANAGEMENT') return true;
      return subject.ownerId === actor.id || subject.owner?.id === actor.id;
    }

    case 'deal:interact': {
      // Notes, attachments, and AI accelerators require deal access
      if (!subject) return false;
      return evaluateOpportunityAccess(actor, subject);
    }

    default: {
      return false;
    }
  }
}

/**
 * Throws Forbidden error if actor lacks the specified capability.
 */
export function requireCapability(
  actor: PipelineActor,
  capability: PipelineCapability,
  subject?: DealCapabilitySubject,
  options: { hasPipelineMenuPermission?: boolean } = {}
): void {
  if (!can(actor, capability, subject, options)) {
    throw new Error('Forbidden');
  }
}
