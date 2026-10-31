import type {
  CardHealthTier,
  LeaderboardItem,
  LeaderboardPodium,
  LeaderboardScoreBreakdown,
} from './leaderboard-types';

export function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

export function getCardHealthTier(activeCount: number, healthRate: number): CardHealthTier {
  if (activeCount === 0) return 'No Cards';
  if (healthRate === 100) return 'Perfect';
  if (healthRate >= 95) return 'Great';
  if (healthRate >= 90) return 'Good';
  if (healthRate >= 85) return 'Fair';
  return 'At Risk';
}

export type CardHealthStatus =
  | 'Perfect'
  | 'Great'
  | 'Good'
  | 'Target Met'
  | 'Warning'
  | 'Danger'
  | 'Critical'
  | 'No Cards';

export interface RedRateStep {
  maxRate: number;
  points: number;
  label: string;
  badge: string;
  status: CardHealthStatus;
}

/**
 * Reference checkpoints along the Continuous Piecewise Linear Card Health Curve (Max 30 XP):
 * - 0% <= r <= 5%:  30 - 1.6*r       (30.0 XP -> 22.0 XP)
 * - 5% <  r <  15%: 22 - 2.2*(r-5)   (22.0 XP -> 0 XP)
 * - r >= 15%:       0 XP
 */
export const RED_RATE_LADDER: RedRateStep[] = [
  { maxRate: 0.01, points: 30, label: '0%', badge: '0% Red', status: 'Perfect' },
  { maxRate: 2.5, points: 26, label: '2.5%', badge: '2.5% Red', status: 'Great' },
  { maxRate: 5.01, points: 22, label: '5.0%', badge: '≤ 5% Red', status: 'Target Met' },
  { maxRate: 10, points: 11, label: '10%', badge: '< 10% Red', status: 'Warning' },
  { maxRate: 15, points: 0, label: '≥ 15%', badge: '≥ 15% Red', status: 'Critical' },
];

/**
 * Continuous Piecewise Linear Card Health Curve (Max 30 XP).
 * Eliminates harsh step cliffs around the 5% target threshold.
 */
export function getCardHealthScoreFromRedRate(
  redRate: number,
  activeCardsCount: number
): { points: number; label: string; badge: string; status: CardHealthStatus } {
  if (activeCardsCount <= 0) {
    return { points: 0, label: 'No Cards', badge: 'No Cards', status: 'No Cards' };
  }

  const r = Math.max(0, redRate);

  if (r === 0) {
    return { points: 30, label: '0%', badge: '0% Red', status: 'Perfect' };
  }

  if (r <= 5) {
    const points = round1(30 - 1.6 * r);
    const status: CardHealthStatus = r < 2 ? 'Great' : 'Target Met';
    return {
      points,
      label: '≤ 5%',
      badge: `${round1(r)}% Red`,
      status,
    };
  }

  if (r < 15) {
    const points = round1(Math.max(0, 22 - 2.2 * (r - 5)));
    const status: CardHealthStatus = r < 10 ? 'Warning' : 'Danger';
    return {
      points,
      label: '< 15%',
      badge: `${round1(r)}% Red`,
      status,
    };
  }

  return { points: 0, label: '≥ 15%', badge: '≥ 15% Red', status: 'Critical' };
}

export interface PortfolioWeightInputs {
  substantiveSalesDeals: number;
  substantiveInternalTasks: number;
  assistedCollaboratorDeals?: number;
  hasSalesAccess?: boolean;
}

export interface PortfolioWeights {
  salesUnits: number;
  taskUnits: number;
  wSales: number;
  wTask: number;
  salesWeightPct: number;
  taskWeightPct: number;
}

/**
 * Dynamic Card-Portfolio Weighting (`SALES_DEAL = 1.5`, `INTERNAL_TASK = 1.0`).
 * - When a user owns substantive cards (`salesCount + taskCount > 0`), portfolio weights are determined
 *   strictly by their OWN cards so helping teammates never dilutes a closer's Sales Weight!
 * - Only when `salesCount + taskCount === 0` and `collabCount > 0` (Pure Active Collaborator who posted
 *   verified `+27h` updates or `>= 2` To-Dos on teammate cards) does `wTask = 1` apply.
 * - Passive `opp.teamMembers` membership without verified contributions earns 0 units and 0 XP.
 */
