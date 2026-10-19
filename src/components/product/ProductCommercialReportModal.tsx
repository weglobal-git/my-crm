"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Printer,
  Check,
  ChevronDown,
  TrendingUp,
  AlertTriangle,
  Layers,
  Info,
} from "lucide-react";
import {
  ProductOverviewDTO,
  parsePriceConditions,
  calculateTierPrice,
  PriceStepTier,
} from "@/lib/product/product-dto";
import { CommercialRates, DEFAULT_COMMERCIAL_RATES } from "./ExportPricingSimulation";
import { useCompanyCostOverhead } from "@/lib/product/use-company-cost-overhead";

interface VariantEditState {
  price: number;
  productCost: number | null;
  priceCondition: string;
  imageUrl?: string | null;
  status?: string;
}

interface ProductCommercialReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ProductOverviewDTO | null;
  productName: string;
  category: string;
  brand: string;
  hsCode: string;
  variantEdits: Record<string, VariantEditState>;
  variantRates?: Record<string, CommercialRates>;
  initialVariantId?: string | null;
}

type Lang = "th" | "en";

const DICT = {
  th: {
    modalTitle: "Commercial Pricing & Spec Report",
    modalSubtitle: "รายงานโครงสร้างต้นทุน ส่วนลดตามปริมาณ และการวิเคราะห์กำไรสุทธิ",
    printBtn: "พิมพ์ / บันทึก PDF",
    allVariants: "ทุกสูตรสินค้า",
    selectedVariant: "สูตรที่เลือก",
    noBrand: "ไม่ระบุแบรนด์",
    hsCode: "HS Code",
    packaging: "บรรจุภัณฑ์",
    pcsPerCtn: "ชิ้น / ลัง",
    date: "วันที่ออกเอกสาร",
    docNo: "เลขที่เอกสาร",
    noCostTitle: "ยังไม่มีข้อมูลต้นทุน (Cost) สำหรับสร้างรายงาน",
    noCostDesc:
      "กรุณากรอกข้อมูล Cost (THB) ของสูตรสินค้าในแท็บ Pricing & Variants เพื่อแสดงรายงานการวิเคราะห์ราคาและผลกำไร",

    // Unified Group Card Header
    priceGroupLabel: "กลุ่มโครงสร้างราคา",
    formulasUnit: "สูตร",
    baseExportPrice: "ราคาส่งออกเปิดบิล",
    effectiveCostSummary: "ต้นทุนสินค้ารวม",
    grossSpread: "กำไรขั้นต้น (Gross)",
    noTierApplied: "ราคามาตรฐานทุกจำนวน",
    cartonUnit: "ลัง",
    moreThan: "ลังขึ้นไป",

    // Section 1: Company Standard Cost Table
    sec1Title: "1. โครงสร้างต้นทุนมาตรฐานบริษัท",
    colBaseCost: "Base Cost",
    colSupport: "Support",
    colOperation: "Operation",
    colMarketing: "Marketing",
    colSales: "Com",
    colEffectiveCost: "Effective Cost",

    // Section 2: Volume Tier Discounts Table
    sec2Title: "2. ตารางราคาและกำไรตามปริมาณสั่งซื้อ",
    colVolumeTier: "ระดับปริมาณ",
    colCartonRange: "จำนวนสั่งซื้อ",
    colDiscount: "ส่วนลด (%)",
    colNetUnitPrice: "ราคาขายสุทธิต่อชิ้น",
    colEstGrossMargin: "กำไรขั้นต้นต่อชิ้น (หลังหักต้นทุนรวม)",

    // Section 3: Commercial Margin Waterfall (Model A vs Model B)
    sec3Title: "3. การวิเคราะห์โครงสร้างกำไรสุทธิ",
    modelABadge: "MODEL A",
    modelATitle: "General Export",
    modelASub: "ขายส่งออกมาตรฐาน • หัก Rec Com",
    modelBBadge: "MODEL B",
    modelBTitle: "Exclusive",
    modelBSub: "ราคาตัวแทน • หักส่วนลดบริหาร + การตลาด + Rebate",

    wfColItem: "รายการโครงสร้างราคา",
    wfColBase: "ราคาปกติ",
    wfColMaxTier: "Tier สูงสุด",
    wfGroup1: "3.1 โครงสร้างราคาเสนอขาย",
    wfGroup1TagA: "ราคาที่ลูกค้าเห็น",
    wfGroup1TagB: "ราคาที่ตัวแทนเห็น",
    wfExportInvoice: "ราคาส่งออกเปิดบิล",
    wfDistDiscount: "หัก ส่วนลดบริหารตัวแทน",
    wfQuotationPrice: "ราคาเสนอขายหน้าบิล",
    wfGroup2: "3.2 ค่าใช้จ่ายตามเงื่อนไข",
    wfGroup2Tag: "หักเมื่อเกิดรายการ",
    wfSalesComm: "หัก Rec Com",
    wfMktSupport: "หัก งบสนับสนุนการตลาด",
    wfRebate: "หัก Rebate",
    wfGroup3: "3.3 ผลตอบแทนและกำไรสุทธิ",
    wfNetRevenue: "รายรับสุทธิหลังหักเงื่อนไข",
    wfLessCost: "หัก ต้นทุนสินค้ารวม",
    wfWorstCaseProfit: "กำไรสุทธิขั้นต่ำ",
    wfWorstCaseHintA: "กรณีหัก Rec Com",
    wfWorstCaseHintB: "กรณีเบิกการตลาด + Rebate ครบ",
    wfBestCaseProfit: "กำไรสุทธิสูงสุด",
    wfBestCaseHintA: "ขายตรง (ไม่มี Rec Com)",
    wfBestCaseHintB: "ไม่เบิกการตลาด & ไม่ถึงเป้า Rebate",
    execTakeaway:
      "หมายเหตุ: ข้อ 3.1 คือราคาหน้าใบเสนอราคาที่คู่ค้าเห็นจริง • ข้อ 3.2 เป็นค่าใช้จ่ายตามเงื่อนไข หากไม่เกิดขึ้นจริง บริษัทจะได้กำไรระดับ Best Case ทันที",
  },
  en: {
    modalTitle: "Commercial Pricing & Spec Report",
    modalSubtitle: "Standard cost structure, volume tier schedule, and net margin waterfall",
    printBtn: "Print / Save PDF",
    allVariants: "All Variants",
    selectedVariant: "Selected Variant",
    noBrand: "No Brand",
    hsCode: "HS Code",
    packaging: "Packing",
    pcsPerCtn: "pcs / ctn",
    date: "Issue Date",
    docNo: "Doc No.",
    noCostTitle: "No Product Cost Available for Commercial Report",
    noCostDesc:
      "Please enter Product Cost (THB) in the Pricing & Variants tab to generate pricing and margin analysis.",

    // Unified Group Card Header
    priceGroupLabel: "Pricing Structure Group",
    formulasUnit: "formulas",
    baseExportPrice: "Base Export Price",
    effectiveCostSummary: "Effective Cost",
    grossSpread: "Gross Spread",
    noTierApplied: "Standard rate (all quantities)",
    cartonUnit: "ctns",
    moreThan: "+ ctns",

    // Section 1: Company Standard Cost Table
    sec1Title: "1. Company Standard Cost Breakdown",
    colBaseCost: "Base Cost",
    colSupport: "Support",
    colOperation: "Operation",
    colMarketing: "Marketing",
    colSales: "Com",
    colEffectiveCost: "Effective Cost",

    // Section 2: Volume Tier Discounts Table
    sec2Title: "2. Volume Tier Discounts Schedule",
    colVolumeTier: "Volume Tier",
    colCartonRange: "Order Quantity",
    colDiscount: "Discount (%)",
    colNetUnitPrice: "Net Export Price / Unit",
    colEstGrossMargin: "Gross Margin / Unit (After Effective Cost)",

    // Section 3: Commercial Margin Waterfall (Model A vs Model B)
    sec3Title: "3. Commercial Margin Waterfall (Model A vs Model B)",
    modelABadge: "MODEL A",
    modelATitle: "General Export",
    modelASub: "Standard export • Deducts Rec Com",
    modelBBadge: "MODEL B",
    modelBTitle: "Exclusive Distributor",
    modelBSub: "Distributor pricing • Deducts Dist. Fee + Marketing + Rebate",

    wfColItem: "Price & Deduction Breakdown",
    wfColBase: "Base",
    wfColMaxTier: "Max Tier",
    wfGroup1: "3.1 Quotation Structure",
    wfGroup1TagA: "Seen by buyer",
    wfGroup1TagB: "Seen by distributor",
    wfExportInvoice: "Export Invoice Price",
    wfDistDiscount: "Less Distribution Fee",
    wfQuotationPrice: "Quotation Price",
    wfGroup2: "3.2 Contingent Expenses",
    wfGroup2Tag: "Conditional",
    wfSalesComm: "Less Rec Com",
    wfMktSupport: "Less Marketing Support",
    wfRebate: "Less Annual Rebate",
    wfGroup3: "3.3 Net Return & Profit",
    wfNetRevenue: "Net Revenue (After 3.2)",
    wfLessCost: "Less Effective Product Cost",
    wfWorstCaseProfit: "Min. Net Profit (Worst Case)",
    wfWorstCaseHintA: "With Rec Com",
    wfWorstCaseHintB: "With full Mkt + Rebate",
    wfBestCaseProfit: "Max Net Profit (Best Case)",
    wfBestCaseHintA: "Direct export (0% Rec Com)",
    wfBestCaseHintB: "Unclaimed Mkt & Rebate",
    execTakeaway:
      "Note: 3.1 is the quotation price visible to partners • 3.2 expenses are conditional; if not incurred, net profit reaches Best Case.",
  },
};

