import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDailySamplingForMonth } from './leaderboard-daily-sampling';
import type { KanbanCardDTO } from '@/lib/pipeline-card-dto';
import { createBangkokDate } from '@/lib/business-days';

test('leaderboard-daily-sampling: correctly samples daily health and aggregates monthly stats', () => {
  const users = [
    { id: 'user-clean', name: 'Clean Rep' },
    { id: 'user-delayed', name: 'Delayed Rep' },
    { id: 'user-empty', name: 'No Cards Rep' },
  ];

  // Month: October 2026 (starts on Thursday, Oct 1)
  // asOfDate: Oct 5, 2026 14:00 (Monday)
  // Oct 1 = Thu, Oct 2 = Fri, Oct 3 = Sat (assume working unless dayoff), Oct 4 = Sun (off), Oct 5 = Mon
  const asOfDate = createBangkokDate(2026, 9, 5, 14, 0, 0); // Month 9 in JS is Oct
  const companyHolidays = new Set<string>(['2026-10-03']); // Saturday day-off
  const leavesByUser = new Map<string, Set<string>>([
    ['user-delayed', new Set(['2026-10-02'])], // delayed rep took leave on Friday
  ]);

  const deals: KanbanCardDTO[] = [
    // Clean rep: 1 deal, always updated
    {
      id: 'deal-1',
      topic: 'Clean Deal',
      type: 'SALES_DEAL',
      status: 'OPEN',
      value: 100000,
      currency: 'THB',
      dueDate: null,
      goodsReadyDate: null,
      goodsLoadingDate: null,
      pipelineStageId: 'stage-1',
      ownerId: 'user-clean',
      closedAt: null,
      oemProgress: null,
      lossReason: null,
      reserveId: null,
      invoiceId: null,
      isPinned: false,
      hotNote: null,
      createdAt: createBangkokDate(2026, 8, 20),
      updatedAt: createBangkokDate(2026, 9, 5),
      company: { id: 'comp-1', name: 'Clean Co', displayName: 'Clean Co' },
      owner: { id: 'user-clean', name: 'Clean Rep', email: null, image: null, departments: [] },
      teamMembers: [],
      activityLogs: [
        {
          id: 'log-1',
          content: 'Just updated client today',
          type: 'COMMENT',
          createdAt: createBangkokDate(2026, 9, 5, 10, 0, 0),
          user: { name: 'Clean Rep', image: null },
        },
        {
          id: 'log-0',
          content: 'Follow up call with client',
          type: 'COMMENT',
          createdAt: createBangkokDate(2026, 9, 1, 9, 0, 0),
          user: { name: 'Clean Rep', image: null },
        },
      ],
    },
    // Delayed rep: 1 deal with expired due date
    {
      id: 'deal-2',
      topic: 'Delayed Deal',
      type: 'SALES_DEAL',
      status: 'OPEN',
      value: 50000,
      currency: 'THB',
      dueDate: createBangkokDate(2026, 8, 30), // Due Sept 30 (expired before Oct 1)
      goodsReadyDate: null,
      goodsLoadingDate: null,
      pipelineStageId: 'stage-1',
      ownerId: 'user-delayed',
      closedAt: null,
      oemProgress: null,
      lossReason: null,
      reserveId: null,
      invoiceId: null,
      isPinned: false,
      hotNote: null,
      createdAt: createBangkokDate(2026, 8, 15),
      updatedAt: createBangkokDate(2026, 8, 15),
      company: { id: 'comp-2', name: 'Delayed Co', displayName: 'Delayed Co' },
      owner: { id: 'user-delayed', name: 'Delayed Rep', email: null, image: null, departments: [] },
      teamMembers: [],
      activityLogs: [],
    },
  ];

  const sampling = calculateDailySamplingForMonth({
    departmentUsers: users,
    deals,
    month: 10,
    year: 2026,
    companyHolidays,
    leavesByUser,
    asOfDate,
  });

  // Verify clean rep
  const cleanSummary = sampling.get('user-clean')!;
  assert.ok(cleanSummary);
  assert.equal(cleanSummary.totalRedHours, 0);
  assert.equal(cleanSummary.avgMonthlyRedRate, 0);
  assert.equal(cleanSummary.avgMonthlyHealthRate, 100);
  assert.equal(cleanSummary.totalCardHealthXp, 50); // 0% red rate = 50 XP
  assert.equal(cleanSummary.cleanDaysCount, cleanSummary.totalWorkingDays);
  assert.equal(cleanSummary.redDaysCount, 0);

  // Verify empty rep (0 active cards)
  const emptySummary = sampling.get('user-empty')!;
  assert.ok(emptySummary);
  assert.equal(emptySummary.avgMonthlyHealthRate, 0);
  assert.equal(emptySummary.totalCardHealthXp, 0);
  assert.equal(emptySummary.currentActiveCards, 0);

  // Verify delayed rep: took leave on Oct 2, Oct 3 dayoff, Oct 4 Sunday
  const delayedSummary = sampling.get('user-delayed')!;
  assert.ok(delayedSummary);
  assert.ok(delayedSummary.totalRedHours > 0);
  assert.ok(delayedSummary.redDaysCount > 0);
  assert.equal(delayedSummary.totalCardHealthXp, 0); // 100% red rate >= 10% cutoff = 0 XP

  // Check Oct 2 (Friday): was on leave, so should be isOffDay
  const oct2Record = delayedSummary.dailyRecords.find((r) => r.dateKey === '2026-10-02');
  assert.ok(oct2Record);
  assert.equal(oct2Record.isOffDay, true);
  assert.equal(oct2Record.offDayReason, 'Leave');

  // Check Oct 3 (Saturday): company holiday / dayoff
  const oct3Record = delayedSummary.dailyRecords.find((r) => r.dateKey === '2026-10-03');
  assert.ok(oct3Record);
  assert.equal(oct3Record.isOffDay, true);
  assert.equal(oct3Record.offDayReason, 'Dayoff');

  // Check Oct 4 (Sunday)
  const oct4Record = delayedSummary.dailyRecords.find((r) => r.dateKey === '2026-10-04');
  assert.ok(oct4Record);
  assert.equal(oct4Record.isOffDay, true);
  assert.equal(oct4Record.offDayReason, 'Sunday');
});

