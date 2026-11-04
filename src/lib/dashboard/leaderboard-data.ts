import 'server-only';

import prisma from '@/lib/prisma';
import type { PipelineActor } from '@/lib/pipeline-security';
import {
  bangkokBoundary,
  resolveCountryFromDeal,
  type SalesOverviewDeal,
} from '@/lib/dashboard/sales-overview';
import {
  buildEffectiveOffDatesMap,
  checkIsRedCard,
  evaluateCardTimingState,
  pipelineCardSelect,
  type KanbanCardDTO,
} from '@/lib/pipeline-card-dto';
import { getCompanyHolidaysAction, getUserLeavesAction } from '@/lib/actions/holiday';
import {
  calculateElapsedWorkingMs,
  RED_CARD_WORKING_MS_THRESHOLD,
  resolveDueDateSchedule,
  toBangkokDateParts,
} from '@/lib/business-days';
import {
  analyzeDueDateTimeline,
  classifyUpdateQuality,
  parseTierPrefix,
} from '@/lib/pipeline-update-quality';
import {
  calculateDailySamplingForMonth,
  resolveEffectiveDueDateAt,
} from './leaderboard-daily-sampling';
import { calculateDailyLtcForMonth } from '@/lib/ltc-utils';
import type {
  CategoryCardHighlight,
  DepartmentInfo,
  DepartmentLeaderboardData,
  LeaderboardCategoryData,
  LeaderboardItem,
  LeaderboardScoreBreakdown,
  UserCategoryDrilldownDetails,
} from './leaderboard-types';
import {
  calculateUnifiedPortfolioBreakdown,
  formatScoreValue,
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
const LEADERBOARD_CACHE_TTL_MS = 60_000; // 60 seconds shared per department
const WINNER_CACHE_TTL_MS = 120_000; // 120 seconds shared per department

const SUBSTANCE_MIN_WORKING_MS = 2 * 3600 * 1000; // 2 working hours

export function invalidateLeaderboardCache(scope?: string): void {
  if (scope) {
    if (scope === 'ADMIN') {
      leaderboardMemoryCache.clear();
      winnerMemoryCache.clear();
      return;
    }
    for (const key of leaderboardMemoryCache.keys()) {
      if (key.startsWith(scope) || key.includes(`:${scope}:`)) {
        leaderboardMemoryCache.delete(key);
      }
    }
    for (const key of winnerMemoryCache.keys()) {
      if (key.startsWith(scope) || key.includes(`:${scope}:`)) {
        winnerMemoryCache.delete(key);
      }
    }
  } else {
    leaderboardMemoryCache.clear();
    winnerMemoryCache.clear();
  }
}

export function canActorAnalyseDepartment(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'MANAGEMENT';
}

/**
 * Stamps caller-specific `isCurrentUser`, `canAnalyseDepartment`, and `availableDepartments`
 * onto a shared department cache payload in O(users) without re-running DB queries or daily sampling.
 * For non-manager (`GENERAL`) callers, strips private `redCardDetails` deal titles on other teammates' records.
 */
export function personalizeLeaderboardForActor(
  base: DepartmentLeaderboardData,
  actorId: string,
  availableDepartments: DepartmentInfo[],
  actorRole?: string | null
): DepartmentLeaderboardData {
  const canAnalyseDepartment = canActorAnalyseDepartment(actorRole);

  const stampItem = (item: LeaderboardItem): LeaderboardItem => {
    const isSelf = item.userId === actorId;
    if (canAnalyseDepartment || isSelf) {
      return {
        ...item,
        isCurrentUser: isSelf,
      };
    }

    return {
      ...item,
      isCurrentUser: false,
      categoryDetails: undefined,
      dailyHealthSummary: item.dailyHealthSummary
        ? {
            ...item.dailyHealthSummary,
            dailyRecords: item.dailyHealthSummary.dailyRecords.map((rec) =>
              rec.redCardDetails.length > 0 ? { ...rec, redCardDetails: [] } : rec
            ),
          }
        : undefined,
    };
  };

  const overallXpItems = base.overallXpItems.map(stampItem);
  return {
    ...base,
    canAnalyseDepartment,
    availableDepartments,
    overallPodium: {
      ...base.overallPodium,
      rank1: base.overallPodium.rank1 ? stampItem(base.overallPodium.rank1) : null,
      rank2: base.overallPodium.rank2 ? stampItem(base.overallPodium.rank2) : null,
      rank3: base.overallPodium.rank3 ? stampItem(base.overallPodium.rank3) : null,
    },
    overallXpItems,
    categories: base.categories.map((cat) => ({
      ...cat,
      items: cat.items.map(stampItem),
    })),
  };
}

/**
 * Lightweight Winner Summary resolver for the navbar trophy indicator.
 * Employs a dedicated 2-minute memory cache shared across department members
 * and reuses existing unfiltered department leaderboard cache entries.
 */
export async function getDepartmentLeaderboardWinnerSummary(params: {
  actor: PipelineActor;
  departmentId?: string | null;
  month: number;
  year: number;
}): Promise<LeaderboardWinnerSummaryResult> {
  const { actor, departmentId, month, year } = params;

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

  if (departmentId && !accessibleDepts.some((d) => d.id === departmentId)) {
    throw new Error('Forbidden');
  }

  const targetDeptId = departmentId || accessibleDepts[0].id;
  const winnerCacheKey = `deptWinner:${targetDeptId}:${month}:${year}`;

  const cachedWinner = winnerMemoryCache.get(winnerCacheKey);
  if (cachedWinner && cachedWinner.expiresAt > Date.now()) {
    return cachedWinner.data;
  }

  // Reuse unfiltered department cache entry when present
  const unfilteredDeptKey = `deptData:${targetDeptId}:${month}:${year}::`;
  const existingDeptEntry = leaderboardMemoryCache.get(unfilteredDeptKey);
  if (existingDeptEntry && existingDeptEntry.expiresAt > Date.now()) {
    const podium = existingDeptEntry.data.overallPodium;
    const rank1 = podium?.rank1 || existingDeptEntry.data.overallXpItems?.[0] || null;
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

  // 1. Fetch accessible departments for RBAC validation & department switcher
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
    return {
      departmentId: '',
      departmentName: 'No department found',
      hasSalesAccess: false,
      canAnalyseDepartment: canActorAnalyseDepartment(actor.role),
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
    };
  }

  // 2. Select target department and check shared department cache
  const selectedDeptId =
    params.departmentId && availableDepartments.some((d) => d.id === params.departmentId)
      ? params.departmentId
      : availableDepartments[0].id;

  const deptCacheKey = `deptData:${selectedDeptId}:${month}:${year}:${normCountry}:${normAccount}`;
  const cached = leaderboardMemoryCache.get(deptCacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return personalizeLeaderboardForActor(cached.data, actor.id, availableDepartments, actor.role);
  }

  const targetDept = dbDepartments.find((d) => d.id === selectedDeptId)!;
  const hasSalesAccess = targetDept.permissions.length > 0;
  const departmentUsers = targetDept.users;
  const userIds = departmentUsers.map((u) => u.id);
  const userIdSet = new Set(userIds);

  // 3. Date boundary for the selected period (Asia/Bangkok)
  const startDate = bangkokBoundary(year, month - 1);
  const endDate = bangkokBoundary(year, month);
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  const now = new Date();
  const nowParts = toBangkokDateParts(now);
  const isCurrentMonth = year === nowParts.year && month === nowParts.month + 1;
  const asOfDate = isCurrentMonth ? now : new Date(endMs - 1000);

  // 4. Unified parallel data load across both Sales Deals and Internal Tasks
  const [
    deptOpportunities,
    monthlyActivities,
    completedNotes,
    holidaysList,
    userLeavesList,
    ltcCompanies,
  ] = await Promise.all([
    prisma.opportunity.findMany({
      where: {
        createdAt: { lt: asOfDate },
        OR: [
          {
            ownerId: { in: userIds },
            OR: [
              { pipelineStageId: { not: null } },
              { status: { in: ['WON', 'COMPLETED'] } },
            ],
            AND: [
              {
                OR: [
                  { status: 'OPEN' },
                  { closedAt: null },
                  { closedAt: { gte: startDate } },
                  { goodsLoadingDate: { gte: startDate, lt: endDate } },
                ],
              },
            ],
          },
          {
            ownerId: { notIn: userIds },
            OR: [
              { teamMembers: { some: { id: { in: userIds } } } },
              {
                activityLogs: {
                  some: {
                    userId: { in: userIds },
                    createdAt: { gte: startDate, lt: endDate },
                  },
                },
              },
            ],
            AND: [
              {
                OR: [
                  { status: 'OPEN' },
                  { closedAt: null },
                  { closedAt: { gte: startDate } },
                  { goodsLoadingDate: { gte: startDate, lt: endDate } },
                ],
              },
            ],
          },
        ],
      },
      select: {
        ...pipelineCardSelect,
        companyId: true,
        quotedAt: true,
        company: {
          select: {
            id: true,
            name: true,
            displayName: true,
            country: true,
            addresses: {
              select: { country: true },
              take: 1,
            },
          },
        },
        stage: {
          select: {
            id: true,
            order: true,
          },
        },
        _count: {
          select: {
            attachments: true,
            quotations: true,
            notes: {
              where: { isCompleted: true },
            },
          },
        },
        activityLogs: {
          where: {
            parentId: null,
            createdAt: { lte: asOfDate },
            OR: [
              {
                type: 'COMMENT' as const,
                NOT: [{ content: { startsWith: '[URGENT_' } }],
              },
              {
                type: 'SYSTEM_UPDATE' as const,
                OR: [
                  { content: { startsWith: 'Ownership transferred from ' } },
                  { content: { startsWith: 'Deal reopened' } },
                  { content: { startsWith: 'Deal marked as ' } },
                  { content: { startsWith: 'Task completed' } },
                ],
              },
            ],
          },
          orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
          select: {
            id: true,
            content: true,
            type: true,
            userId: true,
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
        type: true,
        content: true,
        parentId: true,
        opportunityId: true,
        createdAt: true,
      },
    }),
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
        opportunityId: true,
        updatedAt: true,
      },
    }),
    getCompanyHolidaysAction(),
    getUserLeavesAction(),
    hasSalesAccess
      ? prisma.company.findMany({
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
                  where: { createdAt: { lte: asOfDate } },
                  select: { createdAt: true },
                  orderBy: { createdAt: 'desc' },
                  take: 50,
                },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const companyHolidays = new Set<string>(holidaysList);
  const leavesByUser = new Map<string, Set<string>>();
  for (const leave of userLeavesList) {
    let set = leavesByUser.get(leave.userId);
    if (!set) {
      set = new Set();
      leavesByUser.set(leave.userId, set);
    }
    set.add(leave.dateStr);
  }
  const prebuiltOffDatesMap = buildEffectiveOffDatesMap(companyHolidays, leavesByUser);

  // Filter helper for optional country / account dashboard filters
  const matchesGlobalFilter = (deal: (typeof deptOpportunities)[number]): boolean => {
    if (!normCountry && !normAccount) return true;
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
  };

  // 5. Daily Workday-Aligned Card Health Sampling across ALL owned board cards (including historical transfers)
  const ownedBoardDeals = deptOpportunities
    .filter(
      (d) =>
        d.pipelineStageId !== null &&
        (userIdSet.has(d.ownerId) ||
          d.activityLogs.some(
            (l) =>
              l.content.includes('[HANDOVER:') ||
              (l.type === 'SYSTEM_UPDATE' && l.content.startsWith('Ownership transferred from '))
          ))
    )
    .map((d) => ({
      ...(d as unknown as KanbanCardDTO),
      closedAt: d.status === 'OPEN' ? null : d.closedAt,
    }));

  const dailySamplingMap = calculateDailySamplingForMonth({
    departmentUsers,
    deals: ownedBoardDeals,
    month,
    year,
    companyHolidays,
    leavesByUser,
    asOfDate,
  });

  const ltcDailySummary = hasSalesAccess
    ? calculateDailyLtcForMonth({
        companies: ltcCompanies,
        month,
        year,
        companyHolidays,
        asOfDate,
      })
    : undefined;
  const teamZeroLtcXp = ltcDailySummary?.teamZeroBonusXp ?? 0;

  // 6. Aggregate Portfolio Weights, v2.2 Velocity & Teamwork (12+6+7), LTC Active Care, and Outcome Signals per user
  const toBangkokDayKey = (d: Date | string): string => {
    const p = toBangkokDateParts(new Date(d));
    return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.date).padStart(2, '0')}`;
  };

  const evaluateCommentSignals = (
    rawContent: string
  ): { isNonZero: boolean; isVerified27h: boolean; isCardProgress: boolean } => {
    const parsed = parseTierPrefix(rawContent);
    if (/^\[(?:HANDOVER:[^\]]+|HANDOVER|REOPEN)\]/i.test(parsed.cleanContent.trim())) {
      return { isNonZero: false, isVerified27h: false, isCardProgress: false };
    }
    if (parsed.hasExplicitTier) {
      return {
        isNonZero: parsed.tier !== '0H',
        isVerified27h: parsed.isVerified27h,
        isCardProgress: parsed.isCardProgress,
      };
    }
    const legacyEval = classifyUpdateQuality(parsed.cleanContent);
    return {
      isNonZero: legacyEval.tier !== '0H',
      isVerified27h: legacyEval.tier === '27H',
      isCardProgress: legacyEval.isCardProgress,
    };
  };

  interface UserPortfolioAccumulator {
    substantiveSalesDeals: number;
    substantiveInternalTasks: number;
    assistedCollaboratorDeals: number;
    collaboratorActiveDeals: Set<string>;
    teammate27hAssistedCards: Set<string>;
    collaboratorWonDealsCount: number;
    verifiedProgressCardDays: Set<string>;
    ownProgressWorkdays: Set<string>;
    ownOutreachWorkdays: Set<string>;
    collabProgressWorkdays: Set<string>;
    teammateAssistWorkdays: Set<string>;
    executionWorkdays: Set<string>;
    missedOrStalledDueCount: number;
    progressedOwnedCards: Set<string>;
    progressedCollaboratorCards: Set<string>;
    multiStepProgressCardsCount: number;
    eligibleProgressCardsCount: number;
    individualLtcXp: number;
    individualLtcCardsCount: number;
    onTimeDueFulfillmentsCount: number;
    todosPerCard: Map<string, number>;
    rawTodosPerCard: Map<string, number>;
    completedTodosCount: number;
    fastAcceleratorRepliesCount: number;
    readyOwnedCardsCount: number;
    wonSalesDealsCount: number;
    salesRevenue: number;
    completedInternalTasksCount: number;
    onTimeCompletedInternalTasksCount: number;
    overdueOpenInternalTasksCount: number;
    healthyActiveProjectTasksCount: number;
    openTaskMilestoneCreditsCount: number;
    totalActivitiesCount: number;
    ltcCaredCards: CategoryCardHighlight[];
    progressedCards: CategoryCardHighlight[];
    assistedCards: CategoryCardHighlight[];
    outcomeCards: CategoryCardHighlight[];
  }

  const accByUser = new Map<string, UserPortfolioAccumulator>();
  for (const u of departmentUsers) {
    accByUser.set(u.id, {
      substantiveSalesDeals: 0,
      substantiveInternalTasks: 0,
      assistedCollaboratorDeals: 0,
      collaboratorActiveDeals: new Set<string>(),
      teammate27hAssistedCards: new Set<string>(),
      collaboratorWonDealsCount: 0,
      verifiedProgressCardDays: new Set<string>(),
      ownProgressWorkdays: new Set<string>(),
      ownOutreachWorkdays: new Set<string>(),
      collabProgressWorkdays: new Set<string>(),
      teammateAssistWorkdays: new Set<string>(),
      executionWorkdays: new Set<string>(),
      missedOrStalledDueCount: 0,
      progressedOwnedCards: new Set<string>(),
      progressedCollaboratorCards: new Set<string>(),
      multiStepProgressCardsCount: 0,
      eligibleProgressCardsCount: 0,
      individualLtcXp: 0,
      individualLtcCardsCount: 0,
      onTimeDueFulfillmentsCount: 0,
      todosPerCard: new Map<string, number>(),
      rawTodosPerCard: new Map<string, number>(),
      completedTodosCount: 0,
      fastAcceleratorRepliesCount: 0,
      readyOwnedCardsCount: 0,
      wonSalesDealsCount: 0,
      salesRevenue: 0,
      completedInternalTasksCount: 0,
      onTimeCompletedInternalTasksCount: 0,
      overdueOpenInternalTasksCount: 0,
      healthyActiveProjectTasksCount: 0,
      openTaskMilestoneCreditsCount: 0,
      totalActivitiesCount: 0,
      ltcCaredCards: [],
      progressedCards: [],
      assistedCards: [],
      outcomeCards: [],
    });
  }

  // Index card type & collaborator membership by opportunityId for fast activity classification
  const oppMetaById = new Map<
    string,
    { ownerId: string; isInternalTask: boolean; collaboratorIds: Set<string> }
  >();
  for (const opp of deptOpportunities) {
    oppMetaById.set(opp.id, {
      ownerId: opp.ownerId,
      isInternalTask: opp.type === 'INTERNAL_TASK',
      collaboratorIds: new Set(opp.teamMembers.map((tm) => tm.id)),
    });
  }

  // Completed To-Do Notes in [startDate, endDate) (capped at 2 per card for execution XP; >= 2 on teammate card grants Teamwork assist)
  for (const note of completedNotes) {
    const acc = accByUser.get(note.authorId);
    if (!acc) continue;
    const noteDayKey = toBangkokDayKey(note.updatedAt);
    const nextRawCount = (acc.rawTodosPerCard.get(note.opportunityId) ?? 0) + 1;
    acc.rawTodosPerCard.set(note.opportunityId, nextRawCount);

    const prevCardCount = acc.todosPerCard.get(note.opportunityId) ?? 0;
    if (prevCardCount < 2) {
      acc.completedTodosCount += 1;
      acc.todosPerCard.set(note.opportunityId, prevCardCount + 1);
      acc.executionWorkdays.add(noteDayKey);
    }
    const meta = oppMetaById.get(note.opportunityId);
    if (meta) {
      if (meta.ownerId === note.authorId) {
        acc.ownOutreachWorkdays.add(noteDayKey);
      } else {
        if (meta.collaboratorIds.has(note.authorId)) {
          acc.collaboratorActiveDeals.add(note.opportunityId);
        }
        if (nextRawCount >= 2) {
          acc.teammate27hAssistedCards.add(note.opportunityId);
          acc.teammateAssistWorkdays.add(noteDayKey);
        }
      }
    }
  }

  // Monthly Activity Logs (Verified Progress Card-Days, Fast Urgent Replies, Teammate +27h Assists)
  for (const act of monthlyActivities) {
    const acc = accByUser.get(act.userId);
    if (!acc) continue;
    acc.totalActivitiesCount += 1;
    const actDayKey = toBangkokDayKey(act.createdAt);

    const meta = oppMetaById.get(act.opportunityId);
    const isCardOwner = Boolean(meta && meta.ownerId === act.userId);
    const isNotCardOwner = Boolean(meta && meta.ownerId !== act.userId);
    const isTeammateCollaborator = Boolean(
      isNotCardOwner && meta!.collaboratorIds.has(act.userId)
    );

    const content = act.content || '';
    if (content.startsWith('[URGENT_ACK]')) {
      acc.fastAcceleratorRepliesCount += 1;
      acc.executionWorkdays.add(actDayKey);
      if (isTeammateCollaborator) {
        acc.collaboratorActiveDeals.add(act.opportunityId);
      }
      continue;
    }

    if (act.type !== 'COMMENT' || act.parentId !== null) {
      continue;
    }

    if (content.startsWith('[DUE DATE:')) {
      if (!content.startsWith('[DUE DATE: Removed]') && isTeammateCollaborator) {
        acc.collaboratorActiveDeals.add(act.opportunityId);
      }
      continue;
    }

    if (content.startsWith('[URGENT_')) {
      continue;
    }

    const signals = evaluateCommentSignals(content);

    if (signals.isNonZero && isTeammateCollaborator) {
      acc.collaboratorActiveDeals.add(act.opportunityId);
    }

    if (signals.isVerified27h && isNotCardOwner) {
      acc.teammate27hAssistedCards.add(act.opportunityId);
      acc.teammateAssistWorkdays.add(actDayKey);
    }

    if (signals.isVerified27h && isCardOwner) {
      if (signals.isCardProgress) {
        acc.ownProgressWorkdays.add(actDayKey);
      } else {
        acc.ownOutreachWorkdays.add(actDayKey);
      }
    }

    if (signals.isCardProgress) {
      acc.verifiedProgressCardDays.add(`${act.opportunityId}:${actDayKey}`);
      if (isNotCardOwner) {
        acc.collabProgressWorkdays.add(actDayKey);
      }
    }
  }

  // Evaluate Substance Gate, Due Date Timelines, LTC Care, Coverage, and Outcomes across deptOpportunities
  let departmentTotalRevenue = 0;

  for (const opp of deptOpportunities) {
    if (!matchesGlobalFilter(opp)) continue;

    const isInternalTask = opp.type === 'INTERNAL_TASK';
    const isLtcCard = opp.topic.trim().toUpperCase().startsWith('LTC-');
    const createdDate = new Date(opp.createdAt);
    const closeRefDate =
      opp.status !== 'OPEN' && opp.closedAt ? new Date(opp.closedAt) : asOfDate;

    const cardDto = opp as unknown as KanbanCardDTO;
    const effDueNow = opp.status === 'OPEN' ? resolveEffectiveDueDateAt(cardDto, asOfDate) : null;
    const timingNow =
      opp.status === 'OPEN'
        ? evaluateCardTimingState(
            { ...cardDto, dueDate: effDueNow },
            companyHolidays,
            leavesByUser,
            asOfDate,
            prebuiltOffDatesMap
          )
        : null;
    const isCurrentlyRed = timingNow?.isRed ?? false;

    const commentLogs = opp.activityLogs.filter((l) => l.type === 'COMMENT');
    const chronologicalLogs = [...commentLogs].reverse().map((l) => ({
      id: l.id,
      content: l.content,
      createdAt: l.createdAt,
      userId: l.userId,
    }));
    const ownerLeaves = leavesByUser.get(opp.ownerId);
    const dueTimeline = analyzeDueDateTimeline(chronologicalLogs, {
      companyHolidays,
      personalLeaves: ownerLeaves,
    });

    // Single pass over commentLogs to gather verified +27h & card progress timelines
    const lifetimeVerified27hDaysOnCard = new Set<string>();
    const lifetimeVerified27hHelpersOnCard = new Set<string>();
    const monthlyVerified27hDaysByUser = new Map<string, Set<string>>();
    const monthlyProgressTimestampsByUser = new Map<string, number[]>();
    const monthlyProgressDaysOnCard = new Set<string>();

    for (const log of commentLogs) {
      const logMs = new Date(log.createdAt).getTime();
      const logDayKey = toBangkokDayKey(log.createdAt);
      const isVerifiedProgressDueLog = dueTimeline.verifiedProgressDueLogIds.has(log.id);

      let isVerified27h = isVerifiedProgressDueLog;
      let isCardProgress = isVerifiedProgressDueLog;

      if (
        !isVerifiedProgressDueLog &&
        !log.content.startsWith('[DUE DATE:') &&
        !log.content.startsWith('[URGENT_')
      ) {
        const sig = evaluateCommentSignals(log.content);
        isVerified27h = sig.isVerified27h;
        isCardProgress = sig.isCardProgress;
      }

      if (isVerified27h && logMs <= closeRefDate.getTime()) {
        lifetimeVerified27hDaysOnCard.add(logDayKey);
        if (log.userId !== opp.ownerId) {
          lifetimeVerified27hHelpersOnCard.add(log.userId);
        }
      }

      if (logMs >= startMs && logMs < endMs) {
        if (isVerified27h) {
          let uSet = monthlyVerified27hDaysByUser.get(log.userId);
          if (!uSet) {
            uSet = new Set<string>();
            monthlyVerified27hDaysByUser.set(log.userId, uSet);
          }
          uSet.add(logDayKey);

          const logAcc = accByUser.get(log.userId);
          if (logAcc) {
            if (log.userId === opp.ownerId) {
              if (isCardProgress) {
                logAcc.ownProgressWorkdays.add(logDayKey);
              } else {
                logAcc.ownOutreachWorkdays.add(logDayKey);
              }
            } else {
              logAcc.teammate27hAssistedCards.add(opp.id);
              logAcc.teammateAssistWorkdays.add(logDayKey);
              if (isCardProgress) {
                logAcc.collabProgressWorkdays.add(logDayKey);
              }
            }
          }
        }

        if (isCardProgress) {
          monthlyProgressDaysOnCard.add(logDayKey);
          let tsList = monthlyProgressTimestampsByUser.get(log.userId);
          if (!tsList) {
            tsList = [];
            monthlyProgressTimestampsByUser.set(log.userId, tsList);
          }
          tsList.push(logMs);

          const logAcc = accByUser.get(log.userId);
          if (logAcc) {
            logAcc.verifiedProgressCardDays.add(`${opp.id}:${logDayKey}`);
            if (log.userId !== opp.ownerId) {
              logAcc.progressedCollaboratorCards.add(opp.id);
            }
          }
        }
      }
    }

    const lastFulfilledCreditMsByUser = new Map<string, number>();
    for (const ev of dueTimeline.onTimeFulfilledEvents) {
      const evMs = ev.fulfilledAt.getTime();
      if (evMs < startMs || evMs >= endMs || !ev.userId) continue;
      const evAcc = accByUser.get(ev.userId);
      if (!evAcc) continue;
      const prevMs = lastFulfilledCreditMsByUser.get(ev.userId) ?? 0;
      if (prevMs === 0 || evMs - prevMs >= 5 * 86_400_000) {
        evAcc.onTimeDueFulfillmentsCount += 1;
        evAcc.executionWorkdays.add(toBangkokDayKey(ev.fulfilledAt));
        lastFulfilledCreditMsByUser.set(ev.userId, evMs);
      }
    }

    const lastMissedDueMsByUser = new Map<string, number>();
    for (const ev of dueTimeline.lateOrStalledEvents) {
      const evMs = ev.eventAt.getTime();
      if (evMs < startMs || evMs >= endMs) continue;
      const targetUid = ev.userId || opp.ownerId;
      const evAcc = accByUser.get(targetUid);
      if (!evAcc) continue;
      const prevMs = lastMissedDueMsByUser.get(targetUid) ?? 0;
      if (prevMs === 0 || evMs - prevMs >= 3 * 86_400_000) {
        evAcc.missedOrStalledDueCount += 1;
        lastMissedDueMsByUser.set(targetUid, evMs);
      }
    }
    if (opp.status === 'OPEN' && isCurrentlyRed && effDueNow !== null) {
      const dueSched = resolveDueDateSchedule(effDueNow, companyHolidays, ownerLeaves);
      if (asOfDate.getTime() >= dueSched.redStart.getTime() && !lastMissedDueMsByUser.has(opp.ownerId)) {
        const oAcc = accByUser.get(opp.ownerId);
        if (oAcc) {
          oAcc.missedOrStalledDueCount += 1;
        }
      }
    }

    const hasMeaningfulComment = commentLogs.some((log) => {
      if (dueTimeline.verifiedProgressDueLogIds.has(log.id)) return true;
      if (log.content.startsWith('[DUE DATE:') || log.content.startsWith('[URGENT_')) {
        return false;
      }
      return evaluateCommentSignals(log.content).isNonZero;
    });
    const hasCompletedNote = (opp._count?.notes ?? 0) > 0;
    const hasQuotation = (opp._count?.quotations ?? 0) > 0 || opp.quotedAt !== null;
    const isWonWithValue = opp.status === 'WON' && (opp.value ?? 0) > 0;

    let passesSubstanceGate =
      hasMeaningfulComment || hasCompletedNote || hasQuotation || isWonWithValue;
    if (!passesSubstanceGate && closeRefDate.getTime() > createdDate.getTime()) {
      const lifespanMs = calculateElapsedWorkingMs(
        createdDate,
        closeRefDate,
        companyHolidays,
        {
          ceilingMs: 0,
          stopAtMs: SUBSTANCE_MIN_WORKING_MS,
          personalLeaves: leavesByUser.get(opp.ownerId),
        }
      );
      passesSubstanceGate = lifespanMs >= SUBSTANCE_MIN_WORKING_MS;
    }

    const closedMs = opp.closedAt ? new Date(opp.closedAt).getTime() : null;
    const readyMs = opp.goodsReadyDate ? new Date(opp.goodsReadyDate).getTime() : null;
    const loadingMs = opp.goodsLoadingDate ? new Date(opp.goodsLoadingDate).getTime() : null;

    const isWonInPeriod =
      opp.status === 'WON' &&
      (loadingMs !== null
        ? loadingMs >= startMs && loadingMs < endMs
        : closedMs !== null && closedMs >= startMs && closedMs < endMs);

    const isTaskCompletedInPeriod =
      isInternalTask &&
      (opp.status === 'WON' || opp.status === 'COMPLETED') &&
      closedMs !== null &&
      closedMs >= startMs &&
      closedMs < endMs;

    const oppCompanyName = opp.company?.displayName || opp.company?.name || undefined;

    // Teammate +27h / To-Do assist highlights (recorded once per card per active helper)
    for (const uid of monthlyVerified27hDaysByUser.keys()) {
      if (uid === opp.ownerId) continue;
      const helperAcc = accByUser.get(uid);
      const assistDayCnt = monthlyVerified27hDaysByUser.get(uid)?.size ?? 1;
      if (helperAcc && helperAcc.assistedCards.length < 12) {
        helperAcc.assistedCards.push({
          dealId: opp.id,
          topic: opp.topic,
          companyName: oppCompanyName,
          badgeText: `${assistDayCnt}d +27h Assist`,
          tone: 'emerald',
        });
      }
    }

    // 2-Step Individual LTC Care (up to +2.0 XP per distinct LTC-* card, Max 8.0 XP)
    if (hasSalesAccess && isLtcCard) {
      const ltcCandidateUsers = new Set<string>(monthlyVerified27hDaysByUser.keys());
      if (isWonInPeriod && passesSubstanceGate) {
        ltcCandidateUsers.add(opp.ownerId);
      }
      for (const uid of ltcCandidateUsers) {
        const uAcc = accByUser.get(uid);
        if (!uAcc) continue;
        const user27hDays = monthlyVerified27hDaysByUser.get(uid)?.size ?? 0;
        const userProgUpdates = monthlyProgressTimestampsByUser.get(uid)?.length ?? 0;
        const earnedStep1 =
          user27hDays >= 1 || (uid === opp.ownerId && isWonInPeriod && passesSubstanceGate);
        if (!earnedStep1) continue;

        const earnedStep2 =
          userProgUpdates >= 1 ||
          opp.status === 'WON' ||
          (opp.status === 'OPEN' &&
            !isCurrentlyRed &&
            (effDueNow !== null || lifetimeVerified27hDaysOnCard.size >= 2)) ||
          (opp.status === 'LOST' && lifetimeVerified27hDaysOnCard.size >= 2);

        uAcc.individualLtcCardsCount += 1;
        uAcc.individualLtcXp = Math.min(8, uAcc.individualLtcXp + (earnedStep2 ? 2.0 : 1.0));
        if (uAcc.ltcCaredCards.length < 12) {
          uAcc.ltcCaredCards.push({
            dealId: opp.id,
            topic: opp.topic,
            companyName: oppCompanyName,
            badgeText: earnedStep2 ? '+2 XP (Progress)' : '+1 XP (Outreach)',
            tone: earnedStep2 ? 'lime' : 'sky',
          });
        }
      }
    }

    // Owner portfolio, Real Progress Volume & Coverage, and Outcomes
    const ownerAcc = accByUser.get(opp.ownerId);
    if (ownerAcc && passesSubstanceGate) {
      if (isInternalTask) {
        ownerAcc.substantiveInternalTasks += 1;
        const hasStructuredTaskSchedule =
          opp.dueDate !== null ||
          hasCompletedNote ||
          dueTimeline.onTimeFulfilledEvents.length > 0 ||
          opp.activityLogs.some(
            (l) => l.content.startsWith('[DUE DATE:') && !l.content.startsWith('[DUE DATE: Removed]')
          );
        if (hasStructuredTaskSchedule) {
          ownerAcc.readyOwnedCardsCount += 1;
        }
      } else {
        ownerAcc.substantiveSalesDeals += 1;
        const hasSalesReadiness =
          (opp.value ?? 0) > 0 || opp.goodsReadyDate !== null || opp.goodsLoadingDate !== null;
        if (hasSalesReadiness) {
          ownerAcc.readyOwnedCardsCount += 1;
        }
      }

      const quotedMs = opp.quotedAt ? new Date(opp.quotedAt).getTime() : null;
      if (quotedMs !== null && quotedMs >= startMs && quotedMs < endMs && opp.quotedAt) {
        ownerAcc.ownProgressWorkdays.add(toBangkokDayKey(opp.quotedAt));
      }
      if (isWonInPeriod || isTaskCompletedInPeriod) {
        const winDate = opp.goodsLoadingDate || opp.closedAt;
        if (winDate) {
          ownerAcc.ownProgressWorkdays.add(toBangkokDayKey(winDate));
        }
      }

      const ownerTodosOnCard = ownerAcc.todosPerCard.get(opp.id) ?? 0;
      const owner27hDaysOnCard = monthlyVerified27hDaysByUser.get(opp.ownerId)?.size ?? 0;
      const hasGenuineCardProgress =
        monthlyProgressDaysOnCard.size >= 1 ||
        isWonInPeriod ||
        isTaskCompletedInPeriod ||
        (isInternalTask && ownerTodosOnCard >= 1 && owner27hDaysOnCard >= 1);

      if (hasGenuineCardProgress) {
        ownerAcc.progressedOwnedCards.add(opp.id);
        ownerAcc.eligibleProgressCardsCount += 1;

        let isMultiStep = false;
        const allProgTsOnCard: number[] = [];
        for (const tsList of monthlyProgressTimestampsByUser.values()) {
          allProgTsOnCard.push(...tsList);
        }
        if (allProgTsOnCard.length >= 2) {
          const minTs = Math.min(...allProgTsOnCard);
          const maxTs = Math.max(...allProgTsOnCard);
          if (maxTs - minTs >= 5 * 86_400_000) {
            ownerAcc.multiStepProgressCardsCount += 1;
            isMultiStep = true;
          }
        }
        if (ownerAcc.progressedCards.length < 15) {
          ownerAcc.progressedCards.push({
            dealId: opp.id,
            topic: opp.topic,
            companyName: oppCompanyName,
            badgeText: isMultiStep ? 'Multi-Step ★' : 'Progress ★',
            tone: 'lime',
          });
        }
      } else {
        // Fair Hold Exemptions for All-Card Progress Coverage denominator
        const ageWorkingMs =
          asOfDate.getTime() > createdDate.getTime()
            ? calculateElapsedWorkingMs(createdDate, asOfDate, companyHolidays, {
                ceilingMs: 0,
                stopAtMs: 27 * 3600 * 1000,
                personalLeaves: leavesByUser.get(opp.ownerId),
              })
            : 0;
        const isBrandNewCard = opp.status === 'OPEN' && ageWorkingMs < 27 * 3600 * 1000;
        const isShippingOrFactoryHold =
          opp.status === 'OPEN' &&
          !isCurrentlyRed &&
          ((readyMs !== null && readyMs > asOfDate.getTime()) ||
            (loadingMs !== null && loadingMs > asOfDate.getTime()));
        const isFutureMonthScheduledHold =
          opp.status === 'OPEN' &&
          !isCurrentlyRed &&
          effDueNow !== null &&
          effDueNow.getTime() >= endMs;

        if (!isBrandNewCard && !isShippingOrFactoryHold && !isFutureMonthScheduledHold) {
          ownerAcc.eligibleProgressCardsCount += 1;
        }
      }

      if (!isInternalTask && isWonInPeriod) {
        const rev = opp.value || 0;
        ownerAcc.wonSalesDealsCount += 1;
        ownerAcc.salesRevenue += rev;
        departmentTotalRevenue += rev;
        if (ownerAcc.outcomeCards.length < 15) {
          ownerAcc.outcomeCards.push({
            dealId: opp.id,
            topic: opp.topic,
            companyName: oppCompanyName,
            badgeText: 'Won Deal (+5)',
            tone: 'lime',
            value: rev > 0 ? rev : undefined,
          });
        }
      }

      if (isInternalTask) {
        if (isTaskCompletedInPeriod && closedMs !== null) {
          ownerAcc.completedInternalTasksCount += 1;
          const closedAtDate = new Date(closedMs);
          const effDueAtClose = resolveEffectiveDueDateAt(cardDto, closedAtDate);
          let completedOnTime = true;
          if (effDueAtClose) {
            const closeSchedule = resolveDueDateSchedule(
              effDueAtClose,
              companyHolidays,
              ownerLeaves
            );
            completedOnTime = closedMs <= closeSchedule.yellowEnd.getTime();
          } else {
            const openSnapshot: KanbanCardDTO = {
              ...cardDto,
              status: 'OPEN',
              closedAt: null,
              dueDate: null,
            };
            completedOnTime = !checkIsRedCard(
              openSnapshot,
              companyHolidays,
              leavesByUser,
              closedAtDate,
              prebuiltOffDatesMap
            );
          }
          if (completedOnTime) {
            ownerAcc.onTimeCompletedInternalTasksCount += 1;
          }
          if (ownerAcc.outcomeCards.length < 15) {
            ownerAcc.outcomeCards.push({
              dealId: opp.id,
              topic: opp.topic,
              companyName: oppCompanyName,
              badgeText: completedOnTime ? 'On-Time SLA' : 'Completed (Late)',
              tone: completedOnTime ? 'emerald' : 'amber',
            });
          }
        } else if (opp.status === 'OPEN') {
          if (isCurrentlyRed) {
            const overdueRedMs = timingNow?.threshold
              ? calculateElapsedWorkingMs(timingNow.threshold, asOfDate, companyHolidays, {
                  ceilingMs: 0,
                  personalLeaves: ownerLeaves,
                })
              : 0;
            // Only penalize Pillar 4 Open Task SLA once an open task is neglected in Red for >= 27 working hours (3+ full workdays),
            // preventing quadruple Day-1 punishment across Card Health + Discipline + Execution + Task SLA.
            if (overdueRedMs >= RED_CARD_WORKING_MS_THRESHOLD) {
              ownerAcc.overdueOpenInternalTasksCount += 1;
              if (ownerAcc.outcomeCards.length < 15) {
                ownerAcc.outcomeCards.push({
                  dealId: opp.id,
                  topic: opp.topic,
                  companyName: oppCompanyName,
                  badgeText: 'Neglected 3d+ (Hurts SLA)',
                  tone: 'rose',
                });
              }
            }
          } else {
            const openTaskMilestones = monthlyProgressDaysOnCard.size + ownerTodosOnCard;
            if (openTaskMilestones >= 1) {
              ownerAcc.healthyActiveProjectTasksCount += 1;
              ownerAcc.openTaskMilestoneCreditsCount += Math.min(3, openTaskMilestones);
              if (ownerAcc.outcomeCards.length < 15) {
                ownerAcc.outcomeCards.push({
                  dealId: opp.id,
                  topic: opp.topic,
                  companyName: oppCompanyName,
                  badgeText: `Active Project (${Math.min(3, openTaskMilestones)} Milestones)`,
                  tone: 'sky',
                });
              }
            }
          }
        }
      }
    }

    // Active Contributor Collaborator Portfolio & Outcomes (passive `opp.teamMembers` earn 0 credit)
    if (passesSubstanceGate) {
      const activeMonthlyHelpers = new Set<string>();
      for (const uid of monthlyVerified27hDaysByUser.keys()) {
        if (uid !== opp.ownerId) activeMonthlyHelpers.add(uid);
      }
      for (const [uid, uAcc] of accByUser.entries()) {
        if (uid !== opp.ownerId && (uAcc.rawTodosPerCard.get(opp.id) ?? 0) >= 2) {
          activeMonthlyHelpers.add(uid);
          if (
            !monthlyVerified27hDaysByUser.has(uid) &&
            uAcc.assistedCards.length < 12
          ) {
            uAcc.assistedCards.push({
              dealId: opp.id,
              topic: opp.topic,
              companyName: oppCompanyName,
              badgeText: `${uAcc.rawTodosPerCard.get(opp.id)} To-Do Assist`,
              tone: 'emerald',
            });
          }
        }
      }

      for (const uid of activeMonthlyHelpers) {
        const collabAcc = accByUser.get(uid);
        if (collabAcc) {
          collabAcc.assistedCollaboratorDeals += 1;
        }
      }

      if (isWonInPeriod || isTaskCompletedInPeriod) {
        const activeWinHelpers = new Set<string>(lifetimeVerified27hHelpersOnCard);
        for (const uid of activeMonthlyHelpers) {
          activeWinHelpers.add(uid);
        }
        for (const uid of activeWinHelpers) {
          if (uid === opp.ownerId) continue;
          const collabAcc = accByUser.get(uid);
          if (!collabAcc) continue;
          collabAcc.collaboratorWonDealsCount += 1;
          if (collabAcc.outcomeCards.length < 15) {
            collabAcc.outcomeCards.push({
              dealId: opp.id,
              topic: opp.topic,
              companyName: oppCompanyName,
              badgeText: 'Assist Win (+2)',
              tone: 'sky',
              value: !isInternalTask && (opp.value ?? 0) > 0 ? opp.value! : undefined,
            });
          }
        }
      }
    }
  }

  // 7. Compute Unified v2.3 100 XP Breakdown ONCE per user
  const breakdownByUser = new Map<string, LeaderboardScoreBreakdown>();

  for (const u of departmentUsers) {
    const summary = dailySamplingMap.get(u.id);
    const acc = accByUser.get(u.id)!;
    const activeCardsCount = summary?.currentActiveCards ?? 0;
    const redCardsCount = summary?.currentRedCards ?? 0;
    const hasMonthlyCardExposure = activeCardsCount > 0 || (summary?.totalCardHours ?? 0) > 0;
    const elapsedWorkingDays = Math.max(
      1,
      summary?.totalWorkingDays ?? ltcDailySummary?.totalWorkingDays ?? 1
    );

    const totalOwnedSubstantive = acc.substantiveSalesDeals + acc.substantiveInternalTasks;
    const isPureCollaborator = totalOwnedSubstantive === 0 && acc.teammate27hAssistedCards.size > 0;

    const collaboratorAssistedRedRate = 0;
    const assistedCleanCount = acc.teammate27hAssistedCards.size;

    const effectiveProgressedCards = isPureCollaborator
      ? acc.progressedCollaboratorCards.size
      : acc.progressedOwnedCards.size;
    const effectiveEligibleCards = isPureCollaborator
      ? Math.max(acc.progressedCollaboratorCards.size, acc.teammate27hAssistedCards.size)
      : acc.eligibleProgressCardsCount;
    const effectiveWorkedCards = isPureCollaborator
      ? Math.round(acc.teammate27hAssistedCards.size * 0.5)
      : Math.max(activeCardsCount, totalOwnedSubstantive);

    let avgDailyCleanCards = 0;
    if (summary && summary.totalWorkingDays > 0 && hasMonthlyCardExposure) {
      let sumCleanCards = 0;
      for (const rec of summary.dailyRecords) {
        if (!rec.isOffDay) {
          sumCleanCards += rec.cleanCardsCount;
        }
      }
      avgDailyCleanCards = Math.round((sumCleanCards / summary.totalWorkingDays) * 10) / 10;
    } else if (isPureCollaborator) {
      avgDailyCleanCards = Math.round(assistedCleanCount * 0.5 * 10) / 10;
    }

    const effectiveProgressDaySet = isPureCollaborator
      ? acc.collabProgressWorkdays
      : acc.ownProgressWorkdays;
    const effectiveOutreachSourceSet = isPureCollaborator
      ? acc.teammateAssistWorkdays
      : acc.ownOutreachWorkdays;
    let outreachOnlyWorkdaysCount = 0;
    for (const d of effectiveOutreachSourceSet) {
      if (!effectiveProgressDaySet.has(d)) {
        outreachOnlyWorkdaysCount += 1;
      }
    }

    const breakdown = calculateUnifiedPortfolioBreakdown({
      redRate: summary?.avgMonthlyRedRate ?? 0,
      activeCardsCount,
      redCardsCount,
      redHours: summary?.totalRedHours ?? 0,
      hasMonthlyCardExposure,
      collaboratorAssisted27hCardsCount: acc.teammate27hAssistedCards.size,
      collaboratorAssistedRedRate,
      cleanDaysCount: summary?.cleanDaysCount ?? 0,
      graceDaysCount: summary?.graceDaysCount ?? 0,
      individualLtcXp: acc.individualLtcXp,
      individualLtcCardsCount: acc.individualLtcCardsCount,
      teamZeroLtcXp,
      hasSalesAccess,
      substantiveSalesDeals: acc.substantiveSalesDeals,
      substantiveInternalTasks: acc.substantiveInternalTasks,
      assistedCollaboratorDeals: Math.max(
        acc.assistedCollaboratorDeals,
        acc.teammate27hAssistedCards.size
      ),
      elapsedWorkingDays,
      progressWorkdaysCount: effectiveProgressDaySet.size,
      outreachWorkdaysCount: outreachOnlyWorkdaysCount,
      progressedCardsCount: effectiveProgressedCards,
      multiStepProgressCardsCount: acc.multiStepProgressCardsCount,
      eligibleProgressCardsCount: effectiveEligibleCards,
      teammate27hAssistedCardsCount: acc.teammate27hAssistedCards.size,
      teammateAssistWorkdaysCount: acc.teammateAssistWorkdays.size,
      avgDailyCleanCards,
      workedActiveCardsCount: effectiveWorkedCards,
      verifiedProgressCardDaysCount: acc.verifiedProgressCardDays.size,
      onTimeDueFulfillmentsCount: acc.onTimeDueFulfillmentsCount,
      executionWorkdaysCount: acc.executionWorkdays.size,
      missedOrStalledDueCount: acc.missedOrStalledDueCount,
      fastAcceleratorRepliesCount: acc.fastAcceleratorRepliesCount,
      completedTodosCount: acc.completedTodosCount,
      collaboratorActiveDealsCount: acc.collaboratorActiveDeals.size,
      readyOwnedCardsCount: acc.readyOwnedCardsCount,
      wonSalesDealsCount: acc.wonSalesDealsCount,
      salesRevenue: acc.salesRevenue,
      departmentTotalRevenue,
      completedInternalTasksCount: acc.completedInternalTasksCount,
      onTimeCompletedInternalTasksCount: acc.onTimeCompletedInternalTasksCount,
      overdueOpenInternalTasksCount: acc.overdueOpenInternalTasksCount,
      healthyActiveProjectTasksCount: acc.healthyActiveProjectTasksCount,
      openTaskMilestoneCreditsCount: acc.openTaskMilestoneCreditsCount,
      collaboratorWonDealsCount: acc.collaboratorWonDealsCount,
      totalActivitiesCount: acc.totalActivitiesCount,
    });

    breakdownByUser.set(u.id, breakdown);
  }

  // 8. Build the 4 Unified Category Leaderboards + Overall 100 XP Ranking
  const detailsByUser = new Map<string, UserCategoryDrilldownDetails>();
  for (const u of departmentUsers) {
    const acc = accByUser.get(u.id)!;
    detailsByUser.set(u.id, {
      ltcCaredCards: acc.ltcCaredCards,
      progressedCards: acc.progressedCards,
      assistedCards: acc.assistedCards,
      outcomeCards: acc.outcomeCards,
    });
  }

  const cardHealthRaw = departmentUsers.map((u) => {
    const breakdown = breakdownByUser.get(u.id)!;
    const summary = dailySamplingMap.get(u.id);
    const rate = breakdown.redRate ?? summary?.avgMonthlyRedRate ?? 0;
    const formattedValue = `${rate.toFixed(rate % 1 === 0 ? 0 : 1)}%`;

    return {
      userId: u.id,
      name: u.name || 'Team Member',
      image: u.image,
      score: breakdown.cardHealthTotalXp,
      formattedValue,
      unit: '%',
      healthTier: breakdown.healthTier,
      breakdown,
      dailyHealthSummary: summary,
      dailyLtcSummary: ltcDailySummary,
      categoryDetails: detailsByUser.get(u.id),
      isCurrentUser: false,
    };
  });

  const cleanLtcRaw = departmentUsers.map((u) => {
    const breakdown = breakdownByUser.get(u.id)!;
    const summary = dailySamplingMap.get(u.id);
    const score = breakdown.disciplineTotalXp ?? breakdown.cleanBonusXp;

    return {
      userId: u.id,
      name: u.name || 'Team Member',
      image: u.image,
      score,
      formattedValue: `${formatScoreValue(score, 'xp')} XP`,
      unit: 'XP',
      breakdown,
      dailyHealthSummary: summary,
      dailyLtcSummary: ltcDailySummary,
      categoryDetails: detailsByUser.get(u.id),
      isCurrentUser: false,
    };
  });

  const velocityRaw = departmentUsers.map((u) => {
    const breakdown = breakdownByUser.get(u.id)!;
    const summary = dailySamplingMap.get(u.id);
    const score = breakdown.velocityXp ?? 0;

    return {
      userId: u.id,
      name: u.name || 'Team Member',
      image: u.image,
      score,
      formattedValue: `${formatScoreValue(score, 'xp')} XP`,
      unit: 'XP',
      breakdown,
      dailyHealthSummary: summary,
      dailyLtcSummary: ltcDailySummary,
      categoryDetails: detailsByUser.get(u.id),
      isCurrentUser: false,
    };
  });

  const outcomeRaw = departmentUsers.map((u) => {
    const breakdown = breakdownByUser.get(u.id)!;
    const summary = dailySamplingMap.get(u.id);
    const score = breakdown.outcomeXp ?? 0;

    return {
      userId: u.id,
      name: u.name || 'Team Member',
      image: u.image,
      score,
      formattedValue: `${formatScoreValue(score, 'xp')} XP`,
      unit: 'XP',
      breakdown,
      dailyHealthSummary: summary,
      dailyLtcSummary: ltcDailySummary,
      categoryDetails: detailsByUser.get(u.id),
      isCurrentUser: false,
    };
  });

  const xpRaw = departmentUsers.map((u) => {
    const breakdown = breakdownByUser.get(u.id)!;
    const summary = dailySamplingMap.get(u.id);

    return {
      userId: u.id,
      name: u.name || 'Team Member',
      image: u.image,
      score: breakdown.totalXp,
      formattedValue: `${formatScoreValue(breakdown.totalXp, 'xp')} XP`,
      unit: 'XP',
      healthTier: breakdown.healthTier,
      breakdown,
      dailyHealthSummary: summary,
      dailyLtcSummary: ltcDailySummary,
      categoryDetails: detailsByUser.get(u.id),
      isCurrentUser: false,
    };
  });

  const rankedCardHealth = [...cardHealthRaw]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aRed = a.dailyHealthSummary?.avgMonthlyRedRate ?? 100;
      const bRed = b.dailyHealthSummary?.avgMonthlyRedRate ?? 100;
      const aHasCards =
        (a.dailyHealthSummary?.currentActiveCards ?? 0) > 0 ||
        (a.dailyHealthSummary?.totalCardHours ?? 0) > 0;
      const bHasCards =
        (b.dailyHealthSummary?.currentActiveCards ?? 0) > 0 ||
        (b.dailyHealthSummary?.totalCardHours ?? 0) > 0;
      if (aHasCards && !bHasCards) return -1;
      if (bHasCards && !aHasCards) return 1;
      if (aRed !== bRed) return aRed - bRed;
      return a.name.localeCompare(b.name);
    })
    .map((item, index) => ({
      ...item,
      rank: index + 1,
    }));

  const rankedCleanLtc = [...cleanLtcRaw]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aClean = a.dailyHealthSummary?.cleanDaysCount ?? 0;
      const bClean = b.dailyHealthSummary?.cleanDaysCount ?? 0;
      if (bClean !== aClean) return bClean - aClean;
      const aRed = a.dailyHealthSummary?.avgMonthlyRedRate ?? 100;
      const bRed = b.dailyHealthSummary?.avgMonthlyRedRate ?? 100;
      if (aRed !== bRed) return aRed - bRed;
      return a.name.localeCompare(b.name);
    })
    .map((item, index) => ({
      ...item,
      rank: index + 1,
    }));

  const rankedVelocity = rankItems(velocityRaw);
  const rankedOutcome = rankItems(outcomeRaw);
  const rankedXp = [...xpRaw]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aOutcome = a.breakdown?.outcomeXp ?? 0;
      const bOutcome = b.breakdown?.outcomeXp ?? 0;
      if (bOutcome !== aOutcome) return bOutcome - aOutcome;
      const aRed = a.dailyHealthSummary?.avgMonthlyRedRate ?? 100;
      const bRed = b.dailyHealthSummary?.avgMonthlyRedRate ?? 100;
      if (aRed !== bRed) return aRed - bRed;
      const aHours = a.dailyHealthSummary?.totalCardHours ?? 0;
      const bHours = b.dailyHealthSummary?.totalCardHours ?? 0;
      if (bHours !== aHours) return bHours - aHours;
      return a.name.localeCompare(b.name);
    })
    .map((item, index) => ({
      ...item,
      rank: index + 1,
    }));

  const categories: LeaderboardCategoryData[] = [
    {
      id: 'card_health',
      label: 'Card Health',
      iconName: 'ShieldCheck',
      unit: 'Max 30 XP',
      description: 'Continuous Red Rate curve across all owned cards (≤ 5% target)',
      items: rankedCardHealth,
    },
    {
      id: 'clean_ltc',
      label: hasSalesAccess ? 'Discipline & LTC' : 'Clean Discipline',
      iconName: 'Sparkles',
      unit: 'Max 20 XP',
      description: hasSalesAccess
        ? 'Clean workdays & Shield (10 XP) + Individual 2-Step LTC Care (8 XP) + Team Zero-LTC (2 XP)'
        : '+1.0 XP per 100% clean workday (+0.5 XP Shield on 15+ cards) up to 20 XP',
      items: rankedCleanLtc,
    },
    {
      id: 'velocity',
      label: 'Velocity & Teamwork',
      iconName: 'Zap',
      unit: 'Max 25 XP',
      description: 'Daily Progress & Coverage (12) + Consistent Assist Days (6) + Clean Load & On-Time Rate (7)',
      items: rankedVelocity,
    },
    {
      id: 'outcome',
      label: 'Outcome',
      iconName: 'Trophy',
      unit: 'Max 25 XP',
      description: 'Active Owner Sales/Task Results + Active Helper Co-Close Bonus (passive members = 0 XP)',
      items: rankedOutcome,
    },
  ];

  const baseData: DepartmentLeaderboardData = {
    departmentId: targetDept.id,
    departmentName: targetDept.name,
    hasSalesAccess,
    availableDepartments: [],
    period: { month, year },
    overallPodium: buildPodium(rankedXp, 'xp', 'Overall MVP'),
    overallXpItems: rankedXp,
    categories,
  };

  leaderboardMemoryCache.set(deptCacheKey, {
    data: baseData,
    expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS,
  });

  return personalizeLeaderboardForActor(baseData, actor.id, availableDepartments, actor.role);
}
