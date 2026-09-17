"use client";

import React, { memo, useState } from "react";
import { Star } from "lucide-react";
import type { AccountCardDTO } from "@/lib/contact/account-card-dto";
import { normalizeCountryName } from "@/lib/data/countries";

interface AccountCardRowProps {
  account: AccountCardDTO;
  isSelected?: boolean;
  onSelect: (id: string) => void;
  onRatingChange: (id: string, newRating: number) => void;
  onIntent?: (id: string) => void;
}

export const AccountCardRow = memo(function AccountCardRow({
  account,
  isSelected = false,
  onSelect,
  onRatingChange,
  onIntent,
}: AccountCardRowProps) {
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const displayName = account.displayName?.trim() || account.name;
  const officialName = account.name;
  const showOfficialSubtitle = Boolean(officialName);

  const currentRating = account.starRating || 0;
  const effectiveRating = hoverRating !== null ? hoverRating : currentRating;

  // Format type nicely (e.g. TRADER -> Trader, CUSTOMER -> Customer)
  const formattedType =
    account.type === "TRADER"
      ? "Trader"
      : account.type.charAt(0).toUpperCase() + account.type.slice(1).toLowerCase().replace(/_/g, " ");

  const countryDisplay = account.country ? normalizeCountryName(account.country) : "—";

  const handleRowClick = () => {
    onSelect(account.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(account.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={handleKeyDown}
      onPointerEnter={() => onIntent?.(account.id)}
      onFocus={() => onIntent?.(account.id)}
      className={`group w-full text-left rounded-xl transition-all duration-150 cursor-pointer select-none px-6 py-1.5 mb-2.5 flex items-center min-h-[52px] border border-transparent ${
        isSelected
          ? "bg-[#C7F33C] text-black shadow-md"
          : "bg-[#3A3B3C] hover:bg-[#2C2D30] text-slate-100"
      }`}
    >
      {/* Desktop Grid Layout */}
      <div className="hidden sm:grid grid-cols-[72px_minmax(0,1fr)_170px_120px_100px] gap-4 items-center w-full">
        {/* Col 1: Success Rate Percentage & Won/Total Valued Deals */}
        <div className="w-[72px] shrink-0 flex flex-col justify-center">
          <span
            className={`text-lg font-bold tracking-tight leading-none ${
              isSelected ? "text-black" : "text-white"
            }`}
          >
            {account.successRate}%
          </span>
          <span
            className={`text-[11px] font-medium leading-tight mt-0.5 tabular-nums ${
              isSelected ? "text-black/70" : "text-slate-400"
            }`}
          >
            {account.wonDealsCount}/{account.totalDealsCount}
          </span>
        </div>

        {/* Col 2: Account Name & Legal/Company Subtitle */}
        <div className="min-w-0 pr-2 flex flex-col justify-center">
          <h4
            className={`font-semibold text-[13px] leading-tight truncate ${
              isSelected ? "text-black" : "text-white"
            }`}
            title={displayName}
          >
            {displayName}
          </h4>
          {showOfficialSubtitle && (
            <p
              className={`text-xs truncate mt-0.5 leading-tight ${
                isSelected ? "text-black/70 font-medium" : "text-slate-400 font-medium"
              }`}
              title={officialName}
            >
              {officialName}
            </p>
          )}
        </div>

        {/* Col 3: Star Rating */}
        <div
          className="w-[170px] shrink-0 flex items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
          onMouseLeave={() => setHoverRating(null)}
        >
          <div className="flex items-center">
            {[1, 2, 3, 4, 5].map((star) => {
              const isFilled = star <= effectiveRating;
              return (
                <button
                  key={star}
                  type="button"
                  aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const nextRating = currentRating === star ? 0 : star;
                    onRatingChange(account.id, nextRating);
                  }}
                  onMouseEnter={() => setHoverRating(star)}
                  className="rounded transition-transform hover:scale-125 focus:outline-none cursor-pointer"
                >
                  <Star
                    className={`w-3 h-3 mr-0.5 transition-colors ${
                      isSelected
                        ? isFilled
                          ? "fill-black text-black"
                          : "text-black/30 fill-transparent"
                        : isFilled
                        ? "fill-amber-400 text-amber-400"
                        : "text-slate-600 fill-transparent group-hover:text-slate-500"
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <span
            className={`text-xs font-bold min-w-[12px] ml-0.5 ${
              isSelected ? "text-black" : "text-amber-400"
            }`}
          >
            {effectiveRating}
          </span>
        </div>

        {/* Col 4: Account Type */}
        <div className="w-[120px] shrink-0 flex items-center">
          <span
            className={`font-normal text-[13px] leading-tight truncate ${
              isSelected ? "text-black" : "text-slate-200"
            }`}
          >
            {formattedType}
          </span>
        </div>

        {/* Col 5: Country */}
        <div className="w-[100px] shrink-0 flex items-center justify-end">
          <span
            className={`font-normal text-[13px] leading-tight truncate text-right ${
              isSelected ? "text-black" : "text-slate-200"
            }`}
          >
            {countryDisplay}
          </span>
        </div>
      </div>

      {/* Mobile Layout (Clean Single-Row for Mobile) */}
      <div className="flex sm:hidden items-center justify-between w-full py-1">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="shrink-0 flex flex-col items-center justify-center min-w-[50px]">
            <span
              className={`text-base font-bold tracking-tight leading-none ${
                isSelected ? "text-black" : "text-white"
              }`}
            >
              {account.successRate}%
            </span>
            <span
              className={`text-[10px] font-medium leading-tight mt-0.5 tabular-nums ${
                isSelected ? "text-black/70" : "text-slate-400"
              }`}
            >
              {account.wonDealsCount}/{account.totalDealsCount}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h4
              className={`text-sm font-bold truncate ${
                isSelected ? "text-black" : "text-white"
              }`}
            >
              {displayName}
            </h4>
            {showOfficialSubtitle && (
              <p
                className={`text-xs truncate ${
                  isSelected ? "text-black/70 font-semibold" : "text-slate-400"
                }`}
              >
                {officialName}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
