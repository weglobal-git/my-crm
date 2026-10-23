import { ProductStatus } from "@prisma/client";

export interface ProductListItemDTO {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  description: string | null;
  websiteUrl: string | null;
  status: ProductStatus;
  hsCode: string | null;
  cbm: number | null;
  cartonDimension: string | null;
  cartonWidth?: number | null;
  cartonLength?: number | null;
  cartonHeight?: number | null;
  cartonQuantity: number | null;
  cartonGrossWeight?: number | null;
  minGrossWeight?: number | null;
  maxGrossWeight?: number | null;
  variantCount: number;
  starRating: number;
  minPrice: number;
  maxPrice: number;
  primaryImageUrl: string | null;
  formulas: string[];
  createdAt: string;
  updatedAt: string;
  revision: string;
}

export interface ProductVariantDTO {
  id: string;
  productId: string;
  sku: string | null;
  fullName: string;
  thaiName: string | null;
  formula: string | null;
  imageUrl: string | null;
  price: number;
  productCost: number | null;
  priceCondition: string | null;
  netWeight: number | null;
  cartonGrossWeight: number | null;
  status: ProductStatus;
  isDefault: boolean;
  order: number;
  customPrices: {
    id: string;
    companyId: string;
    companyName: string;
    price: number;
  }[];
}

export interface ProductOverviewDTO {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  description: string | null;
  websiteUrl: string | null;
  status: ProductStatus;
  starRating: number;
  hsCode: string | null;
  cartonDimension: string | null;
  cartonWidth: number | null;
  cartonLength: number | null;
  cartonHeight: number | null;
  cbm: number | null;
  cartonQuantity: number | null;
  cartonGrossWeight?: number | null;
  remark: string | null;
  variants: ProductVariantDTO[];
  createdAt: string;
  updatedAt: string;
}