export function calculatePortfolioWeights(input: PortfolioWeightInputs): PortfolioWeights {
  const salesCount = Math.max(0, input.substantiveSalesDeals);
  const taskCount = Math.max(0, input.substantiveInternalTasks);
  const collabCount = Math.max(0, input.assistedCollaboratorDeals ?? 0);

  let salesUnits = 0;
  let taskUnits = 0;
  let wSales: number;

  if (salesCount + taskCount > 0) {
    salesUnits = 1.5 * salesCount;
    taskUnits = 1.0 * taskCount;
    wSales = salesUnits / (salesUnits + taskUnits);
  } else if (collabCount > 0) {
    salesUnits = 0;
    taskUnits = 0.5 * collabCount;
    wSales = 0;
  } else {
    wSales = input.hasSalesAccess === false ? 0 : 1;
  }

  const wTask = 1 - wSales;

  return {
    salesUnits: round1(salesUnits),
    taskUnits: round1(taskUnits),
    wSales,
    wTask,
    salesWeightPct: Math.round(wSales * 100),
    taskWeightPct: 100 - Math.round(wSales * 100),
  };
}

export interface UnifiedPortfolioScoringInput {
  // Pillar 1: Card Health (Max 30 XP)
  redRate: number;
  activeCardsCount: number;
  redCardsCount?: number;
  redHours?: number;
  hasMonthlyCardExposure?: boolean;
  /** Pure Collaborator fallback when user owns 0 cards but assisted >= 3 cards with verified +27h updates */
  collaboratorAssisted27hCardsCount?: number;
  collaboratorAssistedRedRate?: number;

  // Pillar 2: Discipline & LTC Care (Max 20 XP = 10 Clean Workdays + 10 LTC Active Care)
  cleanDaysCount: number;
  /** Heavy-Load Shield days: activeCards >= 15 && redCards === 1 (+0.25 XP half-credit) */
  graceDaysCount?: number;
  /** Individual 2-Step LTC Care XP (up to +2 XP per LTC-* card, Max 8 XP) */
  individualLtcXp?: number;
  individualLtcCardsCount?: number;
  /** Team Zero-LTC Bonus (+0.1 XP/day when 0 LTC at 17:00, Max 2 XP) */
  teamZeroLtcXp?: number;
  /** Legacy 0..5 team LTC score (mapped proportionally if `teamZeroLtcXp` & `individualLtcXp` are omitted) */
  teamLtcXp?: number;
  hasSalesAccess?: boolean;

  // Portfolio Composition (Dynamic Weighting)
  substantiveSalesDeals: number;
  substantiveInternalTasks: number;
  assistedCollaboratorDeals?: number;

  // Pillar 3: Full-Month Rolling Consistency Velocity & Teamwork (Max 25 XP = 12 Progress + 6 Teamwork + 7 Clean Load & Execution)
  /** Elapsed working days in the month so far for this user (excludes Sundays, Company Holidays, Personal Leaves) */
  elapsedWorkingDays?: number;
  /** Distinct Bangkok workdays where user moved an owned card (`Progress ★`, quote, or closed WON/Completed = 1.0 day) */
  progressWorkdaysCount?: number;
  /** Distinct Bangkok workdays where user did verified `+27h` outreach or completed a To-Do on an owned card (without `Progress ★` = 0.5 day) */
  outreachWorkdaysCount?: number;
  progressedCardsCount?: number;
  multiStepProgressCardsCount?: number;
  eligibleProgressCardsCount?: number;
  teammate27hAssistedCardsCount?: number;
  /** Distinct Bangkok workdays where user posted verified `+27h` or completed 2+ To-Dos on teammate cards */
  teammateAssistWorkdaysCount?: number;
  /** Average clean (non-red) active cards maintained per workday across elapsed working days */
  avgDailyCleanCards?: number;
  workedActiveCardsCount?: number;
  verifiedProgressCardDaysCount?: number;
  onTimeDueFulfillmentsCount?: number;
  /** Distinct Bangkok workdays where user met a Due Date on time, completed a To-Do, or acknowledged an urgent request */
  executionWorkdaysCount?: number;
  /** Count of missed Due Dates (fulfilled after 17:00, currently expired red Due Date, or `Postponed x2+` stalling) */
  missedOrStalledDueCount?: number;
  readyOwnedCardsCount?: number;
  progress27hUpdatesCount?: number;
  fastAcceleratorRepliesCount?: number;
  completedTodosCount?: number;
  collaboratorActiveDealsCount?: number;
  /** Legacy optional inputs retained for backwards compatibility */
  quotationsOrQuotedDealsCount?: number;
  salesStageAdvancesCount?: number;
  taskStageAdvancesCount?: number;

