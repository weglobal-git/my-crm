"use server";

import prisma from "@/lib/prisma";
import { requirePipelineActor, notifyPipelineAudience, type PipelineActor } from "@/lib/pipeline-security";
import { pusherServer } from "@/lib/pusher-server";
import { dispatchDashboardInvalidation } from "@/lib/dashboard/dashboard-realtime-server";
import { formatLtcDuration } from "@/lib/business-days";
import { createOpportunity } from "@/lib/actions/opportunity";
import { 
  LtcAccountItem, 
  LtcMonthlySale, 
  LtcSummaryResult, 
  LtcTier 
} from "@/components/pipeline/ltc/ltc-types";
import { 
  formatLtcDealTopic, 
  determineLtcTier, 
  formatMonthYear,
  calculateDaysSinceContact
} from "@/lib/ltc-utils";

/**
 * Fetch all Qualified Customer accounts that meet LTC threshold criteria
 */
export async function getLtcAccountsAction(): Promise<LtcSummaryResult> {
  await requirePipelineActor();

  const now = new Date();

  // Query Qualified Customer accounts that DO NOT have an open opportunity in pipeline
  const companies = await prisma.company.findMany({
    where: {
      type: 'CUSTOMER',
      status: 'QUALIFIED',
      opportunities: {
        none: {
          status: 'OPEN',
        },
      },
    },
    select: {
      id: true,
      name: true,
      displayName: true,
      phone: true,
      email: true,
      address: true,
      country: true,
      starRating: true,
      createdAt: true,
      contacts: {
        select: {
          id: true,
          name: true,
          role: true,
          email: true,
          phone: true,
          contactDepartment: true,
          isActive: true,
        },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      },
      opportunities: {
        select: {
          id: true,
          topic: true,
          value: true,
          status: true,
          closedAt: true,
          goodsLoadingDate: true,
          createdAt: true,
          updatedAt: true,
          activityLogs: {
            select: { createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  const qualifiedLtcAccounts: LtcAccountItem[] = [];

  for (const comp of companies) {
    // 1. Calculate sales metrics from WON/COMPLETED deals
    const wonDeals = comp.opportunities.filter(
      (o) => o.status === 'WON' || (o.status as string) === 'COMPLETED'
    );
    const totalWonAmount = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);
    const purchaseCount = wonDeals.length;

    // 2. Determine Tier & Threshold
    const { tier, thresholdDays } = determineLtcTier(totalWonAmount, purchaseCount);

    // 3. Find latest interaction date across customer ActivityLogs and Opportunities
    // (Excludes administrative database audit logs like CompanyLog which track status/address edits)
    let latestInteractionTime = comp.createdAt.getTime();
    let source: 'ACTIVITY' | 'DEAL' | 'COMPANY_LOG' | 'CREATED_AT' = 'CREATED_AT';

    // Check opportunity activities (real customer interactions)
    for (const opp of comp.opportunities) {
      if (opp.activityLogs.length > 0) {
        const actTime = opp.activityLogs[0].createdAt.getTime();
        if (actTime > latestInteractionTime) {
          latestInteractionTime = actTime;
          source = 'ACTIVITY';
        }
      } else {
        const oppMilestoneTime = Math.max(
          opp.closedAt ? opp.closedAt.getTime() : 0,
          opp.goodsLoadingDate ? opp.goodsLoadingDate.getTime() : 0,
          opp.createdAt.getTime()
        );
        if (oppMilestoneTime > latestInteractionTime) {
          latestInteractionTime = oppMilestoneTime;
          source = 'DEAL';
        }
      }
    }

    const daysSinceLastContact = calculateDaysSinceContact(latestInteractionTime, now);

    // Check if account meets or exceeds threshold days
    if (daysSinceLastContact >= thresholdDays) {
      // 4. Aggregate monthly sales history
      const monthlyMap = new Map<string, { amount: number; count: number; titles: string[] }>();
      for (const deal of wonDeals) {
        const dealDate = deal.closedAt || deal.goodsLoadingDate || deal.createdAt;
        const key = formatMonthYear(new Date(dealDate));
        const current = monthlyMap.get(key) || { amount: 0, count: 0, titles: [] };
        current.amount += deal.value || 0;
        current.count += 1;
        if (deal.topic && !current.titles.includes(deal.topic)) {
          current.titles.push(deal.topic);
        }
        monthlyMap.set(key, current);
      }

      // Convert to array and sort chronologically descending
      const salesHistory: LtcMonthlySale[] = Array.from(monthlyMap.entries())
        .map(([monthYear, data]) => ({
          monthYear,
          amount: data.amount,
          dealCount: data.count,
          dealTitles: data.titles,
        }))
        .sort((a, b) => {
          const [mA, yA] = a.monthYear.split('/').map(Number);
          const [mB, yB] = b.monthYear.split('/').map(Number);
          return yB !== yA ? yB - yA : mB - mA;
        });

      qualifiedLtcAccounts.push({
        id: comp.id,
        name: comp.name,
        displayName: comp.displayName,
        phone: comp.phone,
        email: comp.email,
        address: comp.address,
        country: comp.country,
        starRating: comp.starRating,
        tier,
        thresholdDays,
        daysSinceLastContact,
        formattedDuration: formatLtcDuration(daysSinceLastContact),
        lastInteractionDate: new Date(latestInteractionTime).toISOString(),
        lastInteractionSource: source,
        totalWonAmount,
        purchaseCount,
        contacts: comp.contacts,
        salesHistory,
      });
    }
  }

  // 5. Sort: Tier 1 > Tier 2 > Tier 3, then by daysSinceLastContact desc
  const tierWeight: Record<LtcTier, number> = {
    TIER_1: 1,
    TIER_2: 2,
    TIER_3: 3,
  };

  qualifiedLtcAccounts.sort((a, b) => {
    const diffTier = tierWeight[a.tier] - tierWeight[b.tier];
    if (diffTier !== 0) return diffTier;
    return b.daysSinceLastContact - a.daysSinceLastContact;
  });

  return {
    totalCount: qualifiedLtcAccounts.length,
    accounts: qualifiedLtcAccounts,
  };
}

/**
 * Lightweight action to get just the LTC count for badges
 */
export async function getLtcCountAction(): Promise<number> {
  const result = await getLtcAccountsAction();
  return result.totalCount;
}

/**
 * Unqualify an account so it exits the LTC loop
 */
export async function unqualifyAccountAction(
  companyId: string
): Promise<{ success: boolean }> {
  const actor = await requirePipelineActor();

  await prisma.company.update({
    where: { id: companyId },
    data: { status: 'UNQUALIFIED' },
  });

  // Log the disqualification
  await prisma.companyLog.create({
    data: {
      companyId,
      userId: actor.id,
      action: 'UPDATE',
      fieldName: 'status',
      oldValue: 'QUALIFIED',
      newValue: 'UNQUALIFIED',
      summary: 'Disqualified from Long-Time Contact (LTC) list',
    },
  }).catch((err) => console.warn('[unqualifyAccountAction] companyLog warning:', err));

  // Broadcast realtime updates across Pipeline, Dashboard, and Contacts
  void notifyPipelineAudience({
    action: 'LTC_UPDATED',
    companyId,
  });
  void dispatchDashboardInvalidation({
    resources: ['leaderboard', 'summary'],
    companyIds: [companyId],
  });
  void pusherServer.trigger('private-contacts', 'account-updated', {
    action: 'STATUS_CHANGE',
    companyId,
    status: 'UNQUALIFIED',
  }).catch((err) => console.error('[unqualifyAccountAction] Pusher trigger error:', err));

  return { success: true };
}

/**
 * Create a new deal card in the leftmost pipeline column for LTC follow-up
 */
export async function createLtcDealAction(
  companyId: string,
  preferredStageId?: string
): Promise<{ success: boolean; deal: unknown }> {
  const actor = await requirePipelineActor();

  // Find leftmost stage if not specified
  let targetStageId = preferredStageId;
  if (!targetStageId) {
    const leftmostStage = await prisma.pipelineStage.findFirst({
      orderBy: { order: 'asc' },
    });
    if (!leftmostStage) {
      throw new Error('No pipeline stages available');
    }
    targetStageId = leftmostStage.id;
  }

  const topic = formatLtcDealTopic(new Date());

  const createdDeal = await createOpportunity({
    topic,
    type: 'SALES_DEAL',
    companyId,
    pipelineStageId: targetStageId,
  });

  // Create initial log on deal explaining it was created from LTC
  if (typeof createdDeal === 'object' && createdDeal && 'id' in createdDeal) {
    await prisma.activityLog.create({
      data: {
        opportunityId: (createdDeal as { id: string }).id,
        userId: actor.id,
        type: 'COMMENT',
        content: `สร้างการ์ดติดตามสำหรับ Qualified Customer จากระบบ LTC (${topic})`,
      },
    }).catch((err) => console.warn('[createLtcDealAction] activityLog warning:', err));
  }

  // Broadcast realtime updates across Pipeline and Dashboard
  void notifyPipelineAudience({
    action: 'LTC_UPDATED',
    companyId,
  });
  void dispatchDashboardInvalidation({
    resources: ['leaderboard', 'summary'],
    companyIds: [companyId],
  });

  return { success: true, deal: createdDeal };
}