export function extractFallbackGrossWeight(websiteUrl?: string | null): number | null {
  if (!websiteUrl) return null;
  const match = websiteUrl.match(/(?:^|#|\?)gw=(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const parsed = parseFloat(match[1]);
  return !isNaN(parsed) && parsed > 0 ? parsed : null;
}

export function encodeFallbackGrossWeight(
  websiteUrl: string | null | undefined,
  gw: number | null | undefined
): string | null {
  const base = (websiteUrl || "").replace(/(?:^|#|\?)gw=\d+(?:\.\d+)?/gi, "").trim();
  const validGw = typeof gw === "number" && !isNaN(gw) && gw > 0 ? Number(gw.toFixed(4)) : null;
  if (!validGw) {
    return base || null;
  }
  return base ? `${base}#gw=${validGw}` : `#gw=${validGw}`;
}

export interface ProductFilterParams {
  status?: ProductStatus | "ALL";
  category?: string;
  categories?: string[];
  brand?: string;
  brands?: string[];
  search?: string;
  page?: number;
  pageSize?: number;
}

export function productMatchesFilters(
  product: ProductListItemDTO,
  filters: {
    status?: ProductStatus | "ALL";
    category?: string;
    categories?: string[];
    brand?: string;
    brands?: string[];
    search?: string;
  }
): boolean {
  if (filters.status && filters.status !== "ALL" && product.status !== filters.status) {
    return false;
  }
  if (filters.categories && filters.categories.length > 0) {
    const catLower = (product.category || "").trim().toLowerCase();
    const hasMatch = filters.categories.some(
      (c) => c.trim().toLowerCase() === catLower
    );
    if (!hasMatch) return false;
  } else if (filters.category && filters.category !== "ALL" && filters.category.trim()) {
    if (
      (product.category || "").trim().toLowerCase() !==
      filters.category.trim().toLowerCase()
    ) {
      return false;
    }
  }
  if (filters.brands && filters.brands.length > 0) {
    const brandLower = (product.brand || "").trim().toLowerCase();
    const hasMatch = filters.brands.some(
      (b) => b.trim().toLowerCase() === brandLower
    );
    if (!hasMatch) return false;
  } else if (filters.brand && filters.brand !== "ALL" && filters.brand.trim()) {
    if (
      (product.brand || "").trim().toLowerCase() !==
      filters.brand.trim().toLowerCase()
    ) {
      return false;
    }
  }
  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    const nameMatch = (product.name || "").toLowerCase().includes(q);
    const brandMatch = (product.brand || "").toLowerCase().includes(q);
    const catMatch = (product.category || "").toLowerCase().includes(q);
    const hsMatch = (product.hsCode || "").toLowerCase().includes(q);
    const formulaMatch = product.formulas.some((f) => f.toLowerCase().includes(q));
    if (!nameMatch && !brandMatch && !catMatch && !hsMatch && !formulaMatch) {
      return false;
    }
  }
  return true;
}

export function getProductFilterKey(params: ProductFilterParams): string {
  const catKey = params.categories && params.categories.length > 0
    ? `cats:${params.categories.slice().sort().join(",")}`
    : `c:${params.category || "ALL"}`;

  const brandKey = params.brands && params.brands.length > 0
    ? `brands:${params.brands.slice().sort().join(",")}`
    : `b:${params.brand || "ALL"}`;

  const parts = [
    "products",
    params.status || "AVAILABLE",
    catKey,
    brandKey,
    params.search ? `s:${params.search.trim().toLowerCase()}` : "s:none",
    `p:${params.page || 1}`,
    `ps:${params.pageSize || 20}`,
  ];
  return parts.join("|");
}

export function getProductOverviewKey(productId: string): [string, string] {
  return ["product-overview", productId];
}

// Volume Tier Discount (Step Price) Interface & Helpers
export interface PriceStepTier {
  minQuantity: number; // Starting quantity in cartons (always >= 1)
  maxQuantity?: number | null; // Upper bound in cartons; null for last tier ("or more")
  discountPercent: number; // Discount percentage (0 - 100)
}

export function parseLegacyPriceConditionText(raw: string | null | undefined): PriceStepTier[] {
  if (!raw || !raw.trim()) return [];
  let text = raw.replace(/^"+|"+$/g, "").replace(/\r\n/g, "\n").trim();

  // Fix known Excel auto-fill typo on Hair Treatment Wax (500ml) (x2 Units): "13..26 โหล ลด 3% , 24 โหล ลด 5%"
  if (/^\d+\s*โหล\s*ลด\s*3%\s*,\s*24\s*โหล\s*ลด\s*5%$/.test(text)) {
    text = "12 โหล ลด 3% , 24 โหล ลด 5%";
  }

  // Fix known typo on Bleaching Powder (300g): "2.ซื้อ 3 โหล ลดท้ายบิล 3%\n3.ซื้อ 3 โหล ลดท้ายบิล 5%"
  text = text.replace(
    /2\.ซื้อ\s*3\s*โหล\s*ลดท้ายบิล\s*3%\s*\n\s*3\.ซื้อ\s*3\s*โหล\s*ลดท้ายบิล\s*5%/,
    "2.ซื้อ 3 โหล ลดท้ายบิล 3%\n3.ซื้อ 6 โหล ลดท้ายบิล 5%"
  );

  // Strip 3-month cumulative cash coupon remarks
  const beforeAccum =
    text.split(/(?:รายการสะสม(?!สั่งซื้อบิลเดียว)|สะสม\s*3\s*เดือน)/)[0] || text;

  const rawClauses = beforeAccum
    .split(/\n|\/|,(?!\d)/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Merge split lines where line i has quantity (โหล/แกลลอน/ถุง) without % and line i+1 has % without quantity
  const clauses: string[] = [];
  for (let i = 0; i < rawClauses.length; i++) {
    const cur = rawClauses[i];
    const next = rawClauses[i + 1];
    const hasUnit = /(\d+)\s*(?:โหล|แกลล?อน|ถุง|ฤง)/.test(cur);
    const hasPct = /(\d+(?:\.\d+)?)\s*%/.test(cur);
    const hasFree = /แถม\s*\d+/.test(cur);
    const isNet = /NET|NTE|ไม่มีส่วนลด/i.test(cur);
    if (
      hasUnit &&
      !hasPct &&
      !hasFree &&
      !isNet &&
      next &&
      /(\d+(?:\.\d+)?)\s*%/.test(next) &&
      !/(\d+)\s*(?:โหล|แกลล?อน|ถุง|ฤง)/.test(next)
    ) {
      clauses.push(`${cur} ${next}`);
      i++;
    } else {
      clauses.push(cur);
    }
  }

  const extracted: { qty: number; pct: number }[] = [];

  for (const clause of clauses) {
    if (/NET|NTE|ไม่มีส่วนลด/i.test(clause) && !/(\d+(?:\.\d+)?)\s*%/.test(clause)) {
      continue;
    }

    // Handle "X โหล แถม Y โหล"
    const freeMatch = clause.match(/(\d+)\s*โหล\s*แถม\s*(\d+)\s*โหล/);
    if (freeMatch) {
      const buyQty = parseInt(freeMatch[1], 10);
      const freeQty = parseInt(freeMatch[2], 10);
      if (buyQty > 0 && freeQty > 0) {
        const eqPct = Number(((freeQty / buyQty) * 100).toFixed(2));
        extracted.push({ qty: buyQty, pct: eqPct });
      }
      continue;
    }

    const qtyMatch = clause.match(/(?:^\d+\.\s*)?.*?(\d+)\s*(?:โหล|แกลล?อน|ถุง|ฤง)/);
    if (!qtyMatch) continue;
    const qty = parseInt(qtyMatch[1], 10);
    if (!qty || qty <= 0) continue;

    const pctMatches = Array.from(clause.matchAll(/(\d+(?:\.\d+)?)\s*%/g)).map((m) =>
      parseFloat(m[1])
    );
    if (pctMatches.length > 0) {
      // Compound sequential discounts if multiple % on the same tier (e.g., ลด 20% ลดท้ายบิลเพิ่ม 10% -> 28%)
      let remaining = 1;
      for (const p of pctMatches) {
        remaining *= 1 - p / 100;
      }
      const compoundPct = Number(((1 - remaining) * 100).toFixed(2));
      if (compoundPct > 0) {
        extracted.push({ qty, pct: compoundPct });
      }
    }
  }

  if (extracted.length === 0) return [];

  extracted.sort((a, b) => a.qty - b.qty || a.pct - b.pct);
  const deduped: { qty: number; pct: number }[] = [];
  for (const item of extracted) {
    if (deduped.length > 0 && deduped[deduped.length - 1].qty === item.qty) {
      deduped[deduped.length - 1].pct = Math.max(deduped[deduped.length - 1].pct, item.pct);
    } else {
      deduped.push({ ...item });
    }
  }

  return deduped.map((item, idx) => {
    const next = deduped[idx + 1];
    return {
      minQuantity: item.qty,
      maxQuantity: next ? next.qty - 1 : null,
      discountPercent: item.pct,
    };
  });
}

export function parsePriceConditions(raw: string | null | undefined): PriceStepTier[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const validItems = parsed
        .filter((item) => typeof item === "object" && item !== null)
        .map((item) => ({
          minQuantity: Math.max(1, Number(item.minQuantity) || 1),
          maxQuantity:
            item.maxQuantity !== null && item.maxQuantity !== undefined && Number(item.maxQuantity) > 0
              ? Number(item.maxQuantity)
              : null,
          discountPercent: Math.max(0, Number(item.discountPercent) || 0),
        }));

      if (validItems.length === 0) return [];

      // Dynamically chain consecutive tier carton ranges:
      // Row 0 starts from validItems[0].minQuantity (at least 1).
      // Each intermediate row i has maxQuantity > currentMin.
      // Next row i+1 minQuantity is row[i].maxQuantity + 1.
      // Last row always has maxQuantity = null ("or more").
      const result: PriceStepTier[] = [];
      let currentMin = Math.max(1, validItems[0]?.minQuantity || 1);

      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i];
        const isLast = i === validItems.length - 1;

        let maxQty: number | null = null;
        if (isLast) {
          maxQty = null;
        } else {
          if (item.maxQuantity && item.maxQuantity > currentMin) {
            maxQty = item.maxQuantity;
          } else {
            maxQty = null;
          }
        }

        result.push({
          minQuantity: currentMin,
          maxQuantity: maxQty,
          discountPercent: item.discountPercent,
        });

        if (maxQty !== null) {
          currentMin = maxQty + 1;
        } else {
          const nextItem = validItems[i + 1];
          if (nextItem && nextItem.minQuantity > currentMin) {
            currentMin = nextItem.minQuantity;
          } else {
            currentMin = currentMin + 1;
          }
        }
      }

      return result;
    }
  } catch {
    // Fallback to legacy Thai text condition parser
    return parseLegacyPriceConditionText(raw);
  }
  return [];
}

