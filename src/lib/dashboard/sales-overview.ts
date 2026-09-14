export const DASHBOARD_TIME_ZONE = "Asia/Bangkok" as const;
export const SUPPORTED_SALES_CURRENCIES = ["THB", "USD", "EUR", "CNY"] as const;

export type SalesCurrency = (typeof SUPPORTED_SALES_CURRENCIES)[number];

export type DashboardPeriod = {
  month: number;
  year: number;
  monthStart: Date;
  nextMonthStart: Date;
  annualStart: Date;
  annualEnd: Date;
  annualYears: number[];
};

export type SalesOverviewDeal = {
  id: string;
  topic: string;
  status: string;
  value: number | null;
  currency: string | null;
  goodsLoadingDate: Date | string | null;
  companyId: string | null;
  company: { name: string; displayName: string | null } | null;
};

export type SaleTargetInput = {
  companyId: string;
  accountName: string;
  year: number;
  amount: string;
  currency: string;
};

export type MoneyTotal = { currency: string; amount: number };

export type SalesDealRow = {
  id: string;
  topic: string;
  accountId: string | null;
  accountName: string;
  loadingDate: string;
  amount: number | null;
  currency: string;
};

export type MonthlyGroup = {
  count: number;
  totals: MoneyTotal[];
  preview: SalesDealRow[];
  deals: SalesDealRow[];
};

export type AccountSaleProgress = {
  companyId: string;
  accountName: string;
  currency: string;
  actual: number;
  target: number;
  percentage: number | null;
  excludedCurrencyDealCount: number;
};

export type AnnualAccountSales = {
  companyId: string | null;
  accountName: string;
  values: Record<number, MoneyTotal[]>;
};

export type YoYBadge =
  | { type: "percent"; deltaPercent: number }
  | { type: "new" }
  | null;

export function calculateYoY(
  current: number,
  previous: number,
  hasOrderedBefore = false
): YoYBadge {
  if (previous > 0) {
    const deltaPercent = Math.round(((current - previous) / previous) * 100);
    return { type: "percent", deltaPercent };
  }
  if (previous === 0 && current > 0) {
    if (hasOrderedBefore) return null;
    return { type: "new" };
  }
  return null;
}

export function calculateSharePercent(amount: number, totalForCurrency: number): number | null {
  if (totalForCurrency <= 0) return null;
  return Math.round((amount / totalForCurrency) * 100);
}

export type SalesOverviewSnapshot = {
  period: { month: number; year: number; timezone: typeof DASHBOARD_TIME_ZONE };
  scopeLabel: string;
  monthly: { waiting: MonthlyGroup; won: MonthlyGroup; total: MonthlyGroup };
  tracking: AccountSaleProgress[];
  annual: { years: number[]; totals: Record<number, MoneyTotal[]>; accounts: AnnualAccountSales[] };
  generatedAt: string;
};

export type DashboardSectionAccess = {
  saleSummary: boolean;
  saleTracking: boolean;
  annualSaleReport: boolean;
};

export const EMPTY_DASHBOARD_SECTION_ACCESS: DashboardSectionAccess = {
  saleSummary: false,
  saleTracking: false,
  annualSaleReport: false,
};

function bangkokBoundary(year: number, monthIndex: number) {
  const normalized = new Date(Date.UTC(year, monthIndex, 1));
  const normalizedYear = normalized.getUTCFullYear();
  const normalizedMonth = String(normalized.getUTCMonth() + 1).padStart(2, "0");
  return new Date(`${normalizedYear}-${normalizedMonth}-01T00:00:00+07:00`);
}

export function getBangkokYear(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: DASHBOARD_TIME_ZONE,
    year: "numeric",
  }).format(now));
}

export function getBangkokMonth(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: DASHBOARD_TIME_ZONE,
    month: "numeric",
  }).format(now));
}

export function parseDashboardPeriod(monthValue?: string, yearValue?: string, now = new Date()): DashboardPeriod {
  const currentMonth = getBangkokMonth(now);
  const currentYear = getBangkokYear(now);
  const rawMonth = Number(monthValue);
  const rawYear = Number(yearValue);
  const month = Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : currentMonth;
  const year = Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= currentYear ? rawYear : currentYear;
  const annualYears = Array.from({ length: 5 }, (_, index) => year - index);

  return {
    month,
    year,
    monthStart: bangkokBoundary(year, month - 1),
    nextMonthStart: bangkokBoundary(year, month),
    annualStart: bangkokBoundary(year - 4, 0),
    annualEnd: bangkokBoundary(year + 1, 0),
    annualYears,
  };
}

function inRange(date: Date, start: Date, end: Date) {
  return date >= start && date < end;
}

function accountName(deal: SalesOverviewDeal) {
  return deal.company?.displayName || deal.company?.name || "Unassigned account";
}

function currencyOf(deal: SalesOverviewDeal) {
  return deal.currency || "THB";
}

