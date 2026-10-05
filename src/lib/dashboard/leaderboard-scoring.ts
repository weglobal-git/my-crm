import type {
  CardHealthTier,
  LeaderboardItem,
  LeaderboardPodium,
  LeaderboardScoreBreakdown,
} from './leaderboard-types';

export function getCardHealthTier(activeCount: number, healthRate: number): CardHealthTier {
  if (activeCount === 0) return 'No Cards';
  if (healthRate === 100) return 'Perfect';
  if (healthRate >= 90) return 'Great';
  if (healthRate >= 70) return 'Good';
  if (healthRate >= 50) return 'Fair';
  return 'At Risk';
}

export interface RedRateStep {
  maxRate: number;
  points: number;
  label: string;
  badge: string;
  status:
    | 'Perfect'
    | 'Great'
    | 'Good'
    | 'Target Met'
    | 'Warning'
    | 'Danger'
    | 'Critical'
    | 'No Cards';
}

export const RED_RATE_LADDER: RedRateStep[] = [
  { maxRate: 1, points: 50, label: '< 1%', badge: '< 1% Red', status: 'Perfect' },
  { maxRate: 2, points: 45, label: '< 2%', badge: '< 2% Red', status: 'Great' },
  { maxRate: 3, points: 40, label: '< 3%', badge: '< 3% Red', status: 'Good' },
  { maxRate: 4, points: 35, label: '< 4%', badge: '< 4% Red', status: 'Good' },
  { maxRate: 5, points: 30, label: '< 5%', badge: '< 5% Red', status: 'Target Met' },
  { maxRate: 10, points: 20, label: '< 10%', badge: '< 10% Red', status: 'Warning' },
  { maxRate: 20, points: 10, label: '< 20%', badge: '< 20% Red', status: 'Danger' },
];

export function getCardHealthScoreFromRedRate(
  redRate: number,
  activeCardsCount: number
): { points: number; label: string; badge: string; status: RedRateStep['status'] } {
  if (activeCardsCount === 0) {
    return { points: 0, label: 'No Cards', badge: 'No Cards', status: 'No Cards' };
  }
  for (const step of RED_RATE_LADDER) {
    if (redRate < step.maxRate) {
      return { points: step.points, label: step.label, badge: step.badge, status: step.status };
    }
  }
  return { points: 0, label: '≥ 20%', badge: '≥ 20% Red', status: 'Critical' };
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
  teamQuotationXp: number = 0,
  quotationCount: number = 0
): LeaderboardScoreBreakdown {
  const dealPoints = wonDeals * 50;
  const revenuePoints = Math.floor(Math.max(0, revenue) / 10000);
  const activityPoints = activities * 2;

  // 1. Card Health (Max 50 XP) - 5-Tier Red Rate KPI (<5% target, >=5% cutoff)
  const effectiveRedRate = redRate !== undefined ? redRate : Math.max(0, 100 - cardHealthScore);
  const { points: cardHealthTotalXp } = getCardHealthScoreFromRedRate(
    effectiveRedRate,
    activeCardsCount
  );

  // 2. Clean Bonus (Max 20 XP) - +1 XP per 100% clean day without any red cards
  const cleanBonusXp = Math.min(20, Math.max(0, cleanDaysCount));

  // 3. LTC (Max 20 XP) - Team Metric (Phase 2)
  const ltcXp = Math.min(20, Math.max(0, teamLtcXp));

  // 4. Quotation (Max 10 XP) - Team Metric
  const quotationXp = Math.min(10, Math.max(0, teamQuotationXp));

  const cleanCards = activeCardsCount === 0 ? 0 : Math.max(0, activeCardsCount - redCardsCount);
  const healthTier = getCardHealthTier(activeCardsCount, cardHealthScore);

  // Total Max 100 XP Gamification Model
  const totalXp = Math.max(0, cardHealthTotalXp + cleanBonusXp + ltcXp + quotationXp);

  return {
    dealsWon: wonDeals,
    dealsWonXp: dealPoints,
    revenue,
    revenueXp: revenuePoints,
    activities,
    activitiesXp: activityPoints,
    activeCards: activeCardsCount,
    redCards: redCardsCount,
    cleanCards,
    healthRate: cardHealthScore,
    redRate: effectiveRedRate,
    healthTier,
    baseTierXp: cardHealthTotalXp,
    cleanBonusXp,
    cleanBonusDays: cleanDaysCount,
    ltcXp,
    quotationXp,
    quotationCount,
    redPenaltyXp: 0,
    cardHealthTotalXp,
    healthXp: cardHealthTotalXp,
    volumeBonusXp: 0,
    redHours,
    totalXp,
  };
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

export function formatScoreValue(val: number, type: 'currency' | 'integer' | 'compact'): string {
  if (type === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'THB',
      maximumFractionDigits: 0,
    }).format(val);
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
