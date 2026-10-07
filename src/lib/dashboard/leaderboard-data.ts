import 'server-only';

import prisma from '@/lib/prisma';
import type { PipelineActor } from '@/lib/pipeline-security';
import { bangkokBoundary, resolveCountryFromDeal, type SalesOverviewDeal } from '@/lib/dashboard/sales-overview';
import { pipelineCardSelect, type KanbanCardDTO } from '@/lib/pipeline-card-dto';
import { getCompanyHolidaysAction, getUserLeavesAction } from '@/lib/actions/holiday';
import { toBangkokDateParts } from '@/lib/business-days';
import { calculateDailySamplingForMonth } from './leaderboard-daily-sampling';
import { calculateDailyLtcForMonth } from '@/lib/ltc-utils';
import type {
  DepartmentInfo,
  DepartmentLeaderboardData,
  LeaderboardCategoryData,
} from './leaderboard-types';
import {
  calculateSalesXpBreakdown,
  calculateNonSalesXp,
  formatScoreValue,
  getCardHealthTier,
  rankItems,
  buildPodium,
} from './leaderboard-scoring';

interface LeaderboardCacheEntry {
  data: DepartmentLeaderboardData;
  expiresAt: number;
}

export interface LeaderboardWinnerSummaryResult {
  rank1: {
    userId: string;
    name: string;
    image: string | null;
    score: number;
  } | null;
}

interface WinnerCacheEntry {
  data: LeaderboardWinnerSummaryResult;
  expiresAt: number;
}

const leaderboardMemoryCache = new Map<string, LeaderboardCacheEntry>();
const winnerMemoryCache = new Map<string, WinnerCacheEntry>();
const LEADERBOARD_CACHE_TTL_MS = 60_000; // 60 seconds
const WINNER_CACHE_TTL_MS = 120_000; // 120 seconds

export function invalidateLeaderboardCache(scope?: string): void {
  if (scope) {
    for (const key of leaderboardMemoryCache.keys()) {
      if (key.startsWith(scope)) {
        leaderboardMemoryCache.delete(key);
      }
    }
    for (const key of winnerMemoryCache.keys()) {
      if (key.startsWith(scope)) {
        winnerMemoryCache.delete(key);
      }
    }
  } else {
    leaderboardMemoryCache.clear();
    winnerMemoryCache.clear();
  }
}

/**
 * Lightweight Winner Summary resolver for the navbar trophy indicator.
 * Employs a dedicated 2-minute memory cache shared across department members
 * and reuses existing full leaderboard cache entries to avoid redundant DB/CPU calculations.
 */
