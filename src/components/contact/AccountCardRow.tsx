"use client";

import React, { memo, useState } from "react";
import { Star, Bot } from "lucide-react";
import type { AccountCardDTO } from "@/lib/contact/account-card-dto";
import { normalizeCountryName } from "@/lib/data/countries";

interface AccountCardRowProps {
  account: AccountCardDTO;
  isSelected?: boolean;
  onSelect: (id: string) => void;
  onRatingChange: (id: string, newRating: number) => void;
  onIntent?: (id: string) => void;
  onOpenAISummary?: (id: string) => void;
}

export const AccountCardRow = memo(function AccountCardRow({
  account,
  isSelected: _isSelected = false,
  onSelect,
  onRatingChange,
  onIntent,
  onOpenAISummary,
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
      className="group w-full text-left rounded-xl transition-all duration-150 cursor-pointer select-none px-6 py-1.5 mb-2.5 flex items-center min-h-[52px] border border-transparent bg-[#3A3B3C] hover:bg-[#2C2D30] text-slate-100"
    >
      {/* Desktop Grid Layout */}
      <div className="hidden sm:grid grid-cols-[72px_minmax(0,1fr)_170px_120px_100px] gap-4 items-center w-full">
        {/* Col 1: Success Rate Percentage & Won/Total Valued Deals */}
        <div className="w-[72px] shrink-0 flex flex-col justify-center">
          <span className="text-lg font-bold tracking-tight leading-none text-white">
            {account.successRate}%
          </span>
          <span className="text-[11px] font-medium leading-tight mt-0.5 tabular-nums text-slate-400">
            {account.wonDealsCount}/{account.totalDealsCount}
          </span>
        </div>

        {/* Col 2: Account Name & Legal/Company Subtitle */}
        <div className="min-w-0 pr-2 flex flex-col justify-center">
          <div className="flex items-center gap-1.5 min-w-0">
            <h4
              className="font-semibold text-[13px] leading-tight truncate text-white"
              title={displayName}
            >
              {displayName}
            </h4>
            {account.hasAiSummary && (
              <button
                type="button"
                aria-label="View AI Summary & Web Research"
                title="View AI Summary & Web Research"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenAISummary?.(account.id);
                }}
                className="p-1 -my-1 rounded transition-all duration-150 shrink-0 cursor-pointer flex items-center justify-center text-[#C7F33C] hover:text-[#d4f85e] hover:bg-[#C7F33C]/15 active:scale-95"
              >
                <Bot className="w-5 h-5" />
              </button>
            )}
          </div>
          {showOfficialSubtitle && (
            <p
              className="text-xs truncate mt-0.5 leading-tight text-slate-400 font-medium"
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
                      isFilled
                        ? "fill-amber-400 text-amber-400"
                        : "text-slate-600 fill-transparent group-hover:text-slate-500"
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <span className="text-xs font-bold min-w-[12px] ml-0.5 text-amber-400">
            {effectiveRating}
          </span>
        </div>

        {/* Col 4: Account Type */}
        <div className="w-[120px] shrink-0 flex items-center">
          <span className="font-normal text-[13px] leading-tight truncate text-slate-200">
            {formattedType}
          </span>
        </div>

        {/* Col 5: Country */}
        <div className="w-[100px] shrink-0 flex items-center justify-end">
          <span className="font-normal text-[13px] leading-tight truncate text-right text-slate-200">
            {countryDisplay}
          </span>
        </div>
      </div>

      {/* Mobile Layout (Clean Single-Row for Mobile) */}
      <div className="flex sm:hidden items-center justify-between w-full py-1">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="shrink-0 flex flex-col items-center justify-center min-w-[50px]">
            <span className="text-base font-bold tracking-tight leading-none text-white">
              {account.successRate}%
            </span>
            <span className="text-[10px] font-medium leading-tight mt-0.5 tabular-nums text-slate-400">
              {account.wonDealsCount}/{account.totalDealsCount}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <h4 className="text-sm font-bold truncate text-white">
                {displayName}
              </h4>
              {account.hasAiSummary && (
                <button
                  type="button"
                  aria-label="View AI Summary & Web Research"
                  title="View AI Summary & Web Research"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAISummary?.(account.id);
                  }}
                  className="p-1 -my-1 rounded transition-all duration-150 shrink-0 cursor-pointer flex items-center justify-center text-[#C7F33C] hover:text-[#d4f85e] hover:bg-[#C7F33C]/15 active:scale-95"
                >
                  <Bot className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {showOfficialSubtitle && (
              <p className="text-xs truncate text-slate-400">
                {officialName}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
