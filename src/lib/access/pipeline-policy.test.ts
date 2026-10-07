import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canActorAccessPipeline,
  buildOpportunityAccessWhere,
  evaluateOpportunityAccess,
  type OpportunityAccessCheckSubject,
} from './pipeline-policy';
import type { PipelineActor } from '@/lib/pipeline-security';

test('pipeline-policy A0: canActorAccessPipeline enforces role and menu boundaries', () => {
  // ADMIN bypasses menu permission check
  assert.equal(canActorAccessPipeline('ADMIN', true), true, 'Admin with permission is allowed');
  assert.equal(canActorAccessPipeline('ADMIN', false), true, 'Admin without permission is still allowed (bypass)');

  // MANAGEMENT requires menu permission
  assert.equal(canActorAccessPipeline('MANAGEMENT', true), true, 'Manager with permission is allowed');
  assert.equal(canActorAccessPipeline('MANAGEMENT', false), false, 'Manager without permission is denied');

  // GENERAL requires menu permission
  assert.equal(canActorAccessPipeline('GENERAL', true), true, 'General user with permission is allowed');
  assert.equal(canActorAccessPipeline('GENERAL', false), false, 'General user without permission is denied');

  // Unauthorized roles are unconditionally denied
  assert.equal(canActorAccessPipeline('GUEST', true), false, 'Guest is denied even if flag is true');
  assert.equal(canActorAccessPipeline('UNKNOWN', true), false, 'Unknown role is denied');
});

test('pipeline-policy A0: buildOpportunityAccessWhere produces expected Prisma filters', () => {
  const adminActor: PipelineActor = { id: 'admin-1', role: 'ADMIN', departments: ['Export'] };
  assert.deepEqual(buildOpportunityAccessWhere(adminActor), {}, 'Admin receives empty where clause');

  const managerActor: PipelineActor = { id: 'mgr-1', role: 'MANAGEMENT', departments: ['Export', 'Marketing'] };
  const managerWhere = buildOpportunityAccessWhere(managerActor);
  assert.ok(managerWhere.OR, 'Manager receives OR clause for departments');
  assert.equal(managerWhere.OR?.length, 2);

  const generalActor: PipelineActor = { id: 'user-1', role: 'GENERAL', departments: ['Export'] };
  const generalWhere = buildOpportunityAccessWhere(generalActor);
  assert.ok(generalWhere.OR, 'General receives OR clause for owner or team members');
  assert.equal(generalWhere.OR?.length, 2);
});

test('pipeline-policy A0: evaluateOpportunityAccess - ADMIN access', () => {
  const admin: PipelineActor = { id: 'admin-1', role: 'ADMIN', departments: [] };
  const randomDeal: OpportunityAccessCheckSubject = {
    id: 'deal-random',
    ownerId: 'user-99',
    owner: { id: 'user-99', departments: [{ name: 'Logistics' }] },
    teamMembers: [],
  };
  assert.equal(evaluateOpportunityAccess(admin, randomDeal), true, 'Admin can access any deal');
});

test('pipeline-policy A0: evaluateOpportunityAccess - GENERAL user scope', () => {
  const userA: PipelineActor = { id: 'user-a', role: 'GENERAL', departments: ['Export'] };

  // Deal owned by User A
  const ownedDeal: OpportunityAccessCheckSubject = {
    id: 'deal-1',
    ownerId: 'user-a',
    owner: { id: 'user-a', departments: [{ name: 'Export' }] },
    teamMembers: [],
  };
  assert.equal(evaluateOpportunityAccess(userA, ownedDeal), true, 'General user can access owned deal');

  // Deal where User A is a team member
  const memberDeal: OpportunityAccessCheckSubject = {
    id: 'deal-2',
    ownerId: 'user-b',
    owner: { id: 'user-b', departments: [{ name: 'Export' }] },
    teamMembers: [{ id: 'user-a', departments: [{ name: 'Export' }] }],
  };
  assert.equal(evaluateOpportunityAccess(userA, memberDeal), true, 'General user can access deal as team member');

  // Deal owned by colleague in same department (User A neither owner nor member)
  const colleagueDeal: OpportunityAccessCheckSubject = {
    id: 'deal-3',
    ownerId: 'user-b',
    owner: { id: 'user-b', departments: [{ name: 'Export' }] },
    teamMembers: [{ id: 'user-c', departments: [{ name: 'Export' }] }],
  };
  assert.equal(evaluateOpportunityAccess(userA, colleagueDeal), false, 'General user CANNOT access colleague deal');
});