export function serializePriceConditions(tiers: PriceStepTier[]): string {
  if (!tiers || tiers.length === 0) return "";
  const cleaned = tiers.map((t, idx) => ({
    minQuantity: t.minQuantity,
    maxQuantity: idx === tiers.length - 1 ? null : t.maxQuantity ?? null,
    discountPercent: t.discountPercent,
  }));
  return JSON.stringify(cleaned);
}

export function calculateTierPrice(basePrice: number, discountPercent: number): number {
  if (basePrice <= 0 || discountPercent <= 0) return basePrice;
  const discounted = basePrice * (1 - discountPercent / 100);
  return Math.round(discounted * 100) / 100;
}

/**
 * Resolves a single unified product selling price from an array of variant prices:
 * - Filters out non-positive values (<= 0)
 * - Picks the Mode (most frequently occurring price)
 * - Breaks ties by picking the highest price (guards against accidental low typos like 7.00 instead of 70.00)
 */
export function resolveUnifiedPrice(
  prices: Array<number | null | undefined>
): number {
  const valid = prices
    .filter((p): p is number => typeof p === "number" && !Number.isNaN(p) && p > 0)
    .map((p) => Number(p.toFixed(2)));

  if (valid.length === 0) return 0;

  const freqMap = new Map<number, number>();
  for (const p of valid) {
    freqMap.set(p, (freqMap.get(p) || 0) + 1);
  }

  let bestPrice = valid[0];
  let bestCount = 0;

  for (const [price, count] of freqMap.entries()) {
    if (count > bestCount || (count === bestCount && price > bestPrice)) {
      bestCount = count;
      bestPrice = price;
    }
  }

  return bestPrice;
}

