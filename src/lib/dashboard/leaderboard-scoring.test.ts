import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateSalesXp,
  calculateSalesXpBreakdown,
  calculateNonSalesXp,
  calculatePortfolioWeights,
  calculateUnifiedPortfolioBreakdown,
  rankItems,
  buildPodium,
  getCardHealthScoreFromRedRate,
} from './leaderboard-scoring';

test('getCardHealthScoreFromRedRate evaluates continuous piecewise linear curve (Max 30 XP, zero cliffs)', () => {
  // 0 cards = 0 XP
  assert.equal(getCardHealthScoreFromRedRate(0, 0).points, 0);

  // 0% red rate = 30 XP
  assert.equal(getCardHealthScoreFromRedRate(0, 5).points, 30);
  assert.equal(getCardHealthScoreFromRedRate(0, 5).status, 'Perfect');

  // 2.5% red rate = 30 - 1.6*(2.5) = 26 XP
  assert.equal(getCardHealthScoreFromRedRate(2.5, 10).points, 26);

  // Smooth continuity around 5% target threshold (no harsh cliff!)
  assert.equal(getCardHealthScoreFromRedRate(4.9, 10).points, 22.2);
  assert.equal(getCardHealthScoreFromRedRate(5.0, 15).points, 22);
  assert.equal(getCardHealthScoreFromRedRate(5.0, 15).status, 'Target Met');
  assert.equal(getCardHealthScoreFromRedRate(5.1, 10).points, 21.8);

  // 10% red rate = 22 - 2.2*(10 - 5) = 11.0 XP
  assert.equal(getCardHealthScoreFromRedRate(10.0, 10).points, 11);
  assert.equal(getCardHealthScoreFromRedRate(10.0, 10).status, 'Danger');

  // >= 15% = 0 XP (Critical cutoff)
  assert.equal(getCardHealthScoreFromRedRate(15.0, 10).points, 0);
  assert.equal(getCardHealthScoreFromRedRate(35.5, 10).points, 0);
});

test('calculatePortfolioWeights determines weight strictly from own cards when owner holds cards, and never dilutes Sales Weight via teammate assists', () => {
  // Pure Sales Closer who ALSO helped 11 teammates: MUST stay 100% Sales / 0% Task (zero dilution!)
  const yuiWeights = calculatePortfolioWeights({
    substantiveSalesDeals: 10,
    substantiveInternalTasks: 0,
    assistedCollaboratorDeals: 11,
  });
  assert.equal(yuiWeights.salesWeightPct, 100);
  assert.equal(yuiWeights.taskWeightPct, 0);

  // Pure Admin: 0 SALES_DEAL, 12 INTERNAL_TASK -> 0% Sales / 100% Task
  const pureAdmin = calculatePortfolioWeights({
    substantiveSalesDeals: 0,
    substantiveInternalTasks: 12,
  });
  assert.equal(pureAdmin.salesWeightPct, 0);
  assert.equal(pureAdmin.taskWeightPct, 100);

  // Hybrid 50/50: 2 SALES_DEAL (3.0 units) + 3 INTERNAL_TASK (3.0 units) -> 50% Sales / 50% Task
  const hybrid = calculatePortfolioWeights({
    substantiveSalesDeals: 2,
    substantiveInternalTasks: 3,
    assistedCollaboratorDeals: 5,
  });
  assert.equal(hybrid.salesWeightPct, 50);
  assert.equal(hybrid.taskWeightPct, 50);

  // Pure Active Collaborator: 0 owned cards, 4 genuinely assisted teammate cards -> 0% Sales / 100% Task
  const pureHelper = calculatePortfolioWeights({
    substantiveSalesDeals: 0,
    substantiveInternalTasks: 0,
    assistedCollaboratorDeals: 4,
  });
  assert.equal(pureHelper.salesWeightPct, 0);
  assert.equal(pureHelper.taskWeightPct, 100);
});

