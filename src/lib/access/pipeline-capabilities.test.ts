import test from 'node:test';
import assert from 'node:assert/strict';
import { can, requireCapability, type PipelineCapability } from './pipeline-capabilities';
import type { PipelineActor } from '@/lib/pipeline-security';

test('pipeline-capabilities A4: ADMIN has unconditional capabilities', () => {
  const admin: PipelineActor = { id: 'admin-1', role: 'ADMIN', departments: [] };
  const anySubject = {
    id: 'deal-99',
    ownerId: 'user-other',
    owner: { id: 'user-other', departments: [{ id: 'dept-other', name: 'Other' }] },
    status: 'OPEN',
  };

  const capabilities: PipelineCapability[] = [
    'pipeline:view',
    'pipeline:manage_stages',
    'deal:create',
    'deal:view',
    'deal:edit_card',
    'deal:edit_dates',
    'deal:move_stage',
    'deal:transfer_owner',
    'deal:delete',
    'deal:comment',
    'deal:edit_own_comment',
    'deal:manage_members',
    'deal:interact',
  ];

  for (const cap of capabilities) {
    assert.equal(can(admin, cap, anySubject), true, `Admin should have capability ${cap}`);
    assert.doesNotThrow(() => requireCapability(admin, cap, anySubject), `requireCapability should pass for Admin on ${cap}`);
  }
});

test('pipeline-capabilities A4: GENERAL owner capabilities', () => {
  const owner: PipelineActor = { id: 'user-owner', role: 'GENERAL', departments: ['Export'] };
  const ownedDeal = {
    id: 'deal-1',
    ownerId: 'user-owner',
    owner: { id: 'user-owner', departments: [{ id: 'dept-exp', name: 'Export' }] },
    status: 'OPEN',
  };

  assert.equal(can(owner, 'deal:view', ownedDeal), true, 'Owner can view own deal');
  assert.equal(can(owner, 'deal:edit_card', ownedDeal), true, 'Owner can edit card');
  assert.equal(can(owner, 'deal:edit_dates', ownedDeal), true, 'Owner can edit dates on active deal');
  assert.equal(can(owner, 'deal:move_stage', ownedDeal), true, 'Owner can move stage');
  assert.equal(can(owner, 'deal:transfer_owner', ownedDeal), true, 'Owner can transfer ownership');
  assert.equal(can(owner, 'deal:delete', ownedDeal), true, 'Owner can delete own deal');
  assert.equal(can(owner, 'deal:comment', ownedDeal), true, 'Owner can comment');
  assert.equal(can(owner, 'deal:edit_own_comment', { ...ownedDeal, commentAuthorId: 'user-owner' }), true, 'Owner can edit own comment');
  assert.equal(can(owner, 'deal:edit_own_comment', { ...ownedDeal, commentAuthorId: 'other-user' }), false, 'Owner cannot edit other user comment');
  assert.equal(can(owner, 'deal:edit_own_comment', ownedDeal), false, 'Owner cannot edit comment without commentAuthorId (strict deny-by-default)');
  assert.equal(can(owner, 'deal:manage_members', ownedDeal), true, 'Owner can manage team members');
  assert.equal(can(owner, 'deal:interact', ownedDeal), true, 'Owner can interact with notes/ai');
  assert.equal(can(owner, 'pipeline:manage_stages', ownedDeal), false, 'General user cannot manage stages');
});

test('pipeline-capabilities A4: GENERAL team member capabilities and boundaries', () => {
  const member: PipelineActor = { id: 'user-member', role: 'GENERAL', departments: ['Export'] };
  const memberDeal = {
    id: 'deal-2',
    ownerId: 'user-owner',
    owner: { id: 'user-owner', departments: [{ id: 'dept-exp', name: 'Export' }] },
    teamMembers: [{ id: 'user-member', departments: [{ id: 'dept-exp', name: 'Export' }] }],
    status: 'OPEN',
  };

  assert.equal(can(member, 'deal:view', memberDeal), true, 'Member can view deal');
  assert.equal(can(member, 'deal:edit_card', memberDeal), true, 'Member can edit card');
  assert.equal(can(member, 'deal:move_stage', memberDeal), true, 'Member can move stage');
  assert.equal(can(member, 'deal:comment', memberDeal), true, 'Member can comment');
  assert.equal(can(member, 'deal:edit_own_comment', { ...memberDeal, commentAuthorId: 'user-member' }), true, 'Member can edit own comment');
  assert.equal(can(member, 'deal:edit_own_comment', { ...memberDeal, commentAuthorId: 'user-owner' }), false, 'Member cannot edit other comment');
  assert.equal(can(member, 'deal:edit_own_comment', memberDeal), false, 'Member cannot edit comment without commentAuthorId (strict deny-by-default)');
  assert.equal(can(member, 'deal:interact', memberDeal), true, 'Member can interact with notes/ai');
  // Team member CANNOT edit dates (only owner/management/admin), CANNOT delete, CANNOT transfer ownership, CANNOT manage members
  assert.equal(can(member, 'deal:edit_dates', memberDeal), false, 'Team member cannot edit deal dates');
  assert.equal(can(member, 'deal:delete', memberDeal), false, 'Team member cannot delete deal');
  assert.equal(can(member, 'deal:transfer_owner', memberDeal), false, 'Team member cannot transfer deal');
  assert.equal(can(member, 'deal:manage_members', memberDeal), false, 'Team member cannot manage members');
});

