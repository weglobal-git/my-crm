export interface CommercialRates {
  commissionRate: number; // General Export Sales Commission % (default 5%)
  distFeeRate: number; // Exclusive Distribution Fee % (default 5%)
  mktSupportRate: number; // Exclusive Marketing Support % (default 2%)
  rebateRate: number; // Exclusive / Domestic Annual Rebate % (default 3%)
}

export const DEFAULT_COMMERCIAL_RATES: CommercialRates = {
  commissionRate: 5,
  distFeeRate: 5,
  mktSupportRate: 2,
  rebateRate: 3,
};

export interface CompanyCostOverhead {
  supportPercent: number; // Support expenses (ค่าดำเนินงานแผนกต่างๆ) - default 2%
  operationPercent: number; // Operation expenses (เงินเดือน, ค่าน้ำค่าไฟ, ค่าขนส่ง, อื่นๆ) - default 3%
  marketingPercent: number; // ค่าใช้จ่ายทางการตลาด (POP, สื่อส่งเสริมการขายต่างๆ) - default 2%
  salesPercent: number; // ค่าใช้จ่าย Sales (คอมมิชชั่น) - default 3%
  commissionRate?: number; // General Export Sales Commission % - default 5%
  distFeeRate?: number; // Exclusive Distribution Fee % - default 5%
  mktSupportRate?: number; // Exclusive Marketing Support % - default 2%
  rebateRate?: number; // Exclusive / Domestic Target Rebate % - default 3%
}

export const DEFAULT_COMPANY_COST_OVERHEAD: CompanyCostOverhead = {
  supportPercent: 2,
  operationPercent: 3,
  marketingPercent: 2,
  salesPercent: 3,
  commissionRate: DEFAULT_COMMERCIAL_RATES.commissionRate,
  distFeeRate: DEFAULT_COMMERCIAL_RATES.distFeeRate,
  mktSupportRate: DEFAULT_COMMERCIAL_RATES.mktSupportRate,
  rebateRate: DEFAULT_COMMERCIAL_RATES.rebateRate,
};

export const COMPANY_COST_OVERHEAD_STORAGE_KEY = "company_cost_overhead_v1";
export const COMPANY_COST_OVERHEAD_EVENT = "company-cost-overhead-changed";

export function getTotalOverheadPercent(overhead: CompanyCostOverhead): number {
  const support = Number(overhead.supportPercent) || 0;
  const operation = Number(overhead.operationPercent) || 0;
  const marketing = Number(overhead.marketingPercent) || 0;
  const sales = Number(overhead.salesPercent) || 0;
  return Number((support + operation + marketing + sales).toFixed(2));
}

export function getCommercialRatesFromOverhead(
  overhead?: Partial<CompanyCostOverhead> | null
): CommercialRates {
  return {
    commissionRate: Math.max(
      0,
      Number(overhead?.commissionRate ?? DEFAULT_COMMERCIAL_RATES.commissionRate)
    ),
    distFeeRate: Math.max(
      0,
      Number(overhead?.distFeeRate ?? DEFAULT_COMMERCIAL_RATES.distFeeRate)
    ),
    mktSupportRate: Math.max(
      0,
      Number(overhead?.mktSupportRate ?? DEFAULT_COMMERCIAL_RATES.mktSupportRate)
    ),
    rebateRate: Math.max(
      0,
      Number(overhead?.rebateRate ?? DEFAULT_COMMERCIAL_RATES.rebateRate)
    ),
  };
}

export function calculateEffectiveCost(
  baseCost: number | null | undefined,
  overhead: CompanyCostOverhead
): number {
  if (baseCost == null || baseCost <= 0) return 0;
  const totalPercent = getTotalOverheadPercent(overhead);
  return Number((baseCost * (1 + totalPercent / 100)).toFixed(2));
}

export function getCostBreakdown(
  baseCost: number | null | undefined,
  overhead: CompanyCostOverhead
) {
  const cost = baseCost == null || baseCost <= 0 ? 0 : baseCost;
  const supportAmount = Number(((cost * (overhead.supportPercent || 0)) / 100).toFixed(2));
  const operationAmount = Number(((cost * (overhead.operationPercent || 0)) / 100).toFixed(2));
  const marketingAmount = Number(((cost * (overhead.marketingPercent || 0)) / 100).toFixed(2));
  const salesAmount = Number(((cost * (overhead.salesPercent || 0)) / 100).toFixed(2));
  const totalOverheadAmount = Number((supportAmount + operationAmount + marketingAmount + salesAmount).toFixed(2));
  const effectiveCost = Number((cost + totalOverheadAmount).toFixed(2));

  return {
    baseCost: cost,
    supportAmount,
    operationAmount,
    marketingAmount,
    salesAmount,
    totalOverheadAmount,
    totalPercent: getTotalOverheadPercent(overhead),
    effectiveCost,
  };
}

export function getLocalCompanyCostOverhead(): CompanyCostOverhead {
  if (typeof window === "undefined") return DEFAULT_COMPANY_COST_OVERHEAD;
  try {
    const raw = localStorage.getItem(COMPANY_COST_OVERHEAD_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        supportPercent: Number(parsed.supportPercent ?? DEFAULT_COMPANY_COST_OVERHEAD.supportPercent),
        operationPercent: Number(parsed.operationPercent ?? DEFAULT_COMPANY_COST_OVERHEAD.operationPercent),
        marketingPercent: Number(parsed.marketingPercent ?? DEFAULT_COMPANY_COST_OVERHEAD.marketingPercent),
        salesPercent: Number(parsed.salesPercent ?? DEFAULT_COMPANY_COST_OVERHEAD.salesPercent),
        commissionRate: Number(parsed.commissionRate ?? DEFAULT_COMMERCIAL_RATES.commissionRate),
        distFeeRate: Number(parsed.distFeeRate ?? DEFAULT_COMMERCIAL_RATES.distFeeRate),
        mktSupportRate: Number(parsed.mktSupportRate ?? DEFAULT_COMMERCIAL_RATES.mktSupportRate),
        rebateRate: Number(parsed.rebateRate ?? DEFAULT_COMMERCIAL_RATES.rebateRate),
      };
    }
  } catch (e) {
    console.warn("Failed to parse company cost overhead from localStorage:", e);
  }
  return DEFAULT_COMPANY_COST_OVERHEAD;
}

export function setLocalCompanyCostOverhead(overhead: CompanyCostOverhead): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COMPANY_COST_OVERHEAD_STORAGE_KEY, JSON.stringify(overhead));
    window.dispatchEvent(new CustomEvent(COMPANY_COST_OVERHEAD_EVENT, { detail: overhead }));
  } catch (e) {
    console.warn("Failed to save company cost overhead to localStorage:", e);
  }
}
