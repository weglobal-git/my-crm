"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ProductStatus, Prisma } from "@prisma/client";
import {
  ProductListItemDTO,
  ProductOverviewDTO,
  ProductVariantDTO,
  ProductFilterParams,
} from "@/lib/product/product-dto";

export async function getProductCategories(): Promise<{ id?: string; category: string; count: number; order?: number; isDefault?: boolean }[]> {
  try {
    const dbCategoriesPromise: Promise<{ id: string; name: string; order: number; isDefault?: boolean }[]> =
      (prisma as any).productCategory
        ? (prisma as any).productCategory.findMany({ orderBy: { order: "asc" } })
        : prisma.$queryRaw<any[]>`SELECT id, name, "order", "isDefault" FROM "ProductCategory" ORDER BY "order" ASC`;

    const [dbCategories, productCounts] = await Promise.all([
      dbCategoriesPromise,
      prisma.product.groupBy({
        by: ["category"],
        _count: { _all: true },
        where: { category: { not: null } },
      }),
    ]);

    const countMap = new Map<string, number>();
    for (const pc of productCounts) {
      if (pc.category) countMap.set(pc.category.trim().toLowerCase(), pc._count._all);
    }

    if (dbCategories.length === 0) {
      return productCounts
        .filter((r) => r.category && r.category.trim() !== "")
        .map((r) => ({
          category: r.category as string,
          count: r._count._all,
          isDefault: false,
        }));
    }

    return dbCategories.map((c) => ({
      id: c.id,
      category: c.name,
      count: countMap.get(c.name.trim().toLowerCase()) || 0,
      order: c.order,
      isDefault: !!c.isDefault,
    }));
  } catch (err) {
    console.warn("Falling back for categories:", err);
    const productCounts = await prisma.product.groupBy({
      by: ["category"],
      _count: { _all: true },
      where: { category: { not: null } },
    });
    return productCounts
      .filter((r) => r.category && r.category.trim() !== "")
      .map((r) => ({
        category: r.category as string,
        count: r._count._all,
        isDefault: false,
      }));
  }
}

export async function getProductBrands(): Promise<{ id?: string; brand: string; count: number; order?: number; isDefault?: boolean }[]> {
  try {
    const dbBrandsPromise: Promise<{ id: string; name: string; order: number; isDefault?: boolean }[]> =
      (prisma as any).productBrand
        ? (prisma as any).productBrand.findMany({ orderBy: { order: "asc" } })
        : prisma.$queryRaw<any[]>`SELECT id, name, "order", "isDefault" FROM "ProductBrand" ORDER BY "order" ASC`;

    const [dbBrands, productCounts] = await Promise.all([
      dbBrandsPromise,
      prisma.product.groupBy({
        by: ["brand"],
        _count: { _all: true },
        where: { brand: { not: null } },
      }),
    ]);

    const countMap = new Map<string, number>();
    for (const pb of productCounts) {
      if (pb.brand) countMap.set(pb.brand.trim().toLowerCase(), pb._count._all);
    }

    if (dbBrands.length === 0) {
      return productCounts
        .filter((r) => r.brand && r.brand.trim() !== "")
        .map((r) => ({
          brand: r.brand as string,
          count: r._count._all,
          isDefault: false,
        }));
    }

    return dbBrands.map((b) => ({
      id: b.id,
      brand: b.name,
      count: countMap.get(b.name.trim().toLowerCase()) || 0,
      order: b.order,
      isDefault: !!b.isDefault,
    }));
  } catch (err) {
    console.warn("Falling back for brands:", err);
    const productCounts = await prisma.product.groupBy({
      by: ["brand"],
      _count: { _all: true },
      where: { brand: { not: null } },
    });
    return productCounts
      .filter((r) => r.brand && r.brand.trim() !== "")
      .map((r) => ({
        brand: r.brand as string,
        count: r._count._all,
        isDefault: false,
      }));
  }
}