test('calculateUnifiedPortfolioBreakdown scores Consistent Full-Month Pure Admin & Project Owner up to 100 XP', () => {
  const boyBreakdown = calculateUnifiedPortfolioBreakdown({
    redRate: 0,
    activeCardsCount: 15,
    cleanDaysCount: 20, // Pure Internal Task owner scales Clean Discipline up to 20/20 XP!
    hasSalesAccess: true,
    substantiveSalesDeals: 0,
    substantiveInternalTasks: 15,
    elapsedWorkingDays: 20,
    progressWorkdaysCount: 15, // 15/20 = 75% of workdays -> 7/7 Daily Progress Rhythm XP
    progressedCardsCount: 12, // 12/15 = 80% >= 75% -> 5/5 Coverage -> 12/12 Progress XP
    eligibleProgressCardsCount: 15,
    teammate27hAssistedCardsCount: 4,
    teammateAssistWorkdaysCount: 6, // 6/20 = 30% of workdays -> 6/6 Consistent Teamwork XP
    avgDailyCleanCards: 15, // 15 * 0.2 = 3/3 Daily Clean Load XP
    onTimeDueFulfillmentsCount: 4,
    completedTodosCount: 4,
    executionWorkdaysCount: 6, // 8 on-time actions across 6 workdays, 0 missed -> 4/4 Execution XP -> 25/25 Velocity!
    completedInternalTasksCount: 1,
    onTimeCompletedInternalTasksCount: 1,
    overdueOpenInternalTasksCount: 0,
    healthyActiveProjectTasksCount: 3, // (1+3)/(1+0+3) = 15/15 On-Time SLA!
    openTaskMilestoneCreditsCount: 8, // 1*2.5 + 8*1.0 = 10/10 Deliverables -> 25/25 Outcome!
  });

  assert.equal(boyBreakdown.salesWeightPct, 0);
  assert.equal(boyBreakdown.taskWeightPct, 100);
  assert.equal(boyBreakdown.cardHealthTotalXp, 30);
  assert.equal(boyBreakdown.disciplineTotalXp, 20);
  assert.equal(boyBreakdown.velocityProgressXp, 12);
  assert.equal(boyBreakdown.velocityTeamworkXp, 6);
  assert.equal(boyBreakdown.velocityWorkloadXp, 3);
  assert.equal(boyBreakdown.velocityExecutionXp, 4);
  assert.equal(boyBreakdown.velocityXp, 25);
  assert.equal(boyBreakdown.outcomeXp, 25);
  assert.equal(boyBreakdown.totalXp, 100);
});

test('calculateUnifiedPortfolioBreakdown rewards Heavy-Load Consistent Sales Closer (YUI) over Light-Load Rep (Mild) without diluting YUI Outcome', () => {
  const yui = calculateUnifiedPortfolioBreakdown({
    redRate: 2.0, // 30 - 1.6*2 = 26.8 XP
    activeCardsCount: 20,
    cleanDaysCount: 18,
    graceDaysCount: 2, // 18*0.5 + 2*0.25 = 9.5 XP Clean!
    individualLtcXp: 8, // 4 LTC cards * 2 XP = 8 XP
    teamZeroLtcXp: 1.5, // Discipline = 19.0 XP
    hasSalesAccess: true,
    substantiveSalesDeals: 20,
    substantiveInternalTasks: 0,
    assistedCollaboratorDeals: 6, // Helping 6 teammates MUST NOT dilute Sales Weight!
    elapsedWorkingDays: 20,
    progressWorkdaysCount: 15, // 7.0/7 Rhythm
    progressedCardsCount: 12, // 12/16 = 75% -> 5.0/5 Coverage = 12.0 XP
    eligibleProgressCardsCount: 16,
    teammate27hAssistedCardsCount: 4,
    teammateAssistWorkdaysCount: 5, // 5 / 6 * 6 = 5.0 XP Teamwork
    avgDailyCleanCards: 19, // 3.0 XP Clean Load
    onTimeDueFulfillmentsCount: 5,
    completedTodosCount: 2,
    executionWorkdaysCount: 5, // 7 / 7 -> 4.0 XP Execution -> Velocity = 24.0 XP
    wonSalesDealsCount: 2, // 10 XP
    salesRevenue: 800_000, // 800k/950k*10 = 8.42 -> 18.4 XP Outcome (undiluted!)
    departmentTotalRevenue: 950_000,
  });

  const mild = calculateUnifiedPortfolioBreakdown({
    redRate: 0, // 30.0 XP
    activeCardsCount: 4,
    cleanDaysCount: 20, // 10.0 XP Clean
    individualLtcXp: 1, // +1 XP Step 1
    teamZeroLtcXp: 1.5, // Discipline = 12.5 XP
    hasSalesAccess: true,
    substantiveSalesDeals: 4,
    substantiveInternalTasks: 0,
    elapsedWorkingDays: 20,
    progressWorkdaysCount: 4, // 4/15 * 7 = 1.9 XP Rhythm
    progressedCardsCount: 4, // 4/4 = 100% -> 5.0 XP Coverage = 6.9 XP Progress
    eligibleProgressCardsCount: 4,
    teammate27hAssistedCardsCount: 0, // 0 XP Teamwork
    avgDailyCleanCards: 4, // 4 * 0.2 = 0.8 XP Clean Load
    onTimeDueFulfillmentsCount: 2,
    executionWorkdaysCount: 2, // 2/7 * 4 = 1.1 XP Execution -> Velocity = 8.8 XP
    wonSalesDealsCount: 1, // 5 XP
    salesRevenue: 150_000, // 150k/950k*10 = 1.58 -> 6.6 XP Outcome
    departmentTotalRevenue: 950_000,
  });

  assert.equal(yui.salesWeightPct, 100, 'YUI Sales Weight must remain 100% despite helping teammates');
  assert.equal(yui.cardHealthTotalXp, 26.8);
  assert.equal(yui.disciplineTotalXp, 19);
  assert.equal(yui.velocityXp, 24);
  assert.equal(yui.outcomeXp, 18.4);
  assert.equal(yui.totalXp, 88.2);

  assert.equal(mild.cardHealthTotalXp, 30);
  assert.equal(mild.disciplineTotalXp, 12.5);
  assert.equal(mild.velocityXp, 8.8);
  assert.equal(mild.outcomeXp, 6.6);
  assert.equal(mild.totalXp, 57.9);
  assert.ok(yui.totalXp > mild.totalXp + 25, 'Heavy-load dedicated closer must clearly outscore light-load passive rep');
});

