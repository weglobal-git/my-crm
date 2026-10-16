"use client";

import React, { memo } from "react";
import { Check, Package, Flame } from "lucide-react";
import { ProductListItemDTO } from "@/lib/product/product-dto";
import { getOptimizedCloudinaryUrl } from "@/lib/utils";

interface ProductCardRowProps {
  product: ProductListItemDTO;
  isSelected?: boolean;
  isChecked?: boolean;
  isDimmed?: boolean;
  onToggleCheck?: (id: string) => void;
  onSelect: (id: string) => void;
  onToggleBestSelling?: (id: string, isBestSelling: boolean) => void;
  onIntent?: (id: string) => void;
}

export const ProductCardRow = memo(function ProductCardRow({
  product,
  isSelected: _isSelected = false,
  isChecked = false,
  isDimmed = false,
  onToggleCheck,
  onSelect,
  onToggleBestSelling,
  onIntent,
}: ProductCardRowProps) {
  const isBestSelling = (product.starRating || 0) > 0;

  const handleRowClick = () => {
    onSelect(product.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(product.id);
    }
  };

  // Format Price
  const formatPrice = (price: number) =>
    `฿${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const genPriceText =
    product.minPrice > 0 && product.maxPrice > 0
      ? product.minPrice === product.maxPrice
        ? formatPrice(product.minPrice)
        : `${formatPrice(product.minPrice)} - ${formatPrice(product.maxPrice)}`
      : product.minPrice > 0
      ? formatPrice(product.minPrice)
      : "—";

  // Dynamic CBM & GW (ต่อลัง - บนล่าง)
  const numericCbm =
    typeof product.cbm === "number"
      ? product.cbm
      : parseFloat(product.cbm as unknown as string) || 0;

  const cbmFormatted =
    numericCbm > 0
      ? numericCbm < 0.01
        ? `${numericCbm.toFixed(4)} CBM`
        : `${numericCbm.toFixed(3)} CBM`
      : "— CBM";

  const gwFormatted = (() => {
    if (product.minGrossWeight && product.maxGrossWeight) {
      if (product.minGrossWeight === product.maxGrossWeight) {
        return `GW: ${Number(product.minGrossWeight.toFixed(2))} kg`;
      }
      return `GW: ${Number(product.minGrossWeight.toFixed(2))} - ${Number(product.maxGrossWeight.toFixed(2))} kg`;
    }
    if (product.cartonGrossWeight && product.cartonGrossWeight > 0) {
      return `GW: ${Number(product.cartonGrossWeight.toFixed(2))} kg`;
    }
    return "GW: —";
  })();

  // Containers Calculation (20ft & 40ft - บนล่าง)
  const cartons20ft = numericCbm > 0 ? Math.floor(28 / numericCbm) : 0;
  const cartons40ft = numericCbm > 0 ? Math.floor(58 / numericCbm) : 0;

  const container20ftText =
    numericCbm > 0 ? `${cartons20ft.toLocaleString()} (20ft)` : "— (20ft)";
  const container40ftText =
    numericCbm > 0 ? `${cartons40ft.toLocaleString()} (40ft)` : "— (40ft)";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={handleKeyDown}
      onPointerEnter={() => onIntent?.(product.id)}
      onFocus={() => onIntent?.(product.id)}
      className={`group w-full text-left transition-all duration-150 cursor-pointer select-none px-4 flex items-center min-h-[52px] ${
        isChecked
          ? "text-white bg-[#252820]/30 hover:bg-[#2C3122]/50"
          : isDimmed
          ? "text-slate-600 hover:bg-[#3A3B3C]/40"
          : "text-slate-200 hover:bg-[#3A3B3C]/60"
      }`}
    >
      {/* Desktop Grid Layout: Checkbox (20px), Image (44px), Full Product Name (1fr), CBM/GW (110px), 20ft/40ft (110px), General Export Price (120px) */}
      <div className="hidden sm:grid grid-cols-[20px_44px_minmax(0,1fr)_110px_110px_120px] gap-3 items-center w-full">
        {/* Col 0: Checkbox for Batch Print Selection */}
        <div
          role="checkbox"
          aria-checked={isChecked}
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCheck?.(product.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              e.preventDefault();
              onToggleCheck?.(product.id);
            }
          }}
          className="w-5 h-5 flex items-center justify-center shrink-0 cursor-pointer"
          title={isChecked ? "Deselect for print" : "Select for print"}
        >
          <div
            className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
              isChecked
                ? "border-[#4E5052] bg-[#2D2E30] text-[#C7F33C]"
                : "border-[#4E5052] bg-[#2D2E30]"
            }`}
          >
            {isChecked && <Check className="w-3 h-3 stroke-[2.5]" />}
          </div>
        </div>

        {/* Col 1: Square Product Image */}
        <div
          className={`w-11 h-11 rounded-lg bg-[#252728] border border-[#4E4F50]/50 overflow-hidden flex items-center justify-center shrink-0 relative transition-opacity duration-150 ${
            isDimmed ? "opacity-40 group-hover:opacity-80" : "opacity-100"
          }`}
        >
          {product.primaryImageUrl ? (
            <img
              src={getOptimizedCloudinaryUrl(product.primaryImageUrl, 100)}
              alt={product.name}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          ) : (
            <Package className="w-5 h-5 text-slate-400" />
          )}
        </div>

        {/* Col 2: Product Name (Maximized Full Width) */}
        <div className="min-w-0 pr-3 flex flex-col justify-center">
          <div className="flex items-center gap-2 min-w-0">
            <h4
              className={`font-medium text-[13px] leading-tight truncate transition-colors duration-150 ${
                isDimmed
                  ? "text-slate-500 group-hover:text-slate-300"
                  : isChecked
                  ? "text-white font-semibold"
                  : "text-slate-200"
              }`}
              title={product.name}
            >
              {product.name}
            </h4>
            {product.variantCount > 1 && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-sm shrink-0 tabular-nums transition-colors duration-150 ${
                  isDimmed
                    ? "bg-[#252728] text-slate-500"
                    : "bg-[#3A3B3C] text-slate-300"
                }`}
              >
                {product.variantCount}
              </span>
            )}

            {/* Best Selling Badge / Action */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleBestSelling?.(product.id, !isBestSelling);
              }}
              className={`shrink-0 flex items-center gap-1 px-0.5 py-0.5 rounded-full text-[10px] font-semibold transition-all cursor-pointer ${
                isBestSelling
                  ? isDimmed
                    ? "bg-amber-500/10 text-amber-300/50 border border-amber-500/20"
                    : "bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                  : "opacity-0 group-hover:opacity-100 bg-[#252728] hover:bg-[#323438] text-slate-400 hover:text-amber-300 border border-transparent hover:border-amber-500/30"
              }`}
              title={isBestSelling ? "Remove from Best Selling" : "Pin as Best Selling in this category"}
            >
              <Flame
                className={`w-3 h-3 ${
                  isBestSelling ? "fill-amber-400 text-amber-400" : "text-slate-400"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Col 3: CBM & GW (ต่อลัง - บนล่าง) */}
        <div className="min-w-0 flex flex-col justify-center">
          <span
            className={`text-[11px] font-medium truncate transition-colors duration-150 ${
              isDimmed ? "text-slate-600 group-hover:text-slate-400" : "text-slate-400"
            }`}
            title={gwFormatted}
          >
            {gwFormatted}
          </span>
          <span
            className={`text-[11px] font-medium truncate transition-colors duration-150 ${
              isDimmed ? "text-slate-600 group-hover:text-slate-400" : "text-slate-400"
            }`}
            title={cbmFormatted}
          >
            {cbmFormatted}
          </span>
        </div>

        {/* Col 4: จำนวนลัง 20ft & 40ft (บนล่าง) */}
        <div className="min-w-0 flex flex-col justify-center">
          <span
            className={`text-[11px] truncate font-medium transition-colors duration-150 ${
              isDimmed ? "text-slate-600 group-hover:text-slate-400" : "text-slate-400"
            }`}
            title={container20ftText}
          >
            {container20ftText}
          </span>
          <span
            className={`text-[11px] truncate font-medium transition-colors duration-150 ${
              isDimmed ? "text-slate-600 group-hover:text-slate-400" : "text-slate-400"
            }`}
            title={container40ftText}
          >
            {container40ftText}
          </span>
        </div>

        {/* Col 5: General Export Price (Quotation Price min-max) - Far Right */}
        <div className="min-w-0 flex flex-col justify-center items-end text-right">
          <span
            className={`text-xs font-medium truncate transition-colors duration-150 ${
              isDimmed
                ? "text-slate-500 group-hover:text-slate-300"
                : isChecked
                ? "text-white font-semibold"
                : "text-slate-200"
            }`}
            title={genPriceText}
          >
            {genPriceText}
          </span>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="flex sm:hidden flex-col gap-2 w-full py-1">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Checkbox for mobile */}
          <div
            role="checkbox"
            aria-checked={isChecked}
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCheck?.(product.id);
            }}
            className="w-5 h-5 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <div
              className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
                isChecked
                  ? "bg-[#2D2E30] border-[#688523] text-[#C7F33C]"
                  : "border-[#4E5052] bg-[#2D2E30]"
              }`}
            >
              {isChecked && <Check className="w-3 h-3 stroke-[2.5]" />}
            </div>
          </div>

          <div
            className={`w-10 h-10 rounded-lg bg-[#252728] border border-[#4E4F50]/50 overflow-hidden flex items-center justify-center shrink-0 relative transition-opacity duration-150 ${
              isDimmed ? "opacity-40" : "opacity-100"
            }`}
          >
            {product.primaryImageUrl ? (
              <img
                src={getOptimizedCloudinaryUrl(product.primaryImageUrl, 80)}
                alt={product.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <Package className="w-5 h-5 text-slate-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4
                className={`text-sm font-bold truncate transition-colors ${
                  isDimmed ? "text-slate-500" : "text-white"
                }`}
              >
                {product.name}
              </h4>
              {product.variantCount > 1 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded-sm shrink-0 tabular-nums transition-colors ${
                    isDimmed ? "bg-[#252728] text-slate-500" : "bg-[#252728] text-slate-300"
                  }`}
                >
                  {product.variantCount}
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleBestSelling?.(product.id, !isBestSelling);
                }}
                className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold transition-all cursor-pointer ${
                  isBestSelling
                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/40"
                    : "bg-[#252728] text-slate-400 border border-transparent"
                }`}
                title={isBestSelling ? "Remove from Best Selling" : "Pin as Best Selling in this category"}
              >
                <Flame
                  className={`w-3 h-3 ${
                    isBestSelling ? "fill-amber-400 text-amber-400" : "text-slate-400"
                  }`}
                />
                <span>{isBestSelling ? "Best Selling" : "Set Best"}</span>
              </button>
            </div>
            <div className="mt-0.5">
              <span
                className={`text-xs font-bold transition-colors ${
                  isDimmed ? "text-amber-400/40" : "text-amber-400"
                }`}
              >
                {genPriceText}
              </span>
            </div>
          </div>
        </div>
        <div
          className={`flex items-center justify-between text-[11px] pl-8 pt-1 border-t border-white/5 transition-colors ${
            isDimmed ? "text-slate-600" : "text-slate-400"
          }`}
        >
          <span>{gwFormatted} · {cbmFormatted}</span>
          <span>{container20ftText} | {container40ftText}</span>
        </div>
      </div>
    </div>
  );
});
