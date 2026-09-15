"use client";

import React from "react";
import { Plus, SlidersHorizontal, X } from "lucide-react";
import { ContactStatus, ContactType } from "@prisma/client";
import { AccountSearch } from "./AccountSearch";
import type { AccountFiltersState } from "./AccountFiltersDrawer";

interface AccountToolbarProps {
  activeTab: "QUALIFIED" | "UNQUALIFIED";
  onTabChange: (tab: "QUALIFIED" | "UNQUALIFIED") => void;
  stats: { qualifiedCount: number; unqualifiedCount: number; totalCount: number };
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filters: AccountFiltersState;
  onFiltersChange: (newFilters: AccountFiltersState) => void;
  onOpenFilters: () => void;
  onOpenCreateAccount: () => void;
  onCreateAccountIntent?: () => void;
  isDrawerOpen?: boolean;
}

export function AccountToolbar({
  activeTab,
  onTabChange,
  stats,
  searchQuery,
  onSearchChange,
  filters,
  onFiltersChange,
  onOpenFilters,
  onOpenCreateAccount,
  onCreateAccountIntent,
  isDrawerOpen = false,
}: AccountToolbarProps) {
  // Count how many non-default filters are active
  const activeFiltersCount =
    (filters.type !== "ALL" && filters.type !== "CUSTOMER" ? 1 : 0) +
    (filters.country !== "ALL" ? 1 : 0) +
    (filters.minRating > 0 ? 1 : 0);

  const hasActiveFilters = activeFiltersCount > 0 || Boolean(searchQuery.trim());

  return (
    <div className="flex flex-col gap-2.5 px-4 pt-3 pb-2 shrink-0 select-none">
      {/* Primary Toolbar Row */}
      <div className="flex justify-between items-center gap-3 flex-wrap">
        {/* Left: Qualification Tabs (Qualified & Unqualified) */}
        <div className="flex gap-1.5 bg-[#252728] p-1 rounded-full shrink-0">
          <button
            type="button"
            onClick={() => onTabChange("QUALIFIED")}
            className={`px-4 py-1.5 text-xs font-semibold flex items-center gap-2 rounded-full transition-all cursor-pointer ${
              activeTab === "QUALIFIED"
                ? "bg-[#3A3B3C] text-slate-100 font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>QUALIFIED</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                activeTab === "QUALIFIED"
                  ? "bg-[#252728] text-slate-200"
                  : "bg-[#1C1C1D] text-slate-400"
              }`}
            >
              {stats.qualifiedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange("UNQUALIFIED")}
            className={`px-4 py-1.5 text-xs font-semibold flex items-center gap-2 rounded-full transition-all cursor-pointer ${
              activeTab === "UNQUALIFIED"
                ? "bg-[#3A3B3C] text-slate-100 font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>UNQUALIFIED</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                activeTab === "UNQUALIFIED"
                  ? "bg-[#252728] text-slate-200"
                  : "bg-[#1C1C1D] text-slate-400"
              }`}
            >
              {stats.unqualifiedCount}
            </span>
          </button>
        </div>

        {/* Right Tools: Search, Filter Drawer Trigger, Add Account Button */}
        <div className="flex items-center gap-2.5 shrink-0 ml-auto">
          <AccountSearch
            value={searchQuery}
            onChange={onSearchChange}
          />

          {/* Centralized Filters Button */}
          <button
            type="button"
            onClick={onOpenFilters}
            className={`h-8 px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer border-0 ${
              activeFiltersCount > 0
                ? "bg-[#C7F33C] text-black font-bold"
                : "bg-[#3A3B3C] hover:bg-[#4E4F50] text-slate-300 hover:text-white"
            }`}
            title="Open filters"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-black text-[#C7F33C] text-[10px] font-bold flex items-center justify-center ml-0.5">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* Add Account Button */}
          <button
            type="button"
            onClick={onOpenCreateAccount}
            onPointerEnter={onCreateAccountIntent}
            className="h-8 px-4 rounded-full text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-none"
          >
            <Plus className="w-4 h-4 text-black" />
            <span>Add Account</span>
          </button>
        </div>
      </div>

      {/* Active Quick-Filter Chips (Additive & Transparent) */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap text-xs pt-1">
          <span className="text-slate-400 font-medium text-[11px]">Active filters:</span>

          {searchQuery && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#3A3B3C] text-slate-200 text-xs font-medium">
              <span>Search: &ldquo;{searchQuery}&rdquo;</span>
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.type !== "ALL" && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#3A3B3C] text-slate-200 text-xs font-medium">
              <span>Type: {filters.type}</span>
              <button
                type="button"
                onClick={() => onFiltersChange({ ...filters, type: "ALL" })}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.country !== "ALL" && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#3A3B3C] text-slate-200 text-xs font-medium">
              <span>Country: {filters.country}</span>
              <button
                type="button"
                onClick={() => onFiltersChange({ ...filters, country: "ALL" })}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.minRating > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#3A3B3C] text-slate-200 text-xs font-medium">
              <span>Rating: &ge; {filters.minRating}★</span>
              <button
                type="button"
                onClick={() => onFiltersChange({ ...filters, minRating: 0 })}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              onSearchChange("");
              onFiltersChange({
                status: activeTab,
                type: "CUSTOMER",
                country: "ALL",
                minRating: 0,
              });
            }}
            className="text-[11px] text-[#C7F33C] hover:underline font-semibold cursor-pointer ml-1"
          >
            Reset All
          </button>
        </div>
      )}
    </div>
  );
}