function mapProductToListItemDTO(
  p: Prisma.ProductGetPayload<{
    include: {
      variants: {
        select: {
          id: true;
          formula: true;
          price: true;
          imageUrl: true;
          isDefault: true;
          cartonGrossWeight: true;
        };
      };
    };
  }>
): ProductListItemDTO {
  const variants = p.variants || [];
  const prices = variants.map((v) => v.price).filter((pr) => pr > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

  const defaultVariant = variants.find((v) => v.isDefault) || variants[0];
  const primaryImageUrl =
    defaultVariant?.imageUrl ||
    variants.find((v) => v.imageUrl && v.imageUrl.trim() !== "")?.imageUrl ||
    null;

  const formulas = variants
    .map((v) => v.formula)
    .filter((f): f is string => Boolean(f && f.trim() !== ""));

  const grossWeights = variants
    .map((v) => v.cartonGrossWeight)
    .filter((w): w is number => typeof w === "number" && w > 0);
  const minGrossWeight = grossWeights.length > 0 ? Math.min(...grossWeights) : null;
  const maxGrossWeight = grossWeights.length > 0 ? Math.max(...grossWeights) : null;
  const cartonGrossWeight = defaultVariant?.cartonGrossWeight ?? (grossWeights[0] ?? null);

  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    description: p.description,
    websiteUrl: p.websiteUrl,
    status: p.status,
    starRating: p.starRating || 0,
    hsCode: p.hsCode,
    cbm: p.cbm,
    cartonDimension: p.cartonDimension,
    cartonWidth: p.cartonWidth,
    cartonLength: p.cartonLength,
    cartonHeight: p.cartonHeight,
    cartonQuantity: p.cartonQuantity,
    cartonGrossWeight,
    minGrossWeight,
    maxGrossWeight,
    variantCount: variants.length,
    minPrice,
    maxPrice,
    primaryImageUrl,
    formulas,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    revision: p.updatedAt.toISOString(),
  };
}

