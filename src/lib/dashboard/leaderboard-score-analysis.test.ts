import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateUnifiedPortfolioBreakdown } from './leaderboard-scoring';
import {
  buildThaiDepartmentAnalysis,
  buildThaiLeaderboardAnalysis,
  canUserInspectAnalyseTarget,
} from './leaderboard-score-analysis';
import {
  canActorAnalyseDepartment,
  personalizeLeaderboardForActor,
} from './leaderboard-data';
import type { DepartmentLeaderboardData, LeaderboardItem } from './leaderboard-types';

test('buildThaiLeaderboardAnalysis: explains YUI live snapshot (Daily 0/33, Accu 8.5% -> 14.3 XP) accurately in Thai', () => {
  const breakdown = calculateUnifiedPortfolioBreakdown({
    redRate: 8.5,
    activeCardsCount: 33,
    redCardsCount: 0,
    hasMonthlyCardExposure: true,
    cleanDaysCount: 18,
    graceDaysCount: 2,
    individualLtcXp: 4,
    individualLtcCardsCount: 2,
    teamZeroLtcXp: 1.4,
    hasSalesAccess: true,
    substantiveSalesDeals: 33,
    substantiveInternalTasks: 0,
    progressedCardsCount: 8,
    eligibleProgressCardsCount: 12,
    teammate27hAssistedCardsCount: 2,
    workedActiveCardsCount: 33,
    onTimeDueFulfillmentsCount: 3,
    wonSalesDealsCount: 2,
    salesRevenue: 600_000,
    departmentTotalRevenue: 800_000,
  });

  const yuiItem: LeaderboardItem = {
    rank: 1,
    userId: 'u-yui',
    name: 'YUI',
    score: breakdown.totalXp,
    formattedValue: `${breakdown.totalXp} XP`,
    unit: 'XP',
    breakdown,
    dailyHealthSummary: {
      userId: 'u-yui',
      totalWorkingDays: 24,
      cleanDaysCount: 18,
      graceDaysCount: 2,
      redDaysCount: 4,
      offDaysCount: 3,
      totalRedHours: 504.9,
      avgDailyRedHours: 21,
      avgMonthlyHealthRate: 91.5,
      avgMonthlyRedRate: 8.5,
      totalCardHours: 5940,
      totalRedCardHours: 504.9,
      currentActiveCards: 33,
      currentRedCards: 0,
      dailyRecords: [
        {
          dateKey: '2026-10-31',
          dayIndex: 31,
          dayOfWeek: 6,
          isOffDay: false,
          activeCardsCount: 33,
          cleanCardsCount: 33,
          redCardsCount: 0,
          redHours: 0,
          totalCardHours: 297,
          redCardHoursToday: 0,
          dailyRedRate: 0,
          healthRate: 100,
          redCardDetails: [],
        },
      ],
    },
    dailyLtcSummary: {
      totalWorkingDays: 24,
      cleanLtcDaysCount: 14,
      teamLtcXp: 3.5,
      teamZeroBonusXp: 1.4,
      currentLtcCount: 3,
      dailyRecords: [],
    },
  };

  const analysis = buildThaiLeaderboardAnalysis(yuiItem, {
    month: 10,
    year: 2026,
    currentMonth: 10,
    currentYear: 2026,
    departmentName: 'Export',
  });

  assert.equal(analysis.todaySnapshot.tone, 'excellent');
  assert.ok(analysis.todaySnapshot.statusBadgeTh.includes('0/33'));
  assert.ok(analysis.todaySnapshot.headlineTh.includes('Daily 0/33'));

  const healthCat = analysis.categories.find((c) => c.id === 'card_health')!;
  assert.equal(healthCat.earnedXp, 14.3);
  assert.ok(healthCat.formulaText.includes('22 - 2.2 × (8.5 - 5.0)'));
  assert.ok(healthCat.formulaText.includes('14.3 / 30 XP'));

  const velCat = analysis.categories.find((c) => c.id === 'velocity_teamwork')!;
  assert.ok(velCat.formulaText.includes('การ์ดสะอาดรายวัน 3/3'));
});