test('pipeline-capabilities A4: GENERAL colleague / outsider is denied', () => {
  const outsider: PipelineActor = { id: 'user-outsider', role: 'GENERAL', departments: ['Export'] };
  const otherDeal = {
    id: 'deal-3',
    ownerId: 'user-owner',
    owner: { id: 'user-owner', departments: [{ id: 'dept-exp', name: 'Export' }] },
    teamMembers: [{ id: 'user-member', departments: [{ id: 'dept-exp', name: 'Export' }] }],
    status: 'OPEN',
  };

  assert.equal(can(outsider, 'deal:view', otherDeal), false, 'Colleague cannot view unassigned deal');
  assert.equal(can(outsider, 'deal:edit_card', otherDeal), false, 'Colleague cannot edit card');
  assert.equal(can(outsider, 'deal:edit_dates', otherDeal), false, 'Colleague cannot edit dates');
  assert.equal(can(outsider, 'deal:move_stage', otherDeal), false, 'Colleague cannot move stage');
  assert.equal(can(outsider, 'deal:comment', otherDeal), false, 'Colleague cannot comment');
  assert.equal(can(outsider, 'deal:edit_own_comment', { ...otherDeal, commentAuthorId: 'user-outsider' }), false, 'Colleague cannot edit comment on unassigned deal');
  assert.equal(can(outsider, 'deal:manage_members', otherDeal), false, 'Colleague cannot manage members');
  assert.equal(can(outsider, 'deal:interact', otherDeal), false, 'Colleague cannot interact');
  assert.throws(() => requireCapability(outsider, 'deal:view', otherDeal), /Forbidden/);
});

test('pipeline-capabilities A4: MANAGEMENT department scope and date editing rules', () => {
  const manager: PipelineActor = {
    id: 'mgr-1',
    role: 'MANAGEMENT',
    departments: ['Export'],
    departmentIds: ['dept-exp-id'],
  };

  const inDeptDeal = {
    id: 'deal-dept',
    ownerId: 'sales-1',
    owner: { id: 'sales-1', departments: [{ id: 'dept-exp-id', name: 'Export' }] },
    status: 'OPEN',
  };

  const outDeptDeal = {
    id: 'deal-other-dept',
    ownerId: 'sales-2',
    owner: { id: 'sales-2', departments: [{ id: 'dept-finance-id', name: 'Finance' }] },
    status: 'OPEN',
  };

  // In department
  assert.equal(can(manager, 'deal:view', inDeptDeal), true, 'Manager can view department deal');
  assert.equal(can(manager, 'deal:edit_card', inDeptDeal), true, 'Manager can edit card');
  assert.equal(can(manager, 'deal:edit_dates', inDeptDeal), true, 'Manager can edit dates in department');
  assert.equal(can(manager, 'deal:move_stage', inDeptDeal), true, 'Manager can move stage in department');
  assert.equal(can(manager, 'deal:transfer_owner', inDeptDeal), true, 'Manager can transfer ownership in department');
  assert.equal(can(manager, 'deal:manage_members', inDeptDeal), true, 'Manager can manage members in department');
  assert.equal(can(manager, 'deal:comment', inDeptDeal), true, 'Manager can comment in department deal');
  assert.equal(can(manager, 'deal:interact', inDeptDeal), true, 'Manager can interact in department deal');
  assert.equal(can(manager, 'pipeline:manage_stages'), true, 'Manager can manage stages');

  // Out of department
  assert.equal(can(manager, 'deal:view', outDeptDeal), false, 'Manager cannot view outside department');
  assert.equal(can(manager, 'deal:edit_dates', outDeptDeal), false, 'Manager cannot edit dates outside department');
  assert.equal(can(manager, 'deal:transfer_owner', outDeptDeal), false, 'Manager cannot transfer outside department');
  assert.equal(can(manager, 'deal:manage_members', outDeptDeal), false, 'Manager cannot manage members outside department');
  assert.equal(can(manager, 'deal:comment', outDeptDeal), false, 'Manager cannot comment outside department');
  assert.equal(can(manager, 'deal:interact', outDeptDeal), false, 'Manager cannot interact outside department');
});

