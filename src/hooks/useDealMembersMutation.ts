'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useSWRConfig } from 'swr';
import { addTeamMembers, removeTeamMember } from '@/lib/actions/opportunity';
import type { OpportunityWithRelations } from '@/components/pipeline/KanbanCard';
import type { TeamMemberItem } from '@/components/pipeline/DealTeamMembersSection';

interface UseDealMembersMutationOptions {
  dealId: string;
  initialMembers: TeamMemberItem[];
  dealUpdatedAt?: Date | string | null;
  currentUserId?: string | null;
  isOwner?: boolean;
  isAdmin?: boolean;
  onSelfLeft?: () => void;
  toast?: (options: { title: string; description: string; type: 'success' | 'error' | 'warning' | 'info' }) => void;
}

export function useDealMembersMutation({
  dealId,
  initialMembers,
  dealUpdatedAt,
  currentUserId,
  isOwner,
  isAdmin,
  onSelfLeft,
  toast,
}: UseDealMembersMutationOptions) {
  const { mutate } = useSWRConfig();
  const [localTeamMembers, setLocalTeamMembers] = useState<TeamMemberItem[]>(initialMembers || []);
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [isRemovingId, setIsRemovingId] = useState<string | null>(null);

  // Track latest server revision to reject stale out-of-order events
  const serverRevisionRef = useRef<number>(
    dealUpdatedAt ? new Date(dealUpdatedAt).getTime() : 0
  );

  // Track in-flight mutation IDs to ignore own echo events from Pusher
  const pendingMutationIdsRef = useRef<Set<string>>(new Set());

  // Keep localTeamMembers in sync if parent deal changes
  useEffect(() => {
    setLocalTeamMembers(initialMembers || []);
    if (dealUpdatedAt) {
      serverRevisionRef.current = Math.max(
        serverRevisionRef.current,
        new Date(dealUpdatedAt).getTime()
      );
    }
  }, [dealId, initialMembers, dealUpdatedAt]);

  /**
   * Helper to patch SWR ['pipeline-deals'] cache optimistically
   */
  const patchPipelineDealsCache = useCallback(
    (updater: (members: { id: string; name?: string | null; image?: string | null; [key: string]: unknown }[]) => { id: string; name?: string | null; image?: string | null; [key: string]: unknown }[]) => {
      void mutate(
        (key) => Array.isArray(key) && key[0] === 'pipeline-deals',
        (currentData: OpportunityWithRelations[] | undefined) => {
          if (!currentData) return currentData;
          return currentData.map((opp) => {
            if (opp.id === dealId) {
              const updatedMembers = updater((opp.teamMembers || []) as { id: string; name?: string | null; image?: string | null; [key: string]: unknown }[]);
              return { ...opp, teamMembers: updatedMembers as OpportunityWithRelations['teamMembers'] };
            }
            return opp;
          });
        },
        { revalidate: false }
      );
    },
    [dealId, mutate]
  );

  /**
   * 1. Add Members with Granular Delta Rollback and Mutation ID
   */
  const handleAddMembers = useCallback(
    async (userIds: string[], allKnownUsers: TeamMemberItem[]) => {
      if (!userIds || userIds.length === 0) return;

      const mutationId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `mut-${Date.now()}`;
      pendingMutationIdsRef.current.add(mutationId);
      setIsAddingMembers(true);

      const usersToAdd = allKnownUsers.filter((u) => userIds.includes(u.id));
      const newMembers: TeamMemberItem[] = userIds.map((id) => {
        const found = usersToAdd.find((u) => u.id === id);
        return (
          found || {
            id,
            name: 'User',
            email: '',
            image: null,
            role: 'USER',
          }
        );
      });

      // Optimistic Update: Local state
      setLocalTeamMembers((prev) => {
        const existingIds = new Set(prev.map((u) => u.id));
        const toAppend = newMembers.filter((u) => !existingIds.has(u.id));
        return [...prev, ...toAppend];
      });

      // Optimistic Update: Kanban Card cache
      patchPipelineDealsCache((currentMembers) => {
        const existingIds = new Set(currentMembers.map((u: { id: string }) => u.id));
        const toAppend = newMembers.filter((u: TeamMemberItem) => !existingIds.has(u.id));
        return [...currentMembers, ...toAppend];
      });

      try {
        const response = await addTeamMembers(dealId, userIds, mutationId);

        if (response?.revision && response.revision >= serverRevisionRef.current) {
          serverRevisionRef.current = response.revision;
        }

        // Authoritative reconciliation: merge response teamMembers if available
        if (response?.teamMembers && response.teamMembers.length > 0) {
          setLocalTeamMembers((prev) => {
            const returnedMap = new Map(response.teamMembers.map((m) => [m.id, m]));
            return prev.map((m) => (returnedMap.has(m.id) ? (returnedMap.get(m.id) as TeamMemberItem) : m));
          });
        }

        // Server records the system log directly in addTeamMembers

        toast?.({
          title: 'Success',
          description: `Added ${userIds.length} member${userIds.length > 1 ? 's' : ''} to the deal`,
          type: 'success',
        });
      } catch (err) {
        // Granular Delta Rollback: Remove ONLY the users that were attempted in this mutation
        setLocalTeamMembers((prev) => prev.filter((u) => !userIds.includes(u.id)));
        patchPipelineDealsCache((currentMembers) =>
          currentMembers.filter((u: { id: string }) => !userIds.includes(u.id))
        );

        const errorMsg = err instanceof Error ? err.message : 'Failed to add members';
        toast?.({ title: 'Error', description: errorMsg, type: 'error' });
      } finally {
        setIsAddingMembers(false);
        pendingMutationIdsRef.current.delete(mutationId);
      }
    },
    [dealId, patchPipelineDealsCache, toast]
  );

  /**
   * 2. Remove Member with Granular Delta Rollback and Mutation ID
   */
  const handleRemoveMember = useCallback(
    async (userId: string) => {
      const isSelf = Boolean(currentUserId && userId === currentUserId);
      const isLeavingDeal = isSelf && !isOwner && !isAdmin;

      const mutationId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `mut-${Date.now()}`;
      pendingMutationIdsRef.current.add(mutationId);
      setIsRemovingId(userId);

      // Find user before optimistic removal for rollback
      const userToRemove = localTeamMembers.find((u) => u.id === userId);

      // If user is voluntarily leaving the deal, close the panel and evict the card from board
      if (isLeavingDeal) {
        void mutate(
          (key) => Array.isArray(key) && key[0] === 'pipeline-deals',
          (currentData: OpportunityWithRelations[] | undefined) => currentData?.filter((opp) => opp.id !== dealId),
          { revalidate: false }
        );
        onSelfLeft?.();
        toast?.({ title: 'Success', description: 'You have left the deal', type: 'success' });
      } else {
        // Optimistic Update: Local state
        setLocalTeamMembers((prev) => prev.filter((u) => u.id !== userId));

        // Optimistic Update: Kanban Card cache
        patchPipelineDealsCache((currentMembers) => currentMembers.filter((u: { id: string }) => u.id !== userId));
      }

      try {
        const response = await removeTeamMember(dealId, userId, mutationId);

        if (response?.revision && response.revision >= serverRevisionRef.current) {
          serverRevisionRef.current = response.revision;
        }

        if (!isLeavingDeal) {
          toast?.({ title: 'Success', description: `Removed ${userToRemove?.name || 'member'} from team`, type: 'success' });
        }
      } catch (err) {
        // If leaving deal failed, restore board
        if (isLeavingDeal) {
          void mutate((key) => Array.isArray(key) && key[0] === 'pipeline-deals');
        } else if (userToRemove) {
          // Granular Delta Rollback: Restore ONLY the specific user that failed to be removed
          setLocalTeamMembers((prev) => (prev.some((u) => u.id === userId) ? prev : [...prev, userToRemove]));
          patchPipelineDealsCache((currentMembers) =>
            currentMembers.some((u: { id: string }) => u.id === userId)
              ? currentMembers
              : [...currentMembers, userToRemove]
          );
        }

        const errorMsg = err instanceof Error ? err.message : 'Failed to remove member';
        toast?.({ title: 'Error', description: errorMsg, type: 'error' });
      } finally {
        setIsRemovingId(null);
        pendingMutationIdsRef.current.delete(mutationId);
      }
    },
    [currentUserId, dealId, isAdmin, isOwner, localTeamMembers, mutate, onSelfLeft, patchPipelineDealsCache, toast]
  );

  /**
   * 3. Apply Pusher event with Server Revision and Echo Filtering
   */
  const applyPusherMemberEvent = useCallback(
    (data: {
      action?: string;
      dealId?: string;
      userId?: string;
      user?: TeamMemberItem;
      users?: TeamMemberItem[];
      revision?: number;
      mutationId?: string;
    }) => {
      if (!data || data.dealId !== dealId) return;

      // Ignore own mutation echo
      if (data.mutationId && pendingMutationIdsRef.current.has(data.mutationId)) {
        return;
      }

      // If we were removed by someone else, evict from cache and close panel
      if (data.action === 'MEMBER_REMOVED' && data.userId === currentUserId && !isOwner && !isAdmin) {
        void mutate(
          (key) => Array.isArray(key) && key[0] === 'pipeline-deals',
          (currentData: OpportunityWithRelations[] | undefined) => currentData?.filter((opp) => opp.id !== dealId),
          { revalidate: false }
        );
        onSelfLeft?.();
        toast?.({ title: 'Access Revoked', description: 'You have been removed from this deal', type: 'info' });
        return;
      }

      // Check server revision to ignore stale out-of-order events
      if (data.revision && data.revision < serverRevisionRef.current) {
        return;
      }

      if (data.revision) {
        serverRevisionRef.current = data.revision;
      }

      if (data.action === 'MEMBERS_ADDED' && Array.isArray(data.users)) {
        const newUsers = data.users;
        setLocalTeamMembers((prev) => {
          const existingIds = new Set(prev.map((u) => u.id));
          const toAppend = newUsers.filter((u) => !existingIds.has(u.id));
          return toAppend.length > 0 ? [...prev, ...toAppend] : prev;
        });
      } else if (data.action === 'MEMBER_ADDED' && data.user) {
        const singleUser = data.user;
        setLocalTeamMembers((prev) => {
          if (prev.some((u) => u.id === singleUser.id)) return prev;
          return [...prev, singleUser];
        });
      } else if (data.action === 'MEMBER_REMOVED' && data.userId) {
        const removedId = data.userId;
        setLocalTeamMembers((prev) => prev.filter((u) => u.id !== removedId));
      }
    },
    [currentUserId, dealId, isAdmin, isOwner, mutate, onSelfLeft, toast]
  );

  return {
    localTeamMembers,
    setLocalTeamMembers,
    isAddingMembers,
    isRemovingId,
    handleAddMembers,
    handleRemoveMember,
    applyPusherMemberEvent,
  };
}