export async function getProductsWithFilters({
  status = "AVAILABLE",
  category = "ALL",
  categories = [],
  brand = "ALL",
  brands = [],
  search = "",
  page = 1,
  pageSize = 300,
}: ProductFilterParams = {}): Promise<{
  products: ProductListItemDTO[];
  total: number;
  stats: { availableCount: number; unavailableCount: number; totalCount: number };
}> {
  const where: Prisma.ProductWhereInput = {};
  let hasExtraFilters = false;

  if (status && status !== "ALL") {
    where.status = status;
  }

  if (categories && categories.length > 0) {
    where.category = { in: categories };
    hasExtraFilters = true;
  } else if (category && category !== "ALL" && category.trim()) {
    where.category = { equals: category.trim(), mode: "insensitive" };
    hasExtraFilters = true;
  }

  if (brands && brands.length > 0) {
    where.brand = { in: brands };
    hasExtraFilters = true;
  } else if (brand && brand !== "ALL" && brand.trim()) {
    where.brand = { equals: brand.trim(), mode: "insensitive" };
    hasExtraFilters = true;
  }

  if (search && search.trim()) {
    hasExtraFilters = true;
    const q = search.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { brand: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { hsCode: { contains: q, mode: "insensitive" } },
      {
        variants: {
          some: {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { thaiName: { contains: q, mode: "insensitive" } },
              { formula: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
            ],
          },
        },
      },
    ];
  }

  const skip = Math.max(0, (page - 1) * pageSize);

  const findManyQuery = async () => {
    try {
      return await prisma.product.findMany({
        where,
        include: {
          variants: {
            select: {
              id: true,
              formula: true,
              price: true,
              imageUrl: true,
              isDefault: true,
              cartonGrossWeight: true,
            },
            orderBy: [{ order: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          },
        },
        orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
        skip,
        take: pageSize,
      });
    } catch (err) {
      console.warn("Failed findMany with default orderBy:", err);
      return await prisma.product.findMany({
        where,
        include: {
          variants: {
            select: {
              id: true,
              formula: true,
              price: true,
              imageUrl: true,
              isDefault: true,
              cartonGrossWeight: true,
            },
            orderBy: [{ order: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          },
        },
        orderBy: [{ updatedAt: "desc" }],
        skip,
        take: pageSize,
      });
    }
  };

  // Run findMany and status/filter counts in a single parallel wave
  const [rawProducts, statusGroupCounts, filteredTotal] = await Promise.all([
    findManyQuery(),
    prisma.product.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    hasExtraFilters ? prisma.product.count({ where }) : Promise.resolve<number | null>(null),
  ]);

  let availableCount = 0;
  let unavailableCount = 0;
  for (const row of statusGroupCounts) {
    if (row.status === ProductStatus.AVAILABLE) availableCount = row._count._all;
    else if (row.status === ProductStatus.UNAVAILABLE) unavailableCount = row._count._all;
  }

  const totalCount = availableCount + unavailableCount;
  const total =
    filteredTotal !== null
      ? filteredTotal
      : status === ProductStatus.AVAILABLE
      ? availableCount
      : status === ProductStatus.UNAVAILABLE
      ? unavailableCount
      : totalCount;

  const products = rawProducts.map(mapProductToListItemDTO);

  return {
    products,
    total,
    stats: {
      availableCount,
      unavailableCount,
      totalCount,
    },
  };
}

export async function getCachedInitialProducts(options?: {
  categories?: string[];
  brands?: string[];
}): Promise<{
  products: ProductListItemDTO[];
  total: number;
  stats: { availableCount: number; unavailableCount: number; totalCount: number };
}> {
  return getProductsWithFilters({
    status: ProductStatus.AVAILABLE,
    categories: options?.categories && options.categories.length > 0 ? options.categories : undefined,
    brands: options?.brands && options.brands.length > 0 ? options.brands : undefined,
    search: "",
    page: 1,
    pageSize: 300,
  });
}

export async function getProductOverview(productId: string): Promise<ProductOverviewDTO | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      variants: {
        include: {
          customPrices: {
            include: {
              company: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                },
              },
            },
          },
        },
        orderBy: [
          { order: "asc" },
          { createdAt: "asc" },
          { id: "asc" },
        ],
      },
    },
  });

  if (!product) return null;

  const variants: ProductVariantDTO[] = product.variants.map((v) => ({
    id: v.id,
    productId: v.productId,
    sku: v.sku,
    fullName: v.fullName,
    thaiName: v.thaiName,
    formula: v.formula,
    imageUrl: v.imageUrl,
    price: v.price,
    productCost: v.productCost,
    priceCondition: v.priceCondition,
    netWeight: v.netWeight,
    cartonGrossWeight: v.cartonGrossWeight,
    status: v.status || ProductStatus.AVAILABLE,
    isDefault: v.isDefault,
    order: v.order ?? 0,
    customPrices: v.customPrices.map((cp) => ({
      id: cp.id,
      companyId: cp.companyId,
      companyName: cp.company.displayName || cp.company.name,
      price: cp.price,
    })),
  }));

  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
    websiteUrl: product.websiteUrl,
    status: product.status,
    starRating: product.starRating || 0,
    hsCode: product.hsCode,
    cartonDimension: product.cartonDimension,
    cartonWidth: product.cartonWidth,
    cartonLength: product.cartonLength,
    cartonHeight: product.cartonHeight,
    cbm: product.cbm,
    cartonQuantity: product.cartonQuantity,
    remark: product.remark,
    variants,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export async function updateProductStarRating(
  productId: string,
  starRating: number
): Promise<{ success: boolean; starRating: number; updatedAt: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  const clamped = Math.max(0, Math.min(5, Math.round(starRating)));
  const updated = await prisma.product.update({
    where: { id: productId },
    data: { starRating: clamped },
    select: { starRating: true, updatedAt: true },
  });

  return {
    success: true,
    starRating: updated.starRating,
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function updateProductStatus(
  productId: string,
  status: ProductStatus
): Promise<{ success: boolean; status: ProductStatus; updatedAt: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  const [updated] = await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { status },
      select: { status: true, updatedAt: true },
    }),
    prisma.productVariant.updateMany({
      where: { productId },
      data: { status },
    }),
  ]);

  return {
    success: true,
    status: updated.status,
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function updateVariantPrice(
  variantId: string,
  data: {
    price?: number;
    productCost?: number | null;
    priceCondition?: string | null;
    imageUrl?: string | null;
    status?: ProductStatus;
  }
): Promise<{ success: boolean; variantId: string; updatedAt: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  const updated = await prisma.productVariant.update({
    where: { id: variantId },
    data: {
      ...(data.price !== undefined ? { price: data.price } : {}),
      ...(data.productCost !== undefined ? { productCost: data.productCost } : {}),
      ...(data.priceCondition !== undefined ? { priceCondition: data.priceCondition } : {}),
      ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
    },
    select: { id: true, updatedAt: true, productId: true },
  });

  // If status was changed, synchronize parent product status
  if (data.status !== undefined) {
    const allVariants = await prisma.productVariant.findMany({
      where: { productId: updated.productId },
      select: { status: true },
    });
    const hasAvailable = allVariants.some((v) => v.status === ProductStatus.AVAILABLE);
    await prisma.product.update({
      where: { id: updated.productId },
      data: {
        status: hasAvailable ? ProductStatus.AVAILABLE : ProductStatus.UNAVAILABLE,
        updatedAt: new Date(),
      },
    });
  } else {
    // Touch parent product updatedAt for cache invalidation
    await prisma.product.update({
      where: { id: updated.productId },
      data: { updatedAt: new Date() },
    });
  }

  return {
    success: true,
    variantId: updated.id,
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function updateVariantStatus(
  variantId: string,
  status: ProductStatus
): Promise<{
  success: boolean;
  variantId: string;
  status: ProductStatus;
  productStatus: ProductStatus;
  updatedAt: string;
}> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  const updated = await prisma.productVariant.update({
    where: { id: variantId },
    data: { status },
    select: { id: true, updatedAt: true, productId: true, status: true },
  });

  // Calculate parent product status based on all variants
  const allVariants = await prisma.productVariant.findMany({
    where: { productId: updated.productId },
    select: { status: true },
  });
  const hasAvailable = allVariants.some((v) => v.status === ProductStatus.AVAILABLE);
  const nextProductStatus = hasAvailable ? ProductStatus.AVAILABLE : ProductStatus.UNAVAILABLE;

  await prisma.product.update({
    where: { id: updated.productId },
    data: {
      status: nextProductStatus,
      updatedAt: new Date(),
    },
  });

  return {
    success: true,
    variantId: updated.id,
    status: updated.status,
    productStatus: nextProductStatus,
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function setDefaultVariant(
  productId: string,
  variantId: string
): Promise<{ success: boolean; productId: string; variantId: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.$transaction([
    prisma.productVariant.updateMany({
      where: { productId, isDefault: true },
      data: { isDefault: false },
    }),
    prisma.productVariant.update({
      where: { id: variantId },
      data: { isDefault: true },
    }),
    prisma.product.update({
      where: { id: productId },
      data: { updatedAt: new Date() },
    }),
  ]);

  return {
    success: true,
    productId,
    variantId,
  };
}


export async function updateProductDetails(
  productId: string,
  data: {
    name?: string;
    brand?: string | null;
    category?: string | null;
    description?: string | null;
    websiteUrl?: string | null;
    imageUrl?: string | null;
    hsCode?: string | null;
    cartonDimension?: string | null;
    cartonWidth?: number | null;
    cartonLength?: number | null;
    cartonHeight?: number | null;
    cbm?: number | null;
    cartonQuantity?: number | null;
    remark?: string | null;
    starRating?: number;
  }
): Promise<{ success: boolean; product: ProductListItemDTO }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.brand !== undefined ? { brand: data.brand } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.websiteUrl !== undefined ? { websiteUrl: data.websiteUrl } : {}),
      ...(data.hsCode !== undefined ? { hsCode: data.hsCode } : {}),
      ...(data.cartonDimension !== undefined ? { cartonDimension: data.cartonDimension } : {}),
      ...(data.cartonWidth !== undefined ? { cartonWidth: data.cartonWidth } : {}),
      ...(data.cartonLength !== undefined ? { cartonLength: data.cartonLength } : {}),
      ...(data.cartonHeight !== undefined ? { cartonHeight: data.cartonHeight } : {}),
      ...(data.cbm !== undefined ? { cbm: data.cbm } : {}),
      ...(data.cartonQuantity !== undefined ? { cartonQuantity: data.cartonQuantity } : {}),
      ...(data.remark !== undefined ? { remark: data.remark } : {}),
      ...(data.starRating !== undefined ? { starRating: data.starRating } : {}),
    },
    include: {
      variants: {
        select: {
          id: true,
          price: true,
          productCost: true,
          formula: true,
          imageUrl: true,
          isDefault: true,
          cartonGrossWeight: true,
        },
      },
    },
  });

  // If imageUrl was provided, update default variant image
  if (data.imageUrl !== undefined) {
    const defaultVar = updated.variants.find((v) => v.isDefault) || updated.variants[0];
    if (defaultVar) {
      await prisma.productVariant.update({
        where: { id: defaultVar.id },
        data: { imageUrl: data.imageUrl },
      });
    }
  }

  return {
    success: true,
    product: mapProductToListItemDTO(updated),
  };
}

