import 'server-only';

import type { PipelineActor } from '@/lib/pipeline-security';
import prisma from '@/lib/prisma';
import { getContactActor } from '@/lib/actions/contact';
import { getUserVisibleMenuKeys } from '@/lib/actions/permission';
import { getOpportunityAccessWhere } from '@/lib/pipeline-security';
import {
  buildSalesOverviewSnapshot,
  type DashboardSectionAccess,
  parseDashboardPeriod,
  type SalesOverviewSnapshot,
} from '@/lib/dashboard/sales-overview';

export const DASHBOARD_SECTION_MENU_KEYS = {
  saleSummary: 'dashboard.sale_summary',
  saleTracking: 'dashboard.sale_tracking',
  annualSaleReport: 'dashboard.annual_sale_report',
} as const;

export type DashboardSalesAccess = {
  actor: PipelineActor;
  scopeLabel: string;
  sections: DashboardSectionAccess;
};

function scopeLabelFor(actor: PipelineActor) {
  if (actor.role === 'ADMIN') return 'All accessible deals';
  if (actor.departments.length > 0) return `${actor.departments.join(', ')} department`;
  return 'Your deals';
}

export function resolveDashboardSectionAccess(visibleKeys: Iterable<string>, isAdmin = false): DashboardSectionAccess {
  const keys = new Set(visibleKeys);
  return {
    saleSummary: isAdmin || keys.has(DASHBOARD_SECTION_MENU_KEYS.saleSummary),
    saleTracking: isAdmin || keys.has(DASHBOARD_SECTION_MENU_KEYS.saleTracking),
    annualSaleReport: isAdmin || keys.has(DASHBOARD_SECTION_MENU_KEYS.annualSaleReport),
  };
}

export async function requireDashboardSalesAccess(
  actorOverride?: PipelineActor,
  visibleKeysOverride?: Iterable<string>,
): Promise<DashboardSalesAccess> {
  const contactActor = actorOverride ?? await getContactActor();
  const actor: PipelineActor = {
    id: contactActor.id,
    name: contactActor.name,
    role: contactActor.role,
    departments: contactActor.departments,
  };
  const visibleKeys = visibleKeysOverride
    ? [...visibleKeysOverride]
    : await getUserVisibleMenuKeys(actor.id);
  if (actor.role !== 'ADMIN' && !visibleKeys.includes('crm_overview')) {
    throw new Error('Forbidden');
  }
  const sections = resolveDashboardSectionAccess(visibleKeys, actor.role === 'ADMIN');
  if (!Object.values(sections).some(Boolean)) throw new Error('Forbidden');
  return { actor, scopeLabel: scopeLabelFor(actor), sections };
}

export async function getDashboardSalesSnapshot(input: {
  month?: string;
  year?: string;
  country?: string;
  account?: string;
  actor?: PipelineActor;
  visibleKeys?: Iterable<string>;
  now?: Date;
} = {}): Promise<SalesOverviewSnapshot> {
  const { actor, scopeLabel, sections } = await requireDashboardSalesAccess(
    input.actor,
    input.visibleKeys,
  );
  const period = parseDashboardPeriod(input.month, input.year, input.now);
  // Dashboard is shared for the entire Sales Team in the same department (no need to be MANAGEMENT)
  const dashboardActor: PipelineActor =
    actor.departments.length > 0 && actor.role !== 'ADMIN'
      ? { ...actor, role: 'MANAGEMENT' }
      : actor;
  const accessWhere = getOpportunityAccessWhere(dashboardActor);

  // The all-time map projection also contains the bounded five-year window.
  // Query it once, then derive the annual slice in memory to avoid transferring
  // and decoding the same opportunities twice on every filter navigation.
  const [allTimeDeals, targets] = await Promise.all([
    prisma.opportunity.findMany({
      where: {
        ...accessWhere,
        type: 'SALES_DEAL',
        status: { in: ['OPEN', 'WON'] },
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
            country: true,
            addresses: { select: { country: true }, take: 1 },
          },
        },
      },
    }),
    (prisma.companySaleTarget
      ? prisma.companySaleTarget.findMany({
          where: {
            year: period.year,
            ...(actor.role === 'ADMIN' ? {} : {
              company: { opportunities: { some: accessWhere } },
            }),
          },
          select: {
            companyId: true,
            year: true,
            amount: true,
            currency: true,
            company: { select: { name: true, displayName: true } },
          },
        })
      : Promise.resolve([])),
  ]);

  const deals = allTimeDeals.filter((deal) => {
    if (!deal.goodsLoadingDate) return false;
    const loadingDate = new Date(deal.goodsLoadingDate);
    return loadingDate >= period.annualStart && loadingDate < period.annualEnd;
  });

  const snapshot = buildSalesOverviewSnapshot({
    deals,
    allTimeDeals,
    targets: targets.map((target) => ({
      companyId: target.companyId,
      accountName: target.company.displayName || target.company.name,
      year: target.year,
      amount: target.amount.toFixed(2),
      currency: target.currency,
    })),
    period,
    scopeLabel,
    filterCountry: input.country,
    filterAccount: input.account,
  });

  if (!sections.saleSummary) {
    const emptyGroup = { count: 0, totals: [], preview: [], deals: [] };
    snapshot.monthly = { waiting: emptyGroup, won: emptyGroup, total: emptyGroup };
    snapshot.yearly = { waiting: emptyGroup, won: emptyGroup, total: emptyGroup };
  }
  if (!sections.saleTracking) snapshot.tracking = [];
  if (!sections.annualSaleReport) {
    snapshot.annual = {
      years: snapshot.annual.years,
      totals: Object.fromEntries(snapshot.annual.years.map((year) => [year, []])),
      accounts: [],
    };
  }
  return snapshot;
}