export async function getDepartmentLeaderboardWinnerSummary(params: {
  actor: PipelineActor;
  departmentId?: string | null;
  month: number;
  year: number;
}): Promise<LeaderboardWinnerSummaryResult> {
  const { actor, departmentId, month, year } = params;

  // 1. Authorize actor and resolve target department strictly within accessible boundaries
  const departmentQuery =
    actor.role === 'ADMIN'
      ? {}
      : {
          users: {
            some: { id: actor.id },
          },
        };

  const accessibleDepts = await prisma.department.findMany({
    where: departmentQuery,
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  if (accessibleDepts.length === 0) {
    return { rank1: null };
  }

  // If specific department is requested, actor MUST be a member (or ADMIN)
  if (departmentId && !accessibleDepts.some((d) => d.id === departmentId)) {
    throw new Error('Forbidden');
  }

  // Resolve target department deterministically per actor (avoiding shared unauthenticated 'default' token)
  const targetDeptId = departmentId || accessibleDepts[0].id;
  const winnerCacheKey = `deptWinner:${targetDeptId}:${month}:${year}`;

  // 2. Fast Path: Check dedicated winner memory cache (safe: targetDeptId access is already proven)
  const cachedWinner = winnerMemoryCache.get(winnerCacheKey);
  if (cachedWinner && cachedWinner.expiresAt > Date.now()) {
    return cachedWinner.data;
  }

  // 3. Fast Path: Check if full department leaderboard was already computed in memory
  for (const [key, entry] of leaderboardMemoryCache.entries()) {
    if (entry.expiresAt > Date.now() && key.includes(`:${targetDeptId}:${month}:${year}:`)) {
      const podium = entry.data.overallPodium;
      const rank1 = podium?.rank1 || entry.data.overallXpItems?.[0] || null;
      const result: LeaderboardWinnerSummaryResult = {
        rank1: rank1
          ? {
              userId: rank1.userId,
              name: rank1.name,
              image: rank1.image || null,
              score: rank1.score || 0,
            }
          : null,
      };
      winnerMemoryCache.set(winnerCacheKey, {
        data: result,
        expiresAt: Date.now() + WINNER_CACHE_TTL_MS,
      });
      return result;
    }
  }

  // 4. Compute department leaderboard once and populate both caches
  const data = await getDepartmentLeaderboardData({
    actor,
    departmentId: targetDeptId,
    month,
    year,
  });

  const podium = data?.overallPodium;
  const rank1 = podium?.rank1 || data?.overallXpItems?.[0] || null;
  const result: LeaderboardWinnerSummaryResult = {
    rank1: rank1
      ? {
          userId: rank1.userId,
          name: rank1.name,
          image: rank1.image || null,
          score: rank1.score || 0,
        }
      : null,
  };

  winnerMemoryCache.set(winnerCacheKey, {
    data: result,
    expiresAt: Date.now() + WINNER_CACHE_TTL_MS,
  });

  return result;
}

export async function getDepartmentLeaderboardData(params: {
  actor: PipelineActor;
  departmentId?: string | null;
  month: number;
  year: number;
  country?: string | null;
  account?: string | null;
}): Promise<DepartmentLeaderboardData> {
  const { actor, month, year, country, account } = params;

  const normCountry = country?.trim().toLowerCase() || '';
  const normAccount = account?.trim().toLowerCase() || '';
  const scopeToken = actor.role === 'ADMIN' ? 'ADMIN' : actor.id;
  const cacheKey = `${scopeToken}:${params.departmentId || 'default'}:${month}:${year}:${normCountry}:${normAccount}`;

  const cached = leaderboardMemoryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const cacheAndReturn = (result: DepartmentLeaderboardData): DepartmentLeaderboardData => {
    leaderboardMemoryCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS,
    });
    return result;
  };

  // 1. Fetch accessible departments
  const departmentQuery =
    actor.role === 'ADMIN'
      ? {}
      : {
          users: {
            some: { id: actor.id },
          },
        };

  const dbDepartments = await prisma.department.findMany({
    where: departmentQuery,
    select: {
      id: true,
      name: true,
      users: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
      permissions: {
        where: {
          visible: true,
          menuItem: {
            key: 'pipeline.information',
          },
        },
        select: {
          id: true,
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });

  const availableDepartments: DepartmentInfo[] = dbDepartments.map((dept) => ({
    id: dept.id,
    name: dept.name,
    hasSalesAccess: dept.permissions.length > 0,
    userCount: dept.users.length,
  }));

  if (availableDepartments.length === 0) {
    return cacheAndReturn({
      departmentId: '',
      departmentName: 'No department found',
      hasSalesAccess: false,
      availableDepartments: [],
      period: { month, year },
      overallPodium: {
        metricId: 'xp',
        metricLabel: 'Overall MVP',
        rank1: null,
        rank2: null,
        rank3: null,
      },
      overallXpItems: [],
      categories: [],
    });
  }

  // 2. Select target department
  const selectedDeptId =
    params.departmentId && availableDepartments.some((d) => d.id === params.departmentId)
      ? params.departmentId
      : availableDepartments[0].id;

  const targetDept = dbDepartments.find((d) => d.id === selectedDeptId)!;
  const hasSalesAccess = targetDept.permissions.length > 0;
  const departmentUsers = targetDept.users;
  const userIds = departmentUsers.map((u) => u.id);

  // 3. Date boundary for the selected period
  const startDate = bangkokBoundary(year, month - 1);
  const endDate = bangkokBoundary(year, month);
  const now = new Date();
  const nowParts = toBangkokDateParts(now);
  const isCurrentMonth = year === nowParts.year && month === (nowParts.month + 1);
  const asOfDate = isCurrentMonth ? now : new Date(endDate.getTime() - 1000);

  if (hasSalesAccess) {
    // --- Mode A: Sales Department ---
    const [deals, openDeals, activityLogs, holidaysList, userLeavesList, monthlyQuotationCount, ltcCompanies] = await Promise.all([
      prisma.opportunity.findMany({
        where: {
          status: 'WON',
          type: 'SALES_DEAL',
          ownerId: { in: userIds },
          OR: [
            {
              goodsLoadingDate: {
                gte: startDate,
                lt: endDate,
              },
            },
            {
              goodsLoadingDate: null,
              closedAt: {
                gte: startDate,
                lt: endDate,
              },
            },
          ],
        },
        select: {
          id: true,
          topic: true,
          status: true,
          value: true,
          currency: true,
          goodsLoadingDate: true,
          ownerId: true,
          companyId: true,
          company: {
            select: {
              name: true,
              displayName: true,
              country: true,
              addresses: {
                select: { country: true },
                take: 1,
              },
            },
          },
        },
      }),
      prisma.opportunity.findMany({
        where: {
          pipelineStageId: { not: null },
          ownerId: { in: userIds },
          createdAt: { lt: asOfDate },
          OR: [
            { status: 'OPEN' },
            { closedAt: null },
            { closedAt: { gte: startDate } },
          ],
        },
        select: {
          ...pipelineCardSelect,
          activityLogs: {
            where: {
              parentId: null,
              type: 'COMMENT' as const,
              createdAt: { lte: asOfDate },
              NOT: [
                { content: { startsWith: '[DUE DATE:' } },
                { content: { startsWith: '[URGENT_' } },
              ],
            },
            orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
            select: {
              id: true,
              content: true,
              type: true,
              createdAt: true,
              user: { select: { name: true, image: true } },
            },
          },
        },
      }),
      prisma.activityLog.findMany({
        where: {
          userId: { in: userIds },
          createdAt: {
            gte: startDate,
            lt: endDate,
          },
        },
        select: {
          id: true,
          userId: true,
        },
      }),
      getCompanyHolidaysAction(),
      getUserLeavesAction(),
      prisma.quotation
        .count({
          where: {
            createdAt: {
              gte: startDate,
              lt: endDate,
            },
          },
        })
        .catch(() => 0),
      prisma.company.findMany({
        where: {
          type: 'CUSTOMER',
          status: 'QUALIFIED',
        },
        select: {
          id: true,
          createdAt: true,
          opportunities: {
            select: {
              id: true,
              value: true,
              status: true,
              closedAt: true,
              goodsLoadingDate: true,
              createdAt: true,
              activityLogs: {
                select: { createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 5,
              },
            },
          },
        },
      }),
    ]);

    const companyHolidays = new Set<string>(holidaysList);
    const leavesByUser = new Map<string, Set<string>>();
    for (const leave of userLeavesList) {
      if (!leavesByUser.has(leave.userId)) {
        leavesByUser.set(leave.userId, new Set());
      }
      leavesByUser.get(leave.userId)!.add(leave.dateStr);
    }

    // Apply On-the-fly Daily 23:00 Sampling across the month
    const sanitizedOpenDeals = (openDeals as unknown as KanbanCardDTO[]).map((d) => ({
      ...d,
      closedAt: d.status === 'OPEN' ? null : d.closedAt,
    }));

    const dailySamplingMap = calculateDailySamplingForMonth({
      departmentUsers,
      deals: sanitizedOpenDeals,
      month,
      year,
      companyHolidays,
      leavesByUser,
      asOfDate,
    });

    const ltcDailySummary = calculateDailyLtcForMonth({
      companies: ltcCompanies,
      month,
      year,
      companyHolidays,
      asOfDate,
    });
    const teamLtcXp = ltcDailySummary.teamLtcXp;

    // Apply global filters (country and account) to deals
    const filteredDeals = deals.filter((deal) => {
      if (normCountry) {
        const c = resolveCountryFromDeal(deal as unknown as SalesOverviewDeal);
        const matchesCountry =
          c.code.toLowerCase() === normCountry || c.name.toLowerCase() === normCountry;
        if (!matchesCountry) return false;
      }
      if (normAccount) {
        const accId = deal.companyId?.toLowerCase();
        const accName = (deal.company?.displayName || deal.company?.name || '').toLowerCase();
        const matchesAccount = accId === normAccount || accName === normAccount;
        if (!matchesAccount) return false;
      }
      return true;
    });

    // Aggregate user scores
    const userMetrics = new Map<
      string,
      {
        revenue: number;
        dealsCount: number;
        cardHealthScore: number;
        redRate: number;
        redCount: number;
        activeCardsCount: number;
        totalRedHours: number;
        activityCount: number;
      }
    >();

    for (const u of departmentUsers) {
      const summary = dailySamplingMap.get(u.id);
      const activeCount = summary?.currentActiveCards ?? 0;
      const redCount = summary?.currentRedCards ?? 0;
      const healthRate = summary?.avgMonthlyHealthRate ?? 0;
      const totalRedHours = summary?.totalRedHours ?? 0;

      userMetrics.set(u.id, {
        revenue: 0,
        dealsCount: 0,
        cardHealthScore: healthRate,
        redRate: summary?.avgMonthlyRedRate ?? 0,
        redCount,
        activeCardsCount: activeCount,
        totalRedHours,
        activityCount: 0,
      });
    }

    for (const deal of filteredDeals) {
      const metric = userMetrics.get(deal.ownerId);
      if (metric) {
        metric.dealsCount += 1;
        metric.revenue += deal.value || 0;
      }
    }

    for (const act of activityLogs) {
      const metric = userMetrics.get(act.userId);
      if (metric) {
        metric.activityCount += 1;
      }
    }

    // Build raw lists for ranking
    const teamQuotationScore = Math.min(10, monthlyQuotationCount ?? 0);

    const cardHealthRaw = departmentUsers.map((u) => {
      const m = userMetrics.get(u.id)!;
      const summary = dailySamplingMap.get(u.id);
      const tier = getCardHealthTier(m.activeCardsCount, m.cardHealthScore);
      const cleanDays = summary?.cleanDaysCount ?? 0;
      const breakdown = calculateSalesXpBreakdown(
        m.dealsCount,
        m.revenue,
        m.cardHealthScore,
        m.activityCount,
        m.redCount,
        m.activeCardsCount,
        m.totalRedHours,
        summary?.avgMonthlyRedRate ?? m.redRate,
        cleanDays,
        teamLtcXp,
        teamQuotationScore,
        monthlyQuotationCount ?? 0
      );

      const healthXp = summary?.totalCardHealthXp ?? breakdown.cardHealthTotalXp;
      const rate = summary?.avgMonthlyRedRate ?? 0;
      const formattedValue = `${rate.toFixed(rate % 1 === 0 ? 0 : 1)}%`;

      return {
        userId: u.id,
        name: u.name || 'Anonymous Rep',
        image: u.image,
        score: healthXp,
        formattedValue,
        unit: '%',
        healthTier: tier,
        breakdown,
        dailyHealthSummary: summary,
        isCurrentUser: u.id === actor.id,
      };
    });

    const cleanBonusRaw = departmentUsers.map((u) => {
      const summary = dailySamplingMap.get(u.id);
      const cleanDays = summary?.cleanDaysCount ?? 0;
      const cleanBonusXp = Math.min(20, cleanDays);
      return {
        userId: u.id,
        name: u.name || 'Anonymous Rep',
        image: u.image,
        score: cleanBonusXp,
        formattedValue: `${cleanBonusXp} XP`,
        unit: 'XP',
        dailyHealthSummary: summary,
        isCurrentUser: u.id === actor.id,
      };
    });

    const ltcRaw = departmentUsers.map((u) => {
      return {
        userId: u.id,
        name: u.name || 'Anonymous Rep',
        image: u.image,
        score: teamLtcXp,
        formattedValue: `${teamLtcXp} XP`,
        unit: 'XP',
        isCurrentUser: u.id === actor.id,
        dailyLtcSummary: ltcDailySummary,
      };
    });

    const quotationRaw = departmentUsers.map((u) => {
      return {
        userId: u.id,
        name: u.name || 'Anonymous Rep',
        image: u.image,
        score: teamQuotationScore,
        formattedValue: `${teamQuotationScore} XP`,
        unit: 'XP',
        isCurrentUser: u.id === actor.id,
      };
    });

    const xpRaw = departmentUsers.map((u) => {
      const m = userMetrics.get(u.id)!;
      const summary = dailySamplingMap.get(u.id);
      const cleanDays = summary?.cleanDaysCount ?? 0;
      const breakdown = calculateSalesXpBreakdown(
        m.dealsCount,
        m.revenue,
        m.cardHealthScore,
        m.activityCount,
        m.redCount,
        m.activeCardsCount,
        m.totalRedHours,
        summary?.avgMonthlyRedRate ?? m.redRate,
        cleanDays,
        teamLtcXp,
        teamQuotationScore,
        monthlyQuotationCount ?? 0
      );
      return {
        userId: u.id,
        name: u.name || 'Anonymous Rep',
        image: u.image,
        score: breakdown.totalXp,
        formattedValue: `${formatScoreValue(breakdown.totalXp, 'integer')} XP`,
        unit: 'XP',
        healthTier: breakdown.healthTier,
        breakdown,
        dailyHealthSummary: summary,
        isCurrentUser: u.id === actor.id,
      };
    });

    // Card health tie-breaker: if score is tied, lower red rate ranks higher
    const rankedCardHealth = [...cardHealthRaw]
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aRed = a.dailyHealthSummary?.avgMonthlyRedRate ?? 100;
        const bRed = b.dailyHealthSummary?.avgMonthlyRedRate ?? 100;
        const aCards = a.dailyHealthSummary?.currentActiveCards ?? 0;
        const bCards = b.dailyHealthSummary?.currentActiveCards ?? 0;
        if (aCards > 0 && bCards === 0) return -1;
        if (bCards > 0 && aCards === 0) return 1;
        if (aRed !== bRed) return aRed - bRed;
        return a.name.localeCompare(b.name);
      })
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }));

    // Clean bonus tie-breaker: if score is tied, lower red rate ranks higher
    const rankedCleanBonus = [...cleanBonusRaw]
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aRed = a.dailyHealthSummary?.avgMonthlyRedRate ?? 100;
        const bRed = b.dailyHealthSummary?.avgMonthlyRedRate ?? 100;
        if (aRed !== bRed) return aRed - bRed;
        return a.name.localeCompare(b.name);
      })
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }));

    const rankedLtc = rankItems(ltcRaw);
    const rankedQuotation = rankItems(quotationRaw);
    const rankedXp = rankItems(xpRaw);

    const categories: LeaderboardCategoryData[] = [
      {
        id: 'card_health',
        label: 'Card Health',
        iconName: 'ShieldCheck',
        unit: 'Max 50 XP',
        description: 'Red card rate below 5% target (5-tier KPI)',
        items: rankedCardHealth,
      },
      {
        id: 'clean_bonus',
        label: 'Clean Bonus',
        iconName: 'Sparkles',
        unit: 'Max 20 XP',
        description: '+1 XP per 100% clean workday with 0 red cards (max 20 XP)',
        items: rankedCleanBonus,
      },
      {
        id: 'ltc',
        label: 'LTC',
        iconName: 'Clock',
        unit: 'Max 20 XP',
        description: '+1 XP per day when all LTC accounts are cleared (max 20 XP)',
        items: rankedLtc,
      },
      {
        id: 'quotation',
        label: 'Quotation',
        iconName: 'FileText',
        unit: 'Max 10 XP',
        description: 'Monthly quotations issued by team (max 10 XP)',
        items: rankedQuotation,
      },
    ];

    return cacheAndReturn({
      departmentId: targetDept.id,
      departmentName: targetDept.name,
      hasSalesAccess: true,
      availableDepartments,
      period: { month, year },
      overallPodium: buildPodium(rankedXp, 'xp', 'Overall MVP'),
      overallXpItems: rankedXp,
      categories,
    });
  } else {
    // --- Mode B: Non-Sales / Operations & Support Department ---
    const [tasks, activityLogs, assistedDeals, calendarEvents] = await Promise.all([
      prisma.note.findMany({
        where: {
          authorId: { in: userIds },
          isCompleted: true,
          updatedAt: {
            gte: startDate,
            lt: endDate,
          },
        },
        select: {
          id: true,
          authorId: true,
        },
      }),
      prisma.activityLog.findMany({
        where: {
          userId: { in: userIds },
          createdAt: {
            gte: startDate,
            lt: endDate,
          },
        },
        select: {
          id: true,
          userId: true,
        },
      }),
      prisma.opportunity.findMany({
        where: {
          teamMembers: {
            some: { id: { in: userIds } },
          },
          createdAt: {
            gte: startDate,
            lt: endDate,
          },
        },
        select: {
          id: true,
          teamMembers: {
            select: { id: true },
          },
        },
      }),
      prisma.calendarEvent.findMany({
        where: {
          ownerId: { in: userIds },
          startAt: {
            gte: startDate,
            lt: endDate,
          },
        },
        select: {
          id: true,
          ownerId: true,
        },
      }),
    ]);

    const userMetrics = new Map<
      string,
      {
        taskCount: number;
        activityCount: number;
        assistCount: number;
        eventCount: number;
      }
    >();

    for (const u of departmentUsers) {
      userMetrics.set(u.id, {
        taskCount: 0,
        activityCount: 0,
        assistCount: 0,
        eventCount: 0,
      });
    }

    for (const t of tasks) {
      const metric = userMetrics.get(t.authorId);
      if (metric) metric.taskCount += 1;
    }

    for (const act of activityLogs) {
      const metric = userMetrics.get(act.userId);
      if (metric) metric.activityCount += 1;
    }

    for (const deal of assistedDeals) {
      for (const tm of deal.teamMembers) {
        const metric = userMetrics.get(tm.id);
        if (metric) metric.assistCount += 1;
      }
    }

    for (const ev of calendarEvents) {
      const metric = userMetrics.get(ev.ownerId);
      if (metric) metric.eventCount += 1;
    }

    const tasksRaw = departmentUsers.map((u) => {
      const m = userMetrics.get(u.id)!;
      return {
        userId: u.id,
        name: u.name || 'Team Member',
        image: u.image,
        score: m.taskCount,
        formattedValue: formatScoreValue(m.taskCount, 'integer'),
        unit: 'Done',
        isCurrentUser: u.id === actor.id,
      };
    });

    const activitiesRaw = departmentUsers.map((u) => {
      const m = userMetrics.get(u.id)!;
      return {
        userId: u.id,
        name: u.name || 'Team Member',
        image: u.image,
        score: m.activityCount,
        formattedValue: formatScoreValue(m.activityCount, 'integer'),
        unit: 'Logs',
        isCurrentUser: u.id === actor.id,
      };
    });

    const assistsRaw = departmentUsers.map((u) => {
      const m = userMetrics.get(u.id)!;
      return {
        userId: u.id,
        name: u.name || 'Team Member',
        image: u.image,
        score: m.assistCount,
        formattedValue: formatScoreValue(m.assistCount, 'integer'),
        unit: 'Deals',
        isCurrentUser: u.id === actor.id,
      };
    });

    const eventsRaw = departmentUsers.map((u) => {
      const m = userMetrics.get(u.id)!;
      return {
        userId: u.id,
        name: u.name || 'Team Member',
        image: u.image,
        score: m.eventCount,
        formattedValue: formatScoreValue(m.eventCount, 'integer'),
        unit: 'Events',
        isCurrentUser: u.id === actor.id,
      };
    });

    const xpRaw = departmentUsers.map((u) => {
      const m = userMetrics.get(u.id)!;
      const xp = calculateNonSalesXp(m.taskCount, m.activityCount, m.assistCount, m.eventCount);
      return {
        userId: u.id,
        name: u.name || 'Team Member',
        image: u.image,
        score: xp,
        formattedValue: `${formatScoreValue(xp, 'integer')} XP`,
        unit: 'XP',
        isCurrentUser: u.id === actor.id,
      };
    });

    const rankedTasks = rankItems(tasksRaw);
    const rankedActivities = rankItems(activitiesRaw);
    const rankedAssists = rankItems(assistsRaw);
    const rankedEvents = rankItems(eventsRaw);
    const rankedXp = rankItems(xpRaw);

    const categories: LeaderboardCategoryData[] = [
      {
        id: 'tasks',
        label: 'Tasks Completed',
        iconName: 'CheckSquare',
        unit: 'Done',
        description: 'To-do tasks completed in the period',
        items: rankedTasks,
      },
      {
        id: 'activities',
        label: 'Activity Logs',
        iconName: 'MessageSquare',
        unit: 'Logs',
        description: 'Activity logs, notes & communications',
        items: rankedActivities,
      },
      {
        id: 'dealsAssisted',
        label: 'Deals Assisted',
        iconName: 'Users',
        unit: 'Deals',
        description: 'Deals and projects assisted in team',
        items: rankedAssists,
      },
      {
        id: 'events',
        label: 'Calendar & Events',
        iconName: 'Calendar',
        unit: 'Events',
        description: 'Scheduled events and meetings',
        items: rankedEvents,
      },
    ];

    return cacheAndReturn({
      departmentId: targetDept.id,
      departmentName: targetDept.name,
      hasSalesAccess: false,
      availableDepartments,
      period: { month, year },
      overallPodium: buildPodium(rankedXp, 'xp', 'Overall MVP'),
      overallXpItems: rankedXp,
      categories,
    });
  }
}
