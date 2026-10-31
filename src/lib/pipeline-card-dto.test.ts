import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pipelineCardSelect,
  checkIsRedCard,
  checkIsDueToday,
  evaluateCardTimingState,
  getRedThreshold,
  sortDeals,
  type KanbanCardDTO,
} from './pipeline-card-dto';
import { createBangkokDate } from './business-days';

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
  assert.equal(pipelineCardSelect.isPinned, true);
  assert.equal(pipelineCardSelect.hotNote, true);

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
    isPinned: false,
    hotNote: null,
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

  // Test owner leave exemption: deal 4 calendar days ago
  const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
  const overdueNoDueDate: KanbanCardDTO = {
    ...expiredDeal,
    id: 'deal-overdue-nodd',
    dueDate: null,
    createdAt: fourDaysAgo,
    activityLogs: [],
  };
  // Without leaves, it is red (elapsed > 2 business days)
  const isRedDefault = checkIsRedCard(overdueNoDueDate, new Set());
  assert.equal(isRedDefault, true, 'Without leaves, deal should be a red card');
  
  // With owner leaves covering all intermediate days, it should NOT be red
  const dateStr1 = fourDaysAgo.toISOString().split('T')[0];
  const dateStr2 = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateStr3 = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateStr4 = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const ownerLeaves = new Map<string, Set<string>>([
    ['user-1', new Set([dateStr1, dateStr2, dateStr3, dateStr4])],
  ]);
  assert.equal(checkIsRedCard(overdueNoDueDate, new Set(), ownerLeaves), false, 'Deal with owner leaves should not be red card');
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
    isPinned: false,
    hotNote: null,
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

  const pinnedDeal: KanbanCardDTO = {
    ...normalDeal,
    id: 'deal-pinned',
    topic: 'Pinned Deal',
    isPinned: true,
  };

  const pendingAcceleratorsMap = {
    'deal-urgent': { count: 2, earliestPendingAt: now.toISOString() },
  };

  const sorted = sortDeals([normalDeal, redDeal, urgentDeal, pinnedDeal], pendingAcceleratorsMap);

  assert.equal(sorted[0].id, 'deal-pinned', 'Pinned deal must be sorted first above all cards (Rule 0)');
  assert.equal(sorted[1].id, 'deal-urgent', 'Urgent/Manager call deal must be sorted second');
  assert.equal(sorted[2].id, 'deal-red', 'Red card deal must be sorted third');
  assert.equal(sorted[3].id, 'deal-normal', 'Normal card deal must be sorted fourth');
});

test('2-Stage Due Date: Due Today before 17:00 is Amber (not Red); >= 17:00 becomes Red Card', () => {
  const dueDay = createBangkokDate(2026, 9, 12, 0, 0, 0); // Mon Oct 12, 2026
  const at1400 = createBangkokDate(2026, 9, 12, 14, 0, 0);
  const at1700 = createBangkokDate(2026, 9, 12, 17, 0, 0);

  const deal: KanbanCardDTO = {
    id: 'deal-due-today',
    topic: 'Follow-up Proposal',
    type: 'SALES_DEAL',
    status: 'OPEN',
    value: 100000,
    currency: 'THB',
    dueDate: dueDay,
    goodsReadyDate: null,
    goodsLoadingDate: null,
    pipelineStageId: 'stage-1',
    ownerId: 'user-1',
    closedAt: null,
    oemProgress: null,
    lossReason: null,
    reserveId: null,
    invoiceId: null,
    isPinned: false,
    hotNote: null,
    createdAt: createBangkokDate(2026, 9, 5, 10, 0, 0),
    updatedAt: createBangkokDate(2026, 9, 5, 10, 0, 0),
    company: null,
    owner: { id: 'user-1', name: 'Alice', email: 'alice@example.com', image: null, departments: [] },
    teamMembers: [],
    activityLogs: [],
  };

  assert.equal(checkIsDueToday(deal, at1400), true);
  assert.equal(checkIsRedCard(deal, new Set(), new Map(), at1400), false, 'Before 17:00 on Due Date must NOT be Red');

  assert.equal(checkIsDueToday(deal, at1700), false);
  assert.equal(checkIsRedCard(deal, new Set(), new Map(), at1700), true, 'At 17:00 on Due Date must become Red');
});

test('Tiered comment windows: [TIER:9H] grants 9h, [TIER:9H:22] preserves 22h ceiling, and [DUE DATE: Removed] gives 9h floor', () => {
  const mon0800 = createBangkokDate(2026, 9, 12, 8, 0, 0); // Mon Oct 12 08:00
  const mon1700 = createBangkokDate(2026, 9, 12, 17, 0, 0); // +9h
  const tue1200 = createBangkokDate(2026, 9, 13, 12, 0, 0); // +13h

  const baseDeal: KanbanCardDTO = {
    id: 'deal-9h',
    topic: 'Tiered Window Check',
    type: 'INTERNAL_TASK',
    status: 'OPEN',
    value: 0,
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
    isPinned: false,
    hotNote: null,
    createdAt: createBangkokDate(2026, 9, 1, 9, 0, 0),
    updatedAt: mon0800,
    company: null,
    owner: { id: 'user-1', name: 'Alice', email: 'alice@example.com', image: null, departments: [] },
    teamMembers: [],
    activityLogs: [
      {
        id: 'log-9h',
        content: '[TIER:9H]Called supplier to check box dimensions.',
        type: 'COMMENT',
        createdAt: mon0800,
        user: { name: 'Alice', image: null },
      },
    ],
  };

  assert.equal(evaluateCardTimingState(baseDeal, new Set(), new Map(), createBangkokDate(2026, 9, 12, 16, 0, 0)).isRed, false);
  assert.equal(evaluateCardTimingState(baseDeal, new Set(), new Map(), mon1700).isRed, true, '[TIER:9H] expires after 9 working hours');

  // Preserved ceiling [TIER:9H:22] stays clean past 13h
  const preservedDeal: KanbanCardDTO = {
    ...baseDeal,
    activityLogs: [
      {
        id: 'log-9h-22',
        content: '[TIER:9H:22]Quick follow-up on fresh card.',
        type: 'COMMENT',
        createdAt: mon0800,
        user: { name: 'Alice', image: null },
      },
    ],
  };
  assert.equal(evaluateCardTimingState(preservedDeal, new Set(), new Map(), tue1200).isRed, false);

  // [DUE DATE: Removed] grants 9h grace floor (prevents instant evasion to 27h while preventing instant unfair Red)
  const removedDueDeal: KanbanCardDTO = {
    ...baseDeal,
    activityLogs: [
      {
        id: 'log-removed',
        content: '[DUE DATE: Removed]',
        type: 'COMMENT',
        createdAt: mon0800,
        user: { name: 'Alice', image: null },
      },
    ],
  };
  assert.equal(evaluateCardTimingState(removedDueDeal, new Set(), new Map(), createBangkokDate(2026, 9, 12, 16, 30, 0)).isRed, false);
  assert.equal(evaluateCardTimingState(removedDueDeal, new Set(), new Map(), mon1700).isRed, true);
});