export async function createProduct(data: {
  name: string;
  brand?: string | null;
  category?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  price?: number;
  productCost?: number | null;
  priceCondition?: string | null;
  cbm?: number | null;
  cartonQuantity?: number | null;
  remark?: string | null;
  starRating?: number;
}): Promise<{ success: boolean; product: ProductListItemDTO }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  const created = await prisma.product.create({
    data: {
      name: data.name.trim(),
      brand: data.brand?.trim() || null,
      category: data.category?.trim() || null,
      description: data.description?.trim() || null,
      cbm: data.cbm ?? null,
      cartonQuantity: data.cartonQuantity ?? null,
      remark: data.remark?.trim() || null,
      starRating: data.starRating ?? 0,
      status: ProductStatus.AVAILABLE,
      variants: {
        create: {
          fullName: data.name.trim(),
          formula: "Standard",
          imageUrl: data.imageUrl?.trim() || null,
          price: data.price ?? 0,
          productCost: data.productCost ?? null,
          priceCondition: data.priceCondition?.trim() || null,
          isDefault: true,
        },
      },
    },
    include: {
      variants: {
        select: {
          id: true,
          price: true,
          productCost: true,
          formula: true,
          imageUrl: true,
          isDefault: true,
          cartonGrossWeight: true,
        },
      },
    },
  });

  return {
    success: true,
    product: mapProductToListItemDTO(created),
  };
}