/**
 * Computes the Average Base Cost (plus Min/Max/Count) across all variants of a product
 * that have a positive cost (> 0).
 */
export function resolveProductAverageBaseCost(
  costs: Array<number | null | undefined>
): {
  avgCost: number;
  minCost: number;
  maxCost: number;
  count: number;
} {
  const valid = costs.filter(
    (c): c is number => typeof c === "number" && !Number.isNaN(c) && c > 0
  );

  if (valid.length === 0) {
    return { avgCost: 0, minCost: 0, maxCost: 0, count: 0 };
  }

  const sum = valid.reduce((acc, c) => acc + c, 0);
  return {
    avgCost: Number((sum / valid.length).toFixed(2)),
    minCost: Math.min(...valid),
    maxCost: Math.max(...valid),
    count: valid.length,
  };
}

export type CustomerPricingCurrency = "THB" | "USD";

export const DEFAULT_USD_THB_RATE = 34.0;

/**
 * Automatically detects whether a customer's saved unit price is denominated in USD or THB
 * by comparing it against the product's THB Base Cost (or THB Standard Export Price).
 *
 * Since 1 USD ≈ 30–38 THB, a USD unit price is ~3% of the THB price/cost (e.g., $3.00 vs ฿70.31 cost),
 * whereas a THB unit price is typically 50%–250% of the THB cost.
 * Any positive price below 25% of the THB reference benchmark is classified as USD.
 */
export function detectCustomerPriceCurrency(
  savedPrice: number | null | undefined,
  baseCostThb: number | null | undefined,
  exportPriceThb: number | null | undefined = 0
): CustomerPricingCurrency {
  if (typeof savedPrice !== "number" || Number.isNaN(savedPrice) || savedPrice <= 0) {
    return "THB";
  }

  const costRef =
    typeof baseCostThb === "number" && !Number.isNaN(baseCostThb) && baseCostThb > 0
      ? baseCostThb
      : 0;
  const exportRef =
    typeof exportPriceThb === "number" && !Number.isNaN(exportPriceThb) && exportPriceThb > 0
      ? exportPriceThb
      : 0;
  const benchmarkThb = costRef > 0 ? costRef : exportRef;

  if (benchmarkThb > 0) {
    return savedPrice < benchmarkThb * 0.25 ? "USD" : "THB";
  }

  return savedPrice < 8 ? "USD" : "THB";
}

/**
 * Automatically determines a Customer Account's pricing currency (THB or USD)
 * across all of their priced products using majority vote.
 */
export function detectAccountCurrency(
  samples: Array<{
    price: number;
    baseCostThb: number;
    exportPriceThb?: number;
  }>
): CustomerPricingCurrency {
  const valid = samples.filter(
    (s) => typeof s.price === "number" && !Number.isNaN(s.price) && s.price > 0
  );
  if (valid.length === 0) return "THB";

  let usdCount = 0;
  for (const s of valid) {
    if (
      detectCustomerPriceCurrency(s.price, s.baseCostThb, s.exportPriceThb ?? 0) ===
      "USD"
    ) {
      usdCount += 1;
    }
  }

  return usdCount >= Math.ceil(valid.length / 2) ? "USD" : "THB";
}

/**
 * Converts a customer's unit selling price into THB for margin & break-even evaluation.
 */
export function convertCustomerPriceToThb(
  price: number | null | undefined,
  currency: CustomerPricingCurrency,
  usdToThbRate: number = DEFAULT_USD_THB_RATE
): number {
  if (typeof price !== "number" || Number.isNaN(price) || price <= 0) {
    return 0;
  }
  const safeRate =
    typeof usdToThbRate === "number" && !Number.isNaN(usdToThbRate) && usdToThbRate > 0
      ? usdToThbRate
      : DEFAULT_USD_THB_RATE;

  if (currency === "USD") {
    return Number((price * safeRate).toFixed(2));
  }
  return Number(price.toFixed(2));
}