  // Pillar 4: Outcome Signals (Max 25 XP)
  wonSalesDealsCount?: number;
  salesRevenue?: number;
  departmentTotalRevenue?: number;
  monthlySalesTarget?: number;
  completedInternalTasksCount?: number;
  onTimeCompletedInternalTasksCount?: number;
  overdueOpenInternalTasksCount?: number;
  /** Healthy non-red open INTERNAL_TASK projects that achieved PROGRESS_27H or To-Do milestones in month */
  healthyActiveProjectTasksCount?: number;
  /** Milestone credits earned on healthy open INTERNAL_TASK cards (capped at 3 per card) */
  openTaskMilestoneCreditsCount?: number;
  /** Teammate cards where this user actively contributed (`+27h` or `>=2` To-Dos) AND the card closed WON/Completed */
  collaboratorWonDealsCount?: number;

  // Legacy / Informational counts
  totalActivitiesCount?: number;
}

/**
 * Unified v2.3 100 Max XP Portfolio Calculator (Active Contributor + Full-Month Rolling Consistency):
 * 1. Card Health (Max 30 XP) - Continuous linear curve across owned cards (or 85%-capped Collaborator Health)
 * 2. Discipline & LTC Care (Max 20 XP) - Clean Workdays + Heavy-Load Shield (10 XP) + Individual/Team LTC Care (10 XP)
 * 3. Velocity & Teamwork (Max 25 XP) - Daily Progress Rhythm & Coverage (7+5=12) + Consistent Assist Days (6) + Daily Clean Load & On-Time Execution Rate (3+4=7)
 * 4. Outcome (Max 25 XP) - Active Owner Portfolio Blend + Active Helper Co-Close Bonus (passive `teamMembers` = 0 XP)
 */