test('Active Contributor Rule eliminates passive teamMembers free-ride (Light/Gus/BOY bug) and caps Pure Helper Outcome fairly at 10 XP', () => {
  // 1. Passive observer (`Light` / `Gus`): 0 owned cards, 0 active +27h assists -> 0 XP across Outcome & Velocity!
  const passiveObserver = calculateUnifiedPortfolioBreakdown({
    redRate: 0,
    activeCardsCount: 0,
    cleanDaysCount: 0,
    hasSalesAccess: true,
    substantiveSalesDeals: 0,
    substantiveInternalTasks: 0,
    assistedCollaboratorDeals: 0,
    collaboratorWonDealsCount: 0,
  });
  assert.equal(passiveObserver.outcomeXp, 0, 'Passive observer with 0 owned cards and 0 active assists must get 0 Outcome XP');
  assert.equal(passiveObserver.velocityXp, 0);
  assert.equal(passiveObserver.totalXp, 0);

  // 2. Active Pure Helper: 0 owned cards, actively helped (+27h) on 6 cards across 6 workdays, 3 of which closed WON
  // -> Earns 3 * 2.0 = 6.0 XP Outcome (NO free 15-pt SLA loophole!)
  const activeHelper = calculateUnifiedPortfolioBreakdown({
    redRate: 0,
    activeCardsCount: 0,
    hasMonthlyCardExposure: false,
    collaboratorAssisted27hCardsCount: 6, // >= 3 assisted cards -> 30 * 0.85 = 25.5 XP Card Health
    collaboratorAssistedRedRate: 0,
    cleanDaysCount: 0,
    individualLtcXp: 4,
    teamZeroLtcXp: 2, // 6 XP Discipline
    hasSalesAccess: true,
    substantiveSalesDeals: 0,
    substantiveInternalTasks: 0,
    assistedCollaboratorDeals: 6,
    elapsedWorkingDays: 20,
    progressWorkdaysCount: 6,
    progressedCardsCount: 5,
    eligibleProgressCardsCount: 6,
    teammate27hAssistedCardsCount: 6,
    teammateAssistWorkdaysCount: 6,
    avgDailyCleanCards: 3,
    completedTodosCount: 7,
    executionWorkdaysCount: 4,
    collaboratorWonDealsCount: 3, // 3 * 2.0 = 6.0 XP (NOT 21 XP!)
  });

  assert.equal(activeHelper.isCollaboratorCardHealth, true);
  assert.equal(activeHelper.cardHealthTotalXp, 25.5);
  assert.equal(activeHelper.outcomeXp, 6, 'Pure helper earns +2 XP per co-closed card without free 15-pt SLA');
});