test('pipeline-policy A0: evaluateOpportunityAccess - MANAGEMENT single and multi-department union', () => {
  const exportManager: PipelineActor = { id: 'mgr-export', role: 'MANAGEMENT', departments: ['Export'] };
  const multiManager: PipelineActor = { id: 'mgr-multi', role: 'MANAGEMENT', departments: ['Export', 'Marketing'] };

  const exportDeal: OpportunityAccessCheckSubject = {
    id: 'deal-exp',
    ownerId: 'sales-1',
    owner: { id: 'sales-1', departments: [{ name: 'Export' }] },
  };

  const marketingDeal: OpportunityAccessCheckSubject = {
    id: 'deal-mkt',
    ownerId: 'sales-2',
    owner: { id: 'sales-2', departments: [{ name: 'Marketing' }] },
  };

  const financeDeal: OpportunityAccessCheckSubject = {
    id: 'deal-fin',
    ownerId: 'sales-3',
    owner: { id: 'sales-3', departments: [{ name: 'Finance' }] },
  };

  // Export Manager checks
  assert.equal(evaluateOpportunityAccess(exportManager, exportDeal), true, 'Export manager can access Export deal');
  assert.equal(evaluateOpportunityAccess(exportManager, marketingDeal), false, 'Export manager CANNOT access Marketing deal');
  assert.equal(evaluateOpportunityAccess(exportManager, financeDeal), false, 'Export manager CANNOT access Finance deal');

  // Multi-department Manager checks (Union semantics)
  assert.equal(evaluateOpportunityAccess(multiManager, exportDeal), true, 'Multi manager can access Export deal');
  assert.equal(evaluateOpportunityAccess(multiManager, marketingDeal), true, 'Multi manager can access Marketing deal');
  assert.equal(evaluateOpportunityAccess(multiManager, financeDeal), false, 'Multi manager CANNOT access Finance deal');
});

test('pipeline-policy A0: evaluateOpportunityAccess - cross-department collaboration boundary', () => {
  // Deal owned by Export, with team member from Marketing
  const crossDeptDeal: OpportunityAccessCheckSubject = {
    id: 'deal-cross',
    ownerId: 'owner-export',
    owner: { id: 'owner-export', departments: [{ name: 'Export' }] },
    teamMembers: [
      { id: 'member-marketing', departments: [{ name: 'Marketing' }] },
    ],
  };

  const exportMgr: PipelineActor = { id: 'm-exp', role: 'MANAGEMENT', departments: ['Export'] };
  const marketingMgr: PipelineActor = { id: 'm-mkt', role: 'MANAGEMENT', departments: ['Marketing'] };
  const logisticsMgr: PipelineActor = { id: 'm-log', role: 'MANAGEMENT', departments: ['Logistics'] };

  assert.equal(evaluateOpportunityAccess(exportMgr, crossDeptDeal), true, 'Owner department manager has access');
  assert.equal(evaluateOpportunityAccess(marketingMgr, crossDeptDeal), true, 'Team member department manager has access');
  assert.equal(evaluateOpportunityAccess(logisticsMgr, crossDeptDeal), false, 'Unrelated department manager is denied');
});

test('pipeline-policy A0: evaluateOpportunityAccess - MANAGEMENT with no departments fallback', () => {
  const orphanManager: PipelineActor = { id: 'mgr-orphan', role: 'MANAGEMENT', departments: [] };

  const ownDeal: OpportunityAccessCheckSubject = {
    id: 'deal-own',
    ownerId: 'mgr-orphan',
    owner: { id: 'mgr-orphan', departments: [] },
  };

  const otherDeal: OpportunityAccessCheckSubject = {
    id: 'deal-other',
    ownerId: 'user-x',
    owner: { id: 'user-x', departments: [{ name: 'Export' }] },
  };

  assert.equal(evaluateOpportunityAccess(orphanManager, ownDeal), true, 'Manager with no departments can access own deal');
  assert.equal(evaluateOpportunityAccess(orphanManager, otherDeal), false, 'Manager with no departments CANNOT access other deals');
});