export async function upsertCompanyPrice(
  variantId: string,
  companyId: string,
  price: number
): Promise<{ success: boolean }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.companyPrice.upsert({
    where: {
      variantId_companyId: {
        variantId,
        companyId,
      },
    },
    create: {
      variantId,
      companyId,
      price,
    },
    update: {
      price,
    },
  });

  return { success: true };
}

export async function saveProductAll(
  productId: string,
  payload: {
    details: {
      name?: string;
      brand?: string | null;
      category?: string | null;
      description?: string | null;
      websiteUrl?: string | null;
      imageUrl?: string | null;
      hsCode?: string | null;
      cartonDimension?: string | null;
      cartonWidth?: number | null;
      cartonLength?: number | null;
      cartonHeight?: number | null;
      cbm?: number | null;
      cartonQuantity?: number | null;
      remark?: string | null;
      starRating?: number;
    };
    variants?: Array<{
      id: string;
      price?: number;
      productCost?: number | null;
      priceCondition?: string | null;
      imageUrl?: string | null;
      status?: ProductStatus;
    }>;
    primaryVariantId?: string | null;
    customerPrices?: Array<{
      variantId: string;
      companyId: string;
      price: number;
    }>;
  }
): Promise<{
  success: boolean;
  product: ProductListItemDTO;
  overview: ProductOverviewDTO;
}> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  const { details, variants = [], primaryVariantId, customerPrices = [] } = payload;
  const ops: Prisma.PrismaPromise<any>[] = [];

  if (primaryVariantId) {
    ops.push(
      prisma.productVariant.updateMany({
        where: { productId, isDefault: true, id: { not: primaryVariantId } },
        data: { isDefault: false },
      })
    );
  }

  const updatedVariantIds = new Set<string>();
  for (const v of variants) {
    updatedVariantIds.add(v.id);
    ops.push(
      prisma.productVariant.update({
        where: { id: v.id },
        data: {
          ...(v.price !== undefined ? { price: v.price } : {}),
          ...(v.productCost !== undefined ? { productCost: v.productCost } : {}),
          ...(v.priceCondition !== undefined ? { priceCondition: v.priceCondition } : {}),
          ...(v.imageUrl !== undefined ? { imageUrl: v.imageUrl } : {}),
          ...(v.status !== undefined ? { status: v.status } : {}),
          ...(primaryVariantId === v.id ? { isDefault: true } : {}),
        },
      })
    );
  }

  if (primaryVariantId && !updatedVariantIds.has(primaryVariantId)) {
    ops.push(
      prisma.productVariant.update({
        where: { id: primaryVariantId },
        data: {
          isDefault: true,
          ...(details.imageUrl !== undefined ? { imageUrl: details.imageUrl } : {}),
        },
      })
    );
  }

  for (const cp of customerPrices) {
    if (cp.price > 0) {
      ops.push(
        prisma.companyPrice.upsert({
          where: {
            variantId_companyId: {
              variantId: cp.variantId,
              companyId: cp.companyId,
            },
          },
          create: {
            variantId: cp.variantId,
            companyId: cp.companyId,
            price: cp.price,
          },
          update: {
            price: cp.price,
          },
        })
      );
    }
  }

  const productUpdatePromise = prisma.product.update({
    where: { id: productId },
    data: {
      ...(details.name !== undefined ? { name: details.name } : {}),
      ...(details.brand !== undefined ? { brand: details.brand } : {}),
      ...(details.category !== undefined ? { category: details.category } : {}),
      ...(details.description !== undefined ? { description: details.description } : {}),
      ...(details.websiteUrl !== undefined ? { websiteUrl: details.websiteUrl } : {}),
      ...(details.hsCode !== undefined ? { hsCode: details.hsCode } : {}),
      ...(details.cartonDimension !== undefined ? { cartonDimension: details.cartonDimension } : {}),
      ...(details.cartonWidth !== undefined ? { cartonWidth: details.cartonWidth } : {}),
      ...(details.cartonLength !== undefined ? { cartonLength: details.cartonLength } : {}),
      ...(details.cartonHeight !== undefined ? { cartonHeight: details.cartonHeight } : {}),
      ...(details.cbm !== undefined ? { cbm: details.cbm } : {}),
      ...(details.cartonQuantity !== undefined ? { cartonQuantity: details.cartonQuantity } : {}),
      ...(details.remark !== undefined ? { remark: details.remark } : {}),
      ...(details.starRating !== undefined ? { starRating: details.starRating } : {}),
      updatedAt: new Date(),
    },
    include: {
      variants: {
        include: {
          customPrices: {
            include: {
              company: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                },
              },
            },
          },
        },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      },
    },
  });

  ops.push(productUpdatePromise);

  const txResults = await prisma.$transaction(ops);
  const updatedProduct = txResults[txResults.length - 1] as Prisma.ProductGetPayload<{
    include: {
      variants: {
        include: {
          customPrices: {
            include: {
              company: {
                select: {
                  id: true;
                  name: true;
                  displayName: true;
                };
              };
            };
          };
        };
      };
    };
  }>;

  // Synchronize parent status if any variant status was modified
  const anyVariantStatusChanged = variants.some((v) => v.status !== undefined);
  if (anyVariantStatusChanged && updatedProduct.variants.length > 0) {
    const hasAvailable = updatedProduct.variants.some(
      (v) => v.status === ProductStatus.AVAILABLE
    );
    const nextStatus = hasAvailable
      ? ProductStatus.AVAILABLE
      : ProductStatus.UNAVAILABLE;
    if (updatedProduct.status !== nextStatus) {
      await prisma.product.update({
        where: { id: productId },
        data: { status: nextStatus },
      });
      updatedProduct.status = nextStatus;
    }
  }

  const overview: ProductOverviewDTO = {
    id: updatedProduct.id,
    name: updatedProduct.name,
    brand: updatedProduct.brand,
    category: updatedProduct.category,
    description: updatedProduct.description,
    websiteUrl: updatedProduct.websiteUrl,
    status: updatedProduct.status,
    starRating: updatedProduct.starRating || 0,
    hsCode: updatedProduct.hsCode,
    cartonDimension: updatedProduct.cartonDimension,
    cartonWidth: updatedProduct.cartonWidth,
    cartonLength: updatedProduct.cartonLength,
    cartonHeight: updatedProduct.cartonHeight,
    cbm: updatedProduct.cbm,
    cartonQuantity: updatedProduct.cartonQuantity,
    remark: updatedProduct.remark,
    variants: updatedProduct.variants.map((v) => ({
      id: v.id,
      productId: v.productId,
      sku: v.sku,
      fullName: v.fullName,
      thaiName: v.thaiName,
      formula: v.formula,
      imageUrl: v.imageUrl,
      price: v.price,
      productCost: v.productCost,
      priceCondition: v.priceCondition,
      netWeight: v.netWeight,
      cartonGrossWeight: v.cartonGrossWeight,
      status: v.status || ProductStatus.AVAILABLE,
      isDefault: v.isDefault,
      order: v.order ?? 0,
      customPrices: v.customPrices.map((cp) => ({
        id: cp.id,
        companyId: cp.companyId,
        companyName: cp.company.displayName || cp.company.name,
        price: cp.price,
      })),
    })),
    createdAt: updatedProduct.createdAt.toISOString(),
    updatedAt: updatedProduct.updatedAt.toISOString(),
  };

  return {
    success: true,
    product: mapProductToListItemDTO(updatedProduct),
    overview,
  };
}

