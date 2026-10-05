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
  availableDepartments: DepartmentInfo[];
  period: {
    month: number;
    year: number;
  };
  overallPodium: LeaderboardPodium;
  overallXpItems: LeaderboardItem[];
  categories: LeaderboardCategoryData[];
}
