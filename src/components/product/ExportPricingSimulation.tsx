"use client";

import React, { useState, useEffect } from "react";
import { PriceStepTier, calculateTierPrice } from "@/lib/product/product-dto";
import { SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";

export interface CommercialRates {
  commissionRate: number; // default 5
  distFeeRate: number; // default 5
  mktSupportRate: number; // default 2
  rebateRate: number; // default 3
}

export const DEFAULT_COMMERCIAL_RATES: CommercialRates = {
  commissionRate: 5,
  distFeeRate: 5,
  mktSupportRate: 2,
  rebateRate: 3,
};

interface ExportPricingSimulationProps {
  basePrice: number;
  productCost: number | null;
  tiers: PriceStepTier[];
  rates?: CommercialRates;
  onRatesChange?: (rates: CommercialRates) => void;
}

function RateNumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (val: number) => void;
}) {
  const [localVal, setLocalVal] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalVal(String(value));
    }
  }, [value, isFocused]);

  return (
    <div>
      <label className="text-[10px] text-slate-400 block mb-0.5 font-medium">
        {label}
      </label>
      <input
        type="number"
        step="0.5"
        min="0"
        max="100"
        value={localVal}
        placeholder="0"
        onFocus={() => setIsFocused(true)}
        onChange={(e) => {
          const raw = e.target.value;
          setLocalVal(raw);
          if (raw !== "") {
            const num = parseFloat(raw);
            if (!isNaN(num)) onChange(num);
          } else {
            onChange(0);
          }
        }}
        onBlur={() => {
          setIsFocused(false);
          if (localVal === "" || isNaN(parseFloat(localVal))) {
            setLocalVal("0");
            onChange(0);
          } else {
            const num = parseFloat(localVal);
            setLocalVal(String(num));
            onChange(num);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-full bg-[#121213] border border-[#3E4042] rounded px-2.5 py-1 text-slate-200 text-xs outline-none focus:border-[#C7F33C] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  );
}

export function ExportPricingSimulation({
  basePrice,
  productCost,
  tiers,
  rates,
  onRatesChange,
}: ExportPricingSimulationProps) {
  const [localRates, setLocalRates] = useState<CommercialRates>(DEFAULT_COMMERCIAL_RATES);
  const effectiveRates = rates ?? localRates;

  const commissionRate = effectiveRates.commissionRate;
  const distFeeRate = effectiveRates.distFeeRate;
  const mktSupportRate = effectiveRates.mktSupportRate;
  const rebateRate = effectiveRates.rebateRate;

  const updateCommissionRate = (val: number) => {
    const next = { ...effectiveRates, commissionRate: val };
    if (onRatesChange) onRatesChange(next);
    else setLocalRates(next);
  };

  const updateDistFeeRate = (val: number) => {
    const next = { ...effectiveRates, distFeeRate: val };
    if (onRatesChange) onRatesChange(next);
    else setLocalRates(next);
  };

  const updateMktSupportRate = (val: number) => {
    const next = { ...effectiveRates, mktSupportRate: val };
    if (onRatesChange) onRatesChange(next);
    else setLocalRates(next);
  };

  const updateRebateRate = (val: number) => {
    const next = { ...effectiveRates, rebateRate: val };
    if (onRatesChange) onRatesChange(next);
    else setLocalRates(next);
  };

  const [showConfig, setShowConfig] = useState(false);

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
      {/* Simulation Header & Rate Customizer Toggle */}
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

        <button
          type="button"
          onClick={() => setShowConfig((prev) => !prev)}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-[#C7F33C] transition-colors cursor-pointer"
          title="Adjust deduction rates"
        >
          <SlidersHorizontal className="w-3 h-3" />
          <span>Rates</span>
          {showConfig ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
      </div>

      {/* Optional Rate Configuration Drawer */}
      {showConfig && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-[#1C1D1E] p-3 rounded-xl border border-[#4E4F50]/60 text-xs">
          <RateNumberInput
            label="Sales Comm %"
            value={commissionRate}
            onChange={updateCommissionRate}
          />
          <RateNumberInput
            label="Dist Fee %"
            value={distFeeRate}
            onChange={updateDistFeeRate}
          />
          <RateNumberInput
            label="MKT Support %"
            value={mktSupportRate}
            onChange={updateMktSupportRate}
          />
          <RateNumberInput
            label="Target Rebate %"
            value={rebateRate}
            onChange={updateRebateRate}
          />
        </div>
      )}

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

            {/* Sales Commission */}
            <div className="flex items-center justify-between text-slate-400 pt-1">
              <span>Sales Commission ({commissionRate}%)</span>
              <div className="flex items-center tabular-nums text-rose-300/80">
                <span className="w-20 text-right">-฿{fmt(genCommissionBase, 2)}</span>
                <span className="w-20 text-right">-฿{fmt(genCommissionStep, 2)}</span>
              </div>
            </div>

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
              <span>Product Cost</span>
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
            <div className="flex items-center justify-between text-slate-400">
              <span>Distribution Fee ({distFeeRate}%)</span>
              <div className="flex items-center tabular-nums text-rose-300/80">
                <span className="w-20 text-right">-฿{fmt(exclDistFeeBase, 2)}</span>
                <span className="w-20 text-right">-฿{fmt(exclDistFeeStep, 2)}</span>
              </div>
            </div>

            {/* Quotation Price */}
            <div className="flex items-center justify-between pt-1 border-t border-[#2F3032] font-semibold">
              <span className="text-slate-100 font-bold">Quotation Price</span>
              <div className="flex items-center tabular-nums text-[#C7F33C] font-bold">
                <span className="w-20 text-right">฿{fmt(exclQuotationBase, 2)}</span>
                <span className="w-20 text-right">฿{fmt(exclQuotationStep, 2)}</span>
              </div>
            </div>

            {/* MKT Support */}
            <div className="flex items-center justify-between text-slate-400 pt-1">
              <span>Marketing Support ({mktSupportRate}%)</span>
              <div className="flex items-center tabular-nums text-rose-300/80">
                <span className="w-20 text-right">-฿{fmt(exclMktBase, 2)}</span>
                <span className="w-20 text-right">-฿{fmt(exclMktStep, 2)}</span>
              </div>
            </div>

            {/* Target Rebate */}
            <div className="flex items-center justify-between text-slate-400">
              <span>Annual Rebate ({rebateRate}%)</span>
              <div className="flex items-center tabular-nums text-rose-300/80">
                <span className="w-20 text-right">-฿{fmt(exclRebateBase, 2)}</span>
                <span className="w-20 text-right">-฿{fmt(exclRebateStep, 2)}</span>
              </div>
            </div>

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
              <span>Product Cost</span>
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