test('leaderboard-daily-sampling: historical sampling retains earlier log when new log is added in next day', () => {
  const users = [{ id: 'user-mild', name: 'Mild' }];
  // Mild updated deal on Oct 5 at 17:16 Bangkok time.
  // Later, another user updated deal on Oct 6 at 08:28 Bangkok time.
  const deals: KanbanCardDTO[] = [
    {
      id: 'deal-mild',
      topic: 'Dis น้ำมันนวด -ลาว',
      type: 'SALES_DEAL',
      status: 'OPEN',
      value: 100000,
      currency: 'THB',
      dueDate: null,
      goodsReadyDate: null,
      goodsLoadingDate: null,
      pipelineStageId: 'stage-1',
      ownerId: 'user-mild',
      closedAt: null,
      oemProgress: null,
      lossReason: null,
      reserveId: null,
      invoiceId: null,
      isPinned: false,
      hotNote: null,
      createdAt: createBangkokDate(2026, 8, 20),
      updatedAt: createBangkokDate(2026, 9, 6, 8, 28),
      company: { id: 'comp-mild', name: 'Maple Jidapa', displayName: 'Maple Jidapa' },
      owner: { id: 'user-mild', name: 'Mild', email: null, image: null, departments: [] },
      teamMembers: [],
      activityLogs: [
        {
          id: 'log-oct6',
          content: 'user updated on Oct 6 morning',
          type: 'COMMENT',
          createdAt: createBangkokDate(2026, 9, 6, 8, 28),
          user: { name: 'User', image: null },
        },
        {
          id: 'log-oct5',
          content: 'Mild updated on Oct 5 evening',
          type: 'COMMENT',
          createdAt: createBangkokDate(2026, 9, 5, 17, 16),
          user: { name: 'Mild', image: null },
        },
      ],
    },
  ];

  const sampling = calculateDailySamplingForMonth({
    departmentUsers: users,
    deals,
    month: 10,
    year: 2026,
    companyHolidays: new Set(),
    leavesByUser: new Map(),
    asOfDate: createBangkokDate(2026, 9, 6, 8, 48),
  });

  const mildSummary = sampling.get('user-mild')!;
  assert.ok(mildSummary);

  // Oct 5 should be CLEAN (0 red cards) because Mild had updated at 17:16
  const oct5Record = mildSummary.dailyRecords.find((r) => r.dateKey === '2026-10-05');
  assert.ok(oct5Record);
  assert.equal(oct5Record.redCardsCount, 0);
  assert.equal(oct5Record.cleanCardsCount, 1);
  assert.equal(oct5Record.redHours, 0);

  // Oct 6 should also be CLEAN (0 red cards)
  const oct6Record = mildSummary.dailyRecords.find((r) => r.dateKey === '2026-10-06');
  assert.ok(oct6Record);
  assert.equal(oct6Record.redCardsCount, 0);
  assert.equal(oct6Record.cleanCardsCount, 1);
});