export function calculateUnifiedPortfolioBreakdown(
  input: UnifiedPortfolioScoringInput
): LeaderboardScoreBreakdown {
  const hasSalesAccess = input.hasSalesAccess ?? true;
  const activeCards = Math.max(0, input.activeCardsCount);
  const redCards = Math.max(0, input.redCardsCount ?? 0);
  const hasExposure = activeCards > 0 || Boolean(input.hasMonthlyCardExposure);
  const effectiveExposureCount = activeCards > 0 ? activeCards : hasExposure ? 1 : 0;

  // 1. Card Health (Max 30 XP)
  const collabAssisted27h = Math.max(0, input.collaboratorAssisted27hCardsCount ?? 0);
  let effectiveRedRate = Math.max(0, input.redRate);
  let cardHealthTotalXp = 0;
  let healthTier: CardHealthTier = 'No Cards';
  let isCollaboratorCardHealth = false;

  if (effectiveExposureCount > 0) {
    const ownedHealth = getCardHealthScoreFromRedRate(effectiveRedRate, effectiveExposureCount);
    cardHealthTotalXp = ownedHealth.points;
    healthTier = getCardHealthTier(effectiveExposureCount, Math.max(0, round1(100 - effectiveRedRate)));
  } else if (collabAssisted27h >= 3) {
    effectiveRedRate = Math.max(0, input.collaboratorAssistedRedRate ?? 0);
    const collabHealth = getCardHealthScoreFromRedRate(effectiveRedRate, collabAssisted27h);
    cardHealthTotalXp = round1(collabHealth.points * 0.85); // Max 25.5 XP for Pure Collaborator
    healthTier = getCardHealthTier(collabAssisted27h, Math.max(0, round1(100 - effectiveRedRate)));
    isCollaboratorCardHealth = true;
  }

  const healthRate =
    effectiveExposureCount > 0 || isCollaboratorCardHealth
      ? Math.max(0, round1(100 - effectiveRedRate))
      : 0;

  // 2. Discipline & LTC Care (Max 20 XP)
  const cleanDays = Math.max(0, input.cleanDaysCount);
  const graceDays = Math.max(0, input.graceDaysCount ?? 0);

  let cleanBonusXp = 0;
  let individualLtcXp = 0;
  let teamZeroLtcXp = 0;
  let ltcXp = 0;
  let disciplineTotalXp = 0;

  const taskOnlyCleanXp = Math.min(20, round1(cleanDays * 1.0 + graceDays * 0.5));
  const isPureTaskOrCollabRole =
    input.substantiveSalesDeals === 0 &&
    (input.substantiveInternalTasks > 0 || (input.assistedCollaboratorDeals ?? 0) > 0);

  if (!hasSalesAccess) {
    cleanBonusXp = taskOnlyCleanXp;
    disciplineTotalXp = cleanBonusXp;
  } else {
    const salesCleanXp = Math.min(10, round1(cleanDays * 0.5 + graceDays * 0.25));
    individualLtcXp = Math.min(8, Math.max(0, round1(input.individualLtcXp ?? 0)));
    const inferredTeamZero =
      input.teamZeroLtcXp !== undefined
        ? input.teamZeroLtcXp
        : input.teamLtcXp !== undefined
        ? Math.min(2, round1((input.teamLtcXp / 0.25) * 0.1))
        : 0;
    teamZeroLtcXp = Math.min(2, Math.max(0, round1(inferredTeamZero)));
    const combinedSalesLtc = Math.min(10, round1(individualLtcXp + teamZeroLtcXp));
    const salesDiscipline = Math.min(20, round1(salesCleanXp + combinedSalesLtc));

    if (isPureTaskOrCollabRole && taskOnlyCleanXp > salesDiscipline) {
      cleanBonusXp = taskOnlyCleanXp;
      ltcXp = 0;
      disciplineTotalXp = taskOnlyCleanXp;
    } else {
      cleanBonusXp = salesCleanXp;
      ltcXp = combinedSalesLtc;
      disciplineTotalXp = salesDiscipline;
    }
  }

  // Dynamic Portfolio Weights (strictly own-card weighted when owner holds cards)
  const weights = calculatePortfolioWeights({
    substantiveSalesDeals: input.substantiveSalesDeals,
    substantiveInternalTasks: input.substantiveInternalTasks,
    assistedCollaboratorDeals: input.assistedCollaboratorDeals ?? 0,
    hasSalesAccess,
  });

  // 3. Velocity & Teamwork (Max 25 XP = 12 Daily Progress & Coverage + 6 Consistent Teamwork + 7 Clean Load & Execution)
  const elapsedWorkingDays = Math.max(
    1,
    input.elapsedWorkingDays ?? Math.max(cleanDays + graceDays, 20)
  );
  const quotesCount = Math.max(0, input.quotationsOrQuotedDealsCount ?? 0);
  const salesStageAdv = Math.max(0, input.salesStageAdvancesCount ?? 0);
  const taskStageAdv = Math.max(0, input.taskStageAdvancesCount ?? 0);
  const progress27h = Math.max(0, input.progress27hUpdatesCount ?? 0);
  const verifiedProgressDays = Math.max(
    0,
    input.verifiedProgressCardDaysCount ?? progress27h
  );
  const onTimeDueFulfillments = Math.max(0, input.onTimeDueFulfillmentsCount ?? 0);
  const completedTodos = Math.max(0, input.completedTodosCount ?? 0);
  const fastReplies = Math.max(0, input.fastAcceleratorRepliesCount ?? 0);
  const readyCards = Math.max(0, input.readyOwnedCardsCount ?? 0);

  const progressCardsCount = Math.max(
    0,
    input.progressedCardsCount !== undefined ? input.progressedCardsCount : verifiedProgressDays
  );
  const multiStepCards = Math.max(0, input.multiStepProgressCardsCount ?? 0);
  const progressWorkdaysCount = Math.max(
    0,
    input.progressWorkdaysCount ?? progressCardsCount
  );
  const outreachWorkdaysCount = Math.max(0, input.outreachWorkdaysCount ?? 0);
  const effectiveProgressDays = round1(progressWorkdaysCount + outreachWorkdaysCount * 0.5);
  const targetProgressDays = Math.max(1, round1(elapsedWorkingDays * 0.75));
  const dailyProgressConsistencyPct = Math.min(
    100,
    Math.round((effectiveProgressDays / elapsedWorkingDays) * 100)
  );

  // 3a. Daily Progress Rhythm (Max 7 XP, target >= 75% of elapsed working days)
  const velocityVolumeXp =
    effectiveProgressDays > 0
      ? Math.min(7, round1(Math.min(1, effectiveProgressDays / targetProgressDays) * 7))
      : 0;

  // 3b. Active Portfolio Coverage (Max 5 XP, target >= 75% of eligible cards progressed)
  const eligibleProgressCardsCount = Math.max(
    progressCardsCount,
    Math.max(0, input.eligibleProgressCardsCount ?? activeCards)
  );
  let progressCoveragePct = 0;
  let velocityCoverageXp = 0;
  if (progressCardsCount > 0) {
    const denom = Math.max(3, eligibleProgressCardsCount);
    const coverageRatio = Math.min(1, progressCardsCount / denom);
    progressCoveragePct = Math.round(coverageRatio * 100);
    const multiStepBonus = Math.min(1, multiStepCards * 0.25);
    velocityCoverageXp = Math.min(
      5,
      round1(Math.min(5, (coverageRatio / 0.75) * 5) + multiStepBonus)
    );
  }
  const velocityProgressXp = Math.min(12, round1(velocityVolumeXp + velocityCoverageXp));

  // 3c. Consistent Teammate Assists (Max 6 XP, target >= 30% of elapsed working days, anti-spam capped at 2d/card)
  const teammateAssists = Math.max(
    0,
    input.teammate27hAssistedCardsCount ?? input.collaboratorActiveDealsCount ?? 0
  );
  const teammateAssistWorkdaysCount = Math.max(
    0,
    input.teammateAssistWorkdaysCount ?? teammateAssists
  );
  const effectiveAssistDays =
    teammateAssists > 0 ? Math.min(teammateAssistWorkdaysCount, teammateAssists * 2) : 0;
  const targetAssistDays = Math.max(1, round1(elapsedWorkingDays * 0.3));
  const velocityTeamworkXp =
    effectiveAssistDays > 0
      ? Math.min(6, round1(Math.min(1, effectiveAssistDays / targetAssistDays) * 6))
      : 0;

  // 3d. Daily Clean Active Workload (Max 3 XP, avg daily clean non-red cards * 0.2, 15+ clean cards/day = 3 XP)
  const workedActiveCards = Math.max(
    0,
    input.workedActiveCardsCount ??
      (input.substantiveSalesDeals + input.substantiveInternalTasks > 0
        ? input.substantiveSalesDeals + input.substantiveInternalTasks
        : activeCards)
  );
  const avgDailyCleanCards = Math.max(
    0,
    round1(input.avgDailyCleanCards ?? workedActiveCards)
  );
  const velocityWorkloadXp = Math.min(3, round1(avgDailyCleanCards * 0.2));

  // 3e. On-Time Execution Rate & Pace (Max 4 XP, rolling pace * due-date reliability, max 2 actions credited/day)
  const rawOnTimeActions = onTimeDueFulfillments + completedTodos + fastReplies;
  const executionWorkdaysCount = Math.max(
    0,
    input.executionWorkdaysCount ?? rawOnTimeActions
  );
  const effectiveExecActions =
    rawOnTimeActions > 0 ? Math.min(rawOnTimeActions, Math.max(1, executionWorkdaysCount) * 2) : 0;
  const missedOrStalledDueCount = Math.max(0, input.missedOrStalledDueCount ?? 0);
  const onTimeExecutionRatePct =
    rawOnTimeActions + missedOrStalledDueCount > 0
      ? Math.round((rawOnTimeActions / (rawOnTimeActions + missedOrStalledDueCount)) * 100)
      : 0;
  const reliabilityFactor =
    rawOnTimeActions > 0
      ? rawOnTimeActions / (rawOnTimeActions + missedOrStalledDueCount * 1.5)
      : 0;
  const targetExecActions = Math.max(2, round1(elapsedWorkingDays * 0.35));
  const execPaceRatio = Math.min(1, effectiveExecActions / targetExecActions);
  const velocityExecutionXp = Math.min(
    4,
    round1(4 * execPaceRatio * reliabilityFactor)
  );

  const velocityXp = Math.min(
    25,
    round1(velocityProgressXp + velocityTeamworkXp + velocityWorkloadXp + velocityExecutionXp)
  );
  const salesVelocityRaw = velocityXp;
  const taskVelocityRaw = velocityXp;

  const effectiveWSales = weights.wSales;
  const effectiveWTask = weights.wTask;

  // 4. Outcome Scales (Max 25 XP — strictly Active Owners & Active Helpers; 0 XP for passive teamMembers)
  const wonSales = Math.max(0, input.wonSalesDealsCount ?? 0);
  const revenue = Math.max(0, input.salesRevenue ?? 0);
  let salesOutcomeRaw = 0;
  if (input.monthlySalesTarget && input.monthlySalesTarget > 0) {
    salesOutcomeRaw = Math.min(25, (revenue / input.monthlySalesTarget) * 25);
  } else {
    const deptRev = Math.max(0, input.departmentTotalRevenue ?? 0);
    const revMilestonePts = revenue / 100_000;
    const revSharePts = deptRev > 0 ? (revenue / deptRev) * 10 : 0;
    const revenueContribution = Math.min(10, Math.max(revMilestonePts, revSharePts));
    salesOutcomeRaw = Math.min(25, wonSales * 5 + revenueContribution);
  }

  const completedTasks = Math.max(0, input.completedInternalTasksCount ?? 0);
  const onTimeTasks = Math.min(
    completedTasks,
    Math.max(0, input.onTimeCompletedInternalTasksCount ?? 0)
  );
  const overdueOpenTasks = Math.max(0, input.overdueOpenInternalTasksCount ?? 0);
  const healthyActiveProjects = Math.max(0, input.healthyActiveProjectTasksCount ?? 0);
  const openTaskMilestones = Math.max(0, input.openTaskMilestoneCreditsCount ?? 0);
  const collabWon = Math.max(0, input.collaboratorWonDealsCount ?? 0);

  const effectiveOnTimeTasks = onTimeTasks + healthyActiveProjects;
  const totalEvaluatedTasks = completedTasks + overdueOpenTasks + healthyActiveProjects;
  // On-Time SLA (Max 15 pts) is ONLY earned from real owned internal tasks/projects — no free 15-pt collaborator loophole!
  const onTimePts =
    totalEvaluatedTasks > 0 ? (effectiveOnTimeTasks / totalEvaluatedTasks) * 15 : 0;

  const totalOwnedCards =
    Math.max(0, input.substantiveSalesDeals) + Math.max(0, input.substantiveInternalTasks);

  let taskOutcomeRaw = 0;
  let collaboratorAssistWinXp = 0;
  let outcomeXp = 0;

  if (totalOwnedCards === 0) {
    // Pure Active Collaborator: +2.0 XP per genuinely co-closed teammate card (capped at Max 10 XP)
    collaboratorAssistWinXp = Math.min(10, round1(collabWon * 2.0));
    taskOutcomeRaw = collaboratorAssistWinXp;
    outcomeXp = collaboratorAssistWinXp;
  } else {
    const deliverableVolumePts = Math.min(
      10,
      completedTasks * 2.5 + openTaskMilestones * 1.0
    );
    taskOutcomeRaw = Math.min(25, onTimePts + deliverableVolumePts);
    const basePortfolioOutcome =
      effectiveWSales * salesOutcomeRaw + effectiveWTask * taskOutcomeRaw;
    collaboratorAssistWinXp = Math.min(8, round1(collabWon * 2.0));
    outcomeXp = Math.min(25, round1(basePortfolioOutcome + collaboratorAssistWinXp));
  }

  const totalXp = Math.min(
    100,
    Math.max(0, round1(cardHealthTotalXp + disciplineTotalXp + velocityXp + outcomeXp))
  );

  const cleanCards = activeCards === 0 ? 0 : Math.max(0, activeCards - redCards);
  const activities = Math.max(0, input.totalActivitiesCount ?? 0);

  return {
    dealsWon: wonSales + completedTasks,
    dealsWonXp: outcomeXp,
    revenue,
    revenueXp: round1(salesOutcomeRaw),
    activities,
    activitiesXp: velocityXp,
    activeCards,
    redCards,
    cleanCards,
    healthRate,
    redRate: effectiveRedRate,
    healthTier,
    baseTierXp: cardHealthTotalXp,
    cleanBonusXp,
    cleanBonusDays: cleanDays,
    graceDaysCount: graceDays,
    individualLtcXp,
    individualLtcCardsCount: Math.max(0, input.individualLtcCardsCount ?? 0),
    teamZeroLtcXp,
    ltcXp,
    quotationXp: velocityXp,
    quotationCount: quotesCount,
    redPenaltyXp: 0,
    cardHealthTotalXp,
    healthXp: cardHealthTotalXp,
    volumeBonusXp: outcomeXp,
    redHours: input.redHours,
    disciplineTotalXp,
    velocityXp,
    outcomeXp,
    salesWeightPct: Math.round(effectiveWSales * 100),
    taskWeightPct: 100 - Math.round(effectiveWSales * 100),
    ownedSalesDeals: input.substantiveSalesDeals,
    ownedInternalTasks: input.substantiveInternalTasks,
    collaboratorDeals: input.assistedCollaboratorDeals ?? 0,
    salesVelocityRaw: round1(salesVelocityRaw),
    taskVelocityRaw: round1(taskVelocityRaw),
    salesOutcomeRaw: round1(salesOutcomeRaw),
    taskOutcomeRaw: round1(taskOutcomeRaw),
    completedInternalTasks: completedTasks,
    onTimeInternalTasks: onTimeTasks,
    healthyActiveProjectTasksCount: healthyActiveProjects,
    openTaskMilestoneCreditsCount: openTaskMilestones,
    overdueOpenInternalTasksCount: overdueOpenTasks,
    collaboratorWonDealsCount: collabWon,
    departmentTotalRevenue: Math.max(0, input.departmentTotalRevenue ?? 0),
    multiStepProgressCardsCount: multiStepCards,
    completedTodosCount: completedTodos,
    progress27hCount: progressCardsCount,
    verifiedProgressDaysCount: verifiedProgressDays,
    progressCardsCount,
    eligibleProgressCardsCount,
    progressCoveragePct,
    onTimeDueFulfillmentsCount: onTimeDueFulfillments,
    fastRepliesCount: fastReplies,
    readyCardsCount: readyCards,
    velocityProgressXp: round1(velocityProgressXp),
    velocityVolumeXp: round1(velocityVolumeXp),
    velocityCoverageXp: round1(velocityCoverageXp),
    velocityTeamworkXp: round1(velocityTeamworkXp),
    velocityWorkloadXp: round1(velocityWorkloadXp),
    velocityExecutionXp: round1(velocityExecutionXp),
    velocityTeamReadinessXp: round1(velocityTeamworkXp + velocityWorkloadXp),
    workedActiveCardsCount: workedActiveCards,
    teammate27hAssistsCount: teammateAssists,
    elapsedWorkingDays,
    progressWorkdaysCount,
    outreachWorkdaysCount,
    effectiveProgressDays,
    dailyProgressConsistencyPct,
    teammateAssistWorkdaysCount,
    avgDailyCleanCards,
    executionWorkdaysCount,
    missedOrStalledDueCount,
    onTimeExecutionRatePct,
    collaboratorAssistWinXp,
    isCollaboratorCardHealth,
    stageAdvancesCount: salesStageAdv + taskStageAdv,
    wonSalesDealsCount: wonSales,
    hasSalesAccess,
    totalXp,
  };
}