interface TierRowCalc {
  label: string;
  qtyRangeText: string;
  discountPercent: number;
  exportPrice: number;
  grossMargin: number;
  grossMarginPct: number;
}

function calcScenarioMetrics(
  exportPrice: number,
  cost: number,
  vRates: CommercialRates
) {
  // Model A: General Export
  const genQuotation = exportPrice;
  const genCommission = (exportPrice * vRates.commissionRate) / 100;
  const genNetRev = exportPrice - genCommission;
  const genProfitWorst = genNetRev - cost;
  const genMarginWorstPct = exportPrice > 0 ? (genProfitWorst / exportPrice) * 100 : 0;
  const genProfitBest = exportPrice - cost;
  const genMarginBestPct = exportPrice > 0 ? (genProfitBest / exportPrice) * 100 : 0;

  // Model B: Exclusive Distributor
  const exclDistFee = (exportPrice * vRates.distFeeRate) / 100;
  const exclQuotation = exportPrice - exclDistFee;
  const exclMkt = (exclQuotation * vRates.mktSupportRate) / 100;
  const exclRebate = (exclQuotation * vRates.rebateRate) / 100;
  const exclNetRev = exclQuotation - exclMkt - exclRebate;
  const exclProfitWorst = exclNetRev - cost;
  const exclMarginWorstPct = exportPrice > 0 ? (exclProfitWorst / exportPrice) * 100 : 0;
  const exclProfitBest = exclQuotation - cost;
  const exclMarginBestPct = exportPrice > 0 ? (exclProfitBest / exportPrice) * 100 : 0;

  return {
    genQuotation,
    genCommission,
    genNetRev,
    genProfitWorst,
    genMarginWorstPct,
    genProfitBest,
    genMarginBestPct,
    exclDistFee,
    exclQuotation,
    exclMkt,
    exclRebate,
    exclNetRev,
    exclProfitWorst,
    exclMarginWorstPct,
    exclProfitBest,
    exclMarginBestPct,
  };
}