test('leaderboard-daily-sampling: OPEN deal with expired due date is counted as red card even if legacy closedAt exists', () => {
  const users = [{ id: 'user-boy', name: 'BOY' }];
  const deals: KanbanCardDTO[] = [
    {
      id: 'deal-m2j',
      topic: 'Follow Up M2J',
      type: 'SALES_DEAL',
      status: 'OPEN',
      value: 100000,
      currency: 'THB',
      dueDate: createBangkokDate(2026, 8, 23), // Due 23 Sept 2026 (expired)
      goodsReadyDate: null,
      goodsLoadingDate: null,
      pipelineStageId: 'stage-1',
      ownerId: 'user-boy',
      closedAt: createBangkokDate(2026, 0, 14), // Legacy closedAt date from past import
      oemProgress: null,
      lossReason: null,
      reserveId: null,
      invoiceId: null,
      isPinned: false,
      hotNote: null,
      createdAt: createBangkokDate(2026, 7, 29),
      updatedAt: createBangkokDate(2026, 8, 17),
      company: { id: 'comp-m2j', name: 'M2J', displayName: 'M2J' },
      owner: { id: 'user-boy', name: 'BOY', email: null, image: null, departments: [] },
      teamMembers: [],
      activityLogs: [
        {
          id: 'log-yui',
          content: 'สรุปเงื่อนที่ M2J (ปรับใหม่)',
          type: 'COMMENT',
          createdAt: createBangkokDate(2026, 8, 10, 16, 51),
          user: { name: 'YUI', image: null },
        },
      ],
    },
  ];

  const sampling = calculateDailySamplingForMonth({
    departmentUsers: users,
    deals,
    month: 10,
    year: 2026,
    companyHolidays: new Set(),
    leavesByUser: new Map(),
    asOfDate: createBangkokDate(2026, 9, 6, 11, 12),
  });

  const boySummary = sampling.get('user-boy')!;
  assert.ok(boySummary);

  const oct6Record = boySummary.dailyRecords.find((r) => r.dateKey === '2026-10-06');
  assert.ok(oct6Record);
  assert.equal(oct6Record.activeCardsCount, 1, 'Should count open deal as active even with legacy closedAt');
  assert.equal(oct6Record.redCardsCount, 1, 'Should count deal as red card because due date is expired');
  assert.equal(oct6Record.redCardDetails.length, 1);
  assert.equal(oct6Record.redCardDetails[0].topic, 'Follow Up M2J');
  assert.equal(oct6Record.redCardDetails[0].redHoursToday, 9);
  assert.ok(oct6Record.redCardDetails[0].overdueWorkingHours > 0);
});

