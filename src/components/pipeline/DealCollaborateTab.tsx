'use client';

import React from 'react';
import useSWR from 'swr';
import { getAllUsers } from '@/lib/actions/users';
import type { OpportunityWithRelations } from './KanbanCard';
import { DealTeamMembersSection, type TeamMemberItem } from './DealTeamMembersSection';

export interface DealCollaborateTabProps {
  deal: OpportunityWithRelations;
  teamMembers: TeamMemberItem[];
  allUsers?: TeamMemberItem[];
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
  allUsers: propAllUsers,
  isOwner,
  isAdmin,
  currentUserId,
  currentUserEmail,
  isRemovingId,
  onRemoveMember,
}: DealCollaborateTabProps) {
  // Fetch users on-demand with 2-minute deduplication ONLY when CollaborateTab is mounted
  const { data: cachedUsers } = useSWR<Awaited<ReturnType<typeof getAllUsers>>>(
    propAllUsers && propAllUsers.length > 0 ? null : 'all-users',
    getAllUsers,
    { revalidateOnFocus: false, dedupingInterval: 120_000 }
  );
  const resolvedUsers = ((propAllUsers && propAllUsers.length > 0 ? propAllUsers : cachedUsers) || []) as unknown as TeamMemberItem[];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <DealTeamMembersSection
          dealId={deal.id}
          owner={deal.owner}
          ownerId={deal.ownerId}
          teamMembers={teamMembers}
          allUsers={resolvedUsers}
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
