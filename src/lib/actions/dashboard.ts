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
