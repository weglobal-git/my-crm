"use client";

import React from "react";
import { FolderTree, Plus, SlidersHorizontal, X } from "lucide-react";
import { ProductStatus } from "@prisma/client";
import { ProductSearch } from "./ProductSearch";

interface ProductToolbarProps {
  activeTab: ProductStatus;
  onTabChange: (tab: ProductStatus) => void;
  stats: { availableCount: number; unavailableCount: number; totalCount: number };
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeCategory: string;
  onCategoryChange: (c: string) => void;
  activeBrand: string;
  onBrandChange: (b: string) => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
  onOpenManage?: () => void;
  onOpenCreateProduct: () => void;
  onCreateProductIntent?: () => void;
}

export function ProductToolbar({
  activeTab,
  onTabChange,
  stats,
  searchQuery,
  onSearchChange,
  activeCategory,
  onCategoryChange,
  activeBrand,
  onBrandChange,
  activeFilterCount,
  onOpenFilters,
  onOpenManage,
  onOpenCreateProduct,
  onCreateProductIntent,
}: ProductToolbarProps) {
  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    activeCategory !== "ALL" ||
    activeBrand !== "ALL";

  return (
    <div className="flex flex-col gap-2.5 px-4 pt-3 pb-2 shrink-0 select-none">
      {/* Primary Toolbar Row */}
      <div className="flex justify-between items-center gap-3 flex-wrap">
        {/* Left: Stock Status Tabs */}
        <div className="flex gap-1.5 bg-[#252728] p-1 rounded-full shrink-0">
          <button
            type="button"
            onClick={() => onTabChange(ProductStatus.AVAILABLE)}
            className={`px-4 py-1.5 text-xs font-semibold flex items-center gap-2 rounded-full transition-all cursor-pointer ${
              activeTab === ProductStatus.AVAILABLE
                ? "bg-[#3A3B3C] text-slate-100 font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>IN STOCK</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                activeTab === ProductStatus.AVAILABLE
                  ? "bg-[#252728] text-slate-200"
                  : "bg-[#1C1C1D] text-slate-400"
              }`}
            >
              {stats.availableCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange(ProductStatus.UNAVAILABLE)}
            className={`px-4 py-1.5 text-xs font-semibold flex items-center gap-2 rounded-full transition-all cursor-pointer ${
              activeTab === ProductStatus.UNAVAILABLE
                ? "bg-[#3A3B3C] text-slate-100 font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>OUT OF STOCK</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                activeTab === ProductStatus.UNAVAILABLE
                  ? "bg-[#252728] text-slate-200"
                  : "bg-[#1C1C1D] text-slate-400"
              }`}
            >
              {stats.unavailableCount}
            </span>
          </button>
        </div>

        {/* Right Tools: Search, Filter Trigger, Add Product Button */}
        <div className="flex items-center gap-2.5 shrink-0 ml-auto">
          <ProductSearch
            value={searchQuery}
            onChange={onSearchChange}
            placeholder="Search products..."
          />

          {/* Centralized Filters Button */}
          <button
            type="button"
            onClick={onOpenFilters}
            className={`h-8 px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer border-0 ${
              activeFilterCount > 0
                ? "bg-[#C7F33C] text-black font-bold"
                : "bg-[#3A3B3C] hover:bg-[#4E4F50] text-slate-300 hover:text-white"
            }`}
            title="Open filters"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-black text-[#C7F33C] text-[10px] font-bold flex items-center justify-center ml-0.5">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Manage Button (Categories & Brands) */}
          {onOpenManage && (
            <button
              type="button"
              onClick={onOpenManage}
              className="h-8 px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold bg-[#3A3B3C] hover:bg-[#4E4F50] text-slate-200 hover:text-white transition-colors cursor-pointer border-0"
              title="Manage Categories & Brands"
            >
              <FolderTree className="w-3.5 h-3.5 text-[#C7F33C]" />
              <span>Manage</span>
            </button>
          )}

          {/* Add Product Button */}
          <button
            type="button"
            onClick={onOpenCreateProduct}
            onPointerEnter={onCreateProductIntent}
            className="h-8 px-4 rounded-full text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-none"
          >
            <Plus className="w-4 h-4 text-black" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Active Quick-Filter Chips */}
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

          {activeCategory !== "ALL" && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#3A3B3C] text-slate-200 text-xs font-medium">
              <span>Category: {activeCategory}</span>
              <button
                type="button"
                onClick={() => onCategoryChange("ALL")}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {activeBrand !== "ALL" && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#3A3B3C] text-slate-200 text-xs font-medium">
              <span>Brand: {activeBrand}</span>
              <button
                type="button"
                onClick={() => onBrandChange("ALL")}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
