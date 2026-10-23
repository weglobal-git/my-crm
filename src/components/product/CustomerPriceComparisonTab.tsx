"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Search, Plus, Building2, Users, AlertCircle } from "lucide-react";
import {
  ProductVariantDTO,
  resolveUnifiedPrice,
  resolveProductAverageBaseCost,
  calculateTierPrice,
  CustomerPricingCurrency,
  DEFAULT_USD_THB_RATE,
  detectCustomerPriceCurrency,
  convertCustomerPriceToThb,
} from "@/lib/product/product-dto";
import { CommercialRates } from "@/lib/product/use-company-cost-overhead";
import { getCompanies } from "@/lib/actions/company";

export interface CustomerPriceComparisonTabProps {
  variants: ProductVariantDTO[];
  variantEdits: Record<
    string,
    {
      formula?: string | null;
      sku?: string | null;
      price: number;
      productCost: number | null;
      priceCondition: string;
      imageUrl?: string | null;
    }
  >;
  customerPriceEdits: Record<string, Record<string, number>>;
  onCustomerPriceChange: (
    variantId: string,
    companyId: string,
    price: number
  ) => void;
  onProductCustomerPriceChange?: (companyId: string, price: number) => void;
  commercialRates: CommercialRates;
  companyCostOverheadPercent: number;
  calculateEffectiveCost: (baseCost: number | null | undefined) => number;
}

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
  onProductCustomerPriceChange,
  commercialRates,
  companyCostOverheadPercent,
  calculateEffectiveCost,
}: CustomerPriceComparisonTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [allCompanies, setAllCompanies] = useState<CompanyOption[]>([]);
  const [isAddingCompany, setIsAddingCompany] = useState(false);
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

  // Unified Product Standard Price & Average Cost across all variants
  const productPricingSummary = useMemo(() => {
    const liveStandardPrice = resolveUnifiedPrice(
      variants.map((v) => variantEdits[v.id]?.price ?? v.price ?? 0)
    );
    const costStats = resolveProductAverageBaseCost(
      variants.map((v) => variantEdits[v.id]?.productCost ?? v.productCost)
    );
    const avgEffectiveCost =
      costStats.avgCost > 0 ? calculateEffectiveCost(costStats.avgCost) : 0;

    // Customer Selling Price is already the Invoice unit price (DisFee already deducted),
    // so minBreakEven only needs to cover post-invoice deductions (Rec Com or MKT + Rebate)
    let minBreakEven = 0;
    if (avgEffectiveCost > 0) {
      const genFactor = 1 - commercialRates.commissionRate / 100;
      const postInvoiceFactor =
        1 -
        (commercialRates.mktSupportRate + commercialRates.rebateRate) / 100;
      const minGen =
        genFactor > 0 ? Math.ceil((avgEffectiveCost / genFactor) * 100) / 100 : 0;
      const minExclInvoice =
        postInvoiceFactor > 0
          ? Math.ceil((avgEffectiveCost / postInvoiceFactor) * 100) / 100
          : 0;
      minBreakEven = Math.max(minGen, minExclInvoice);
    }

    return {
      liveStandardPrice,
      avgBaseCost: costStats.avgCost,
      avgEffectiveCost,
      minBreakEven,
      costCount: costStats.count,
    };
  }, [
    variants,
    variantEdits,
    calculateEffectiveCost,
    commercialRates,
  ]);

  const applyCompanyPriceToAllVariants = (companyId: string, price: number) => {
    if (onProductCustomerPriceChange) {
      onProductCustomerPriceChange(companyId, price);
      return;
    }
    variants.forEach((v) => {
      onCustomerPriceChange(v.id, companyId, price);
    });
  };

  // Aggregate customer prices at the Product level (Mode / highest price across variants)
  const customerItems = useMemo(() => {
    const companySavedMap = new Map<
      string,
      { companyId: string; companyName: string; savedPrices: number[] }
    >();

    for (const v of variants) {
      for (const cp of v.customPrices || []) {
        if (cp.price > 0) {
          const entry = companySavedMap.get(cp.companyId) || {
            companyId: cp.companyId,
            companyName: cp.companyName,
            savedPrices: [],
          };
          entry.savedPrices.push(cp.price);
          companySavedMap.set(cp.companyId, entry);
        }
      }
    }

    const companyEditMap = new Map<string, number[]>();
    for (const v of variants) {
      const editsForV = customerPriceEdits[v.id] || {};
      for (const [compId, p] of Object.entries(editsForV)) {
        const arr = companyEditMap.get(compId) || [];
        arr.push(p);
        companyEditMap.set(compId, arr);

        if (!companySavedMap.has(compId)) {
          const compInfo = allCompanies.find((c) => c.id === compId);
          const cName = compInfo?.displayName || compInfo?.name || "Customer";
          companySavedMap.set(compId, {
            companyId: compId,
            companyName: cName,
            savedPrices: [],
          });
        }
      }
    }

    const { liveStandardPrice, avgBaseCost, minBreakEven, avgEffectiveCost } =
      productPricingSummary;

    let usdRate = DEFAULT_USD_THB_RATE;
    let currencyOverrides: Record<string, CustomerPricingCurrency> = {};
    if (typeof window !== "undefined") {
      const cachedRate = window.localStorage.getItem(
        "crm_usd_thb_exchange_rate_v1"
      );
      const parsed = cachedRate ? parseFloat(cachedRate) : NaN;
      if (!Number.isNaN(parsed) && parsed > 20 && parsed < 60) {
        usdRate = parsed;
      }
      try {
        const rawOverrides = window.localStorage.getItem(
          "crm_customer_currency_overrides_v1"
        );
        if (rawOverrides) {
          currencyOverrides = JSON.parse(rawOverrides);
        }
      } catch {
        // ignore
      }
    }

    return Array.from(companySavedMap.values())
      .map((item) => {
        const originalPrice = resolveUnifiedPrice(item.savedPrices);
        const editedPrices = companyEditMap.get(item.companyId);
        const currentPrice =
          editedPrices && editedPrices.length > 0
            ? resolveUnifiedPrice(editedPrices)
            : originalPrice;

        const currency: CustomerPricingCurrency =
          currencyOverrides[item.companyId] ??
          detectCustomerPriceCurrency(
            originalPrice > 0 ? originalPrice : currentPrice,
            avgBaseCost,
            liveStandardPrice
          );

        const currentPriceThb = convertCustomerPriceToThb(
          currentPrice,
          currency,
          usdRate
        );

        const priceDiff = currentPriceThb - liveStandardPrice;
        const priceDiffPct =
          liveStandardPrice > 0 ? (priceDiff / liveStandardPrice) * 100 : 0;
        const isModified = Math.abs(currentPrice - originalPrice) >= 0.005;
        const isTrueLoss =
          avgEffectiveCost > 0 &&
          currentPriceThb > 0 &&
          currentPriceThb < avgEffectiveCost - 0.005;
        const afterMktThb =
          currentPriceThb * (1 - commercialRates.mktSupportRate / 100);
        const annexStatus: "none" | "no_rebate" | "no_mkt_rebate" =
          avgEffectiveCost > 0 && currentPriceThb > 0 && !isTrueLoss
            ? afterMktThb < avgEffectiveCost - 0.005
              ? "no_mkt_rebate"
              : currentPriceThb < minBreakEven - 0.005
              ? "no_rebate"
              : "none"
            : "none";

        return {
          companyId: item.companyId,
          companyName: item.companyName,
          currency,
          originalPrice,
          currentPrice,
          currentPriceThb,
          priceDiff,
          priceDiffPct,
          isModified,
          isLoss: isTrueLoss,
          annexStatus,
        };
      })
      .sort((a, b) => a.companyName.localeCompare(b.companyName));
  }, [
    variants,
    customerPriceEdits,
    allCompanies,
    productPricingSummary,
    commercialRates.mktSupportRate,
  ]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return customerItems;
    const q = searchQuery.trim().toLowerCase();
    return customerItems.filter((item) =>
      item.companyName.toLowerCase().includes(q)
    );
  }, [customerItems, searchQuery]);

  const existingCompanyIds = useMemo(
    () => new Set(customerItems.map((i) => i.companyId)),
    [customerItems]
  );

  const availableToAdd = useMemo(() => {
    return allCompanies
      .filter((c) => !existingCompanyIds.has(c.id))
      .filter((c) => {
        if (!companySearch.trim()) return true;
        const q = companySearch.trim().toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.displayName && c.displayName.toLowerCase().includes(q))
        );
      })
      .slice(0, 12);
  }, [allCompanies, existingCompanyIds, companySearch]);

  const {
    liveStandardPrice,
    avgBaseCost,
    avgEffectiveCost,
    minBreakEven,
  } = productPricingSummary;

  return (
    <div className="flex flex-col gap-5">
      {/* Top Search & Product Unified Price/Cost Summary Bar */}
      <div className="bg-[#3A3B3C] rounded-2xl p-4 space-y-3.5 border-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#C7F33C]" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Customer Selling Prices (Unified Across All Variants)
            </span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#252728] text-slate-300 border border-[#4E4F50]">
            {customerItems.length} {customerItems.length === 1 ? "Account" : "Accounts"}
          </span>
        </div>

        {/* Product Benchmark Metrics: Standard Price, Avg Cost, Min Break-Even */}
        <div className="grid grid-cols-3 gap-2.5 bg-[#252728] rounded-xl p-3 border border-[#4E4F50]/60 tabular-nums">
          <div>
            <div className="text-[10px] font-semibold text-slate-400">
              Standard Export Price
            </div>
            <div className="text-xs font-bold text-[#C7F33C] mt-0.5">
              {liveStandardPrice > 0 ? `฿${fmt(liveStandardPrice)}` : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-slate-400">
              Avg Cost (+{companyCostOverheadPercent}% Std.)
            </div>
            <div className="text-xs font-bold text-slate-100 mt-0.5">
              {avgEffectiveCost > 0 ? (
                <>
                  ฿{fmt(avgEffectiveCost)}{" "}
                  <span className="text-[10px] font-normal text-slate-400">
                    (Base: ฿{fmt(avgBaseCost)})
                  </span>
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-slate-400">
              ขั้นต่ำ (ให้ MKT+Rebate)
            </div>
            <div className="text-xs font-bold text-slate-200 mt-0.5 flex items-center gap-2 flex-wrap">
              {minBreakEven > 0 ? (
                <span
                  className="text-slate-100"
                  title="ราคาขั้นต่ำกรณีให้สิทธิ์ MKT + Rebate ครบทุกขั้น"
                >
                  ≥฿{fmt(minBreakEven)}
                </span>
              ) : (
                "—"
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer account name..."
              className="w-full bg-[#252728] border border-transparent rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-[#C7F33C]"
            />
          </div>

          <button
            type="button"
            disabled={variants.length === 0}
            onClick={() => {
              setIsAddingCompany((prev) => !prev);
              setCompanySearch("");
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#252728] hover:bg-[#C7F33C] text-slate-200 hover:text-black border border-[#4E4F50] hover:border-[#C7F33C] text-xs font-bold transition-colors cursor-pointer shrink-0 disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Customer</span>
          </button>
        </div>

        {/* Quick Add Company Dropdown Picker */}
        {isAddingCompany && (
          <div className="p-3.5 bg-[#252728] rounded-xl border border-[#4E4F50] space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[#C7F33C] flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                Select Customer Account:
              </span>
              <button
                type="button"
                onClick={() => setIsAddingCompany(false)}
                className="text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
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
                placeholder="Search account name..."
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
                      applyCompanyPriceToAllVariants(
                        comp.id,
                        liveStandardPrice > 0 ? liveStandardPrice : 0
                      );
                      setIsAddingCompany(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-[#2A2B2D] hover:text-[#C7F33C] transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <span className="font-medium truncate pr-2">
                      {comp.displayName || comp.name}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                      Default ฿{fmt(liveStandardPrice)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Unified Product Customer Prices Table */}
      {variants.length === 0 ? (
        <div className="bg-[#3A3B3C] rounded-2xl p-8 text-center space-y-2">
          <p className="text-xs font-bold text-slate-200">No Variants Found</p>
          <p className="text-xs text-slate-400">
            Create a variant in the Pricing & Variants tab first before assigning customer prices.
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-8 px-4 bg-[#3A3B3C] rounded-2xl text-center text-xs text-slate-400">
          {customerItems.length === 0
            ? "No customer-specific selling prices recorded for this product."
            : "No customer accounts match your search."}
        </div>
      ) : (
        <div className="bg-[#3A3B3C] rounded-2xl p-4 border-0">
          <div className="bg-[#252728] rounded-xl overflow-hidden border border-[#4E4F50]/60">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#3A3B3C] text-[10px] text-slate-400 font-bold uppercase tracking-wider bg-[#1F2022]">
                  <th className="py-2.5 px-3.5">Customer Account</th>
                  <th className="py-2.5 px-3.5 text-right w-40">
                    Selling Price (THB)
                  </th>
                  <th className="py-2.5 px-3.5 text-right w-32">
                    vs Standard
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#3A3B3C]/60">
                {filteredItems.map((item) => (
                  <tr
                    key={item.companyId}
                    className="hover:bg-[#2F3133] transition-colors"
                  >
                    {/* Col 1: Customer Account */}
                    <td className="py-2.5 px-3.5 text-slate-200 font-medium">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="truncate"
                          title={item.companyName}
                        >
                          {item.companyName}
                        </span>
                        {item.currency === "USD" && (
                          <span className="px-1.5 py-0.5 rounded bg-[#18191A] border border-[#4E4F50] text-[#C7F33C] text-[9px] font-bold shrink-0">
                            USD
                          </span>
                        )}
                        {item.isLoss ? (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-950/60 border border-rose-500/40 text-rose-400 text-[9.5px] font-bold shrink-0"
                            title="ราคาขายต่ำกว่าต้นทุน Effective Cost แม้จะงด MKT & Rebate แล้ว"
                          >
                            <AlertCircle className="w-2.5 h-2.5" />
                            <span>ขาดทุนจริง</span>
                          </span>
                        ) : item.annexStatus !== "none" ? (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/50 border border-amber-500/40 text-amber-300 text-[9.5px] font-bold shrink-0"
                            title="คุ้มทุน Effective Cost แล้ว แต่ต้องระบุในเอกสารแนบท้ายสัญญา (ANNEX) เพื่องด MKT และ/หรือ Rebate"
                          >
                            <span>
                              {item.annexStatus === "no_mkt_rebate"
                                ? "งด MKT+Rebate (ANNEX)"
                                : "งด Rebate (ANNEX)"}
                            </span>
                          </span>
                        ) : null}
                        {item.isModified && (
                          <span className="px-1.5 py-0.5 rounded bg-[#C7F33C]/15 text-[#C7F33C] text-[9px] font-bold shrink-0">
                            Edited
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Col 2: Selling Price Input */}
                    <td className="py-2 px-3.5 text-right tabular-nums">
                      <div className="inline-flex flex-col items-end gap-0.5">
                        <div
                          className={`inline-flex items-center gap-1.5 bg-[#18191A] border rounded-lg px-2.5 py-1 ${
                            item.isLoss
                              ? "border-rose-500/70 focus-within:border-rose-400"
                              : item.annexStatus !== "none"
                              ? "border-amber-500/60 focus-within:border-amber-400"
                              : "border-[#3E4042] focus-within:border-[#C7F33C]"
                          }`}
                        >
                          <span
                            className={`text-[11px] font-bold ${
                              item.isLoss
                                ? "text-rose-400"
                                : item.annexStatus !== "none"
                                ? "text-amber-400"
                                : "text-slate-400"
                            }`}
                          >
                            {item.currency === "USD" ? "$" : "฿"}
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            value={item.currentPrice}
                            onChange={(e) => {
                              const num = parseFloat(e.target.value) || 0;
                              applyCompanyPriceToAllVariants(item.companyId, num);
                            }}
                            className={`w-20 bg-transparent text-right text-xs font-bold outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                              item.isLoss ? "text-rose-400" : "text-slate-100"
                            }`}
                          />
                        </div>
                        {item.currency === "USD" && item.currentPrice > 0 && (
                          <span className="text-[10px] text-slate-400">
                            ≈ ฿{fmt(item.currentPriceThb)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Col 3: Difference vs Standard Export Price */}
                    <td className="py-2.5 px-3.5 text-right tabular-nums">
                      {liveStandardPrice > 0 ? (
                        <div className="leading-tight">
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
                            {item.priceDiffPct.toFixed(1)}%
                          </span>
                          <span className="block text-[10px] text-slate-500">
                            ({item.priceDiff > 0 ? "+" : ""}฿
                            {fmt(item.priceDiff)})
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

