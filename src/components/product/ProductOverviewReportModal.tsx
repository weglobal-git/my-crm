"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Printer,
  FileSpreadsheet,
  TrendingUp,
  Loader2,
  AlertTriangle,
  RotateCcw,
  ChevronDown,
  Check,
} from "lucide-react";
import {
  ProductListItemDTO,
  ProductOverviewDTO,
  parsePriceConditions,
  calculateTierPrice,
  PriceStepTier,
} from "@/lib/product/product-dto";
import { getBatchProductOverviews } from "@/lib/actions/product";
import {
  CommercialRates,
  DEFAULT_COMMERCIAL_RATES,
} from "./ExportPricingSimulation";
import { useCompanyCostOverhead } from "@/lib/product/use-company-cost-overhead";

interface ProductOverviewReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProducts: ProductListItemDTO[];
  isExplicitSelection?: boolean;
}

type Lang = "th" | "en";

const DICT = {
  th: {
    modalTitle: "Overview Report",
    modalSubtitle:
      "ตารางสรุปภาพรวมต้นทุน เงื่อนไขราคา และอัตรากำไรสุทธิ (General Export & Exclusive)",
    pdfExportBtn: "PDF Export",
    csvExportBtn: "CSV Export",
    date: "วันที่ออกเอกสาร",
    docNo: "เลขที่เอกสาร",
    productsCount: "สินค้าที่เลือก",
    variantsCount: "จำนวนสูตรทั้งหมด",
    productsUnit: "รายการ",
    variantsUnit: "สูตร",
    overheadNote: "โครงสร้างต้นทุนมาตรฐานบริษัท (Company Standard Cost)",
    simulatedNote: "จำลองต้นทุนมาตรฐาน",
    defaultNote: "ค่าเริ่มต้น",
    rateAssumptionsNote: "เกณฑ์หักค่าใช้จ่ายการค้า",
    loadingText: "กำลังโหลดข้อมูลโครงสร้างราคาและต้นทุนสินค้า...",
    emptyTitle: "ไม่มีรายการสินค้าที่เลือก",
    emptyDesc: "กรุณาเลือกสินค้าจากหน้ารายการสินค้าเพื่อดูรายงานภาพรวม",

    // Toolbar Simulation Controls
    simCostLabel: "Std. Cost",
    resetDefaultBtn: "Default",
    exclusionSwitchLabel: "No MKT / Rebate",
    domesticSwitchLabel: "Domestic",

    // Table Columns
    colProduct: "Product",
    colVariant: "Variant",
    colBaseCost: "Base Cost",
    colEffectiveCost: "Effective Cost",
    colPriceCondition: "Price Condition",
    colGenExportTitle: "General Export",
    colExclusiveTitle: "Exclusive",
    colDomesticTitle: "Domestic",
    colMinMaxProfit: "Min. Net Profit (%) - Max Net Profit (%)",

    // Minimal Contract Annex Mode
    noticeBadge: "เอกสารแนบท้ายสัญญา (ANNEX)",
    noticeTitle: "รายการสินค้าที่ยกเว้นการคำนวณ MKT Support / Rebate",
    noticeSubtitle:
      "รายการสินค้าด้านล่างนี้ไม่นำยอดสั่งซื้อมาคำนวณรวมในงบ MKT Support และ/หรือ ยอดสะสม Rebate ตามเงื่อนไขที่ระบุ",
    groupNoMktTitle: "รายการสินค้าที่ไม่คิดรวม MKT Support และไม่คิดรวม Rebate",
    groupNoMktBadge: "ไม่รวม MKT Support & Rebate",
    groupNoRebateTitle: "รายการสินค้าที่ไม่คิดรวม Rebate",
    groupNoRebateBadge: "ไม่รวม Rebate",
    colNo: "ลำดับ",
    colPolicyStatus: "เงื่อนไขที่ยกเว้น",
    emptyGroupText:
      "ไม่พบรายการสินค้าที่เข้าเกณฑ์ยกเว้น MKT Support หรือ Rebate",
    signCompanyHeader: "ผู้แจ้ง / ในนามบริษัท (For the Company)",
    signDistributorHeader: "ผู้รับทราบ / ตัวแทนจำหน่าย (Acknowledged by Distributor)",
    signDateLabel: "วันที่ (Date): ........../........../..............",

    // Labels inside cells
    exportPriceLabel: "ราคาเปิด",
    standardPriceNoTier: "ราคามาตรฐาน (ไม่มีขั้นบันได)",
    cartonUnit: "ลัง",
    moreThan: "ลังขึ้นไป",
    noCost: "ยังไม่ระบุต้นทุน",
    footnote:
      "หมายเหตุ: แต่ละช่องแสดงช่วงราคาขายสุทธิและอัตรากำไรสุทธิ (%) เรียงจาก ราคา Tier สูงสุด → ราคาเปิด • General Export เปรียบเทียบแบบไม่หัก Rec Com และหัก Rec Com • Exclusive หักสะสม 3 ขั้น (DisFee → +MKT → +Rebate)",
  },
  en: {
    modalTitle: "Overview Report",
    modalSubtitle:
      "Executive summary of product costs, volume conditions, and net profit margins (General Export & Exclusive)",
    pdfExportBtn: "PDF Export",
    csvExportBtn: "CSV Export",
    date: "Issue Date",
    docNo: "Doc No.",
    productsCount: "Selected Products",
    variantsCount: "Total Variants",
    productsUnit: "products",
    variantsUnit: "variants",
    overheadNote: "Company Standard Cost Overhead",
    simulatedNote: "Simulated Overhead",
    defaultNote: "Default",
    rateAssumptionsNote: "Commercial Deduction Rates",
    loadingText: "Loading product cost and pricing structures...",
    emptyTitle: "No Products Selected",
    emptyDesc: "Please select products from the list to generate the overview report.",

    // Toolbar Simulation Controls
    simCostLabel: "Std. Cost",
    resetDefaultBtn: "Default",
    exclusionSwitchLabel: "No MKT / Rebate",
    domesticSwitchLabel: "Domestic",

    // Table Columns
    colProduct: "Product",
    colVariant: "Variant",
    colBaseCost: "Base Cost",
    colEffectiveCost: "Effective Cost",
    colPriceCondition: "Price Condition",
    colGenExportTitle: "General Export",
    colExclusiveTitle: "Exclusive",
    colDomesticTitle: "Domestic",
    colMinMaxProfit: "Min. Net Profit (%) - Max Net Profit (%)",

    // Minimal Contract Annex Mode
    noticeBadge: "CONTRACT ANNEX",
    noticeTitle: "Product Exclusion Schedule (MKT Support / Rebate)",
    noticeSubtitle:
      "Orders for the products listed below are excluded from MKT Support and/or Rebate calculations as specified.",
    groupNoMktTitle: "Products Excluded from MKT Support & Rebate",
    groupNoMktBadge: "Excluded from MKT Support & Rebate",
    groupNoRebateTitle: "Products Excluded from Rebate",
    groupNoRebateBadge: "Excluded from Rebate",
    colNo: "No.",
    colPolicyStatus: "Exclusion Condition",
    emptyGroupText:
      "None of the selected products fall under the MKT Support or Rebate exclusion criteria.",
    signCompanyHeader: "For the Company",
    signDistributorHeader: "Acknowledged by Distributor",
    signDateLabel: "Date: ........../........../..............",

    // Labels inside cells
    exportPriceLabel: "Base Price",
    standardPriceNoTier: "Standard price (No step tiers)",
    cartonUnit: "ctns",
    moreThan: "+ ctns",
    noCost: "No cost set",
    footnote:
      "Note: Each cell displays the net selling price and net profit margin (%) range from Max Tier → Base Price • General Export compares No Rec Com vs +Rec Com • Exclusive deducts cumulatively across 3 steps (DisFee → +MKT → +Rebate).",
  },
};