test('pipeline-capabilities A4: Archived deal prevents date modifications universally (including ADMIN)', () => {
  const owner: PipelineActor = { id: 'user-owner', role: 'GENERAL', departments: ['Export'] };
  const manager: PipelineActor = { id: 'mgr-1', role: 'MANAGEMENT', departments: ['Export'], departmentIds: ['dept-exp-id'] };
  const admin: PipelineActor = { id: 'admin-1', role: 'ADMIN', departments: [] };

  const wonDeal = {
    id: 'deal-won',
    ownerId: 'user-owner',
    owner: { id: 'user-owner', departments: [{ id: 'dept-exp-id', name: 'Export' }] },
    status: 'WON',
  };

  assert.equal(can(owner, 'deal:edit_dates', wonDeal), false, 'Owner cannot edit dates on WON deal');
  assert.equal(can(manager, 'deal:edit_dates', wonDeal), false, 'Manager cannot edit dates on WON deal');
  assert.equal(can(admin, 'deal:edit_dates', wonDeal), false, 'Admin cannot edit dates on WON deal due to universal invariant');
  assert.throws(() => requireCapability(admin, 'deal:edit_dates', wonDeal), /Forbidden/);
});

test('pipeline-capabilities A4: pipeline:view is strictly deny-by-default without explicit permission evidence', () => {
  const general: PipelineActor = { id: 'user-1', role: 'GENERAL', departments: ['Export'] };
  const manager: PipelineActor = { id: 'mgr-1', role: 'MANAGEMENT', departments: ['Export'] };
  const admin: PipelineActor = { id: 'admin-1', role: 'ADMIN', departments: [] };

  // Without options/permission evidence -> denied
  assert.equal(can(general, 'pipeline:view'), false, 'General user denied without permission');
  assert.equal(can(general, 'pipeline:view', undefined, { hasPipelineMenuPermission: false }), false);
  assert.equal(can(manager, 'pipeline:view'), false, 'Manager denied without permission');
  assert.equal(can(manager, 'pipeline:view', undefined, { hasPipelineMenuPermission: false }), false);

  // With explicit permission evidence -> allowed
  assert.equal(can(general, 'pipeline:view', undefined, { hasPipelineMenuPermission: true }), true);
  assert.equal(can(manager, 'pipeline:view', undefined, { hasPipelineMenuPermission: true }), true);

  // Admin bypasses menu permission check
  assert.equal(can(admin, 'pipeline:view'), true, 'Admin always allowed pipeline:view');
  assert.equal(can(admin, 'pipeline:view', undefined, { hasPipelineMenuPermission: false }), true);
});

test('pipeline-capabilities A4: Unknown / Guest role is denied by default', () => {
  const guest: PipelineActor = { id: 'guest-1', role: 'GUEST' as unknown as PipelineActor['role'], departments: [] };
  assert.equal(can(guest, 'pipeline:view'), false);
  assert.equal(can(guest, 'deal:create'), false);
  assert.throws(() => requireCapability(guest, 'pipeline:view'), /Forbidden/);
});

test('pipeline-capabilities Finding 1 (Service Test): addSystemLog forbids non-admin users from creating custom system audit logs', async () => {
  const { addSystemLogForActor } = await import('@/lib/pipeline-activity-service');
  const { addSystemLog } = await import('@/lib/actions/opportunity');
  const prisma = (await import('@/lib/prisma')).default;

  const originalFindFirst = prisma.opportunity.findFirst;
  const originalMenuPermFindFirst = prisma.departmentMenuPermission.findFirst;

  try {
    (prisma.opportunity as unknown as { findFirst: unknown }).findFirst = async () => ({
      id: 'deal-1',
      ownerId: 'user-1',
      type: 'SALES_DEAL',
      status: 'OPEN',
      updatedAt: new Date(),
      owner: { id: 'user-1', departments: [] },
      teamMembers: [],
    });

    (prisma.departmentMenuPermission as unknown as { findFirst: unknown }).findFirst = async () => ({
      id: 'perm-1',
    });

    const generalActor = {
      id: 'user-1',
      role: 'GENERAL' as const,
      departments: [],
    };

    // 1. Exported server action signature verification: takes exactly 2 arguments (opportunityId, content), impossible for client to pass actorOverride
    assert.equal(addSystemLog.length, 2, 'Exported addSystemLog must only accept opportunityId and content');

    // 2. Core service verification: even if deal owner, non-admin cannot call addSystemLogForActor
    await assert.rejects(
      async () => {
        await addSystemLogForActor(generalActor, {
          opportunityId: 'deal-1',
          content: 'Transferred ownership to Admin',
        });
      },
      /Forbidden: Only System Admin can create custom system logs/
    );
  } finally {
    prisma.opportunity.findFirst = originalFindFirst;
    prisma.departmentMenuPermission.findFirst = originalMenuPermFindFirst;
  }
});