test('Full-Month Rolling Consistency prevents 5-day early-month slackers from keeping max Velocity & penalizes missed Due Dates', () => {
  // Rep A ("5-Day Slacker"): Worked 5 days in Week 1, dumped 6 assists & 6 todos on 1 day, let 10 of 15 cards sit red for the remaining 19 days, and stalled 3 Due Dates
  const fiveDaySlackerAtMonthEnd = calculateUnifiedPortfolioBreakdown({
    redRate: 18,
    activeCardsCount: 15,
    redCardsCount: 10,
    cleanDaysCount: 5,
    hasSalesAccess: true,
    substantiveSalesDeals: 15,
    substantiveInternalTasks: 0,
    elapsedWorkingDays: 24,
    progressWorkdaysCount: 5, // Only 5/24 days -> target is 18 days -> (5/18)*7 = 1.9 XP!
    progressedCardsCount: 5, // 5/15 = 33.3% coverage -> (0.333/0.75)*5 = 2.2 XP
    eligibleProgressCardsCount: 15,
    teammate27hAssistedCardsCount: 6,
    teammateAssistWorkdaysCount: 1, // Dumped 6 cards in 1 single day -> (1 / 7.2) * 6 = 0.8 XP!
    avgDailyCleanCards: 7.1, // Let cards turn red for 19 days -> 7.1 * 0.2 = 1.4 XP (not 3.0 XP!)
    completedTodosCount: 6,
    executionWorkdaysCount: 1, // Dumped 6 todos on 1 day -> capped at 2 effective actions!
    missedOrStalledDueCount: 3, // Missed/postponed 3 Due Dates -> reliability drops!
  });

  assert.equal(fiveDaySlackerAtMonthEnd.velocityVolumeXp, 1.9, '5-day slacker decays to 1.9/7 Daily Rhythm XP by day 24');
  assert.equal(fiveDaySlackerAtMonthEnd.velocityTeamworkXp, 0.8, '1-day assist dump only earns 0.8/6 Teamwork XP at month-end');
  assert.equal(fiveDaySlackerAtMonthEnd.velocityWorkloadXp, 1.4, 'Neglected red cards lower avgDailyCleanCards XP');
  assert.ok((fiveDaySlackerAtMonthEnd.velocityExecutionXp ?? 0) < 1.0, '1-day dump + missed Due Dates keeps Execution XP below 1.0/4');
  assert.ok((fiveDaySlackerAtMonthEnd.velocityXp ?? 0) < 7.0, '5-day slacker cannot hold high Velocity at month-end');
});

test('calculateSalesXp & calculateSalesXpBreakdown enforce 100 Max XP cap and preserve exposure on closed cards', () => {
  // 0 cards held, 0 clean days, 0 won deals, 0 quotes = 0 XP
  const xpZero = calculateSalesXp(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  assert.equal(xpZero, 0);

  // Maximum Cap Check: 30 XP (health) + 20 XP (clean + ltc) + 25 XP (velocity) + 25 XP (outcome) = 100 XP
  const xpMax = calculateSalesXp(10, 1_000_000, 100, 50, 0, 15, 0, 0, 25, 5, 15, 15);
  assert.equal(xpMax, 100);

  // Regression: Rep who closed all active cards (activeCardsCount = 0) after clean monthly card exposure keeps 30 XP Card Health
  const closedAllBreakdown = calculateSalesXpBreakdown(
    3,
    1_000_000,
    100,
    12,
    0,
    0, // 0 currently open cards
    0,
    0, // 0% red rate
    20, // 20 clean days -> 10 XP
    5, // 5 legacy LTC -> 10 XP LTC -> 20 XP Discipline
    10,
    5,
    true // had monthly card-hours exposure!
  );
  assert.equal(closedAllBreakdown.activeCards, 0);
  assert.equal(closedAllBreakdown.cardHealthTotalXp, 30);
  assert.equal(closedAllBreakdown.healthTier, 'Perfect');
  assert.equal(closedAllBreakdown.totalXp, 100);
});

test('calculateNonSalesXp legacy helper aggregates tasks, activity logs, assists, and events', () => {
  const xp = calculateNonSalesXp(5, 10, 2, 1);
  assert.equal(xp, 190);
});

test('rankItems correctly sorts descending by score and assigns ranks 1, 2, 3', () => {
  const raw = [
    { userId: 'u1', name: 'Alice', score: 50, formattedValue: '50', unit: 'pts' },
    { userId: 'u2', name: 'Bob', score: 120, formattedValue: '120', unit: 'pts' },
    { userId: 'u3', name: 'Charlie', score: 80, formattedValue: '80', unit: 'pts' },
  ];

  const ranked = rankItems(raw);
  assert.equal(ranked[0].userId, 'u2');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].userId, 'u3');
  assert.equal(ranked[1].rank, 2);
  assert.equal(ranked[2].userId, 'u1');
  assert.equal(ranked[2].rank, 3);
});

test('buildPodium returns top 3 or null if fewer users', () => {
  const ranked = [
    { userId: 'u1', name: 'Alice', score: 100, formattedValue: '100', unit: 'pts', rank: 1 },
    { userId: 'u2', name: 'Bob', score: 50, formattedValue: '50', unit: 'pts', rank: 2 },
  ];

  const podium = buildPodium(ranked, 'xp', 'Overall MVP');
  assert.equal(podium.rank1?.name, 'Alice');
  assert.equal(podium.rank2?.name, 'Bob');
  assert.equal(podium.rank3, null);
});