// Taxonomy Management Actions (Manage Categories & Brands)
export async function createTaxonomyCategory(name: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name required");

  const last = await prisma.productCategory.findFirst({ orderBy: { order: "desc" } });
  const created = await prisma.productCategory.create({
    data: { name: trimmed, order: (last?.order ?? -1) + 1 },
  });
  return created;
}

export async function updateTaxonomyCategory(id: string, name: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");
  const trimmed = name.trim();
  const existing = await prisma.productCategory.findUnique({ where: { id } });
  if (!existing) throw new Error("Category not found");

  const updated = await prisma.productCategory.update({
    where: { id },
    data: { name: trimmed },
  });

  // Cascade rename to existing products
  await prisma.product.updateMany({
    where: { category: existing.name },
    data: { category: trimmed },
  });

  return updated;
}

export async function deleteTaxonomyCategory(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");
  return prisma.productCategory.delete({ where: { id } });
}

export async function reorderTaxonomyCategories(orderedIds: string[]) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.productCategory.update({
        where: { id },
        data: { order: index },
      })
    )
  );
  return { success: true };
}

export async function toggleDefaultTaxonomyCategory(
  id: string,
  isDefault?: boolean
): Promise<{ success: boolean; id: string; isDefault: boolean }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  const existing = await prisma.productCategory.findUnique({ where: { id } });
  if (!existing) throw new Error("Category not found");

  const nextVal = isDefault !== undefined ? isDefault : !existing.isDefault;
  await prisma.productCategory.update({
    where: { id },
    data: { isDefault: nextVal },
  });

  return { success: true, id, isDefault: nextVal };
}

