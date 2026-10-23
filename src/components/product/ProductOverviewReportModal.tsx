"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useSyncExternalStore,
} from "react";
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
  Users,
  Search,
  Building2,
  AlertCircle,
  Save,
} from "lucide-react";
import {
  ProductListItemDTO,
  ProductOverviewDTO,
  parsePriceConditions,
  calculateTierPrice,
  resolveUnifiedPrice,
  resolveProductAverageBaseCost,
  CustomerPricingCurrency,
  DEFAULT_USD_THB_RATE,
  detectAccountCurrency,
  convertCustomerPriceToThb,
  PriceStepTier,
} from "@/lib/product/product-dto";
import {
  getBatchProductOverviews,
  batchUpsertCompanyPrices,
  batchUpdateProductBasePrices,
} from "@/lib/actions/product";
import { CommercialRates } from "./ExportPricingSimulation";
import { useCompanyCostOverhead } from "@/lib/product/use-company-cost-overhead";

const emptySubscribe = () => () => {};

interface ProductOverviewReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProducts: ProductListItemDTO[];
  availableCategories?: {
    id?: string;
    category: string;
    count?: number;
    order?: number;
    isDefault?: boolean;
  }[];
  isExplicitSelection?: boolean;
}

type Lang = "th" | "en";

const DICT = {
  th: {
    modalTitle: "Overview Report",
    modalSubtitle:
      "ตารางสรุปภาพรวมต้นทุน เงื่อนไขราคา และอัตรากำไรสุทธิ (General Export & Exclusive)",
    pdfExportBtn: "PDF",
    csvExportBtn: "CSV",
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
    emptyTitle: "ไม่มีรายการสินค้าที่แสดงผล",
    emptyDesc: "ไม่มีรายการสินค้าที่ตรงตามตัวกรอง หรือยังไม่ได้เลือกสินค้า",

    // Topbar Controls
    simCostLabel: "Std. Cost",
    resetDefaultBtn: "Default",
    exclusionSwitchLabel: "No MKT / Rebate",
    domesticSwitchLabel: "Domestic",
    savePricesBtn: "บันทึกราคา",
    savingPricesBtn: "กำลังบันทึก...",
    savedPricesBtn: "บันทึกแล้ว!",
    discardBtn: "ยกเลิก",

    // Left Sidebar: Customer Accounts
    sidebarCustomersTitle: "ราคาขายลูกค้า",
    customerSearchPlaceholder: "ค้นหาชื่อลูกค้า...",
    customerFilterOnlyPriced: "เฉพาะสินค้าที่มีราคาของลูกค้านี้",
    customerFilterOnlyLoss: "เฉพาะรายการที่ขาดทุนจริง",
    customerFilterOnlyAnnex: "เฉพาะรายการงด MKT/Rebate (ANNEX)",
    customerClearSelection: "ดูราคามาตรฐาน (ไม่เลือกลูกค้า)",
    customerEmptyList: "ยังไม่มีข้อมูลราคาขายเฉพาะลูกค้าในสินค้าที่เลือก",
    customerNoSearchMatch: "ไม่พบรายชื่อลูกค้าที่ค้นหา",
    customerLossBadge: "ขาดทุน",
    customerAnnexBadge: "ANNEX",
    customerSellingPriceCol: "Selling Price",
    customerSellingPriceSub: "(ราคาขายลูกค้า)",
    minBreakEvenLabel: "Min",
    lossAlertText: "ขาดทุนจริง",
    annexNoMktRebateText: "งด MKT+Rebate",
    annexNoRebateText: "งด Rebate (ANNEX)",
    editedLabel: "แก้ไขแล้ว (รอบันทึก)",

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
    signDistributorHeader:
      "ผู้รับทราบ / ตัวแทนจำหน่าย (Acknowledged by Distributor)",
    signDateLabel: "วันที่ (Date): ........../........../..............",

    // Labels inside cells
    exportPriceLabel: "ราคาเปิด",
    standardPriceNoTier: "ราคามาตรฐาน (ไม่มีขั้นบันได)",
    cartonUnit: "ลัง",
    moreThan: "ลังขึ้นไป",
    noCost: "ยังไม่ระบุต้นทุน",
    footnote:
      "หมายเหตุ: ในช่อง Cost แสดงราคาแนะนำ 2 ระดับ คือ 'ANNEX' (ราคาขั้นต่ำกรณีระบุงด MKT & Rebate ในเอกสารแนบท้ายสัญญา) และ 'ครบสิทธิ์' (ราคาขั้นต่ำกรณีให้ครบทุกสิทธิ์) • สีส้มแสดงรายการที่เข้าเกณฑ์ ANNEX • สีแดงแสดงเฉพาะรายการที่ขาดทุนจริงแม้หักเฉพาะ DisFee แล้ว",
    footnoteCustomer:
      "หมายเหตุ: สามารถแก้ไขราคาขายลูกค้า (Selling Price) แล้วกดปุ่ม 'บันทึกราคา' ด้านบน • สีส้มคือรายการที่มีกำไรหลังหัก DisFee แต่ต้องระบุงด MKT/Rebate ในเอกสาร ANNEX • สีแดงคือรายการที่ขาดทุนจริง (ต่ำกว่า Effective Cost)",
  },
  en: {
    modalTitle: "Overview Report",
    modalSubtitle:
      "Executive summary of product costs, volume conditions, and net profit margins (General Export & Exclusive)",
    pdfExportBtn: "PDF",
    csvExportBtn: "CSV",
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
    emptyTitle: "No Matching Products",
    emptyDesc:
      "No products match the current filter criteria or none selected.",

    // Topbar Controls
    simCostLabel: "Std. Cost",
    resetDefaultBtn: "Default",
    exclusionSwitchLabel: "No MKT / Rebate",
    domesticSwitchLabel: "Domestic",
    savePricesBtn: "Save Prices",
    savingPricesBtn: "Saving...",
    savedPricesBtn: "Saved!",
    discardBtn: "Discard",

    // Left Sidebar: Customer Accounts
    sidebarCustomersTitle: "Customer Accounts",
    customerSearchPlaceholder: "Search customer account...",
    customerFilterOnlyPriced: "Only items priced for customer",
    customerFilterOnlyLoss: "Only true loss-making items",
    customerFilterOnlyAnnex: "Only ANNEX (No MKT/Rebate) items",
    customerClearSelection: "Standard Price (All Products)",
    customerEmptyList: "No saved customer prices found in selected products.",
    customerNoSearchMatch: "No customer accounts match your search.",
    customerLossBadge: "Loss",
    customerAnnexBadge: "ANNEX",
    customerSellingPriceCol: "Selling Price",
    customerSellingPriceSub: "(Customer Rate)",
    minBreakEvenLabel: "Min",
    lossAlertText: "TRUE LOSS",
    annexNoMktRebateText: "No MKT+Rebate",
    annexNoRebateText: "No Rebate (ANNEX)",
    editedLabel: "Unsaved edit",

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
      "Note: Each cell displays the net selling price and profit margin (%) range from Max Tier → Base Price • Min in Cost column indicates the minimum break-even selling price • Red highlights loss-making scenarios only.",
    footnoteCustomer:
      "Note: Edit Selling Price and click 'Save Prices' in the top bar • Min in Cost column indicates the minimum break-even selling price • Red highlights loss-making scenarios only.",
  },
};

