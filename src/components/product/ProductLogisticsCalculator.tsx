"use client";

import React, { useState, useMemo } from "react";
import {
  ProductVariantDTO,
  parsePriceConditions,
  calculateTierPrice,
  PriceStepTier,
} from "@/lib/product/product-dto";
import {
  Boxes,
  Calculator,
  Copy,
  Check,
  RotateCcw,
  Scale,
  Maximize2,
  Coins,
  Layers,
  Sparkles,
  Eye,
  Info,
} from "lucide-react";

interface ContainerTypeSpec {
  id: "20ft" | "40ft" | "40ftHq";
  name: string;
  shortName: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  maxPayloadKg: number;
  nominalCbm: number;
}

const CONTAINER_SPECS: Record<string, ContainerTypeSpec> = {
  "20ft": {
    id: "20ft",
    name: "20ft General Purpose (GP)",
    shortName: "20ft GP",
    lengthCm: 589.8,
    widthCm: 235.2,
    heightCm: 239.3,
    maxPayloadKg: 28200,
    nominalCbm: 33.2,
  },
  "40ft": {
    id: "40ft",
    name: "40ft General Purpose (GP)",
    shortName: "40ft GP",
    lengthCm: 1203.2,
    widthCm: 235.2,
    heightCm: 239.3,
    maxPayloadKg: 28800,
    nominalCbm: 67.7,
  },
  "40ftHq": {
    id: "40ftHq",
    name: "40ft High Cube (HQ)",
    shortName: "40ft HQ",
    lengthCm: 1203.2,
    widthCm: 235.2,
    heightCm: 269.8,
    maxPayloadKg: 28600,
    nominalCbm: 76.4,
  },
};

interface ProductLogisticsCalculatorProps {
  productName: string;
  category?: string;
  brand?: string;
  hsCode?: string;
  cbm?: number;
  cartonQuantity: number;
  cartonGrossWeight: number;
  cartonWidth?: number;
  cartonLength?: number;
  cartonHeight?: number;
  variants: ProductVariantDTO[];
  primaryVariantId?: string | null;
}