export async function clearAllDefaultCategories(): Promise<{ success: boolean }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.productCategory.updateMany({
    data: { isDefault: false },
  });

  return { success: true };
}

export async function setDefaultTaxonomyCategory(
  id: string | null,
  isDefault?: boolean
): Promise<{ success: boolean; defaultId: string | null }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  if (!id) {
    await prisma.productCategory.updateMany({
      data: { isDefault: false },
    });
    return { success: true, defaultId: null };
  }

  const existing = await prisma.productCategory.findUnique({ where: { id } });
  if (!existing) throw new Error("Category not found");

  const nextVal = isDefault !== undefined ? isDefault : !existing.isDefault;
  await prisma.productCategory.update({
    where: { id },
    data: { isDefault: nextVal },
  });

  return { success: true, defaultId: nextVal ? id : null };
}

export async function createTaxonomyBrand(name: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Brand name required");

  const last = await prisma.productBrand.findFirst({ orderBy: { order: "desc" } });
  const created = await prisma.productBrand.create({
    data: { name: trimmed, order: (last?.order ?? -1) + 1 },
  });
  return created;
}

export async function updateTaxonomyBrand(id: string, name: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");
  const trimmed = name.trim();
  const existing = await prisma.productBrand.findUnique({ where: { id } });
  if (!existing) throw new Error("Brand not found");

  const updated = await prisma.productBrand.update({
    where: { id },
    data: { name: trimmed },
  });

  // Cascade rename to existing products
  await prisma.product.updateMany({
    where: { brand: existing.name },
    data: { brand: trimmed },
  });

  return updated;
}

