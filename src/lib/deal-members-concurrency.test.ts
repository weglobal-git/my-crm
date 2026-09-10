import test from 'node:test';
import assert from 'node:assert/strict';

type TeamMember = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  [key: string]: unknown;
};

type Opportunity = {
  id: string;
  topic: string;
  teamMembers: TeamMember[];
};

// Pure logic functions simulating the mutation contract
function applyOptimisticAdd(
  current: TeamMember[],
  toAdd: TeamMember[]
): TeamMember[] {
  const existingIds = new Set(current.map((m) => m.id));
  const newMembers = toAdd.filter((m) => !existingIds.has(m.id));
  return [...current, ...newMembers];
}

function applyGranularRollback(
  current: TeamMember[],
  failedIds: string[]
): TeamMember[] {
  const failedSet = new Set(failedIds);
  return current.filter((m) => !failedSet.has(m.id));
}

function applyPusherEventWithRevision(
  current: TeamMember[],
  currentRevision: number,
  event: { action: string; users?: TeamMember[]; userId?: string; revision?: number; mutationId?: string },
  pendingMutationIds: Set<string>
): { members: TeamMember[]; revision: number } {
  // 1. Ignore own mutation echo
  if (event.mutationId && pendingMutationIds.has(event.mutationId)) {
    return { members: current, revision: currentRevision };
  }

  // 2. Ignore stale out-of-order events
  if (event.revision && event.revision < currentRevision) {
    return { members: current, revision: currentRevision };
  }

  const newRevision = event.revision || currentRevision;

  if (event.action === 'MEMBERS_ADDED' && event.users) {
    const existingIds = new Set(current.map((m) => m.id));
    const toAppend = event.users.filter((m) => !existingIds.has(m.id));
    return { members: [...current, ...toAppend], revision: newRevision };
  }

  if (event.action === 'MEMBER_REMOVED' && event.userId) {
    return { members: current.filter((m) => m.id !== event.userId), revision: newRevision };
  }

  return { members: current, revision: currentRevision };
}

function patchPipelineDealsCacheHelper(
  deals: Opportunity[],
  targetDealId: string,
  updater: (members: TeamMember[]) => TeamMember[]
): Opportunity[] {
  return deals.map((d) => {
    if (d.id === targetDealId) {
      return { ...d, teamMembers: updater(d.teamMembers || []) };
    }
    return d;
  });
}

test('Team Members Concurrency: Granular Delta Rollback preserves subsequent concurrent additions', () => {
  const initial: TeamMember[] = [
    { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'USER' },
  ];

  // User adds User 2
  const afterAdd2 = applyOptimisticAdd(initial, [
    { id: 'user-2', name: 'Bob', email: 'bob@example.com', role: 'USER' },
  ]);

  // While User 2 is in-flight, User adds User 3
  const afterAdd3 = applyOptimisticAdd(afterAdd2, [
    { id: 'user-3', name: 'Charlie', email: 'charlie@example.com', role: 'USER' },
  ]);

  assert.equal(afterAdd3.length, 3);
  assert.deepEqual(afterAdd3.map((u) => u.id), ['user-1', 'user-2', 'user-3']);

  // Mutation for User 2 FAILS with network error
  // Granular rollback should ONLY remove User 2, keeping User 3 intact!
  const afterRollback = applyGranularRollback(afterAdd3, ['user-2']);

  assert.equal(afterRollback.length, 2);
  assert.deepEqual(afterRollback.map((u) => u.id), ['user-1', 'user-3']);
  assert.ok(!afterRollback.some((u) => u.id === 'user-2'));
  assert.ok(afterRollback.some((u) => u.id === 'user-3'));
});

test('Team Members Concurrency: Server Revision rejects stale out-of-order events (A -> B -> C)', () => {
  let members: TeamMember[] = [
    { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'USER' },
  ];
  let revision = 100;
  const pendingMutations = new Set<string>();

  // Event 1: Server sends MEMBER_REMOVED with revision 102 (Alice removed)
  const step1 = applyPusherEventWithRevision(
    members,
    revision,
    { action: 'MEMBER_REMOVED', userId: 'user-1', revision: 102 },
    pendingMutations
  );
  members = step1.members;
  revision = step1.revision;

  assert.equal(members.length, 0);
  assert.equal(revision, 102);

  // Event 2: An older event MEMBERS_ADDED with revision 101 arrives late due to network delay
  const step2 = applyPusherEventWithRevision(
    members,
    revision,
    {
      action: 'MEMBERS_ADDED',
      users: [{ id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'USER' }],
      revision: 101, // Stale!
    },
    pendingMutations
  );

  // Stale event MUST be ignored!
  assert.equal(step2.members.length, 0);
  assert.equal(step2.revision, 102);
});

