'use server';

import prisma from '@/lib/prisma';
import { requireDashboardSalesAccess } from '@/lib/dashboard/dashboard-data';
import { getOpportunityAccessWhere } from '@/lib/pipeline-security';
import { bangkokBoundary, toRow, type SalesDealRow } from '@/lib/dashboard/sales-overview';

export async function getDashboardAccountDeals(input: {
  companyId?: string | null;
  accountName?: string | null;
  year?: number;
  month?: number;
  mode?: 'all_time' | 'year' | 'month';
}): Promise<SalesDealRow[]> {
  const { actor } = await requireDashboardSalesAccess();
  const dashboardActor =
    actor.departments.length > 0 && actor.role !== 'ADMIN'
      ? { ...actor, role: 'MANAGEMENT' as const }
      : actor;
  const accessWhere = getOpportunityAccessWhere(dashboardActor);

  const dateFilter =
    input.mode === 'month' && input.year && input.month
      ? {
          goodsLoadingDate: {
            gte: bangkokBoundary(input.year, input.month - 1),
            lt: bangkokBoundary(input.year, input.month),
          },
        }
      : input.mode === 'year' && input.year
      ? {
          goodsLoadingDate: {
            gte: bangkokBoundary(input.year, 0),
            lt: bangkokBoundary(input.year + 1, 0),
          },
        }
      : {};

  const deals = await prisma.opportunity.findMany({
    where: {
      ...accessWhere,
      type: 'SALES_DEAL',
      status: { in: ['OPEN', 'WON'] },
      ...(input.companyId
        ? { companyId: input.companyId }
        : input.accountName
        ? { company: { name: input.accountName } }
        : {}),
      ...dateFilter,
    },
    select: {
      id: true,
      topic: true,
      status: true,
      value: true,
      currency: true,
      goodsLoadingDate: true,
      companyId: true,
      company: {
        select: {
          name: true,
          displayName: true,
        },
      },
    },
    orderBy: { goodsLoadingDate: 'desc' },
  });

  return deals.map(toRow);
}

export async function getDashboardSummaryAction(input: {
  month: number;
  year: number;
  country?: string | null;
  account?: string | null;
}) {
  const { getDashboardSalesSnapshot } = await import('@/lib/dashboard/dashboard-data');
  const snapshot = await getDashboardSalesSnapshot({
    month: String(input.month),
    year: String(input.year),
    country: input.country || undefined,
    account: input.account || undefined,
    dateRange: {
      start: bangkokBoundary(input.year, 0),
      end: bangkokBoundary(input.year + 1, 0),
    },
  });
  return {
    monthly: snapshot.monthly,
    yearly: snapshot.yearly,
    period: snapshot.period,
  };
}

export async function getDashboardTrackingAction(input: {
  year: number;
  country?: string | null;
  account?: string | null;
}) {
  const { getDashboardSalesSnapshot } = await import('@/lib/dashboard/dashboard-data');
  const snapshot = await getDashboardSalesSnapshot({
    year: String(input.year),
    country: input.country || undefined,
    account: input.account || undefined,
    dateRange: {
      start: bangkokBoundary(input.year, 0),
      end: bangkokBoundary(input.year + 1, 0),
    },
  });
  return snapshot.tracking;
}

export async function getDashboardAnnualAction(input: {
  anchorYear: number;
  country?: string | null;
  account?: string | null;
}) {
  const { getDashboardSalesSnapshot } = await import('@/lib/dashboard/dashboard-data');
  const snapshot = await getDashboardSalesSnapshot({
    year: String(input.anchorYear),
    country: input.country || undefined,
    account: input.account || undefined,
    dateRange: {
      start: bangkokBoundary(input.anchorYear - 4, 0),
      end: bangkokBoundary(input.anchorYear + 1, 0),
    },
  });
  return snapshot.annual;
}

export async function getDashboardMapSummaryAction(input: {
  year: number;
  month?: number;
}) {
  const { getDashboardSalesSnapshot } = await import('@/lib/dashboard/dashboard-data');
  const snapshot = await getDashboardSalesSnapshot({
    year: String(input.year),
    month: input.month ? String(input.month) : undefined,
  });
  return snapshot.worldMap;
}

export async function getDashboardFilterOptionsAction() {
  const { getDashboardSalesSnapshot } = await import('@/lib/dashboard/dashboard-data');
  const snapshot = await getDashboardSalesSnapshot();
  return snapshot.filterOptions;
}