export async function deleteTaxonomyBrand(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");
  return prisma.productBrand.delete({ where: { id } });
}

export async function reorderTaxonomyBrands(orderedIds: string[]) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.productBrand.update({
        where: { id },
        data: { order: index },
      })
    )
  );
  return { success: true };
}

export async function toggleDefaultTaxonomyBrand(
  id: string,
  isDefault?: boolean
): Promise<{ success: boolean; id: string; isDefault: boolean }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  const existing = await prisma.productBrand.findUnique({ where: { id } });
  if (!existing) throw new Error("Brand not found");

  const nextVal = isDefault !== undefined ? isDefault : !existing.isDefault;
  await prisma.productBrand.update({
    where: { id },
    data: { isDefault: nextVal },
  });

  return { success: true, id, isDefault: nextVal };
}

export async function clearAllDefaultBrands(): Promise<{ success: boolean }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.productBrand.updateMany({
    data: { isDefault: false },
  });

  return { success: true };
}

export async function setDefaultTaxonomyBrand(
  id: string | null,
  isDefault?: boolean
): Promise<{ success: boolean; defaultId: string | null }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  if (!id) {
    await prisma.productBrand.updateMany({
      data: { isDefault: false },
    });
    return { success: true, defaultId: null };
  }

  const existing = await prisma.productBrand.findUnique({ where: { id } });
  if (!existing) throw new Error("Brand not found");

  const nextVal = isDefault !== undefined ? isDefault : !existing.isDefault;
  await prisma.productBrand.update({
    where: { id },
    data: { isDefault: nextVal },
  });

  return { success: true, defaultId: nextVal ? id : null };
}

export async function reorderProductVariants(
  productId: string,
  orderedVariantIds: string[]
): Promise<{ success: boolean; productId: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.$transaction(
    orderedVariantIds.map((id, index) =>
      prisma.productVariant.update({
        where: { id },
        data: { order: index },
      })
    )
  );

  await prisma.product.update({
    where: { id: productId },
    data: { updatedAt: new Date() },
  });

  return { success: true, productId };
}

export async function getBatchProductOverviews(
  productIds: string[]
): Promise<ProductOverviewDTO[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");
  if (!productIds || productIds.length === 0) return [];

  const rawProducts = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: {
      variants: {
        include: {
          customPrices: {
            include: {
              company: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                },
              },
            },
          },
        },
        orderBy: [
          { order: "asc" },
          { createdAt: "asc" },
          { id: "asc" },
        ],
      },
    },
  });

  return rawProducts.map((product) => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
    websiteUrl: product.websiteUrl,
    status: product.status,
    starRating: product.starRating || 0,
    hsCode: product.hsCode,
    cartonDimension: product.cartonDimension,
    cartonWidth: product.cartonWidth,
    cartonLength: product.cartonLength,
    cartonHeight: product.cartonHeight,
    cbm: product.cbm,
    cartonQuantity: product.cartonQuantity,
    remark: product.remark,
    variants: product.variants.map((v) => ({
      id: v.id,
      productId: v.productId,
      sku: v.sku,
      fullName: v.fullName,
      thaiName: v.thaiName,
      formula: v.formula,
      imageUrl: v.imageUrl,
      price: v.price,
      productCost: v.productCost,
      priceCondition: v.priceCondition,
      netWeight: v.netWeight,
      cartonGrossWeight: v.cartonGrossWeight,
      status: v.status || ProductStatus.AVAILABLE,
      isDefault: v.isDefault,
      order: v.order ?? 0,
      customPrices: (v.customPrices || []).map((cp) => ({
        id: cp.id,
        companyId: cp.companyId,
        companyName: cp.company?.displayName || cp.company?.name || "Unknown",
        price: cp.price,
      })),
    })),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  }));
}