function calcScenarioMetrics(
  exportPrice: number,
  effectiveCost: number,
  vRates: CommercialRates
) {
  // Model A: General Export
  const genCommission = (exportPrice * vRates.commissionRate) / 100;
  const genNetRev = exportPrice - genCommission;
  const genProfitWorst = genNetRev - effectiveCost;
  const genMarginWorstPct =
    exportPrice > 0 ? (genProfitWorst / exportPrice) * 100 : 0;
  const genProfitBest = exportPrice - effectiveCost;
  const genMarginBestPct =
    exportPrice > 0 ? (genProfitBest / exportPrice) * 100 : 0;

  // Model B: Exclusive Distributor (3 Cumulative Steps)
  // Step 1: After Distribution Fee
  const exclDistFee = (exportPrice * vRates.distFeeRate) / 100;
  const exclQuotation = exportPrice - exclDistFee;
  const exclStep1Profit = exclQuotation - effectiveCost;
  const exclStep1Pct =
    exportPrice > 0 ? (exclStep1Profit / exportPrice) * 100 : 0;

  // Step 2: After Distribution Fee + MKT Support
  const exclMkt = (exclQuotation * vRates.mktSupportRate) / 100;
  const exclAfterMkt = exclQuotation - exclMkt;
  const exclStep2Profit = exclAfterMkt - effectiveCost;
  const exclStep2Pct =
    exportPrice > 0 ? (exclStep2Profit / exportPrice) * 100 : 0;

  // Step 3: After Distribution Fee + MKT Support + Rebate
  const exclRebate = (exclQuotation * vRates.rebateRate) / 100;
  const exclNetRev = exclQuotation - exclMkt - exclRebate;
  const exclStep3Profit = exclNetRev - effectiveCost;
  const exclStep3Pct =
    exportPrice > 0 ? (exclStep3Profit / exportPrice) * 100 : 0;

  // Domestic Mode: No Rebate & + Rebate
  const domRebate = (exportPrice * vRates.rebateRate) / 100;
  const domNetRev = exportPrice - domRebate;
  const domProfitWorst = domNetRev - effectiveCost;
  const domMarginWorstPct =
    exportPrice > 0 ? (domProfitWorst / exportPrice) * 100 : 0;
  const domProfitBest = exportPrice - effectiveCost;
  const domMarginBestPct =
    exportPrice > 0 ? (domProfitBest / exportPrice) * 100 : 0;

  return {
    genNetRev,
    genBestSellPrice: exportPrice,
    genProfitWorst,
    genMarginWorstPct,
    genProfitBest,
    genMarginBestPct,
    exclQuotation,
    exclAfterMkt,
    exclNetRev,
    exclStep1Profit,
    exclStep1Pct,
    exclStep2Profit,
    exclStep2Pct,
    exclStep3Profit,
    exclStep3Pct,
    domNetRev,
    domBestSellPrice: exportPrice,
    domProfitWorst,
    domMarginWorstPct,
    domProfitBest,
    domMarginBestPct,
  };
}

interface ScenarioRangeMetric {
  minSellPrice: number; // at Max Tier (lowest price)
  maxSellPrice: number; // at Base Price (highest price)
  minPct: number; // at Max Tier (lowest margin %)
  maxPct: number; // at Base Price (highest margin %)
}

interface VariantOverviewRow {
  variantId: string;
  formula: string;
  sku: string | null;
  basePrice: number;
  baseCost: number;
  hasCost: boolean;
  effectiveCost: number;
  tiers: PriceStepTier[];
  hasTierRange: boolean;
  priceConditionSummary: string[];
  // General Export: No Rec Com vs + Rec Com
  genNoRecCom: ScenarioRangeMetric;
  genWithRecCom: ScenarioRangeMetric;
  // Exclusive 3 cumulative steps: DisFee -> + MKT -> + Rebate
  exclStep1: ScenarioRangeMetric;
  exclStep2: ScenarioRangeMetric;
  exclStep3: ScenarioRangeMetric;
  // Negative group flags (evaluated at Max Tier)
  isNoMkt: boolean;
  isNoRebate: boolean;
  // Domestic: No Rebate vs + Rebate
  domNoRebate: ScenarioRangeMetric;
  domWithRebate: ScenarioRangeMetric;
}

interface ProductOverviewGroup {
  productId: string;
  productName: string;
  brand: string | null;
  category: string | null;
  rows: VariantOverviewRow[];
}

type MinimizeMode = "normal" | "min_cost" | "avg_cost";

const MINIMIZE_MODE_OPTIONS: { value: MinimizeMode; label: string }[] = [
  { value: "normal", label: "Normal (All Variants)" },
  { value: "min_cost", label: "Minimize (Min Cost)" },
  { value: "avg_cost", label: "Minimize (Avg Cost)" },
];