test('pipeline-policy A3: Department ID matching is resilient to department renaming', () => {
  // Manager assigned to dept-id-export, but name in DB has been renamed from 'Export' to 'Global Sales & Export'
  const exportManagerWithId: PipelineActor = {
    id: 'mgr-exp',
    role: 'MANAGEMENT',
    departments: ['Global Sales & Export'],
    departmentIds: ['dept-id-export'],
  };

  // Deal owned by user whose department ID is 'dept-id-export', but old name string
  const renamedDeptDeal: OpportunityAccessCheckSubject = {
    id: 'deal-renamed',
    ownerId: 'sales-1',
    owner: {
      id: 'sales-1',
      departments: [{ id: 'dept-id-export', name: 'Export' }],
    },
  };

  assert.equal(
    evaluateOpportunityAccess(exportManagerWithId, renamedDeptDeal),
    true,
    'Manager with matching department ID has access even if name is different or renamed'
  );

  // Cross-team member match by department ID
  const teamMemberDeptDeal: OpportunityAccessCheckSubject = {
    id: 'deal-cross-id',
    ownerId: 'other-owner',
    owner: { id: 'other-owner', departments: [{ id: 'dept-id-marketing', name: 'Marketing' }] },
    teamMembers: [
      { id: 'member-1', departments: [{ id: 'dept-id-export', name: 'Legacy Export' }] },
    ],
  };

  assert.equal(
    evaluateOpportunityAccess(exportManagerWithId, teamMemberDeptDeal),
    true,
    'Manager with matching department ID has access through team member'
  );
});

test('pipeline-policy A3: buildOpportunityAccessWhere prioritizes immutable departmentIds', () => {
  const actorWithIds: PipelineActor = {
    id: 'mgr-1',
    role: 'MANAGEMENT',
    departments: ['Export'],
    departmentIds: ['dept-export-uuid-1'],
  };

  const whereWithIds = buildOpportunityAccessWhere(actorWithIds);
  // Verify that the query uses id: { in: ['dept-export-uuid-1'] }
  const firstWhere = whereWithIds.OR?.[0] as {
    owner?: { departments?: { some?: { id?: { in: string[] } } } };
  } | undefined;
  const ownerDeptCondition = firstWhere?.owner?.departments?.some;
  assert.deepEqual(
    ownerDeptCondition?.id,
    { in: ['dept-export-uuid-1'] },
    'Query uses department ID in clause when departmentIds are provided'
  );

  // Fallback to name when departmentIds is empty
  const actorLegacyOnly: PipelineActor = {
    id: 'mgr-legacy',
    role: 'MANAGEMENT',
    departments: ['Export'],
    departmentIds: [],
  };

  const whereLegacy = buildOpportunityAccessWhere(actorLegacyOnly);
  const firstLegacyWhere = whereLegacy.OR?.[0] as {
    owner?: { departments?: { some?: { name?: { in: string[] } } } };
  } | undefined;
  const legacyOwnerDeptCondition = firstLegacyWhere?.owner?.departments?.some;
  assert.deepEqual(
    legacyOwnerDeptCondition?.name,
    { in: ['Export'] },
    'Query falls back to department name in clause when departmentIds is empty'
  );
});

test('pipeline-policy Finding 1: evaluateOpportunityAccess strict parity with query scope for MANAGEMENT', () => {
  const exportManager: PipelineActor = {
    id: 'mgr-export-1',
    role: 'MANAGEMENT',
    departments: ['Export'],
    departmentIds: ['dept-export-id'],
  };

  // Deal owned by the manager, but in Logistics department
  const outsideDeptDealOwnedByManager: OpportunityAccessCheckSubject = {
    id: 'deal-outside-dept',
    ownerId: 'mgr-export-1',
    owner: {
      id: 'mgr-export-1',
      departments: [{ id: 'dept-logistics-id', name: 'Logistics' }],
    },
    teamMembers: [],
  };

  // Pure evaluator must match the Prisma WHERE clause (which only checks manager's departmentIds)
  const evaluatedAccess = evaluateOpportunityAccess(exportManager, outsideDeptDealOwnedByManager);
  assert.equal(
    evaluatedAccess,
    false,
    'Manager cannot access outside-department deal even if ownerId matches, preserving 100% parity with query scope'
  );

  // In-department deal owned by someone else
  const inDeptDeal: OpportunityAccessCheckSubject = {
    id: 'deal-in-dept',
    ownerId: 'sales-rep-1',
    owner: {
      id: 'sales-rep-1',
      departments: [{ id: 'dept-export-id', name: 'Export' }],
    },
  };
  assert.equal(evaluateOpportunityAccess(exportManager, inDeptDeal), true, 'In-department deal is accessible');
});