test('Team Members Concurrency: Idempotent Mutation ID filters out own echo from Pusher', () => {
  const members: TeamMember[] = [
    { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'USER' },
    { id: 'user-2', name: 'Bob', email: 'bob@example.com', role: 'USER' }, // Optimistically added
  ];
  const revision = 100;
  const pendingMutations = new Set<string>(['mut-abc-123']);

  // Pusher echoes back MEMBERS_ADDED with mut-abc-123
  const result = applyPusherEventWithRevision(
    members,
    revision,
    {
      action: 'MEMBERS_ADDED',
      users: [{ id: 'user-2', name: 'Bob', email: 'bob@example.com', role: 'USER' }],
      revision: 101,
      mutationId: 'mut-abc-123',
    },
    pendingMutations
  );

  // Should NOT re-append or modify list
  assert.equal(result.members.length, 2);
  assert.deepEqual(result.members.map((u) => u.id), ['user-1', 'user-2']);
});

test('Team Members Cache Topology: Patching pipeline-deals updates only target deal', () => {
  const deals: Opportunity[] = [
    {
      id: 'deal-A',
      topic: 'Deal Alpha',
      teamMembers: [{ id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'USER' }],
    },
    {
      id: 'deal-B',
      topic: 'Deal Beta',
      teamMembers: [{ id: 'user-2', name: 'Bob', email: 'bob@example.com', role: 'USER' }],
    },
  ];

  // Add Charlie to deal-A
  const updated = patchPipelineDealsCacheHelper(deals, 'deal-A', (existing) => [
    ...existing,
    { id: 'user-3', name: 'Charlie', email: 'charlie@example.com', role: 'USER' },
  ]);

  // deal-A has Alice and Charlie
  assert.equal(updated.find((d) => d.id === 'deal-A')?.teamMembers.length, 2);
  assert.deepEqual(
    updated.find((d) => d.id === 'deal-A')?.teamMembers.map((m) => m.id),
    ['user-1', 'user-3']
  );

  // deal-B is completely untouched with only Bob
  assert.equal(updated.find((d) => d.id === 'deal-B')?.teamMembers.length, 1);
  assert.deepEqual(
    updated.find((d) => d.id === 'deal-B')?.teamMembers.map((m) => m.id),
    ['user-2']
  );
});

function canRemoveMemberHelper({
  targetUserId,
  ownerId,
  isOwner,
  isAdmin,
  currentUserId,
}: {
  targetUserId: string;
  ownerId: string;
  isOwner: boolean;
  isAdmin: boolean;
  currentUserId: string;
}): boolean {
  const isRowOwner = targetUserId === ownerId;
  const isSelf = targetUserId === currentUserId;
  return !isRowOwner && (isOwner || isAdmin || isSelf);
}

test('Team Members Permissions: Regular member can only leave team (isSelf), cannot kick other members', () => {
  const ownerId = 'owner-1';
  const myUserId = 'member-light';
  const otherUserId = 'member-yui';

  // 1. Regular member viewing themselves
  assert.equal(
    canRemoveMemberHelper({
      targetUserId: myUserId,
      ownerId,
      isOwner: false,
      isAdmin: false,
      currentUserId: myUserId,
    }),
    true, // Can leave team
  );

  // 2. Regular member viewing other members
  assert.equal(
    canRemoveMemberHelper({
      targetUserId: otherUserId,
      ownerId,
      isOwner: false,
      isAdmin: false,
      currentUserId: myUserId,
    }),
    false, // CANNOT kick other members!
  );

  // 3. Regular member viewing the owner
  assert.equal(
    canRemoveMemberHelper({
      targetUserId: ownerId,
      ownerId,
      isOwner: false,
      isAdmin: false,
      currentUserId: myUserId,
    }),
    false, // CANNOT kick owner!
  );

  // 4. Admin or Owner viewing other members
  assert.equal(
    canRemoveMemberHelper({
      targetUserId: otherUserId,
      ownerId,
      isOwner: true,
      isAdmin: false,
      currentUserId: ownerId,
    }),
    true, // Owner can kick member
  );

  // 5. Owner viewing themselves
  assert.equal(
    canRemoveMemberHelper({
      targetUserId: ownerId,
      ownerId,
      isOwner: true,
      isAdmin: false,
      currentUserId: ownerId,
    }),
    false, // Owner cannot kick themselves (must transfer)
  );
});

