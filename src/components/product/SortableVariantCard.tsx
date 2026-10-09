"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Upload,
  X,
  Plus,
  Trash2,
  Copy,
  Star,
  Check,
  GripVertical,
  Loader2,
} from "lucide-react";
import { ProductStatus } from "@prisma/client";
import {
  ProductVariantDTO,
  parsePriceConditions,
  calculateTierPrice,
  PriceStepTier,
} from "@/lib/product/product-dto";
import { getOptimizedCloudinaryUrl } from "@/lib/utils";
import {
  ExportPricingSimulation,
  CommercialRates,
  DEFAULT_COMMERCIAL_RATES,
} from "./ExportPricingSimulation";

// Dedicated carton max quantity input allowing smooth deleting and empty state
interface CartonMaxInputProps {
  value: number | null | undefined;
  min: number;
  onChange: (val: number | null) => void;
}

function CartonMaxInput({ value, min, onChange }: CartonMaxInputProps) {
  const [draft, setDraft] = useState<string>(value != null && value > 0 ? String(value) : "");

  useEffect(() => {
    setDraft(value != null && value > 0 ? String(value) : "");
  }, [value]);

  const commitValue = () => {
    if (draft.trim() === "") {
      setDraft("");
      onChange(null);
      return;
    }
    const parsed = parseInt(draft, 10);
    if (isNaN(parsed) || parsed < min) {
      setDraft("");
      onChange(null);
    } else {
      setDraft(String(parsed));
      if (parsed !== value) {
        onChange(parsed);
      }
    }
  };

  return (
    <input
      type="number"
      min={min}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (e.target.value === "") {
          onChange(null);
        } else {
          const parsed = parseInt(e.target.value, 10);
          if (!isNaN(parsed) && parsed >= min) {
            onChange(parsed);
          }
        }
      }}
      onBlur={commitValue}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={`${min + 1}+`}
      title={`Enter maximum cartons (minimum: ${min})`}
      className="w-16 h-7 bg-[#252728] border border-[#4E4F50] hover:border-slate-300 focus:border-[#C7F33C] focus:bg-[#202122] rounded-lg px-1.5 text-xs text-center font-semibold text-slate-100 outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}

// Dedicated discount % input enforcing ascending discount rules with empty-state support
interface TierDiscountInputProps {
  value: number | null | undefined;
  minAllowed: number;
  onChange: (val: number | null) => void;
}

function TierDiscountInput({ value, minAllowed, onChange }: TierDiscountInputProps) {
  const [draft, setDraft] = useState<string>(value != null && value > 0 ? String(value) : "");

  useEffect(() => {
    setDraft(value != null && value > 0 ? String(value) : "");
  }, [value]);

  const commitValue = () => {
    if (draft.trim() === "") {
      setDraft("");
      onChange(null);
      return;
    }
    const parsed = parseFloat(draft);
    if (isNaN(parsed) || parsed <= 0) {
      setDraft("");
      onChange(null);
    } else {
      const finalVal = Math.min(100, parsed);
      setDraft(String(finalVal));
      if (finalVal !== value) {
        onChange(finalVal);
      }
    }
  };

  return (
    <input
      type="number"
      step="0.1"
      min={minAllowed}
      max="100"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (e.target.value === "") {
          onChange(null);
        } else {
          const parsed = parseFloat(e.target.value);
          if (!isNaN(parsed) && parsed >= 0) {
            onChange(parsed);
          }
        }
      }}
      onBlur={commitValue}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={minAllowed > 0 ? `>${minAllowed}%` : "%"}
      title={`Enter discount %${minAllowed > 0 ? ` (must be greater than ${minAllowed}%)` : ""}`}
      className="w-14 h-7 bg-[#252728] border border-[#4E4F50] hover:border-slate-300 focus:border-[#C7F33C] focus:bg-[#202122] rounded-lg px-1 text-xs text-center font-semibold text-slate-100 outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}

interface PriceNumberInputProps {
  value: number | undefined;
  onChange: (val: number) => void;
  placeholder?: string;
}