export function calculateSalesXpBreakdown(
  wonDeals: number,
  revenue: number,
  cardHealthScore: number,
  activities: number,
  redCardsCount: number = 0,
  activeCardsCount: number = 0,
  redHours?: number,
  redRate?: number,
  cleanDaysCount: number = 0,
  teamLtcXp: number = 0,
  _teamQuotationXp: number = 0,
  quotationCount: number = 0,
  hasMonthlyCardExposure: boolean = activeCardsCount > 0
): LeaderboardScoreBreakdown {
  const effectiveRedRate = redRate !== undefined ? redRate : Math.max(0, 100 - cardHealthScore);
  const hasExposure = activeCardsCount > 0 || hasMonthlyCardExposure;
  const legacyLtcRatio = Math.min(1, Math.max(0, teamLtcXp / 5));
  const legacyElapsedDays = Math.max(1, cleanDaysCount || 20);
  return calculateUnifiedPortfolioBreakdown({
    redRate: effectiveRedRate,
    activeCardsCount,
    redCardsCount,
    redHours,
    hasMonthlyCardExposure: hasExposure,
    cleanDaysCount,
    individualLtcXp: round1(legacyLtcRatio * 8),
    teamZeroLtcXp: round1(legacyLtcRatio * 2),
    hasSalesAccess: true,
    substantiveSalesDeals: Math.max(activeCardsCount, wonDeals, hasExposure ? 1 : 0),
    substantiveInternalTasks: 0,
    elapsedWorkingDays: legacyElapsedDays,
    quotationsOrQuotedDealsCount: quotationCount,
    progressWorkdaysCount: activities > 0 ? Math.min(legacyElapsedDays, activities + quotationCount) : 0,
    progressedCardsCount: Math.min(12, activities),
    eligibleProgressCardsCount: Math.max(activeCardsCount, Math.min(12, activities)),
    teammate27hAssistedCardsCount: Math.min(6, quotationCount),
    teammateAssistWorkdaysCount: quotationCount > 0 ? Math.min(legacyElapsedDays, quotationCount * 2) : 0,
    avgDailyCleanCards: Math.max(Math.max(0, activeCardsCount - redCardsCount), wonDeals * 5),
    workedActiveCardsCount: Math.max(activeCardsCount, wonDeals * 5),
    verifiedProgressCardDaysCount: Math.min(12, activities),
    onTimeDueFulfillmentsCount: wonDeals + quotationCount,
    executionWorkdaysCount: wonDeals + quotationCount,
    readyOwnedCardsCount: revenue > 0 ? Math.max(wonDeals, activeCardsCount) : 0,
    wonSalesDealsCount: wonDeals,
    salesRevenue: revenue,
    totalActivitiesCount: activities,
  });
}

