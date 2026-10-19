"use client";

import React, { useState } from "react";
import { PriceStepTier, calculateTierPrice } from "@/lib/product/product-dto";
import {
  CommercialRates,
  DEFAULT_COMMERCIAL_RATES,
  useCompanyCostOverhead,
} from "@/lib/product/use-company-cost-overhead";

export { type CommercialRates, DEFAULT_COMMERCIAL_RATES };

interface ExportPricingSimulationProps {
  basePrice: number;
  productCost: number | null;
  baseProductCost?: number | null;
  overheadPercent?: number;
  tiers: PriceStepTier[];
  rates?: CommercialRates;
  onRatesChange?: (rates: CommercialRates) => void;
}

export function ExportPricingSimulation({
  basePrice,
  productCost,
  baseProductCost,
  overheadPercent,
  tiers,
  rates,
}: ExportPricingSimulationProps) {
  const { commercialRates } = useCompanyCostOverhead();
  const effectiveRates = rates ?? commercialRates ?? DEFAULT_COMMERCIAL_RATES;

  const commissionRate = effectiveRates.commissionRate;
  const distFeeRate = effectiveRates.distFeeRate;
  const mktSupportRate = effectiveRates.mktSupportRate;
  const rebateRate = effectiveRates.rebateRate;

  // Selected tier for Step Price: defaults to T3 (index 2) if at least 3 tiers exist, or highest available tier
  const getDefaultTierIdx = (tList: PriceStepTier[]) => {
    if (tList.length >= 3) return 2; // T3
    if (tList.length > 0) return tList.length - 1;
    return 0;
  };

  const [selectedTierIdx, setSelectedTierIdx] = useState<number | null>(null);

  const activeTierIdx =
    selectedTierIdx !== null && selectedTierIdx < tiers.length
      ? selectedTierIdx
      : getDefaultTierIdx(tiers);
  const activeTier = tiers[activeTierIdx];

  // Calculate step price from active tier
  const stepDiscount = activeTier?.discountPercent ?? 0;
  const stepPrice = calculateTierPrice(basePrice, stepDiscount);
  const cost = productCost ?? 0;

  // --- GENERAL EXPORT CALCULATIONS ---
  const genExportBase = basePrice;
  const genExportStep = stepPrice;

  // Quotation Price for General Export (before internal sales commission)
  const genQuotationBase = genExportBase;
  const genQuotationStep = genExportStep;

  // Commission is applied on both Base (General) and Step
  const genCommissionBase = (genExportBase * commissionRate) / 100;
  const genCommissionStep = (genExportStep * commissionRate) / 100;

  // Subtotal (Revenue minus Commission)
  const genSubtotalBase = genExportBase - genCommissionBase;
  const genSubtotalStep = genExportStep - genCommissionStep;

  // Profit / Margin (THB)
  const genProfitBase = genSubtotalBase - cost;
  const genProfitStep = genSubtotalStep - cost;

  // Margin %
  const genMarginPctBase =
    genExportBase > 0 ? (genProfitBase / genExportBase) * 100 : 0;
  const genMarginPctStep =
    genExportStep > 0 ? (genProfitStep / genExportStep) * 100 : 0;

  // --- EXCLUSIVE DISTRIBUTOR CALCULATIONS ---
  const exclExportBase = basePrice;
  const exclExportStep = stepPrice;

  // Distribution Fee (e.g. 5%) on both Base and Step
  const exclDistFeeBase = (exclExportBase * distFeeRate) / 100;
  const exclDistFeeStep = (exclExportStep * distFeeRate) / 100;

  // Quotation Price after Distribution Fee (Actual price to appear on Quotation)
  const exclQuotationBase = exclExportBase - exclDistFeeBase;
  const exclQuotationStep = exclExportStep - exclDistFeeStep;

  // Marketing Support (e.g. 2%) based on Quotation Price
  const exclMktBase = (exclQuotationBase * mktSupportRate) / 100;
  const exclMktStep = (exclQuotationStep * mktSupportRate) / 100;

  // Rebate (e.g. 3%) based on Quotation Price
  const exclRebateBase = (exclQuotationBase * rebateRate) / 100;
  const exclRebateStep = (exclQuotationStep * rebateRate) / 100;

  // Subtotal (Revenue minus MKT Support & Rebate)
  const exclSubtotalBase = exclQuotationBase - exclMktBase - exclRebateBase;
  const exclSubtotalStep = exclQuotationStep - exclMktStep - exclRebateStep;

  // Profit / Margin (THB)
  const exclProfitBase = exclSubtotalBase - cost;
  const exclProfitStep = exclSubtotalStep - cost;

  // Margin %
  const exclMarginPctBase =
    exclExportBase > 0 ? (exclProfitBase / exclExportBase) * 100 : 0;
  const exclMarginPctStep =
    exclExportStep > 0 ? (exclProfitStep / exclExportStep) * 100 : 0;

  const fmt = (num: number, decimals: number = 2) =>
    num.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

  return (
    <div className="space-y-3 pt-3 border-t border-[#3E4042]/50">
      {/* Simulation Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-200">
            Export Pricing & Margin Analysis
          </span>
          {tiers.length > 1 && (
            <div className="flex items-center gap-1 bg-[#1E1F20] p-0.5 rounded-lg border border-[#4E4F50]/50">
              {tiers.map((t, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedTierIdx(idx)}
                  className={`px-2 py-0.5 text-[9px] font-bold rounded cursor-pointer transition-colors ${
                    activeTierIdx === idx
                      ? "bg-[#C7F33C] text-black"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title={`Simulate using Tier ${idx + 1} (${t.discountPercent}% discount)`}
                >
                  T{idx + 1} ({t.discountPercent}%)
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stacked Tables: Top & Bottom (General Export Price on top, Exclusive Distributor below) */}
      <div className="flex flex-col gap-3">
        {/* TABLE 1: GENERAL EXPORT PRICE */}
        <div className="bg-[#1C1D1E] rounded-xl border border-[#383A3C] overflow-hidden shadow-sm">
          {/* Table Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-[#252627] border-b border-[#353638]">
            <span className="text-xs font-bold text-slate-200">
              General Export Price
            </span>
            <div className="flex items-center text-xs font-semibold text-slate-400">
              <span className="w-20 text-right">General</span>
              <span className="w-20 text-right">Step</span>
            </div>
          </div>

          {/* Table Rows */}
          <div className="p-3 space-y-1.5 text-xs">
            {/* Export Price */}
            <div className="flex items-center justify-between text-slate-300">
              <span>Export Price</span>
              <div className="flex items-center tabular-nums text-slate-200">
                <span className="w-20 text-right">฿{fmt(genExportBase, 2)}</span>
                <span className="w-20 text-right">฿{fmt(genExportStep, 2)}</span>
              </div>
            </div>

            {/* Quotation Price */}
            <div className="flex items-center justify-between pt-1 border-t border-[#2F3032] font-semibold">
              <span className="text-slate-100 font-bold">Quotation Price</span>
              <div className="flex items-center tabular-nums text-[#C7F33C] font-bold">
                <span className="w-20 text-right">฿{fmt(genQuotationBase, 2)}</span>
                <span className="w-20 text-right">฿{fmt(genQuotationStep, 2)}</span>
              </div>
            </div>

            {/* Rec Com */}
            {commissionRate > 0 && (
              <div className="flex items-center justify-between text-slate-400 pt-1">
                <span>Rec Com ({commissionRate}%)</span>
                <div className="flex items-center tabular-nums text-rose-300/80">
                  <span className="w-20 text-right">-฿{fmt(genCommissionBase, 2)}</span>
                  <span className="w-20 text-right">-฿{fmt(genCommissionStep, 2)}</span>
                </div>
              </div>
            )}

            {/* Net Revenue */}
            <div className="flex items-center justify-between pt-1 border-t border-[#2F3032] text-slate-200 font-semibold">
              <span>Net Revenue</span>
              <div className="flex items-center tabular-nums text-slate-100">
                <span className="w-20 text-right">฿{fmt(genSubtotalBase, 2)}</span>
                <span className="w-20 text-right">฿{fmt(genSubtotalStep, 2)}</span>
              </div>
            </div>

            {/* Product Cost */}
            <div className="flex items-center justify-between text-slate-400">
              <div className="flex items-center gap-1.5">
                <span>Product Cost</span>
                {overheadPercent !== undefined && overheadPercent > 0 && (
                  <span
                    className="text-[10px] font-semibold text-[#C7F33C] bg-[#252728] px-1.5 py-0.5 rounded border border-[#4E4F50]/60 tabular-nums cursor-help"
                    title={`Base Cost: ฿${fmt(baseProductCost ?? 0, 2)} + ${overheadPercent}% Company Standard Cost Overhead`}
                  >
                    +{overheadPercent}%
                  </span>
                )}
              </div>
              <div className="flex items-center tabular-nums text-slate-300">
                <span className="w-20 text-right">{cost > 0 ? `฿${fmt(cost, 2)}` : "-"}</span>
                <span className="w-20 text-right">{cost > 0 ? `฿${fmt(cost, 2)}` : "-"}</span>
              </div>
            </div>

            {/* Margin (THB) & Margin (%) Highlight Card */}
            <div className="flex items-center justify-between pt-1.5 border-t border-[#2F3032] text-xs font-bold">
              <span className={genProfitStep >= 0 ? "text-emerald-400" : "text-rose-400"}>
                Profit Margin
              </span>
              <div className="flex items-center tabular-nums">
                <div className="w-20 text-right">
                  <span className={`block ${genProfitBase >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    ฿{fmt(genProfitBase, 2)}
                  </span>
                  <span className={`text-[10px] font-normal block ${genProfitBase >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}`}>
                    ({fmt(genMarginPctBase, 1)}%)
                  </span>
                </div>
                <div className="w-20 text-right">
                  <span className={`block ${genProfitStep >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    ฿{fmt(genProfitStep, 2)}
                  </span>
                  <span className={`text-[10px] font-normal block ${genProfitStep >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}`}>
                    ({fmt(genMarginPctStep, 1)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* TABLE 2: EXCLUSIVE DISTRIBUTOR */}
        <div className="bg-[#1C1D1E] rounded-xl border border-[#383A3C] overflow-hidden shadow-sm">
          {/* Table Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-[#252627] border-b border-[#353638]">
            <span className="text-xs font-bold text-slate-200">
              Exclusive Distributor
            </span>
            <div className="flex items-center text-xs font-semibold text-slate-400">
              <span className="w-20 text-right">General</span>
              <span className="w-20 text-right">Step</span>
            </div>
          </div>

          {/* Table Rows */}
          <div className="p-3 space-y-1.5 text-xs">
            {/* Export Price */}
            <div className="flex items-center justify-between text-slate-300">
              <span>Export Price</span>
              <div className="flex items-center tabular-nums text-slate-200">
                <span className="w-20 text-right">฿{fmt(exclExportBase, 2)}</span>
                <span className="w-20 text-right">฿{fmt(exclExportStep, 2)}</span>
              </div>
            </div>

            {/* Distribution Fee */}
            {distFeeRate > 0 && (
              <div className="flex items-center justify-between text-slate-400">
                <span>Distribution Fee ({distFeeRate}%)</span>
                <div className="flex items-center tabular-nums text-rose-300/80">
                  <span className="w-20 text-right">-฿{fmt(exclDistFeeBase, 2)}</span>
                  <span className="w-20 text-right">-฿{fmt(exclDistFeeStep, 2)}</span>
                </div>
              </div>
            )}

            {/* Quotation Price */}
            <div className="flex items-center justify-between pt-1 border-t border-[#2F3032] font-semibold">
              <span className="text-slate-100 font-bold">Quotation Price</span>
              <div className="flex items-center tabular-nums text-[#C7F33C] font-bold">
                <span className="w-20 text-right">฿{fmt(exclQuotationBase, 2)}</span>
                <span className="w-20 text-right">฿{fmt(exclQuotationStep, 2)}</span>
              </div>
            </div>

            {/* MKT Support */}
            {mktSupportRate > 0 && (
              <div className="flex items-center justify-between text-slate-400 pt-1">
                <span>Marketing Support ({mktSupportRate}%)</span>
                <div className="flex items-center tabular-nums text-rose-300/80">
                  <span className="w-20 text-right">-฿{fmt(exclMktBase, 2)}</span>
                  <span className="w-20 text-right">-฿{fmt(exclMktStep, 2)}</span>
                </div>
              </div>
            )}

            {/* Target Rebate */}
            {rebateRate > 0 && (
              <div className="flex items-center justify-between text-slate-400">
                <span>Annual Rebate ({rebateRate}%)</span>
                <div className="flex items-center tabular-nums text-rose-300/80">
                  <span className="w-20 text-right">-฿{fmt(exclRebateBase, 2)}</span>
                  <span className="w-20 text-right">-฿{fmt(exclRebateStep, 2)}</span>
                </div>
              </div>
            )}

            {/* Net Revenue */}
            <div className="flex items-center justify-between pt-1 border-t border-[#2F3032] text-slate-200 font-semibold">
              <span>Net Revenue</span>
              <div className="flex items-center tabular-nums text-slate-100">
                <span className="w-20 text-right">฿{fmt(exclSubtotalBase, 2)}</span>
                <span className="w-20 text-right">฿{fmt(exclSubtotalStep, 2)}</span>
              </div>
            </div>

            {/* Product Cost */}
            <div className="flex items-center justify-between text-slate-400">
              <div className="flex items-center gap-1.5">
                <span>Product Cost</span>
                {overheadPercent !== undefined && overheadPercent > 0 && (
                  <span
                    className="text-[10px] font-semibold text-[#C7F33C] bg-[#252728] px-1.5 py-0.5 rounded border border-[#4E4F50]/60 tabular-nums cursor-help"
                    title={`Base Cost: ฿${fmt(baseProductCost ?? 0, 2)} + ${overheadPercent}% Company Standard Cost Overhead`}
                  >
                    +{overheadPercent}%
                  </span>
                )}
              </div>
              <div className="flex items-center tabular-nums text-slate-300">
                <span className="w-20 text-right">{cost > 0 ? `฿${fmt(cost, 2)}` : "-"}</span>
                <span className="w-20 text-right">{cost > 0 ? `฿${fmt(cost, 2)}` : "-"}</span>
              </div>
            </div>

            {/* Margin (THB) & Margin (%) Highlight Card */}
            <div className="flex items-center justify-between pt-1.5 border-t border-[#2F3032] text-xs font-bold">
              <span className={exclProfitStep >= 0 ? "text-emerald-400" : "text-rose-400"}>
                Profit Margin
              </span>
              <div className="flex items-center tabular-nums">
                <div className="w-20 text-right">
                  <span className={`block ${exclProfitBase >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    ฿{fmt(exclProfitBase, 2)}
                  </span>
                  <span className={`text-[10px] font-normal block ${exclProfitBase >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}`}>
                    ({fmt(exclMarginPctBase, 1)}%)
                  </span>
                </div>
                <div className="w-20 text-right">
                  <span className={`block ${exclProfitStep >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    ฿{fmt(exclProfitStep, 2)}
                  </span>
                  <span className={`text-[10px] font-normal block ${exclProfitStep >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}`}>
                    ({fmt(exclMarginPctStep, 1)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