test('buildThaiLeaderboardAnalysis: surfaces Heavy-Load Shield and exact red card names when holding >= 15 cards with 1 red card', () => {
  const breakdown = calculateUnifiedPortfolioBreakdown({
    redRate: 2.0,
    activeCardsCount: 18,
    redCardsCount: 1,
    hasMonthlyCardExposure: true,
    cleanDaysCount: 15,
    graceDaysCount: 1,
    hasSalesAccess: true,
    substantiveSalesDeals: 18,
    substantiveInternalTasks: 0,
  });

  const item: LeaderboardItem = {
    rank: 2,
    userId: 'u-mild',
    name: 'Mild',
    score: breakdown.totalXp,
    formattedValue: `${breakdown.totalXp} XP`,
    unit: 'XP',
    breakdown,
    dailyHealthSummary: {
      userId: 'u-mild',
      totalWorkingDays: 16,
      cleanDaysCount: 15,
      graceDaysCount: 1,
      redDaysCount: 0,
      offDaysCount: 2,
      totalRedHours: 9,
      avgDailyRedHours: 0.5,
      avgMonthlyHealthRate: 98,
      avgMonthlyRedRate: 2,
      totalCardHours: 450,
      totalRedCardHours: 9,
      currentActiveCards: 18,
      currentRedCards: 1,
      dailyRecords: [
        {
          dateKey: '2026-10-31',
          dayIndex: 31,
          dayOfWeek: 6,
          isOffDay: false,
          isGraceShieldDay: true,
          activeCardsCount: 18,
          cleanCardsCount: 17,
          redCardsCount: 1,
          redHours: 6,
          totalCardHours: 162,
          redCardHoursToday: 6,
          dailyRedRate: 3.7,
          healthRate: 96.3,
          redCardDetails: [
            {
              dealId: 'd-1',
              topic: 'JNV Shampoo Export',
              companyName: 'JNV Trading',
              overdueWorkingHours: 6,
              redHoursToday: 6,
            },
          ],
        },
      ],
    },
  };

  const analysis = buildThaiLeaderboardAnalysis(item, {
    month: 10,
    year: 2026,
    currentMonth: 10,
    currentYear: 2026,
  });

  assert.equal(analysis.todaySnapshot.tone, 'shield');
  assert.ok(analysis.todaySnapshot.headlineTh.includes('Heavy-Load Shield'));
  assert.equal(analysis.todaySnapshot.redCardsToday.length, 1);
  assert.equal(analysis.todaySnapshot.redCardsToday[0].topic, 'JNV Shampoo Export');
  assert.equal(analysis.quickWins[0].id, 'clear_red_cards');
});

test('buildThaiLeaderboardAnalysis: handles 0-card user (Daily 0/0) cleanly without NaN', () => {
  const breakdown = calculateUnifiedPortfolioBreakdown({
    redRate: 0,
    activeCardsCount: 0,
    cleanDaysCount: 0,
    substantiveSalesDeals: 0,
    substantiveInternalTasks: 0,
  });

  const item: LeaderboardItem = {
    rank: 4,
    userId: 'u-gus',
    name: 'Gus',
    score: 0,
    formattedValue: '0 XP',
    unit: 'XP',
    breakdown,
  };

  const analysis = buildThaiLeaderboardAnalysis(item, {
    month: 10,
    year: 2026,
    currentMonth: 10,
    currentYear: 2026,
  });

  assert.equal(analysis.todaySnapshot.tone, 'neutral');
  assert.ok(analysis.todaySnapshot.headlineTh.includes('Daily 0/0'));
  assert.equal(analysis.categories[0].earnedXp, 0);
});

