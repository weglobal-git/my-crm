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
  remark: string | null;
  variants: ProductVariantDTO[];
  createdAt: string;
  updatedAt: string;
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
