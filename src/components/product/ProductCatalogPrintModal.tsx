"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  X,
  Printer,
  SlidersHorizontal,
  RotateCcw,
  Package,
  Edit3,
  Layers,
  Scale,
  Box,
  Sparkles,
  DollarSign,
  Truck,
  Hash,
  Image as ImageIcon,
  FileText,
  Check,
  LayoutGrid,
  List,
  FileSpreadsheet,
  FolderTree,
  Flame,
} from "lucide-react";
import {
  ProductListItemDTO,
  ProductOverviewDTO,
  parsePriceConditions,
  calculateTierPrice,
  PriceStepTier,
} from "@/lib/product/product-dto";
import { getBatchProductOverviews } from "@/lib/actions/product";
import { getOptimizedCloudinaryUrl } from "@/lib/utils";
import { SBHeader } from "@/components/common/SBHeader";

interface ProductCatalogPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProducts: ProductListItemDTO[];
  allProducts?: ProductListItemDTO[];
  availableCategories?: { id?: string; category: string; count: number; order?: number; isDefault?: boolean }[];
  availableBrands?: { id?: string; brand: string; count: number; order?: number; isDefault?: boolean }[];
  isExplicitSelection?: boolean;
}

// Concentric circle bullet matching the user screenshot exactly
const BulletIcon = () => (
  <span className="inline-flex items-center justify-center w-3.5 h-3.5 shrink-0 text-slate-500 mr-2 mt-[2px]">
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.8" fill="currentColor" />
    </svg>
  </span>
);

const formatDimension = (dim?: string | null): string => {
  if (!dim || !dim.trim()) return "—";
  const trimmed = dim.trim();
  if (trimmed.toLowerCase().endsWith("cm")) return trimmed;
  return `${trimmed} cm`;
};

interface ModernToggleRowProps {
  icon: React.ReactNode;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}