export function ProductLogisticsCalculator({
  productName,
  category = "",
  brand = "",
  hsCode = "",
  cbm = 0,
  cartonQuantity,
  cartonGrossWeight,
  cartonWidth = 0,
  cartonLength = 0,
  cartonHeight = 0,
  variants = [],
  primaryVariantId,
}: ProductLogisticsCalculatorProps) {
  // All variants share identical carton dimensions and weight specifications.
  // Pick primary or default variant for base pricing & step tiers.
  const activeVariant = useMemo(() => {
    return (
      variants.find((v) => (primaryVariantId ? v.id === primaryVariantId : v.isDefault)) ||
      variants[0] ||
      null
    );
  }, [variants, primaryVariantId]);

  // Mandatory Packing Specifications Check:
  // Must NOT display if carton GW or dimensions (W, L, H) are missing/zero
  const hasDimensions = cartonWidth > 0 && cartonLength > 0 && cartonHeight > 0;
  const gwPerCtn =
    activeVariant?.cartonGrossWeight && activeVariant.cartonGrossWeight > 0
      ? activeVariant.cartonGrossWeight
      : cartonGrossWeight > 0
      ? cartonGrossWeight
      : 0;

  const hasPackingSpecs = hasDimensions && gwPerCtn > 0;

  // Master State: Number of cartons
  const [cartons, setCartons] = useState<number>(100);
  const [copied, setCopied] = useState(false);

  // Selected container type for 3D simulation
  const [selectedContainer, setSelectedContainer] = useState<"20ft" | "40ft" | "40ftHq">("20ft");
  const [diagramMode, setDiagramMode] = useState<"3D" | "DOOR" | "TOP">("3D");

  // Auto-calculated CBM from dimensions
  const cbmPerCtn = hasDimensions
    ? Number(((cartonWidth * cartonLength * cartonHeight) / 1_000_000).toFixed(4))
    : cbm > 0
    ? cbm
    : 0;

  const unitsPerCtn = cartonQuantity > 0 ? cartonQuantity : 1;
  const baseUnitPrice = activeVariant?.price || 0;

  // Step price tiers
  const tiers: PriceStepTier[] = useMemo(() => {
    if (!activeVariant?.priceCondition) return [];
    return parsePriceConditions(activeVariant.priceCondition);
  }, [activeVariant?.priceCondition]);

  const getTierDiscount = (ctnQty: number): { discountPercent: number; tierIndex: number } => {
    if (!tiers || tiers.length === 0 || ctnQty <= 0) return { discountPercent: 0, tierIndex: -1 };
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      if (ctnQty >= t.minQuantity && (!t.maxQuantity || ctnQty <= t.maxQuantity)) {
        return { discountPercent: t.discountPercent, tierIndex: i };
      }
    }
    return { discountPercent: 0, tierIndex: -1 };
  };

  const { discountPercent: appliedDiscount, tierIndex: activeTierIdx } = getTierDiscount(cartons);
  const appliedUnitPrice = calculateTierPrice(baseUnitPrice, appliedDiscount);

  // Derived metrics (strictly calculated from cartons input, NO cross filling)
  const totalUnits = cartons * unitsPerCtn;
  const totalCbm = cartons * cbmPerCtn;
  const totalGw = cartons * gwPerCtn;
  const totalAmount = totalUnits * appliedUnitPrice;
  const totalUndiscounted = totalUnits * baseUnitPrice;
  const totalSavings = Math.max(0, totalUndiscounted - totalAmount);

  // Container Packing Optimization Algorithm
  const currentContainer = CONTAINER_SPECS[selectedContainer];

  const packingPlan = useMemo(() => {
    if (!hasDimensions) return null;

    // Orientation A: Carton Length along Container Length, Carton Width along Container Width
    const wA = Math.floor(currentContainer.widthCm / cartonWidth);
    const lA = Math.floor(currentContainer.lengthCm / cartonLength);
    const hA = Math.floor(currentContainer.heightCm / cartonHeight);
    const totalA = wA * lA * hA;

    // Orientation B: Carton Width along Container Length, Carton Length along Container Width
    const wB = Math.floor(currentContainer.widthCm / cartonLength);
    const lB = Math.floor(currentContainer.lengthCm / cartonWidth);
    const hB = Math.floor(currentContainer.heightCm / cartonHeight);
    const totalB = wB * lB * hB;

    const isA = totalA >= totalB;
    const widthCount = isA ? wA : wB;
    const lengthCount = isA ? lA : lB;
    const heightCount = isA ? hA : hB;
    const totalCartons = widthCount * lengthCount * heightCount;

    const cartonUsedW = isA ? cartonWidth : cartonLength;
    const cartonUsedL = isA ? cartonLength : cartonWidth;

    const widthGapCm = Number((currentContainer.widthCm - widthCount * cartonUsedW).toFixed(1));
    const lengthGapCm = Number((currentContainer.lengthCm - lengthCount * cartonUsedL).toFixed(1));
    const heightGapCm = Number((currentContainer.heightCm - heightCount * cartonHeight).toFixed(1));

    const totalCargoCbm = totalCartons * cbmPerCtn;
    const spaceUtilization =
      currentContainer.nominalCbm > 0
        ? Math.min(100, (totalCargoCbm / currentContainer.nominalCbm) * 100)
        : 0;

    const cartonsPerRow = widthCount * heightCount; // 1 cross-section vertical slice
    const totalRows = lengthCount;
    const loadedRows = cartonsPerRow > 0 ? cartons / cartonsPerRow : 0;
    const fullRows = Math.floor(loadedRows);
    const partialRowProgress = loadedRows - fullRows;

    return {
      orientation: isA ? "A" : "B",
      widthCount,
      lengthCount,
      heightCount,
      cartonsPerRow,
      totalRows,
      loadedRows,
      fullRows,
      partialRowProgress,
      totalCartons,
      widthGapCm,
      lengthGapCm,
      heightGapCm,
      cartonUsedW,
      cartonUsedL,
      totalCargoCbm,
      spaceUtilization,
    };
  }, [hasDimensions, currentContainer, cartonWidth, cartonLength, cartonHeight, cbmPerCtn, cartons]);

  const pctContainerFill = packingPlan && packingPlan.totalCartons > 0
    ? Math.min(100, (cartons / packingPlan.totalCartons) * 100)
    : 0;

  const handleCartonsChange = (val: string) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setCartons(num);
  };

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // 1-Click Copy Summary for Client
  const handleCopySummary = () => {
    const discountText =
      appliedDiscount > 0
        ? ` (Volume Discount -${appliedDiscount}%, saved ฿${fmt(totalSavings)})`
        : "";
    const dimText = `${cartonWidth}×${cartonLength}×${cartonHeight} cm`;
    const fclText = packingPlan
      ? `• Container Loading Plan (${currentContainer.shortName}): ${packingPlan.widthCount} wide × ${packingPlan.lengthCount} deep × ${packingPlan.heightCount} tiers = ${packingPlan.totalCartons.toLocaleString()} ctns max FCL (${packingPlan.spaceUtilization.toFixed(1)}% space efficiency)`
      : "";

    const text = [
      `📦 LOGISTICS & PACKING SPECIFICATION: ${productName}`,
      `----------------------------------------`,
      `• Order Volume: ${cartons.toLocaleString()} ctns (${totalUnits.toLocaleString()} pcs)`,
      `• Packing: ${unitsPerCtn} pcs/ctn · Dim: ${dimText}`,
      `• Volume: ${totalCbm.toFixed(3)} m³`,
      `• Gross Weight: ${fmt(totalGw)} kg (${(totalGw / 1000).toFixed(2)} t)`,
      `• Unit Price: ฿${fmt(appliedUnitPrice)} / pc${discountText}`,
      `• Total Quotation Amount: ฿${fmt(totalAmount)} THB`,
      `----------------------------------------`,
      fclText,
      hsCode ? `• HS Code: ${hsCode}` : "",
      brand ? `• Brand: ${brand}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Guard: if no packing specs, hide completely
  if (!hasPackingSpecs) {
    return null;
  }

  return (
    <div className="pt-3 border-t border-[#252728] space-y-3">
      {/* Sub-Header: Title + Actions */}
      <div className="flex items-center justify-between gap-2 pb-1">
        <div className="flex items-center gap-2">
          <Calculator className="w-3.5 h-3.5 text-[#C7F33C]" />
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Logistics & Quotation
          </span>
          {packingPlan && (
            <span className="text-[10.5px] px-2 py-0.5 rounded-full font-semibold bg-[#242D16] text-[#C7F33C] border border-[#688523]/50">
              Optimal: {packingPlan.widthCount}W × {packingPlan.lengthCount}D × {packingPlan.heightCount}H
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCartons(100)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#252728] transition-colors cursor-pointer"
            title="Reset to 100 cartons"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleCopySummary}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
              copied
                ? "bg-[#242D16] border border-[#688523] text-[#C7F33C]"
                : "bg-[#252728] text-slate-300 hover:text-white"
            }`}
            title="Copy logistics & quotation summary for client"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#C7F33C]" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            <span>{copied ? "Copied Summary" : "Copy"}</span>
          </button>
        </div>
      </div>

      {/* 4 Metrics in a Symmetrical Single Row (Carton = ONLY editable input; others = read-only outputs) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* Metric 1: Cartons (The sole editable input field) */}
        <div className="bg-[#252728] p-2.5 rounded-xl border border-transparent focus-within:border-[#C7F33C] transition-colors flex flex-col justify-between">
          <div className="flex items-center text-[11px] text-slate-300 font-semibold mb-1">
            <span className="flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5 text-[#C7F33C]" />
              Carton
            </span>
          </div>
          <input
            type="number"
            min={1}
            value={cartons || ""}
            onChange={(e) => handleCartonsChange(e.target.value)}
            className="w-full bg-transparent text-sm sm:text-base font-extrabold text-slate-100 outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            placeholder="0"
          />
          <div className="text-[10px] text-slate-500 font-medium mt-0.5">
            ctns (editable)
          </div>
        </div>

        {/* Metric 2: Volume (Read-only output) */}
        <div className="bg-[#252728] p-2.5 rounded-xl border border-transparent flex flex-col justify-between">
          <div className="flex items-center text-[11px] text-slate-300 font-semibold mb-1">
            <span className="flex items-center gap-1.5">
              <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
              Volume
            </span>
          </div>
          <div className="w-full text-sm sm:text-base font-extrabold text-slate-100 tabular-nums">
            {totalCbm.toFixed(3)}
          </div>
          <div className="text-[10px] text-slate-500 font-medium mt-0.5">
            m³ (CBM)
          </div>
        </div>

        {/* Metric 3: Gross Weight (Read-only output) */}
        <div className="bg-[#252728] p-2.5 rounded-xl border border-transparent flex flex-col justify-between">
          <div className="flex items-center text-[11px] text-slate-300 font-semibold mb-1">
            <span className="flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-slate-400" />
              Gross Weight
            </span>
          </div>
          <div className="w-full text-sm sm:text-base font-extrabold text-slate-100 tabular-nums">
            {fmt(totalGw)}
          </div>
          <div className="text-[10px] text-slate-500 font-medium mt-0.5">
            kg (Gross)
          </div>
        </div>

        {/* Metric 4: Total Price (Read-only output) */}
        <div className="bg-[#252728] p-2.5 rounded-xl border border-transparent flex flex-col justify-between">
          <div className="flex items-center text-[11px] text-slate-300 font-semibold mb-1">
            <span className="flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-slate-400" />
              Total Price
            </span>
          </div>
          <div className="w-full text-sm sm:text-base font-extrabold text-[#C7F33C] tabular-nums">
            ฿{fmt(totalAmount)}
          </div>
          <div className="text-[10px] text-slate-500 font-medium mt-0.5">
            THB (฿)
          </div>
        </div>
      </div>

      {/* Step Price Volume Discount Chips (if present) */}
      {tiers.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mr-0.5">
            Tiers:
          </span>
          {tiers.map((t, idx) => {
            const isActive = activeTierIdx === idx;
            const rangeText = t.maxQuantity ? `${t.minQuantity}-${t.maxQuantity}` : `${t.minQuantity}+`;
            const tPrice = calculateTierPrice(baseUnitPrice, t.discountPercent);

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setCartons(t.minQuantity)}
                className={`px-2 py-0.5 rounded-lg text-[10.5px] font-medium transition-colors cursor-pointer border flex items-center gap-1.5 ${
                  isActive
                    ? "bg-[#242D16] border-[#688523] text-[#C7F33C]"
                    : "bg-[#252728] border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>{rangeText} ctn</span>
                <span className="text-[9.5px] opacity-75">(-{t.discountPercent}%)</span>
                <span className="font-semibold text-slate-200">฿{fmt(tPrice)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ================================================================ */}
      {/* INNOVATIVE 3D SCAN CONTAINER LOADING BLUEPRINT (DIAGRAM จำลอง)   */}
      {/* ================================================================ */}
      {packingPlan && (
        <div className="bg-[#1C1D1E] rounded-xl border border-[#2D2E30] p-3 space-y-2.5">
          {/* Top Bar: Container Mode Tabs + View Modes + Max Fill Button */}
          <div className="flex items-center justify-between gap-2 flex-wrap pb-1 border-b border-[#2A2B2D]">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mr-1">
                Container:
              </span>
              {(["20ft", "40ft", "40ftHq"] as const).map((cId) => {
                const isSelected = selectedContainer === cId;
                return (
                  <button
                    key={cId}
                    type="button"
                    onClick={() => setSelectedContainer(cId)}
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                      isSelected
                        ? "bg-[#242D16] border-[#688523] text-[#C7F33C]"
                        : "bg-[#252728] border-transparent text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {CONTAINER_SPECS[cId].shortName}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5">
              {/* View Switcher: 3D Scan vs Door Front vs Top View */}
              <div className="bg-[#252728] p-0.5 rounded-lg flex items-center gap-0.5 text-[10px] font-semibold">
                <button
                  type="button"
                  onClick={() => setDiagramMode("3D")}
                  className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                    diagramMode === "3D"
                      ? "bg-[#3A3B3C] text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  3D Scan
                </button>
                <button
                  type="button"
                  onClick={() => setDiagramMode("DOOR")}
                  className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                    diagramMode === "DOOR"
                      ? "bg-[#3A3B3C] text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Door Cross-Section
                </button>
                <button
                  type="button"
                  onClick={() => setDiagramMode("TOP")}
                  className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                    diagramMode === "TOP"
                      ? "bg-[#3A3B3C] text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Top Plan
                </button>
              </div>

              {/* 1-Click Load Full FCL Capacity */}
              <button
                type="button"
                onClick={() => setCartons(packingPlan.totalCartons)}
                className="px-2 py-0.5 rounded-lg text-[10.5px] font-bold bg-[#242D16] border border-[#688523] text-[#C7F33C] hover:bg-[#2d3a17] transition-all cursor-pointer flex items-center gap-1"
                title={`Set quotation to max capacity of ${currentContainer.shortName}`}
              >
                <Sparkles className="w-3 h-3 text-[#C7F33C]" />
                <span>Fill FCL ({packingPlan.totalCartons.toLocaleString()})</span>
              </button>
            </div>
          </div>

          {/* Simulation Diagram Canvas */}
          <div className="w-full bg-[#141516] rounded-xl p-3 flex items-center justify-center overflow-hidden border border-[#252627]">
            {diagramMode === "3D" && (
              <svg
                viewBox="0 0 840 260"
                className="w-full h-auto select-none"
                style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.6))" }}
              >
                <defs>
                  {/* Subtle Blueprint Grid */}
                  <pattern id="blueprint-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1E2023" strokeWidth="0.5" />
                  </pattern>
                  <linearGradient id="containerFloorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#1B1C1E" />
                    <stop offset="100%" stopColor="#121315" />
                  </linearGradient>
                  <linearGradient id="cargoTopGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#324519" />
                    <stop offset="100%" stopColor="#243312" />
                  </linearGradient>
                  <linearGradient id="cargoSideGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#223011" />
                    <stop offset="100%" stopColor="#18220C" />
                  </linearGradient>
                  <linearGradient id="cargoFrontGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#2A3B16" />
                    <stop offset="100%" stopColor="#1E2B0F" />
                  </linearGradient>
                </defs>

                <rect x="0" y="0" width="840" height="260" fill="url(#blueprint-grid)" rx="8" />

                {/* Isometric Container Frame & Stacks */}
                {/* 
                  Geometry Base Points:
                  FL_F (Front-Left Floor):   (140, 200)
                  FR_F (Front-Right Floor):  (270, 230)
                  FL_C (Front-Left Ceiling): (140, 105)   [Height = 95px]
                  FR_C (Front-Right Ceiling):(270, 135)
                  Length vector: dx = 480, dy = -90
                  BL_F (Back-Left Floor):    (620, 110)
                  BR_F (Back-Right Floor):   (750, 140)
                  BL_C (Back-Left Ceiling):  (620, 15)
                  BR_C (Back-Right Ceiling): (750, 45)
                */}
                <g>
                  {/* Container Shell - Floor */}
                  <polygon
                    points="140,200 270,230 750,140 620,110"
                    fill="url(#containerFloorGrad)"
                    stroke="#2F3338"
                    strokeWidth="1.2"
                  />

                  {/* Container Shell - Left Interior Wall */}
                  <polygon
                    points="140,200 620,110 620,15 140,105"
                    fill="#17191C"
                    stroke="#272A2D"
                    strokeWidth="1"
                    opacity="0.95"
                  />

                  {/* Left wall vertical corrugation ribs */}
                  {[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((t, idx) => {
                    const rx = 140 + 480 * t;
                    const ry = 200 - 90 * t;
                    return (
                      <line
                        key={idx}
                        x1={rx}
                        y1={ry}
                        x2={rx}
                        y2={ry - 95}
                        stroke="#202326"
                        strokeWidth="1"
                        strokeDasharray="2 4"
                      />
                    );
                  })}

                  {/* Container Shell - Rear Wall (Bulkhead) */}
                  <polygon
                    points="620,110 750,140 750,45 620,15"
                    fill="#131416"
                    stroke="#26282B"
                    strokeWidth="1"
                  />

                  {/* Container Ceiling Outline Guide */}
                  <polygon
                    points="140,105 270,135 750,45 620,15"
                    fill="none"
                    stroke="#33373B"
                    strokeDasharray="3 3"
                    strokeWidth="0.8"
                    opacity="0.6"
                  />

                  {/* 3D Cargo Stacks (Loaded from Rear Bulkhead t=1 forward to t=0) */}
                  {(() => {
                    const N = packingPlan.lengthCount;
                    const fullRows = Math.min(N, packingPlan.fullRows);
                    const hasPartial = packingPlan.partialRowProgress > 0 && fullRows < N;
                    const cargoH = Math.min(
                      92,
                      Math.max(20, Math.round(95 * ((packingPlan.heightCount * cartonHeight) / currentContainer.heightCm)))
                    );

                    // Render rows from 0 (Rear Bulkhead) to N - 1 (Door)
                    return Array.from({ length: N }).map((_, rIdx) => {
                      const tBack = 1 - rIdx / N;
                      const tFront = 1 - (rIdx + 1) / N;

                      const xL_back = 140 + 480 * tBack;
                      const yL_back = 200 - 90 * tBack;
                      const xR_back = 270 + 480 * tBack;
                      const yR_back = 230 - 90 * tBack;

                      const xL_front = 140 + 480 * tFront;
                      const yL_front = 200 - 90 * tFront;
                      const xR_front = 270 + 480 * tFront;
                      const yR_front = 230 - 90 * tFront;

                      const isFull = rIdx < fullRows;
                      const isPartial = rIdx === fullRows && hasPartial;
                      const isFrontmost = rIdx === fullRows - 1 || isPartial;

                      const thisH = isPartial ? cargoH * packingPlan.partialRowProgress : cargoH;

                      if (!isFull && !isPartial) {
                        // Empty row guideline on container floor
                        return (
                          <line
                            key={rIdx}
                            x1={xL_front}
                            y1={yL_front}
                            x2={xR_front}
                            y2={yR_front}
                            stroke="#232629"
                            strokeWidth="0.8"
                            strokeDasharray="2 3"
                          />
                        );
                      }

                      return (
                        <g key={rIdx}>
                          {/* 1. Top Face of Row Slice */}
                          <polygon
                            points={`${xL_back},${yL_back - thisH} ${xR_back},${yR_back - thisH} ${xR_front},${yR_front - thisH} ${xL_front},${yL_front - thisH}`}
                            fill="url(#cargoTopGrad)"
                            stroke="#688523"
                            strokeWidth="0.7"
                          />

                          {/* 2. Visible Right-Side Face of Row Slice */}
                          <polygon
                            points={`${xR_front},${yR_front - thisH} ${xR_back},${yR_back - thisH} ${xR_back},${yR_back} ${xR_front},${yR_front}`}
                            fill="url(#cargoSideGrad)"
                            stroke="#556E1D"
                            strokeWidth="0.7"
                          />

                          {/* 3. Front Face (Rendered if this is the frontmost loaded row) */}
                          {isFrontmost && (
                            <g>
                              <polygon
                                points={`${xL_front},${yL_front} ${xR_front},${yR_front} ${xR_front},${yR_front - thisH} ${xL_front},${yL_front - thisH}`}
                                fill="url(#cargoFrontGrad)"
                                stroke="#7E9E26"
                                strokeWidth="1"
                              />

                              {/* Carton column lines on front face */}
                              {Array.from({ length: packingPlan.widthCount - 1 }).map((_, cIdx) => {
                                const frac = (cIdx + 1) / packingPlan.widthCount;
                                const colBottomX = xL_front + (xR_front - xL_front) * frac;
                                const colBottomY = yL_front + (yR_front - yL_front) * frac;
                                return (
                                  <line
                                    key={cIdx}
                                    x1={colBottomX}
                                    y1={colBottomY}
                                    x2={colBottomX}
                                    y2={colBottomY - thisH}
                                    stroke="#688523"
                                    strokeWidth="0.6"
                                    opacity="0.8"
                                  />
                                );
                              })}
                            </g>
                          )}
                        </g>
                      );
                    });
                  })()}

                  {/* Front Door Outer Beams & Posts */}
                  <line x1="140" y1="200" x2="270" y2="230" stroke="#484C52" strokeWidth="3" />
                  <line x1="270" y1="230" x2="270" y2="135" stroke="#484C52" strokeWidth="3" />
                  <line x1="270" y1="135" x2="140" y2="105" stroke="#484C52" strokeWidth="3" />
                  <line x1="140" y1="105" x2="140" y2="200" stroke="#484C52" strokeWidth="3" />

                  {/* Corner Castings */}
                  {[
                    [140, 200],
                    [270, 230],
                    [270, 135],
                    [140, 105],
                  ].map(([cx, cy], i) => (
                    <rect
                      key={i}
                      x={cx - 3}
                      y={cy - 3}
                      width="6"
                      height="6"
                      rx="1"
                      fill="#5A5F66"
                      stroke="#787E87"
                      strokeWidth="0.5"
                    />
                  ))}

                  {/* Open Container Door Wings (authentic 3D container depth) */}
                  {/* Left open door */}
                  <polygon
                    points="140,200 95,206 95,111 140,105"
                    fill="#1A1C1F"
                    stroke="#383B40"
                    strokeWidth="1.2"
                  />
                  <line x1="110" y1="204" x2="110" y2="109" stroke="#282B2F" strokeWidth="0.8" />
                  <line x1="125" y1="202" x2="125" y2="107" stroke="#282B2F" strokeWidth="0.8" />

                  {/* Right open door */}
                  <polygon
                    points="270,230 315,236 315,141 270,135"
                    fill="#1A1C1F"
                    stroke="#383B40"
                    strokeWidth="1.2"
                  />
                  <line x1="285" y1="232" x2="285" y2="137" stroke="#282B2F" strokeWidth="0.8" />
                  <line x1="300" y1="234" x2="300" y2="139" stroke="#282B2F" strokeWidth="0.8" />

                  {/* Dimension Blueprint Callout Lines */}
                  {/* 1. Width Dimension */}
                  <path d="M 140,242 L 270,272" stroke="#C7F33C" strokeWidth="1" strokeDasharray="3 2" />
                  <text
                    x="205"
                    y="254"
                    fill="#C7F33C"
                    fontSize="9.5"
                    fontWeight="bold"
                    textAnchor="middle"
                    className="font-mono select-none"
                  >
                    Width {currentContainer.widthCm} cm ({packingPlan.widthCount} ctns)
                  </text>

                  {/* 2. Height Dimension */}
                  <path d="M 85,204 L 85,112" stroke="#94A3B8" strokeWidth="1" strokeDasharray="3 2" />
                  <text
                    x="80"
                    y="158"
                    fill="#CBD5E1"
                    fontSize="9.5"
                    fontWeight="bold"
                    textAnchor="end"
                    className="font-mono select-none"
                  >
                    Height {currentContainer.heightCm} cm ({packingPlan.heightCount} tiers)
                  </text>

                  {/* 3. Length Dimension (Depth) */}
                  <path d="M 285,242 L 765,152" stroke="#94A3B8" strokeWidth="1" strokeDasharray="3 2" />
                  <text
                    x="510"
                    y="190"
                    fill="#CBD5E1"
                    fontSize="9.5"
                    fontWeight="bold"
                    textAnchor="middle"
                    transform="rotate(-10.5 510 190)"
                    className="font-mono select-none"
                  >
                    Depth {currentContainer.lengthCm} cm ({packingPlan.lengthCount} rows)
                  </text>
                </g>

                {/* HUD Live Loading Badge */}
                <g transform="translate(14, 14)">
                  <rect
                    x="0"
                    y="0"
                    width="230"
                    height="30"
                    rx="6"
                    fill="#181A1C"
                    stroke="#2D3033"
                    strokeWidth="1"
                    opacity="0.95"
                  />
                  <circle cx="14" cy="15" r="3.5" fill="#C7F33C" />
                  <text x="26" y="19" fill="#E2E8F0" fontSize="10.5" fontWeight="bold" className="font-mono">
                    {cartons.toLocaleString()} / {packingPlan.totalCartons.toLocaleString()} ctns ({pctContainerFill.toFixed(0)}% FCL)
                  </text>
                </g>
              </svg>
            )}

            {diagramMode === "DOOR" && (
              <div className="w-full flex flex-col md:flex-row items-stretch gap-4 p-1">
                {/* Left: Container Door Elevation */}
                <div className="flex-1 bg-[#17181A] rounded-xl border border-[#2A2B2D] p-3 flex flex-col items-center justify-center min-h-[220px]">
                  <div className="w-full flex items-center justify-between text-[10.5px] text-slate-400 font-medium mb-2 pb-1.5 border-b border-[#252729]">
                    <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                      Front Door Cross-Section View ({currentContainer.widthCm} cm × {currentContainer.heightCm} cm)
                    </span>
                    <span className="font-mono text-slate-400 text-[10px]">
                      Door Scale Ratio
                    </span>
                  </div>

                  {/* Container Door Frame Shell */}
                  <div className="relative p-2 bg-[#1C1E20] rounded-lg border-2 border-[#424548] shadow-inner max-w-full">
                    {/* Inner Door Opening */}
                    <div
                      className="relative bg-[#141516] border border-[#2D2F31] rounded-[3px] overflow-hidden flex flex-col justify-end"
                      style={{
                        width: "min(100%, 340px)",
                        height: "200px",
                      }}
                    >
                      {/* Overhead Clearance Gap Indicator */}
                      {packingPlan.heightGapCm > 0 && (
                        <div
                          className="w-full bg-[#181C14] border-b border-dashed border-[#556E1D]/60 flex items-center justify-center text-[9.5px] font-mono text-slate-400 select-none"
                          style={{
                            height: `${Math.max(16, (packingPlan.heightGapCm / currentContainer.heightCm) * 200)}px`,
                          }}
                        >
                          ↑ Overhead Gap: {packingPlan.heightGapCm} cm
                        </div>
                      )}

                      {/* Cargo Grid + Lateral Gap */}
                      <div className="flex-1 w-full flex">
                        {/* Clean Geometric Carton Grid (NO EMOJIS!) */}
                        <div
                          className="grid gap-[1px] bg-[#141516] flex-1 p-0.5"
                          style={{
                            gridTemplateColumns: `repeat(${packingPlan.widthCount}, minmax(0, 1fr))`,
                            gridTemplateRows: `repeat(${Math.min(packingPlan.heightCount, 25)}, minmax(0, 1fr))`,
                          }}
                        >
                          {Array.from({ length: packingPlan.widthCount * Math.min(packingPlan.heightCount, 25) }).map((_, i) => (
                            <div
                              key={i}
                              className="bg-[#242D16] border border-[#4D631B]/70 rounded-[1px] transition-colors hover:bg-[#323E1C]"
                            />
                          ))}
                        </div>

                        {/* Lateral Side Clearance Gap */}
                        {packingPlan.widthGapCm > 0 && (
                          <div
                            className="bg-[#181C14] border-l border-dashed border-[#556E1D]/60 flex items-center justify-center text-[9px] font-mono text-slate-400 select-none"
                            style={{
                              width: `${Math.max(20, (packingPlan.widthGapCm / currentContainer.widthCm) * 340)}px`,
                              writingMode: "vertical-rl",
                            }}
                          >
                            → Side Gap: {packingPlan.widthGapCm} cm
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Technical Cross-Section Breakdown */}
                <div className="w-full md:w-[260px] bg-[#17181A] rounded-xl border border-[#2A2B2D] p-3 flex flex-col justify-between">
                  <div>
                    <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2.5 pb-1 border-b border-[#252729]">
                      Slice Specifications
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[11px]">จำนวนต่อ 1 แถวลึก:</span>
                        <span className="font-extrabold text-[#C7F33C] tabular-nums">
                          {packingPlan.cartonsPerRow} ลัง
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 pl-1">
                        {packingPlan.widthCount} ลัง/กว้าง × {packingPlan.heightCount} ชั้น/สูง
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-[#232426]">
                        <span className="text-slate-400 text-[11px]">หน้าตัดต่อลัง:</span>
                        <span className="font-semibold text-slate-200 tabular-nums">
                          {packingPlan.cartonUsedW} × {cartonHeight} cm
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-[#232426]">
                        <span className="text-slate-400 text-[11px]">ช่องว่างด้านบน:</span>
                        <span className="font-semibold text-slate-200 tabular-nums">
                          {packingPlan.heightGapCm} cm
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-[#232426]">
                        <span className="text-slate-400 text-[11px]">ช่องว่างด้านข้าง:</span>
                        <span className="font-semibold text-slate-200 tabular-nums">
                          {packingPlan.widthGapCm} cm
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-[#232426]">
                        <span className="text-slate-400 text-[11px]">ความแน่นหน้าตัด:</span>
                        <span className="font-bold text-slate-100 tabular-nums">
                          {(
                            (((currentContainer.widthCm - packingPlan.widthGapCm) *
                              (currentContainer.heightCm - packingPlan.heightGapCm)) /
                              (currentContainer.widthCm * currentContainer.heightCm)) *
                            100
                          ).toFixed(1)}
                          %
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 bg-[#242D16] border border-[#688523]/50 rounded-lg p-2 text-center text-[10.5px] font-semibold text-[#C7F33C]">
                    1 แถวลึก = {packingPlan.cartonsPerRow} ลัง ({((packingPlan.cartonsPerRow * cbmPerCtn)).toFixed(2)} m³)
                  </div>
                </div>
              </div>
            )}

            {diagramMode === "TOP" && (
              <div className="w-full p-1 space-y-2">
                <div className="w-full flex items-center justify-between text-[10.5px] text-slate-400 font-medium pb-1 border-b border-[#252729]">
                  <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                    Top Bird's-Eye Floor Plan ({currentContainer.lengthCm} cm Length × {currentContainer.widthCm} cm Width)
                  </span>
                  <span className="font-mono text-[#C7F33C] font-bold">
                    {packingPlan.lengthCount} rows deep × {packingPlan.widthCount} columns = {packingPlan.lengthCount * packingPlan.widthCount} floor stacks
                  </span>
                </div>

                {/* Full-Width Container Floor CAD Deck */}
                <div className="w-full bg-[#18191B] rounded-xl border-2 border-[#3D4044] p-2.5 relative">
                  <div className="flex items-center justify-between text-[9.5px] font-mono text-slate-400 mb-1.5 px-1 uppercase tracking-wider">
                    <span>◄ Rear Bulkhead (ด้านในสุด)</span>
                    <span>Container Door (หน้าประตู) ►</span>
                  </div>

                  {/* Responsive Floor Grid */}
                  <div
                    className="w-full bg-[#131415] border border-[#2B2D2F] rounded p-1 grid gap-[2px]"
                    style={{
                      height: "130px",
                      gridTemplateColumns: `repeat(${packingPlan.lengthCount}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${packingPlan.widthCount}, minmax(0, 1fr))`,
                    }}
                  >
                    {Array.from({ length: packingPlan.lengthCount }).map((_, colIdx) => {
                      const isColLoaded = colIdx < packingPlan.fullRows;
                      const isPartial = colIdx === packingPlan.fullRows && packingPlan.partialRowProgress > 0;

                      return Array.from({ length: packingPlan.widthCount }).map((_, rowIdx) => (
                        <div
                          key={`${colIdx}-${rowIdx}`}
                          className={`rounded-[1px] transition-colors ${
                            isColLoaded
                              ? "bg-[#242D16] border border-[#688523]"
                              : isPartial
                              ? "bg-[#242D16]/50 border border-[#7E9E26]/50 border-dashed"
                              : "bg-[#161718] border border-[#232426]"
                          }`}
                          title={`Row ${colIdx + 1}, Stack ${rowIdx + 1} (${isColLoaded ? "Loaded" : isPartial ? "Partial" : "Empty"})`}
                        />
                      ));
                    })}
                  </div>

                  {/* Floor Length Clearance Ruler */}
                  <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-400 px-1 pt-1 border-t border-[#252729]">
                    <span>
                      Packed Length:{" "}
                      <strong className="text-slate-200">
                        {(Math.min(packingPlan.lengthCount, packingPlan.loadedRows) * packingPlan.cartonUsedL).toFixed(1)} cm
                      </strong>
                    </span>
                    <span>
                      Door Clearance:{" "}
                      <strong className="text-slate-200">
                        {packingPlan.lengthGapCm} cm
                      </strong>
                    </span>
                    <span>
                      Floor Utilization:{" "}
                      <strong className="text-[#C7F33C]">
                        {(
                          ((packingPlan.widthCount * packingPlan.cartonUsedW * packingPlan.lengthCount * packingPlan.cartonUsedL) /
                            (currentContainer.widthCm * currentContainer.lengthCm)) *
                          100
                        ).toFixed(1)}
                        %
                      </strong>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Blueprint Specs: กว้าง · ลึก · สูง · เต็มตู้ (Minimal Text) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {/* Fit 1: Width */}
            <div className="bg-[#252728] px-3 py-2 rounded-lg">
              <div className="text-[10px] font-medium text-slate-400">กว้าง</div>
              <div className="text-xs font-bold text-slate-100 tabular-nums">
                {packingPlan.widthCount} ลัง
                <span className="text-[10px] font-normal text-slate-500 ml-1">
                  (เหลือ {packingPlan.widthGapCm} cm)
                </span>
              </div>
            </div>

            {/* Fit 2: Depth */}
            <div className="bg-[#252728] px-3 py-2 rounded-lg">
              <div className="text-[10px] font-medium text-slate-400">ลึก</div>
              <div className="text-xs font-bold text-slate-100 tabular-nums">
                {packingPlan.lengthCount} แถว
                <span className="text-[10px] font-normal text-slate-500 ml-1">
                  (เหลือ {packingPlan.lengthGapCm} cm)
                </span>
              </div>
            </div>

            {/* Fit 3: Height */}
            <div className="bg-[#252728] px-3 py-2 rounded-lg">
              <div className="text-[10px] font-medium text-slate-400">สูง</div>
              <div className="text-xs font-bold text-slate-100 tabular-nums">
                {packingPlan.heightCount} ชั้น
                <span className="text-[10px] font-normal text-slate-500 ml-1">
                  (เหลือ {packingPlan.heightGapCm} cm)
                </span>
              </div>
            </div>

            {/* Fit 4: Max FCL Capacity */}
            <div className="bg-[#252728] px-3 py-2 rounded-lg">
              <div className="text-[10px] font-medium text-slate-400">เต็มตู้ (FCL)</div>
              <div className="text-xs font-black text-[#C7F33C] tabular-nums">
                {packingPlan.totalCartons.toLocaleString()} ลัง
                <span className="text-[10px] font-normal text-slate-400 ml-1">
                  ({packingPlan.spaceUtilization.toFixed(0)}%)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Commercial Summary Bar (Flat, Seamless) */}
      <div className="bg-[#252728] px-3.5 py-2.5 rounded-xl flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 font-medium">Quotation:</span>
          <span className="text-base font-extrabold text-[#C7F33C] tabular-nums tracking-tight">
            ฿{fmt(totalAmount)}
          </span>
          <span className="text-[10px] text-slate-500 font-semibold">THB</span>
          <span className="text-slate-600 text-xs">·</span>
          <span className="text-[11px] text-slate-400 tabular-nums">
            {cartons.toLocaleString()} ctns ({totalUnits.toLocaleString()} pcs)
          </span>
        </div>

        {totalSavings > 0 && (
          <div className="text-[10.5px] font-semibold text-emerald-300 bg-[#182618] border border-[#2E592E] px-2 py-0.5 rounded-md">
            Saved -฿{fmt(totalSavings)} ({appliedDiscount}%)
          </div>
        )}
      </div>
    </div>
  );
}