function toRow(deal: SalesOverviewDeal): SalesDealRow {
  return {
    id: deal.id,
    topic: deal.topic,
    accountId: deal.companyId,
    accountName: accountName(deal),
    loadingDate: new Date(deal.goodsLoadingDate as Date | string).toISOString(),
    amount: deal.value,
    currency: currencyOf(deal),
  };
}

function totalsFor(deals: SalesOverviewDeal[]): MoneyTotal[] {
  const totals = new Map<string, number>();
  for (const deal of deals) {
    if (deal.value === null || !Number.isFinite(deal.value)) continue;
    const currency = currencyOf(deal);
    totals.set(currency, (totals.get(currency) || 0) + deal.value);
  }
  return [...totals].map(([currency, amount]) => ({ currency, amount })).sort((a, b) =>
    a.currency === "THB" ? -1 : b.currency === "THB" ? 1 : a.currency.localeCompare(b.currency)
  );
}

function monthlyGroup(deals: SalesOverviewDeal[]): MonthlyGroup {
  const sorted = [...deals].sort((a, b) => {
    const dateDifference = new Date(a.goodsLoadingDate as Date | string).getTime() - new Date(b.goodsLoadingDate as Date | string).getTime();
    return dateDifference || (b.value || 0) - (a.value || 0);
  });
  const rows = sorted.map(toRow);
  return { count: deals.length, totals: totalsFor(deals), preview: rows.slice(0, 5), deals: rows };
}

export function buildSalesOverviewSnapshot(params: {
  deals: SalesOverviewDeal[];
  targets: SaleTargetInput[];
  period: DashboardPeriod;
  scopeLabel: string;
  generatedAt?: Date;
}): SalesOverviewSnapshot {
  const { deals, targets, period, scopeLabel } = params;
  const monthlyDeals = deals.filter((deal) => deal.goodsLoadingDate && inRange(new Date(deal.goodsLoadingDate), period.monthStart, period.nextMonthStart));
  const waiting = monthlyDeals.filter((deal) => deal.status === "OPEN");
  const won = monthlyDeals.filter((deal) => deal.status === "WON");
  const total = [...waiting, ...won];

  const wonInAnchorYear = deals.filter((deal) => deal.status === "WON" && deal.goodsLoadingDate &&
    inRange(new Date(deal.goodsLoadingDate), bangkokBoundary(period.year, 0), bangkokBoundary(period.year + 1, 0)));

  const tracking = targets.filter((target) => target.year === period.year).map((target) => {
    const matching = wonInAnchorYear.filter((deal) => deal.companyId === target.companyId && currencyOf(deal) === target.currency);
    const excludedCurrencyDealCount = wonInAnchorYear.filter((deal) => deal.companyId === target.companyId && currencyOf(deal) !== target.currency).length;
    const actual = totalsFor(matching)[0]?.amount || 0;
    const targetAmount = Number(target.amount);
    return {
      companyId: target.companyId,
      accountName: target.accountName,
      currency: target.currency,
      actual,
      target: targetAmount,
      percentage: targetAmount > 0 ? (actual / targetAmount) * 100 : null,
      excludedCurrencyDealCount,
    };
  }).sort((a, b) => (a.percentage ?? Number.POSITIVE_INFINITY) - (b.percentage ?? Number.POSITIVE_INFINITY) || a.accountName.localeCompare(b.accountName));

  const annualDeals = deals.filter((deal) => deal.status === "WON" && deal.value !== null && deal.goodsLoadingDate &&
    inRange(new Date(deal.goodsLoadingDate), period.annualStart, period.annualEnd));
  const accountMap = new Map<string, AnnualAccountSales>();
  const yearDealMap = new Map<number, SalesOverviewDeal[]>();

  for (const deal of annualDeals) {
    const year = getBangkokYear(new Date(deal.goodsLoadingDate as Date | string));
    const key = deal.companyId || "__unassigned__";
    const account = accountMap.get(key) || { companyId: deal.companyId, accountName: accountName(deal), values: {} };
    const sameYear = annualDeals.filter((candidate) => candidate.companyId === deal.companyId && candidate.goodsLoadingDate && getBangkokYear(new Date(candidate.goodsLoadingDate)) === year);
    account.values[year] = totalsFor(sameYear);
    accountMap.set(key, account);
    yearDealMap.set(year, [...(yearDealMap.get(year) || []), deal]);
  }

  const annualTotals = Object.fromEntries(period.annualYears.map((year) => [year, totalsFor(yearDealMap.get(year) || [])]));
  const annualAccounts = [...accountMap.values()].sort((a, b) => {
    const amount = (entry: AnnualAccountSales) => entry.values[period.year]?.find((value) => value.currency === "THB")?.amount || 0;
    return amount(b) - amount(a) || a.accountName.localeCompare(b.accountName);
  });

  return {
    period: { month: period.month, year: period.year, timezone: DASHBOARD_TIME_ZONE },
    scopeLabel,
    monthly: { waiting: monthlyGroup(waiting), won: monthlyGroup(won), total: monthlyGroup(total) },
    tracking,
    annual: { years: period.annualYears, totals: annualTotals, accounts: annualAccounts },
    generatedAt: (params.generatedAt || new Date()).toISOString(),
  };
}