function PriceNumberInput({ value, onChange, placeholder = "0.00" }: PriceNumberInputProps) {
  const [draft, setDraft] = useState<string>(
    value !== undefined && value !== null && !isNaN(value) ? String(value) : ""
  );

  useEffect(() => {
    if (value !== undefined && value !== null && !isNaN(value)) {
      if (draft === "" || parseFloat(draft) !== value) {
        setDraft(String(value));
      }
    } else {
      setDraft("");
    }
  }, [value]);

  const commitValue = () => {
    if (draft.trim() === "") {
      onChange(0);
      setDraft("0");
      return;
    }
    const parsed = parseFloat(draft);
    if (isNaN(parsed)) {
      onChange(0);
      setDraft("0");
    } else {
      onChange(parsed);
      setDraft(String(parsed));
    }
  };

  return (
    <input
      type="number"
      step="0.01"
      value={draft}
      onChange={(e) => {
        const val = e.target.value;
        setDraft(val);
        if (val.trim() === "") {
          onChange(0);
        } else {
          const parsed = parseFloat(val);
          if (!isNaN(parsed)) {
            onChange(parsed);
          }
        }
      }}
      onBlur={commitValue}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
      className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-[#C7F33C]"
    />
  );
}

interface CostNumberInputProps {
  value: number | null | undefined;
  onChange: (val: number | null) => void;
  placeholder?: string;
}

function CostNumberInput({
  value,
  onChange,
  placeholder = "Optional cost...",
}: CostNumberInputProps) {
  const [draft, setDraft] = useState<string>(
    value !== undefined && value !== null && !isNaN(value) ? String(value) : ""
  );

  useEffect(() => {
    if (value !== undefined && value !== null && !isNaN(value)) {
      if (draft === "" || parseFloat(draft) !== value) {
        setDraft(String(value));
      }
    } else {
      setDraft("");
    }
  }, [value]);

  const commitValue = () => {
    if (draft.trim() === "") {
      onChange(null);
      setDraft("");
      return;
    }
    const parsed = parseFloat(draft);
    if (isNaN(parsed) || parsed < 0) {
      onChange(null);
      setDraft("");
    } else {
      onChange(parsed);
      setDraft(String(parsed));
    }
  };

  return (
    <input
      type="number"
      step="0.01"
      value={draft}
      onChange={(e) => {
        const val = e.target.value;
        setDraft(val);
        if (val.trim() === "") {
          onChange(null);
        } else {
          const parsed = parseFloat(val);
          if (!isNaN(parsed) && parsed >= 0) {
            onChange(parsed);
          }
        }
      }}
      onBlur={commitValue}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
      className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-[#C7F33C]"
    />
  );
}

export interface SortableVariantCardProps {
  v: ProductVariantDTO;
  idx: number;
  total: number;
  currentEdit: {
    price: number;
    productCost: number | null;
    priceCondition: string;
    imageUrl?: string | null;
    status?: ProductStatus;
  };
  isThisPrimary: boolean;
  isExpanded: boolean;
  productName?: string;
  uploadingVariantId: string | null;
  variantRates: CommercialRates;
  appliedVariantId: string | null;
  onToggleExpand: () => void;
  onMove?: (idx: number, direction: "up" | "down") => void;
  onImageUpload: (file: File) => void;
  onRemoveImage: () => void;
  onSetPrimary: () => void;
  onToggleStatus: () => void;
  onPriceChange: (val: number) => void;
  onCostChange: (val: number | null) => void;
  onAddTier: () => void;
  onUpdateTier: (tierIndex: number, field: "maxQuantity" | "discountPercent", val: any) => void;
  onRemoveTier: (tierIndex: number) => void;
  onApplyToAll: () => void;
  onRatesChange: (newRates: CommercialRates) => void;
}

export function SortableVariantCard({
  v,
  idx: _idx,
  total: _total,
  currentEdit,
  isThisPrimary,
  isExpanded,
  productName: _productName,
  uploadingVariantId,
  variantRates,
  appliedVariantId,
  onToggleExpand,
  onMove: _onMove,
  onImageUpload,
  onRemoveImage,
  onSetPrimary,
  onToggleStatus,
  onPriceChange,
  onCostChange,
  onAddTier,
  onUpdateTier,
  onRemoveTier,
  onApplyToAll,
  onRatesChange,
}: SortableVariantCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: v.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 35 : 1,
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tiers = parsePriceConditions(currentEdit.priceCondition);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative bg-[#3A3B3C] rounded-2xl p-3 space-y-4 border-0 transition-all shadow-sm ${
        isDragging ? "ring-2 ring-[#C7F33C]/70 shadow-2xl bg-[#323334]" : ""
      }`}
    >
      {/* Header Row: Drag Handle + Thumbnail + Name/Formula + Collapsed Min-Max Price Badge */}
      <div
        onClick={onToggleExpand}
        className={`flex items-center gap-2.5 w-full cursor-pointer select-none transition-colors ${
          isExpanded ? "border-b border-[#252728] pb-3" : "pb-0"
        }`}
      >
        {/* Reorder Grip Handle */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex items-center shrink-0 select-none py-1"
        >
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="p-1 -ml-1 text-slate-500 hover:text-[#C7F33C] cursor-grab active:cursor-grabbing focus:outline-none transition-colors rounded hover:bg-[#252728]"
            title="Drag to reorder variant"
            aria-label="Drag to reorder variant"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        </div>

        {/* Left: Thumbnail & Image Controls */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative group w-14 h-14 rounded-xl bg-[#252728] border border-[#4E4F50] overflow-hidden flex items-center justify-center shrink-0 shadow-xs"
        >
          {currentEdit.imageUrl ? (
            <>
              <img
                src={getOptimizedCloudinaryUrl(currentEdit.imageUrl, 120)}
                alt={v.fullName || v.formula || "Variant"}
                className="w-full h-full object-contain p-1"
              />
              <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1 rounded bg-[#3A3B3C] text-[#C7F33C] hover:bg-white hover:text-black transition-colors cursor-pointer"
                  title="Change Image"
                >
                  <Upload className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={onRemoveImage}
                  className="p-1 rounded bg-[#3A3B3C] text-rose-400 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
                  title="Remove Image"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-full flex flex-col items-center justify-center text-slate-400 hover:text-[#C7F33C] hover:bg-[#2C2D30] transition-colors cursor-pointer p-1"
              title="Upload variant image"
            >
              {uploadingVariantId === v.id ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#C7F33C]" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span className="text-[9px] font-semibold mt-0.5">Upload</span>
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImageUpload(file);
          }}
          className="hidden"
        />

        {/* Header Titles: Formula & SKU - Full Width */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-[#C7F33C] bg-[#252728] px-2 py-0.5 rounded border border-[#4E4F50]/40">
              {v.formula || "Standard"}
            </span>
            {isThisPrimary && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#C7F33C] bg-[#C7F33C]/10 px-2 py-0.5 rounded border border-[#C7F33C]/30"
                title="Primary Variant"
              >
                <Star className="w-3 h-3 fill-[#C7F33C]" />
                <span>Primary</span>
              </span>
            )}
            {v.sku && (
              <span className="text-[11px] text-slate-400 font-mono">
                SKU: {v.sku}
              </span>
            )}
            {!isExpanded && (() => {
              const basePrice = Number(currentEdit.price || 0);
              const prices = [basePrice];
              tiers.forEach((t) => {
                if (t.discountPercent > 0) {
                  prices.push(calculateTierPrice(basePrice, t.discountPercent));
                }
              });
              const minPrice = Math.min(...prices);
              const maxPrice = Math.max(...prices);
              const hasRange = tiers.length > 0 && minPrice < maxPrice;

              return (
                <span
                  className="text-xs font-bold text-slate-200 bg-[#252728] px-2.5 py-0.5 rounded-md border border-[#4E4F50]/50 ml-auto tabular-nums"
                  title={
                    hasRange
                      ? `Step Price Range: ฿${minPrice.toFixed(2)} - ฿${maxPrice.toFixed(2)}`
                      : `Export Price: ฿${basePrice.toFixed(2)}`
                  }
                >
                  {hasRange
                    ? `฿${minPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - ฿${maxPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : `฿${basePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </span>
              );
            })()}
          </div>
        </div>
      </div>

      {/* COLLAPSIBLE BODY CONTENT */}
      {isExpanded && (
        <div className="space-y-4 pt-1">
          {/* Variant Action Toolbar: Set as Primary + Apply to All + In Stock Switch */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Primary Variant Button */}
              <button
                type="button"
                onClick={onSetPrimary}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isThisPrimary
                    ? "bg-[#252728] text-[#C7F33C] border border-[#C7F33C]/40 shadow-xs"
                    : "bg-[#252728] text-slate-400 hover:text-white border border-[#3E4042] hover:border-slate-400"
                }`}
                title={isThisPrimary ? "Primary Variant (Main Image)" : "Click to set as Primary Variant"}
              >
                <Star className={`w-3.5 h-3.5 ${isThisPrimary ? "fill-[#C7F33C] text-[#C7F33C]" : "text-slate-400"}`} />
                <span>{isThisPrimary ? "Primary Variant" : "Set as Primary"}</span>
              </button>

              {/* Apply to All Button */}
              {isThisPrimary && (
                <button
                  type="button"
                  onClick={onApplyToAll}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#252728] hover:bg-[#C7F33C] text-slate-300 hover:text-black transition-colors cursor-pointer border border-[#3E4042] hover:border-[#C7F33C] shadow-xs"
                  title="Apply Export Price, Cost & Step Tiers to all variants"
                >
                  {appliedVariantId === v.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#C7F33C]" />
                      <span className="text-[#C7F33C]">Applied to All!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Apply to All</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* In Stock Toggle */}
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-semibold transition-colors select-none ${
                  (currentEdit.status ?? v.status ?? ProductStatus.AVAILABLE) === ProductStatus.AVAILABLE
                    ? "text-[#C7F33C]"
                    : "text-slate-400"
                }`}
              >
                {(currentEdit.status ?? v.status ?? ProductStatus.AVAILABLE) === ProductStatus.AVAILABLE
                  ? "In Stock"
                  : "Out of Stock"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={(currentEdit.status ?? v.status ?? ProductStatus.AVAILABLE) === ProductStatus.AVAILABLE}
                onClick={onToggleStatus}
                className={`w-7 h-4 rounded-full transition-colors relative flex items-center p-0.5 cursor-pointer focus:outline-none ${
                  (currentEdit.status ?? v.status ?? ProductStatus.AVAILABLE) === ProductStatus.AVAILABLE
                    ? "bg-[#C7F33C]"
                    : "bg-[#18191A]"
                }`}
                title={
                  (currentEdit.status ?? v.status ?? ProductStatus.AVAILABLE) === ProductStatus.AVAILABLE
                    ? "Variant is In Stock"
                    : "Variant is Out of Stock / Discontinued"
                }
              >
                <div
                  className={`w-3 h-3 rounded-full transition-transform ${
                    (currentEdit.status ?? v.status ?? ProductStatus.AVAILABLE) === ProductStatus.AVAILABLE
                      ? "translate-x-3 bg-black"
                      : "translate-x-0 bg-slate-400"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Regular Pricing Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Export Price (THB) <span className="text-[#C7F33C]">*</span>
              </label>
              <PriceNumberInput
                value={currentEdit.price}
                onChange={onPriceChange}
                placeholder="0.00"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Cost (THB)
              </label>
              <CostNumberInput
                value={currentEdit.productCost}
                onChange={onCostChange}
                placeholder="Optional cost..."
              />
            </div>
          </div>

          {/* Dynamic Step Price (Volume Tier Discounts) */}
          <div className="flex flex-col gap-2 pt-2 border-t border-[#252728]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-200">
                  Volume Tier Discounts
                </label>
                <span className="text-[10px] text-slate-400 bg-[#252728] px-1.5 py-0.5 rounded border border-[#4E4F50]/50 font-medium">
                  Step Price
                </span>
              </div>
              <button
                type="button"
                onClick={onAddTier}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-[#252728] hover:bg-[#C7F33C] text-slate-300 hover:text-black transition-colors cursor-pointer border border-[#4E4F50] hover:border-[#C7F33C]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Tier</span>
              </button>
            </div>

            {tiers.length > 0 && (
              <div className="bg-[#252728] rounded-xl p-3 space-y-2 border border-[#4E4F50]/60">
                {/* Compact Table Header */}
                <div className="grid grid-cols-[175px_1fr_1.1fr_32px] gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2">
                  <span>Cartons (Volume)</span>
                  <span>Discount</span>
                  <span>Net Price</span>
                  <span></span>
                </div>

                {/* Tiers List */}
                {tiers.map((tier, tIdx) => {
                  const isLast = tIdx === tiers.length - 1;
                  const calculatedRate = calculateTierPrice(
                    currentEdit.price,
                    tier.discountPercent
                  );

                  return (
                    <div
                      key={tIdx}
                      className="grid grid-cols-[175px_1fr_1.1fr_32px] gap-2 items-center bg-[#3A3B3C] px-2.5 py-2 rounded-xl border border-[#4E4F50]/40"
                    >
                      {/* Col 1: Consecutive Carton Quantity Range */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-10 h-7 flex items-center justify-center rounded-lg bg-[#18191A] text-xs font-semibold text-slate-400 tabular-nums border border-[#3A3B3C]/70 shrink-0 cursor-not-allowed select-none"
                          title="Auto-calculated starting volume (non-editable)"
                        >
                          {tier.minQuantity}
                        </span>

                        <span className="w-3 text-center text-slate-400 text-xs font-semibold shrink-0 select-none">
                          -
                        </span>

                        {isLast ? (
                          <span
                            className="h-7 px-2.5 flex items-center justify-center rounded-lg bg-[#252728] border border-[#C7F33C]/40 text-[#C7F33C] text-xs font-semibold select-none shadow-xs"
                            title="Upper tier threshold is open-ended"
                          >
                            + more
                          </span>
                        ) : (
                          <CartonMaxInput
                            value={tier.maxQuantity}
                            min={tier.minQuantity}
                            onChange={(val) =>
                              onUpdateTier(tIdx, "maxQuantity", val)
                            }
                          />
                        )}

                        <span className="text-[11px] text-slate-400 shrink-0 select-none">
                          ctns
                        </span>
                      </div>

                      {/* Col 2: Discount Percent Input */}
                      <div className="flex items-center gap-1.5 justify-start">
                        <TierDiscountInput
                          value={tier.discountPercent}
                          minAllowed={
                            tIdx > 0
                              ? (tiers[tIdx - 1]?.discountPercent || 0) + 0.1
                              : 0.1
                          }
                          onChange={(val) =>
                            onUpdateTier(tIdx, "discountPercent", val)
                          }
                        />
                        <span className="text-xs text-slate-400 font-semibold">%</span>
                      </div>

                      {/* Col 3: Calculated Net Price */}
                      <div className="flex items-center justify-start">
                        <span className="font-mono text-xs font-bold text-[#C7F33C] bg-[#18191A] px-2.5 py-1 rounded-lg border border-[#3E4042] tracking-wide tabular-nums">
                          ฿{calculatedRate.toFixed(2)}
                        </span>
                      </div>

                      {/* Col 4: Delete Action */}
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => onRemoveTier(tIdx)}
                          className="p-1 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Remove Tier"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Export Pricing & Margin Analysis */}
          <div className="pt-2">
            {currentEdit.productCost && currentEdit.productCost > 0 ? (
              <ExportPricingSimulation
                basePrice={currentEdit.price}
                productCost={currentEdit.productCost}
                tiers={tiers}
                rates={variantRates || DEFAULT_COMMERCIAL_RATES}
                onRatesChange={onRatesChange}
              />
            ) : (
              <div className="p-3 bg-[#252728] rounded-xl border border-dashed border-[#4E4F50]/50 text-center">
                <p className="text-xs text-slate-400">
                  Fill <span className="text-slate-200 font-semibold">Cost (THB)</span> to show Export Pricing & Margin Analysis
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
