"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { X, Printer, Check, Copy, ChevronDown } from "lucide-react";
import { ProductOverviewDTO, parsePriceConditions, calculateTierPrice, PriceStepTier } from "@/lib/product/product-dto";
import { CommercialRates, DEFAULT_COMMERCIAL_RATES } from "./ExportPricingSimulation";

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
  const [selectedVariantId, setSelectedVariantId] = useState<string | "all">(
    initialVariantId || "all"
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close custom dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync selected variant when opened or initialVariantId changes
  useEffect(() => {
    if (isOpen) {
      setSelectedVariantId(initialVariantId || "all");
    }
  }, [isOpen, initialVariantId]);

  const variants = product?.variants || [];

  // Exclude variants without cost (cost is required for commercial report)
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
      ? `All Variants (${variantsWithCost.length})`
      : variantsWithCost.find((v) => v.id === selectedVariantId)?.formula || "Selected Variant";

  const handlePrint = () => {
    window.print();
  };

  const fmt = (num: number, decimals: number = 2) =>
    num.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

  // Group displayed variants by distinct Step Price schedule
  const stepPriceGroups = useMemo(() => {
    interface StepPriceGroup {
      key: string;
      basePrice: number;
      tiers: PriceStepTier[];
      formulas: string[];
    }
    const groups: StepPriceGroup[] = [];
    displayedVariants.forEach((v) => {
      const edit = variantEdits[v.id] || {
        price: v.price,
        productCost: v.productCost,
        priceCondition: v.priceCondition || "",
      };
      const tiers = parsePriceConditions(edit.priceCondition);
      const key = `${edit.price}_${JSON.stringify(tiers)}`;
      const formula = v.formula || "Standard";
      const existing = groups.find((g) => g.key === key);
      if (existing) {
        existing.formulas.push(formula);
      } else {
        groups.push({
          key,
          basePrice: edit.price,
          tiers,
          formulas: [formula],
        });
      }
    });
    return groups;
  }, [displayedVariants, variantEdits]);

  // Group displayed variants by distinct Commercial Margin Waterfall configuration
  const waterfallGroups = useMemo(() => {
    interface WaterfallGroup {
      key: string;
      basePrice: number;
      cost: number;
      tiers: PriceStepTier[];
      vRates: CommercialRates;
      formulas: string[];
    }
    const groups: WaterfallGroup[] = [];
    displayedVariants.forEach((v) => {
      const edit = variantEdits[v.id] || {
        price: v.price,
        productCost: v.productCost,
        priceCondition: v.priceCondition || "",
      };
      const cost = edit.productCost ?? 0;
      const tiers = parsePriceConditions(edit.priceCondition);
      const vRates = variantRates?.[v.id] || DEFAULT_COMMERCIAL_RATES;
      const key = `${edit.price}_${cost}_${JSON.stringify(tiers)}_${vRates.commissionRate}_${vRates.distFeeRate}_${vRates.mktSupportRate}_${vRates.rebateRate}`;
      const formula = v.formula || "Standard";

      const existing = groups.find((g) => g.key === key);
      if (existing) {
        existing.formulas.push(formula);
      } else {
        groups.push({
          key,
          basePrice: edit.price,
          cost,
          tiers,
          vRates,
          formulas: [formula],
        });
      }
    });
    return groups;
  }, [displayedVariants, variantEdits, variantRates]);

  const handleCopySummary = () => {
    const summaryText = variants
      .map((v) => {
        const edit = variantEdits[v.id] || { price: v.price, productCost: v.productCost, priceCondition: v.priceCondition || "" };
        const cost = edit.productCost ?? 0;
        const tiers = parsePriceConditions(edit.priceCondition);
        const maxTier = tiers.length > 0 ? tiers[tiers.length - 1] : null;
        const maxDiscount = maxTier?.discountPercent ?? 0;
        const maxStepPrice = calculateTierPrice(edit.price, maxDiscount);

        const vRates = variantRates?.[v.id] || DEFAULT_COMMERCIAL_RATES;
        const genRealized = maxStepPrice * (1 - vRates.commissionRate / 100);
        const genMargin = genRealized - cost;
        const genMarginPct = maxStepPrice > 0 ? (genMargin / maxStepPrice) * 100 : 0;

        const exclQuotation = maxStepPrice * (1 - vRates.distFeeRate / 100);
        const exclRealized = exclQuotation * (1 - (vRates.mktSupportRate + vRates.rebateRate) / 100);
        const exclMargin = exclRealized - cost;
        const exclMarginPct = maxStepPrice > 0 ? (exclMargin / maxStepPrice) * 100 : 0;

        return `${v.formula || "Standard"}: Base ฿${fmt(edit.price)} | Cost ฿${fmt(cost)} | Gen Margin ฿${fmt(genMargin)} (${fmt(genMarginPct, 1)}%) | Excl Margin ฿${fmt(exclMargin)} (${fmt(exclMarginPct, 1)}%)`;
      })
      .join("\n");

    const fullReport = `${productName} (${brand || "No Brand"})\nCategory: ${category || "-"}\nHS Code: ${hsCode || "-"}\n\n${summaryText}`;
    navigator.clipboard.writeText(fullReport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      id="commercial-report-modal-overlay"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
    >
      {/* High-fidelity Print Stylesheet (Crisp Dark Text on Pure White A4 Paper) */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          body {
            background: white !important;
            color: #0f172a !important;
          }
          body * {
            visibility: hidden !important;
          }
          #commercial-report-modal-overlay,
          #commercial-report-modal-overlay * {
            visibility: visible !important;
          }
          #commercial-report-modal-overlay {
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
          #commercial-report-card {
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
          }
          #commercial-report-scroll-body {
            overflow: visible !important;
            max-height: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          #commercial-report-print-container {
            position: static !important;
            width: 100% !important;
            background: white !important;
            color: #0f172a !important;
            padding: 8px !important;
            border: none !important;
          }
          #commercial-report-print-container * {
            color: #0f172a !important;
            background-color: transparent !important;
            border-color: #cbd5e1 !important;
            box-shadow: none !important;
          }
          #commercial-report-print-container th {
            background-color: #f1f5f9 !important;
            color: #1e293b !important;
            border-bottom: 2px solid #94a3b8 !important;
            font-weight: 700 !important;
          }
          #commercial-report-print-container td {
            border-bottom: 1px solid #e2e8f0 !important;
          }
          #commercial-report-print-container .waterfall-box {
            border: 1px solid #cbd5e1 !important;
            background-color: #f8fafc !important;
            page-break-inside: avoid !important;
            margin-bottom: 12px !important;
          }
          #commercial-report-print-container .waterfall-subhead {
            background-color: #e2e8f0 !important;
          }
          .print-hidden {
            display: none !important;
          }
        }
      `}</style>

      {/* Modal Container */}
      <div
        id="commercial-report-card"
        className="relative w-full max-w-4xl bg-[#1C1D1E] border border-[#3E4042] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden my-auto"
      >
        {/* Top Interactive Toolbar (Hidden on print) */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#252627] border-b border-[#353638] shrink-0 print-hidden">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#C7F33C]/10 border border-[#C7F33C]/30 flex items-center justify-center text-[#C7F33C]">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Commercial Pricing & Spec Report
              </h3>
              <p className="text-[11px] text-slate-400">
                Printable price schedule, step tiers, and profit margin analysis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Standard CRM Variant Filter Dropdown */}
            {variants.length > 1 && (
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen((prev) => !prev)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#18191A] border border-[#3E4042] hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
                  title="Filter variants in report"
                >
                  <span className="truncate max-w-[150px]">{selectedVariantLabel}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                      dropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-56 bg-[#252627] border border-[#3E4042] rounded-xl shadow-2xl py-1 z-50 overflow-hidden flex flex-col max-h-[280px]">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedVariantId("all");
                        setDropdownOpen(false);
                      }}
                      className={`flex items-center justify-between px-3 py-2 text-xs font-semibold transition-colors cursor-pointer text-left ${
                        selectedVariantId === "all"
                          ? "bg-[#C7F33C]/10 text-[#C7F33C]"
                          : "text-slate-200 hover:bg-[#303133] hover:text-white"
                      }`}
                    >
                      <span>All Variants ({variantsWithCost.length})</span>
                      {selectedVariantId === "all" && (
                        <Check className="w-3.5 h-3.5 text-[#C7F33C]" />
                      )}
                    </button>
                    <div className="h-px bg-[#353638] my-1 shrink-0" />
                    <div className="overflow-y-auto">
                      {variantsWithCost.map((v) => {
                        const isSel = selectedVariantId === v.id;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => {
                              setSelectedVariantId(v.id);
                              setDropdownOpen(false);
                            }}
                            className={`flex items-center justify-between px-3 py-2 text-xs font-medium transition-colors cursor-pointer text-left w-full ${
                              isSel
                                ? "bg-[#C7F33C]/10 text-[#C7F33C] font-semibold"
                                : "text-slate-300 hover:bg-[#303133] hover:text-white"
                            }`}
                          >
                            <span className="truncate">{v.formula || "Standard"}</span>
                            {isSel && (
                              <Check className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Copy Summary Text */}
            <button
              type="button"
              onClick={handleCopySummary}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-[#3A3B3C] hover:bg-[#4E4F50] rounded-xl transition-colors cursor-pointer"
              title="Copy text summary"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#C7F33C]" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>

            {/* Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-black bg-[#C7F33C] hover:bg-[#d8ff4e] rounded-xl transition-all shadow-sm cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save PDF</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-[#3A3B3C] rounded-lg transition-colors ml-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Report Body */}
        <div id="commercial-report-scroll-body" className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 text-slate-100">
          <div
            id="commercial-report-print-container"
            className="space-y-6 bg-[#18191A] p-6 rounded-xl border border-[#303133]"
          >
            {/* Document Header */}
            <div className="border-b border-[#3E4042] pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#C7F33C] print-header-brand">
                    SB Interlab Commercial Specification
                  </span>
                  <h1 className="text-xl font-bold text-slate-100 mt-0.5">
                    {productName}
                  </h1>
                  {product?.description && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {product.description}
                    </p>
                  )}
                </div>
                <div className="text-right text-[11px] text-slate-400">
                  <p>Date: {new Date().toLocaleDateString("en-GB")}</p>
                  <p className="font-mono mt-0.5">Doc: PRD-{product?.id.slice(-6).toUpperCase()}</p>
                </div>
              </div>

              {/* Product Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-3 border-t border-[#303133] text-xs">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                    Brand
                  </span>
                  <span className="font-medium text-slate-200">
                    {brand || "No Brand"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                    Category
                  </span>
                  <span className="font-medium text-slate-200">
                    {category || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                    HS Code
                  </span>
                  <span className="font-medium text-slate-200">
                    {hsCode || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                    Packaging (Ctn)
                  </span>
                  <span className="font-medium text-slate-200">
                    {product?.cartonQuantity
                      ? `${product.cartonQuantity} pcs / ctn`
                      : "-"}
                  </span>
                </div>
              </div>
            </div>

            {variantsWithCost.length === 0 ? (
              <div className="p-8 text-center bg-[#202122] rounded-xl border border-dashed border-[#4E4F50] space-y-2">
                <p className="text-sm font-semibold text-slate-200">
                  ยังไม่มีข้อมูลต้นทุน (Cost) สำหรับสร้างรายงาน
                </p>
                <p className="text-xs text-slate-400">
                  กรุณากรอกข้อมูล Cost (THB) ของสูตรสินค้าในแท็บ Pricing & Variants เพื่อแสดงรายงานการวิเคราะห์ราคาและส่วนลด
                </p>
              </div>
            ) : (
              <>
                {/* Section 1: All Variants Pricing & Margin Overview (Compared at Max Discount Tier) */}
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  1. Variants Pricing & Margin Comparison (Max Volume Tier)
                </h2>
                <span className="text-[10px] text-slate-400 font-normal">
                  * Evaluated at highest volume discount tier to ensure guaranteed minimum profitability
                </span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-[#3E4042]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#252627] text-slate-300 font-semibold text-[11px] border-b border-[#3E4042]">
                    <tr>
                      <th className="py-2.5 px-3">Formula Variant</th>
                      <th className="py-2.5 px-3 text-right">Export Base</th>
                      <th className="py-2.5 px-3 text-right">Cost</th>
                      <th className="py-2.5 px-3 text-right">
                        <span>General Export (Max Tier)</span>
                        <span className="block text-[9px] text-slate-400 font-normal">After 5% Comm</span>
                      </th>
                      <th className="py-2.5 px-3 text-right">
                        <span>Exclusive Dist. (Max Tier)</span>
                        <span className="block text-[9px] text-slate-400 font-normal">After 10% Deductions</span>
                      </th>
                      <th className="py-2.5 px-3 text-center">Min. Profitability</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#303133]">
                    {displayedVariants.map((v) => {
                      const edit = variantEdits[v.id] || {
                        price: v.price,
                        productCost: v.productCost,
                        priceCondition: v.priceCondition || "",
                      };
                      const basePrice = edit.price;
                      const cost = edit.productCost ?? 0;
                      const tiers = parsePriceConditions(edit.priceCondition);

                      // Highest discount tier (worst-case volume scenario)
                      const maxTier = tiers.length > 0 ? tiers[tiers.length - 1] : null;
                      const maxDiscount = maxTier?.discountPercent ?? 0;
                      const maxStepPrice = calculateTierPrice(basePrice, maxDiscount);

                      const vRates = variantRates?.[v.id] || DEFAULT_COMMERCIAL_RATES;
                      // General Export at max tier
                      const genCommission = (maxStepPrice * vRates.commissionRate) / 100;
                      const genNetRevenue = maxStepPrice - genCommission;
                      const genMargin = genNetRevenue - cost;
                      const genMarginPct = maxStepPrice > 0 ? (genMargin / maxStepPrice) * 100 : 0;

                      // Exclusive Distributor at max tier
                      const exclDeductionsRate = vRates.distFeeRate + vRates.mktSupportRate + vRates.rebateRate;
                      const exclDeductions = (maxStepPrice * exclDeductionsRate) / 100;
                      const exclNetRevenue = maxStepPrice - exclDeductions;
                      const exclMargin = exclNetRevenue - cost;
                      const exclMarginPct = maxStepPrice > 0 ? (exclMargin / maxStepPrice) * 100 : 0;

                      return (
                        <tr key={v.id} className="hover:bg-[#202122]/50">
                          <td className="py-2.5 px-3 font-medium text-slate-100">
                            <div>
                              <span className="font-bold text-slate-100">{v.formula || "Standard"}</span>
                              <span className="text-[10px] text-slate-400 block font-normal">
                                {maxTier
                                  ? `Max Tier (${maxTier.minQuantity}+ ctns: -${maxDiscount}%)`
                                  : "Base Rate (No Tier)"}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-slate-200 tabular-nums">
                            ฿{fmt(basePrice, 2)}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-slate-300">
                            {cost > 0 ? `฿${fmt(cost, 2)}` : <span className="text-slate-500 font-mono">-</span>}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            <span className="font-semibold text-slate-200 block">฿{fmt(genNetRevenue, 2)}</span>
                            <span className={`text-[11px] font-bold block ${genMargin >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {genMargin >= 0 ? "+" : ""}฿{fmt(genMargin, 2)} ({fmt(genMarginPct, 1)}%)
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            <span className="font-semibold text-slate-200 block">฿{fmt(exclNetRevenue, 2)}</span>
                            <span className={`text-[11px] font-bold block ${exclMargin >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {exclMargin >= 0 ? "+" : ""}฿{fmt(exclMargin, 2)} ({fmt(exclMarginPct, 1)}%)
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {cost === 0 ? (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                                No Cost Data
                              </span>
                            ) : exclMargin > 0 ? (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                +{fmt(exclMarginPct, 1)}% Profitable
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                {fmt(exclMarginPct, 1)}% Negative
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 2: Step Price Schedule (Volume Tier Discounts) - Grouped by Distinct Step Pricing */}
            <div className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  2. Step Price Schedule (Volume Tier Discounts)
                </h2>
                <span className="text-[10px] text-slate-400 font-normal">
                  * Grouped by unique tier structures to eliminate repetitive tables for multiple formulas
                </span>
              </div>

              <div className="space-y-4">
                {stepPriceGroups.map((group, gIdx) => {
                  return (
                    <div
                      key={group.key || gIdx}
                      className="p-4 bg-[#202122] rounded-xl border border-[#3E4042]/80 space-y-3 waterfall-box"
                    >
                      {/* Group Header: Formulas Applied & Base Price */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#353638] pb-2.5">
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold text-slate-400 block">
                            Applied to ({group.formulas.length} Formulas):
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {group.formulas.map((formula, fIdx) => (
                              <span
                                key={fIdx}
                                className="px-2 py-0.5 rounded-md bg-[#2B2C2E] text-slate-200 border border-[#3E4042] text-[11px] font-medium"
                              >
                                {formula}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                            Base Export Price
                          </span>
                          <span className="text-sm font-bold text-slate-100 tabular-nums">
                            ฿{fmt(group.basePrice, 2)}
                          </span>
                        </div>
                      </div>

                      {/* Tiers Table */}
                      {group.tiers.length === 0 ? (
                        <div className="p-3 bg-[#18191A] rounded-lg border border-[#353638] text-xs text-slate-400 text-center">
                          No Volume Tier Discounts configured for this group (Standard export price applies).
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-[#353638]">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-[#252627] text-slate-300 font-semibold text-[11px] border-b border-[#353638]">
                              <tr>
                                <th className="py-2 px-3">Volume Tier</th>
                                <th className="py-2 px-3">Cartons Range</th>
                                <th className="py-2 px-3 text-right">Discount (%)</th>
                                <th className="py-2 px-3 text-right">Net Unit Price (THB)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#303133]">
                              {group.tiers.map((t, tIdx) => {
                                const isLast = tIdx === group.tiers.length - 1;
                                const tierPrice = calculateTierPrice(group.basePrice, t.discountPercent);
                                return (
                                  <tr key={tIdx} className="hover:bg-[#18191A]/50">
                                    <td className="py-2 px-3 font-semibold text-slate-300">
                                      Tier {tIdx + 1}
                                    </td>
                                    <td className="py-2 px-3 text-slate-200 font-medium">
                                      {t.minQuantity} - {isLast ? "+ more" : t.maxQuantity} ctns
                                    </td>
                                    <td className="py-2 px-3 text-right tabular-nums text-slate-300">
                                      {t.discountPercent > 0 ? (
                                        <span className="text-rose-400 font-semibold">-{t.discountPercent}%</span>
                                      ) : (
                                        <span className="text-slate-400">0% (Base)</span>
                                      )}
                                    </td>
                                    <td className="py-2 px-3 text-right tabular-nums font-bold text-slate-100">
                                      ฿{fmt(tierPrice, 2)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Commercial Margin Waterfall Analysis - Grouped by Distinct Financials */}
            <div className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  3. Commercial Margin Waterfall Analysis
                </h2>
                <span className="text-[10px] text-slate-400 font-normal">
                  * Grouped by distinct pricing, cost, and deduction structures with calm, eye-friendly presentation
                </span>
              </div>

              <div className="space-y-6">
                {waterfallGroups.map((group, gIdx) => {
                  const basePrice = group.basePrice;
                  const cost = group.cost;
                  const tiers = group.tiers;
                  const vRates = group.vRates;

                  // Default active tier: highest volume tier
                  const activeTier = tiers.length > 0 ? tiers[tiers.length - 1] : null;
                  const stepDiscount = activeTier?.discountPercent ?? 0;
                  const stepPrice = calculateTierPrice(basePrice, stepDiscount);

                  // General Export calculations
                  const genCommissionBase = (basePrice * vRates.commissionRate) / 100;
                  const genCommissionStep = (stepPrice * vRates.commissionRate) / 100;
                  const genQuotationBase = basePrice;
                  const genQuotationStep = stepPrice;
                  const genSubtotalBase = basePrice - genCommissionBase;
                  const genSubtotalStep = stepPrice - genCommissionStep;
                  const genProfitBase = genSubtotalBase - cost;
                  const genProfitStep = genSubtotalStep - cost;
                  const genMarginPctBase = basePrice > 0 ? (genProfitBase / basePrice) * 100 : 0;
                  const genMarginPctStep = stepPrice > 0 ? (genProfitStep / stepPrice) * 100 : 0;

                  // Exclusive Distributor calculations
                  const exclDistFeeBase = (basePrice * vRates.distFeeRate) / 100;
                  const exclDistFeeStep = (stepPrice * vRates.distFeeRate) / 100;
                  const exclQuotationBase = basePrice - exclDistFeeBase;
                  const exclQuotationStep = stepPrice - exclDistFeeStep;
                  const exclMktBase = (exclQuotationBase * vRates.mktSupportRate) / 100;
                  const exclMktStep = (exclQuotationStep * vRates.mktSupportRate) / 100;
                  const exclRebateBase = (exclQuotationBase * vRates.rebateRate) / 100;
                  const exclRebateStep = (exclQuotationStep * vRates.rebateRate) / 100;
                  const exclSubtotalBase = exclQuotationBase - exclMktBase - exclRebateBase;
                  const exclSubtotalStep = exclQuotationStep - exclMktStep - exclRebateStep;
                  const exclProfitBase = exclSubtotalBase - cost;
                  const exclProfitStep = exclSubtotalStep - cost;
                  const exclMarginPctBase = basePrice > 0 ? (exclProfitBase / basePrice) * 100 : 0;
                  const exclMarginPctStep = stepPrice > 0 ? (exclProfitStep / stepPrice) * 100 : 0;

                  return (
                    <div
                      key={group.key || gIdx}
                      className="p-4 bg-[#202122] rounded-xl border border-[#3E4042]/80 space-y-4 waterfall-box"
                    >
                      {/* Group Header: Formulas & Financial Profile */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#353638] pb-2.5">
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold text-slate-400 block">
                            Applied to ({group.formulas.length} Formulas):
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {group.formulas.map((formula, fIdx) => (
                              <span
                                key={fIdx}
                                className="px-2 py-0.5 rounded-md bg-[#2B2C2E] text-slate-200 border border-[#3E4042] text-[11px] font-medium"
                              >
                                {formula}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-semibold text-slate-200">
                            Base: ฿{fmt(basePrice, 2)} | Cost: {cost > 0 ? `฿${fmt(cost, 2)}` : "-"}
                          </span>
                          {activeTier && (
                            <span className="text-[10px] text-slate-400 block">
                              Waterfall at Max Tier ({activeTier.minQuantity}+ ctns: -{stepDiscount}%)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Comparison Tables: General Export vs Exclusive Distributor */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
                        {/* Table A: General Export */}
                        <div className="rounded-lg bg-[#18191A] border border-[#353638] overflow-hidden">
                          <div className="px-3 py-2 bg-[#252627] border-b border-[#353638] flex items-center justify-between font-bold text-[11px] text-slate-200 waterfall-subhead">
                            <span>General Export Price</span>
                            <div className="flex gap-4 text-right font-semibold text-slate-400">
                              <span className="w-16">General</span>
                              <span className="w-16">Step</span>
                            </div>
                          </div>
                          <div className="p-3 space-y-1.5 text-slate-300">
                            <div className="flex justify-between">
                              <span>Export Price</span>
                              <div className="flex gap-4 text-right tabular-nums text-slate-200">
                                <span className="w-16">฿{fmt(basePrice, 2)}</span>
                                <span className="w-16">฿{fmt(stepPrice, 2)}</span>
                              </div>
                            </div>
                            <div className="flex justify-between font-semibold text-slate-100 pt-1 border-t border-[#2F3032]">
                              <span className="font-bold text-slate-100">Quotation Price</span>
                              <div className="flex gap-4 text-right tabular-nums text-[#C7F33C] font-bold">
                                <span className="w-16">฿{fmt(genQuotationBase, 2)}</span>
                                <span className="w-16">฿{fmt(genQuotationStep, 2)}</span>
                              </div>
                            </div>
                            <div className="flex justify-between text-slate-400 pt-1">
                              <span>Commission ({vRates.commissionRate}%)</span>
                              <div className="flex gap-4 text-right tabular-nums text-rose-300/80">
                                <span className="w-16">-฿{fmt(genCommissionBase, 2)}</span>
                                <span className="w-16">-฿{fmt(genCommissionStep, 2)}</span>
                              </div>
                            </div>
                            <div className="flex justify-between font-semibold text-slate-100 pt-1 border-t border-[#2F3032]">
                              <span>Net Revenue</span>
                              <div className="flex gap-4 text-right tabular-nums text-slate-100">
                                <span className="w-16">฿{fmt(genSubtotalBase, 2)}</span>
                                <span className="w-16">฿{fmt(genSubtotalStep, 2)}</span>
                              </div>
                            </div>
                            <div className="flex justify-between text-slate-400">
                              <span>Product Cost</span>
                              <div className="flex gap-4 text-right tabular-nums text-slate-300">
                                <span className="w-16">{cost > 0 ? `฿${fmt(cost, 2)}` : "-"}</span>
                                <span className="w-16">{cost > 0 ? `฿${fmt(cost, 2)}` : "-"}</span>
                              </div>
                            </div>
                            <div className="flex justify-between font-bold pt-1.5 border-t border-[#2F3032]">
                              <span className={genProfitStep >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                Profit Margin (THB)
                              </span>
                              <div className="flex gap-4 text-right tabular-nums">
                                <span className={`w-16 ${genProfitBase >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                  ฿{fmt(genProfitBase, 2)}
                                </span>
                                <span className={`w-16 ${genProfitStep >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                  ฿{fmt(genProfitStep, 2)}
                                </span>
                              </div>
                            </div>
                            <div className="flex justify-between font-bold pt-0.5">
                              <span className={genMarginPctStep >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                Profit Margin (%)
                              </span>
                              <div className="flex gap-4 text-right tabular-nums">
                                <span className={`w-16 ${genMarginPctBase >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                  {fmt(genMarginPctBase, 1)}%
                                </span>
                                <span className={`w-16 ${genMarginPctStep >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                  {fmt(genMarginPctStep, 1)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Table B: Exclusive Distributor */}
                        <div className="rounded-lg bg-[#18191A] border border-[#353638] overflow-hidden">
                          <div className="px-3 py-2 bg-[#252627] border-b border-[#353638] flex items-center justify-between font-bold text-[11px] text-slate-200 waterfall-subhead">
                            <span>Exclusive Distributor</span>
                            <div className="flex gap-4 text-right font-semibold text-slate-400">
                              <span className="w-16">General</span>
                              <span className="w-16">Step</span>
                            </div>
                          </div>
                          <div className="p-3 space-y-1.5 text-slate-300">
                            <div className="flex justify-between">
                              <span>Export Price</span>
                              <div className="flex gap-4 text-right tabular-nums text-slate-200">
                                <span className="w-16">฿{fmt(basePrice, 2)}</span>
                                <span className="w-16">฿{fmt(stepPrice, 2)}</span>
                              </div>
                            </div>
                            <div className="flex justify-between text-slate-400">
                              <span>Distribution Fee ({vRates.distFeeRate}%)</span>
                              <div className="flex gap-4 text-right tabular-nums text-rose-300/80">
                                <span className="w-16">-฿{fmt(exclDistFeeBase, 2)}</span>
                                <span className="w-16">-฿{fmt(exclDistFeeStep, 2)}</span>
                              </div>
                            </div>
                            <div className="flex justify-between font-semibold text-slate-100 pt-1 border-t border-[#2F3032]">
                              <span className="font-bold text-slate-100">Quotation Price</span>
                              <div className="flex gap-4 text-right tabular-nums text-[#C7F33C] font-bold">
                                <span className="w-16">฿{fmt(exclQuotationBase, 2)}</span>
                                <span className="w-16">฿{fmt(exclQuotationStep, 2)}</span>
                              </div>
                            </div>
                            <div className="flex justify-between text-slate-400 pt-1">
                              <span>Marketing Support ({vRates.mktSupportRate}%)</span>
                              <div className="flex gap-4 text-right tabular-nums text-rose-300/80">
                                <span className="w-16">-฿{fmt(exclMktBase, 2)}</span>
                                <span className="w-16">-฿{fmt(exclMktStep, 2)}</span>
                              </div>
                            </div>
                            <div className="flex justify-between text-slate-400">
                              <span>Annual Rebate ({vRates.rebateRate}%)</span>
                              <div className="flex gap-4 text-right tabular-nums text-rose-300/80">
                                <span className="w-16">-฿{fmt(exclRebateBase, 2)}</span>
                                <span className="w-16">-฿{fmt(exclRebateStep, 2)}</span>
                              </div>
                            </div>
                            <div className="flex justify-between font-semibold text-slate-100 pt-1 border-t border-[#2F3032]">
                              <span>Net Revenue</span>
                              <div className="flex gap-4 text-right tabular-nums text-slate-100">
                                <span className="w-16">฿{fmt(exclSubtotalBase, 2)}</span>
                                <span className="w-16">฿{fmt(exclSubtotalStep, 2)}</span>
                              </div>
                            </div>
                            <div className="flex justify-between text-slate-400">
                              <span>Product Cost</span>
                              <div className="flex gap-4 text-right tabular-nums text-slate-300">
                                <span className="w-16">{cost > 0 ? `฿${fmt(cost, 2)}` : "-"}</span>
                                <span className="w-16">{cost > 0 ? `฿${fmt(cost, 2)}` : "-"}</span>
                              </div>
                            </div>
                            <div className="flex justify-between font-bold pt-1.5 border-t border-[#2F3032]">
                              <span className={exclProfitStep >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                Profit Margin (THB)
                              </span>
                              <div className="flex gap-4 text-right tabular-nums">
                                <span className={`w-16 ${exclProfitBase >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                  ฿{fmt(exclProfitBase, 2)}
                                </span>
                                <span className={`w-16 ${exclProfitStep >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                  ฿{fmt(exclProfitStep, 2)}
                                </span>
                              </div>
                            </div>
                            <div className="flex justify-between font-bold pt-0.5">
                              <span className={exclMarginPctStep >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                Profit Margin (%)
                              </span>
                              <div className="flex gap-4 text-right tabular-nums">
                                <span className={`w-16 ${exclMarginPctBase >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                  {fmt(exclMarginPctBase, 1)}%
                                </span>
                                <span className={`w-16 ${exclMarginPctStep >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                  {fmt(exclMarginPctStep, 1)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
