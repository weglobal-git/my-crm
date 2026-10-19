"use server";

import prisma from "@/lib/prisma";
import {
  CompanyCostOverhead,
  DEFAULT_COMPANY_COST_OVERHEAD,
  DEFAULT_COMMERCIAL_RATES,
} from "@/lib/product/company-cost-overhead";

const CONFIG_ID = "company_cost_overhead";

/**
 * Loads company standard cost overhead configuration (including commercial deduction rates) from database.
 */
export async function getCompanyCostOverheadAction(): Promise<CompanyCostOverhead> {
  try {
    const row = await prisma.systemConfig.findUnique({
      where: { id: CONFIG_ID },
      select: { googleRefreshToken: true },
    });

    if (row?.googleRefreshToken) {
      const parsed = JSON.parse(row.googleRefreshToken);
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
  } catch (err) {
    console.warn("Failed to load company cost overhead from DB, using defaults:", err);
  }
  return DEFAULT_COMPANY_COST_OVERHEAD;
}

/**
 * Saves company standard cost overhead configuration (including commercial deduction rates) to database.
 */
export async function saveCompanyCostOverheadAction(
  overhead: CompanyCostOverhead
): Promise<{ success: boolean; data?: CompanyCostOverhead; error?: string }> {
  try {
    const sanitized: CompanyCostOverhead = {
      supportPercent: Math.max(0, Number(overhead.supportPercent) || 0),
      operationPercent: Math.max(0, Number(overhead.operationPercent) || 0),
      marketingPercent: Math.max(0, Number(overhead.marketingPercent) || 0),
      salesPercent: Math.max(0, Number(overhead.salesPercent) || 0),
      commissionRate: Math.max(
        0,
        Number(overhead.commissionRate ?? DEFAULT_COMMERCIAL_RATES.commissionRate)
      ),
      distFeeRate: Math.max(
        0,
        Number(overhead.distFeeRate ?? DEFAULT_COMMERCIAL_RATES.distFeeRate)
      ),
      mktSupportRate: Math.max(
        0,
        Number(overhead.mktSupportRate ?? DEFAULT_COMMERCIAL_RATES.mktSupportRate)
      ),
      rebateRate: Math.max(
        0,
        Number(overhead.rebateRate ?? DEFAULT_COMMERCIAL_RATES.rebateRate)
      ),
    };

    const payload = JSON.stringify(sanitized);

    await prisma.systemConfig.upsert({
      where: { id: CONFIG_ID },
      update: { googleRefreshToken: payload },
      create: {
        id: CONFIG_ID,
        googleRefreshToken: payload,
      },
    });

    return { success: true, data: sanitized };
  } catch (err: any) {
    console.error("Failed to save company cost overhead to DB:", err);
    return { success: false, error: err?.message || "Failed to save configuration" };
  }
}