function calcScenarioMetrics(
  exportPrice: number,
  effectiveCost: number,
  vRates: CommercialRates,
  isAlreadyInvoicePrice: boolean = false
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

  // Model B: Exclusive Distributor
  // When evaluating a Customer's saved Selling Price (isAlreadyInvoicePrice = true),
  // DisFee has already been deducted directly into the Invoice unit price, so only MKT and Rebate apply.
  const exclQuotation = isAlreadyInvoicePrice
    ? exportPrice
    : calculateTierPrice(exportPrice, vRates.distFeeRate);
  const exclStep1Profit = exclQuotation - effectiveCost;
  const exclStep1Pct =
    exclQuotation > 0 ? (exclStep1Profit / exclQuotation) * 100 : 0;

  const exclMkt = (exclQuotation * vRates.mktSupportRate) / 100;
  const exclAfterMkt = exclQuotation - exclMkt;
  const exclStep2Profit = exclAfterMkt - effectiveCost;
  const exclStep2Pct =
    exclQuotation > 0 ? (exclStep2Profit / exclQuotation) * 100 : 0;

  const exclRebate = (exclQuotation * vRates.rebateRate) / 100;
  const exclNetRev = exclQuotation - exclMkt - exclRebate;
  const exclStep3Profit = exclNetRev - effectiveCost;
  const exclStep3Pct =
    exclQuotation > 0 ? (exclStep3Profit / exclQuotation) * 100 : 0;

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

function calcBreakEvenPrices(
  effectiveCost: number,
  vRates: CommercialRates,
  maxDiscount: number = 0
): {
  minCustomerAnnexPrice: number;
  minCustomerFullPrice: number;
  minCatalogAnnexPrice: number;
  minCatalogFullPrice: number;
  minCatalogBaseNoLoss: number;
  minCatalogBaseFullSupport: number;
  minCatalogBaseDomNoLoss: number;
  minCatalogBaseDomFullSupport: number;
  minInvoicePrice: number;
  minGenExport: number;
  minExclusive: number;
  minDomestic: number;
} {
  if (effectiveCost <= 0) {
    return {
      minCustomerAnnexPrice: 0,
      minCustomerFullPrice: 0,
      minCatalogAnnexPrice: 0,
      minCatalogFullPrice: 0,
      minCatalogBaseNoLoss: 0,
      minCatalogBaseFullSupport: 0,
      minCatalogBaseDomNoLoss: 0,
      minCatalogBaseDomFullSupport: 0,
      minInvoicePrice: 0,
      minGenExport: 0,
      minExclusive: 0,
      minDomestic: 0,
    };
  }

  // Tier 1 (Customer Invoice): DisFee is already applied to unit price; MKT & Rebate waived via ANNEX -> covers Effective Cost
  const minCustomerAnnexPrice = Number(effectiveCost.toFixed(2));

  const genFactor = 1 - vRates.commissionRate / 100;
  const minGenExport =
    genFactor > 0 ? Math.ceil((effectiveCost / genFactor) * 100) / 100 : 0;

  const postInvoiceFactor =
    1 - (vRates.mktSupportRate + vRates.rebateRate) / 100;
  const minPostInvoiceExcl =
    postInvoiceFactor > 0
      ? Math.ceil((effectiveCost / postInvoiceFactor) * 100) / 100
      : 0;

  // Tier 2 (Customer Invoice Full): covers max of Rec Com or MKT+Rebate
  const minInvoicePrice = Math.max(minGenExport, minPostInvoiceExcl);
  const minCustomerFullPrice = minInvoicePrice;

  const distFactor = 1 - vRates.distFeeRate / 100;

  // Tier 1 (Standard Catalog Export): before DisFee, with MKT & Rebate waived via ANNEX
  let minCatalogAnnexPrice = 0;
  if (distFactor > 0) {
    minCatalogAnnexPrice =
      Math.ceil((effectiveCost / distFactor) * 100) / 100;
    while (
      calculateTierPrice(minCatalogAnnexPrice, vRates.distFeeRate) <
      effectiveCost - 0.005
    ) {
      minCatalogAnnexPrice = Number((minCatalogAnnexPrice + 0.01).toFixed(2));
    }
  }

  // Tier 2 (Standard Catalog Export Full): before DisFee, covering DisFee + MKT + Rebate
  let minExclusive = 0;
  if (postInvoiceFactor > 0 && distFactor > 0) {
    const requiredQuotation = effectiveCost / postInvoiceFactor;
    minExclusive = Math.ceil((requiredQuotation / distFactor) * 100) / 100;
    while (
      calculateTierPrice(minExclusive, vRates.distFeeRate) * postInvoiceFactor <
      effectiveCost - 0.005
    ) {
      minExclusive = Number((minExclusive + 0.01).toFixed(2));
    }
  }
  const minCatalogFullPrice = minExclusive;

  const domFactor = 1 - vRates.rebateRate / 100;
  const minDomestic =
    domFactor > 0 ? Math.ceil((effectiveCost / domFactor) * 100) / 100 : 0;

  // Compute exact minimum Base Price (ราคาเปิด) in Standard Catalog mode accounting for maxDiscount carton tier
  const maxDiscFactor = Math.max(0.01, 1 - maxDiscount / 100);

  let minCatalogBaseNoLoss = minCatalogAnnexPrice;
  if (maxDiscount > 0 && minCatalogAnnexPrice > 0) {
    minCatalogBaseNoLoss =
      Math.floor(((minCatalogAnnexPrice - 0.01) / maxDiscFactor) * 100) / 100;
    while (
      calculateTierPrice(
        calculateTierPrice(minCatalogBaseNoLoss, maxDiscount),
        vRates.distFeeRate
      ) <
      effectiveCost - 0.005
    ) {
      minCatalogBaseNoLoss = Number((minCatalogBaseNoLoss + 0.01).toFixed(2));
    }
  }

  let minCatalogBaseFullSupport = minCatalogFullPrice;
  if (maxDiscount > 0 && minCatalogFullPrice > 0) {
    minCatalogBaseFullSupport =
      Math.floor(((minCatalogFullPrice - 0.01) / maxDiscFactor) * 100) / 100;
    while (
      calculateTierPrice(
        calculateTierPrice(minCatalogBaseFullSupport, maxDiscount),
        vRates.distFeeRate
      ) *
        postInvoiceFactor <
      effectiveCost - 0.005
    ) {
      minCatalogBaseFullSupport = Number(
        (minCatalogBaseFullSupport + 0.01).toFixed(2)
      );
    }
  }

  let minCatalogBaseDomNoLoss = minCustomerAnnexPrice;
  if (maxDiscount > 0 && minCustomerAnnexPrice > 0) {
    minCatalogBaseDomNoLoss =
      Math.floor(((minCustomerAnnexPrice - 0.01) / maxDiscFactor) * 100) / 100;
    while (
      calculateTierPrice(minCatalogBaseDomNoLoss, maxDiscount) <
      effectiveCost - 0.005
    ) {
      minCatalogBaseDomNoLoss = Number(
        (minCatalogBaseDomNoLoss + 0.01).toFixed(2)
      );
    }
  }

  let minCatalogBaseDomFullSupport = minDomestic;
  if (maxDiscount > 0 && minDomestic > 0) {
    minCatalogBaseDomFullSupport =
      Math.floor(((minDomestic - 0.01) / maxDiscFactor) * 100) / 100;
    while (
      calculateTierPrice(minCatalogBaseDomFullSupport, maxDiscount) *
        domFactor <
      effectiveCost - 0.005
    ) {
      minCatalogBaseDomFullSupport = Number(
        (minCatalogBaseDomFullSupport + 0.01).toFixed(2)
      );
    }
  }

  return {
    minCustomerAnnexPrice,
    minCustomerFullPrice,
    minCatalogAnnexPrice,
    minCatalogFullPrice,
    minCatalogBaseNoLoss,
    minCatalogBaseFullSupport,
    minCatalogBaseDomNoLoss,
    minCatalogBaseDomFullSupport,
    minInvoicePrice,
    minGenExport,
    minExclusive,
    minDomestic,
  };
}

interface ScenarioRangeMetric {
  minSellPrice: number;
  maxSellPrice: number;
  minProfit: number;
  maxProfit: number;
  minPct: number;
  maxPct: number;
}

export type CommercialAnnexStatus = "none" | "no_rebate" | "no_mkt_rebate";

interface VariantOverviewRow {
  variantId: string;
  targetVariantIds: string[];
  formula: string;
  sku: string | null;
  savedBasePrice: number;
  basePrice: number;
  isBasePriceModified: boolean;
  savedCustomerPrice: number | null;
  customerSellingPrice: number | null;
  customerCurrency: CustomerPricingCurrency;
  customerSellingPriceThb: number;
  isModified: boolean;
  activeEvalPrice: number;
  baseCost: number;
  hasCost: boolean;
  effectiveCost: number;
  minCustomerAnnexPrice: number;
  minCustomerFullPrice: number;
  minCatalogAnnexPrice: number;
  minCatalogFullPrice: number;
  minCatalogBaseNoLoss: number;
  minCatalogBaseFullSupport: number;
  minCatalogBaseDomNoLoss: number;
  minCatalogBaseDomFullSupport: number;
  minInvoicePrice: number;
  minGenExportPrice: number;
  minExclusivePrice: number;
  minDomesticPrice: number;
  isTrueLoss: boolean;
  annexStatus: CommercialAnnexStatus;
  isRowLoss: boolean;
  tiers: PriceStepTier[];
  hasTierRange: boolean;
  hasStdTierRange: boolean;
  stdGenMinPrice: number;
  stdGenMaxPrice: number;
  stdExclMinPrice: number;
  stdExclMaxPrice: number;
  priceConditionSummary: string[];
  genNoRecCom: ScenarioRangeMetric;
  genWithRecCom: ScenarioRangeMetric;
  exclStep1: ScenarioRangeMetric;
  exclStep2: ScenarioRangeMetric;
  exclStep3: ScenarioRangeMetric;
  isNoMkt: boolean;
  isNoRebate: boolean;
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

interface CustomerAccountSummary {
  companyId: string;
  companyName: string;
  currency: CustomerPricingCurrency;
  autoDetectedCurrency: CustomerPricingCurrency;
  pricedVariantsCount: number;
  trueLossCount: number;
  annexCount: number;
  lossVariantsCount: number;
}

interface PendingPriceEntry {
  productId: string;
  companyId: string;
  companyName: string;
  targetVariantIds: string[];
  price: number;
}

interface PendingBasePriceEntry {
  productId: string;
  savedBasePrice: number;
  price: number;
}

type MinimizeMode = "normal" | "min_cost" | "avg_cost";

const MINIMIZE_MODE_OPTIONS: {
  value: MinimizeMode;
  label: string;
  shortLabel: string;
}[] = [
  { value: "normal", label: "Normal (All Variants)", shortLabel: "Normal" },
  { value: "min_cost", label: "Minimize (Min Cost)", shortLabel: "Minimize" },
  { value: "avg_cost", label: "Average (Avg Cost)", shortLabel: "Average" },
];

interface CustomerSellingPriceInputProps {
  value: number | null;
  currency: CustomerPricingCurrency;
  isLoss: boolean;
  isAnnex: boolean;
  isModified: boolean;
  onDraftChange: (nextPrice: number) => void;
}

/**
 * Isolated zero-lag number input for customer selling price:
 * - Keystrokes update local string state at 60fps without re-rendering the 380-row table on every digit
 * - Debounces live calculation updates (140ms) and commits immediately on Enter / Blur
 * - Fixed width w-[68px] so table columns never shift when typing
 */
const CustomerSellingPriceInput = React.memo(function CustomerSellingPriceInput({
  value,
  currency,
  isLoss,
  isAnnex,
  isModified,
  onDraftChange,
}: CustomerSellingPriceInputProps) {
  const [localStr, setLocalStr] = useState<string>(() =>
    value !== null && value > 0 ? value.toFixed(2) : ""
  );
  const [isFocused, setIsFocused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDraftChangeRef = useRef(onDraftChange);
  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  }, [onDraftChange]);

  useEffect(() => {
    if (!isFocused) {
      setLocalStr(value !== null && value > 0 ? value.toFixed(2) : "");
    }
  }, [value, isFocused]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const flushPrice = (raw: string, formatDisplay: boolean) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const parsed = parseFloat(raw);
    if (!Number.isNaN(parsed) && parsed > 0) {
      const rounded = Number(parsed.toFixed(2));
      if (formatDisplay) setLocalStr(rounded.toFixed(2));
      onDraftChangeRef.current(rounded);
    } else {
      if (formatDisplay) setLocalStr("");
      onDraftChangeRef.current(0);
    }
  };

  return (
    <div
      className={`w-[68px] inline-flex items-center justify-end gap-0.5 rounded-md px-1 py-0.5 border transition-colors ${
        isLoss
          ? "bg-rose-50 border-rose-400 text-rose-700 focus-within:border-rose-600"
          : isAnnex
          ? "bg-amber-50/90 border-amber-400 text-slate-900 focus-within:border-amber-600"
          : isModified
          ? "bg-[#F7FEE7] border-[#84CC16] text-slate-900 focus-within:border-slate-900"
          : "bg-white border-slate-300 text-slate-900 hover:border-slate-400 focus-within:border-slate-900"
      }`}
    >
      <span
        className={`text-[10px] font-bold select-none shrink-0 ${
          isLoss
            ? "text-rose-600"
            : isAnnex
            ? "text-amber-700"
            : "text-slate-500"
        }`}
      >
        {currency === "USD" ? "$" : "฿"}
      </span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={localStr}
        placeholder="—"
        onFocus={(e) => {
          setIsFocused(true);
          e.target.select();
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setLocalStr(raw);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            const parsed = parseFloat(raw);
            if (!Number.isNaN(parsed) && parsed >= 0) {
              onDraftChangeRef.current(Number(parsed.toFixed(2)));
            }
          }, 140);
        }}
        onBlur={() => {
          setIsFocused(false);
          flushPrice(localStr, true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={`overview-selling-price-input w-full min-w-0 bg-transparent text-right text-[10.5px] font-extrabold outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
          isLoss ? "text-rose-700" : "text-slate-900"
        }`}
      />
    </div>
  );
});

export function ProductOverviewReportModal({
  isOpen,
  onClose,
  selectedProducts,
  availableCategories = [],
}: ProductOverviewReportModalProps) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const [lang, setLang] = useState<Lang>("th");
  const [minimizeMode, setMinimizeMode] = useState<MinimizeMode>("avg_cost");
  const [isMinimizeDropdownOpen, setIsMinimizeDropdownOpen] = useState(false);
  const minimizeDropdownRef = useRef<HTMLDivElement>(null);
  const [isViewDropdownOpen, setIsViewDropdownOpen] = useState(false);
  const viewDropdownRef = useRef<HTMLDivElement>(null);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const [isExclusionReportMode, setIsExclusionReportMode] = useState(false);
  const [isDomestic, setIsDomestic] = useState(false);
  const [simulatedOverheadInput, setSimulatedOverheadInput] = useState<
    string | null
  >(null);
  const [detailsCache, setDetailsCache] = useState<
    Record<string, ProductOverviewDTO>
  >({});

  // Customer Account Selection & Filter State (Left Sidebar)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    null
  );
  const [customerSearch, setCustomerSearch] = useState("");
  const [onlyCustomerPricedItems, setOnlyCustomerPricedItems] = useState(true);
  const [onlyLossItems, setOnlyLossItems] = useState(false);
  const [onlyAnnexItems, setOnlyAnnexItems] = useState(false);

  // Unsaved Draft Edits State: keyed by `${companyId}::${rowVariantKey}` (Customer Mode) and `${productId}` (Standard Catalog Base Price)
  const [pendingPriceEdits, setPendingPriceEdits] = useState<
    Record<string, PendingPriceEntry>
  >({});
  const [pendingBasePriceEdits, setPendingBasePriceEdits] = useState<
    Record<string, PendingBasePriceEntry>
  >({});
  const [isSavingPrices, setIsSavingPrices] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Live USD -> THB Exchange Rate + Topbar Simulator + Per-Customer Currency Override
  const [liveUsdRate, setLiveUsdRate] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const cached = window.localStorage.getItem("crm_usd_thb_exchange_rate_v1");
      const parsed = cached ? parseFloat(cached) : NaN;
      if (!Number.isNaN(parsed) && parsed > 20 && parsed < 60) {
        return Number(parsed.toFixed(2));
      }
    }
    return DEFAULT_USD_THB_RATE;
  });
  const [simulatedUsdRateInput, setSimulatedUsdRateInput] = useState<
    string | null
  >(null);
  const [customerCurrencyOverrides, setCustomerCurrencyOverrides] = useState<
    Record<string, CustomerPricingCurrency>
  >(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(
          "crm_customer_currency_overrides_v1"
        );
        if (raw) {
          return JSON.parse(raw) as Record<string, CustomerPricingCurrency>;
        }
      } catch {
        // ignore invalid storage
      }
    }
    return {};
  });

  // Auto-fetch latest live USD -> THB exchange rate when modal opens
  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    const fetchRate = async () => {
      try {
        const res = await fetch("https://open.er-api.com/v6/latest/USD");
        if (!res.ok) throw new Error("Primary FX API failed");
        const data = await res.json();
        const thbRate = data?.rates?.THB;
        if (
          active &&
          typeof thbRate === "number" &&
          thbRate > 20 &&
          thbRate < 60
        ) {
          const rounded = Number(thbRate.toFixed(2));
          setLiveUsdRate(rounded);
          window.localStorage.setItem(
            "crm_usd_thb_exchange_rate_v1",
            String(rounded)
          );
          return;
        }
      } catch {
        try {
          const fallbackRes = await fetch(
            "https://api.frankfurter.app/latest?from=USD&to=THB"
          );
          if (!fallbackRes.ok) return;
          const fallbackData = await fallbackRes.json();
          const thbRate = fallbackData?.rates?.THB;
          if (
            active &&
            typeof thbRate === "number" &&
            thbRate > 20 &&
            thbRate < 60
          ) {
            const rounded = Number(thbRate.toFixed(2));
            setLiveUsdRate(rounded);
            window.localStorage.setItem(
              "crm_usd_thb_exchange_rate_v1",
              String(rounded)
            );
          }
        } catch {
          // Keep cached / default rate if offline
        }
      }
    };

    void fetchRate();
    return () => {
      active = false;
    };
  }, [isOpen]);

  const isSimulatingUsdRate =
    simulatedUsdRateInput !== null &&
    simulatedUsdRateInput.trim() !== "" &&
    !Number.isNaN(Number(simulatedUsdRateInput)) &&
    Number(simulatedUsdRateInput) > 0;

  const activeUsdRate = isSimulatingUsdRate
    ? Math.max(1, Number(parseFloat(simulatedUsdRateInput!).toFixed(2)) || liveUsdRate)
    : liveUsdRate;

  const handleToggleCustomerCurrency = useCallback(
    (companyId: string, currentCurrency: CustomerPricingCurrency) => {
      const nextCurrency: CustomerPricingCurrency =
        currentCurrency === "USD" ? "THB" : "USD";
      setCustomerCurrencyOverrides((prev) => {
        const next = { ...prev, [companyId]: nextCurrency };
        try {
          window.localStorage.setItem(
            "crm_customer_currency_overrides_v1",
            JSON.stringify(next)
          );
        } catch {
          // ignore
        }
        return next;
      });
    },
    []
  );

  const isMinimized = minimizeMode !== "normal";

  const {
    overhead,
    totalPercent: companyCostOverheadPercent,
    commercialRates,
    calculateEffectiveCost,
  } = useCompanyCostOverhead();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        minimizeDropdownRef.current &&
        !minimizeDropdownRef.current.contains(target)
      ) {
        setIsMinimizeDropdownOpen(false);
      }
      if (
        viewDropdownRef.current &&
        !viewDropdownRef.current.contains(target)
      ) {
        setIsViewDropdownOpen(false);
      }
      if (
        exportDropdownRef.current &&
        !exportDropdownRef.current.contains(target)
      ) {
        setIsExportDropdownOpen(false);
      }
    };
    if (
      isMinimizeDropdownOpen ||
      isViewDropdownOpen ||
      isExportDropdownOpen
    ) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMinimizeDropdownOpen, isViewDropdownOpen, isExportDropdownOpen]);

  const t = DICT[lang];

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
      });

    return () => {
      active = false;
    };
  }, [isOpen, selectedProducts, detailsCache]);

  const fmt = useCallback(
    (num: number, decimals: number = 2) =>
      num.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
    []
  );

  // Stage a customer price change locally (does NOT mutate detailsCache or trigger DB calls until Save is clicked)
  const handleStageCustomerPrice = useCallback(
    (
      productId: string,
      rowKey: string,
      targetVariantIds: string[],
      companyId: string,
      companyName: string,
      savedPrice: number | null,
      nextPrice: number
    ) => {
      const editKey = `${companyId}::${rowKey}`;
      setSaveSuccess(false);
      setPendingPriceEdits((prev) => {
        const normalizedSaved = savedPrice ?? 0;
        const isSameAsSaved = Math.abs(nextPrice - normalizedSaved) < 0.005;
        if (isSameAsSaved) {
          if (!(editKey in prev)) return prev;
          const next = { ...prev };
          delete next[editKey];
          return next;
        }
        return {
          ...prev,
          [editKey]: {
            productId,
            companyId,
            companyName,
            targetVariantIds,
            price: nextPrice,
          },
        };
      });
    },
    []
  );

  const handleStageBasePrice = useCallback(
    (productId: string, savedBasePrice: number, nextPrice: number) => {
      setSaveSuccess(false);
      setPendingBasePriceEdits((prev) => {
        const normalizedSaved = savedBasePrice ?? 0;
        const isSameAsSaved = Math.abs(nextPrice - normalizedSaved) < 0.005;
        if (isSameAsSaved) {
          if (!(productId in prev)) return prev;
          const next = { ...prev };
          delete next[productId];
          return next;
        }
        return {
          ...prev,
          [productId]: {
            productId,
            savedBasePrice: normalizedSaved,
            price: nextPrice,
          },
        };
      });
    },
    []
  );

  const pendingEntriesList = useMemo(
    () => Object.values(pendingPriceEdits),
    [pendingPriceEdits]
  );

  const pendingBaseEntriesList = useMemo(
    () => Object.values(pendingBasePriceEdits),
    [pendingBasePriceEdits]
  );

  const handleDiscardPendingPrices = useCallback(() => {
    setPendingPriceEdits({});
    setPendingBasePriceEdits({});
    setSaveSuccess(false);
  }, []);

  const handleSavePendingPrices = useCallback(async () => {
    const entries = Object.values(pendingPriceEdits);
    const baseEntries = Object.values(pendingBasePriceEdits);
    if ((entries.length === 0 && baseEntries.length === 0) || isSavingPrices) {
      return;
    }

    setIsSavingPrices(true);
    setSaveSuccess(false);

    try {
      const promises: Promise<unknown>[] = [];

      if (entries.length > 0) {
        const flatPayload: Array<{
          variantId: string;
          companyId: string;
          price: number;
        }> = [];

        for (const entry of entries) {
          for (const vId of entry.targetVariantIds) {
            flatPayload.push({
              variantId: vId,
              companyId: entry.companyId,
              price: entry.price,
            });
          }
        }
        promises.push(batchUpsertCompanyPrices(flatPayload));
      }

      if (baseEntries.length > 0) {
        promises.push(
          batchUpdateProductBasePrices(
            baseEntries.map((b) => ({
              productId: b.productId,
              price: b.price,
            }))
          )
        );
      }

      await Promise.all(promises);

      // Commit all saved entries into detailsCache at once
      setDetailsCache((prev) => {
        const next = { ...prev };

        for (const bEntry of baseEntries) {
          const prod = next[bEntry.productId];
          if (!prod) continue;
          next[bEntry.productId] = {
            ...prod,
            variants: prod.variants.map((v) => ({
              ...v,
              price: bEntry.price,
            })),
          };
        }

        for (const entry of entries) {
          const prod = next[entry.productId];
          if (!prod) continue;

          const nextVariants = prod.variants.map((v) => {
            if (!entry.targetVariantIds.includes(v.id)) return v;
            const existingIdx = v.customPrices.findIndex(
              (cp) => cp.companyId === entry.companyId
            );
            const nextCustomPrices = [...v.customPrices];
            if (entry.price > 0) {
              if (existingIdx >= 0) {
                nextCustomPrices[existingIdx] = {
                  ...nextCustomPrices[existingIdx],
                  price: entry.price,
                };
              } else {
                nextCustomPrices.push({
                  id: `saved_${v.id}_${entry.companyId}`,
                  companyId: entry.companyId,
                  companyName: entry.companyName,
                  price: entry.price,
                });
              }
            } else if (existingIdx >= 0) {
              nextCustomPrices.splice(existingIdx, 1);
            }
            return {
              ...v,
              customPrices: nextCustomPrices,
            };
          });

          next[entry.productId] = {
            ...prod,
            variants: nextVariants,
          };
        }
        return next;
      });

      setPendingPriceEdits({});
      setPendingBasePriceEdits({});
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error("Failed to batch save prices:", err);
    } finally {
      setIsSavingPrices(false);
    }
  }, [pendingPriceEdits, pendingBasePriceEdits, isSavingPrices]);

  // Order products identically to /product (ProductCardList: grouped by availableCategories order, then Best Selling first, then Name)
  const orderedProducts = useMemo(() => {
    const groups: { category: string; products: ProductListItemDTO[] }[] = [];
    const groupMap = new Map<
      string,
      { category: string; products: ProductListItemDTO[] }
    >();

    if (availableCategories && availableCategories.length > 0) {
      for (const cat of availableCategories) {
        if (!cat.category || cat.category === "ALL") continue;
        const entry = {
          category: cat.category,
          products: [] as ProductListItemDTO[],
        };
        groupMap.set(cat.category.trim().toLowerCase(), entry);
        groups.push(entry);
      }
    }

    const uncategorized: ProductListItemDTO[] = [];

    for (const p of selectedProducts) {
      const catKey = p.category?.trim().toLowerCase();
      if (catKey && groupMap.has(catKey)) {
        groupMap.get(catKey)!.products.push(p);
      } else if (catKey) {
        const newEntry = { category: p.category!.trim(), products: [p] };
        groupMap.set(catKey, newEntry);
        groups.push(newEntry);
      } else {
        uncategorized.push(p);
      }
    }

    const sortByBestSellingAndName = (
      a: ProductListItemDTO,
      b: ProductListItemDTO
    ) => {
      const aBest = (a.starRating || 0) > 0 ? 1 : 0;
      const bBest = (b.starRating || 0) > 0 ? 1 : 0;
      if (aBest !== bBest) {
        return bBest - aBest;
      }
      return a.name.localeCompare(b.name);
    };

    const result: ProductListItemDTO[] = [];
    for (const g of groups) {
      if (g.products.length === 0) continue;
      g.products.sort(sortByBestSellingAndName);
      result.push(...g.products);
    }

    if (uncategorized.length > 0) {
      uncategorized.sort(sortByBestSellingAndName);
      result.push(...uncategorized);
    }

    return result;
  }, [selectedProducts, availableCategories]);

  // Pre-parse tier conditions per variant ONCE when detailsCache loads (huge speed win)
  const parsedVariantsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        tiers: PriceStepTier[];
        maxDiscount: number;
        priceConditionSummary: string[];
      }
    >();

    for (const item of orderedProducts) {
      const detail = detailsCache[item.id];
      if (!detail || !detail.variants) continue;
      const unifiedBasePrice = resolveUnifiedPrice(
        detail.variants.map((v) => v.price)
      );
      for (const v of detail.variants) {
        const tiers = parsePriceConditions(v.priceCondition);
        const maxTier = tiers.length > 0 ? tiers[tiers.length - 1] : null;
        const maxDiscount = maxTier?.discountPercent ?? 0;
        const basePrice = unifiedBasePrice > 0 ? unifiedBasePrice : Number(v.price || 0);
        const priceConditionSummary =
          tiers.length === 0
            ? []
            : tiers.map((tier, idx) => {
                const isLast = idx === tiers.length - 1 || tier.maxQuantity === null;
                const rangeStr = isLast
                  ? `≥${tier.minQuantity} ${t.cartonUnit}`
                  : `${tier.minQuantity}–${tier.maxQuantity} ${t.cartonUnit}`;
                const tierUnitPrice = calculateTierPrice(
                  basePrice,
                  tier.discountPercent
                );
                return `${rangeStr}: -${tier.discountPercent}% (฿${fmt(tierUnitPrice)})`;
              });
        map.set(v.id, { tiers, maxDiscount, priceConditionSummary });
      }
    }
    return map;
  }, [orderedProducts, detailsCache, t.cartonUnit, t.moreThan, fmt]);

  // Aggregate Customer Accounts at the Product level (1 Product = 1 Unified Customer Price compared against Product Average Cost)
  // Automatically detects whether each Customer Account is priced in USD or THB (with manual override support)
  const customerAccounts = useMemo<CustomerAccountSummary[]>(() => {
    const rawAccountProducts = new Map<
      string,
      {
        companyId: string;
        companyName: string;
        items: Array<{
          unifiedPrice: number;
          avgBaseCost: number;
          effectiveCost: number;
          exportPrice: number;
          hasCost: boolean;
        }>;
      }
    >();

    const useCustomOverhead = simulatedOverheadInput !== null;

    for (const item of orderedProducts) {
      const detail = detailsCache[item.id];
      if (!detail || !detail.variants || detail.variants.length === 0) continue;

      const unifiedExportPrice = resolveUnifiedPrice(
        detail.variants.map((v) => v.price)
      );

      // Average Base Cost across all variants of this Product
      const costStats = resolveProductAverageBaseCost(
        detail.variants.map((v) => v.productCost)
      );
      const avgBaseCost = costStats.avgCost;
      const hasCost = avgBaseCost > 0;
      const effectiveCost = hasCost
        ? useCustomOverhead
          ? Number((avgBaseCost * (1 + activeOverheadPercent / 100)).toFixed(2))
          : calculateEffectiveCost(avgBaseCost)
        : 0;

      // Group saved customer prices by companyId across all variants of this Product
      const companyPricesOnProduct = new Map<
        string,
        { companyName: string; prices: number[] }
      >();

      for (const v of detail.variants) {
        if (!v.customPrices || v.customPrices.length === 0) continue;
        for (const cp of v.customPrices) {
          if (!cp.price || cp.price <= 0) continue;
          const entry = companyPricesOnProduct.get(cp.companyId) || {
            companyName: cp.companyName,
            prices: [],
          };
          entry.prices.push(cp.price);
          companyPricesOnProduct.set(cp.companyId, entry);
        }
      }

      for (const [companyId, info] of companyPricesOnProduct.entries()) {
        const unifiedCustomerPrice = resolveUnifiedPrice(info.prices);
        if (unifiedCustomerPrice <= 0) continue;

        const existing = rawAccountProducts.get(companyId) || {
          companyId,
          companyName: info.companyName,
          items: [],
        };

        existing.items.push({
          unifiedPrice: unifiedCustomerPrice,
          avgBaseCost,
          effectiveCost,
          exportPrice: unifiedExportPrice,
          hasCost,
        });

        rawAccountProducts.set(companyId, existing);
      }
    }

    const summaries: CustomerAccountSummary[] = [];

    for (const [companyId, acc] of rawAccountProducts.entries()) {
      const autoDetectedCurrency = detectAccountCurrency(
        acc.items.map((it) => ({
          price: it.unifiedPrice,
          baseCostThb: it.avgBaseCost,
          exportPriceThb: it.exportPrice,
        }))
      );
      const currency: CustomerPricingCurrency =
        customerCurrencyOverrides[companyId] ?? autoDetectedCurrency;

      let trueLossCount = 0;
      let annexCount = 0;
      for (const it of acc.items) {
        if (!it.hasCost) continue;
        const evalPriceThb = convertCustomerPriceToThb(
          it.unifiedPrice,
          currency,
          activeUsdRate
        );
        const baseCalc = calcScenarioMetrics(
          evalPriceThb,
          it.effectiveCost,
          commercialRates,
          true
        );
        const isTrueLoss = isDomestic
          ? baseCalc.domProfitBest < -0.005
          : baseCalc.exclStep1Profit < -0.005;
        const isAnnex =
          !isTrueLoss &&
          (isDomestic
            ? baseCalc.domProfitWorst < -0.005
            : baseCalc.exclStep3Profit < -0.005);
        if (isTrueLoss) {
          trueLossCount += 1;
        } else if (isAnnex) {
          annexCount += 1;
        }
      }

      summaries.push({
        companyId,
        companyName: acc.companyName,
        currency,
        autoDetectedCurrency,
        pricedVariantsCount: acc.items.length,
        trueLossCount,
        annexCount,
        lossVariantsCount: trueLossCount,
      });
    }

    return summaries.sort((a, b) => {
      if (b.trueLossCount !== a.trueLossCount) {
        return b.trueLossCount - a.trueLossCount;
      }
      if (b.annexCount !== a.annexCount) {
        return b.annexCount - a.annexCount;
      }
      return a.companyName.localeCompare(b.companyName);
    });
  }, [
    orderedProducts,
    detailsCache,
    simulatedOverheadInput,
    activeOverheadPercent,
    calculateEffectiveCost,
    commercialRates,
    isDomestic,
    customerCurrencyOverrides,
    activeUsdRate,
  ]);

  const selectedCustomer = useMemo(
    () =>
      selectedCompanyId
        ? customerAccounts.find((c) => c.companyId === selectedCompanyId) ||
          null
        : null,
    [selectedCompanyId, customerAccounts]
  );

  const filteredCustomerAccounts = useMemo(() => {
    if (!customerSearch.trim()) return customerAccounts;
    const q = customerSearch.trim().toLowerCase();
    return customerAccounts.filter((c) =>
      c.companyName.toLowerCase().includes(q)
    );
  }, [customerAccounts, customerSearch]);

  // Build grouped rows by Product
  const productGroups = useMemo<ProductOverviewGroup[]>(() => {
    const groups: ProductOverviewGroup[] = [];
    const useCustomOverhead = simulatedOverheadInput !== null;
    const isCustomerMode = selectedCompanyId !== null;
    const activeCustomerCurrency: CustomerPricingCurrency =
      selectedCustomer?.currency ?? "THB";

    const buildRowFromSource = (
      variantId: string,
      targetVariantIds: string[],
      repVariantId: string,
      formula: string,
      sku: string | null,
      savedBasePrice: number,
      basePrice: number,
      isBasePriceModified: boolean,
      savedCustomerPrice: number | null,
      baseCost: number
    ): VariantOverviewRow & {
      wasSavedTrueLoss: boolean;
      wasSavedAnnex: boolean;
    } => {
      const hasCost = baseCost > 0;
      const effectiveCost = hasCost
        ? useCustomOverhead
          ? Number((baseCost * (1 + activeOverheadPercent / 100)).toFixed(2))
          : calculateEffectiveCost(baseCost)
        : 0;

      const parsed = parsedVariantsMap.get(repVariantId);
      const tiers = parsed?.tiers || [];
      const maxDiscount = parsed?.maxDiscount ?? 0;
      const priceConditionSummary = parsed?.priceConditionSummary || [];

      const breakEven = calcBreakEvenPrices(
        effectiveCost,
        commercialRates,
        maxDiscount
      );

      // Check if there is an unsaved draft edit for this row
      const pendingKey = selectedCompanyId
        ? `${selectedCompanyId}::${variantId}`
        : "";
      const pendingEntry = pendingKey ? pendingPriceEdits[pendingKey] : undefined;
      const isModified = pendingEntry !== undefined;
      const customerSellingPrice = isModified
        ? pendingEntry.price
        : savedCustomerPrice;

      const customerSellingPriceThb = isCustomerMode
        ? convertCustomerPriceToThb(
            customerSellingPrice,
            activeCustomerCurrency,
            activeUsdRate
          )
        : 0;

      const activeEvalPrice = isCustomerMode
        ? customerSellingPriceThb
        : basePrice;

      // Standard Catalog benchmark ranges (always computed from catalog basePrice & tiers so Customer Mode stays linked to Standard View)
      const stdGenMaxPrice = basePrice;
      const stdGenMinPrice = calculateTierPrice(basePrice, maxDiscount);
      const hasStdTierRange = stdGenMinPrice < stdGenMaxPrice - 0.005;
      const distFeeFactor = Math.max(0, 1 - commercialRates.distFeeRate / 100);
      const stdExclMaxPrice =
        basePrice > 0 ? Number((stdGenMaxPrice * distFeeFactor).toFixed(2)) : 0;
      const stdExclMinPrice =
        basePrice > 0 ? Number((stdGenMinPrice * distFeeFactor).toFixed(2)) : 0;

      // In Customer Mode, Selling Price is a single flat offered price (never discounted again by Price Condition tiers)
      const maxStepPrice = isCustomerMode
        ? activeEvalPrice
        : calculateTierPrice(activeEvalPrice, maxDiscount);
      const hasTierRange =
        !isCustomerMode && maxStepPrice < activeEvalPrice - 0.005;

      const baseCalc = calcScenarioMetrics(
        activeEvalPrice,
        effectiveCost,
        commercialRates,
        isCustomerMode
      );
      const maxCalc = isCustomerMode
        ? baseCalc
        : calcScenarioMetrics(
            maxStepPrice,
            effectiveCost,
            commercialRates,
            isCustomerMode
          );

      // In Customer Mode, evaluate against the customer's Selling Price itself (baseCalc, which is already Invoice price)
      // In Standard Mode, evaluate against the max carton tier (maxCalc)
      const rowEvalCalc = isCustomerMode ? baseCalc : maxCalc;

      // 1) TRUE LOSS (🔴 ขาดทุนจริง): Even after waiving MKT & Rebate via ANNEX, price after DisFee / Invoice is below Effective Cost
      const isTrueLoss =
        hasCost &&
        activeEvalPrice > 0 &&
        (isDomestic
          ? rowEvalCalc.domProfitBest < -0.005
          : rowEvalCalc.exclStep1Profit < -0.005);

      // 2) ANNEX STATUS (🟠 งด MKT/Rebate): Profitable at Step 1 (DisFee / Invoice), but cannot afford MKT and/or Rebate
      let annexStatus: CommercialAnnexStatus = "none";
      if (hasCost && activeEvalPrice > 0 && !isTrueLoss) {
        if (isDomestic) {
          if (rowEvalCalc.domProfitWorst < -0.005) {
            annexStatus = "no_rebate";
          }
        } else if (rowEvalCalc.exclStep2Profit < -0.005) {
          annexStatus = "no_mkt_rebate";
        } else if (rowEvalCalc.exclStep3Profit < -0.005) {
          annexStatus = "no_rebate";
        }
      }

      const isNoMkt =
        hasCost && activeEvalPrice > 0 && rowEvalCalc.exclStep2Profit < -0.005;
      const isNoRebate =
        hasCost &&
        activeEvalPrice > 0 &&
        rowEvalCalc.exclStep2Profit >= -0.005 &&
        rowEvalCalc.exclStep3Profit < -0.005;

      const isRowLoss = isTrueLoss;

      // Also check whether the SAVED price was a true loss or annex item so editing a row doesn't make it vanish when filters are active
      const savedEvalPrice = isCustomerMode
        ? convertCustomerPriceToThb(
            savedCustomerPrice,
            activeCustomerCurrency,
            activeUsdRate
          )
        : savedBasePrice;
      const savedTargetStep = isCustomerMode
        ? savedEvalPrice
        : calculateTierPrice(savedEvalPrice, maxDiscount);
      const savedTargetCalc = calcScenarioMetrics(
        savedTargetStep,
        effectiveCost,
        commercialRates,
        isCustomerMode
      );
      const wasSavedTrueLoss =
        hasCost &&
        savedEvalPrice > 0 &&
        (isDomestic
          ? savedTargetCalc.domProfitBest < -0.005
          : savedTargetCalc.exclStep1Profit < -0.005);
      const wasSavedAnnex =
        hasCost &&
        savedEvalPrice > 0 &&
        !wasSavedTrueLoss &&
        (isDomestic
          ? savedTargetCalc.domProfitWorst < -0.005
          : savedTargetCalc.exclStep3Profit < -0.005);

      return {
        variantId,
        targetVariantIds,
        formula,
        sku,
        savedBasePrice,
        basePrice,
        isBasePriceModified,
        savedCustomerPrice,
        customerSellingPrice,
        customerCurrency: activeCustomerCurrency,
        customerSellingPriceThb,
        isModified,
        activeEvalPrice,
        baseCost,
        hasCost,
        effectiveCost,
        minCustomerAnnexPrice: breakEven.minCustomerAnnexPrice,
        minCustomerFullPrice: breakEven.minCustomerFullPrice,
        minCatalogAnnexPrice: breakEven.minCatalogAnnexPrice,
        minCatalogFullPrice: breakEven.minCatalogFullPrice,
        minCatalogBaseNoLoss: breakEven.minCatalogBaseNoLoss,
        minCatalogBaseFullSupport: breakEven.minCatalogBaseFullSupport,
        minCatalogBaseDomNoLoss: breakEven.minCatalogBaseDomNoLoss,
        minCatalogBaseDomFullSupport: breakEven.minCatalogBaseDomFullSupport,
        minInvoicePrice: breakEven.minInvoicePrice,
        minGenExportPrice: breakEven.minGenExport,
        minExclusivePrice: breakEven.minExclusive,
        minDomesticPrice: breakEven.minDomestic,
        isTrueLoss,
        annexStatus,
        isRowLoss,
        wasSavedTrueLoss,
        wasSavedAnnex,
        tiers,
        hasTierRange,
        hasStdTierRange,
        stdGenMinPrice,
        stdGenMaxPrice,
        stdExclMinPrice,
        stdExclMaxPrice,
        priceConditionSummary,
        genNoRecCom: {
          minSellPrice: maxCalc.genBestSellPrice,
          maxSellPrice: baseCalc.genBestSellPrice,
          minProfit: maxCalc.genProfitBest,
          maxProfit: baseCalc.genProfitBest,
          minPct: maxCalc.genMarginBestPct,
          maxPct: baseCalc.genMarginBestPct,
        },
        genWithRecCom: {
          minSellPrice: maxCalc.genNetRev,
          maxSellPrice: baseCalc.genNetRev,
          minProfit: maxCalc.genProfitWorst,
          maxProfit: baseCalc.genProfitWorst,
          minPct: maxCalc.genMarginWorstPct,
          maxPct: baseCalc.genMarginWorstPct,
        },
        exclStep1: {
          minSellPrice: maxCalc.exclQuotation,
          maxSellPrice: baseCalc.exclQuotation,
          minProfit: maxCalc.exclStep1Profit,
          maxProfit: baseCalc.exclStep1Profit,
          minPct: maxCalc.exclStep1Pct,
          maxPct: baseCalc.exclStep1Pct,
        },
        exclStep2: {
          minSellPrice: maxCalc.exclAfterMkt,
          maxSellPrice: baseCalc.exclAfterMkt,
          minProfit: maxCalc.exclStep2Profit,
          maxProfit: baseCalc.exclStep2Profit,
          minPct: maxCalc.exclStep2Pct,
          maxPct: baseCalc.exclStep2Pct,
        },
        exclStep3: {
          minSellPrice: maxCalc.exclNetRev,
          maxSellPrice: baseCalc.exclNetRev,
          minProfit: maxCalc.exclStep3Profit,
          maxProfit: baseCalc.exclStep3Profit,
          minPct: maxCalc.exclStep3Pct,
          maxPct: baseCalc.exclStep3Pct,
        },
        isNoMkt,
        isNoRebate,
        domNoRebate: {
          minSellPrice: maxCalc.domBestSellPrice,
          maxSellPrice: baseCalc.domBestSellPrice,
          minProfit: maxCalc.domProfitBest,
          maxProfit: baseCalc.domProfitBest,
          minPct: maxCalc.domMarginBestPct,
          maxPct: baseCalc.domMarginBestPct,
        },
        domWithRebate: {
          minSellPrice: maxCalc.domNetRev,
          maxSellPrice: baseCalc.domNetRev,
          minProfit: maxCalc.domProfitWorst,
          maxProfit: baseCalc.domProfitWorst,
          minPct: maxCalc.domMarginWorstPct,
          maxPct: baseCalc.domMarginWorstPct,
        },
      };
    };

    for (const item of orderedProducts) {
      const detail = detailsCache[item.id];
      if (!detail || !detail.variants || detail.variants.length === 0) continue;

      const unifiedBasePrice = resolveUnifiedPrice(
        detail.variants.map((v) => v.price)
      );
      const pendingBase = pendingBasePriceEdits[detail.id];
      const isBasePriceModified = pendingBase !== undefined;
      const activeBasePrice = isBasePriceModified
        ? pendingBase.price
        : unifiedBasePrice;

      const repVariant =
        detail.variants.find((v) => v.isDefault && v.priceCondition) ||
        detail.variants.find((v) => v.priceCondition) ||
        detail.variants.find((v) => v.isDefault) ||
        detail.variants[0];

      // Resolve unified customer selling price for this Product (Mode / highest price across variants)
      const savedCustomerPricesForProduct = selectedCompanyId
        ? detail.variants
            .map(
              (v) =>
                v.customPrices?.find((cp) => cp.companyId === selectedCompanyId)
                  ?.price ?? 0
            )
            .filter((p) => p > 0)
        : [];
      const unifiedSavedCustomerPrice =
        savedCustomerPricesForProduct.length > 0
          ? resolveUnifiedPrice(savedCustomerPricesForProduct)
          : null;

      const productRowKey = `${detail.id}_product_unified`;

      if (selectedCompanyId && onlyCustomerPricedItems) {
        const hasSavedForProduct =
          unifiedSavedCustomerPrice !== null && unifiedSavedCustomerPrice > 0;
        const hasPendingForProduct =
          `${selectedCompanyId}::${productRowKey}` in pendingPriceEdits;
        if (!hasSavedForProduct && !hasPendingForProduct) continue;
      }

      let rows: Array<
        VariantOverviewRow & {
          wasSavedTrueLoss: boolean;
          wasSavedAnnex: boolean;
        }
      >;

      // When a Customer Account is selected OR Minimize mode is active:
      // Always collapse the Product into 1 single unified row using Average Cost (or Min Cost if min_cost selected without customer)
      if (selectedCompanyId !== null || minimizeMode !== "normal") {
        const costStats = resolveProductAverageBaseCost(
          detail.variants.map((v) => v.productCost)
        );
        const selectedBaseCost =
          costStats.count === 0
            ? 0
            : selectedCompanyId === null && minimizeMode === "min_cost"
            ? costStats.minCost
            : costStats.avgCost;

        rows = [
          buildRowFromSource(
            productRowKey,
            detail.variants.map((v) => v.id),
            repVariant.id,
            repVariant.formula || "Standard",
            repVariant.sku || null,
            unifiedBasePrice,
            activeBasePrice,
            isBasePriceModified,
            unifiedSavedCustomerPrice,
            selectedBaseCost
          ),
        ];
      } else {
        rows = detail.variants.map((v) => {
          const savedVarBase =
            unifiedBasePrice > 0 ? unifiedBasePrice : v.price || 0;
          const activeVarBase = isBasePriceModified
            ? pendingBase.price
            : savedVarBase;
          return buildRowFromSource(
            v.id,
            [v.id],
            repVariant.id,
            v.formula || "Standard",
            v.sku || null,
            savedVarBase,
            activeVarBase,
            isBasePriceModified,
            null,
            typeof v.productCost === "number" ? v.productCost : 0
          );
        });
      }

      if (onlyLossItems || onlyAnnexItems) {
        rows = rows.filter((r) => {
          const isRowEdited = r.isModified || r.isBasePriceModified;
          const matchLoss =
            onlyLossItems &&
            (r.isTrueLoss || (isRowEdited && r.wasSavedTrueLoss));
          const matchAnnex =
            onlyAnnexItems &&
            (r.annexStatus !== "none" || (isRowEdited && r.wasSavedAnnex));
          return matchLoss || matchAnnex;
        });
      }

      if (rows.length === 0) continue;

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
    orderedProducts,
    detailsCache,
    parsedVariantsMap,
    pendingPriceEdits,
    pendingBasePriceEdits,
    minimizeMode,
    selectedCompanyId,
    onlyCustomerPricedItems,
    onlyLossItems,
    onlyAnnexItems,
    isDomestic,
    commercialRates,
    calculateEffectiveCost,
    simulatedOverheadInput,
    activeOverheadPercent,
    selectedCustomer?.currency,
    activeUsdRate,
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
        ...(selectedCustomer
          ? [`Customer (${selectedCustomer.companyName}) Selling Price`]
          : []),
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
            ...(selectedCustomer
              ? [
                  row.customerSellingPrice !== null
                    ? row.customerSellingPrice.toFixed(2)
                    : "-",
                ]
              : []),
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
            ...(selectedCustomer
              ? [
                  row.customerSellingPrice !== null
                    ? row.customerSellingPrice.toFixed(2)
                    : "-",
                ]
              : []),
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
          ...(selectedCustomer
            ? [`Selling Price - ${selectedCustomer.companyName} (THB)`]
            : []),
          "Base Cost (THB)",
          `Effective Cost (+${activeOverheadPercent}%) (THB)`,
          "Min Break-Even Selling Price (THB)",
          "Domestic (No Rebate) - Net Price",
          "Domestic (No Rebate) - Margin (%)",
          `Domestic (+${commercialRates.rebateRate}% Rebate) - Net Price`,
          `Domestic (+${commercialRates.rebateRate}% Rebate) - Margin (%)`,
        ]
      : [
          "Product",
          "Brand",
          "Category",
          ...(isMinimized ? [] : ["Variant"]),
          "Export Price (THB)",
          "Price Condition",
          ...(selectedCustomer
            ? [`Selling Price - ${selectedCustomer.companyName} (THB)`]
            : []),
          "Base Cost (THB)",
          `Effective Cost (+${activeOverheadPercent}%) (THB)`,
          "Min Break-Even Selling Price (THB)",
          "General Export (No Rec Com) - Net Price",
          "General Export (No Rec Com) - Margin (%)",
          `General Export (+${commercialRates.commissionRate}% Rec Com) - Net Price`,
          `General Export (+${commercialRates.commissionRate}% Rec Com) - Margin (%)`,
          "Exclusive (DisFee) - Net Price",
          "Exclusive (DisFee) - Margin (%)",
          "Exclusive (+ MKT) - Net Price",
          "Exclusive (+ MKT) - Margin (%)",
          "Exclusive (+ Rebate) - Net Price",
          "Exclusive (+ Rebate) - Margin (%)",
        ];

    const csvLines: string[] = [headers.map(escapeCsv).join(",")];

    for (const group of productGroups) {
      group.rows.forEach((row) => {
        const condText =
          row.priceConditionSummary.length > 0
            ? row.priceConditionSummary.join(" | ")
            : "-";

        const hasValidPrice = row.activeEvalPrice > 0;

        const line = isDomestic
          ? [
              group.productName,
              group.brand || "-",
              group.category || "-",
              ...(isMinimized ? [] : [row.formula]),
              row.basePrice.toFixed(2),
              condText,
              ...(selectedCustomer
                ? [
                    row.customerSellingPrice !== null
                      ? row.customerSellingPrice.toFixed(2)
                      : "-",
                  ]
                : []),
              row.hasCost ? row.baseCost.toFixed(2) : "-",
              row.hasCost ? row.effectiveCost.toFixed(2) : "-",
              row.hasCost ? row.minDomesticPrice.toFixed(2) : "-",
              row.hasCost && hasValidPrice
                ? formatCsvPriceRange(row.domNoRebate, row.hasTierRange)
                : "-",
              row.hasCost && hasValidPrice
                ? formatCsvPctRange(row.domNoRebate, row.hasTierRange)
                : "-",
              row.hasCost && hasValidPrice
                ? formatCsvPriceRange(row.domWithRebate, row.hasTierRange)
                : "-",
              row.hasCost && hasValidPrice
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
              ...(selectedCustomer
                ? [
                    row.customerSellingPrice !== null
                      ? row.customerSellingPrice.toFixed(2)
                      : "-",
                  ]
                : []),
              row.hasCost ? row.baseCost.toFixed(2) : "-",
              row.hasCost ? row.effectiveCost.toFixed(2) : "-",
              row.hasCost ? row.minExclusivePrice.toFixed(2) : "-",
              row.hasCost && hasValidPrice
                ? formatCsvPriceRange(row.genNoRecCom, row.hasTierRange)
                : "-",
              row.hasCost && hasValidPrice
                ? formatCsvPctRange(row.genNoRecCom, row.hasTierRange)
                : "-",
              row.hasCost && hasValidPrice
                ? formatCsvPriceRange(row.genWithRecCom, row.hasTierRange)
                : "-",
              row.hasCost && hasValidPrice
                ? formatCsvPctRange(row.genWithRecCom, row.hasTierRange)
                : "-",
              row.hasCost && hasValidPrice
                ? formatCsvPriceRange(row.exclStep1, row.hasTierRange)
                : "-",
              row.hasCost && hasValidPrice
                ? formatCsvPctRange(row.exclStep1, row.hasTierRange)
                : "-",
              row.hasCost && hasValidPrice
                ? formatCsvPriceRange(row.exclStep2, row.hasTierRange)
                : "-",
              row.hasCost && hasValidPrice
                ? formatCsvPctRange(row.exclStep2, row.hasTierRange)
                : "-",
              row.hasCost && hasValidPrice
                ? formatCsvPriceRange(row.exclStep3, row.hasTierRange)
                : "-",
              row.hasCost && hasValidPrice
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
    const suffix = selectedCustomer
      ? `-${selectedCustomer.companyName.replace(/[^a-zA-Z0-9ก-๙_-]/g, "_")}`
      : "";
    link.href = url;
    link.setAttribute("download", `overview-report${suffix}-${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const fmtPct = (pct: number) => {
    if (pct < -999.9) return "<-999%";
    if (pct > 999.9) return ">999%";
    return `${fmt(pct, 1)}%`;
  };

  const fmtSignedBaht = (val: number) => {
    if (val > 0.005) return `+฿${fmt(val)}`;
    if (val < -0.005) return `-฿${fmt(Math.abs(val))}`;
    return `฿0.00`;
  };

  const renderConditionProfitRow = (
    label: string,
    metric: ScenarioRangeMetric,
    hasTierRange: boolean,
    isBaseStep: boolean,
    isRowTrueLoss: boolean,
    annexBadge?: string
  ) => {
    const isMinNeg = metric.minProfit < -0.005;
    const isMaxNeg = metric.maxProfit < -0.005;
    const hasNeg = isMinNeg || isMaxNeg;
    const isAnnexEligible = hasNeg && !isRowTrueLoss && !isBaseStep;

    const getValColor = (neg: boolean) => {
      if (!neg) return "text-slate-900 font-bold";
      return isAnnexEligible
        ? "text-amber-800 font-extrabold"
        : "text-rose-600 font-extrabold";
    };

    const getPctColor = (neg: boolean) => {
      if (!neg) return "text-slate-500 font-semibold";
      return isAnnexEligible
        ? "text-amber-700 font-bold"
        : "text-rose-600 font-bold";
    };

    return (
      <div className="flex items-center justify-between flex-wrap gap-x-1.5 gap-y-0.5 text-[9.5px] leading-snug">
        <span className="inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
          <span className="font-semibold text-slate-600">{label}</span>
          {isAnnexEligible && annexBadge && (
            <span className="px-1 py-px rounded bg-amber-100 text-amber-900 border border-amber-300 text-[8px] font-extrabold leading-none shrink-0">
              {annexBadge}
            </span>
          )}
        </span>

        {!hasTierRange ? (
          <span className="inline-flex items-baseline gap-1 shrink-0 whitespace-nowrap ml-auto">
            <span className={getValColor(isMaxNeg)}>
              {fmtSignedBaht(metric.maxProfit)}
            </span>
            <span className={`text-[9px] ${getPctColor(isMaxNeg)}`}>
              ({fmtPct(metric.maxPct)})
            </span>
          </span>
        ) : (
          <span className="inline-flex items-baseline gap-1 shrink-0 whitespace-nowrap ml-auto">
            <span>
              <span className={getValColor(isMinNeg)}>
                {fmtSignedBaht(metric.minProfit)}
              </span>
              <span className="text-slate-400">–</span>
              <span className={getValColor(isMaxNeg)}>
                {fmtSignedBaht(metric.maxProfit)}
              </span>
            </span>
            <span className="text-[9px]">
              <span className={getPctColor(isMinNeg)}>
                ({fmtPct(metric.minPct)}
              </span>
              <span className="text-slate-400">–</span>
              <span className={getPctColor(isMaxNeg)}>
                {fmtPct(metric.maxPct)})
              </span>
            </span>
          </span>
        )}
      </div>
    );
  };

  const renderGeneralExportCell = (
    row: VariantOverviewRow,
    isCustomerSelected: boolean
  ) => {
    if (!row.hasCost || row.activeEvalPrice <= 0) {
      return <span className="text-[10px] text-slate-400">—</span>;
    }

    const isBaseNeg =
      row.genNoRecCom.minProfit < -0.005 || row.genNoRecCom.maxProfit < -0.005;

    return (
      <div className="space-y-1 tabular-nums">
        {/* Top bar: Invoice Selling Price */}
        <div
          className={`flex items-center justify-between gap-1.5 px-1.5 py-0.5 rounded border ${
            isBaseNeg
              ? "bg-rose-100/80 border-rose-300"
              : "bg-[#ECFCCB]/85 border-[#D9F99D]"
          }`}
        >
          <span className="text-[9.5px] font-bold text-slate-700 truncate">
            {isCustomerSelected
              ? lang === "th"
                ? "ราคาขายลูกค้า (Invoice)"
                : "Customer Invoice"
              : lang === "th"
              ? "ราคาขาย Invoice"
              : "Invoice Price"}
          </span>
          <span
            className={`text-[10.5px] font-extrabold shrink-0 whitespace-nowrap ${
              isBaseNeg ? "text-rose-700" : "text-slate-950"
            }`}
          >
            {row.hasTierRange
              ? `฿${fmt(row.genNoRecCom.minSellPrice)} – ฿${fmt(
                  row.genNoRecCom.maxSellPrice
                )}`
              : `฿${fmt(row.genNoRecCom.maxSellPrice)}`}
          </span>
        </div>

        {/* Condition Profit Rows */}
        <div className="space-y-0.5 px-0.5">
          {renderConditionProfitRow(
            lang === "th" ? "กำไร (No Com)" : "Profit (No Com)",
            row.genNoRecCom,
            row.hasTierRange,
            true,
            row.isTrueLoss
          )}
          {renderConditionProfitRow(
            lang === "th"
              ? `กำไร (+Com ${commercialRates.commissionRate}%)`
              : `Profit (+Com ${commercialRates.commissionRate}%)`,
            row.genWithRecCom,
            row.hasTierRange,
            false,
            row.isTrueLoss,
            lang === "th" ? "งด Com" : "No Com"
          )}
        </div>
      </div>
    );
  };

  const renderExclusiveCell = (
    row: VariantOverviewRow,
    isCustomerSelected: boolean,
    onApplyTargetPrice?: (targetThbPrice: number) => void
  ) => {
    if (!row.hasCost || row.activeEvalPrice <= 0) {
      return <span className="text-[10px] text-slate-400">—</span>;
    }

    const isStep1Neg =
      row.exclStep1.minProfit < -0.005 || row.exclStep1.maxProfit < -0.005;
    const isStep2Neg =
      row.exclStep2.minProfit < -0.005 || row.exclStep2.maxProfit < -0.005;
    const isStep3Neg =
      row.exclStep3.minProfit < -0.005 || row.exclStep3.maxProfit < -0.005;

    const formatTargetBadgePrice = (thbVal: number) => {
      if (isCustomerSelected && row.customerCurrency === "USD") {
        const usdVal = Math.ceil((thbVal / activeUsdRate) * 100) / 100;
        return `$${fmt(usdVal)}`;
      }
      return `฿${fmt(thbVal)}`;
    };

    const minNoLossTarget = isCustomerSelected
      ? row.minCustomerAnnexPrice
      : row.minCatalogBaseNoLoss;
    const minSupportTarget = isCustomerSelected
      ? row.minCustomerFullPrice
      : row.minCatalogBaseFullSupport;

    return (
      <div className="space-y-1 tabular-nums">
        {/* Top bar: Exclusive Invoice Selling Price + Actionable Policy Badge */}
        <div
          className={`flex items-center justify-between flex-wrap gap-1 px-1.5 py-0.5 rounded border ${
            isStep1Neg
              ? "bg-rose-100/80 border-rose-300"
              : "bg-orange-100/75 border-orange-200/90"
          }`}
        >
          <span className="inline-flex items-center flex-wrap gap-1 min-w-0">
            <span className="text-[9.5px] font-bold text-slate-800 whitespace-nowrap">
              {isCustomerSelected
                ? lang === "th"
                  ? "ราคาขายลูกค้า (Invoice)"
                  : "Customer Invoice"
                : lang === "th"
                ? `ราคาขาย (-${commercialRates.distFeeRate}% DisFee)`
                : `Invoice (-${commercialRates.distFeeRate}% DisFee)`}
            </span>
            {isStep1Neg ? (
              <button
                type="button"
                disabled={!onApplyTargetPrice || minNoLossTarget <= 0}
                onClick={() =>
                  onApplyTargetPrice &&
                  minNoLossTarget > 0 &&
                  onApplyTargetPrice(minNoLossTarget)
                }
                className="px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[8px] font-extrabold leading-none shrink-0 whitespace-nowrap cursor-pointer disabled:cursor-default transition-colors"
                title={
                  isCustomerSelected
                    ? `คลิกเพื่อปรับ Selling Price ขั้นต่ำไม่ให้ขาดทุน (${formatTargetBadgePrice(
                        minNoLossTarget
                      )})`
                    : `คลิกเพื่อปรับ ราคาเปิด ขั้นต่ำไม่ให้ขาดทุน (${formatTargetBadgePrice(
                        minNoLossTarget
                      )})`
                }
              >
                Loss: Min {formatTargetBadgePrice(minNoLossTarget)}
              </button>
            ) : isStep2Neg || isStep3Neg ? (
              <button
                type="button"
                disabled={!onApplyTargetPrice || minSupportTarget <= 0}
                onClick={() =>
                  onApplyTargetPrice &&
                  minSupportTarget > 0 &&
                  onApplyTargetPrice(minSupportTarget)
                }
                className="px-1.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-[8px] font-extrabold leading-none shrink-0 whitespace-nowrap cursor-pointer disabled:cursor-default transition-colors"
                title={
                  isCustomerSelected
                    ? `คลิกเพื่อปรับ Selling Price ขั้นต่ำเพื่อให้ได้ Full Support (${formatTargetBadgePrice(
                        minSupportTarget
                      )})`
                    : `คลิกเพื่อปรับ ราคาเปิด ขั้นต่ำเพื่อให้ได้ Full Support (${formatTargetBadgePrice(
                        minSupportTarget
                      )})`
                }
              >
                Min {formatTargetBadgePrice(minSupportTarget)} to get Support
              </button>
            ) : (
              <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[8px] font-extrabold leading-none shrink-0 whitespace-nowrap">
                Full Support
              </span>
            )}
          </span>

          <span
            className={`text-[10.5px] font-extrabold shrink-0 whitespace-nowrap ml-auto ${
              isStep1Neg ? "text-rose-700" : "text-slate-950"
            }`}
          >
            {row.hasTierRange
              ? `฿${fmt(row.exclStep1.minSellPrice)} – ฿${fmt(
                  row.exclStep1.maxSellPrice
                )}`
              : `฿${fmt(row.exclStep1.maxSellPrice)}`}
          </span>
        </div>

        {/* Condition Profit Rows */}
        <div className="space-y-0.5 px-0.5">
          {renderConditionProfitRow(
            isCustomerSelected
              ? lang === "th"
                ? "กำไร (งด MKT/Rebate)"
                : "Profit (No MKT/Rebate)"
              : lang === "th"
              ? `กำไร (DisFee ${commercialRates.distFeeRate}%)`
              : `Profit (DisFee ${commercialRates.distFeeRate}%)`,
            row.exclStep1,
            row.hasTierRange,
            true,
            row.isTrueLoss
          )}
          {renderConditionProfitRow(
            lang === "th"
              ? `กำไร (+MKT ${commercialRates.mktSupportRate}%)`
              : `Profit (+MKT ${commercialRates.mktSupportRate}%)`,
            row.exclStep2,
            row.hasTierRange,
            false,
            row.isTrueLoss,
            lang === "th" ? "งด MKT" : "No MKT"
          )}
          {renderConditionProfitRow(
            lang === "th"
              ? `กำไร (+Rebate ${commercialRates.rebateRate}%)`
              : `Profit (+Rebate ${commercialRates.rebateRate}%)`,
            row.exclStep3,
            row.hasTierRange,
            false,
            row.isTrueLoss,
            lang === "th" ? "งด Rebate" : "No Rebate"
          )}
        </div>
      </div>
    );
  };

  const renderDomesticCell = (
    row: VariantOverviewRow,
    isCustomerSelected: boolean,
    onApplyTargetPrice?: (targetThbPrice: number) => void
  ) => {
    if (!row.hasCost || row.activeEvalPrice <= 0) {
      return <span className="text-[10px] text-slate-400">—</span>;
    }

    const isStep1Neg =
      row.domNoRebate.minProfit < -0.005 || row.domNoRebate.maxProfit < -0.005;
    const isStep2Neg =
      row.domWithRebate.minProfit < -0.005 ||
      row.domWithRebate.maxProfit < -0.005;

    const formatTargetBadgePrice = (thbVal: number) => {
      if (isCustomerSelected && row.customerCurrency === "USD") {
        const usdVal = Math.ceil((thbVal / activeUsdRate) * 100) / 100;
        return `$${fmt(usdVal)}`;
      }
      return `฿${fmt(thbVal)}`;
    };

    const minNoLossTarget = isCustomerSelected
      ? row.effectiveCost
      : row.minCatalogBaseDomNoLoss;
    const minSupportTarget = isCustomerSelected
      ? row.minDomesticPrice
      : row.minCatalogBaseDomFullSupport;

    return (
      <div className="space-y-1 tabular-nums">
        <div
          className={`flex items-center justify-between flex-wrap gap-1 px-1.5 py-0.5 rounded border ${
            isStep1Neg
              ? "bg-rose-100/80 border-rose-300"
              : "bg-[#ECFCCB]/85 border-[#D9F99D]"
          }`}
        >
          <span className="inline-flex items-center flex-wrap gap-1 min-w-0">
            <span className="text-[9.5px] font-bold text-slate-700 whitespace-nowrap">
              {lang === "th" ? "ราคาขาย Invoice" : "Invoice Price"}
            </span>
            {isStep1Neg ? (
              <button
                type="button"
                disabled={!onApplyTargetPrice || minNoLossTarget <= 0}
                onClick={() =>
                  onApplyTargetPrice &&
                  minNoLossTarget > 0 &&
                  onApplyTargetPrice(minNoLossTarget)
                }
                className="px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[8px] font-extrabold leading-none shrink-0 whitespace-nowrap cursor-pointer disabled:cursor-default transition-colors"
              >
                Loss: Min {formatTargetBadgePrice(minNoLossTarget)}
              </button>
            ) : isStep2Neg ? (
              <button
                type="button"
                disabled={!onApplyTargetPrice || minSupportTarget <= 0}
                onClick={() =>
                  onApplyTargetPrice &&
                  minSupportTarget > 0 &&
                  onApplyTargetPrice(minSupportTarget)
                }
                className="px-1.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-[8px] font-extrabold leading-none shrink-0 whitespace-nowrap cursor-pointer disabled:cursor-default transition-colors"
              >
                Min {formatTargetBadgePrice(minSupportTarget)} to get Support
              </button>
            ) : (
              <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[8px] font-extrabold leading-none shrink-0 whitespace-nowrap">
                Full Support
              </span>
            )}
          </span>
          <span
            className={`text-[10.5px] font-extrabold shrink-0 whitespace-nowrap ml-auto ${
              isStep1Neg ? "text-rose-700" : "text-slate-950"
            }`}
          >
            {row.hasTierRange
              ? `฿${fmt(row.domNoRebate.minSellPrice)} – ฿${fmt(
                  row.domNoRebate.maxSellPrice
                )}`
              : `฿${fmt(row.domNoRebate.maxSellPrice)}`}
          </span>
        </div>

        <div className="space-y-0.5 px-0.5">
          {renderConditionProfitRow(
            lang === "th" ? "กำไร (No Rebate)" : "Profit (No Rebate)",
            row.domNoRebate,
            row.hasTierRange,
            true,
            row.isTrueLoss
          )}
          {renderConditionProfitRow(
            lang === "th"
              ? `กำไร (+Rebate ${commercialRates.rebateRate}%)`
              : `Profit (+Rebate ${commercialRates.rebateRate}%)`,
            row.domWithRebate,
            row.hasTierRange,
            false,
            row.isTrueLoss,
            lang === "th" ? "งด Rebate" : "No Rebate"
          )}
        </div>
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
      <table className="w-full table-fixed text-left text-[11px] border-collapse">
        <thead>
          <tr className="bg-slate-100 border-t border-b border-slate-300 text-slate-900 align-middle">
            <th className="py-2 px-3 font-extrabold text-center w-[10%]">
              {t.colNo}
            </th>
            <th className="py-2 px-3.5 font-extrabold border-l border-slate-300 text-left w-[56%]">
              {isMinimized
                ? t.colProduct
                : `${t.colProduct} / ${t.colVariant}`}
            </th>
            <th className="py-2 px-3 font-extrabold border-l border-slate-300 text-center w-[34%]">
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
                <td className="py-1.5 px-3 text-center font-extrabold text-slate-900 tabular-nums">
                  {groupIdx + 1}
                </td>
                <td
                  colSpan={2}
                  className="py-1.5 px-3.5 border-l border-slate-200 text-slate-900"
                >
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-extrabold text-slate-900 leading-snug">
                      {group.productName}
                    </span>
                    {(group.brand || group.category) && (
                      <span className="text-[10px] font-medium text-slate-600">
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
                  <td className="py-1.5 px-3 text-center font-bold text-slate-700 tabular-nums">
                    {isMinimized && isFirstRow ? groupIdx + 1 : ""}
                  </td>
                  <td className="py-1.5 px-3.5 border-l border-slate-200 text-slate-900">
                    {isMinimized ? (
                      isFirstRow && (
                        <div className="space-y-0.5">
                          <div className="font-extrabold text-slate-900 leading-snug">
                            {group.productName}
                          </div>
                          {(group.brand || group.category) && (
                            <div className="text-[10px] font-medium text-slate-600">
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
                  <td className="py-1.5 px-3 border-l border-slate-200 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${
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

  const hasCustomerCol = selectedCustomer !== null;
  const isProductRowMode = isMinimized || hasCustomerCol;
  const leftColsCount = hasCustomerCol ? 4 : 3;
  const totalColsCount = isDomestic
    ? leftColsCount + 1
    : leftColsCount + 2;
  const pendingCount = pendingEntriesList.length + pendingBaseEntriesList.length;

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
          .overview-print-flex-container,
          .overview-print-doc-area {
            display: block !important;
            overflow: visible !important;
            background: white !important;
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
          .overview-selling-price-input {
            border: none !important;
            background: transparent !important;
            padding: 0 !important;
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
        className="relative w-full max-w-[1440px] bg-[#252728] border border-[#4E4F50] rounded-2xl overflow-hidden flex flex-col my-auto h-[94vh] max-h-[94vh]"
      >
        {/* TOPBAR: Report Tools & Actions (Hidden in Print) */}
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
            {/* 1. Cost Dropdown: Normal / Minimize / Average + Cost & FX Simulator */}
            <div ref={minimizeDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsMinimizeDropdownOpen((prev) => !prev);
                  setIsViewDropdownOpen(false);
                  setIsExportDropdownOpen(false);
                }}
                className={`h-7 bg-[#252728] rounded-md px-2.5 text-[11px] text-slate-100 border transition-colors flex items-center justify-between gap-1.5 cursor-pointer ${
                  isMinimizeDropdownOpen ||
                  minimizeMode !== "normal" ||
                  simulatedOverheadInput !== null ||
                  simulatedUsdRateInput !== null
                    ? "border-[#C7F33C]"
                    : "border-[#4E4F50] hover:border-slate-400"
                }`}
                title="Cost Mode (Normal / Minimize / Average) & Cost Simulator"
              >
                <span className="text-slate-400 font-semibold">Cost:</span>
                <span
                  className={`font-bold whitespace-nowrap ${
                    minimizeMode !== "normal" ||
                    simulatedOverheadInput !== null ||
                    simulatedUsdRateInput !== null
                      ? "text-[#C7F33C]"
                      : "text-slate-100"
                  }`}
                >
                  {
                    (
                      MINIMIZE_MODE_OPTIONS.find(
                        (opt) => opt.value === minimizeMode
                      ) || MINIMIZE_MODE_OPTIONS[0]
                    ).shortLabel
                  }
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${
                    isMinimizeDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isMinimizeDropdownOpen && (
                <div className="absolute right-0 sm:left-0 top-full mt-1.5 z-50 w-[235px] bg-[#252728] border border-[#4E4F50] rounded-xl overflow-hidden p-2 space-y-2">
                  <div className="space-y-0.5">
                    <div className="px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400">
                      Cost Display Mode
                    </div>
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
                          className={`w-full px-2.5 py-1.5 text-xs rounded-lg flex items-center justify-between gap-2 transition-colors cursor-pointer whitespace-nowrap ${
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

                  {/* Simulator Settings inside Cost Dropdown */}
                  <div className="pt-2 border-t border-[#3A3B3C] space-y-1.5 px-1">
                    <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400 px-1">
                      Cost & FX Simulator
                    </div>
                    <div className="flex items-center justify-between gap-1.5 bg-[#18191A] border border-[#3A3B3C] rounded-lg px-2 py-1 text-[11px]">
                      <span className="font-semibold text-slate-300 whitespace-nowrap">
                        {t.simCostLabel}:
                      </span>
                      <div className="flex items-center gap-1">
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
                          onChange={(e) =>
                            setSimulatedOverheadInput(e.target.value)
                          }
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
                          className="w-11 h-5 rounded bg-[#252728] border border-[#4E4F50] focus:border-[#C7F33C] text-center text-[11px] font-bold text-[#C7F33C] outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="text-[10px] font-bold text-slate-400">
                          %
                        </span>
                        <button
                          type="button"
                          onClick={() => setSimulatedOverheadInput(null)}
                          disabled={
                            simulatedOverheadInput === null ||
                            activeOverheadPercent === companyCostOverheadPercent
                          }
                          className="p-1 rounded bg-[#3A3B3C] hover:bg-[#4E4F50] disabled:opacity-35 disabled:pointer-events-none text-slate-200 transition-colors cursor-pointer"
                          title={`Reset to Default (${companyCostOverheadPercent}%)`}
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-1.5 bg-[#18191A] border border-[#3A3B3C] rounded-lg px-2 py-1 text-[11px]">
                      <span className="font-semibold text-slate-300 whitespace-nowrap">
                        USD Rate:
                      </span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.1"
                          min="1"
                          max="100"
                          value={
                            simulatedUsdRateInput !== null
                              ? simulatedUsdRateInput
                              : String(liveUsdRate)
                          }
                          placeholder={String(liveUsdRate)}
                          onChange={(e) =>
                            setSimulatedUsdRateInput(e.target.value)
                          }
                          onBlur={() => {
                            if (
                              simulatedUsdRateInput !== null &&
                              simulatedUsdRateInput.trim() === ""
                            ) {
                              setSimulatedUsdRateInput(null);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          className="w-12 h-5 rounded bg-[#252728] border border-[#4E4F50] focus:border-[#C7F33C] text-center text-[11px] font-bold text-[#C7F33C] outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="text-[10px] font-bold text-slate-400">
                          ฿
                        </span>
                        <button
                          type="button"
                          onClick={() => setSimulatedUsdRateInput(null)}
                          disabled={
                            simulatedUsdRateInput === null ||
                            activeUsdRate === liveUsdRate
                          }
                          className="p-1 rounded bg-[#3A3B3C] hover:bg-[#4E4F50] disabled:opacity-35 disabled:pointer-events-none text-slate-200 transition-colors cursor-pointer"
                          title={`Reset to Live USD/THB Rate (฿${fmt(liveUsdRate)})`}
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 2. View Dropdown: Export / Domestic / MKT & Rebate */}
            <div ref={viewDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsViewDropdownOpen((prev) => !prev);
                  setIsMinimizeDropdownOpen(false);
                  setIsExportDropdownOpen(false);
                }}
                className={`h-7 bg-[#252728] rounded-md px-2.5 text-[11px] text-slate-100 border transition-colors flex items-center justify-between gap-1.5 cursor-pointer ${
                  isViewDropdownOpen || isDomestic || isExclusionReportMode
                    ? "border-[#C7F33C]"
                    : "border-[#4E4F50] hover:border-slate-400"
                }`}
                title="Select Report View (Export / Domestic / MKT & Rebate)"
              >
                <span className="text-slate-400 font-semibold">View:</span>
                <span
                  className={`font-bold whitespace-nowrap ${
                    isDomestic || isExclusionReportMode
                      ? "text-[#C7F33C]"
                      : "text-slate-100"
                  }`}
                >
                  {isExclusionReportMode
                    ? "MKT & Rebate"
                    : isDomestic
                    ? "Domestic"
                    : "Export"}
                </span>
                {totalExclusionRowsCount > 0 && (
                  <span className="px-1 py-0.2 rounded bg-[#18191A] text-[9.5px] font-bold text-rose-400 tabular-nums">
                    {totalExclusionRowsCount}
                  </span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${
                    isViewDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isViewDropdownOpen && (
                <div className="absolute right-0 sm:left-0 top-full mt-1.5 z-50 w-[210px] bg-[#252728] border border-[#4E4F50] rounded-xl overflow-hidden p-1.5 space-y-1.5">
                  <div className="space-y-0.5">
                    <div className="px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400">
                      Report View
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsDomestic(false);
                        setIsExclusionReportMode(false);
                        setIsViewDropdownOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 text-xs rounded-lg flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        !isDomestic && !isExclusionReportMode
                          ? "bg-[#3A3B3C] text-[#C7F33C] font-semibold"
                          : "text-slate-300 hover:bg-[#3A3B3C]/60 hover:text-white"
                      }`}
                    >
                      <span>Export</span>
                      {!isDomestic && !isExclusionReportMode && (
                        <Check className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsDomestic(true);
                        setIsExclusionReportMode(false);
                        setIsViewDropdownOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 text-xs rounded-lg flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isDomestic && !isExclusionReportMode
                          ? "bg-[#3A3B3C] text-[#C7F33C] font-semibold"
                          : "text-slate-300 hover:bg-[#3A3B3C]/60 hover:text-white"
                      }`}
                    >
                      <span>Domestic</span>
                      {isDomestic && !isExclusionReportMode && (
                        <Check className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsExclusionReportMode(true);
                        setIsDomestic(false);
                        setIsViewDropdownOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 text-xs rounded-lg flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isExclusionReportMode
                          ? "bg-[#3A3B3C] text-[#C7F33C] font-semibold"
                          : "text-slate-300 hover:bg-[#3A3B3C]/60 hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span>MKT & Rebate</span>
                        <span className="px-1.5 py-0.2 rounded bg-[#18191A] text-[10px] font-bold text-rose-400 tabular-nums">
                          {totalExclusionRowsCount}
                        </span>
                      </span>
                      {isExclusionReportMode && (
                        <Check className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />
                      )}
                    </button>
                  </div>

                  {/* Language Switcher tucked neatly inside View Dropdown */}
                  <div className="pt-1.5 border-t border-[#3A3B3C] flex items-center justify-between px-2 py-0.5">
                    <span className="text-[10px] font-bold text-slate-400">
                      Language
                    </span>
                    <div className="flex items-center bg-[#18191A] border border-[#3A3B3C] rounded p-0.5 text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => setLang("th")}
                        className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                          lang === "th"
                            ? "bg-[#C7F33C] text-black"
                            : "text-slate-400 hover:text-slate-100"
                        }`}
                      >
                        TH
                      </button>
                      <button
                        type="button"
                        onClick={() => setLang("en")}
                        className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                          lang === "en"
                            ? "bg-[#C7F33C] text-black"
                            : "text-slate-400 hover:text-slate-100"
                        }`}
                      >
                        EN
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Export Dropdown: CSV / PDF */}
            <div ref={exportDropdownRef} className="relative">
              <button
                type="button"
                disabled={productGroups.length === 0}
                onClick={() => {
                  setIsExportDropdownOpen((prev) => !prev);
                  setIsMinimizeDropdownOpen(false);
                  setIsViewDropdownOpen(false);
                }}
                className={`h-7 bg-[#252728] rounded-md px-2.5 text-[11px] text-slate-100 border transition-colors flex items-center justify-between gap-1.5 cursor-pointer disabled:opacity-50 ${
                  isExportDropdownOpen
                    ? "border-[#C7F33C]"
                    : "border-[#4E4F50] hover:border-slate-400"
                }`}
                title="Export Report (CSV / PDF)"
              >
                <span className="font-bold whitespace-nowrap">Export</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${
                    isExportDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isExportDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-50 w-[140px] bg-[#252728] border border-[#4E4F50] rounded-xl overflow-hidden p-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsExportDropdownOpen(false);
                      handleExportCsv();
                    }}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg flex items-center gap-2 text-slate-200 hover:bg-[#3A3B3C] hover:text-[#C7F33C] font-semibold transition-colors cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsExportDropdownOpen(false);
                      handlePrintPdf();
                    }}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg flex items-center gap-2 text-slate-200 hover:bg-[#3A3B3C] hover:text-[#C7F33C] font-semibold transition-colors cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />
                    <span>PDF</span>
                  </button>
                </div>
              )}
            </div>

            {/* 4. Save Button (+ Discard when pending edits exist) */}
            <div className="flex items-center gap-1">
              {pendingCount > 0 && (
                <button
                  type="button"
                  onClick={handleDiscardPendingPrices}
                  disabled={isSavingPrices}
                  className="px-2 h-7 bg-[#252728] border border-[#4E4F50] text-slate-300 hover:text-white hover:bg-[#4E4F50] text-[11px] font-semibold rounded-md transition-colors cursor-pointer"
                >
                  {t.discardBtn}
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleSavePendingPrices()}
                disabled={isSavingPrices || pendingCount === 0}
                className={`flex items-center gap-1.5 px-2.5 h-7 rounded-md font-bold text-[11px] transition-colors cursor-pointer whitespace-nowrap ${
                  saveSuccess
                    ? "bg-[#C7F33C] text-black border border-[#C7F33C]"
                    : pendingCount > 0
                    ? "bg-[#C7F33C] hover:bg-[#b0d635] text-black border border-[#C7F33C]"
                    : "bg-[#252728] border border-[#4E4F50] text-slate-400 opacity-60 cursor-not-allowed"
                }`}
              >
                {isSavingPrices ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>{t.savingPricesBtn}</span>
                  </>
                ) : saveSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>{t.savedPricesBtn}</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3 h-3" />
                    <span>
                      Save
                      {pendingCount > 0 ? ` (${pendingCount})` : ""}
                    </span>
                  </>
                )}
              </button>
            </div>

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

        {/* MAIN BODY: Left Customer Accounts Sidebar + Right Printable Document */}
        <div className="overview-print-flex-container flex-1 min-h-0 flex flex-row overflow-hidden">
          {/* LEFT SIDEBAR: Structured English Navigation & Filter Panel (Hidden in Print, Zero Layout Shift) */}
          <aside className="w-60 sm:w-64 shrink-0 bg-[#18191B] border-r border-[#2A2C30] flex flex-col h-full print-hidden select-none">
            {/* SECTION 1: PRICING VIEW MODE (Pinned Top) */}
            <div className="px-3 pt-3 pb-2.5 border-b border-[#26282C] shrink-0 space-y-1.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Pricing View
                </span>
                <span className="text-[10px] font-semibold text-slate-500">
                  {selectedCompanyId === null ? "Catalog Mode" : "Account Mode"}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setSelectedCompanyId(null)}
                className={`w-full px-3 py-2 rounded-xl text-left transition-colors cursor-pointer flex items-center justify-between gap-2 border ${
                  selectedCompanyId === null
                    ? "bg-[#26292E] border-[#C7F33C]/70 text-[#C7F33C]"
                    : "bg-[#202225] border-[#2C2E33] text-slate-300 hover:bg-[#26282C] hover:text-white"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">
                    Standard Catalog
                  </div>
                  <div className="text-[10px] font-medium text-slate-400 truncate">
                    Base & Exclusive (-{commercialRates.distFeeRate}% DisFee)
                  </div>
                </div>
                {selectedCompanyId === null ? (
                  <span className="w-5 h-5 rounded-full bg-[#C7F33C] text-black flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-slate-500 shrink-0">
                    View
                  </span>
                )}
              </button>
            </div>

            {/* SECTION 2: QUICK FILTERS (Pinned Fixed-Height — Never Hides or Jumps) */}
            <div className="px-3 py-2.5 border-b border-[#26282C] shrink-0 space-y-1.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Quick Filters
                </span>
                {(onlyLossItems ||
                  onlyAnnexItems ||
                  (selectedCompanyId !== null && !onlyCustomerPricedItems)) && (
                  <button
                    type="button"
                    onClick={() => {
                      setOnlyCustomerPricedItems(true);
                      setOnlyLossItems(false);
                      setOnlyAnnexItems(false);
                    }}
                    className="text-[10px] font-bold text-[#C7F33C] hover:underline cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>

              <div className="bg-[#202225] border border-[#2C2E33] rounded-xl p-1.5 space-y-0.5">
                {/* Filter 1: Priced Items Only (Always mounted in fixed slot; disabled when no customer selected) */}
                <button
                  type="button"
                  disabled={selectedCompanyId === null}
                  onClick={() => setOnlyCustomerPricedItems((prev) => !prev)}
                  className={`w-full px-2 py-1.5 rounded-lg flex items-center justify-between gap-2 text-left transition-colors ${
                    selectedCompanyId === null
                      ? "opacity-40 cursor-not-allowed"
                      : "cursor-pointer hover:bg-[#282B30]"
                  }`}
                  title={
                    selectedCompanyId === null
                      ? "Select a customer account below to filter by priced items"
                      : "Show only products that have a saved or edited price for this customer"
                  }
                >
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C7F33C] shrink-0" />
                    <span className="text-[11px] font-semibold text-slate-200 truncate">
                      Priced Items Only
                    </span>
                  </span>
                  <div
                    className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                      selectedCompanyId !== null && onlyCustomerPricedItems
                        ? "bg-[#C7F33C]"
                        : "bg-[#35373C]"
                    }`}
                  >
                    <span
                      className={`inline-block h-2.5 w-2.5 transform rounded-full transition-transform ${
                        selectedCompanyId !== null && onlyCustomerPricedItems
                          ? "translate-x-3.5 bg-black"
                          : "translate-x-0.5 bg-slate-400"
                      }`}
                    />
                  </div>
                </button>

                {/* Filter 2: True Loss Only */}
                <button
                  type="button"
                  onClick={() => setOnlyLossItems((prev) => !prev)}
                  className="w-full px-2 py-1.5 rounded-lg flex items-center justify-between gap-2 text-left cursor-pointer hover:bg-[#282B30] transition-colors"
                >
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                    <span className="text-[11px] font-semibold text-slate-200 truncate">
                      True Loss Only
                    </span>
                  </span>
                  <div
                    className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                      onlyLossItems ? "bg-rose-500" : "bg-[#35373C]"
                    }`}
                  >
                    <span
                      className={`inline-block h-2.5 w-2.5 transform rounded-full transition-transform ${
                        onlyLossItems
                          ? "translate-x-3.5 bg-white"
                          : "translate-x-0.5 bg-slate-400"
                      }`}
                    />
                  </div>
                </button>

                {/* Filter 3: ANNEX Exclusion Only */}
                <button
                  type="button"
                  onClick={() => setOnlyAnnexItems((prev) => !prev)}
                  className="w-full px-2 py-1.5 rounded-lg flex items-center justify-between gap-2 text-left cursor-pointer hover:bg-[#282B30] transition-colors"
                >
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    <span className="text-[11px] font-semibold text-slate-200 truncate">
                      ANNEX Exclusion Only
                    </span>
                  </span>
                  <div
                    className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                      onlyAnnexItems ? "bg-amber-400" : "bg-[#35373C]"
                    }`}
                  >
                    <span
                      className={`inline-block h-2.5 w-2.5 transform rounded-full transition-transform ${
                        onlyAnnexItems
                          ? "translate-x-3.5 bg-black"
                          : "translate-x-0.5 bg-slate-400"
                      }`}
                    />
                  </div>
                </button>
              </div>
            </div>

            {/* SECTION 3: CUSTOMER ACCOUNTS (Pinned Search + Independent Scrollable Account List) */}
            <div className="px-3 pt-2.5 pb-2 shrink-0 space-y-2">
              <div className="flex items-center justify-between px-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Users className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-300 truncate">
                    Customer Accounts
                  </span>
                </div>
                <span className="px-1.5 py-0.2 rounded-full bg-[#25272C] border border-[#33363D] text-[10px] font-bold text-slate-300 tabular-nums">
                  {filteredCustomerAccounts.length}
                </span>
              </div>

              {/* Search Customer Input */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search account..."
                  className="w-full bg-[#222428] border border-[#2E3136] focus:border-[#C7F33C]/60 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none transition-colors"
                />
                {customerSearch && (
                  <button
                    type="button"
                    onClick={() => setCustomerSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Customer Accounts List */}
            <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              {customerAccounts.length === 0 ? (
                <div className="px-2.5 py-6 text-center text-xs text-slate-500">
                  No customer accounts found
                </div>
              ) : filteredCustomerAccounts.length === 0 ? (
                <div className="px-2.5 py-6 text-center text-xs text-slate-500">
                  No matching accounts
                </div>
              ) : (
                filteredCustomerAccounts.map((cust) => {
                  const isSelected = selectedCompanyId === cust.companyId;
                  const hasTrueLoss = cust.trueLossCount > 0;
                  const hasAnnex = cust.annexCount > 0;

                  return (
                    <button
                      key={cust.companyId}
                      type="button"
                      onClick={() =>
                        setSelectedCompanyId((prev) =>
                          prev === cust.companyId ? null : cust.companyId
                        )
                      }
                      className={`w-full px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer flex items-center justify-between gap-1.5 border ${
                        isSelected
                          ? "bg-[#26292E] border-[#C7F33C]/70 text-[#C7F33C] font-bold"
                          : "bg-transparent border-transparent text-slate-300 hover:bg-[#222428] hover:text-white font-medium"
                      }`}
                    >
                      <span
                        className="text-xs truncate min-w-0 flex-1 flex items-center gap-1.5"
                        title={cust.companyName}
                      >
                        <span className="truncate">{cust.companyName}</span>
                        {cust.currency === "USD" && (
                          <span className="px-1 py-px rounded bg-[#323438] text-[9px] font-extrabold text-[#C7F33C] shrink-0">
                            USD
                          </span>
                        )}
                      </span>

                      {(hasTrueLoss || hasAnnex) && (
                        <span className="inline-flex items-center gap-1 shrink-0 tabular-nums">
                          {hasTrueLoss && (
                            <span
                              className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 text-[9.5px] font-extrabold leading-none"
                              title={`True Loss: ${cust.trueLossCount} items`}
                            >
                              {cust.trueLossCount}
                            </span>
                          )}
                          {hasAnnex && (
                            <span
                              className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[9.5px] font-extrabold leading-none"
                              title={`ANNEX Exclusion: ${cust.annexCount} items`}
                            >
                              {cust.annexCount}
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* RIGHT PRINTABLE DOCUMENT AREA */}
          <div className="overview-print-doc-area flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-[#252728]">
            <div
              id="overview-report-scroll-body"
              className="flex-1 overflow-y-auto px-4 sm:px-5 py-0 bg-[#252728] hide-scrollbar [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
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
                    : "max-w-[1160px] min-h-[calc(94vh-5rem)] p-4 sm:p-6 flex flex-col"
                } mx-auto my-3 sm:my-4 bg-white rounded-xl border border-slate-200 text-slate-900 space-y-3.5`}
              >
                {/* Document Header (Normal Overview Mode Only) */}
                {!isExclusionReportMode && (
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-slate-300">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-[#C7F33C]/60 text-slate-900 border border-slate-300">
                          EXECUTIVE SUMMARY
                        </span>
                        {selectedCustomer && (
                          <>
                            <span className="text-[10.5px] font-extrabold px-2.5 py-0.5 rounded bg-slate-900 text-[#C7F33C] border border-slate-900">
                              CUSTOMER: {selectedCustomer.companyName}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleCustomerCurrency(
                                  selectedCustomer.companyId,
                                  selectedCustomer.currency
                                )
                              }
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded border transition-colors cursor-pointer print-hidden ${
                                selectedCustomer.currency === "USD"
                                  ? "bg-[#F7FEE7] text-slate-900 border-[#84CC16] hover:bg-[#ECFCCB]"
                                  : "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200"
                              }`}
                              title="คลิกเพื่อสลับสกุลเงินของลูกค้ารายนี้ระหว่าง USD ($) และ THB (฿)"
                            >
                              {selectedCustomer.currency === "USD"
                                ? `$ USD (1$ = ฿${fmt(activeUsdRate)}) · คลิกสลับ THB`
                                : "฿ THB · คลิกสลับ USD"}
                            </button>
                          </>
                        )}
                        <span className="text-[11px] font-semibold text-slate-800">
                          {t.productsCount}:{" "}
                          <strong className="font-extrabold text-slate-900">
                            {productGroups.length} {t.productsUnit}
                          </strong>{" "}
                          {productGroups.length > 0 &&
                            `(${totalVariantsCount} ${t.variantsUnit})`}
                        </span>
                      </div>
                      <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-tight">
                        {t.modalTitle} — Commercial Pricing & Margin Analysis
                      </h1>
                      <p className="text-[11px] text-slate-700">
                        {t.overheadNote}:{" "}
                        <span className="font-semibold text-slate-900">
                          {(() => {
                            if (
                              isSimulatingCost &&
                              activeOverheadPercent !==
                                companyCostOverheadPercent
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
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-900">
                        {t.modalTitle}
                      </div>
                      <div className="text-[11px] text-slate-700">
                        {t.date}:{" "}
                        <span className="font-semibold text-slate-900">
                          {new Date().toLocaleDateString("en-CA")}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-700">
                        {t.docNo}:{" "}
                        <span className="font-mono font-semibold text-slate-900">
                          OV-
                          {new Date()
                            .toISOString()
                            .slice(0, 10)
                            .replace(/-/g, "")}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {selectedProducts.length > 0 &&
                selectedProducts.some((p) => !detailsCache[p.id]) &&
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
                  /* MINIMAL CONTRACT ANNEX */
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
                                <div className="px-4 py-2 bg-slate-900 text-white flex items-center justify-between gap-2">
                                  <h3 className="text-xs font-extrabold tracking-tight">
                                    {schedule.title}
                                  </h3>
                                  <span className="px-2.5 py-0.5 rounded bg-white/15 text-white text-[10.5px] font-bold shrink-0 tabular-nums">
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
                    {/* table-fixed + explicit colgroup locks every column's percentage width even when row 1 uses colSpan */}
                    <table className="w-full table-fixed text-left text-[11px] border-collapse">
                      <colgroup>
                        {isDomestic ? (
                          hasCustomerCol ? (
                            <>
                              <col style={{ width: "20%" }} />
                              <col style={{ width: "16%" }} />
                              <col style={{ width: "15%" }} />
                              <col style={{ width: "9%" }} />
                              <col style={{ width: "40%" }} />
                            </>
                          ) : (
                            <>
                              <col style={{ width: "26%" }} />
                              <col style={{ width: "23%" }} />
                              <col style={{ width: "10%" }} />
                              <col style={{ width: "41%" }} />
                            </>
                          )
                        ) : hasCustomerCol ? (
                          <>
                            <col style={{ width: "14%" }} />
                            <col style={{ width: "12.5%" }} />
                            <col style={{ width: "14%" }} />
                            <col style={{ width: "7.5%" }} />
                            <col style={{ width: "24%" }} />
                            <col style={{ width: "28%" }} />
                          </>
                        ) : (
                          <>
                            <col style={{ width: "16%" }} />
                            <col style={{ width: "15%" }} />
                            <col style={{ width: "8.5%" }} />
                            <col style={{ width: "28%" }} />
                            <col style={{ width: "32.5%" }} />
                          </>
                        )}
                      </colgroup>
                      <thead className="sticky top-0 z-20 bg-white">
                        {/* Main Column Header Row */}
                        <tr className="bg-[#DBF780] text-slate-900 align-bottom border-t border-slate-300">
                          {/* Col 1: Product / Variant */}
                          <th className="py-2 px-2 text-[10.5px] font-extrabold">
                            {isProductRowMode
                              ? t.colProduct
                              : `${t.colProduct} / ${t.colVariant}`}
                          </th>

                          {/* Col 2: Price Condition */}
                          <th className="py-2 px-2 text-[10.5px] font-extrabold border-l border-slate-300">
                            {t.colPriceCondition}
                          </th>

                          {/* Inserted Col 3 (Left of Cost): Editable Customer Selling Price */}
                          {hasCustomerCol && (
                            <th className="py-2 px-1.5 text-[10px] font-extrabold text-right border-l border-slate-300 bg-[#E9FAB5]">
                              <div>
                                {t.customerSellingPriceCol}
                                {selectedCustomer?.currency === "USD"
                                  ? " ($)"
                                  : " (฿)"}
                              </div>
                              <div className="text-[9px] font-semibold text-slate-800 leading-tight mt-0.5 truncate">
                                {selectedCustomer?.currency === "USD"
                                  ? `(1$ = ฿${fmt(activeUsdRate)})`
                                  : t.customerSellingPriceSub}
                              </div>
                            </th>
                          )}

                          {/* Col 3/4: Cost (Effective Cost + Base Cost) */}
                          <th className="py-2 px-1.5 text-[10.5px] font-extrabold text-right border-l border-slate-300">
                            <div>
                              Cost
                              {hasCustomerCol
                                ? " (Avg)"
                                : minimizeMode !== "normal"
                                ? ` (${minimizeMode === "min_cost" ? "Min" : "Avg"})`
                                : ""}
                            </div>
                            <div className="text-[9.5px] font-semibold text-slate-800 leading-tight mt-0.5">
                              (
                              {activeOverheadPercent > 0
                                ? `+${activeOverheadPercent}%`
                                : "Eff."}{" "}
                              / {hasCustomerCol ? "Avg" : "Base"})
                            </div>
                          </th>

                          {isDomestic ? (
                            <th className="py-2 px-2.5 text-[10.5px] font-extrabold text-left border-l border-slate-300 bg-[#C7F33C]">
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="text-[11px] font-extrabold text-slate-900">
                                  {t.colDomesticTitle}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-slate-900/10 text-[9px] font-bold text-slate-900">
                                  {lang === "th"
                                    ? "ราคาขาย Invoice & กำไรสุทธิ"
                                    : "Invoice Price & Profit"}
                                </span>
                              </div>
                              <div className="text-[9px] font-semibold text-slate-800 leading-tight mt-0.5">
                                {lang === "th"
                                  ? `แสดงราคาขายบนบิล • กำไร (No Rebate) vs กำไร (+Rebate ${commercialRates.rebateRate}%)`
                                  : `Invoice selling price • Profit (No Rebate) vs (+Rebate ${commercialRates.rebateRate}%)`}
                              </div>
                            </th>
                          ) : (
                            <>
                              {/* Unified Column 1: General Export */}
                              <th className="py-2 px-2.5 text-[10.5px] font-extrabold text-left border-l border-slate-300 bg-[#C7F33C]">
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="text-[11px] font-extrabold text-slate-900">
                                    {t.colGenExportTitle}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-slate-900/10 text-[9px] font-bold text-slate-900">
                                    {lang === "th"
                                      ? "ราคาขาย & กำไร"
                                      : "Price & Profit"}
                                  </span>
                                </div>
                                <div className="text-[9px] font-semibold text-slate-800 leading-tight mt-0.5">
                                  {lang === "th"
                                    ? `ราคาขาย Invoice • กำไร (No Com) & กำไร (+Com ${commercialRates.commissionRate}%)`
                                    : `Invoice price • Profit (No Com) & (+Com ${commercialRates.commissionRate}%)`}
                                </div>
                              </th>

                              {/* Unified Column 2: Exclusive Distributor */}
                              <th className="py-2 px-2.5 text-[10.5px] font-extrabold text-left border-l border-slate-300 bg-[#FDBA74]">
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="text-[11px] font-extrabold text-slate-900">
                                    {t.colExclusiveTitle}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-slate-900/10 text-[9px] font-bold text-slate-900">
                                    {lang === "th"
                                      ? "ราคาขาย & สิทธิ์ MKT/Rebate"
                                      : "Price & MKT/Rebate"}
                                  </span>
                                </div>
                                <div className="text-[9px] font-semibold text-slate-800 leading-tight mt-0.5">
                                  {hasCustomerCol
                                    ? lang === "th"
                                      ? `ราคาขายลูกค้า (ลด DisFee แล้ว) • กำไรงด MKT/Rebate vs +MKT ${commercialRates.mktSupportRate}% vs +Rebate ${commercialRates.rebateRate}%`
                                      : `Customer Invoice (Net) • Profit No MKT/Rebate vs +MKT ${commercialRates.mktSupportRate}% vs +Rebate ${commercialRates.rebateRate}%`
                                    : lang === "th"
                                    ? `ราคาขาย Invoice (หัก DisFee ${commercialRates.distFeeRate}%) • กำไรตามขั้น +MKT ${commercialRates.mktSupportRate}% & +Rebate ${commercialRates.rebateRate}%`
                                    : `Invoice (after ${commercialRates.distFeeRate}% DisFee) • Profit with +MKT ${commercialRates.mktSupportRate}% & +Rebate ${commercialRates.rebateRate}%`}
                                </div>
                              </th>
                            </>
                          )}
                        </tr>
                      </thead>

                      {/* Group by Product */}
                      {productGroups.map((group, groupIdx) => (
                        <tbody
                          key={group.productId}
                          className={`overview-product-group border-l border-r border-b border-slate-300 ${
                            groupIdx % 2 === 1 ? "bg-slate-50/40" : "bg-white"
                          }`}
                        >
                          {!isProductRowMode && (
                            <tr className="bg-slate-100/90 border-b border-slate-200">
                              <td
                                colSpan={totalColsCount}
                                className="py-1 px-2 text-slate-900"
                              >
                                <div className="flex items-baseline gap-2 flex-wrap">
                                  <span className="text-[11px] font-extrabold text-slate-900 leading-snug">
                                    {group.productName}
                                  </span>
                                  {(group.brand || group.category) && (
                                    <span className="text-[10px] font-medium text-slate-600">
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
                            const isAnnexRow =
                              !row.isTrueLoss && row.annexStatus !== "none";

                            return (
                              <tr
                                key={row.variantId}
                                className={`align-top border-b border-slate-100 last:border-b-0 ${
                                  row.isTrueLoss ? "bg-rose-50/40" : ""
                                }`}
                              >
                                {/* Col 1: Variant (when Normal) or Product (when Minimize / Customer Account Selected) */}
                                <td className="py-1.5 px-2 text-slate-900">
                                  {isProductRowMode ? (
                                    isFirstRow && (
                                      <div className="space-y-0.5">
                                        <div className="text-[10.5px] font-extrabold text-slate-900 leading-snug">
                                          {group.productName}
                                        </div>
                                        {(group.brand || group.category) && (
                                          <div className="text-[10px] font-medium text-slate-700">
                                            {[group.brand, group.category]
                                              .filter(Boolean)
                                              .join(" • ")}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  ) : (
                                    <div className="pl-1.5 flex items-center gap-1.5 text-[10.5px] font-bold text-slate-800 leading-snug">
                                      <span className="text-slate-400">•</span>
                                      <span className="break-words">
                                        {row.formula}
                                      </span>
                                    </div>
                                  )}
                                </td>

                                {/* Col 2: Price Condition (Merged per Product via rowSpan since Price Condition is Product-level) */}
                                {isFirstRow && (
                                  <td
                                    rowSpan={group.rows.length}
                                    className="py-2 px-2 border-l border-slate-200 text-slate-800 align-top bg-white/60 overflow-hidden"
                                  >
                                    {!hasCustomerCol || row.basePrice > 0 ? (
                                      <div className="w-full tabular-nums">
                                        {/* Base / Export Price row (Directly editable in Standard Catalog view) */}
                                        <div className="flex items-center justify-between gap-1 text-[10px] leading-snug whitespace-nowrap">
                                          <span className="font-medium text-slate-500 truncate">
                                            {t.exportPriceLabel}
                                          </span>
                                          {!hasCustomerCol ? (
                                            <CustomerSellingPriceInput
                                              value={
                                                row.basePrice > 0
                                                  ? row.basePrice
                                                  : null
                                              }
                                              currency="THB"
                                              isLoss={row.isTrueLoss}
                                              isAnnex={isAnnexRow}
                                              isModified={
                                                row.isBasePriceModified
                                              }
                                              onDraftChange={(nextPrice) =>
                                                handleStageBasePrice(
                                                  group.productId,
                                                  row.savedBasePrice,
                                                  nextPrice
                                                )
                                              }
                                            />
                                          ) : (
                                            <span className="font-extrabold text-slate-900 shrink-0">
                                              ฿{fmt(row.basePrice)}
                                            </span>
                                          )}
                                        </div>
                                        {!hasCustomerCol &&
                                          row.isBasePriceModified && (
                                            <div className="text-right text-[8.5px] font-bold text-emerald-700 leading-tight mt-0.5 print-hidden">
                                              {t.editedLabel} (เดิม ฿
                                              {fmt(row.savedBasePrice)})
                                            </div>
                                          )}

                                        {/* Volume Step Tiers (2-column aligned: Left = Cartons, Right = -% Badge + Net Price) */}
                                        {row.basePrice > 0 &&
                                          row.tiers.length > 0 && (
                                            <div className="mt-1 pt-1 border-t border-slate-100 space-y-0.5">
                                              {row.tiers.map((tier, tIdx) => {
                                                const isLastTier =
                                                  tIdx ===
                                                    row.tiers.length - 1 ||
                                                  tier.maxQuantity === null;
                                                const rangeLabel = isLastTier
                                                  ? `≥${tier.minQuantity} ${t.cartonUnit}`
                                                  : `${tier.minQuantity}–${tier.maxQuantity} ${t.cartonUnit}`;
                                                const tierNetPrice =
                                                  calculateTierPrice(
                                                    row.basePrice,
                                                    tier.discountPercent
                                                  );

                                                return (
                                                  <div
                                                    key={tIdx}
                                                    className="flex items-center justify-between gap-1 text-[9.5px] leading-tight whitespace-nowrap"
                                                  >
                                                    <span className="font-medium text-slate-600 truncate">
                                                      {rangeLabel}
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 shrink-0">
                                                      <span className="px-1 py-px rounded bg-slate-100 text-slate-600 font-bold text-[8.5px] leading-none">
                                                        -{tier.discountPercent}%
                                                      </span>
                                                      <span className="font-bold text-slate-900 w-[46px] text-right shrink-0">
                                                        ฿{fmt(tierNetPrice)}
                                                      </span>
                                                    </span>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                      </div>
                                    ) : (
                                      <span className="text-[10px] text-slate-400">
                                        —
                                      </span>
                                    )}
                                  </td>
                                )}

                                {/* Inserted Col 3 (Left of Cost): Editable Customer Selling Price + Structured Quick-Set Buttons */}
                                {hasCustomerCol && selectedCustomer && (
                                  <td
                                    className={`py-1.5 px-1.5 border-l border-slate-200 text-right tabular-nums overflow-hidden align-top ${
                                      row.isTrueLoss
                                        ? "bg-rose-50/70"
                                        : isAnnexRow
                                        ? "bg-amber-50/45"
                                        : "bg-[#F7FEE7]/40"
                                    }`}
                                  >
                                    {(() => {
                                      const toCustCurrencyVal = (
                                        thbVal: number
                                      ) =>
                                        row.customerCurrency === "USD"
                                          ? Math.ceil(
                                              (thbVal / activeUsdRate) * 100
                                            ) / 100
                                          : thbVal;
                                      const fmtCustBtn = (thbVal: number) => {
                                        const v = toCustCurrencyVal(thbVal);
                                        return row.customerCurrency === "USD"
                                          ? `$${fmt(v)}`
                                          : `฿${fmt(v)}`;
                                      };
                                      const applyCustThbPrice = (
                                        thbVal: number
                                      ) => {
                                        handleStageCustomerPrice(
                                          group.productId,
                                          row.variantId,
                                          row.targetVariantIds,
                                          selectedCustomer.companyId,
                                          selectedCustomer.companyName,
                                          row.savedCustomerPrice,
                                          toCustCurrencyVal(thbVal)
                                        );
                                      };

                                      const minFullSupportThb = isDomestic
                                        ? row.minDomesticPrice
                                        : row.minCustomerFullPrice;

                                      const isMatchPrice = (thbVal: number) =>
                                        row.customerSellingPrice !== null &&
                                        Math.abs(
                                          row.customerSellingPrice -
                                            toCustCurrencyVal(thbVal)
                                        ) < 0.005;

                                      return (
                                        <div className="leading-tight space-y-1">
                                          {/* Input Row */}
                                          <div className="flex items-center justify-between gap-1">
                                            <div className="text-left min-w-0">
                                              {row.customerCurrency === "USD" &&
                                              row.customerSellingPrice !==
                                                null &&
                                              row.customerSellingPrice > 0 ? (
                                                <span className="text-[9px] font-semibold text-slate-600 whitespace-nowrap">
                                                  ≈ ฿
                                                  {fmt(
                                                    row.customerSellingPriceThb
                                                  )}
                                                </span>
                                              ) : row.isModified ? (
                                                <span className="text-[8.5px] font-bold text-emerald-700 whitespace-nowrap print-hidden">
                                                  {t.editedLabel}
                                                </span>
                                              ) : null}
                                            </div>
                                            <CustomerSellingPriceInput
                                              value={row.customerSellingPrice}
                                              currency={row.customerCurrency}
                                              isLoss={row.isTrueLoss}
                                              isAnnex={isAnnexRow}
                                              isModified={row.isModified}
                                              onDraftChange={(nextPrice) =>
                                                handleStageCustomerPrice(
                                                  group.productId,
                                                  row.variantId,
                                                  row.targetVariantIds,
                                                  selectedCustomer.companyId,
                                                  selectedCustomer.companyName,
                                                  row.savedCustomerPrice,
                                                  nextPrice
                                                )
                                              }
                                            />
                                          </div>

                                          {/* Structured Quick-Select Buttons: 1) Standard (-5% DisFee) Range, 2) Min Full Support */}
                                          {(!isDomestic &&
                                            row.stdExclMaxPrice > 0) ||
                                          minFullSupportThb > 0 ? (
                                            <div className="pt-1 border-t border-slate-200/80 space-y-1.5 text-left print-hidden">
                                              {!isDomestic &&
                                                row.stdExclMaxPrice > 0 && (
                                                  <div className="space-y-0.5">
                                                    <div className="text-[8px] font-bold text-slate-600 leading-none truncate">
                                                      {lang === "th"
                                                        ? `ช่วงมาตรฐาน (-${commercialRates.distFeeRate}% DisFee)`
                                                        : `Std. Range (-${commercialRates.distFeeRate}% DisFee)`}
                                                    </div>
                                                    {row.hasStdTierRange ? (
                                                      <div className="grid grid-cols-2 gap-1">
                                                        <button
                                                          type="button"
                                                          onClick={() =>
                                                            applyCustThbPrice(
                                                              row.stdExclMinPrice
                                                            )
                                                          }
                                                          className={`py-0.5 px-1 rounded border text-[8.5px] font-extrabold text-center whitespace-nowrap cursor-pointer transition-colors ${
                                                            isMatchPrice(
                                                              row.stdExclMinPrice
                                                            )
                                                              ? "bg-[#C7F33C] border-slate-900 text-slate-950"
                                                              : "bg-white hover:bg-[#C7F33C]/70 border-slate-300 hover:border-slate-900 text-slate-800"
                                                          }`}
                                                          title="คลิกเพื่อตั้งเป็นราคาต่ำสุดของช่วงมาตรฐาน Exclusive"
                                                        >
                                                          {fmtCustBtn(
                                                            row.stdExclMinPrice
                                                          )}
                                                        </button>
                                                        <button
                                                          type="button"
                                                          onClick={() =>
                                                            applyCustThbPrice(
                                                              row.stdExclMaxPrice
                                                            )
                                                          }
                                                          className={`py-0.5 px-1 rounded border text-[8.5px] font-extrabold text-center whitespace-nowrap cursor-pointer transition-colors ${
                                                            isMatchPrice(
                                                              row.stdExclMaxPrice
                                                            )
                                                              ? "bg-[#C7F33C] border-slate-900 text-slate-950"
                                                              : "bg-white hover:bg-[#C7F33C]/70 border-slate-300 hover:border-slate-900 text-slate-800"
                                                          }`}
                                                          title="คลิกเพื่อตั้งเป็นราคาสูงสุดของช่วงมาตรฐาน Exclusive"
                                                        >
                                                          {fmtCustBtn(
                                                            row.stdExclMaxPrice
                                                          )}
                                                        </button>
                                                      </div>
                                                    ) : (
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          applyCustThbPrice(
                                                            row.stdExclMaxPrice
                                                          )
                                                        }
                                                        className={`w-full py-0.5 px-1.5 rounded border text-[8.5px] font-extrabold text-center whitespace-nowrap cursor-pointer transition-colors ${
                                                          isMatchPrice(
                                                            row.stdExclMaxPrice
                                                          )
                                                            ? "bg-[#C7F33C] border-slate-900 text-slate-950"
                                                            : "bg-white hover:bg-[#C7F33C]/70 border-slate-300 hover:border-slate-900 text-slate-800"
                                                        }`}
                                                      >
                                                        {fmtCustBtn(
                                                          row.stdExclMaxPrice
                                                        )}
                                                      </button>
                                                    )}
                                                  </div>
                                                )}

                                              {minFullSupportThb > 0 && (
                                                <div className="space-y-0.5">
                                                  <div className="text-[8px] font-bold text-slate-600 leading-none truncate">
                                                    {isDomestic
                                                      ? lang === "th"
                                                        ? "ขั้นต่ำ (ให้ Rebate)"
                                                        : "Min (With Rebate)"
                                                      : lang === "th"
                                                      ? "ขั้นต่ำ (ให้ MKT+Rebate)"
                                                      : "Min (MKT+Rebate)"}
                                                  </div>
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      applyCustThbPrice(
                                                        minFullSupportThb
                                                      )
                                                    }
                                                    className={`w-full py-0.5 px-1.5 rounded border text-[8.5px] font-extrabold text-center whitespace-nowrap cursor-pointer transition-colors ${
                                                      isMatchPrice(
                                                        minFullSupportThb
                                                      )
                                                        ? "bg-[#C7F33C] border-slate-900 text-slate-950"
                                                        : row.isTrueLoss ||
                                                          isAnnexRow
                                                        ? "bg-amber-50 hover:bg-[#C7F33C]/80 border-amber-300 hover:border-slate-900 text-amber-950"
                                                        : "bg-white hover:bg-[#C7F33C]/70 border-slate-300 hover:border-slate-900 text-slate-800"
                                                    }`}
                                                    title="คลิกเพื่อตั้งเป็นราคาขั้นต่ำที่ให้สิทธิ์ MKT & Rebate ได้ครบ (Full Support)"
                                                  >
                                                    ≥{" "}
                                                    {fmtCustBtn(
                                                      minFullSupportThb
                                                    )}
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          ) : null}
                                        </div>
                                      );
                                    })()}
                                  </td>
                                )}

                                {/* Col 3/4: Cost (Effective Cost + Base Cost) */}
                                <td className="py-1.5 px-1.5 border-l border-slate-200 text-right tabular-nums overflow-hidden">
                                  {row.hasCost ? (
                                    <div className="leading-tight space-y-0.5">
                                      <div className="text-[10.5px] font-bold text-slate-900 whitespace-nowrap">
                                        ฿{fmt(row.effectiveCost)}
                                      </div>
                                      <div className="text-[9px] font-medium text-slate-500 whitespace-nowrap">
                                        ({hasCustomerCol || minimizeMode === "avg_cost" ? "Avg" : "Base"}: ฿{fmt(row.baseCost)})
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 font-normal">
                                      —
                                    </span>
                                  )}
                                </td>

                                {isDomestic ? (
                                  <td className="py-1.5 px-2 border-l border-slate-300 align-top">
                                    {renderDomesticCell(
                                      row,
                                      hasCustomerCol,
                                      hasCustomerCol && selectedCustomer
                                        ? (targetThbPrice) => {
                                            const snapVal =
                                              row.customerCurrency === "USD"
                                                ? Math.ceil(
                                                    (targetThbPrice /
                                                      activeUsdRate) *
                                                      100
                                                  ) / 100
                                                : targetThbPrice;
                                            handleStageCustomerPrice(
                                              group.productId,
                                              row.variantId,
                                              row.targetVariantIds,
                                              selectedCustomer.companyId,
                                              selectedCustomer.companyName,
                                              row.savedCustomerPrice,
                                              snapVal
                                            );
                                          }
                                        : (targetThbPrice) => {
                                            handleStageBasePrice(
                                              group.productId,
                                              row.savedBasePrice,
                                              targetThbPrice
                                            );
                                          }
                                    )}
                                  </td>
                                ) : (
                                  <>
                                    {/* Unified Column 1: General Export */}
                                    <td className="py-1.5 px-2 border-l border-slate-300 align-top">
                                      {renderGeneralExportCell(
                                        row,
                                        hasCustomerCol
                                      )}
                                    </td>

                                    {/* Unified Column 2: Exclusive Distributor */}
                                    <td className="py-1.5 px-2 border-l border-slate-300 align-top">
                                      {renderExclusiveCell(
                                        row,
                                        hasCustomerCol,
                                        hasCustomerCol && selectedCustomer
                                          ? (targetThbPrice) => {
                                              const snapVal =
                                                row.customerCurrency === "USD"
                                                  ? Math.ceil(
                                                      (targetThbPrice /
                                                        activeUsdRate) *
                                                        100
                                                    ) / 100
                                                  : targetThbPrice;
                                              handleStageCustomerPrice(
                                                group.productId,
                                                row.variantId,
                                                row.targetVariantIds,
                                                selectedCustomer.companyId,
                                                selectedCustomer.companyName,
                                                row.savedCustomerPrice,
                                                snapVal
                                              );
                                            }
                                          : (targetThbPrice) => {
                                              handleStageBasePrice(
                                                group.productId,
                                                row.savedBasePrice,
                                                targetThbPrice
                                              );
                                            }
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
                    <div className="px-3.5 py-2 bg-slate-50 border-l border-r border-b border-slate-300 text-[10.5px] text-slate-800">
                      {hasCustomerCol ? t.footnoteCustomer : t.footnote}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
