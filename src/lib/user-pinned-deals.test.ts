import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPinnedDealsStorageKey, parsePinnedDealIds } from './user-pinned-deals-shared';
import { sortDeals, type KanbanCardDTO } from './pipeline-card-dto';

test('User Pinned Deals: storage key is strictly isolated per userId', () => {
  assert.equal(getPinnedDealsStorageKey('user-alice'), 'crm_pinned_deals_user-alice');
  assert.equal(getPinnedDealsStorageKey('user-bob'), 'crm_pinned_deals_user-bob');
  assert.notEqual(getPinnedDealsStorageKey('user-alice'), getPinnedDealsStorageKey('user-bob'));
});

test('User Pinned Deals: parsePinnedDealIds handles valid, URI-encoded, and corrupt strings', () => {
  assert.deepEqual(parsePinnedDealIds(null), []);
  assert.deepEqual(parsePinnedDealIds(undefined), []);
  assert.deepEqual(parsePinnedDealIds(''), []);
  assert.deepEqual(parsePinnedDealIds('invalid json {'), []);
  assert.deepEqual(parsePinnedDealIds(JSON.stringify(['deal-1', 'deal-2'])), ['deal-1', 'deal-2']);
  assert.deepEqual(
    parsePinnedDealIds(encodeURIComponent(JSON.stringify(['deal-3', 'deal-4']))),
    ['deal-3', 'deal-4']
  );
  // Filters non-string or empty items
  assert.deepEqual(parsePinnedDealIds(JSON.stringify(['deal-1', '', null, 123, 'deal-2'])), ['deal-1', 'deal-2']);
});

test('User Pinned Deals: independent user views sort cards differently based on their own pinned set', () => {
  const dealA: KanbanCardDTO = {
    id: 'deal-A',
    topic: 'Deal A',
    type: 'SALES_DEAL',
    status: 'OPEN',
    value: 10000,
    currency: 'THB',
    dueDate: null,
    goodsReadyDate: null,
    goodsLoadingDate: null,
    pipelineStageId: 'stage-1',
    ownerId: 'owner-1',
    closedAt: null,
    oemProgress: 0,
    lossReason: null,
    reserveId: null,
    invoiceId: null,
    isPinned: false,
    hotNote: null,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-01T10:00:00Z'),
    company: null,
    owner: { id: 'owner-1', name: 'Owner', email: 'owner@example.com', image: null, departments: [{ id: 'dept-1', name: 'Sales' }] },
    teamMembers: [],
    activityLogs: [],
  };

  const dealB: KanbanCardDTO = {
    ...dealA,
    id: 'deal-B',
    topic: 'Deal B',
    updatedAt: new Date('2026-10-02T10:00:00Z'), // More recently updated than A
  };

  // Alice pins Deal A
  const alicePinnedSet = new Set(['deal-A']);
  const aliceDeals = [dealA, dealB].map(d => ({ ...d, isPinned: alicePinnedSet.has(d.id) }));
  const aliceSorted = sortDeals(aliceDeals);
  assert.equal(aliceSorted[0].id, 'deal-A', 'Deal A must be at top for Alice because Alice pinned it');

  // Bob pins Deal B
  const bobPinnedSet = new Set(['deal-B']);
  const bobDeals = [dealA, dealB].map(d => ({ ...d, isPinned: bobPinnedSet.has(d.id) }));
  const bobSorted = sortDeals(bobDeals);
  assert.equal(bobSorted[0].id, 'deal-B', 'Deal B must be at top for Bob because Bob pinned it');

  // Charlie has no pins; deal B is top because it is newer
  const charlieDeals = [dealA, dealB].map(d => ({ ...d, isPinned: false }));
  const charlieSorted = sortDeals(charlieDeals);
  assert.equal(charlieSorted[0].id, 'deal-B', 'Deal B must be at top for Charlie by default recency');
});
