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
      // Row 0 always starts at 1.
      // Each intermediate row i has maxQuantity > currentMin.
      // Next row i+1 minQuantity is row[i].maxQuantity + 1.
      // Last row always has maxQuantity = null ("or more").
      const result: PriceStepTier[] = [];
      let currentMin = 1;

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
            const nextItem = validItems[i + 1];
            if (nextItem && nextItem.minQuantity > currentMin) {
              maxQty = nextItem.minQuantity - 1;
            } else {
              maxQty = currentMin + 19;
            }
          }
        }

        result.push({
          minQuantity: currentMin,
          maxQuantity: maxQty,
          discountPercent: item.discountPercent,
        });

        if (maxQty !== null) {
          currentMin = maxQty + 1;
        }
      }

      return result;
    }
  } catch {
    // If not JSON, ignore legacy string
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