const ModernToggleRow = ({
  icon,
  label,
  description,
  checked,
  onChange,
}: ModernToggleRowProps) => {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between pb-0.5 rounded-xl hover:bg-[#353638] transition-colors cursor-pointer group text-left select-none"
    >
      <div className="flex items-center gap-2.5 min-w-0 pr-2">
        <span
          className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
            checked
              ? "bg-[#C7F33C]/10 text-[#C7F33C]"
              : "bg-[#353638] text-slate-400 group-hover:text-slate-300"
          }`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p
            className={`text-xs font-medium truncate transition-colors ${
              checked ? "text-slate-100 font-semibold" : "text-slate-400"
            }`}
          >
            {label}
          </p>
          {description && (
            <p className="text-[10px] text-slate-500 truncate leading-none mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Modern switch track & thumb */}
      <div
        className={`w-8 h-4.5 rounded-full transition-colors relative flex items-center px-0.5 shrink-0 ${
          checked ? "bg-[#C7F33C]" : "bg-[#353638]"
        }`}
      >
        <span
          className={`w-3.5 h-3.5 rounded-full bg-black shadow-xs transition-transform transform ${
            checked ? "translate-x-3.5 bg-black" : "translate-x-0 bg-slate-400"
          }`}
        />
      </div>
    </button>
  );
};

// Reliable Product Image with fallback
function CatalogProductImage({
  src,
  size = 400,
  className,
  iconSize = "w-10 h-10",
  crop = "fill",
}: {
  src?: string | null;
  size?: number;
  className?: string;
  iconSize?: string;
  crop?: string;
}) {
  const [hasError, setHasError] = useState(false);
  const optimizedSrc = getOptimizedCloudinaryUrl(src, size, crop);

  if (!optimizedSrc || hasError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#F8F9FA] text-slate-300 aspect-square">
        <Package className={`${iconSize} text-slate-300 stroke-[1.25]`} />
      </div>
    );
  }

  return (
    <img
      src={optimizedSrc}
      alt=""
      className={className}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

export function ProductCatalogPrintModal({
  isOpen,
  onClose,
  selectedProducts,
  allProducts = [],
  availableCategories = [],
  availableBrands = [],
  isExplicitSelection = false,
}: ProductCatalogPrintModalProps) {
  // Direct selected products passed from the main product list
  const effectiveSelectedProducts = selectedProducts;

  // Details cache fetched from server
  const [detailsCache, setDetailsCache] = useState<Record<string, ProductOverviewDTO>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Specification Filters (Toggles)
  const [showImage, setShowImage] = useState(true);
  const [showType, setShowType] = useState(true);
  const [showTopSell, setShowTopSell] = useState(true);
  const [showFormulas, setShowFormulas] = useState(true);
  const [showHsCode, setShowHsCode] = useState(true);
  const [showCartonGrossWeight, setShowCartonGrossWeight] = useState(true);
  const [showCartonDimension, setShowCartonDimension] = useState(true);
  const [showCartonQuantity, setShowCartonQuantity] = useState(true);
  const [showCbmContainer, setShowCbmContainer] = useState(false);

  // Pricing Filters (Toggles)
  const [showExportPrice, setShowExportPrice] = useState(true);
  const [showStepPrice, setShowStepPrice] = useState(false);
  const [maxSteps, setMaxSteps] = useState<number | "all">("all");
  const [showExclusiveDistributor, setShowExclusiveDistributor] = useState(false);

  // Document Options (Quotation Header & Footer)
  const [showDocHeader, setShowDocHeader] = useState(true);
  const [showDocFooter, setShowDocFooter] = useState(true);

  // Layout Style: "grid" vs "list"
  const [layoutMode, setLayoutMode] = useState<"grid" | "list">("grid");

  // Sort State: "type" | "brand" | "default"
  const [sortBy, setSortBy] = useState<"type" | "brand" | "default">("type");

  // Group by Category Toggle
  const [groupByCategory, setGroupByCategory] = useState(false);

  // Pricing Mode: Auto vs Manual Overrides
  const [pricingMode, setPricingMode] = useState<"auto" | "manual">("auto");
  const [manualOverrides, setManualOverrides] = useState<
    Record<
      string,
      Record<
        string,
        {
          exportPrice?: number;
          stepPrices?: Record<number, number>;
        }
      >
    >
  >({});

  // Fetch missing product details reactively
  useEffect(() => {
    if (!isOpen || effectiveSelectedProducts.length === 0) return;
    const missingIds = effectiveSelectedProducts
      .map((p) => p.id)
      .filter((id) => !detailsCache[id]);

    if (missingIds.length === 0) return;

    let isMounted = true;
    setIsLoading(true);

    getBatchProductOverviews(missingIds)
      .then((res) => {
        if (isMounted && res) {
          setDetailsCache((prev) => {
            const next = { ...prev };
            res.forEach((dp) => {
              next[dp.id] = dp;
            });
            return next;
          });
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error("Error fetching product details for print:", err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, effectiveSelectedProducts, detailsCache]);

  // Combine detailed products with sp
  const combinedProducts = useMemo(() => {
    return effectiveSelectedProducts.map((sp) => {
      const detailed = detailsCache[sp.id] || null;
      return {
        sp,
        dp: detailed,
      };
    });
  }, [effectiveSelectedProducts, detailsCache]);

  // Sorted products based on sortBy selection
  const sortedProducts = useMemo(() => {
    const list = [...combinedProducts];
    if (sortBy === "type") {
      return list.sort((a, b) => {
        const catA = a.sp.category || "General";
        const catB = b.sp.category || "General";
        const catComp = catA.localeCompare(catB);
        if (catComp !== 0) return catComp;
        return a.sp.name.localeCompare(b.sp.name);
      });
    }
    if (sortBy === "brand") {
      return list.sort((a, b) => {
        const brandA = a.sp.brand || "General";
        const brandB = b.sp.brand || "General";
        const brandComp = brandA.localeCompare(brandB);
        if (brandComp !== 0) return brandComp;
        return a.sp.name.localeCompare(b.sp.name);
      });
    }
    return list;
  }, [combinedProducts, sortBy]);

  // Group sortedProducts by Category
  const groupedCategoryList = useMemo(() => {
    const categoryMap = new Map<string, typeof sortedProducts>();
    sortedProducts.forEach((item) => {
      const cat = item.sp.category?.trim() || "General";
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, []);
      }
      categoryMap.get(cat)!.push(item);
    });

    const categoryOrderMap = new Map<string, number>();
    availableCategories.forEach((cat, idx) => {
      categoryOrderMap.set(
        cat.category.toLowerCase().trim(),
        typeof cat.order === "number" ? cat.order : idx
      );
    });

    return Array.from(categoryMap.entries())
      .sort(([catA], [catB]) => {
        const orderA = categoryOrderMap.get(catA.toLowerCase().trim());
        const orderB = categoryOrderMap.get(catB.toLowerCase().trim());
        if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
        if (orderA !== undefined) return -1;
        if (orderB !== undefined) return 1;
        return catA.localeCompare(catB);
      })
      .map(([category, items]) => ({
        category,
        items,
      }));
  }, [sortedProducts, availableCategories]);

  // List View sections: Flat or Grouped by Category
  const listSections = useMemo(() => {
    if (groupByCategory) {
      return groupedCategoryList;
    }
    return [{ category: "", items: sortedProducts }];
  }, [groupByCategory, groupedCategoryList, sortedProducts]);

  // For Grid Lookbook layout: Chunk into pages of 4 items (2x2 per page)
  // When groupByCategory is enabled, pages are partitioned per category
  const pageSize = 4;
  interface CatalogGridPage {
    category?: string;
    categoryTotalCount?: number;
    categoryPageIdx?: number;
    categoryTotalPages?: number;
    items: typeof sortedProducts;
  }

  const catalogPages = useMemo<CatalogGridPage[]>(() => {
    if (!groupByCategory) {
      const pages: CatalogGridPage[] = [];
      for (let i = 0; i < sortedProducts.length; i += pageSize) {
        pages.push({
          items: sortedProducts.slice(i, i + pageSize),
        });
      }
      return pages;
    }

    const pages: CatalogGridPage[] = [];
    groupedCategoryList.forEach(({ category, items }) => {
      const categoryTotalCount = items.length;
      const categoryTotalPages = Math.ceil(categoryTotalCount / pageSize);
      for (let i = 0; i < categoryTotalCount; i += pageSize) {
        pages.push({
          category,
          categoryTotalCount,
          categoryPageIdx: Math.floor(i / pageSize),
          categoryTotalPages,
          items: items.slice(i, i + pageSize),
        });
      }
    });

    return pages;
  }, [sortedProducts, pageSize, groupByCategory, groupedCategoryList]);

  // Print Action
  const handlePrint = () => {
    window.print();
  };

  // Helper to update manual price
  const updateManualPrice = (
    productId: string,
    variantId: string,
    field: "exportPrice",
    val: number
  ) => {
    setManualOverrides((prev) => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || {}),
        [variantId]: {
          ...(prev[productId]?.[variantId] || {}),
          [field]: val,
        },
      },
    }));
  };

  const updateManualStepPrice = (
    productId: string,
    variantId: string,
    stepIdx: number,
    val: number
  ) => {
    setManualOverrides((prev) => {
      const curVar = prev[productId]?.[variantId] || {};
      const curSteps = curVar.stepPrices || {};
      return {
        ...prev,
        [productId]: {
          ...(prev[productId] || {}),
          [variantId]: {
            ...curVar,
            stepPrices: {
              ...curSteps,
              [stepIdx]: val,
            },
          },
        },
      };
    });
  };

  const resetManualOverrides = () => {
    setManualOverrides({});
  };

  const fmt = (num: number | null | undefined, maxDecimals: number = 2) => {
    if (num === null || num === undefined || isNaN(num)) return "—";
    return num.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals,
    });
  };

  const applyPreset = (preset: "minimal" | "full") => {
    if (preset === "minimal") {
      setShowImage(true);
      setShowType(true);
      setShowTopSell(true);
      setShowFormulas(true);
      setShowHsCode(true);
      setShowCartonGrossWeight(true);
      setShowCartonDimension(true);
      setShowCartonQuantity(true);
      setShowCbmContainer(false);
      setShowExportPrice(true);
      setShowStepPrice(false);
      setShowExclusiveDistributor(false);
      setShowDocHeader(true);
      setShowDocFooter(true);
    } else if (preset === "full") {
      setShowImage(true);
      setShowType(true);
      setShowTopSell(true);
      setShowFormulas(true);
      setShowHsCode(true);
      setShowCartonGrossWeight(true);
      setShowCartonDimension(true);
      setShowCartonQuantity(true);
      setShowCbmContainer(true);
      setShowExportPrice(true);
      setShowStepPrice(true);
      setMaxSteps("all");
      setShowExclusiveDistributor(true);
      setShowDocHeader(true);
      setShowDocFooter(true);
    }
  };

  // Export to CSV (Each row is a variant, Formula / Variant Name is 2nd column)
  const handleExportCSV = () => {
    const headers = [
      "Product Name",
      "Formula / Variant Name",
      "Brand",
      "Category",
      "SKU",
      "Formula Code",
      "HS-Code",
      "Quotation Price (THB)",
      "Step Tier 1",
      "Step Tier 2",
      "Step Tier 3",
      "Exclusive Support",
      "Carton Gross Weight (kg)",
      "Carton Dimensions (cm)",
      "Carton Quantity (pcs)",
      "CBM",
      "20ft Container (ctns)",
      "40ft Container (ctns)",
      "Status",
    ];

    const escapeCsv = (val: unknown) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows: string[] = [headers.map(escapeCsv).join(",")];

    const exportTargetProducts = groupByCategory
      ? groupedCategoryList.flatMap((g) => g.items)
      : sortedProducts;

    exportTargetProducts.forEach(({ sp, dp }) => {
      const variants = dp?.variants || [];
      const fallbackFormulas = sp.formulas || [];

      const grossWeight =
        dp?.variants?.[0]?.cartonGrossWeight ??
        sp.cartonGrossWeight ??
        sp.minGrossWeight ??
        null;
      const dimension = formatDimension(dp?.cartonDimension || sp.cartonDimension);
      const cartonQty = dp?.cartonQuantity || sp.cartonQuantity || "";
      const numericCbm =
        typeof (dp?.cbm || sp.cbm) === "number"
          ? Number(dp?.cbm || sp.cbm)
          : parseFloat((dp?.cbm || sp.cbm) as unknown as string) || 0;
      const cartons20ft = numericCbm > 0 ? Math.floor(28 / numericCbm) : "";
      const cartons40ft = numericCbm > 0 ? Math.floor(58 / numericCbm) : "";

      if (variants.length > 0) {
        variants.forEach((v) => {
          const vOverride = manualOverrides[sp.id]?.[v.id];
          const exportPrice =
            pricingMode === "manual" && vOverride?.exportPrice !== undefined
              ? vOverride.exportPrice
              : v.price || sp.minPrice || 0;

          const tiers = parsePriceConditions(v.priceCondition);
          const tier1Str = tiers[0]
            ? `${tiers[0].minQuantity}-${tiers[0].maxQuantity || "+"} ctns: ฿${fmt(
                calculateTierPrice(exportPrice, tiers[0].discountPercent)
              )}`
            : "";
          const tier2Str = tiers[1]
            ? `${tiers[1].minQuantity}-${tiers[1].maxQuantity || "+"} ctns: ฿${fmt(
                calculateTierPrice(exportPrice, tiers[1].discountPercent)
              )}`
            : "";
          const tier3Str = tiers[2]
            ? `${tiers[2].minQuantity}-${tiers[2].maxQuantity || "+"} ctns: ฿${fmt(
                calculateTierPrice(exportPrice, tiers[2].discountPercent)
              )}`
            : "";

          const vGrossWeight = v.cartonGrossWeight ?? grossWeight;

          rows.push(
            [
              sp.name,
              v.formula || v.fullName || "Standard",
              sp.brand || "",
              sp.category || "",
              v.sku || "",
              v.formula || "",
              sp.hsCode || dp?.hsCode || "",
              exportPrice ? exportPrice.toFixed(2) : "",
              tier1Str,
              tier2Str,
              tier3Str,
              "5% Distribution Support",
              vGrossWeight ? Number(vGrossWeight).toFixed(2) : "",
              dimension === "—" ? "" : dimension,
              cartonQty,
              numericCbm > 0 ? numericCbm.toFixed(4) : "",
              cartons20ft,
              cartons40ft,
              sp.status || "AVAILABLE",
            ]
              .map(escapeCsv)
              .join(",")
          );
        });
      } else if (fallbackFormulas.length > 0) {
        fallbackFormulas.forEach((formulaName) => {
          const vOverride = manualOverrides[sp.id]?.["default"];
          const exportPrice =
            pricingMode === "manual" && vOverride?.exportPrice !== undefined
              ? vOverride.exportPrice
              : sp.minPrice || 0;

          rows.push(
            [
              sp.name,
              formulaName,
              sp.brand || "",
              sp.category || "",
              "",
              "",
              sp.hsCode || dp?.hsCode || "",
              exportPrice ? exportPrice.toFixed(2) : "",
              "",
              "",
              "",
              "5% Distribution Support",
              grossWeight ? Number(grossWeight).toFixed(2) : "",
              dimension === "—" ? "" : dimension,
              cartonQty,
              numericCbm > 0 ? numericCbm.toFixed(4) : "",
              cartons20ft,
              cartons40ft,
              sp.status || "AVAILABLE",
            ]
              .map(escapeCsv)
              .join(",")
          );
        });
      } else {
        const vOverride = manualOverrides[sp.id]?.["default"];
        const exportPrice =
          pricingMode === "manual" && vOverride?.exportPrice !== undefined
            ? vOverride.exportPrice
            : sp.minPrice || 0;

        rows.push(
          [
            sp.name,
            "Standard",
            sp.brand || "",
            sp.category || "",
            "",
            "",
            sp.hsCode || dp?.hsCode || "",
            exportPrice ? exportPrice.toFixed(2) : "",
            "",
            "",
            "",
            "5% Distribution Support",
            grossWeight ? Number(grossWeight).toFixed(2) : "",
            dimension === "—" ? "" : dimension,
            cartonQty,
            numericCbm > 0 ? numericCbm.toFixed(4) : "",
            cartons20ft,
            cartons40ft,
            sp.status || "AVAILABLE",
          ]
            .map(escapeCsv)
            .join(",")
        );
      }
    });

    const csvContent = rows.join("\r\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `SB_Product_Catalog_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div
      id="catalog-print-overlay"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
    >
      {/* High-Fidelity Print Stylesheet */}
      <style jsx global>{`
        input.print-manual-input::-webkit-outer-spin-button,
        input.print-manual-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input.print-manual-input {
          -moz-appearance: textfield;
          appearance: textfield;
          field-sizing: content;
        }
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          body {
            background: white !important;
            color: #0f172a !important;
          }
          body * {
            visibility: hidden !important;
          }
          #catalog-print-overlay,
          #catalog-print-overlay * {
            visibility: visible !important;
          }
          #catalog-print-overlay {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            overflow: visible !important;
            display: block !important;
            backdrop-filter: none !important;
            z-index: 99999 !important;
          }
          #catalog-print-card {
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
          }
          .print-flex-container {
            display: block !important;
            overflow: visible !important;
          }
          .print-document-area {
            display: block !important;
            overflow: visible !important;
            background: white !important;
          }
          #catalog-print-scroll-body {
            overflow: visible !important;
            max-height: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }
          #catalog-print-container {
            position: static !important;
            width: 100% !important;
            background: transparent !important;
            color: #0f172a !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          #catalog-print-container * {
            box-shadow: none !important;
          }
          .catalog-page {
            width: 100% !important;
            height: 275mm !important;
            max-height: 275mm !important;
            page-break-after: always !important;
            break-after: page !important;
            margin: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 2mm 0 !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            background: white !important;
            overflow: hidden !important;
          }
          .catalog-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .print-grid-layout {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 16px 20px !important;
          }
          .print-list-layout {
            display: flex !important;
            flex-direction: column !important;
            gap: 8px !important;
          }
          .print-list-card,
          .print-product-card {
            border: 1px solid #e2e8f0 !important;
            border-radius: 8px !important;
            margin-bottom: 8px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            background-color: #ffffff !important;
          }
          .print-category-header {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          .print-category-group {
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          .print-price-panel {
            background-color: #f8fafc !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            border-left: 1px solid #e2e8f0 !important;
          }
          .print-manual-input {
            border: none !important;
            background: transparent !important;
            padding: 0 !important;
            outline: none !important;
            box-shadow: none !important;
            font-weight: inherit !important;
            color: inherit !important;
          }
          .print-hidden {
            display: none !important;
          }
        }
      `}</style>

      {/* Modal Container: Full-height sleek layout without top bar clutter */}
      <div
        id="catalog-print-card"
        className="relative w-full max-w-6xl xl:max-w-7xl h-[94vh] bg-[#1C1D1E] border border-[#3E4042] rounded-2xl flex flex-col overflow-hidden my-auto shadow-2xl"
      >
        {/* Modal Main Body (2-Column Layout: Left Sidebar + Right Printable Document) */}
        <div className="print-flex-container flex-1 min-h-0 flex flex-row overflow-hidden">
          {/* Left Sidebar: Options + Sticky Bottom Export */}
          <aside className="w-72 sm:w-80 shrink-0 bg-[#202123] border-r border-[#353638] flex flex-col h-full print-hidden select-none">
            {/* Sidebar Top: Header Title & Count */}
            <div className="p-3 border-b border-[#353638] flex items-center justify-between gap-2 shrink-0 bg-[#252627]">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#C7F33C]" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Catalog Options
                </span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-[#C7F33C]/15 text-[#C7F33C] border border-[#C7F33C]/30 tabular-nums">
                {effectiveSelectedProducts.length} items
              </span>
            </div>

            {/* Sidebar Options Area (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-4 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                <div className="space-y-4">
                  {/* Presets & View Layout */}
                  <div className="space-y-2 pb-3 border-b border-[#353638]">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Quick Presets
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">Live Sync</span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#18191A] rounded-xl border border-[#353638]">
                      <button
                        type="button"
                        onClick={() => applyPreset("minimal")}
                        className="py-1 px-2 rounded-lg text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-[#353638] transition-colors text-center cursor-pointer"
                      >
                        Minimal
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPreset("full")}
                        className="py-1 px-2 rounded-lg text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-[#353638] transition-colors text-center cursor-pointer"
                      >
                        Full Details
                      </button>
                    </div>

                    {/* Catalog Layout: Grid vs List */}
                    <div className="pt-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-0.5 block mb-1">
                        Catalog Layout
                      </span>
                      <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#18191A] rounded-xl border border-[#353638]">
                        <button
                          type="button"
                          onClick={() => setLayoutMode("grid")}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                            layoutMode === "grid"
                              ? "bg-[#C7F33C] text-black font-bold"
                              : "text-slate-400 hover:text-white hover:bg-[#353638]"
                          }`}
                        >
                          <LayoutGrid className="w-3.5 h-3.5" />
                          <span>Grid View</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setLayoutMode("list")}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                            layoutMode === "list"
                              ? "bg-[#C7F33C] text-black font-bold"
                              : "text-slate-400 hover:text-white hover:bg-[#353638]"
                          }`}
                        >
                          <List className="w-3.5 h-3.5" />
                          <span>List</span>
                        </button>
                      </div>
                    </div>

                    {/* Sort Products */}
                    <div className="pt-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-0.5 block mb-1">
                        Sort Products By
                      </span>
                      <div className="grid grid-cols-3 gap-1 p-1 bg-[#18191A] rounded-xl border border-[#353638]">
                        <button
                          type="button"
                          onClick={() => setSortBy("type")}
                          className={`py-1.5 px-1 rounded-lg text-[10.5px] font-semibold text-center cursor-pointer transition-colors ${
                            sortBy === "type"
                              ? "bg-[#C7F33C] text-black font-bold shadow-2xs"
                              : "text-slate-400 hover:text-white hover:bg-[#353638]"
                          }`}
                        >
                          Type
                        </button>
                        <button
                          type="button"
                          onClick={() => setSortBy("brand")}
                          className={`py-1.5 px-1 rounded-lg text-[10.5px] font-semibold text-center cursor-pointer transition-colors ${
                            sortBy === "brand"
                              ? "bg-[#C7F33C] text-black font-bold shadow-2xs"
                              : "text-slate-400 hover:text-white hover:bg-[#353638]"
                          }`}
                        >
                          Brand
                        </button>
                        <button
                          type="button"
                          onClick={() => setSortBy("default")}
                          className={`py-1.5 px-1 rounded-lg text-[10.5px] font-semibold text-center cursor-pointer transition-colors ${
                            sortBy === "default"
                              ? "bg-[#C7F33C] text-black font-bold shadow-2xs"
                              : "text-slate-400 hover:text-white hover:bg-[#353638]"
                          }`}
                        >
                          Default
                        </button>
                      </div>
                    </div>

                    {/* Group by Category */}
                    <div className="pt-2 border-t border-[#353638]/60">
                      <ModernToggleRow
                        icon={<FolderTree className="w-3.5 h-3.5" />}
                        label="Group by Category"
                        description="Divide catalog by category sections"
                        checked={groupByCategory}
                        onChange={setGroupByCategory}
                      />
                    </div>
                  </div>

                  {/* Specification Toggles */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 block mb-1">
                      Product Specifications
                    </span>
                    <ModernToggleRow
                      icon={<ImageIcon className="w-3.5 h-3.5" />}
                      label="Product Image"
                      checked={showImage}
                      onChange={setShowImage}
                    />
                    <ModernToggleRow
                      icon={<Layers className="w-3.5 h-3.5" />}
                      label="Product Type"
                      checked={showType}
                      onChange={setShowType}
                    />
                    <ModernToggleRow
                      icon={<Flame className="w-3.5 h-3.5" />}
                      label="Top Sell Badge"
                      checked={showTopSell}
                      onChange={setShowTopSell}
                    />
                    <ModernToggleRow
                      icon={<Box className="w-3.5 h-3.5" />}
                      label="Formulas List"
                      checked={showFormulas}
                      onChange={setShowFormulas}
                    />
                    <ModernToggleRow
                      icon={<Hash className="w-3.5 h-3.5" />}
                      label="HS-Code"
                      checked={showHsCode}
                      onChange={setShowHsCode}
                    />
                    <ModernToggleRow
                      icon={<Scale className="w-3.5 h-3.5" />}
                      label="Carton GW (kg)"
                      checked={showCartonGrossWeight}
                      onChange={setShowCartonGrossWeight}
                    />
                    <ModernToggleRow
                      icon={<Box className="w-3.5 h-3.5" />}
                      label="Carton Dimensions (cm)"
                      checked={showCartonDimension}
                      onChange={setShowCartonDimension}
                    />
                    <ModernToggleRow
                      icon={<Package className="w-3.5 h-3.5" />}
                      label="Carton Quantity"
                      checked={showCartonQuantity}
                      onChange={setShowCartonQuantity}
                    />
                    <ModernToggleRow
                      icon={<Truck className="w-3.5 h-3.5" />}
                      label="Container (20/40ft)"
                      checked={showCbmContainer}
                      onChange={setShowCbmContainer}
                    />
                  </div>

                  {/* Pricing Columns Toggles */}
                  <div className="space-y-1 pt-3 border-t border-[#353638]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 block mb-1">
                      Price Display
                    </span>
                    <ModernToggleRow
                      icon={<DollarSign className="w-3.5 h-3.5" />}
                      label="Export Price"
                      description="Standard quotation"
                      checked={showExportPrice}
                      onChange={setShowExportPrice}
                    />
                    <ModernToggleRow
                      icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
                      label="Step Price"
                      description="Tiered volume discount"
                      checked={showStepPrice}
                      onChange={setShowStepPrice}
                    />

                    {showStepPrice && (
                      <div className="ml-2 pl-3 py-1.5 border-l border-[#353638] space-y-1">
                        <span className="text-[10px] text-slate-400 font-medium">Steps to display:</span>
                        <div className="grid grid-cols-4 gap-1 bg-[#18191A] p-0.5 rounded-lg border border-[#353638]">
                          {(["all", 1, 2, 3] as const).map((stepVal) => (
                            <button
                              key={String(stepVal)}
                              type="button"
                              onClick={() => setMaxSteps(stepVal)}
                              className={`py-1 rounded text-[10px] font-bold cursor-pointer transition-colors text-center ${
                                maxSteps === stepVal
                                  ? "bg-[#C7F33C] text-black"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              {stepVal === "all" ? "All" : `${stepVal}st`}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <ModernToggleRow
                      icon={<DollarSign className="w-3.5 h-3.5" />}
                      label="Exclusive Distributor"
                      description="5% Support on Step Price"
                      checked={showExclusiveDistributor}
                      onChange={setShowExclusiveDistributor}
                    />
                  </div>

                  {/* Pricing Override Mode */}
                  <div className="space-y-2 pt-3 border-t border-[#353638]">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Price Override Mode
                      </span>
                      {pricingMode === "manual" && (
                        <button
                          type="button"
                          onClick={resetManualOverrides}
                          className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Reset custom manual overrides"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          <span>Reset</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-1 bg-[#18191A] p-1 rounded-xl border border-[#353638]">
                      <button
                        type="button"
                        onClick={() => setPricingMode("auto")}
                        className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                          pricingMode === "auto"
                            ? "bg-[#353638] text-white"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Auto</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPricingMode("manual")}
                        className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                          pricingMode === "manual"
                            ? "bg-[#C7F33C] text-black font-bold"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Manual</span>
                      </button>
                    </div>

                    {pricingMode === "manual" && (
                      <p className="text-[10px] text-slate-400 leading-tight px-1">
                        Tip: Click directly on prices in the preview to edit custom rates before printing or exporting.
                      </p>
                    )}
                  </div>

                  {/* Document Layout Options */}
                  <div className="space-y-1 pt-3 border-t border-[#353638]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 block mb-1">
                      Document Layout
                    </span>
                    <ModernToggleRow
                      icon={<FileText className="w-3.5 h-3.5" />}
                      label="Quotation Header"
                      description="SB Interlab info"
                      checked={showDocHeader}
                      onChange={setShowDocHeader}
                    />
                    <ModernToggleRow
                      icon={<Check className="w-3.5 h-3.5" />}
                      label="Document Footer"
                      description="Validity & notes"
                      checked={showDocFooter}
                      onChange={setShowDocFooter}
                    />
                  </div>
                </div>
              </div>

            {/* Sidebar Sticky Bottom: Dual Export Actions (2 Columns, Compact) */}
            <div className="sticky bottom-0 bg-[#202123] border-t border-[#353638] p-3 shrink-0">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={effectiveSelectedProducts.length === 0}
                  className="py-2.5 px-2 bg-[#2A2B2D] hover:bg-[#353638] disabled:opacity-50 disabled:cursor-not-allowed text-white border border-[#45474A] font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title={`Export ${effectiveSelectedProducts.length} items to CSV`}
                >
                  <FileSpreadsheet className="w-4 h-4 text-[#C7F33C]" />
                  <span>CSV ({effectiveSelectedProducts.length})</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={effectiveSelectedProducts.length === 0}
                  className="py-2.5 px-2 bg-[#C7F33C] hover:bg-[#b0d635] disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  title="Print or Save as PDF (A4)"
                >
                  <Printer className="w-4 h-4 text-black" />
                  <span>PDF (A4)</span>
                </button>
              </div>
            </div>
          </aside>

          {/* Right Document Area: Viewport container holding pinned Close button */}
          <div className="print-document-area flex-1 min-w-0 min-h-0 relative flex flex-col overflow-hidden bg-[#161718]">
            {/* Pinned Close Button at top-right of preview area - stays fixed, does not scroll with pages */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 z-40 p-2 bg-[#252627]/85 hover:bg-[#353638] text-slate-300 hover:text-white rounded-xl border border-[#3E4042] shadow-md backdrop-blur-md transition-all cursor-pointer print-hidden"
              title="Close Catalog"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Scrollable Printable Document Container */}
            <div
              id="catalog-print-scroll-body"
              className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8 flex flex-col items-center [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
            >

            {/* Main Paper Container */}
            <div
              id="catalog-print-container"
              className="w-full flex flex-col items-center gap-8 print:gap-0"
            >
              {effectiveSelectedProducts.length === 0 ? (
                <div className="w-full max-w-md my-auto text-center py-20 text-slate-400 space-y-3">
                  <Package className="w-12 h-12 mx-auto text-slate-600 stroke-1" />
                  <p className="text-sm font-semibold text-slate-300">No items selected</p>
                  <p className="text-xs text-slate-500">
                    Please select products from the product list to preview and export your catalog.
                  </p>
                </div>
              ) : layoutMode === "grid" ? (
                /* GRID LOOKBOOK VIEW (2x2 per page) */
                catalogPages.map((page, pageIdx) => (
                  <div
                    key={pageIdx}
                    className="catalog-page w-full max-w-4xl bg-white text-slate-900 rounded-2xl p-6 sm:p-8 flex flex-col justify-between border border-slate-200 min-h-[600px]"
                  >
                    {/* Page Header (Ultra-Compact Standard SB Header) */}
                    {showDocHeader && (
                      <SBHeader documentTitle="Commercial Product Catalog" />
                    )}

                    {/* Category Header Banner if Group by Category is enabled */}
                    {groupByCategory && page.category && (
                      <div className="flex items-center justify-between border-b-2 border-slate-900 pb-1.5 mb-2 mt-1 shrink-0 print-category-header">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#C7F33C] ring-2 ring-slate-900 shrink-0" />
                          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900">
                            {page.category}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wider">
                            {page.categoryTotalCount} {page.categoryTotalCount === 1 ? "Product" : "Products"}
                          </span>
                          {(page.categoryTotalPages || 0) > 1 && (
                            <span className="text-[9.5px] font-semibold text-slate-400">
                              (Part {(page.categoryPageIdx || 0) + 1} of {page.categoryTotalPages})
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 2x2 Grid Items */}
                    <div className="print-grid-layout grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-7 flex-1 my-2">
                      {page.items.map(({ sp, dp }) => {
                        const variants = dp?.variants || [];
                        const fallbackFormulas = sp.formulas || [];

                        const grossWeight =
                          dp?.variants?.[0]?.cartonGrossWeight ??
                          sp.cartonGrossWeight ??
                          sp.minGrossWeight ??
                          null;
                        const dimension = dp?.cartonDimension || sp.cartonDimension;
                        const cartonQty = dp?.cartonQuantity || sp.cartonQuantity;
                        const numericCbm =
                          typeof (dp?.cbm || sp.cbm) === "number"
                            ? Number(dp?.cbm || sp.cbm)
                            : parseFloat((dp?.cbm || sp.cbm) as unknown as string) || 0;
                        const cartons20ft = numericCbm > 0 ? Math.floor(28 / numericCbm) : 0;
                        const cartons40ft = numericCbm > 0 ? Math.floor(58 / numericCbm) : 0;

                        const primaryVariant = variants[0] || null;
                        const primaryVarId = primaryVariant?.id || "default";
                        const vOverride = manualOverrides[sp.id]?.[primaryVarId];

                        const baseExportPrice =
                          pricingMode === "manual" && vOverride?.exportPrice !== undefined
                            ? vOverride.exportPrice
                            : primaryVariant?.price || sp.minPrice;

                        const tiers: PriceStepTier[] = primaryVariant
                          ? parsePriceConditions(primaryVariant.priceCondition)
                          : [];
                        const displayedTiers =
                          maxSteps === "all"
                            ? tiers
                            : tiers.slice(0, typeof maxSteps === "number" ? maxSteps : 1);

                        const formulaCount = fallbackFormulas.length || variants.length || 1;
                        const formulaNames =
                          fallbackFormulas.length > 0
                            ? fallbackFormulas.join(", ")
                            : variants.map((v) => v.formula).filter(Boolean).join(", ") || "Standard";

                        const isBestSelling = (sp.starRating || dp?.starRating || 0) > 0;

                        return (
                          <div key={sp.id} className="flex flex-col group self-start w-full">
                            <div>
                              {/* Square Image Box strictly 1:1 */}
                              {showImage && (
                                <div
                                  className="relative w-full aspect-square bg-[#F8F9FA] rounded-2xl overflow-hidden border border-slate-200/80 shrink-0 self-start"
                                  style={{ width: "100%", aspectRatio: "1 / 1", height: "auto" }}
                                >
                                  <CatalogProductImage
                                    src={sp.primaryImageUrl}
                                    size={500}
                                    crop="fit"
                                    className="w-full h-full object-contain aspect-square transition-transform duration-300 group-hover:scale-105"
                                    iconSize="w-12 h-12"
                                  />

                                  {/* Badges on Image */}
                                  {showType && sp.category && (
                                    <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-white/95 text-[9px] font-bold text-slate-800 uppercase tracking-wider border border-slate-200 shadow-2xs">
                                      {sp.category}
                                    </span>
                                  )}
                                  {showTopSell && isBestSelling && (
                                    <span className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full bg-[#C7F33C] text-[9px] font-bold border border-black text-black uppercase tracking-wider shadow-2xs flex items-center gap-1">
                                      <Flame className="w-2.5 h-2.5 fill-black text-black" />
                                      Top Sell
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Product Title */}
                              <h4
                                className="text-xs font-bold uppercase tracking-wider text-slate-800 mt-2 line-clamp-2 leading-snug"
                                title={sp.name}
                              >
                                {sp.name}
                              </h4>

                              {/* Divider Line */}
                              <div className="border-b border-slate-300/80 w-full my-1.5" />

                              {/* Specifications & Price Row */}
                              <div className="flex items-start justify-between gap-3">
                                {/* Left: Metadata specifications */}
                                <div className="flex-1 min-w-0 space-y-1 text-[10px] leading-snug">
                                  {showFormulas && formulaNames && (
                                    <div
                                      className="line-clamp-2 text-[10px] leading-snug break-words"
                                      title={formulaNames}
                                    >
                                      <span className="font-semibold text-slate-700">
                                        {formulaCount} {formulaCount === 1 ? "Formula:" : "Formulas:"}
                                      </span>{" "}
                                      <span className="text-slate-600 font-normal">
                                        {formulaNames}
                                      </span>
                                    </div>
                                  )}

                                  {(showCartonQuantity || showCartonGrossWeight) && (
                                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-snug">
                                      {showCartonQuantity && (
                                        <span className="inline-flex items-center gap-1">
                                          <Package className="w-3 h-3 text-slate-400 shrink-0" />
                                          <span className="font-semibold text-slate-800">
                                            {cartonQty ? `${cartonQty} pcs/ctn` : "—"}
                                          </span>
                                        </span>
                                      )}
                                      {showCartonQuantity && showCartonGrossWeight && (
                                        <span className="text-slate-300 font-normal select-none">·</span>
                                      )}
                                      {showCartonGrossWeight && (
                                        <span className="inline-flex items-center gap-1">
                                          <span className="text-slate-500 font-medium">GW:</span>
                                          <span className="font-semibold text-slate-800">
                                            {grossWeight ? `${Number(grossWeight.toFixed(2))} kg` : "—"}
                                          </span>
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {(showCartonDimension || showHsCode) && (
                                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-snug">
                                      {showCartonDimension && (
                                        <span className="inline-flex items-center gap-1">
                                          <span className="text-slate-500 font-medium">Dim:</span>
                                          <span className="font-semibold text-slate-800">{formatDimension(dimension)}</span>
                                        </span>
                                      )}
                                      {showCartonDimension && showHsCode && (
                                        <span className="text-slate-300 font-normal select-none">·</span>
                                      )}
                                      {showHsCode && (
                                        <span className="inline-flex items-center gap-1">
                                          <span className="text-slate-500 font-medium">HS:</span>
                                          <span className="font-semibold text-slate-800">{sp.hsCode || dp?.hsCode || "—"}</span>
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {/* Container 20ft / 40ft with units */}
                                  {showCbmContainer && numericCbm > 0 && (
                                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-snug">
                                      <span className="inline-flex items-center gap-1">
                                        <span className="text-slate-400">🚢</span>
                                        <span className="text-slate-500 font-medium">20ft:</span>
                                        <span className="font-semibold text-slate-800">{cartons20ft.toLocaleString()} ctn</span>
                                      </span>
                                      <span className="text-slate-300 font-normal select-none">·</span>
                                      <span className="inline-flex items-center gap-1">
                                        <span className="text-slate-500 font-medium">40ft:</span>
                                        <span className="font-semibold text-slate-800">{cartons40ft.toLocaleString()} ctn</span>
                                      </span>
                                    </div>
                                  )}

                                  {/* Exclusive Distributor: Show 5% Support Badge */}
                                  {showExclusiveDistributor && (
                                    <div className="pt-0.5 flex items-center">
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-sky-800 text-[9.5px] font-bold tracking-tight">
                                        <span className="w-1.5 h-1.5 rounded-full bg-sky-800 shrink-0" />
                                        5% Distribution Support
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Right: Price Display (Seamless Manual Inline Editing) */}
                                {(showExportPrice || showStepPrice) && (
                                  <div className="shrink-0 text-right flex flex-col items-end">
                                    {showExportPrice && (
                                      <div className="flex flex-col items-end">
                                        <div className="flex items-baseline gap-0.5">
                                          {pricingMode === "manual" ? (
                                            <input
                                              type="number"
                                              step="0.01"
                                              value={baseExportPrice || ""}
                                              onChange={(e) =>
                                                updateManualPrice(
                                                  sp.id,
                                                  primaryVarId,
                                                  "exportPrice",
                                                  parseFloat(e.target.value) || 0
                                                )
                                              }
                                              style={{
                                                width: `${Math.max(String(baseExportPrice || "").length, 1.8)}ch`,
                                                fieldSizing: "content",
                                              }}
                                              className="print-manual-input text-right text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-none bg-transparent border-0 outline-none p-0 hover:bg-slate-100/80 focus:bg-slate-100/90 rounded transition-colors cursor-text"
                                              title="Click to edit quotation price"
                                            />
                                          ) : (
                                            <span className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-none">
                                              {fmt(baseExportPrice)}
                                            </span>
                                          )}
                                          <span className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-none">
                                            ฿
                                          </span>
                                        </div>
                                        <div className="text-[8px] text-slate-500 font-medium text-right mt-0.5 uppercase tracking-wide">
                                          Ex-Factory · THB
                                        </div>
                                      </div>
                                    )}

                                    {/* Dedicated Step Price Volume Tiers */}
                                    {showStepPrice && (
                                      <div className="mt-0.5 flex flex-col items-end gap-1">
                                        {displayedTiers.length > 0 ? (
                                          displayedTiers.map((t, idx) => {
                                            const autoTierPrice = calculateTierPrice(
                                              baseExportPrice,
                                              t.discountPercent
                                            );
                                            const tierPrice =
                                              pricingMode === "manual" &&
                                              vOverride?.stepPrices?.[idx] !== undefined
                                                ? vOverride.stepPrices[idx]
                                                : autoTierPrice;

                                            const rangeText = t.maxQuantity
                                              ? `${t.minQuantity}-${t.maxQuantity} ctns:`
                                              : `${t.minQuantity}+ ctns:`;

                                            return (
                                              <span
                                                key={idx}
                                                className="inline-flex items-center gap-1 px-1.5 rounded bg-sky-50/90 text-sky-900 text-[8.5px] font-medium border border-sky-200/80 whitespace-nowrap"
                                              >
                                                <span className="text-sky-600 font-normal">{rangeText}</span>
                                                {pricingMode === "manual" ? (
                                                  <input
                                                    type="number"
                                                    step="0.01"
                                                    value={tierPrice || ""}
                                                    onChange={(e) =>
                                                      updateManualStepPrice(
                                                        sp.id,
                                                        primaryVarId,
                                                        idx,
                                                        parseFloat(e.target.value) || 0
                                                      )
                                                    }
                                                    style={{
                                                      width: `${Math.max(String(tierPrice || "").length, 1.8)}ch`,
                                                      fieldSizing: "content",
                                                    }}
                                                    className="print-manual-input text-right text-[8.5px] font-bold text-sky-950 bg-transparent border-0 outline-none p-0 hover:bg-sky-100/60 focus:bg-sky-100/80 rounded transition-colors cursor-text"
                                                    title="Click to edit tier price"
                                                  />
                                                ) : (
                                                  <strong className="text-sky-950 font-bold">
                                                    {fmt(tierPrice)}
                                                  </strong>
                                                )}
                                                <span className="text-sky-950 font-bold">฿</span>
                                              </span>
                                            );
                                          })
                                        ) : (
                                          <span className="text-[8.5px] text-slate-400 italic">
                                            Single Tier
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Page Footer */}
                    {showDocFooter && (
                      <div className="pt-2 mt-auto border-t border-slate-200/80 flex items-center justify-between text-[9px] text-slate-400">
                        <span>* Preliminary quotation &amp; specifications for commercial discussion. Subject to final agreement.</span>
                        <span className="shrink-0 text-right font-medium">
                          Date: {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} · Valid: 30 days from document date · Page {pageIdx + 1} of {catalogPages.length}
                        </span>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                /* LIST ROWS VIEW */
                <div className="w-full max-w-4xl bg-white text-slate-900 rounded-2xl p-5 sm:p-7 space-y-4 border border-slate-200">
                  {/* Document Header */}
                  {showDocHeader && (
                    <SBHeader documentTitle="Commercial Product Catalog" />
                  )}

                  {/* List Rows */}
                  <div className="space-y-6">
                    {listSections.map((section, sIdx) => (
                      <div key={section.category || sIdx} className="print-category-group space-y-2.5">
                        {/* Category Section Header when groupByCategory is ON */}
                        {groupByCategory && section.category && (
                          <div className="flex items-center justify-between pb-1.5 pt-3 first:pt-0 border-b-2 border-slate-900 print-category-header">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-[#C7F33C] ring-2 ring-slate-900 shrink-0" />
                              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900">
                                {section.category}
                              </h3>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wider">
                              {section.items.length} {section.items.length === 1 ? "Product" : "Products"}
                            </span>
                          </div>
                        )}

                        <div className="print-list-layout flex flex-col">
                          {section.items.map(({ sp, dp }) => {
                      const variants = dp?.variants || [];
                      const fallbackFormulas = sp.formulas || [];

                      const grossWeight =
                        dp?.variants?.[0]?.cartonGrossWeight ??
                        sp.cartonGrossWeight ??
                        sp.minGrossWeight ??
                        null;
                      const dimension = dp?.cartonDimension || sp.cartonDimension;
                      const cartonQty = dp?.cartonQuantity || sp.cartonQuantity;
                      const numericCbm =
                        typeof (dp?.cbm || sp.cbm) === "number"
                          ? Number(dp?.cbm || sp.cbm)
                          : parseFloat((dp?.cbm || sp.cbm) as unknown as string) || 0;
                      const cartons20ft = numericCbm > 0 ? Math.floor(28 / numericCbm) : 0;
                      const cartons40ft = numericCbm > 0 ? Math.floor(58 / numericCbm) : 0;

                      const primaryVariant = variants[0] || null;
                      const primaryVarId = primaryVariant?.id || "default";
                      const vOverride = manualOverrides[sp.id]?.[primaryVarId];

                      const baseExportPrice =
                        pricingMode === "manual" && vOverride?.exportPrice !== undefined
                          ? vOverride.exportPrice
                          : primaryVariant?.price || sp.minPrice;

                      const tiers: PriceStepTier[] = primaryVariant
                        ? parsePriceConditions(primaryVariant.priceCondition)
                        : [];
                      const displayedTiers =
                        maxSteps === "all"
                          ? tiers
                          : tiers.slice(0, typeof maxSteps === "number" ? maxSteps : 1);

                      const formulaCount = fallbackFormulas.length || variants.length || 1;
                      const formulaNames =
                        fallbackFormulas.length > 0
                          ? fallbackFormulas.join(", ")
                          : variants.map((v) => v.formula).filter(Boolean).join(", ") || "Standard";

                      const isBestSelling = (sp.starRating || dp?.starRating || 0) > 0;

                      return (
                        <div
                          key={sp.id}
                          className="print-list-card print-product-card bg-white text-slate-900 border-b border-slate-200 overflow-hidden flex items-stretch"
                        >
                          {/* Left: Product Image filling full height */}
                          {showImage && (
                            <div className="w-24 sm:w-28 self-stretch shrink-0 bg-[#F8F9FA] flex items-center justify-center border-r border-slate-100 overflow-hidden relative">
                              <CatalogProductImage
                                src={sp.primaryImageUrl}
                                size={300}
                                crop="fill"
                                className="w-full h-full object-cover"
                                iconSize="w-8 h-8"
                              />
                              {showTopSell && isBestSelling && (
                                <span className="absolute top-1.5 px-1.5 py-0.5 rounded-full bg-[#C7F33C] text-[8px] font-bold text-black uppercase tracking-wider shadow-2xs flex items-center gap-0.5 z-10">
                                  <Flame className="w-2.5 h-2.5 fill-black text-black" />
                                  Top Sell
                                </span>
                              )}
                            </div>
                          )}

                          {/* Center: Information & Bullet List */}
                          <div className="flex-1 min-w-0 p-2.5 sm:p-3 flex flex-col justify-center">
                            {/* Product Name */}
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                              <h4
                                className="text-xs font-bold text-slate-900 leading-snug"
                                title={sp.name}
                              >
                                {sp.name}
                              </h4>
                              {!showImage && showTopSell && isBestSelling && (
                                <span className="inline-flex items-center gap-1 px-1 rounded-full bg-[#C7F33C] border border-black text-[8.5px] font-bold text-black uppercase tracking-wider shadow-2xs">
                                  <Flame className="w-2.5 h-2.5 fill-black text-black" />
                                  Top Sell
                                </span>
                              )}
                            </div>

                            {/* Bullets List */}
                            <div className="text-[11px] leading-tight text-slate-600">
                              {/* 🔘 Type */}
                              {showType && (
                                <div className="flex items-start">
                                  <BulletIcon />
                                  <span>
                                    <span className="text-slate-600">Type: </span>
                                    <span className="text-slate-700">{sp.category || "—"}</span>
                                  </span>
                                </div>
                              )}

                              {/* 🔘 Formula Count & List */}
                              {showFormulas && (
                                <div className="flex items-start">
                                  <BulletIcon />
                                  <span>
                                    <strong className="font-bold text-slate-800">
                                      {formulaCount} {formulaCount === 1 ? "Formula:" : "Formulas:"}
                                    </strong>{" "}
                                    <span className="text-slate-600">{formulaNames}</span>
                                  </span>
                                </div>
                              )}

                              {/* 🔘 HS-Code */}
                              {showHsCode && (
                                <div className="flex items-start">
                                  <BulletIcon />
                                  <span>
                                    <span className="text-slate-600">HS-Code: </span>
                                    <span className="text-slate-700">{sp.hsCode || dp?.hsCode || "—"}</span>
                                  </span>
                                </div>
                              )}

                              {/* 🔘 Carton Gross Weight */}
                              {showCartonGrossWeight && (
                                <div className="flex items-start">
                                  <BulletIcon />
                                  <span>
                                    <span className="text-slate-600">Carton Gross Weight: </span>
                                    <span className="text-slate-700">
                                      {grossWeight ? `${Number(grossWeight.toFixed(2))} kg` : "—"}
                                    </span>
                                  </span>
                                </div>
                              )}

                              {/* 🔘 Carton Dimension with cm */}
                              {showCartonDimension && (
                                <div className="flex items-start">
                                  <BulletIcon />
                                  <span>
                                    <span className="text-slate-600">Carton Dimension: </span>
                                    <span className="text-slate-700">{formatDimension(dimension)}</span>
                                  </span>
                                </div>
                              )}

                              {/* 🔘 Carton Quantity */}
                              {showCartonQuantity && (
                                <div className="flex items-start">
                                  <BulletIcon />
                                  <span>
                                    <span className="text-slate-600">Carton Quantity: </span>
                                    <span className="text-slate-700">
                                      {cartonQty ? `${cartonQty} pcs` : "—"}
                                    </span>
                                  </span>
                                </div>
                              )}

                              {/* 🔘 Container Capacity (both 20ft & 40ft with units) */}
                              {showCbmContainer && numericCbm > 0 && (
                                <div className="flex items-start">
                                  <BulletIcon />
                                  <span>
                                    <span className="text-slate-600">Container Capacity: </span>
                                    <span className="text-slate-700 font-medium">
                                      20ft: {cartons20ft.toLocaleString()} ctn · 40ft: {cartons40ft.toLocaleString()} ctn
                                    </span>
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Right: Quotation Price Column (Seamless Manual Inline Editing) */}
                          <div className="print-price-panel w-40 sm:w-44 shrink-0 bg-[#F8FAFC] p-2.5 sm:p-3 flex flex-col justify-start">
                            {showExportPrice && (
                              <div className="flex flex-col items-end text-right">
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                  Quotation Price
                                </span>

                                <div className="flex flex-col items-end">
                                  <div className="flex items-baseline gap-0.5 mt-0.5">

                                    {pricingMode === "manual" ? (
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={baseExportPrice || ""}
                                        onChange={(e) =>
                                          updateManualPrice(
                                            sp.id,
                                            primaryVarId,
                                            "exportPrice",
                                            parseFloat(e.target.value) || 0
                                          )
                                        }
                                        style={{
                                          width: `${Math.max(String(baseExportPrice || "").length, 1.8)}ch`,
                                          fieldSizing: "content",
                                        }}
                                        className="print-manual-input text-right text-base sm:text-lg font-bold text-slate-900 tracking-tight bg-transparent border-0 outline-none p-0 hover:bg-slate-100/80 focus:bg-slate-100/90 rounded transition-colors cursor-text"
                                        title="Click to edit quotation price"
                                      />
                                    ) : (
                                      <span className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                                        {fmt(baseExportPrice)}
                                      </span>
                                    )}
                                    <span className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                                      ฿
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-medium">/pc</span>
                                  </div>
                                  <div className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">
                                    Ex-Factory · THB
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Step Price Schedule */}
                            {showStepPrice && displayedTiers.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-slate-200/90 w-full space-y-1">
                                <div className="flex items-center justify-between text-[9px] uppercase font-bold text-sky-800 tracking-wider">
                                  <span>Step Tier</span>
                                  <span>Rate / pc</span>
                                </div>
                                <div>
                                  {displayedTiers.map((tier, idx) => {
                                    const autoTierPrice = calculateTierPrice(
                                      baseExportPrice,
                                      tier.discountPercent
                                    );
                                    const tierPrice =
                                      pricingMode === "manual" &&
                                      vOverride?.stepPrices?.[idx] !== undefined
                                        ? vOverride.stepPrices[idx]
                                        : autoTierPrice;

                                    return (
                                      <div
                                        key={idx}
                                        className="text-[10.5px] flex items-center justify-between w-full"
                                      >
                                        <span className="text-sky-800 font-medium">
                                          {tier.maxQuantity
                                            ? `${tier.minQuantity} - ${tier.maxQuantity}`
                                            : `${tier.minQuantity}+`}{" "}
                                          ctns
                                        </span>
                                        <div className="flex items-center gap-0.5">
                                          {pricingMode === "manual" ? (
                                            <input
                                              type="number"
                                              step="0.01"
                                              value={tierPrice || ""}
                                              onChange={(e) =>
                                                updateManualStepPrice(
                                                  sp.id,
                                                  primaryVarId,
                                                  idx,
                                                  parseFloat(e.target.value) || 0
                                                )
                                              }
                                              style={{
                                                width: `${Math.max(String(tierPrice || "").length, 1.8)}ch`,
                                                fieldSizing: "content",
                                              }}
                                              className="print-manual-input text-right text-[10.5px] font-semibold text-sky-700 bg-transparent border-0 outline-none p-0 hover:bg-sky-50 focus:bg-sky-50 rounded transition-colors cursor-text"
                                              title="Click to edit step price"
                                            />
                                          ) : (
                                            <span className="font-semibold text-sky-700">
                                              {fmt(tierPrice)}
                                            </span>
                                          )}
                                          <span className="text-[10.5px] font-semibold text-sky-700">฿</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Exclusive Distributor: Show 5% Support Badge */}
                            {showExclusiveDistributor && (
                              <div className="mt-2 pt-2 border-t border-slate-200/90 w-full flex items-end justify-end">
                                <span className="inline-flex items-center gap-1 py-0.5 rounded text-sky-800 text-[10px] font-bold tracking-tight">
                                  <span className="w-1.5 h-1.5 rounded-full bg-sky-800 shrink-0" />
                                  5% Distribution Support
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Document Footer */}
                  {showDocFooter && (
                    <div className="pt-2.5 mt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-[9.5px] text-slate-500 gap-1.5">
                      <div>
                        * Preliminary price quotation &amp; commercial specifications for business discussion. Subject to final agreement.
                      </div>
                      <div className="text-slate-400 font-medium shrink-0">
                        Date: {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} · Valid: 30 days from document date · {sortedProducts.length} Items · SB Interlab Co., Ltd.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