test('Manager RBAC & privacy: GENERAL can only Analyse self and non-self redCardDetails are sanitized; MANAGEMENT/ADMIN can Analyse everyone', () => {
  assert.equal(canActorAnalyseDepartment('ADMIN'), true);
  assert.equal(canActorAnalyseDepartment('MANAGEMENT'), true);
  assert.equal(canActorAnalyseDepartment('GENERAL'), false);
  assert.equal(canActorAnalyseDepartment(undefined), false);

  const selfItem = { isCurrentUser: true };
  const teammateItem = { isCurrentUser: false };
  assert.equal(canUserInspectAnalyseTarget(selfItem, false), true);
  assert.equal(canUserInspectAnalyseTarget(teammateItem, false), false);
  assert.equal(canUserInspectAnalyseTarget(selfItem, true), true);
  assert.equal(canUserInspectAnalyseTarget(teammateItem, true), true);
  assert.equal(canUserInspectAnalyseTarget(null, true), false);

  const makeRep = (userId: string, name: string, topic: string): LeaderboardItem => ({
    rank: 1,
    userId,
    name,
    score: 40,
    formattedValue: '40 XP',
    unit: 'XP',
    dailyHealthSummary: {
      userId,
      totalWorkingDays: 10,
      cleanDaysCount: 8,
      graceDaysCount: 0,
      redDaysCount: 2,
      offDaysCount: 0,
      totalRedHours: 9,
      avgDailyRedHours: 0.9,
      avgMonthlyHealthRate: 90,
      avgMonthlyRedRate: 10,
      totalCardHours: 90,
      totalRedCardHours: 9,
      currentActiveCards: 10,
      currentRedCards: 1,
      dailyRecords: [
        {
          dateKey: '2026-10-31',
          dayIndex: 31,
          dayOfWeek: 6,
          isOffDay: false,
          activeCardsCount: 10,
          cleanCardsCount: 9,
          redCardsCount: 1,
          redHours: 9,
          totalCardHours: 90,
          redCardHoursToday: 9,
          dailyRedRate: 10,
          healthRate: 90,
          redCardDetails: [
            {
              dealId: `deal-${userId}`,
              topic,
              companyName: 'Secret Co',
              overdueWorkingHours: 9,
              redHoursToday: 9,
            },
          ],
        },
      ],
    },
    categoryDetails: {
      ltcCaredCards: [
        {
          dealId: `ltc-${userId}`,
          topic: `LTC-311026 ${topic}`,
          companyName: 'Secret Co',
          badgeText: '+2 XP (Progress)',
          tone: 'lime',
        },
      ],
      progressedCards: [
        {
          dealId: `prog-${userId}`,
          topic,
          companyName: 'Secret Co',
          badgeText: '+1 XP (Progress)',
          tone: 'lime',
        },
      ],
      assistedCards: [],
      outcomeCards: [],
    },
  });

  const baseData: DepartmentLeaderboardData = {
    departmentId: 'dept-export',
    departmentName: 'Export',
    hasSalesAccess: true,
    availableDepartments: [],
    period: { month: 10, year: 2026 },
    overallPodium: {
      metricId: 'xp',
      metricLabel: 'Overall MVP',
      rank1: makeRep('u-yui', 'YUI', 'YUI Secret Deal'),
      rank2: makeRep('u-boy', 'BOY', 'BOY Secret Deal'),
      rank3: null,
    },
    overallXpItems: [
      makeRep('u-yui', 'YUI', 'YUI Secret Deal'),
      makeRep('u-boy', 'BOY', 'BOY Secret Deal'),
    ],
    categories: [
      {
        id: 'card_health',
        label: 'Health',
        iconName: 'ShieldCheck',
        unit: 'Max 30 XP',
        description: 'Card Health',
        items: [
          makeRep('u-yui', 'YUI', 'YUI Secret Deal'),
          makeRep('u-boy', 'BOY', 'BOY Secret Deal'),
        ],
      },
    ],
  };

  // GENERAL user (`u-yui`) sees own redCardDetails, but teammate (`u-boy`) redCardDetails are stripped
  const forGeneral = personalizeLeaderboardForActor(baseData, 'u-yui', [], 'GENERAL');
  assert.equal(forGeneral.canAnalyseDepartment, false);
  const genSelf = forGeneral.overallXpItems.find((i) => i.userId === 'u-yui')!;
  const genPeer = forGeneral.overallXpItems.find((i) => i.userId === 'u-boy')!;
  assert.equal(genSelf.isCurrentUser, true);
  assert.equal(genSelf.dailyHealthSummary!.dailyRecords[0].redCardDetails.length, 1);
  assert.equal(genSelf.categoryDetails?.progressedCards.length, 1);
  assert.equal(genPeer.isCurrentUser, false);
  assert.equal(genPeer.dailyHealthSummary!.dailyRecords[0].redCardDetails.length, 0);
  assert.equal(genPeer.categoryDetails, undefined);

  // MANAGEMENT user (`u-mgr`) gets canAnalyseDepartment === true and sees ALL redCardDetails & categoryDetails
  const forManager = personalizeLeaderboardForActor(baseData, 'u-mgr', [], 'MANAGEMENT');
  assert.equal(forManager.canAnalyseDepartment, true);
  assert.equal(
    forManager.overallXpItems[0].dailyHealthSummary!.dailyRecords[0].redCardDetails[0].topic,
    'YUI Secret Deal'
  );
  assert.equal(
    forManager.overallXpItems[1].dailyHealthSummary!.dailyRecords[0].redCardDetails[0].topic,
    'BOY Secret Deal'
  );
  assert.equal(forManager.overallXpItems[1].categoryDetails?.progressedCards[0].topic, 'BOY Secret Deal');
});