export function ProductOverviewReportModal({
  isOpen,
  onClose,
  selectedProducts,
}: ProductOverviewReportModalProps) {
  const [mounted, setMounted] = useState(false);
  const [lang, setLang] = useState<Lang>("th");
  const [minimizeMode, setMinimizeMode] = useState<MinimizeMode>("normal");
  const [isMinimizeDropdownOpen, setIsMinimizeDropdownOpen] = useState(false);
  const minimizeDropdownRef = useRef<HTMLDivElement>(null);
  const [isExclusionReportMode, setIsExclusionReportMode] = useState(false);
  const [isDomestic, setIsDomestic] = useState(false);
  const [simulatedOverheadInput, setSimulatedOverheadInput] = useState<
    string | null
  >(null);
  const [detailsCache, setDetailsCache] = useState<
    Record<string, ProductOverviewDTO>
  >({});
  const [isLoading, setIsLoading] = useState(false);

  const isMinimized = minimizeMode !== "normal";

  const {
    overhead,
    totalPercent: companyCostOverheadPercent,
    commercialRates,
    calculateEffectiveCost,
  } = useCompanyCostOverhead();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        minimizeDropdownRef.current &&
        !minimizeDropdownRef.current.contains(e.target as Node)
      ) {
        setIsMinimizeDropdownOpen(false);
      }
    };
    if (isMinimizeDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMinimizeDropdownOpen]);

  const t = DICT[lang];

  // Determine whether user is simulating a custom Company Standard Cost %
  const isSimulatingCost =
    simulatedOverheadInput !== null &&
    simulatedOverheadInput.trim() !== "" &&
    !Number.isNaN(Number(simulatedOverheadInput));

  const activeOverheadPercent = isSimulatingCost
    ? Math.max(0, Number(parseFloat(simulatedOverheadInput!).toFixed(2)) || 0)
    : simulatedOverheadInput !== null && simulatedOverheadInput.trim() === ""
    ? 0
    : companyCostOverheadPercent;

  // Fetch full variant details for selected products when modal opens
  useEffect(() => {
    if (!isOpen || selectedProducts.length === 0) return;
    const missingIds = selectedProducts
      .map((p) => p.id)
      .filter((id) => !detailsCache[id]);

    if (missingIds.length === 0) return;

    let active = true;
    setIsLoading(true);

    getBatchProductOverviews(missingIds)
      .then((res) => {
        if (active && res) {
          setDetailsCache((prev) => {
            const next = { ...prev };
            res.forEach((item) => {
              next[item.id] = item;
            });
            return next;
          });
        }
      })
      .catch((err) => {
        console.error("Failed to fetch product overviews for report:", err);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, selectedProducts, detailsCache]);

  const fmt = (num: number, decimals: number = 2) =>
    num.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

  // Build grouped rows by Product
  const productGroups = useMemo<ProductOverviewGroup[]>(() => {
    const groups: ProductOverviewGroup[] = [];

    const buildRowFromSource = (
      variantId: string,
      formula: string,
      sku: string | null,
      basePrice: number,
      baseCost: number,
      priceCondition: string | null | undefined
    ): VariantOverviewRow => {
      const hasCost = baseCost > 0;
      const useCustomOverhead = simulatedOverheadInput !== null;
      const effectiveCost = hasCost
        ? useCustomOverhead
          ? Number((baseCost * (1 + activeOverheadPercent / 100)).toFixed(2))
          : calculateEffectiveCost(baseCost)
        : 0;
      const tiers = parsePriceConditions(priceCondition);

      const maxTier = tiers.length > 0 ? tiers[tiers.length - 1] : null;
      const maxDiscount = maxTier?.discountPercent ?? 0;
      const maxStepPrice = calculateTierPrice(basePrice, maxDiscount);
      const hasTierRange = maxStepPrice < basePrice - 0.005;

      const baseCalc = calcScenarioMetrics(
        basePrice,
        effectiveCost,
        commercialRates
      );
      const maxCalc = calcScenarioMetrics(
        maxStepPrice,
        effectiveCost,
        commercialRates
      );

      const priceConditionSummary =
        tiers.length === 0
          ? []
          : tiers.map((tier, idx) => {
              const isLast = idx === tiers.length - 1;
              const rangeStr = isLast
                ? `${tier.minQuantity} ${t.moreThan}`
                : `${tier.minQuantity}-${tier.maxQuantity} ${t.cartonUnit}`;
              const tierUnitPrice = calculateTierPrice(
                basePrice,
                tier.discountPercent
              );
              return `${rangeStr}: -${tier.discountPercent}% (฿${fmt(tierUnitPrice)})`;
            });

      const isNoMkt = hasCost && basePrice > 0 && maxCalc.exclStep2Profit < 0;
      const isNoRebate =
        hasCost &&
        basePrice > 0 &&
        maxCalc.exclStep2Profit >= 0 &&
        maxCalc.exclStep3Profit < 0;

      return {
        variantId,
        formula,
        sku,
        basePrice,
        baseCost,
        hasCost,
        effectiveCost,
        tiers,
        hasTierRange,
        priceConditionSummary,
        genNoRecCom: {
          minSellPrice: maxCalc.genBestSellPrice,
          maxSellPrice: baseCalc.genBestSellPrice,
          minPct: maxCalc.genMarginBestPct,
          maxPct: baseCalc.genMarginBestPct,
        },
        genWithRecCom: {
          minSellPrice: maxCalc.genNetRev,
          maxSellPrice: baseCalc.genNetRev,
          minPct: maxCalc.genMarginWorstPct,
          maxPct: baseCalc.genMarginWorstPct,
        },
        exclStep1: {
          minSellPrice: maxCalc.exclQuotation,
          maxSellPrice: baseCalc.exclQuotation,
          minPct: maxCalc.exclStep1Pct,
          maxPct: baseCalc.exclStep1Pct,
        },
        exclStep2: {
          minSellPrice: maxCalc.exclAfterMkt,
          maxSellPrice: baseCalc.exclAfterMkt,
          minPct: maxCalc.exclStep2Pct,
          maxPct: baseCalc.exclStep2Pct,
        },
        exclStep3: {
          minSellPrice: maxCalc.exclNetRev,
          maxSellPrice: baseCalc.exclNetRev,
          minPct: maxCalc.exclStep3Pct,
          maxPct: baseCalc.exclStep3Pct,
        },
        isNoMkt,
        isNoRebate,
        domNoRebate: {
          minSellPrice: maxCalc.domBestSellPrice,
          maxSellPrice: baseCalc.domBestSellPrice,
          minPct: maxCalc.domMarginBestPct,
          maxPct: baseCalc.domMarginBestPct,
        },
        domWithRebate: {
          minSellPrice: maxCalc.domNetRev,
          maxSellPrice: baseCalc.domNetRev,
          minPct: maxCalc.domMarginWorstPct,
          maxPct: baseCalc.domMarginWorstPct,
        },
      };
    };

    for (const item of selectedProducts) {
      const detail = detailsCache[item.id];
      if (!detail || !detail.variants || detail.variants.length === 0) continue;

      let rows: VariantOverviewRow[];

      if (minimizeMode !== "normal") {
        // Group variants by distinct basePrice, picking lowest or average positive baseCost in each group
        const priceGroupsMap = new Map<
          number,
          typeof detail.variants
        >();
        for (const v of detail.variants) {
          const bp = Number(v.price || 0);
          const list = priceGroupsMap.get(bp) || [];
          list.push(v);
          priceGroupsMap.set(bp, list);
        }

        rows = Array.from(priceGroupsMap.entries()).map(
          ([basePrice, variantsInGroup]) => {
            const positiveCosts = variantsInGroup
              .map((v) =>
                typeof v.productCost === "number" ? v.productCost : 0
              )
              .filter((c) => c > 0);

            const selectedBaseCost =
              positiveCosts.length === 0
                ? 0
                : minimizeMode === "min_cost"
                ? Math.min(...positiveCosts)
                : Number(
                    (
                      positiveCosts.reduce((sum, c) => sum + c, 0) /
                      positiveCosts.length
                    ).toFixed(2)
                  );

            const repVariant =
              variantsInGroup.find((v) => v.priceCondition) ||
              variantsInGroup[0];

            return buildRowFromSource(
              `${detail.id}_price_${basePrice}`,
              repVariant.formula || "Standard",
              repVariant.sku || null,
              basePrice,
              selectedBaseCost,
              repVariant.priceCondition
            );
          }
        );
      } else {
        rows = detail.variants.map((v) =>
          buildRowFromSource(
            v.id,
            v.formula || "Standard",
            v.sku || null,
            v.price || 0,
            typeof v.productCost === "number" ? v.productCost : 0,
            v.priceCondition
          )
        );
      }

      groups.push({
        productId: detail.id,
        productName: detail.name,
        brand: detail.brand,
        category: detail.category,
        rows,
      });
    }

    return groups;
  }, [
    selectedProducts,
    detailsCache,
    minimizeMode,
    commercialRates,
    calculateEffectiveCost,
    simulatedOverheadInput,
    activeOverheadPercent,
    t.cartonUnit,
    t.moreThan,
  ]);

  const noMktGroups = useMemo<ProductOverviewGroup[]>(() => {
    return productGroups
      .map((g) => {
        const filtered = g.rows.filter((r) => r.isNoMkt);
        return {
          ...g,
          rows: isMinimized ? filtered.slice(0, 1) : filtered,
        };
      })
      .filter((g) => g.rows.length > 0);
  }, [productGroups, isMinimized]);

  const noRebateGroups = useMemo<ProductOverviewGroup[]>(() => {
    return productGroups
      .map((g) => {
        const filtered = g.rows.filter((r) => r.isNoRebate);
        return {
          ...g,
          rows: isMinimized ? filtered.slice(0, 1) : filtered,
        };
      })
      .filter((g) => g.rows.length > 0);
  }, [productGroups, isMinimized]);

  const noMktRowsCount = useMemo(
    () => noMktGroups.reduce((acc, g) => acc + g.rows.length, 0),
    [noMktGroups]
  );

  const noRebateRowsCount = useMemo(
    () => noRebateGroups.reduce((acc, g) => acc + g.rows.length, 0),
    [noRebateGroups]
  );

  const totalExclusionRowsCount = noMktRowsCount + noRebateRowsCount;

  const totalVariantsCount = useMemo(
    () => productGroups.reduce((acc, g) => acc + g.rows.length, 0),
    [productGroups]
  );

  const handlePrintPdf = () => {
    window.print();
  };

  const formatCsvPriceRange = (
    metric: ScenarioRangeMetric,
    hasTierRange: boolean
  ) =>
    hasTierRange
      ? `฿${fmt(metric.minSellPrice)} - ฿${fmt(metric.maxSellPrice)}`
      : `฿${fmt(metric.maxSellPrice)}`;

  const formatCsvPctRange = (
    metric: ScenarioRangeMetric,
    hasTierRange: boolean
  ) =>
    hasTierRange
      ? `${fmt(metric.minPct, 1)}% - ${fmt(metric.maxPct, 1)}%`
      : `${fmt(metric.maxPct, 1)}%`;

  const handleExportCsv = () => {
    const escapeCsv = (val: string | number | null | undefined) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    if (isExclusionReportMode) {
      const headers = [
        "Product",
        "Brand",
        "Category",
        ...(isMinimized ? [] : ["Variant"]),
        "Exclusion Condition",
      ];
      const csvLines: string[] = [headers.map(escapeCsv).join(",")];

      for (const group of noMktGroups) {
        group.rows.forEach((row) => {
          const line = [
            group.productName,
            group.brand || "-",
            group.category || "-",
            ...(isMinimized ? [] : [row.formula]),
            t.groupNoMktBadge,
          ];
          csvLines.push(line.map(escapeCsv).join(","));
        });
      }

      for (const group of noRebateGroups) {
        group.rows.forEach((row) => {
          const line = [
            group.productName,
            group.brand || "-",
            group.category || "-",
            ...(isMinimized ? [] : [row.formula]),
            t.groupNoRebateBadge,
          ];
          csvLines.push(line.map(escapeCsv).join(","));
        });
      }

      const csvContent = "\uFEFF" + csvLines.join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.setAttribute("download", `contract-annex-exclusion-${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }

    const headers = isDomestic
      ? [
          "Product",
          "Brand",
          "Category",
          ...(isMinimized ? [] : ["Variant"]),
          "Base Price (THB)",
          "Price Condition",
          "Base Cost (THB)",
          `Effective Cost (+${activeOverheadPercent}%) (THB)`,
          "Domestic (No Rebate) - Net Price Range",
          "Domestic (No Rebate) - Margin Range (%)",
          `Domestic (+${commercialRates.rebateRate}% Rebate) - Net Price Range`,
          `Domestic (+${commercialRates.rebateRate}% Rebate) - Margin Range (%)`,
        ]
      : [
          "Product",
          "Brand",
          "Category",
          ...(isMinimized ? [] : ["Variant"]),
          "Export Price (THB)",
          "Price Condition",
          "Base Cost (THB)",
          `Effective Cost (+${activeOverheadPercent}%) (THB)`,
          "General Export (No Rec Com) - Net Price Range",
          "General Export (No Rec Com) - Margin Range (%)",
          `General Export (+${commercialRates.commissionRate}% Rec Com) - Net Price Range`,
          `General Export (+${commercialRates.commissionRate}% Rec Com) - Margin Range (%)`,
          "Exclusive (DisFee) - Net Price Range",
          "Exclusive (DisFee) - Margin Range (%)",
          "Exclusive (+ MKT) - Net Price Range",
          "Exclusive (+ MKT) - Margin Range (%)",
          "Exclusive (+ Rebate) - Net Price Range",
          "Exclusive (+ Rebate) - Margin Range (%)",
        ];

    const csvLines: string[] = [headers.map(escapeCsv).join(",")];

    for (const group of productGroups) {
      group.rows.forEach((row) => {
        const condText =
          row.priceConditionSummary.length > 0
            ? row.priceConditionSummary.join(" | ")
            : "-";

        const line = isDomestic
          ? [
              group.productName,
              group.brand || "-",
              group.category || "-",
              ...(isMinimized ? [] : [row.formula]),
              row.basePrice.toFixed(2),
              condText,
              row.hasCost ? row.baseCost.toFixed(2) : "-",
              row.hasCost ? row.effectiveCost.toFixed(2) : "-",
              row.hasCost && row.basePrice > 0
                ? formatCsvPriceRange(row.domNoRebate, row.hasTierRange)
                : "-",
              row.hasCost && row.basePrice > 0
                ? formatCsvPctRange(row.domNoRebate, row.hasTierRange)
                : "-",
              row.hasCost && row.basePrice > 0
                ? formatCsvPriceRange(row.domWithRebate, row.hasTierRange)
                : "-",
              row.hasCost && row.basePrice > 0
                ? formatCsvPctRange(row.domWithRebate, row.hasTierRange)
                : "-",
            ]
          : [
              group.productName,
              group.brand || "-",
              group.category || "-",
              ...(isMinimized ? [] : [row.formula]),
              row.basePrice.toFixed(2),
              condText,
              row.hasCost ? row.baseCost.toFixed(2) : "-",
              row.hasCost ? row.effectiveCost.toFixed(2) : "-",
              row.hasCost && row.basePrice > 0
                ? formatCsvPriceRange(row.genNoRecCom, row.hasTierRange)
                : "-",
              row.hasCost && row.basePrice > 0
                ? formatCsvPctRange(row.genNoRecCom, row.hasTierRange)
                : "-",
              row.hasCost && row.basePrice > 0
                ? formatCsvPriceRange(row.genWithRecCom, row.hasTierRange)
                : "-",
              row.hasCost && row.basePrice > 0
                ? formatCsvPctRange(row.genWithRecCom, row.hasTierRange)
                : "-",
              row.hasCost && row.basePrice > 0
                ? formatCsvPriceRange(row.exclStep1, row.hasTierRange)
                : "-",
              row.hasCost && row.basePrice > 0
                ? formatCsvPctRange(row.exclStep1, row.hasTierRange)
                : "-",
              row.hasCost && row.basePrice > 0
                ? formatCsvPriceRange(row.exclStep2, row.hasTierRange)
                : "-",
              row.hasCost && row.basePrice > 0
                ? formatCsvPctRange(row.exclStep2, row.hasTierRange)
                : "-",
              row.hasCost && row.basePrice > 0
                ? formatCsvPriceRange(row.exclStep3, row.hasTierRange)
                : "-",
              row.hasCost && row.basePrice > 0
                ? formatCsvPctRange(row.exclStep3, row.hasTierRange)
                : "-",
            ];

        csvLines.push(line.map(escapeCsv).join(","));
      });
    }

    const csvContent = "\uFEFF" + csvLines.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute("download", `overview-report-${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Only Green (profit >= 0) and Red (loss < 0)
  const getProfitColorClass = (pct: number) => {
    return pct < 0 ? "text-rose-600" : "text-emerald-700";
  };

  const renderRangeCell = (
    metric: ScenarioRangeMetric,
    hasCost: boolean,
    basePrice: number,
    hasTierRange: boolean
  ) => {
    if (!hasCost || basePrice <= 0) {
      return <span className="text-[11px] text-slate-700">—</span>;
    }

    if (!hasTierRange) {
      return (
        <div className="leading-tight space-y-0.5">
          <div className="text-[11.5px] font-bold text-slate-900 whitespace-nowrap">
            ฿{fmt(metric.maxSellPrice)}
          </div>
          <div
            className={`text-[11px] font-extrabold whitespace-nowrap ${getProfitColorClass(
              metric.maxPct
            )}`}
          >
            ({fmt(metric.maxPct, 1)}%)
          </div>
        </div>
      );
    }

    const sameSign = (metric.minPct < 0) === (metric.maxPct < 0);

    return (
      <div className="leading-tight space-y-0.5">
        <div className="text-[11.5px] font-bold text-slate-900 whitespace-nowrap">
          ฿{fmt(metric.minSellPrice)} - ฿{fmt(metric.maxSellPrice)}
        </div>
        {sameSign ? (
          <div
            className={`text-[11px] font-extrabold whitespace-nowrap ${getProfitColorClass(
              metric.minPct
            )}`}
          >
            ({fmt(metric.minPct, 1)}% - {fmt(metric.maxPct, 1)}%)
          </div>
        ) : (
          <div className="text-[11px] font-extrabold whitespace-nowrap">
            <span className={getProfitColorClass(metric.minPct)}>
              ({fmt(metric.minPct, 1)}%
            </span>
            <span className="text-slate-500"> - </span>
            <span className={getProfitColorClass(metric.maxPct)}>
              {fmt(metric.maxPct, 1)}%)
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderExclusionTable = (
    groupsToRender: ProductOverviewGroup[],
    badgeLabel: string,
    isRoseBadge: boolean
  ) => {
    if (groupsToRender.length === 0) return null;

    return (
      <table className="w-full table-fixed text-left text-xs border-collapse">
        <thead>
          <tr className="bg-slate-100 border-t border-b border-slate-300 text-slate-900 align-middle">
            <th className="py-2.5 px-3 font-extrabold text-center w-[10%]">
              {t.colNo}
            </th>
            <th className="py-2.5 px-3.5 font-extrabold border-l border-slate-300 text-left w-[56%]">
              {isMinimized
                ? t.colProduct
                : `${t.colProduct} / ${t.colVariant}`}
            </th>
            <th className="py-2.5 px-3 font-extrabold border-l border-slate-300 text-center w-[34%]">
              {t.colPolicyStatus}
            </th>
          </tr>
        </thead>
        {groupsToRender.map((group, groupIdx) => (
          <tbody
            key={group.productId}
            className={`overview-product-group border-b border-slate-300 last:border-b-0 ${
              groupIdx % 2 === 1 ? "bg-slate-50/50" : "bg-white"
            }`}
          >
            {!isMinimized && (
              <tr className="bg-slate-100/80 border-b border-slate-200 align-middle">
                <td className="py-2 px-3 text-center font-extrabold text-slate-900 tabular-nums">
                  {groupIdx + 1}
                </td>
                <td
                  colSpan={2}
                  className="py-2 px-3.5 border-l border-slate-200 text-slate-900"
                >
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-extrabold text-slate-900 leading-snug">
                      {group.productName}
                    </span>
                    {(group.brand || group.category) && (
                      <span className="text-[11px] font-medium text-slate-600">
                        {[group.brand, group.category]
                          .filter(Boolean)
                          .join(" • ")}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            )}
            {group.rows.map((row, rowIdx) => {
              const isFirstRow = rowIdx === 0;
              return (
                <tr
                  key={row.variantId}
                  className="align-middle border-b border-slate-100 last:border-b-0"
                >
                  <td className="py-2 px-3 text-center font-bold text-slate-700 tabular-nums">
                    {isMinimized && isFirstRow ? groupIdx + 1 : ""}
                  </td>
                  <td className="py-2 px-3.5 border-l border-slate-200 text-slate-900">
                    {isMinimized ? (
                      isFirstRow && (
                        <div className="space-y-0.5">
                          <div className="font-extrabold text-slate-900 leading-snug">
                            {group.productName}
                          </div>
                          {(group.brand || group.category) && (
                            <div className="text-[11px] font-medium text-slate-600">
                              {[group.brand, group.category]
                                .filter(Boolean)
                                .join(" • ")}
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="pl-2 flex items-center gap-1.5 font-semibold text-slate-800 leading-snug">
                        <span className="text-slate-400">•</span>
                        <span>{row.formula}</span>
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3 border-l border-slate-200 text-center">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded border text-[11px] font-bold ${
                        isRoseBadge
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-slate-100 text-slate-900 border-slate-300"
                      }`}
                    >
                      {badgeLabel}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    );
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      id="overview-report-modal-overlay"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
    >
      {/* WYSIWYG A4 Print Stylesheet */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          @page {
            size: ${isExclusionReportMode ? "A4 portrait" : "A4 landscape"};
            margin: ${isExclusionReportMode ? "14mm" : "6mm"};
          }
          html,
          body {
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: #0f172a !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body > *:not(#overview-report-modal-overlay) {
            display: none !important;
          }
          #overview-report-modal-overlay {
            position: static !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
            display: block !important;
            backdrop-filter: none !important;
          }
          #overview-report-card {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            border: none !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #overview-report-scroll-body {
            display: block !important;
            position: static !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
          }
          #overview-report-print-container {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
              "Noto Sans Thai", "Thonburi", "Sarabun", sans-serif !important;
            letter-spacing: -0.01em;
            -webkit-font-smoothing: antialiased;
            display: block !important;
            position: static !important;
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            background: white !important;
            color: #0f172a !important;
          }
          .print-hidden {
            display: none !important;
          }
          .overview-product-group {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          thead {
            position: static !important;
          }
        }
      `,
        }}
      />

      <div
        id="overview-report-card"
        className="relative w-full max-w-[1220px] bg-[#252728] border border-[#4E4F50] rounded-2xl overflow-hidden flex flex-col my-auto h-[93vh] max-h-[93vh]"
      >
        {/* Modal Toolbar — Compact Single Line (Hidden in Print) */}
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-[#1C1C1D] bg-[#3A3B3C] shrink-0 print-hidden flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-6 h-6 rounded-md bg-[#C7F33C]/15 border border-[#C7F33C]/40 flex items-center justify-center text-[#C7F33C]">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-slate-100 whitespace-nowrap">
              {t.modalTitle}
            </h3>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Company Standard Cost (%) Simulator Input */}
            <div className="flex items-center gap-1 bg-[#252728] border border-[#4E4F50] rounded-md px-2 h-7 text-[11px]">
              <span className="font-semibold text-slate-300 whitespace-nowrap">
                {t.simCostLabel}:
              </span>
              <input
                type="number"
                step="0.5"
                min="0"
                max="100"
                value={
                  simulatedOverheadInput !== null
                    ? simulatedOverheadInput
                    : String(companyCostOverheadPercent)
                }
                placeholder={String(companyCostOverheadPercent)}
                onChange={(e) => setSimulatedOverheadInput(e.target.value)}
                onBlur={() => {
                  if (
                    simulatedOverheadInput !== null &&
                    simulatedOverheadInput.trim() === ""
                  ) {
                    setSimulatedOverheadInput(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-10 h-5 rounded bg-[#18191A] border border-[#4E4F50] focus:border-[#C7F33C] text-center text-[11px] font-bold text-[#C7F33C] outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                title="Simulate Company Standard Cost Overhead (%)"
              />
              <span className="text-[11px] font-bold text-slate-400">%</span>
              <button
                type="button"
                onClick={() => setSimulatedOverheadInput(null)}
                disabled={
                  simulatedOverheadInput === null ||
                  activeOverheadPercent === companyCostOverheadPercent
                }
                className="flex items-center gap-0.5 px-1.5 h-5 rounded bg-[#3A3B3C] hover:bg-[#4E4F50] disabled:opacity-35 disabled:pointer-events-none text-[10px] font-semibold text-slate-200 transition-colors cursor-pointer"
                title={`Reset to Default (${companyCostOverheadPercent}%)`}
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>{companyCostOverheadPercent}%</span>
              </button>
            </div>

            {/* Minimize Mode Custom Dropdown (English Only, CRM Standard Dropdown Design) */}
            <div ref={minimizeDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setIsMinimizeDropdownOpen((prev) => !prev)}
                className={`h-7 bg-[#252728] rounded-md px-2.5 text-[11px] text-slate-100 border transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                  isMinimizeDropdownOpen || minimizeMode !== "normal"
                    ? "border-[#C7F33C]"
                    : "border-[#4E4F50] hover:border-slate-400"
                }`}
                title="Select Variant Display & Cost Calculation Mode"
              >
                <span
                  className={`font-bold whitespace-nowrap ${
                    minimizeMode !== "normal"
                      ? "text-[#C7F33C]"
                      : "text-slate-200"
                  }`}
                >
                  {
                    (
                      MINIMIZE_MODE_OPTIONS.find(
                        (opt) => opt.value === minimizeMode
                      ) || MINIMIZE_MODE_OPTIONS[0]
                    ).label
                  }
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${
                    isMinimizeDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isMinimizeDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 z-50 min-w-[185px] bg-[#252728] border border-[#4E4F50] rounded-xl overflow-hidden p-1">
                  <div className="space-y-0.5">
                    {MINIMIZE_MODE_OPTIONS.map((opt) => {
                      const isSelected = opt.value === minimizeMode;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setMinimizeMode(opt.value);
                            setIsMinimizeDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-1.5 text-xs rounded-lg flex items-center justify-between gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                            isSelected
                              ? "bg-[#3A3B3C] text-[#C7F33C] font-semibold"
                              : "text-slate-300 hover:bg-[#3A3B3C]/60 hover:text-white"
                          }`}
                        >
                          <span>{opt.label}</span>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Combined No MKT / No Rebate Customer Exclusion Report Switch */}
            <div className="flex items-center gap-1.5 bg-[#252728] border border-[#4E4F50] rounded-md px-2 h-7 text-[11px]">
              <span className="font-bold text-slate-200 whitespace-nowrap">
                {t.exclusionSwitchLabel}
              </span>
              <span className="px-1 py-0.2 rounded bg-[#18191A] text-[10px] font-bold text-rose-400 tabular-nums">
                {totalExclusionRowsCount}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={isExclusionReportMode}
                onClick={() => {
                  setIsExclusionReportMode((prev) => {
                    const next = !prev;
                    if (next) setIsDomestic(false);
                    return next;
                  });
                }}
                className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                  isExclusionReportMode
                    ? "bg-[#C7F33C] border-[#C7F33C]"
                    : "bg-[#18191A] border-[#4E4F50]"
                }`}
                title="Show Customer Exclusion Report for products excluded from MKT Support or Rebate"
              >
                <span
                  className={`inline-block h-2.5 w-2.5 transform rounded-full transition-transform ${
                    isExclusionReportMode
                      ? "translate-x-3.5 bg-black"
                      : "translate-x-0.5 bg-slate-400"
                  }`}
                />
              </button>
            </div>

            {/* Domestic Mode ON/OFF Switch */}
            <div className="flex items-center gap-1.5 bg-[#252728] border border-[#4E4F50] rounded-md px-2 h-7 text-[11px]">
              <span className="font-bold text-slate-200 whitespace-nowrap">
                {t.domesticSwitchLabel}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={isDomestic}
                onClick={() => {
                  setIsDomestic((prev) => {
                    const next = !prev;
                    if (next) {
                      setIsExclusionReportMode(false);
                    }
                    return next;
                  });
                }}
                className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                  isDomestic
                    ? "bg-[#C7F33C] border-[#C7F33C]"
                    : "bg-[#18191A] border-[#4E4F50]"
                }`}
                title="Toggle Domestic Pricing Mode (Min with Rebate / Max no rebate)"
              >
                <span
                  className={`inline-block h-2.5 w-2.5 transform rounded-full transition-transform ${
                    isDomestic
                      ? "translate-x-3.5 bg-black"
                      : "translate-x-0.5 bg-slate-400"
                  }`}
                />
              </button>
            </div>

            {/* Language Switcher */}
            <div className="flex items-center bg-[#252728] border border-[#4E4F50] rounded-md p-0.5 h-7 text-[11px] font-medium">
              <button
                type="button"
                onClick={() => setLang("th")}
                className={`px-2 h-full rounded transition-colors cursor-pointer ${
                  lang === "th"
                    ? "bg-[#C7F33C] text-black font-bold"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                TH
              </button>
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`px-2 h-full rounded transition-colors cursor-pointer ${
                  lang === "en"
                    ? "bg-[#C7F33C] text-black font-bold"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                EN
              </button>
            </div>

            {/* CSV Export Button */}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={productGroups.length === 0}
              className="flex items-center gap-1 px-2.5 h-7 bg-[#252728] border border-[#4E4F50] text-slate-100 hover:border-[#C7F33C] hover:text-[#C7F33C] disabled:opacity-50 font-bold text-[11px] rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3 h-3" />
              <span>CSV</span>
            </button>

            {/* PDF Export Button */}
            <button
              type="button"
              onClick={handlePrintPdf}
              disabled={productGroups.length === 0}
              className="flex items-center gap-1 px-2.5 h-7 bg-[#C7F33C] text-black disabled:opacity-50 font-bold text-[11px] rounded-md hover:bg-[#b0d635] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3 h-3" />
              <span>PDF</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-[#4E4F50] rounded-md transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Report Body */}
        <div
          id="overview-report-scroll-body"
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-0 bg-[#252728] hide-scrollbar [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
        >
          <div
            id="overview-report-print-container"
            style={{
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Thai", "Thonburi", "Sarabun", sans-serif',
              letterSpacing: "-0.01em",
            }}
            className={`w-full ${
              isExclusionReportMode
                ? "max-w-[794px] min-h-[1123px] p-8 sm:p-10"
                : "max-w-[1180px] min-h-[calc(93vh-5.5rem)] p-5 sm:p-7 flex flex-col"
            } mx-auto my-4 sm:my-6 bg-white rounded-xl border border-slate-200 text-slate-900 space-y-4`}
          >
            {/* Document Header (Normal Overview Mode Only) */}
            {!isExclusionReportMode && (
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-3.5 border-b border-slate-300">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-[#C7F33C]/60 text-slate-900 border border-slate-300">
                      EXECUTIVE SUMMARY
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {t.productsCount}:{" "}
                      <strong className="font-extrabold text-slate-900">
                        {(productGroups.length > 0
                          ? productGroups.length
                          : selectedProducts.length)}{" "}
                        {t.productsUnit}
                      </strong>{" "}
                      {productGroups.length > 0 &&
                        `(${totalVariantsCount} ${t.variantsUnit})`}
                    </span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight">
                    {t.modalTitle} — Commercial Pricing & Margin Analysis
                  </h1>
                  <p className="text-xs text-slate-700">
                    {t.overheadNote}:{" "}
                    <span className="font-semibold text-slate-900">
                      {(() => {
                        if (
                          isSimulatingCost &&
                          activeOverheadPercent !== companyCostOverheadPercent
                        ) {
                          return `+${activeOverheadPercent}% (${t.simulatedNote} • ${t.defaultNote} +${companyCostOverheadPercent}%)`;
                        }
                        const overheadParts = [
                          overhead.supportPercent > 0 &&
                            `Support ${overhead.supportPercent}%`,
                          overhead.operationPercent > 0 &&
                            `Operation ${overhead.operationPercent}%`,
                          overhead.marketingPercent > 0 &&
                            `Marketing ${overhead.marketingPercent}%`,
                          overhead.salesPercent > 0 &&
                            `Com ${overhead.salesPercent}%`,
                        ].filter(Boolean);
                        return overheadParts.length > 0
                          ? `+${activeOverheadPercent}% (${overheadParts.join(", ")})`
                          : `${activeOverheadPercent}%`;
                      })()}
                    </span>{" "}
                    • {t.rateAssumptionsNote}:{" "}
                    <span className="font-semibold text-slate-900">
                      {(() => {
                        if (isDomestic) {
                          return commercialRates.rebateRate > 0
                            ? `Domestic (Rebate ${commercialRates.rebateRate}%)`
                            : "Domestic";
                        }
                        const exclParts = [
                          commercialRates.distFeeRate > 0 &&
                            `Dist. Fee ${commercialRates.distFeeRate}%`,
                          commercialRates.mktSupportRate > 0 &&
                            `Mkt ${commercialRates.mktSupportRate}%`,
                          commercialRates.rebateRate > 0 &&
                            `Rebate ${commercialRates.rebateRate}%`,
                        ].filter(Boolean);
                        const genStr =
                          commercialRates.commissionRate > 0
                            ? `General Export (Rec Com ${commercialRates.commissionRate}%)`
                            : "General Export";
                        const exclStr =
                          exclParts.length > 0
                            ? `Exclusive (${exclParts.join(", ")})`
                            : "Exclusive";
                        return `${genStr} | ${exclStr}`;
                      })()}
                    </span>
                  </p>
                </div>

                <div className="text-left sm:text-right shrink-0 space-y-0.5">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                    {t.modalTitle}
                  </div>
                  <div className="text-xs text-slate-700">
                    {t.date}:{" "}
                    <span className="font-semibold text-slate-900">
                      {new Date().toLocaleDateString("en-CA")}
                    </span>
                  </div>
                  <div className="text-xs text-slate-700">
                    {t.docNo}:{" "}
                    <span className="font-mono font-semibold text-slate-900">
                      OV-
                      {new Date().toISOString().slice(0, 10).replace(/-/g, "")}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Loading / Empty / Main Table */}
            {(isLoading ||
              (selectedProducts.length > 0 &&
                selectedProducts.some((p) => !detailsCache[p.id]))) &&
            productGroups.length === 0 ? (
              <div className="flex-1 min-h-[420px] flex flex-col items-center justify-center gap-3 text-slate-700">
                <Loader2 className="w-7 h-7 animate-spin text-slate-900" />
                <p className="text-xs font-semibold">{t.loadingText}</p>
              </div>
            ) : productGroups.length === 0 ? (
              <div className="flex-1 min-h-[420px] flex flex-col items-center justify-center text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-800 flex items-center justify-center mx-auto border border-slate-300">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  {t.emptyTitle}
                </h3>
                <p className="text-xs text-slate-700">{t.emptyDesc}</p>
              </div>
            ) : isExclusionReportMode ? (
              /* MINIMAL CONTRACT ANNEX (Hides Internal Cost, Profit & Price Conditions, Only Renders Non-Empty Groups) */
              (() => {
                const activeAnnexSchedules = [
                  ...(noMktGroups.length > 0
                    ? [
                        {
                          key: "no_mkt" as const,
                          groups: noMktGroups,
                          rowsCount: noMktRowsCount,
                          title: t.groupNoMktTitle,
                          badge: t.groupNoMktBadge,
                          isRoseBadge: true,
                        },
                      ]
                    : []),
                  ...(noRebateGroups.length > 0
                    ? [
                        {
                          key: "no_rebate" as const,
                          groups: noRebateGroups,
                          rowsCount: noRebateRowsCount,
                          title: t.groupNoRebateTitle,
                          badge: t.groupNoRebateBadge,
                          isRoseBadge: false,
                        },
                      ]
                    : []),
                ];

                const docDateStr = new Date().toLocaleDateString("en-CA");
                const refDateCompact = new Date()
                  .toISOString()
                  .slice(0, 10)
                  .replace(/-/g, "");

                return (
                  <div className="space-y-5 text-slate-900">
                    {/* Symmetrical Centered Contract Annex Header */}
                    <div className="text-center pb-4 border-b-2 border-slate-900 space-y-1.5">
                      <div>
                        <span className="inline-block px-2.5 py-0.5 bg-slate-900 text-white text-[10.5px] font-extrabold tracking-widest uppercase rounded">
                          {t.noticeBadge}
                        </span>
                      </div>
                      <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-tight">
                        {t.noticeTitle}
                      </h1>
                      <p className="text-xs text-slate-700 max-w-xl mx-auto">
                        {t.noticeSubtitle}
                      </p>
                      <div className="flex items-center justify-center gap-4 pt-1 text-xs text-slate-700">
                        <div>
                          {t.docNo}:{" "}
                          <span className="font-mono font-bold text-slate-900">
                            ANNEX-{refDateCompact}
                          </span>
                        </div>
                        <span className="text-slate-300">|</span>
                        <div>
                          {t.date}:{" "}
                          <span className="font-bold text-slate-900 tabular-nums">
                            {docDateStr}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Dynamic Product Exclusion Schedules (Only shows non-empty groups) */}
                    {activeAnnexSchedules.length === 0 ? (
                      <div className="py-10 px-4 text-center text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-300 rounded-md">
                        {t.emptyGroupText}
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {activeAnnexSchedules.map((schedule) => (
                          <div
                            key={schedule.key}
                            className="border border-slate-300 rounded-md overflow-hidden bg-white"
                          >
                            <div className="px-4 py-2.5 bg-slate-900 text-white flex items-center justify-between gap-2">
                              <h3 className="text-xs font-extrabold tracking-tight">
                                {schedule.title}
                              </h3>
                              <span className="px-2.5 py-0.5 rounded bg-white/15 text-white text-[11px] font-bold shrink-0 tabular-nums">
                                {isMinimized
                                  ? `${schedule.groups.length} ${t.productsUnit}`
                                  : `${schedule.groups.length} ${t.productsUnit} (${schedule.rowsCount} ${t.variantsUnit})`}
                              </span>
                            </div>
                            {renderExclusionTable(
                              schedule.groups,
                              schedule.badge,
                              schedule.isRoseBadge
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Symmetrical 2-Column Signature Block */}
                    <div className="overview-product-group grid grid-cols-2 gap-6 pt-2">
                      <div className="border border-slate-300 rounded-md px-6 py-5 bg-white flex flex-col items-center text-center">
                        <div className="text-xs font-extrabold text-slate-900">
                          {t.signCompanyHeader}
                        </div>
                        <div className="w-48 border-b border-slate-400 mt-10 mb-2.5" />
                        <div className="text-[11px] font-medium text-slate-700">
                          {t.signDateLabel}
                        </div>
                      </div>

                      <div className="border border-slate-300 rounded-md px-6 py-5 bg-white flex flex-col items-center text-center">
                        <div className="text-xs font-extrabold text-slate-900">
                          {t.signDistributorHeader}
                        </div>
                        <div className="w-48 border-b border-slate-400 mt-10 mb-2.5" />
                        <div className="text-[11px] font-medium text-slate-700">
                          {t.signDateLabel}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-20 bg-white">
                    {/* Top Tab Row for MODEL A & MODEL B (3 cols) or DOMESTIC */}
                    <tr className="bg-white">
                      <th
                        colSpan={3}
                        className="bg-white p-0 border-0"
                      />
                      {isDomestic ? (
                        <th
                          colSpan={2}
                          className="p-0 border-0 bg-white align-bottom"
                        >
                          <div className="py-1.5 px-3 bg-[#C7F33C] border-t border-l border-r border-slate-300 rounded-t-lg flex items-center justify-center">
                            <span className="text-xs font-extrabold text-slate-900">
                              {t.colDomesticTitle}
                            </span>
                          </div>
                        </th>
                      ) : (
                        <>
                          <th
                            colSpan={2}
                            className="p-0 border-0 bg-white align-bottom"
                          >
                            <div className="py-1.5 px-3 bg-[#C7F33C] border-t border-l border-r border-slate-300 rounded-t-lg flex items-center justify-center">
                              <span className="text-xs font-extrabold text-slate-900">
                                {t.colGenExportTitle}
                              </span>
                            </div>
                          </th>
                          <th
                            colSpan={3}
                            className="p-0 border-0 bg-white align-bottom"
                          >
                            <div className="py-1.5 px-3 bg-[#FDBA74] border-t border-l border-r border-slate-300 rounded-t-lg flex items-center justify-center">
                              <span className="text-xs font-extrabold text-slate-900">
                                {t.colExclusiveTitle}
                              </span>
                            </div>
                          </th>
                        </>
                      )}
                    </tr>

                    {/* Main Column Header Row (Solid #DBF780 matches #C7F33C/65 on white so sticky header is 100% opaque) */}
                    <tr className="bg-[#DBF780] text-slate-900 align-bottom">
                      <th
                        className={`py-2.5 px-2.5 font-extrabold ${
                          isDomestic
                            ? "w-[28%]"
                            : isMinimized
                            ? "w-[18.5%]"
                            : "w-[16.5%]"
                        }`}
                      >
                        {isMinimized
                          ? t.colProduct
                          : `${t.colProduct} / ${t.colVariant}`}
                      </th>
                      <th
                        className={`py-2.5 px-2.5 font-extrabold border-l border-slate-300 ${
                          isDomestic
                            ? "w-[32%]"
                            : isMinimized
                            ? "w-[21%]"
                            : "w-[23%]"
                        }`}
                      >
                        {t.colPriceCondition}
                      </th>
                      <th
                        className={`py-2.5 px-1.5 font-extrabold text-right border-l border-slate-300 ${
                          isDomestic ? "w-[12%]" : "w-[8%]"
                        }`}
                      >
                        <div>
                          Cost
                          {minimizeMode !== "normal"
                            ? ` (${minimizeMode === "min_cost" ? "Min" : "Avg"})`
                            : ""}
                        </div>
                        <div className="text-[10px] font-semibold text-slate-800 leading-tight mt-0.5">
                          ({activeOverheadPercent > 0 ? `+${activeOverheadPercent}%` : "Eff."} / Base)
                        </div>
                      </th>

                      {isDomestic ? (
                        <>
                          <th className="py-2 px-2.5 font-extrabold text-right border-l border-slate-300 w-[14%]">
                            <div>No Rebate</div>
                            <div className="text-[10px] font-semibold text-slate-800 leading-tight mt-0.5">
                              (no rebate)
                            </div>
                          </th>
                          <th className="py-2 px-2.5 font-extrabold text-right border-l border-slate-300 w-[14%]">
                            <div>+ Rebate</div>
                            {commercialRates.rebateRate > 0 && (
                              <div className="text-[10px] font-semibold text-slate-800 leading-tight mt-0.5">
                                (with {commercialRates.rebateRate}% Rebate)
                              </div>
                            )}
                          </th>
                        </>
                      ) : (
                        <>
                          {/* General Export Sub-col 1: No Rec Com */}
                          <th className="py-2 px-2 font-extrabold text-right border-l border-slate-300 w-[10.5%]">
                            <div>No Rec Com</div>
                            <div className="text-[10px] font-semibold text-slate-800 leading-tight mt-0.5">
                              (no Rec Com)
                            </div>
                          </th>
                          {/* General Export Sub-col 2: + Rec Com */}
                          <th className="py-2 px-2 font-extrabold text-right border-l border-slate-300 w-[10.5%]">
                            <div>+ Rec Com</div>
                            {commercialRates.commissionRate > 0 && (
                              <div className="text-[10px] font-semibold text-slate-800 leading-tight mt-0.5">
                                (with {commercialRates.commissionRate}% Rec Com)
                              </div>
                            )}
                          </th>

                          {/* Exclusive Sub-col 1: DisFee only */}
                          <th className="py-2 px-2 font-extrabold text-right border-l border-slate-300 bg-[#FED7AA] w-[10.5%]">
                            <div>DisFee</div>
                            {commercialRates.distFeeRate > 0 && (
                              <div className="text-[10px] font-semibold text-slate-800 leading-tight mt-0.5">
                                (with {commercialRates.distFeeRate}% DisFee)
                              </div>
                            )}
                          </th>

                          {/* Exclusive Sub-col 2: DisFee + MKT */}
                          <th className="py-2 px-2 font-extrabold text-right border-l border-slate-300 bg-[#FED7AA] w-[10.5%]">
                            <div>+ MKT</div>
                            {(() => {
                              const step2Parts = [
                                commercialRates.distFeeRate > 0 &&
                                  `${commercialRates.distFeeRate}% DisFee`,
                                commercialRates.mktSupportRate > 0 &&
                                  `${commercialRates.mktSupportRate}% MKT`,
                              ].filter(Boolean);
                              return step2Parts.length > 0 ? (
                                <div className="text-[10px] font-semibold text-slate-800 leading-tight mt-0.5">
                                  (with {step2Parts.join(" | ")})
                                </div>
                              ) : null;
                            })()}
                          </th>

                          {/* Exclusive Sub-col 3: DisFee + MKT + Rebate */}
                          <th className="py-2 px-2 font-extrabold text-right border-l border-slate-300 bg-[#FED7AA] w-[10.5%]">
                            <div>+ Rebate</div>
                            {(() => {
                              const step3Parts = [
                                commercialRates.distFeeRate > 0 &&
                                  `${commercialRates.distFeeRate}% DisFee`,
                                commercialRates.mktSupportRate > 0 &&
                                  `${commercialRates.mktSupportRate}% MKT`,
                                commercialRates.rebateRate > 0 &&
                                  `${commercialRates.rebateRate}% Rebate`,
                              ].filter(Boolean);
                              return step3Parts.length > 0 ? (
                                <div className="text-[10px] font-semibold text-slate-800 leading-tight mt-0.5">
                                  (with {step3Parts.join(" | ")})
                                </div>
                              ) : null;
                            })()}
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>

                  {/* Group by Product: Each Product is a <tbody> with border-b ONLY between distinct products */}
                  {productGroups.map((group, groupIdx) => (
                    <tbody
                      key={group.productId}
                      className={`overview-product-group border-l border-r border-b border-slate-300 ${
                        groupIdx % 2 === 1 ? "bg-slate-50/40" : "bg-white"
                      }`}
                    >
                      {!isMinimized && (
                        <tr className="bg-slate-100/90 border-b border-slate-200">
                          <td
                            colSpan={isDomestic ? 5 : 8}
                            className="py-1.5 px-2.5 text-slate-900"
                          >
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="font-extrabold text-slate-900 leading-snug">
                                {group.productName}
                              </span>
                              {(group.brand || group.category) && (
                                <span className="text-[11px] font-medium text-slate-600">
                                  {[group.brand, group.category]
                                    .filter(Boolean)
                                    .join(" • ")}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      {group.rows.map((row, rowIdx) => {
                        const isFirstRow = rowIdx === 0;

                        return (
                          <tr
                            key={row.variantId}
                            className="align-top border-b border-slate-100 last:border-b-0"
                          >
                            {/* Col 1: Variant (when Normal) or Product (when Minimize) */}
                            <td className="py-2 px-2.5 text-slate-900">
                              {isMinimized ? (
                                isFirstRow && (
                                  <div className="space-y-0.5">
                                    <div className="font-extrabold text-slate-900 leading-snug">
                                      {group.productName}
                                    </div>
                                    {(group.brand || group.category) && (
                                      <div className="text-[11px] font-medium text-slate-700">
                                        {[group.brand, group.category]
                                          .filter(Boolean)
                                          .join(" • ")}
                                      </div>
                                    )}
                                  </div>
                                )
                              ) : (
                                <div className="pl-2 flex items-center gap-1.5 font-bold text-slate-800 leading-snug">
                                  <span className="text-slate-400">•</span>
                                  <span>{row.formula}</span>
                                </div>
                              )}
                            </td>

                            {/* Col 2: Price Condition (Includes Base Price + Volume Tiers) */}
                            <td className="py-2 px-2.5 border-l border-slate-200 text-slate-800">
                              {row.basePrice > 0 ? (
                                <div className="space-y-0.5 tabular-nums">
                                  <div className="text-[11px] font-medium text-slate-800 leading-snug whitespace-nowrap">
                                    {t.exportPriceLabel}:{" "}
                                    <span className="font-bold text-slate-900">
                                      ฿{fmt(row.basePrice)}
                                    </span>
                                  </div>
                                  {row.priceConditionSummary.map(
                                    (line, lIdx) => (
                                      <div
                                        key={lIdx}
                                        className="text-[11px] font-medium text-slate-800 leading-snug whitespace-nowrap"
                                      >
                                        {line}
                                      </div>
                                    )
                                  )}
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-700">
                                  —
                                </span>
                              )}
                            </td>

                            {/* Col 3: Merged Cost (Effective Cost on top, Base Cost in parentheses below) */}
                            <td className="py-2 px-2 border-l border-slate-200 text-right tabular-nums">
                              {row.hasCost ? (
                                <div className="leading-tight space-y-0.5">
                                  <div className="text-[11.5px] font-bold text-slate-900 whitespace-nowrap">
                                    ฿{fmt(row.effectiveCost)}
                                  </div>
                                  <div className="text-[10.5px] font-semibold text-slate-500 whitespace-nowrap">
                                    (Base: ฿{fmt(row.baseCost)})
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-700 font-normal">
                                  —
                                </span>
                              )}
                            </td>

                            {isDomestic ? (
                              <>
                                {/* Col 6: Domestic — No Rebate */}
                                <td className="py-2 px-2 border-l border-slate-300 text-right tabular-nums">
                                  {renderRangeCell(
                                    row.domNoRebate,
                                    row.hasCost,
                                    row.basePrice,
                                    row.hasTierRange
                                  )}
                                </td>

                                {/* Col 7: Domestic — + Rebate */}
                                <td className="py-2 px-2 border-l border-slate-200 text-right tabular-nums">
                                  {renderRangeCell(
                                    row.domWithRebate,
                                    row.hasCost,
                                    row.basePrice,
                                    row.hasTierRange
                                  )}
                                </td>
                              </>
                            ) : (
                              <>
                                {/* Col 6: General Export — No Rec Com */}
                                <td className="py-2 px-1.5 border-l border-slate-300 text-right tabular-nums">
                                  {renderRangeCell(
                                    row.genNoRecCom,
                                    row.hasCost,
                                    row.basePrice,
                                    row.hasTierRange
                                  )}
                                </td>

                                {/* Col 7: General Export — + Rec Com */}
                                <td className="py-2 px-1.5 border-l border-slate-200 text-right tabular-nums">
                                  {renderRangeCell(
                                    row.genWithRecCom,
                                    row.hasCost,
                                    row.basePrice,
                                    row.hasTierRange
                                  )}
                                </td>

                                {/* Col 8: Exclusive Step 1 — DisFee */}
                                <td className="py-2 px-1.5 border-l border-slate-300 text-right tabular-nums">
                                  {renderRangeCell(
                                    row.exclStep1,
                                    row.hasCost,
                                    row.basePrice,
                                    row.hasTierRange
                                  )}
                                </td>

                                {/* Col 9: Exclusive Step 2 — + MKT */}
                                <td className="py-2 px-1.5 border-l border-slate-200 text-right tabular-nums">
                                  {renderRangeCell(
                                    row.exclStep2,
                                    row.hasCost,
                                    row.basePrice,
                                    row.hasTierRange
                                  )}
                                </td>

                                {/* Col 10: Exclusive Step 3 — + Rebate */}
                                <td className="py-2 px-1.5 border-l border-slate-200 text-right tabular-nums">
                                  {renderRangeCell(
                                    row.exclStep3,
                                    row.hasCost,
                                    row.basePrice,
                                    row.hasTierRange
                                  )}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  ))}
                </table>

                {/* Table Footer Note */}
                <div className="px-4 py-2.5 bg-slate-50 border-l border-r border-b border-slate-300 text-xs text-slate-800">
                  {t.footnote}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
