import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pipelineCardSelect,
  checkIsRedCard,
  getRedThreshold,
  sortDeals,
  type KanbanCardDTO,
} from './pipeline-card-dto';

test('pipelineCardSelect: enforces minimal payload configuration', () => {
  // 1. Essential card fields must be selected
  assert.equal(pipelineCardSelect.id, true);
  assert.equal(pipelineCardSelect.topic, true);
  assert.equal(pipelineCardSelect.type, true);
  assert.equal(pipelineCardSelect.status, true);
  assert.equal(pipelineCardSelect.value, true);
  assert.equal(pipelineCardSelect.currency, true);
  assert.equal(pipelineCardSelect.dueDate, true);
  assert.equal(pipelineCardSelect.pipelineStageId, true);
  assert.equal(pipelineCardSelect.ownerId, true);

  // 2. Activity logs must strictly fetch only 1 latest non-system log
  const activityLogsSelect = pipelineCardSelect.activityLogs as {
    take?: number;
    where?: { type?: string; NOT?: unknown[] };
    select?: Record<string, unknown>;
  };
  assert.equal(activityLogsSelect.take, 1);
  assert.equal(activityLogsSelect.where?.type, 'COMMENT');
  assert.ok(activityLogsSelect.where?.NOT && Array.isArray(activityLogsSelect.where.NOT));

  // 3. Heavy non-board relations MUST NOT be selected on the board
  assert.equal((pipelineCardSelect as Record<string, unknown>).notes, undefined);
  assert.equal((pipelineCardSelect as Record<string, unknown>).sharedMedia, undefined);
  assert.equal((pipelineCardSelect as Record<string, unknown>).dealSummaries, undefined);
  assert.equal((pipelineCardSelect as Record<string, unknown>).systemLogs, undefined);
});

test('KanbanCardDTO: Red Card threshold detection works with card DTO', () => {
  const now = new Date();
  const pastDueDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const futureDueDate = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const expiredDeal: KanbanCardDTO = {
    id: 'deal-expired',
    topic: 'Overdue Project',
    type: 'SALES_DEAL',
    status: 'OPEN',
    value: 50000,
    currency: 'THB',
    dueDate: pastDueDate,
    goodsReadyDate: null,
    goodsLoadingDate: null,
    pipelineStageId: 'stage-1',
    ownerId: 'user-1',
    closedAt: null,
    oemProgress: null,
    lossReason: null,
    reserveId: null,
    invoiceId: null,
    createdAt: now,
    updatedAt: now,
    company: { id: 'comp-1', name: 'Acme Corp', displayName: 'Acme' },
    owner: { id: 'user-1', name: 'Alice', email: 'alice@example.com', image: null, departments: [] },
    teamMembers: [],
    activityLogs: [],
  };

  assert.equal(checkIsRedCard(expiredDeal), true, 'Expired deal should be a red card');
  assert.ok(getRedThreshold(expiredDeal) !== null);

  const futureDeal: KanbanCardDTO = {
    ...expiredDeal,
    id: 'deal-future',
    dueDate: futureDueDate,
  };
  assert.equal(checkIsRedCard(futureDeal), false, 'Future due deal should not be a red card');
});

test('KanbanCardDTO: sortDeals correctly prioritizes Urgent, Red, and Normal DTO cards', () => {
  const now = new Date();
  const pastDueDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const normalDeal: KanbanCardDTO = {
    id: 'deal-normal',
    topic: 'Normal Deal',
    type: 'SALES_DEAL',
    status: 'OPEN',
    value: 10000,
    currency: 'THB',
    dueDate: null,
    goodsReadyDate: null,
    goodsLoadingDate: null,
    pipelineStageId: 'stage-1',
    ownerId: 'user-1',
    closedAt: null,
    oemProgress: null,
    lossReason: null,
    reserveId: null,
    invoiceId: null,
    createdAt: new Date(now.getTime() - 1000),
    updatedAt: new Date(now.getTime() - 1000),
    company: null,
    owner: { id: 'user-1', name: 'Alice', email: 'alice@example.com', image: null, departments: [] },
    teamMembers: [],
    activityLogs: [],
  };

  const redDeal: KanbanCardDTO = {
    ...normalDeal,
    id: 'deal-red',
    topic: 'Red Deal',
    dueDate: pastDueDate,
  };

  const urgentDeal: KanbanCardDTO = {
    ...normalDeal,
    id: 'deal-urgent',
    topic: 'Urgent Deal',
  };

  const pendingAcceleratorsMap = {
    'deal-urgent': { count: 2, earliestPendingAt: now.toISOString() },
  };

  const sorted = sortDeals([normalDeal, redDeal, urgentDeal], pendingAcceleratorsMap);

  assert.equal(sorted[0].id, 'deal-urgent', 'Urgent/Manager call deal must be sorted first');
  assert.equal(sorted[1].id, 'deal-red', 'Red card deal must be sorted second');
  assert.equal(sorted[2].id, 'deal-normal', 'Normal card deal must be sorted third');
});
