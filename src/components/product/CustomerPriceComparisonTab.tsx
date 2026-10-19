"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Building2,
} from "lucide-react";
import { ProductVariantDTO, calculateTierPrice } from "@/lib/product/product-dto";
import { CommercialRates } from "@/lib/product/use-company-cost-overhead";
import { getCompanies } from "@/lib/actions/company";

export interface CustomerPriceComparisonTabProps {
  variants: ProductVariantDTO[];
  variantEdits: Record<
    string,
    {
      price: number;
      productCost: number | null;
      priceCondition: string;
      imageUrl?: string | null;
    }
  >;
  customerPriceEdits: Record<string, Record<string, number>>;
  onCustomerPriceChange: (variantId: string, companyId: string, price: number) => void;
  commercialRates: CommercialRates;
  companyCostOverheadPercent: number;
  calculateEffectiveCost: (baseCost: number | null | undefined) => number;
}

type ViewScenario = "all" | "general_export" | "exclusive";
type StatusFilter = "all" | "loss" | "profit";

interface CompanyOption {
  id: string;
  name: string;
  displayName: string | null;
}

export function CustomerPriceComparisonTab({
  variants,
  variantEdits,
  customerPriceEdits,
  onCustomerPriceChange,
  commercialRates,
  companyCostOverheadPercent,
  calculateEffectiveCost,
}: CustomerPriceComparisonTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewScenario, setViewScenario] = useState<ViewScenario>("all");

  // Available companies for "+ Add Customer Rate"
  const [allCompanies, setAllCompanies] = useState<CompanyOption[]>([]);
  const [addingVariantId, setAddingVariantId] = useState<string | null>(null);
  const [companySearch, setCompanySearch] = useState("");

  useEffect(() => {
    let active = true;
    getCompanies()
      .then((res) => {
        if (active && res) {
          setAllCompanies(res);
        }
      })
      .catch((err) => console.error("Failed to load companies:", err));
    return () => {
      active = false;
    };
  }, []);

  const fmt = (num: number, decimals: number = 2) =>
    num.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

  // Calculate detailed financial scenarios for a customer's selling price
  const calculateScenario = useCallback(
    (sellingPrice: number, baseCost: number) => {
      const hasCost = baseCost > 0;
      const effectiveCost = hasCost ? calculateEffectiveCost(baseCost) : 0;

      if (sellingPrice <= 0 || !hasCost || effectiveCost <= 0) {
        return {
          hasCost,
          effectiveCost,
          genNetRev: sellingPrice * (1 - commercialRates.commissionRate / 100),
          genProfit: 0,
          genMarginPct: 0,
          exclStep1Net: calculateTierPrice(sellingPrice, commercialRates.distFeeRate),
          exclStep1Profit: 0,
          exclStep1MarginPct: 0,
          exclStep2Net: 0,
          exclStep2Profit: 0,
          exclStep2MarginPct: 0,
          exclStep3Net: 0,
          exclStep3Profit: 0,
          exclStep3MarginPct: 0,
          genBreakEven: 0,
          exclBreakEven: 0,
          isGenLoss: false,
          isExclLoss: false,
          isAnyLoss: false,
        };
      }

    // 1. General Export Model (Deducts Recommended Commission, default 5%)
    const genCommission = (sellingPrice * commercialRates.commissionRate) / 100;
    const genNetRev = sellingPrice - genCommission;
    const genProfit = genNetRev - effectiveCost;
    const genMarginPct = (genProfit / sellingPrice) * 100;
    const isGenLoss = genProfit < -0.005;

    // 2. Exclusive Distributor Model (3 Cumulative Steps)
    // Step 1: Distribution Fee (default 5%) deducted directly on customer invoice (2-decimal invoice price)
    const exclStep1Net = calculateTierPrice(sellingPrice, commercialRates.distFeeRate);
    const exclStep1Profit = exclStep1Net - effectiveCost;
    const exclStep1MarginPct = exclStep1Net > 0 ? (exclStep1Profit / exclStep1Net) * 100 : 0;

    // Step 2: MKT Support (default 2% of quotation after DisFee)
    const exclMkt = (exclStep1Net * commercialRates.mktSupportRate) / 100;
    const exclStep2Net = exclStep1Net - exclMkt;
    const exclStep2Profit = exclStep2Net - effectiveCost;
    const exclStep2MarginPct = exclStep1Net > 0 ? (exclStep2Profit / exclStep1Net) * 100 : 0;

    // Step 3: Rebate (default 3% of quotation after DisFee)
    const exclRebate = (exclStep1Net * commercialRates.rebateRate) / 100;
    const exclStep3Net = exclStep1Net - exclMkt - exclRebate;
    const exclStep3Profit = exclStep3Net - effectiveCost;
    const exclStep3MarginPct = exclStep1Net > 0 ? (exclStep3Profit / exclStep1Net) * 100 : 0;
    const isExclLoss = exclStep3Profit < -0.005;

    // Break-even reference prices
    const comFactor = 1 - commercialRates.commissionRate / 100;
    const genBreakEven = comFactor > 0 ? effectiveCost / comFactor : 0;

    const exclFactor =
      (1 - commercialRates.distFeeRate / 100) *
      (1 - (commercialRates.mktSupportRate + commercialRates.rebateRate) / 100);
    const exclBreakEven = exclFactor > 0 ? effectiveCost / exclFactor : 0;

    return {
      hasCost: true,
      effectiveCost,
      genNetRev,
      genProfit,
      genMarginPct,
      exclStep1Net,
      exclStep1Profit,
      exclStep1MarginPct,
      exclStep2Net,
      exclStep2Profit,
      exclStep2MarginPct,
      exclStep3Net,
      exclStep3Profit,
      exclStep3MarginPct,
      genBreakEven,
      exclBreakEven,
      isGenLoss,
      isExclLoss,
      isAnyLoss: isGenLoss || isExclLoss,
    };
  }, [calculateEffectiveCost, commercialRates]);

  // Build merged customer prices list for each variant (existing + newly added via edits)
  const variantsData = useMemo(() => {
    return variants.map((v) => {
      const liveBaseCost = variantEdits[v.id]?.productCost ?? v.productCost ?? 0;
      const liveStandardPrice = variantEdits[v.id]?.price ?? v.price ?? 0;
      const liveEffectiveCost =
        liveBaseCost > 0 ? calculateEffectiveCost(liveBaseCost) : 0;

      // Existing prices from DB
      const pricesMap = new Map<
        string,
        { companyId: string; companyName: string; originalPrice: number }
      >();

      v.customPrices.forEach((cp) => {
        pricesMap.set(cp.companyId, {
          companyId: cp.companyId,
          companyName: cp.companyName,
          originalPrice: cp.price,
        });
      });

      // Include any newly added companies from customerPriceEdits
      const editsForV = customerPriceEdits[v.id] || {};
      for (const [compId, p] of Object.entries(editsForV)) {
        if (!pricesMap.has(compId)) {
          const compInfo = allCompanies.find((c) => c.id === compId);
          const cName = compInfo?.displayName || compInfo?.name || "Customer";
          pricesMap.set(compId, {
            companyId: compId,
            companyName: cName,
            originalPrice: p,
          });
        }
      }

      // Convert to array and calculate metrics
      const items = Array.from(pricesMap.values()).map((item) => {
        const currentPrice = editsForV[item.companyId] ?? item.originalPrice;
        const metrics = calculateScenario(currentPrice, liveBaseCost);
        const priceDiff = currentPrice - liveStandardPrice;
        const priceDiffPct =
          liveStandardPrice > 0 ? (priceDiff / liveStandardPrice) * 100 : 0;
        const isModified =
          editsForV[item.companyId] !== undefined &&
          editsForV[item.companyId] !== item.originalPrice;

        return {
          ...item,
          currentPrice,
          priceDiff,
          priceDiffPct,
          isModified,
          metrics,
        };
      });

      // Break-even reference prices for the variant
      const comFactor = 1 - commercialRates.commissionRate / 100;
      const genBreakEven =
        comFactor > 0 && liveEffectiveCost > 0 ? liveEffectiveCost / comFactor : 0;

      const exclFactor =
        (1 - commercialRates.distFeeRate / 100) *
        (1 - (commercialRates.mktSupportRate + commercialRates.rebateRate) / 100);
      const exclBreakEven =
        exclFactor > 0 && liveEffectiveCost > 0 ? liveEffectiveCost / exclFactor : 0;

      return {
        variant: v,
        liveBaseCost,
        liveStandardPrice,
        liveEffectiveCost,
        genBreakEven,
        exclBreakEven,
        items,
      };
    });
  }, [
    variants,
    variantEdits,
    customerPriceEdits,
    allCompanies,
    calculateScenario,
    commercialRates,
    calculateEffectiveCost,
  ]);

  // Overall counts for summary pills
  const { totalCustomerRows, totalLossRows, totalProfitRows } = useMemo(() => {
    let total = 0;
    let loss = 0;
    let profit = 0;

    for (const vd of variantsData) {
      for (const item of vd.items) {
        total++;
        if (item.metrics.hasCost) {
          if (item.metrics.isAnyLoss) {
            loss++;
          } else {
            profit++;
          }
        }
      }
    }

    return {
      totalCustomerRows: total,
      totalLossRows: loss,
      totalProfitRows: profit,
    };
  }, [variantsData]);

  return (
    <div className="flex flex-col gap-5 text-slate-100 pb-10">
      {/* Top Controls: Search, Status Filter & View Scenario */}
      <div className="bg-[#2D2F31] border border-[#3A3B3C] rounded-2xl p-3.5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Search box */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer company name..."
              className="w-full bg-[#1E1F21] border border-[#3A3B3C] hover:border-slate-500 rounded-xl pl-9 pr-3.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-[#C7F33C] transition-colors"
            />
          </div>

          {/* Scenario View Switcher */}
          <div className="flex items-center bg-[#1E1F21] p-1 rounded-xl border border-[#3A3B3C] text-[11px] font-semibold shrink-0">
            <button
              type="button"
              onClick={() => setViewScenario("all")}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                viewScenario === "all"
                  ? "bg-[#3A3B3C] text-white font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Side-by-Side
            </button>
            <button
              type="button"
              onClick={() => setViewScenario("general_export")}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                viewScenario === "general_export"
                  ? "bg-[#3A3B3C] text-[#C7F33C] font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              General Export
            </button>
            <button
              type="button"
              onClick={() => setViewScenario("exclusive")}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                viewScenario === "exclusive"
                  ? "bg-[#3A3B3C] text-[#FDBA74] font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Exclusive
            </button>
          </div>
        </div>

        {/* Second Line: Filter Pills and Rate Context Info */}
        <div className="flex items-center justify-between gap-3 text-xs flex-wrap border-t border-[#3A3B3C]/60 pt-2.5">
          {/* Quick Filter Pills */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === "all"
                  ? "bg-[#3A3B3C] text-white border border-slate-500"
                  : "bg-[#1E1F21] text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
            >
              <span>All Customers</span>
              <span className="px-1.5 py-0.2 rounded-full bg-[#18191A] text-[10px] text-slate-300">
                {totalCustomerRows}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("loss")}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === "loss"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/60"
                  : "bg-[#1E1F21] text-rose-400/80 hover:text-rose-300 border border-transparent"
              }`}
            >
              <AlertCircle className="w-3 h-3 text-rose-400" />
              <span>Loss Only</span>
              <span className="px-1.5 py-0.2 rounded-full bg-rose-950/60 text-[10px] text-rose-300">
                {totalLossRows}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("profit")}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === "profit"
                  ? "bg-[#C7F33C]/20 text-[#C7F33C] border border-[#C7F33C]/60"
                  : "bg-[#1E1F21] text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
            >
              <CheckCircle2 className="w-3 h-3 text-[#C7F33C]" />
              <span>Profitable</span>
              <span className="px-1.5 py-0.2 rounded-full bg-[#18191A] text-[10px] text-[#C7F33C]">
                {totalProfitRows}
              </span>
            </button>
          </div>

          {/* Applied Commercial Assumptions badge */}
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <span>Overhead:</span>
              <strong className="text-[#C7F33C]">+{companyCostOverheadPercent}%</strong>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <span>Rec Com:</span>
              <strong className="text-slate-200">{commercialRates.commissionRate}%</strong>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <span>Excl:</span>
              <strong className="text-slate-200">
                DisFee {commercialRates.distFeeRate}% + MKT {commercialRates.mktSupportRate}% + Rebate {commercialRates.rebateRate}%
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* List of Variants & Their Customer Price Comparison Tables */}
      {variantsData.map(({ variant: v, liveBaseCost, liveStandardPrice, liveEffectiveCost, genBreakEven, exclBreakEven, items }) => {
        // Filter by customer name search and status
        const filteredItems = items.filter((item) => {
          const matchQuery =
            !searchQuery ||
            item.companyName.toLowerCase().includes(searchQuery.toLowerCase());
          if (!matchQuery) return false;

          if (statusFilter === "loss") {
            return item.metrics.hasCost && item.metrics.isAnyLoss;
          }
          if (statusFilter === "profit") {
            return item.metrics.hasCost && !item.metrics.isAnyLoss;
          }
          return true;
        });

        // Count stats for this variant
        const variantLossCount = items.filter((it) => it.metrics.hasCost && it.metrics.isAnyLoss).length;
        const variantProfitCount = items.filter((it) => it.metrics.hasCost && !it.metrics.isAnyLoss).length;

        // Skip rendering variant if search query has no match in this variant
        if (searchQuery && filteredItems.length === 0 && addingVariantId !== v.id) {
          return null;
        }

        // Available companies not yet added to this variant
        const addedCompanyIds = new Set(items.map((it) => it.companyId));
        const availableToAdd = allCompanies.filter(
          (c) =>
            !addedCompanyIds.has(c.id) &&
            (!companySearch ||
              (c.displayName || c.name)
                .toLowerCase()
                .includes(companySearch.toLowerCase()))
        );

        return (
          <div
            key={v.id}
            className="bg-[#2D2F31] border border-[#3A3B3C] rounded-2xl overflow-hidden shadow-sm"
          >
            {/* Variant Card Header & Benchmark Bar */}
            <div className="p-4 bg-[#252728] border-b border-[#3A3B3C] space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-slate-100">
                      {v.fullName || v.formula}
                    </h4>
                    {v.sku && (
                      <span className="px-2 py-0.5 rounded-md bg-[#1C1C1D] text-slate-400 font-mono text-[11px] border border-[#3A3B3C]">
                        {v.sku}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-md bg-[#1C1C1D] text-slate-300 text-[11px] font-medium border border-[#3A3B3C]">
                      {items.length} {items.length === 1 ? "Customer" : "Customers"}
                    </span>
                    {variantLossCount > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[11px] font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-rose-400" />
                        {variantLossCount} at risk
                      </span>
                    )}
                    {variantProfitCount > 0 && variantLossCount === 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-[#C7F33C]/10 text-[#C7F33C] border border-[#C7F33C]/20 text-[11px] font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        All Profitable
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Standard Base Price:{" "}
                    <strong className="text-slate-200">฿{fmt(liveStandardPrice)}</strong>
                  </p>
                </div>

                {/* Quick Add Button */}
                <button
                  type="button"
                  onClick={() => {
                    setAddingVariantId(addingVariantId === v.id ? null : v.id);
                    setCompanySearch("");
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3A3B3C] hover:bg-[#4E4F50] text-[#C7F33C] hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Customer Rate</span>
                </button>
              </div>

              {/* Benchmark Summary Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#3A3B3C]/60 text-xs">
                {/* Cost Box */}
                <div className="bg-[#1C1C1D] p-2.5 rounded-xl border border-[#3A3B3C]">
                  <span className="text-[10.5px] font-medium text-slate-400 block">
                    Base Cost
                  </span>
                  <span className="text-xs font-bold text-slate-200">
                    {liveBaseCost > 0 ? `฿${fmt(liveBaseCost)}` : "Not set"}
                  </span>
                </div>

                {/* Effective Cost Box */}
                <div className="bg-[#1C1C1D] p-2.5 rounded-xl border border-[#3A3B3C]">
                  <span className="text-[10.5px] font-medium text-slate-400 block">
                    Effective Cost (+{companyCostOverheadPercent}%)
                  </span>
                  <span className="text-xs font-bold text-[#C7F33C]">
                    {liveEffectiveCost > 0 ? `฿${fmt(liveEffectiveCost)}` : "—"}
                  </span>
                </div>

                {/* General Export Break-Even */}
                <div className="bg-[#1C1C1D] p-2.5 rounded-xl border border-[#3A3B3C]">
                  <span className="text-[10.5px] font-medium text-slate-400 block">
                    Break-Even (Gen Export)
                  </span>
                  <span className="text-xs font-bold text-slate-200">
                    {genBreakEven > 0 ? `≥ ฿${fmt(genBreakEven)}` : "—"}
                  </span>
                </div>

                {/* Exclusive Break-Even */}
                <div className="bg-[#1C1C1D] p-2.5 rounded-xl border border-[#3A3B3C]">
                  <span className="text-[10.5px] font-medium text-slate-400 block">
                    Break-Even (Exclusive)
                  </span>
                  <span className="text-xs font-bold text-[#FDBA74]">
                    {exclBreakEven > 0 ? `≥ ฿${fmt(exclBreakEven)}` : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Add Company Dropdown Picker (If Active) */}
            {addingVariantId === v.id && (
              <div className="p-3.5 bg-[#1F2022] border-b border-[#3A3B3C] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#C7F33C] flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    Select Account to Set Customer Price:
                  </span>
                  <button
                    type="button"
                    onClick={() => setAddingVariantId(null)}
                    className="text-slate-400 hover:text-slate-200 text-xs"
                  >
                    Cancel
                  </button>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={companySearch}
                    onChange={(e) => setCompanySearch(e.target.value)}
                    placeholder="Search account name to add..."
                    className="w-full bg-[#18191A] border border-[#3A3B3C] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-[#C7F33C]"
                    autoFocus
                  />
                </div>

                <div className="max-h-40 overflow-y-auto divide-y divide-[#2A2B2D] border border-[#3A3B3C] rounded-lg bg-[#18191A]">
                  {availableToAdd.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-500">
                      No matching accounts found
                    </div>
                  ) : (
                    availableToAdd.map((comp) => (
                      <button
                        key={comp.id}
                        type="button"
                        onClick={() => {
                          onCustomerPriceChange(
                            v.id,
                            comp.id,
                            liveStandardPrice > 0 ? liveStandardPrice : 0
                          );
                          setAddingVariantId(null);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-[#2A2B2D] hover:text-[#C7F33C] transition-colors flex items-center justify-between cursor-pointer"
                      >
                        <span className="font-medium">
                          {comp.displayName || comp.name}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Click to add (default ฿{fmt(liveStandardPrice)})
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Comparison Table */}
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                {items.length === 0
                  ? "No customer specific rates configured for this variant yet."
                  : "No customers match the current filter criteria."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#232426] border-b border-[#3A3B3C] text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                      <th className="py-2.5 px-3">Customer Account</th>
                      <th className="py-2.5 px-3 text-right">Selling Price</th>
                      <th className="py-2.5 px-3 text-right">vs Standard</th>

                      {(viewScenario === "all" || viewScenario === "general_export") && (
                        <th className="py-2.5 px-3 text-right border-l border-[#3A3B3C]/60 text-slate-300">
                          <div>General Export</div>
                          <span className="text-[10px] font-normal text-slate-400 lowercase">
                            (rec com {commercialRates.commissionRate}%)
                          </span>
                        </th>
                      )}

                      {(viewScenario === "all" || viewScenario === "exclusive") && (
                        <th className="py-2.5 px-3 text-right border-l border-[#3A3B3C]/60 text-[#FDBA74]">
                          <div>Exclusive Step 3</div>
                          <span className="text-[10px] font-normal text-slate-400 lowercase">
                            (net after rebate)
                          </span>
                        </th>
                      )}

                      <th className="py-2.5 px-3 text-center border-l border-[#3A3B3C]/60">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#3A3B3C]/60">
                    {filteredItems.map((item) => {
                      const { metrics } = item;
                      const hasCost = metrics.hasCost;

                      return (
                        <tr
                          key={item.companyId}
                          className={`hover:bg-[#343638] transition-colors ${
                            metrics.isAnyLoss ? "bg-rose-950/10" : ""
                          }`}
                        >
                          {/* Col 1: Customer Name */}
                          <td className="py-2.5 px-3 text-slate-200 font-medium">
                            <div className="flex items-center gap-2">
                              <span className="truncate max-w-[200px]" title={item.companyName}>
                                {item.companyName}
                              </span>
                              {item.isModified && (
                                <span className="px-1.5 py-0.2 rounded bg-[#C7F33C]/20 text-[#C7F33C] text-[9px] font-bold">
                                  edited
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Col 2: Selling Price Input */}
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            <div className="inline-flex items-center gap-1.5 bg-[#1C1C1D] border border-[#4E4F50] hover:border-slate-400 focus-within:border-[#C7F33C] rounded-lg px-2 py-1">
                              <span className="text-[11px] text-slate-400">฿</span>
                              <input
                                type="number"
                                step="0.01"
                                value={item.currentPrice}
                                onChange={(e) => {
                                  const num = parseFloat(e.target.value) || 0;
                                  onCustomerPriceChange(v.id, item.companyId, num);
                                }}
                                className="w-20 bg-transparent text-right text-xs font-bold text-slate-100 outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                          </td>

                          {/* Col 3: vs Standard Price */}
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            {liveStandardPrice > 0 ? (
                              <div className="space-y-0.5">
                                <span
                                  className={`text-xs font-semibold ${
                                    item.priceDiff > 0.005
                                      ? "text-[#C7F33C]"
                                      : item.priceDiff < -0.005
                                      ? "text-rose-400"
                                      : "text-slate-400"
                                  }`}
                                >
                                  {item.priceDiff > 0 ? "+" : ""}
                                  ฿{fmt(item.priceDiff)}
                                </span>
                                <span className="block text-[10px] text-slate-500">
                                  ({item.priceDiffPct > 0 ? "+" : ""}
                                  {item.priceDiffPct.toFixed(1)}%)
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>

                          {/* Col 4: General Export Analysis */}
                          {(viewScenario === "all" || viewScenario === "general_export") && (
                            <td className="py-2.5 px-3 text-right border-l border-[#3A3B3C]/60 tabular-nums">
                              {hasCost && item.currentPrice > 0 ? (
                                <div className="space-y-0.5">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span className="text-xs font-bold text-slate-100">
                                      ฿{fmt(metrics.genNetRev)}
                                    </span>
                                    <span
                                      className={`text-[11px] font-extrabold ${
                                        metrics.genProfit >= 0
                                          ? "text-[#C7F33C]"
                                          : "text-rose-400"
                                      }`}
                                    >
                                      {metrics.genProfit >= 0 ? "+" : ""}
                                      ฿{fmt(metrics.genProfit)}
                                    </span>
                                  </div>
                                  <span
                                    className={`block text-[10px] font-semibold ${
                                      metrics.genMarginPct >= 15
                                        ? "text-emerald-400"
                                        : metrics.genMarginPct >= 0
                                        ? "text-amber-400"
                                        : "text-rose-400"
                                    }`}
                                  >
                                    Margin: {metrics.genMarginPct >= 0 ? "+" : ""}
                                    {metrics.genMarginPct.toFixed(1)}%
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-500 text-[11px]">
                                  {!hasCost ? "No Cost Set" : "฿0.00"}
                                </span>
                              )}
                            </td>
                          )}

                          {/* Col 5: Exclusive Step 3 Analysis */}
                          {(viewScenario === "all" || viewScenario === "exclusive") && (
                            <td className="py-2.5 px-3 text-right border-l border-[#3A3B3C]/60 tabular-nums">
                              {hasCost && item.currentPrice > 0 ? (
                                <div className="space-y-0.5">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span className="text-xs font-bold text-slate-100">
                                      ฿{fmt(metrics.exclStep3Net)}
                                    </span>
                                    <span
                                      className={`text-[11px] font-extrabold ${
                                        metrics.exclStep3Profit >= 0
                                          ? "text-[#C7F33C]"
                                          : "text-rose-400"
                                      }`}
                                    >
                                      {metrics.exclStep3Profit >= 0 ? "+" : ""}
                                      ฿{fmt(metrics.exclStep3Profit)}
                                    </span>
                                  </div>
                                  <span
                                    className={`block text-[10px] font-semibold ${
                                      metrics.exclStep3MarginPct >= 15
                                        ? "text-emerald-400"
                                        : metrics.exclStep3MarginPct >= 0
                                        ? "text-amber-400"
                                        : "text-rose-400"
                                    }`}
                                  >
                                    Margin: {metrics.exclStep3MarginPct >= 0 ? "+" : ""}
                                    {metrics.exclStep3MarginPct.toFixed(1)}%
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-500 text-[11px]">
                                  {!hasCost ? "No Cost Set" : "฿0.00"}
                                </span>
                              )}
                            </td>
                          )}

                          {/* Col 6: Health Status Badge */}
                          <td className="py-2.5 px-3 text-center border-l border-[#3A3B3C]/60">
                            {!hasCost ? (
                              <span className="inline-block px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-semibold">
                                NO COST
                              </span>
                            ) : metrics.isAnyLoss ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/50 text-rose-300 text-[10px] font-extrabold">
                                <AlertCircle className="w-3 h-3 text-rose-400" />
                                <span>LOSS</span>
                              </span>
                            ) : metrics.exclStep3MarginPct < 10 || metrics.genMarginPct < 10 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[10px] font-extrabold">
                                <AlertTriangle className="w-3 h-3 text-amber-400" />
                                <span>TIGHT</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#C7F33C]/20 border border-[#C7F33C]/50 text-[#C7F33C] text-[10px] font-extrabold">
                                <CheckCircle2 className="w-3 h-3 text-[#C7F33C]" />
                                <span>PROFIT</span>
                              </span>
                            )}
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
  );
}
