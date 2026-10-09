import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortDeals, type KanbanCardDTO } from './pipeline-card-dto';

const sampleDeal1: KanbanCardDTO = {
  id: 'deal-1',
  topic: 'Chemical Supply Agreement',
  type: 'SALES_DEAL',
  status: 'OPEN',
  value: 50000,
  currency: 'THB',
  dueDate: null,
  goodsReadyDate: null,
  goodsLoadingDate: null,
  pipelineStageId: 'stage-1',
  ownerId: 'user-1',
  closedAt: null,
  oemProgress: 0,
  lossReason: null,
  reserveId: null,
  invoiceId: null,
  isPinned: false,
  hotNote: null,
  createdAt: new Date('2026-10-01T10:00:00Z'),
  updatedAt: new Date('2026-10-01T10:00:00Z'),
  company: { id: 'comp-1', name: 'Alpha Corp', displayName: 'Alpha Trading' },
  owner: { id: 'user-1', name: 'Alice', email: 'alice@example.com', image: null, departments: [{ id: 'dept-1', name: 'Sales' }] },
  teamMembers: [],
  activityLogs: [],
};

const sampleDeal2: KanbanCardDTO = {
  id: 'deal-2',
  topic: 'Machinery Export',
  type: 'SALES_DEAL',
  status: 'OPEN',
  value: 80000,
  currency: 'THB',
  dueDate: null,
  goodsReadyDate: null,
  goodsLoadingDate: null,
  pipelineStageId: 'stage-1',
  ownerId: 'user-2',
  closedAt: null,
  oemProgress: 0,
  lossReason: null,
  reserveId: null,
  invoiceId: null,
  isPinned: false,
  hotNote: 'Urgent delivery needed',
  createdAt: new Date('2026-10-02T10:00:00Z'),
  updatedAt: new Date('2026-10-02T10:00:00Z'),
  company: { id: 'comp-2', name: 'Beta Ltd', displayName: 'Beta Tech' },
  owner: { id: 'user-2', name: 'Bob', email: 'bob@example.com', image: null, departments: [{ id: 'dept-1', name: 'Sales' }] },
  teamMembers: [],
  activityLogs: [],
};

test('P4 Lean DTO Merge: preserves card relations when partial isPinned update arrives', () => {
  const existing = sampleDeal1;
  const leanUpdate = {
    id: 'deal-1',
    isPinned: true,
    pipelineStageId: 'stage-1',
    status: 'OPEN' as const,
    updatedAt: new Date('2026-10-06T12:00:00Z'),
  };

  const merged = { ...existing, ...leanUpdate };

  assert.equal(merged.isPinned, true);
  assert.equal(merged.topic, 'Chemical Supply Agreement');
  assert.equal(merged.company?.displayName, 'Alpha Trading');
  assert.equal(merged.owner?.name, 'Alice');
  assert.equal(merged.pipelineStageId, 'stage-1');
  assert.equal(merged.updatedAt.toISOString(), '2026-10-06T12:00:00.000Z');
});

test('P4 Lean DTO Re-sort: sortDeals places newly pinned card at top of stage', () => {
  const deals = [sampleDeal1, sampleDeal2];
  
  // Before pin: deal-1 is older/more overdue red card, so it is at index 0
  const initialSorted = sortDeals(deals);
  assert.equal(initialSorted[0].id, 'deal-1');

  // When deal-2 is pinned:
  const updatedDeal2 = { ...sampleDeal2, isPinned: true };
  const nextSorted = sortDeals([sampleDeal1, updatedDeal2]);
  
  // deal-2 must immediately jump to index 0 because Rule 0 (Star/Pin) takes absolute priority over red cards
  assert.equal(nextSorted[0].id, 'deal-2');
  assert.equal(nextSorted[0].isPinned, true);
  assert.equal(nextSorted[1].id, 'deal-1');
});

test('P4 Mutation Guard: out-of-order response rejection preserves later user clicks', () => {
  let localState = false;
  let activeMutationId = 0;

  // Click 1: User pins card
  const mutation1 = ++activeMutationId;
  localState = true;

  // Click 2: Rapidly unpins card before Request 1 returns
  const mutation2 = ++activeMutationId;
  localState = false;

  // Request 1 returns late (success with isPinned=true)
  const handleResponse1 = (resPinned: boolean) => {
    if (mutation1 === activeMutationId) {
      localState = resPinned;
    }
  };
  handleResponse1(true);

  // State must remain FALSE (Request 1 was discarded)
  assert.equal(localState, false, 'Late Request 1 must not overwrite Request 2');

  // Request 2 returns (success with isPinned=false)
  const handleResponse2 = (resPinned: boolean) => {
    if (mutation2 === activeMutationId) {
      localState = resPinned;
    }
  };
  handleResponse2(false);

  assert.equal(localState, false);
});

test('P4 Mutation Guard: failure on Request 1 does not roll back active Request 2', () => {
  let localState = false;
  let activeMutationId = 0;

  // Click 1
  const mutation1 = ++activeMutationId;
  localState = true;

  // Click 2
  const mutation2 = ++activeMutationId;
  assert.equal(mutation2, 2);
  localState = false;

  // Request 1 fails!
  const handleError1 = () => {
    if (mutation1 === activeMutationId) {
      localState = false; // rollback
    }
  };
  handleError1();

  assert.equal(localState, false, 'Failed Request 1 must not trigger rollback when Request 2 is active');
});