test('buildThaiDepartmentAnalysis: aggregates team board health, LTC alerts, and 4-pillar member matrix for Managers', () => {
  const yuiBreakdown = calculateUnifiedPortfolioBreakdown({
    redRate: 8.5,
    activeCardsCount: 33,
    redCardsCount: 0,
    hasMonthlyCardExposure: true,
    cleanDaysCount: 18,
    hasSalesAccess: true,
    substantiveSalesDeals: 33,
    substantiveInternalTasks: 0,
    progressedCardsCount: 10,
    eligibleProgressCardsCount: 12,
    workedActiveCardsCount: 33,
    wonSalesDealsCount: 2,
    salesRevenue: 500_000,
    departmentTotalRevenue: 500_000,
  });

  const boyBreakdown = calculateUnifiedPortfolioBreakdown({
    redRate: 86.6,
    activeCardsCount: 11,
    redCardsCount: 9,
    hasMonthlyCardExposure: true,
    cleanDaysCount: 2,
    hasSalesAccess: true,
    substantiveSalesDeals: 11,
    substantiveInternalTasks: 0,
    workedActiveCardsCount: 11,
    departmentTotalRevenue: 500_000,
  });

  const gusBreakdown = calculateUnifiedPortfolioBreakdown({
    redRate: 0,
    activeCardsCount: 0,
    cleanDaysCount: 0,
    hasSalesAccess: true,
    substantiveSalesDeals: 0,
    substantiveInternalTasks: 0,
    teamZeroLtcXp: 1.2,
  });

  const items: LeaderboardItem[] = [
    {
      rank: 1,
      userId: 'u-yui',
      name: 'YUI',
      score: yuiBreakdown.totalXp,
      formattedValue: `${yuiBreakdown.totalXp} XP`,
      unit: 'XP',
      breakdown: yuiBreakdown,
      dailyHealthSummary: {
        userId: 'u-yui',
        totalWorkingDays: 20,
        cleanDaysCount: 18,
        graceDaysCount: 0,
        redDaysCount: 2,
        offDaysCount: 0,
        totalRedHours: 50,
        avgDailyRedHours: 2.5,
        avgMonthlyHealthRate: 91.5,
        avgMonthlyRedRate: 8.5,
        totalCardHours: 590,
        totalRedCardHours: 50,
        currentActiveCards: 33,
        currentRedCards: 0,
        dailyRecords: [
          {
            dateKey: '2026-10-31',
            dayIndex: 31,
            dayOfWeek: 6,
            isOffDay: false,
            activeCardsCount: 33,
            cleanCardsCount: 33,
            redCardsCount: 0,
            redHours: 0,
            totalCardHours: 297,
            redCardHoursToday: 0,
            dailyRedRate: 0,
            healthRate: 100,
            redCardDetails: [],
          },
        ],
      },
      dailyLtcSummary: {
        totalWorkingDays: 20,
        cleanLtcDaysCount: 12,
        teamLtcXp: 3.0,
        teamZeroBonusXp: 1.2,
        currentLtcCount: 4,
        dailyRecords: [],
      },
    },
    {
      rank: 2,
      userId: 'u-boy',
      name: 'BOY',
      score: boyBreakdown.totalXp,
      formattedValue: `${boyBreakdown.totalXp} XP`,
      unit: 'XP',
      breakdown: boyBreakdown,
      dailyHealthSummary: {
        userId: 'u-boy',
        totalWorkingDays: 20,
        cleanDaysCount: 2,
        graceDaysCount: 0,
        redDaysCount: 18,
        offDaysCount: 0,
        totalRedHours: 800,
        avgDailyRedHours: 40,
        avgMonthlyHealthRate: 13.4,
        avgMonthlyRedRate: 86.6,
        totalCardHours: 924,
        totalRedCardHours: 800,
        currentActiveCards: 11,
        currentRedCards: 9,
        dailyRecords: [
          {
            dateKey: '2026-10-31',
            dayIndex: 31,
            dayOfWeek: 6,
            isOffDay: false,
            activeCardsCount: 11,
            cleanCardsCount: 2,
            redCardsCount: 9,
            redHours: 81,
            totalCardHours: 99,
            redCardHoursToday: 81,
            dailyRedRate: 81.8,
            healthRate: 18.2,
            redCardDetails: [
              {
                dealId: 'd-boy-1',
                topic: 'Urgent Vietnam Deal',
                companyName: 'VN Corp',
                overdueWorkingHours: 24,
                redHoursToday: 9,
              },
            ],
          },
        ],
      },
    },
    {
      rank: 3,
      userId: 'u-gus',
      name: 'Gus',
      score: 0,
      formattedValue: '0 XP',
      unit: 'XP',
      breakdown: gusBreakdown,
    },
  ];

  const team = buildThaiDepartmentAnalysis(items, {
    month: 10,
    year: 2026,
    currentMonth: 10,
    currentYear: 2026,
    departmentName: 'Export',
    hasSalesAccess: true,
  });

  assert.equal(team.memberCount, 3);
  assert.equal(team.totalActiveCardsToday, 44);
  assert.equal(team.totalRedCardsToday, 9);
  assert.equal(team.pendingLtcCount, 4);
  assert.equal(team.totalWonSalesDeals, 2);
  assert.equal(team.totalDepartmentRevenue, 500_000);
  assert.equal(team.boardTone, 'danger');

  // Manager alerts: BOY red cards first, then pending LTC, then idle Gus
  assert.equal(team.managerAlerts.length, 3);
  assert.equal(team.managerAlerts[0].userId, 'u-boy');
  assert.ok(team.managerAlerts[0].detailTh.includes('Urgent Vietnam Deal'));
  assert.equal(team.managerAlerts[1].id, 'team-ltc-pending');
  assert.equal(team.managerAlerts[2].id, 'idle-members');
  assert.ok(team.managerAlerts[2].titleTh.includes('Gus'));
});