export function ProductCommercialReportModal({
  isOpen,
  onClose,
  product,
  productName,
  category,
  brand,
  hsCode,
  variantEdits,
  variantRates,
  initialVariantId,
}: ProductCommercialReportModalProps) {
  const [mounted, setMounted] = useState(false);
  const [lang, setLang] = useState<Lang>("th");
  const [selectedVariantId, setSelectedVariantId] = useState<string | "all">(
    initialVariantId || "all"
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const {
    overhead,
    totalPercent: companyCostOverheadPercent,
    commercialRates,
    calculateEffectiveCost,
    getCostBreakdown,
  } = useCompanyCostOverhead();

  useEffect(() => {
    setMounted(true);
  }, []);

  const t = DICT[lang];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSelectedVariantId(initialVariantId || "all");
    }
  }, [isOpen, initialVariantId]);

  const variants = product?.variants || [];

  const variantsWithCost = useMemo(() => {
    return variants.filter((v) => {
      const edit = variantEdits[v.id] || { productCost: v.productCost };
      return typeof edit.productCost === "number" && edit.productCost > 0;
    });
  }, [variants, variantEdits]);

  const displayedVariants = useMemo(() => {
    if (selectedVariantId === "all") {
      return variantsWithCost;
    }
    return variantsWithCost.filter((v) => v.id === selectedVariantId);
  }, [variantsWithCost, selectedVariantId]);

  const selectedVariantLabel =
    selectedVariantId === "all"
      ? `${t.allVariants} (${variantsWithCost.length})`
      : variantsWithCost.find((v) => v.id === selectedVariantId)?.formula ||
        t.selectedVariant;

  const handlePrint = () => {
    window.print();
  };

  const fmt = (num: number, decimals: number = 2) =>
    num.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

  // Group displayed variants by distinct pricing/tier/cost structure
  const reportGroups = useMemo(() => {
    interface ReportGroup {
      key: string;
      basePrice: number;
      rawBaseCost: number;
      cost: number;
      costBreakdown: ReturnType<typeof getCostBreakdown>;
      tiers: PriceStepTier[];
      maxTier: PriceStepTier | null;
      maxDiscount: number;
      maxStepPrice: number;
      vRates: CommercialRates;
      formulas: string[];
      baseCalc: ReturnType<typeof calcScenarioMetrics>;
      maxCalc: ReturnType<typeof calcScenarioMetrics>;
      tierRows: TierRowCalc[];
    }

    const groups: ReportGroup[] = [];

    displayedVariants.forEach((v) => {
      const edit = variantEdits[v.id] || {
        price: v.price,
        productCost: v.productCost,
        priceCondition: v.priceCondition || "",
      };
      const basePrice = edit.price;
      const rawBaseCost = edit.productCost ?? 0;
      const cost = calculateEffectiveCost(rawBaseCost);
      const costBreakdown = getCostBreakdown(rawBaseCost);
      const tiers = parsePriceConditions(edit.priceCondition);
      const vRates = commercialRates || DEFAULT_COMMERCIAL_RATES;

      const key = `${basePrice}_${rawBaseCost}_${JSON.stringify(tiers)}_${vRates.commissionRate}_${vRates.distFeeRate}_${vRates.mktSupportRate}_${vRates.rebateRate}`;
      const formula = v.formula || "Standard";

      const existing = groups.find((g) => g.key === key);
      if (existing) {
        existing.formulas.push(formula);
      } else {
        const maxTier = tiers.length > 0 ? tiers[tiers.length - 1] : null;
        const maxDiscount = maxTier?.discountPercent ?? 0;
        const maxStepPrice = calculateTierPrice(basePrice, maxDiscount);

        const baseCalc = calcScenarioMetrics(basePrice, cost, vRates);
        const maxCalc = calcScenarioMetrics(maxStepPrice, cost, vRates);

        const tierRows: TierRowCalc[] = [];
        const firstTierMin = tiers.length > 0 ? tiers[0].minQuantity : null;
        const baseRangeText =
          firstTierMin && firstTierMin > 1
            ? `1 - ${firstTierMin - 1} ${t.cartonUnit}`
            : t.noTierApplied;

        const baseGrossMargin = cost > 0 ? basePrice - cost : 0;
        const baseGrossMarginPct =
          basePrice > 0 ? (baseGrossMargin / basePrice) * 100 : 0;

        tierRows.push({
          label: "Base",
          qtyRangeText: baseRangeText,
          discountPercent: 0,
          exportPrice: basePrice,
          grossMargin: baseGrossMargin,
          grossMarginPct: baseGrossMarginPct,
        });

        tiers.forEach((tRow, idx) => {
          const isLast = idx === tiers.length - 1;
          const tPrice = calculateTierPrice(basePrice, tRow.discountPercent);
          const grossMargin = cost > 0 ? tPrice - cost : 0;
          const grossMarginPct = tPrice > 0 ? (grossMargin / tPrice) * 100 : 0;
          tierRows.push({
            label: `Tier ${idx + 1}`,
            qtyRangeText: isLast
              ? `${tRow.minQuantity} ${t.moreThan}`
              : `${tRow.minQuantity} - ${tRow.maxQuantity} ${t.cartonUnit}`,
            discountPercent: tRow.discountPercent,
            exportPrice: tPrice,
            grossMargin,
            grossMarginPct,
          });
        });

        groups.push({
          key,
          basePrice,
          rawBaseCost,
          cost,
          costBreakdown,
          tiers,
          maxTier,
          maxDiscount,
          maxStepPrice,
          vRates,
          formulas: [formula],
          baseCalc,
          maxCalc,
          tierRows,
        });
      }
    });

    return groups;
  }, [
    displayedVariants,
    variantEdits,
    commercialRates,
    calculateEffectiveCost,
    getCostBreakdown,
    t.cartonUnit,
    t.moreThan,
    t.noTierApplied,
  ]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      id="commercial-report-modal-overlay"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
    >
      {/* WYSIWYG A4 Print Stylesheet */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm;
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
          body > *:not(#commercial-report-modal-overlay) {
            display: none !important;
          }
          #commercial-report-modal-overlay {
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
          #commercial-report-card {
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
          #commercial-report-scroll-body {
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
          #commercial-report-print-container {
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
          .report-group-card {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .model-ab-split {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
      `}</style>

      <div
        id="commercial-report-card"
        className="relative w-full max-w-[960px] bg-[#252728] border border-[#4E4F50] rounded-2xl overflow-hidden flex flex-col my-auto max-h-[93vh]"
      >
        {/* Modal Toolbar (Hidden in Print) */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1C1C1D] bg-[#3A3B3C] shrink-0 print-hidden">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#C7F33C]/15 border border-[#C7F33C]/40 flex items-center justify-center text-[#C7F33C]">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 leading-tight">
                {t.modalTitle}
              </h3>
              <p className="text-[11px] text-slate-400 leading-tight">
                {t.modalSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Language Switcher */}
            <div className="flex items-center bg-[#252728] border border-[#4E4F50] rounded-lg p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setLang("th")}
                className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                  lang === "th"
                    ? "bg-[#C7F33C] text-black font-semibold"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                TH
              </button>
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                  lang === "en"
                    ? "bg-[#C7F33C] text-black font-semibold"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                EN
              </button>
            </div>

            {/* Formula Filter Dropdown */}
            {variantsWithCost.length > 1 && (
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#252728] border border-[#4E4F50] rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer"
                >
                  <span className="max-w-[160px] truncate">{selectedVariantLabel}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                      dropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-56 bg-[#3A3B3C] border border-[#4E4F50] rounded-xl py-1 z-50 overflow-hidden flex flex-col max-h-[280px]">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedVariantId("all");
                        setDropdownOpen(false);
                      }}
                      className={`flex items-center justify-between px-3 py-2 text-xs font-semibold transition-colors cursor-pointer text-left ${
                        selectedVariantId === "all"
                          ? "bg-[#C7F33C]/15 text-[#C7F33C]"
                          : "text-slate-200 hover:bg-[#4E4F50]"
                      }`}
                    >
                      <span>
                        {t.allVariants} ({variantsWithCost.length})
                      </span>
                      {selectedVariantId === "all" && (
                        <Check className="w-3.5 h-3.5 shrink-0" />
                      )}
                    </button>
                    <div className="h-px bg-[#4E4F50] my-1" />
                    <div className="overflow-y-auto">
                      {variantsWithCost.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            setSelectedVariantId(v.id);
                            setDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors cursor-pointer text-left ${
                            selectedVariantId === v.id
                              ? "bg-[#C7F33C]/15 text-[#C7F33C] font-semibold"
                              : "text-slate-300 hover:bg-[#4E4F50] hover:text-white"
                          }`}
                        >
                          <span className="truncate">{v.formula || v.id}</span>
                          {selectedVariantId === v.id && (
                            <Check className="w-3.5 h-3.5 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#C7F33C] text-black font-bold text-xs rounded-lg hover:bg-[#b0d635] transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t.printBtn}</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#4E4F50] rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Report Body (Pure Clean Light Paper - No Black Boxes or Neon Lime Text) */}
        <div
          id="commercial-report-scroll-body"
          className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#252728] hide-scrollbar [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
        >
          <div
            id="commercial-report-print-container"
            style={{
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Thai", "Thonburi", "Sarabun", sans-serif',
              letterSpacing: "-0.01em",
            }}
            className="w-full max-w-[900px] mx-auto bg-white rounded-xl border border-slate-200 p-5 sm:p-7 text-slate-800 space-y-6"
          >
            {/* Document Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-300">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-900 border border-slate-300">
                    {brand || t.noBrand}
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight">
                  {productName || "Product Commercial Report"}
                </h1>
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
                    CP-{product?.id?.slice(0, 8).toUpperCase() || "DOC"}
                  </span>
                </div>
              </div>
            </div>

            {/* Empty State if No Cost */}
            {variantsWithCost.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center mx-auto border border-slate-300">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {t.noCostTitle}
                </h3>
                <p className="text-xs text-slate-700 max-w-md mx-auto leading-relaxed">
                  {t.noCostDesc}
                </p>
              </div>
            ) : (
              /* Render ONE Unified Frame Card per Distinct Formula Pricing Group */
              <div className="space-y-8">
                {reportGroups.map((group, gIdx) => {
                  const cb = group.costBreakdown;

                  return (
                    <div
                      key={group.key || gIdx}
                      className="rounded-xl border border-slate-300 bg-white overflow-hidden report-group-card"
                    >
                      {/* =============================================================== */}
                      {/* UNIFIED CARD HEADER: FORMULAS IN THIS GROUP                     */}
                      {/* =============================================================== */}
                      <div className="px-4 py-2.5 bg-[#C7F33C]/70 border-b border-slate-300 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {group.formulas.map((formula, fIdx) => (
                            <span
                              key={fIdx}
                              className="px-2.5 py-0.5 rounded-md bg-white text-slate-900 border border-slate-300 text-xs font-bold"
                            >
                              {formula}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* =============================================================== */}
                      {/* SECTION 1 (FLUSH): COMPANY STANDARD COST BREAKDOWN TABLE        */}
                      {/* =============================================================== */}
                      <div className="border-b border-slate-200">
                        <div className="px-4 py-2 bg-[#C7F33C]/50 border-b border-slate-200 flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                            {t.sec1Title}
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-right text-xs border-collapse table-fixed">
                            <thead className="bg-white text-slate-800 text-xs">
                              <tr className="align-top">
                                <th className="py-2 px-3 font-bold align-top text-right">
                                  {t.colBaseCost}
                                </th>
                                {overhead.supportPercent > 0 && (
                                  <th className="py-2 px-3 font-bold align-top text-right">
                                    + {t.colSupport} ({overhead.supportPercent}%)
                                  </th>
                                )}
                                {overhead.operationPercent > 0 && (
                                  <th className="py-2 px-3 font-bold align-top text-right">
                                    + {t.colOperation} ({overhead.operationPercent}%)
                                  </th>
                                )}
                                {overhead.marketingPercent > 0 && (
                                  <th className="py-2 px-3 font-bold align-top text-right">
                                    + {t.colMarketing} ({overhead.marketingPercent}%)
                                  </th>
                                )}
                                {overhead.salesPercent > 0 && (
                                  <th className="py-2 px-3 font-bold align-top text-right">
                                    + {t.colSales} ({overhead.salesPercent}%)
                                  </th>
                                )}
                                <th className="py-2 px-3 font-bold text-slate-900 bg-slate-50/70 align-top text-right">
                                  {t.colEffectiveCost}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="text-xs">
                                <td className="py-2 px-3 font-bold text-slate-900 tabular-nums text-right">
                                  ฿{fmt(cb.baseCost, 2)}
                                </td>
                                {overhead.supportPercent > 0 && (
                                  <td className="py-2 px-3 font-semibold text-slate-800 tabular-nums text-right">
                                    +฿{fmt(cb.supportAmount, 2)}
                                  </td>
                                )}
                                {overhead.operationPercent > 0 && (
                                  <td className="py-2 px-3 font-semibold text-slate-800 tabular-nums text-right">
                                    +฿{fmt(cb.operationAmount, 2)}
                                  </td>
                                )}
                                {overhead.marketingPercent > 0 && (
                                  <td className="py-2 px-3 font-semibold text-slate-800 tabular-nums text-right">
                                    +฿{fmt(cb.marketingAmount, 2)}
                                  </td>
                                )}
                                {overhead.salesPercent > 0 && (
                                  <td className="py-2 px-3 font-semibold text-slate-800 tabular-nums text-right">
                                    +฿{fmt(cb.salesAmount, 2)}
                                  </td>
                                )}
                                <td className="py-2 px-3 font-black text-slate-900 tabular-nums bg-slate-50/70 text-right">
                                  ฿{fmt(cb.effectiveCost, 2)}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* =============================================================== */}
                      {/* SECTION 2 (FLUSH): VOLUME TIER DISCOUNTS SCHEDULE               */}
                      {/* =============================================================== */}
                      <div className="border-b border-slate-200">
                        <div className="px-4 py-2 bg-[#C7F33C]/50 border-b border-slate-200 flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                            {t.sec2Title}
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse table-fixed">
                            <colgroup>
                              <col className="w-[100px]" />
                              <col className="w-auto" />
                              <col className="w-[120px]" />
                              <col className="w-[150px]" />
                              <col className="w-[210px]" />
                            </colgroup>
                            <thead className="bg-white text-slate-800 text-xs border-b border-slate-200">
                              <tr className="align-top">
                                <th className="py-2 px-4 font-bold align-bottom">
                                  {t.colVolumeTier}
                                </th>
                                <th className="py-2 px-3 font-bold align-top">
                                  {t.colCartonRange}
                                </th>
                                <th className="py-2 px-3 text-right font-bold align-top">
                                  {t.colDiscount}
                                </th>
                                <th className="py-2 px-3 text-right font-bold align-top">
                                  {t.colNetUnitPrice}
                                </th>
                                <th className="py-2 px-4 text-right font-bold align-top">
                                  {t.colEstGrossMargin}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="text-xs">
                              {group.tierRows.map((row, rIdx) => (
                                <tr
                                  key={rIdx}
                                  className="hover:bg-slate-50/60 transition-colors"
                                >
                                  <td className="py-2 px-4 font-bold text-slate-900 whitespace-nowrap">
                                    {row.label}
                                  </td>
                                  <td className="py-2 px-3 font-medium text-slate-800">
                                    {row.qtyRangeText}
                                  </td>
                                  <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">
                                    {row.discountPercent > 0 ? (
                                      <span className="font-bold text-rose-600">
                                        -{row.discountPercent}%
                                      </span>
                                    ) : (
                                      <span className="font-medium text-slate-700">
                                        0% (Base)
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">
                                    ฿{fmt(row.exportPrice, 2)}
                                  </td>
                                  <td className="py-2 px-4 text-right tabular-nums whitespace-nowrap">
                                    <span
                                      className={`font-bold ${
                                        row.grossMargin >= 0
                                          ? "text-emerald-700"
                                          : "text-rose-600"
                                      }`}
                                    >
                                      {row.grossMargin >= 0 ? "+" : ""}฿
                                      {fmt(row.grossMargin, 2)}
                                    </span>
                                    <span className="text-[11px] font-semibold text-slate-700 ml-1">
                                      ({fmt(row.grossMarginPct, 1)}%)
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* =============================================================== */}
                      {/* SECTION 3 (FLUSH): COMMERCIAL MARGIN WATERFALL (MODEL A | B)    */}
                      {/* =============================================================== */}
                      <div>
                        <div className="px-4 py-2 bg-[#C7F33C]/50 border-b border-slate-200 flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                            {t.sec3Title}
                          </span>
                        </div>

                        {/* Flush 2-Column Split Inside the Same Card (Separated by 1px Line) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-300 model-ab-split">
                          {/* LEFT COLUMN: MODEL A */}
                          <div className="flex flex-col">
                            <table className="w-full text-left text-xs border-collapse table-fixed">
                              <colgroup>
                                <col className="w-auto" />
                                <col className="w-[78px]" />
                                <col className="w-[106px]" />
                              </colgroup>
                              <thead className="bg-slate-200 text-slate-900 text-xs border-b border-slate-300">
                                <tr className="align-middle">
                                  <th className="py-2 pl-3 pr-1.5 font-bold align-middle">
                                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                                      <span className="px-1.5 py-0.5 rounded bg-white border border-slate-300 text-slate-900 text-[10px] font-extrabold tracking-wider shrink-0 leading-none">
                                        {t.modelABadge}
                                      </span>
                                      <span className="text-xs font-bold text-slate-900">
                                        {t.modelATitle}
                                      </span>
                                    </div>
                                  </th>
                                  <th className="py-2 px-1.5 text-right font-bold align-middle whitespace-nowrap">
                                    {t.wfColBase}
                                  </th>
                                  <th className="py-2 pl-1.5 pr-3 text-right font-bold align-middle whitespace-nowrap">
                                    {t.wfColMaxTier}
                                    {group.maxDiscount > 0 ? ` (-${group.maxDiscount}%)` : ""}
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="text-xs">
                                {/* 3.1 Quotation */}
                                <tr className="bg-slate-50/80 border-b border-slate-200">
                                  <td colSpan={3} className="py-1.5 px-4">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-xs uppercase tracking-wider text-slate-900">
                                        {t.wfGroup1}
                                      </span>
                                      <span className="text-[11px] font-semibold text-slate-800 bg-white border border-slate-300 px-1.5 py-0.5 rounded">
                                        {t.wfGroup1TagA}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                                <tr>
                                  <td className="py-1.5 pl-8 pr-4 font-medium text-slate-800">
                                    {t.wfExportInvoice}
                                  </td>
                                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-slate-900">
                                    ฿{fmt(group.basePrice, 2)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold text-slate-900">
                                    ฿{fmt(group.maxStepPrice, 2)}
                                  </td>
                                </tr>
                                <tr className="text-slate-700">
                                  <td className="py-1.5 pl-8 pr-4 font-medium text-slate-700">-</td>
                                  <td className="py-1.5 px-2 text-right tabular-nums font-medium">-</td>
                                  <td className="py-1.5 px-3 text-right tabular-nums font-medium">-</td>
                                </tr>
                                <tr className="font-bold">
                                  <td className="py-1.5 pl-8 pr-4 text-slate-900">
                                    {t.wfQuotationPrice}
                                  </td>
                                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-900">
                                    ฿{fmt(group.baseCalc.genQuotation, 2)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right tabular-nums text-slate-900">
                                    ฿{fmt(group.maxCalc.genQuotation, 2)}
                                  </td>
                                </tr>

                                {/* 3.2 Contingent Expenses */}
                                <tr className="bg-slate-50/80 border-t border-b border-slate-200">
                                  <td colSpan={3} className="py-1.5 px-4">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-xs uppercase tracking-wider text-slate-900">
                                        {t.wfGroup2}
                                      </span>
                                      <span className="text-[11px] font-semibold text-slate-800 bg-white border border-slate-300 px-1.5 py-0.5 rounded">
                                        {t.wfGroup2Tag}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                                <tr>
                                  <td className="py-1.5 pl-8 pr-4 font-medium text-slate-800">
                                    {t.wfSalesComm} ({group.vRates.commissionRate}%)
                                  </td>
                                  <td className="py-1.5 px-2 text-right tabular-nums text-rose-600 font-semibold">
                                    -฿{fmt(group.baseCalc.genCommission, 2)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right tabular-nums text-rose-600 font-semibold">
                                    -฿{fmt(group.maxCalc.genCommission, 2)}
                                  </td>
                                </tr>
                                <tr className="text-slate-700">
                                  <td className="py-1.5 pl-8 pr-4 font-medium text-slate-700">-</td>
                                  <td className="py-1.5 px-2 text-right tabular-nums font-medium">-</td>
                                  <td className="py-1.5 px-3 text-right tabular-nums font-medium">-</td>
                                </tr>

                                {/* 3.3 Net Return & Profit */}
                                <tr className="bg-slate-50/80 border-t border-b border-slate-200">
                                  <td colSpan={3} className="py-1.5 px-4">
                                    <span className="font-bold text-xs uppercase tracking-wider text-slate-900">
                                      {t.wfGroup3}
                                    </span>
                                  </td>
                                </tr>
                                <tr>
                                  <td className="py-1.5 pl-8 pr-4 font-semibold text-slate-900">
                                    {t.wfNetRevenue}
                                  </td>
                                  <td className="py-1.5 px-2 text-right tabular-nums font-bold text-slate-900">
                                    ฿{fmt(group.baseCalc.genNetRev, 2)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right tabular-nums font-bold text-slate-900">
                                    ฿{fmt(group.maxCalc.genNetRev, 2)}
                                  </td>
                                </tr>
                                <tr className="border-b border-slate-200 text-slate-800">
                                  <td className="py-1.5 pl-8 pr-4 font-medium">
                                    {t.wfLessCost}
                                    {companyCostOverheadPercent > 0
                                      ? ` (+${companyCostOverheadPercent}%)`
                                      : ""}
                                  </td>
                                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold">
                                    -฿{fmt(group.cost, 2)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold">
                                    -฿{fmt(group.cost, 2)}
                                  </td>
                                </tr>

                                {/* Worst Case Net Profit */}
                                <tr className="bg-emerald-50/60">
                                  <td className="py-2 pl-8 pr-4">
                                    <span className="font-bold text-slate-900 block leading-tight">
                                      {t.wfWorstCaseProfit}
                                    </span>
                                    <span className="text-[11px] font-medium text-slate-700 block leading-tight mt-0.5">
                                      {t.wfWorstCaseHintA}
                                    </span>
                                  </td>
                                  <td className="py-2 px-2 text-right tabular-nums">
                                    <span className="font-black text-emerald-700 block">
                                      ฿{fmt(group.baseCalc.genProfitWorst, 2)}
                                    </span>
                                    <span className="text-[11px] font-semibold text-slate-800">
                                      ({fmt(group.baseCalc.genMarginWorstPct, 1)}%)
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-right tabular-nums">
                                    <span className="font-black text-emerald-700 block">
                                      ฿{fmt(group.maxCalc.genProfitWorst, 2)}
                                    </span>
                                    <span className="text-[11px] font-semibold text-slate-800">
                                      ({fmt(group.maxCalc.genMarginWorstPct, 1)}%)
                                    </span>
                                  </td>
                                </tr>

                                {/* Best Case Net Profit */}
                                <tr className="bg-white">
                                  <td className="py-2 pl-8 pr-4">
                                    <span className="font-bold text-slate-900 block leading-tight">
                                      {t.wfBestCaseProfit}
                                    </span>
                                    <span className="text-[11px] font-medium text-slate-700 block leading-tight mt-0.5">
                                      {t.wfBestCaseHintA}
                                    </span>
                                  </td>
                                  <td className="py-2 px-2 text-right tabular-nums">
                                    <span className="font-bold text-slate-900 block">
                                      ฿{fmt(group.baseCalc.genProfitBest, 2)}
                                    </span>
                                    <span className="text-[11px] font-semibold text-slate-700">
                                      ({fmt(group.baseCalc.genMarginBestPct, 1)}%)
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-right tabular-nums">
                                    <span className="font-bold text-slate-900 block">
                                      ฿{fmt(group.maxCalc.genProfitBest, 2)}
                                    </span>
                                    <span className="text-[11px] font-semibold text-slate-700">
                                      ({fmt(group.maxCalc.genMarginBestPct, 1)}%)
                                    </span>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {/* RIGHT COLUMN: MODEL B */}
                          <div className="flex flex-col">
                            <table className="w-full text-left text-xs border-collapse table-fixed">
                              <colgroup>
                                <col className="w-auto" />
                                <col className="w-[78px]" />
                                <col className="w-[106px]" />
                              </colgroup>
                              <thead className="bg-slate-200 text-slate-900 text-xs border-b border-slate-300">
                                <tr className="align-middle">
                                  <th className="py-2 pl-3 pr-1.5 font-bold align-middle">
                                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                                      <span className="px-1.5 py-0.5 rounded bg-white border border-slate-300 text-slate-900 text-[10px] font-extrabold tracking-wider shrink-0 leading-none">
                                        {t.modelBBadge}
                                      </span>
                                      <span className="text-xs font-bold text-slate-900">
                                        {t.modelBTitle}
                                      </span>
                                    </div>
                                  </th>
                                  <th className="py-2 px-1.5 text-right font-bold align-middle whitespace-nowrap">
                                    {t.wfColBase}
                                  </th>
                                  <th className="py-2 pl-1.5 pr-3 text-right font-bold align-middle whitespace-nowrap">
                                    {t.wfColMaxTier}
                                    {group.maxDiscount > 0 ? ` (-${group.maxDiscount}%)` : ""}
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="text-xs">
                                {/* 3.1 Quotation */}
                                <tr className="bg-slate-50/80 border-b border-slate-200">
                                  <td colSpan={3} className="py-1.5 px-4">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-xs uppercase tracking-wider text-slate-900">
                                        {t.wfGroup1}
                                      </span>
                                      <span className="text-[11px] font-semibold text-slate-800 bg-white border border-slate-300 px-1.5 py-0.5 rounded">
                                        {t.wfGroup1TagB}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                                <tr>
                                  <td className="py-1.5 pl-8 pr-4 font-medium text-slate-800">
                                    {t.wfExportInvoice}
                                  </td>
                                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-slate-900">
                                    ฿{fmt(group.basePrice, 2)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold text-slate-900">
                                    ฿{fmt(group.maxStepPrice, 2)}
                                  </td>
                                </tr>
                                <tr>
                                  <td className="py-1.5 pl-8 pr-4 font-medium text-slate-800">
                                    {t.wfDistDiscount} ({group.vRates.distFeeRate}%)
                                  </td>
                                  <td className="py-1.5 px-2 text-right tabular-nums text-rose-600 font-semibold">
                                    -฿{fmt(group.baseCalc.exclDistFee, 2)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right tabular-nums text-rose-600 font-semibold">
                                    -฿{fmt(group.maxCalc.exclDistFee, 2)}
                                  </td>
                                </tr>
                                <tr className="font-bold">
                                  <td className="py-1.5 pl-8 pr-4 text-slate-900">
                                    {t.wfQuotationPrice}
                                  </td>
                                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-900">
                                    ฿{fmt(group.baseCalc.exclQuotation, 2)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right tabular-nums text-slate-900">
                                    ฿{fmt(group.maxCalc.exclQuotation, 2)}
                                  </td>
                                </tr>

                                {/* 3.2 Contingent Expenses */}
                                <tr className="bg-slate-50/80 border-t border-b border-slate-200">
                                  <td colSpan={3} className="py-1.5 px-4">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-xs uppercase tracking-wider text-slate-900">
                                        {t.wfGroup2}
                                      </span>
                                      <span className="text-[11px] font-semibold text-slate-800 bg-white border border-slate-300 px-1.5 py-0.5 rounded">
                                        {t.wfGroup2Tag}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                                <tr>
                                  <td className="py-1.5 pl-8 pr-4 font-medium text-slate-800">
                                    {t.wfMktSupport} ({group.vRates.mktSupportRate}%)
                                  </td>
                                  <td className="py-1.5 px-2 text-right tabular-nums text-rose-600 font-semibold">
                                    -฿{fmt(group.baseCalc.exclMkt, 2)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right tabular-nums text-rose-600 font-semibold">
                                    -฿{fmt(group.maxCalc.exclMkt, 2)}
                                  </td>
                                </tr>
                                <tr>
                                  <td className="py-1.5 pl-8 pr-4 font-medium text-slate-800">
                                    {t.wfRebate} ({group.vRates.rebateRate}%)
                                  </td>
                                  <td className="py-1.5 px-2 text-right tabular-nums text-rose-600 font-semibold">
                                    -฿{fmt(group.baseCalc.exclRebate, 2)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right tabular-nums text-rose-600 font-semibold">
                                    -฿{fmt(group.maxCalc.exclRebate, 2)}
                                  </td>
                                </tr>

                                {/* 3.3 Net Return & Profit */}
                                <tr className="bg-slate-50/80 border-t border-b border-slate-200">
                                  <td colSpan={3} className="py-1.5 px-4">
                                    <span className="font-bold text-xs uppercase tracking-wider text-slate-900">
                                      {t.wfGroup3}
                                    </span>
                                  </td>
                                </tr>
                                <tr>
                                  <td className="py-1.5 pl-8 pr-4 font-semibold text-slate-900">
                                    {t.wfNetRevenue}
                                  </td>
                                  <td className="py-1.5 px-2 text-right tabular-nums font-bold text-slate-900">
                                    ฿{fmt(group.baseCalc.exclNetRev, 2)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right tabular-nums font-bold text-slate-900">
                                    ฿{fmt(group.maxCalc.exclNetRev, 2)}
                                  </td>
                                </tr>
                                <tr className="border-b border-slate-200 text-slate-800">
                                  <td className="py-1.5 pl-8 pr-4 font-medium">
                                    {t.wfLessCost}
                                    {companyCostOverheadPercent > 0
                                      ? ` (+${companyCostOverheadPercent}%)`
                                      : ""}
                                  </td>
                                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold">
                                    -฿{fmt(group.cost, 2)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold">
                                    -฿{fmt(group.cost, 2)}
                                  </td>
                                </tr>

                                {/* Worst Case Net Profit */}
                                <tr className="bg-emerald-50/60">
                                  <td className="py-2 pl-8 pr-4">
                                    <span className="font-bold text-slate-900 block leading-tight">
                                      {t.wfWorstCaseProfit}
                                    </span>
                                    <span className="text-[11px] font-medium text-slate-700 block leading-tight mt-0.5">
                                      {t.wfWorstCaseHintB}
                                    </span>
                                  </td>
                                  <td className="py-2 px-2 text-right tabular-nums">
                                    <span className="font-black text-emerald-700 block">
                                      ฿{fmt(group.baseCalc.exclProfitWorst, 2)}
                                    </span>
                                    <span className="text-[11px] font-semibold text-slate-800">
                                      ({fmt(group.baseCalc.exclMarginWorstPct, 1)}%)
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-right tabular-nums">
                                    <span className="font-black text-emerald-700 block">
                                      ฿{fmt(group.maxCalc.exclProfitWorst, 2)}
                                    </span>
                                    <span className="text-[11px] font-semibold text-slate-800">
                                      ({fmt(group.maxCalc.exclMarginWorstPct, 1)}%)
                                    </span>
                                  </td>
                                </tr>

                                {/* Best Case Net Profit */}
                                <tr className="bg-white">
                                  <td className="py-2 pl-8 pr-4">
                                    <span className="font-bold text-slate-900 block leading-tight">
                                      {t.wfBestCaseProfit}
                                    </span>
                                    <span className="text-[11px] font-medium text-slate-700 block leading-tight mt-0.5">
                                      {t.wfBestCaseHintB}
                                    </span>
                                  </td>
                                  <td className="py-2 px-2 text-right tabular-nums">
                                    <span className="font-bold text-slate-900 block">
                                      ฿{fmt(group.baseCalc.exclProfitBest, 2)}
                                    </span>
                                    <span className="text-[11px] font-semibold text-slate-700">
                                      ({fmt(group.baseCalc.exclMarginBestPct, 1)}%)
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-right tabular-nums">
                                    <span className="font-bold text-slate-900 block">
                                      ฿{fmt(group.maxCalc.exclProfitBest, 2)}
                                    </span>
                                    <span className="text-[11px] font-semibold text-slate-700">
                                      ({fmt(group.maxCalc.exclMarginBestPct, 1)}%)
                                    </span>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Flush Footer Note Inside the Unified Card */}
                        <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex items-center gap-2 text-xs font-medium text-slate-800">
                          <Info className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                          <span>{t.execTakeaway}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