export function calculateSalesXp(
  wonDeals: number,
  revenue: number,
  cardHealthScore: number,
  activities: number,
  redCardsCount: number = 0,
  activeCardsCount: number = 0,
  redHours?: number,
  redRate?: number,
  cleanDaysCount: number = 0,
  teamLtcXp: number = 0,
  teamQuotationXp: number = 0,
  quotationCount: number = 0
): number {
  return calculateSalesXpBreakdown(
    wonDeals,
    revenue,
    cardHealthScore,
    activities,
    redCardsCount,
    activeCardsCount,
    redHours,
    redRate,
    cleanDaysCount,
    teamLtcXp,
    teamQuotationXp,
    quotationCount
  ).totalXp;
}

export function calculateNonSalesXp(
  tasksCompleted: number,
  activityLogs: number,
  dealsAssisted: number,
  events: number
): number {
  const taskPoints = tasksCompleted * 20;
  const activityPoints = activityLogs * 5;
  const assistPoints = dealsAssisted * 15;
  const eventPoints = events * 10;
  return taskPoints + activityPoints + assistPoints + eventPoints;
}

export function formatScoreValue(val: number, type: 'currency' | 'integer' | 'compact' | 'xp'): string {
  if (type === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'THB',
      maximumFractionDigits: 0,
    }).format(val);
  }
  if (type === 'xp') {
    const r = round1(val);
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }
  return new Intl.NumberFormat('en-US').format(val);
}

export function rankItems(
  rawList: Array<{
    userId: string;
    name: string;
    image?: string | null;
    score: number;
    formattedValue: string;
    unit: string;
    isCurrentUser?: boolean;
  }>
): LeaderboardItem[] {
  const sorted = [...rawList].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  return sorted.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));
}

export function buildPodium(
  items: LeaderboardItem[],
  metricId: string,
  metricLabel: string
): LeaderboardPodium {
  return {
    metricId,
    metricLabel,
    rank1: items.find((i) => i.rank === 1) || null,
    rank2: items.find((i) => i.rank === 2) || null,
    rank3: items.find((i) => i.rank === 3) || null,
  };
}
