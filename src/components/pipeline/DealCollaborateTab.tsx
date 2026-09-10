'use client';

import React from 'react';
import type { OpportunityWithRelations } from './KanbanCard';
import { DealTeamMembersSection, type TeamMemberItem } from './DealTeamMembersSection';

export interface DealCollaborateTabProps {
  deal: OpportunityWithRelations;
  teamMembers: TeamMemberItem[];
  allUsers: TeamMemberItem[];
  isOwner: boolean;
  isAdmin: boolean;
  currentUserId?: string;
  currentUserEmail?: string | null;
  isRemovingId: string | null;
  onRemoveMember: (userId: string) => void | Promise<void>;
}

export function DealCollaborateTab({
  deal,
  teamMembers,
  allUsers,
  isOwner,
  isAdmin,
  currentUserId,
  currentUserEmail,
  isRemovingId,
  onRemoveMember,
}: DealCollaborateTabProps) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <DealTeamMembersSection
          dealId={deal.id}
          owner={deal.owner}
          ownerId={deal.ownerId}
          teamMembers={teamMembers}
          allUsers={allUsers}
          isOwner={isOwner}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          currentUserEmail={currentUserEmail}
          isRemovingId={isRemovingId}
          onRemoveMember={onRemoveMember}
        />
      </div>
    </div>
  );
}
