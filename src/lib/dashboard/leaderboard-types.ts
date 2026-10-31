export type CardHealthTier = 'Perfect' | 'Great' | 'Good' | 'Fair' | 'At Risk' | 'No Cards';

export interface LeaderboardScoreBreakdown {
  dealsWon: number;
  dealsWonXp: number;
  revenue: number;
  revenueXp: number;
  activities: number;
  activitiesXp: number;
  activeCards: number;
  redCards: number;
  cleanCards: number;
  healthRate: number;
  redRate?: number;
  healthTier: CardHealthTier;
  baseTierXp: number;
  cleanBonusXp: number;
  cleanBonusDays?: number;
  ltcXp?: number;
  quotationXp?: number;
  quotationCount?: number;
  redPenaltyXp: number;
  cardHealthTotalXp: number;
  healthXp: number;
  volumeBonusXp: number;
  redHours?: number;
  /** Unified v2.2 100 XP Portfolio fields (30 Health + 20 Discipline & LTC + 25 Velocity & Teamwork + 25 Outcome) */
  disciplineTotalXp?: number;
  graceDaysCount?: number;
  individualLtcXp?: number;
  individualLtcCardsCount?: number;
  teamZeroLtcXp?: number;
  velocityXp?: number;
  outcomeXp?: number;
  salesWeightPct?: number;
  taskWeightPct?: number;
  ownedSalesDeals?: number;
  ownedInternalTasks?: number;
  collaboratorDeals?: number;
  salesVelocityRaw?: number;
  taskVelocityRaw?: number;
  salesOutcomeRaw?: number;
  taskOutcomeRaw?: number;
  completedInternalTasks?: number;
  onTimeInternalTasks?: number;
  healthyActiveProjectTasksCount?: number;
  openTaskMilestoneCreditsCount?: number;
  overdueOpenInternalTasksCount?: number;
  collaboratorWonDealsCount?: number;
  departmentTotalRevenue?: number;
  multiStepProgressCardsCount?: number;
  completedTodosCount?: number;
  progress27hCount?: number;
  verifiedProgressDaysCount?: number;
  progressCardsCount?: number;
  eligibleProgressCardsCount?: number;
  progressCoveragePct?: number;
  onTimeDueFulfillmentsCount?: number;
  fastRepliesCount?: number;
  readyCardsCount?: number;
  velocityProgressXp?: number;
  velocityVolumeXp?: number;
  velocityCoverageXp?: number;
  velocityTeamworkXp?: number;
  velocityWorkloadXp?: number;
  velocityExecutionXp?: number;
  velocityTeamReadinessXp?: number;
  workedActiveCardsCount?: number;
  teammate27hAssistsCount?: number;
  elapsedWorkingDays?: number;
  progressWorkdaysCount?: number;
  outreachWorkdaysCount?: number;
  effectiveProgressDays?: number;
  dailyProgressConsistencyPct?: number;
  teammateAssistWorkdaysCount?: number;
  avgDailyCleanCards?: number;
  executionWorkdaysCount?: number;
  missedOrStalledDueCount?: number;
  onTimeExecutionRatePct?: number;
  collaboratorAssistWinXp?: number;
  isCollaboratorCardHealth?: boolean;
  stageAdvancesCount?: number;
  wonSalesDealsCount?: number;
  hasSalesAccess?: boolean;
  totalXp: number;
}

export interface RedCardMiniDetail {
  dealId: string;
  topic: string;
  companyName?: string;
  overdueWorkingHours: number;
  redHoursToday: number;
}

export interface DailyCardHealthRecord {
  dateKey: string;
  dayIndex: number;
  dayOfWeek: number;
  isOffDay: boolean;
  offDayReason?: 'Sunday' | 'Dayoff' | 'Leave';
  isNoCards?: boolean;
  /** True when user held >= 15 active cards and slipped on only 1 red card (earns +0.25 XP Heavy-Load Shield) */
  isGraceShieldDay?: boolean;
  activeCardsCount: number;
  cleanCardsCount: number;
  redCardsCount: number;
  redHours: number;
  totalCardHours: number;
  redCardHoursToday: number;
  dailyRedRate: number;
  healthRate: number;
  redCardDetails: RedCardMiniDetail[];
}

export interface UserMonthlyCardHealthSummary {
  userId: string;
  totalWorkingDays: number;
  cleanDaysCount: number;
  graceDaysCount?: number;
  redDaysCount: number;
  offDaysCount: number;
  totalRedHours: number;
  avgDailyRedHours: number;
  avgMonthlyHealthRate: number;
  avgMonthlyRedRate: number;
  totalCardHours: number;
  totalRedCardHours: number;
  currentActiveCards: number;
  currentRedCards: number;
  dailyRecords: DailyCardHealthRecord[];
  redRateTier?: string;
  kpiStatus?: string;
  totalCardHealthXp?: number;
  baseTierXp?: number;
  cleanBonusXp?: number;
  redPenaltyXp?: number;
}

import type { MonthlyLtcSummary } from '@/lib/ltc-utils';

export type CategoryCardHighlightTone = 'lime' | 'emerald' | 'sky' | 'amber' | 'rose';

export interface CategoryCardHighlight {
  dealId: string;
  topic: string;
  companyName?: string;
  badgeText: string;
  tone: CategoryCardHighlightTone;
  value?: number;
}

export interface UserCategoryDrilldownDetails {
  /** LTC-* cards cared for in the active month (up to 12 items) */
  ltcCaredCards: CategoryCardHighlight[];
  /** Cards that achieved verified progress in the active month (up to 15 items) */
  progressedCards: CategoryCardHighlight[];
  /** Teammate cards where this user helped with +27h updates (up to 12 items) */
  assistedCards: CategoryCardHighlight[];
  /** Won sales deals, completed internal tasks, healthy projects, and collaborator wins (up to 15 items) */
  outcomeCards: CategoryCardHighlight[];
}

export interface LeaderboardItem {
  rank: number;
  userId: string;
  name: string;
  image?: string | null;
  score: number;
  formattedValue: string;
  unit: string;
  isCurrentUser?: boolean;
  healthTier?: CardHealthTier;
  breakdown?: LeaderboardScoreBreakdown;
  dailyHealthSummary?: UserMonthlyCardHealthSummary;
  dailyLtcSummary?: MonthlyLtcSummary;
  categoryDetails?: UserCategoryDrilldownDetails;
}

export interface LeaderboardCategoryData {
  id: string;
  label: string;
  iconName: string;
  unit: string;
  description: string;
  items: LeaderboardItem[];
}

export interface LeaderboardPodium {
  metricId: string;
  metricLabel: string;
  rank1: LeaderboardItem | null;
  rank2: LeaderboardItem | null;
  rank3: LeaderboardItem | null;
}

export interface DepartmentInfo {
  id: string;
  name: string;
  hasSalesAccess: boolean;
  userCount: number;
}

export interface DepartmentLeaderboardData {
  departmentId: string;
  departmentName: string;
  hasSalesAccess: boolean;
  /** True when the caller is MANAGEMENT or ADMIN and may inspect Analyse diagnostics for every rep in the department */
  canAnalyseDepartment?: boolean;
  availableDepartments: DepartmentInfo[];
  period: {
    month: number;
    year: number;
  };
  overallPodium: LeaderboardPodium;
  overallXpItems: LeaderboardItem[];
  categories: LeaderboardCategoryData[];
}
