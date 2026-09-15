import { findCountry } from "@/lib/data/countries";

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
  company: {
    name: string;
    displayName: string | null;
    country?: string | null;
    addresses?: { country?: string | null }[];
  } | null;
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
  country?: string | null;
  countryCode?: string | null;
  values: Record<number, MoneyTotal[]>;
};

export type FilterCountryOption = {
  code: string;
  name: string;
  flag: string;
  dealCount: number;
};

export type FilterAccountOption = {
  id: string;
  name: string;
  countryCode?: string;
  countryName?: string;
};

export type DashboardGlobalFilters = {
  country?: string | null;
  account?: string | null;
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

export type CountryAccountSales = {
  companyId: string | null;
  accountName: string;
  dealCount: number;
  totalAmount: number;
  currency: string;
  totals?: MoneyTotal[];
  deals?: SalesDealRow[];
};

export type CountrySalesSummary = {
  countryCode: string; // ISO 3166-1 alpha-2 uppercase, e.g. "TH", "US"
  countryName: string;
  flag: string;
  dealCount: number;
  accountCount: number;
  totalAmount: number;
  currency: string;
  totals: MoneyTotal[];
  accounts: CountryAccountSales[];
};

export type WorldMapPeriodData = {
  totalCountries: number;
  totalDeals: number;
  totalAmount: number;
  countries: CountrySalesSummary[];
};

export type WorldMapReport = {
  allTime: WorldMapPeriodData;
  byYear: Record<number, WorldMapPeriodData>;
  selectedMonth: WorldMapPeriodData;
};

export type SalesOverviewSnapshot = {
  period: { month: number; year: number; timezone: typeof DASHBOARD_TIME_ZONE };
  scopeLabel: string;
  filters?: DashboardGlobalFilters;
  filterOptions?: {
    countries: FilterCountryOption[];
    accounts: FilterAccountOption[];
  };
  monthly: { waiting: MonthlyGroup; won: MonthlyGroup; total: MonthlyGroup };
  yearly: { waiting: MonthlyGroup; won: MonthlyGroup; total: MonthlyGroup };
  tracking: AccountSaleProgress[];
  annual: {
    years: number[];
    allYears?: number[];
    totals: Record<number, MoneyTotal[]>;
    accounts: AnnualAccountSales[];
  };
  worldMap: WorldMapReport;
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

export function bangkokBoundary(year: number, monthIndex: number) {
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

export function toRow(deal: SalesOverviewDeal): SalesDealRow {
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

function monthlyGroup(deals: SalesOverviewDeal[], isYearly = false): MonthlyGroup {
  const sorted = [...deals].sort((a, b) => {
    const dateDifference = new Date(a.goodsLoadingDate as Date | string).getTime() - new Date(b.goodsLoadingDate as Date | string).getTime();
    return dateDifference || (b.value || 0) - (a.value || 0);
  });
  const rows = sorted.map(toRow);
  return {
    count: deals.length,
    totals: totalsFor(deals),
    preview: rows.slice(0, 5),
    deals: rows,
  };
}

const THAI_COUNTRY_MAP: Record<string, string> = {
  "ไทย": "TH",
  "ประเทศไทย": "TH",
  "สหรัฐอเมริกา": "US",
  "อเมริกา": "US",
  "จีน": "CN",
  "ญี่ปุ่น": "JP",
  "สิงคโปร์": "SG",
  "มาเลเซีย": "MY",
  "เวียดนาม": "VN",
  "อินโดนีเซีย": "ID",
  "ฟิลิปปินส์": "PH",
  "เกาหลีใต้": "KR",
  "สหราชอาณาจักร": "GB",
  "อังกฤษ": "GB",
  "ฝรั่งเศส": "FR",
  "เยอรมนี": "DE",
  "ออสเตรเลีย": "AU",
  "แคนาดา": "CA",
};

export function resolveCountryFromDeal(deal: SalesOverviewDeal): { code: string; name: string; flag: string } {
  const raw = deal.company?.country || deal.company?.addresses?.[0]?.country;
  if (!raw || !raw.trim()) {
    return { code: "TH", name: "Thailand", flag: "🇹🇭" };
  }
  const trimmed = raw.trim();
  const mappedCode = THAI_COUNTRY_MAP[trimmed];
  const query = mappedCode || trimmed;
  const match = findCountry(query);
  if (match) {
    return { code: match.code.toUpperCase(), name: match.name, flag: match.flag };
  }
  return { code: "TH", name: "Thailand", flag: "🇹🇭" };
}

export function aggregateCountrySales(deals: SalesOverviewDeal[]): WorldMapPeriodData {
  const map = new Map<string, {
    countryCode: string;
    countryName: string;
    flag: string;
    deals: SalesOverviewDeal[];
    accountIds: Set<string>;
  }>();

  for (const deal of deals) {
    const resolved = resolveCountryFromDeal(deal);
    const existing = map.get(resolved.code) || {
      countryCode: resolved.code,
      countryName: resolved.name,
      flag: resolved.flag,
      deals: [],
      accountIds: new Set<string>(),
    };
    existing.deals.push(deal);
    if (deal.companyId) {
      existing.accountIds.add(deal.companyId);
    }
    map.set(resolved.code, existing);
  }

  const countries: CountrySalesSummary[] = [...map.values()].map((entry) => {
    const totals = totalsFor(entry.deals);
    const thbTotal = totals.find((t) => t.currency === "THB")?.amount;
    const firstTotal = totals[0]?.amount || 0;
    const totalAmount = thbTotal !== undefined ? thbTotal : firstTotal;
    const currency = thbTotal !== undefined ? "THB" : totals[0]?.currency || "THB";

    // Group deals by account
    const accountMap = new Map<string, {
      companyId: string | null;
      accountName: string;
      deals: SalesOverviewDeal[];
    }>();

    for (const deal of entry.deals) {
      const key = deal.companyId || accountName(deal);
      const acc = accountMap.get(key) || {
        companyId: deal.companyId,
        accountName: accountName(deal),
        deals: [],
      };
      acc.deals.push(deal);
      accountMap.set(key, acc);
    }

    const accounts: CountryAccountSales[] = [...accountMap.values()].map((acc) => {
      const accTotals = totalsFor(acc.deals);
      const accThbTotal = accTotals.find((t) => t.currency === "THB")?.amount;
      const accFirstTotal = accTotals[0]?.amount || 0;
      const accTotalAmount = accThbTotal !== undefined ? accThbTotal : accFirstTotal;
      const accCurrency = accThbTotal !== undefined ? "THB" : accTotals[0]?.currency || "THB";

      return {
        companyId: acc.companyId,
        accountName: acc.accountName,
        dealCount: acc.deals.length,
        totalAmount: accTotalAmount,
        currency: accCurrency,
      };
    }).sort((a, b) => b.totalAmount - a.totalAmount || b.dealCount - a.dealCount || a.accountName.localeCompare(b.accountName));

    return {
      countryCode: entry.countryCode,
      countryName: entry.countryName,
      flag: entry.flag,
      dealCount: entry.deals.length,
      accountCount: entry.accountIds.size || 1,
      totalAmount,
      currency,
      totals,
      accounts,
    };
  }).sort((a, b) => b.totalAmount - a.totalAmount || b.dealCount - a.dealCount || a.countryName.localeCompare(b.countryName));

  const totalAmount = countries.reduce((sum, c) => sum + c.totalAmount, 0);

  return {
    totalCountries: countries.length,
    totalDeals: deals.length,
    totalAmount,
    countries,
  };
}

export function buildWorldMapReport(
  allDeals: SalesOverviewDeal[],
  years: number[],
  selectedMonthRange?: { start: Date; end: Date }
): WorldMapReport {
  const allTime = aggregateCountrySales(allDeals);
  const byYear: Record<number, WorldMapPeriodData> = {};

  for (const year of years) {
    const dealsInYear = allDeals.filter((d) => d.goodsLoadingDate && getBangkokYear(new Date(d.goodsLoadingDate as Date | string)) === year);
    byYear[year] = aggregateCountrySales(dealsInYear);
  }

  const selectedMonth = selectedMonthRange
    ? aggregateCountrySales(
        allDeals.filter((deal) => {
          if (!deal.goodsLoadingDate) return false;
          const loadingDate = new Date(deal.goodsLoadingDate);
          return loadingDate >= selectedMonthRange.start && loadingDate < selectedMonthRange.end;
        })
      )
    : aggregateCountrySales([]);

  return { allTime, byYear, selectedMonth };
}

export function buildSalesOverviewSnapshot(params: {
  deals: SalesOverviewDeal[];
  targets: SaleTargetInput[];
  period: DashboardPeriod;
  scopeLabel: string;
  allTimeDeals?: SalesOverviewDeal[];
  filterCountry?: string | null;
  filterAccount?: string | null;
  generatedAt?: Date;
}): SalesOverviewSnapshot {
  const { deals, targets, period, scopeLabel, allTimeDeals } = params;
  const allSourceDeals = allTimeDeals || deals;

  // Extract available countries and accounts from unfiltered dataset
  const countryOptionMap = new Map<string, FilterCountryOption>();
  const accountOptionMap = new Map<string, FilterAccountOption>();

  for (const deal of allSourceDeals) {
    const country = resolveCountryFromDeal(deal);
    const existingCountry = countryOptionMap.get(country.code) || {
      code: country.code,
      name: country.name,
      flag: country.flag,
      dealCount: 0,
    };
    existingCountry.dealCount += 1;
    countryOptionMap.set(country.code, existingCountry);

    const accName = accountName(deal);
    const accId = deal.companyId || accName;
    if (!accountOptionMap.has(accId)) {
      accountOptionMap.set(accId, {
        id: deal.companyId || accId,
        name: accName,
        countryCode: country.code,
      });
    }
  }

  for (const target of targets) {
    if (target.companyId && !accountOptionMap.has(target.companyId)) {
      accountOptionMap.set(target.companyId, {
        id: target.companyId,
        name: target.accountName,
      });
    }
  }

  const sortedCountries = [...countryOptionMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const sortedAccounts = [...accountOptionMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const normFilterCountry = params.filterCountry?.trim().toLowerCase() || null;
  const normFilterAccount = params.filterAccount?.trim().toLowerCase() || null;

  const matchesFilter = (deal: SalesOverviewDeal) => {
    if (normFilterCountry) {
      const c = resolveCountryFromDeal(deal);
      const matchesCountry =
        c.code.toLowerCase() === normFilterCountry ||
        c.name.toLowerCase() === normFilterCountry;
      if (!matchesCountry) return false;
    }
    if (normFilterAccount) {
      const accId = deal.companyId?.toLowerCase();
      const accName = accountName(deal).toLowerCase();
      const matchesAccount =
        accId === normFilterAccount ||
        accName === normFilterAccount ||
        accName.includes(normFilterAccount);
      if (!matchesAccount) return false;
    }
    return true;
  };

  const activeDeals = normFilterCountry || normFilterAccount ? deals.filter(matchesFilter) : deals;
  const activeAllTimeDeals =
    normFilterCountry || normFilterAccount ? allSourceDeals.filter(matchesFilter) : allSourceDeals;

  const monthlyDeals = activeDeals.filter(
    (deal) =>
      deal.goodsLoadingDate &&
      inRange(new Date(deal.goodsLoadingDate), period.monthStart, period.nextMonthStart)
  );
  const waiting = monthlyDeals.filter((deal) => deal.status === "OPEN");
  const won = monthlyDeals.filter((deal) => deal.status === "WON");
  const total = [...waiting, ...won];

  const yearStart = bangkokBoundary(period.year, 0);
  const yearEnd = bangkokBoundary(period.year + 1, 0);
  const yearlyDeals = activeDeals.filter(
    (deal) => deal.goodsLoadingDate && inRange(new Date(deal.goodsLoadingDate), yearStart, yearEnd)
  );
  const yearlyWaiting = yearlyDeals.filter((deal) => deal.status === "OPEN");
  const yearlyWon = yearlyDeals.filter((deal) => deal.status === "WON");
  const yearlyTotal = [...yearlyWaiting, ...yearlyWon];

  const wonInAnchorYear = activeDeals.filter(
    (deal) =>
      deal.status === "WON" &&
      deal.goodsLoadingDate &&
      inRange(
        new Date(deal.goodsLoadingDate),
        bangkokBoundary(period.year, 0),
        bangkokBoundary(period.year + 1, 0)
      )
  );

  const matchingCompanyIdsForCountry = normFilterCountry
    ? new Set(
        allSourceDeals
          .filter((d) => {
            const c = resolveCountryFromDeal(d);
            return (
              c.code.toLowerCase() === normFilterCountry ||
              c.name.toLowerCase() === normFilterCountry
            );
          })
          .map((d) => d.companyId)
          .filter(Boolean)
      )
    : null;

  const filteredTargets = targets.filter((target) => {
    if (target.year !== period.year) return false;
    if (normFilterAccount) {
      const targetAccId = target.companyId?.toLowerCase();
      const targetAccName = target.accountName.toLowerCase();
      const matchesAcc =
        targetAccId === normFilterAccount ||
        targetAccName === normFilterAccount ||
        targetAccName.includes(normFilterAccount);
      if (!matchesAcc) return false;
    }
    if (matchingCompanyIdsForCountry) {
      if (!target.companyId || !matchingCompanyIdsForCountry.has(target.companyId)) {
        return false;
      }
    }
    return true;
  });

  // Pre-index wonInAnchorYear deals by companyId for O(1) target tracking lookup
  const wonByCompanyMap = new Map<string, SalesOverviewDeal[]>();
  for (const deal of wonInAnchorYear) {
    if (!deal.companyId) continue;
    const list = wonByCompanyMap.get(deal.companyId) || [];
    list.push(deal);
    wonByCompanyMap.set(deal.companyId, list);
  }

  const tracking = filteredTargets
    .map((target) => {
      const companyDeals = wonByCompanyMap.get(target.companyId) || [];
      const matching = companyDeals.filter((deal) => currencyOf(deal) === target.currency);
      const excludedCurrencyDealCount = companyDeals.length - matching.length;
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
    })
    .sort(
      (a, b) =>
        (a.percentage ?? Number.POSITIVE_INFINITY) - (b.percentage ?? Number.POSITIVE_INFINITY) ||
        a.accountName.localeCompare(b.accountName)
    );

  const annualDeals = activeAllTimeDeals.filter(
    (deal) =>
      deal.status === "WON" &&
      deal.value !== null &&
      deal.goodsLoadingDate
  );

  // Single-pass grouping: companyKey -> year -> deals[]
  const companyYearDealsMap = new Map<string, Map<number, SalesOverviewDeal[]>>();
  const companyInfoMap = new Map<string, { companyId: string | null; accountName: string; country?: string | null; countryCode?: string | null }>();
  const yearDealMap = new Map<number, SalesOverviewDeal[]>();

  for (const deal of annualDeals) {
    const year = getBangkokYear(new Date(deal.goodsLoadingDate as Date | string));
    const key = deal.companyId || "__unassigned__";

    if (!companyInfoMap.has(key)) {
      const countryInfo = resolveCountryFromDeal(deal);
      companyInfoMap.set(key, {
        companyId: deal.companyId,
        accountName: accountName(deal),
        country: countryInfo.name,
        countryCode: countryInfo.code,
      });
    }

    let yearMap = companyYearDealsMap.get(key);
    if (!yearMap) {
      yearMap = new Map();
      companyYearDealsMap.set(key, yearMap);
    }
    const yearList = yearMap.get(year) || [];
    yearList.push(deal);
    yearMap.set(year, yearList);

    const fullYearList = yearDealMap.get(year) || [];
    fullYearList.push(deal);
    yearDealMap.set(year, fullYearList);
  }

  const accountMap = new Map<string, AnnualAccountSales>();
  for (const [key, yearMap] of companyYearDealsMap.entries()) {
    const info = companyInfoMap.get(key)!;
    const values: Record<number, MoneyTotal[]> = {};
    for (const [year, dealsList] of yearMap.entries()) {
      values[year] = totalsFor(dealsList);
    }
    accountMap.set(key, {
      companyId: info.companyId,
      accountName: info.accountName,
      country: info.country,
      countryCode: info.countryCode,
      values,
    });
  }

  const yearSet = new Set<number>(period.annualYears);
  for (const deal of annualDeals) {
    if (deal.goodsLoadingDate) {
      yearSet.add(getBangkokYear(new Date(deal.goodsLoadingDate as Date | string)));
    }
  }
  const allAvailableYears = Array.from(yearSet).sort((a, b) => b - a);

  const annualTotals = Object.fromEntries(
    allAvailableYears.map((year) => [year, totalsFor(yearDealMap.get(year) || [])])
  );
  const annualAccounts = [...accountMap.values()].sort((a, b) => {
    const amount = (entry: AnnualAccountSales) =>
      entry.values[period.year]?.find((value) => value.currency === "THB")?.amount || 0;
    return amount(b) - amount(a) || a.accountName.localeCompare(b.accountName);
  });

  const worldMap = buildWorldMapReport(activeAllTimeDeals, [period.year], {
    start: period.monthStart,
    end: period.nextMonthStart,
  });

  return {
    period: { month: period.month, year: period.year, timezone: DASHBOARD_TIME_ZONE },
    scopeLabel,
    filters: {
      country: params.filterCountry || null,
      account: params.filterAccount || null,
    },
    filterOptions: {
      countries: sortedCountries,
      accounts: sortedAccounts,
    },
    monthly: { waiting: monthlyGroup(waiting), won: monthlyGroup(won), total: monthlyGroup(total) },
    yearly: { waiting: monthlyGroup(yearlyWaiting, true), won: monthlyGroup(yearlyWon, true), total: monthlyGroup(yearlyTotal, true) },
    tracking,
    annual: {
      years: period.annualYears,
      allYears: allAvailableYears,
      totals: annualTotals,
      accounts: annualAccounts,
    },
    worldMap,
    generatedAt: (params.generatedAt || new Date()).toISOString(),
  };
}
