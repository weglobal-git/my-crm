"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  X,
  SlidersHorizontal,
  RotateCcw,
  Search,
  Package,
  Tag,
  Check,
  FolderTree,
} from "lucide-react";
import { ProductStatus } from "@prisma/client";

export interface ProductFilterContentProps {
  activeTab: ProductStatus;
  onTabChange: (tab: ProductStatus) => void;
  selectedCategories?: string[];
  onToggleCategory?: (category: string) => void;
  onClearCategories?: () => void;
  onSelectCategories?: (categories: string[]) => void;
  activeCategory?: string;
  onCategoryChange?: (category: string) => void;
  availableCategories: { category: string; count: number }[];
  selectedBrands?: string[];
  onToggleBrand?: (brand: string) => void;
  onClearBrands?: () => void;
  onSelectBrands?: (brands: string[]) => void;
  activeBrand?: string;
  onBrandChange?: (brand: string) => void;
  availableBrands: { brand: string; count: number }[];
  stats: { availableCount: number; unavailableCount: number; totalCount: number };
  activeFilterCount: number;
  onResetFilters: () => void;
  onClose?: () => void;
  onOpenManage?: () => void;
}

export function ProductFilterContent({
  activeTab,
  onTabChange,
  selectedCategories = [],
  onToggleCategory,
  onClearCategories,
  onSelectCategories,
  activeCategory = "ALL",
  onCategoryChange,
  availableCategories,
  selectedBrands = [],
  onToggleBrand,
  onClearBrands,
  onSelectBrands,
  activeBrand = "ALL",
  onBrandChange,
  availableBrands,
  stats,
  activeFilterCount,
  onResetFilters,
  onClose,
  onOpenManage,
}: ProductFilterContentProps) {
  const [categorySearch, setCategorySearch] = useState("");
  const [brandSearch, setBrandSearch] = useState("");

  const catQ = categorySearch.trim().toLowerCase();
  const brandQ = brandSearch.trim().toLowerCase();

  const totalCategoryCount = useMemo(() => {
    return availableCategories.reduce((sum, c) => sum + c.count, 0);
  }, [availableCategories]);

  const totalBrandCount = useMemo(() => {
    return availableBrands.reduce((sum, b) => sum + b.count, 0);
  }, [availableBrands]);

  const filteredCategories = useMemo(() => {
    if (!catQ) return availableCategories;
    return availableCategories.filter((c) => c.category.toLowerCase().includes(catQ));
  }, [availableCategories, catQ]);

  const filteredBrands = useMemo(() => {
    if (!brandQ) return availableBrands;
    return availableBrands.filter((b) => b.brand.toLowerCase().includes(brandQ));
  }, [availableBrands, brandQ]);

  // CATEGORY SELECTION STATE & HELPERS
  const allCategoryNames = useMemo(
    () => availableCategories.map((c) => c.category),
    [availableCategories]
  );
  const isNoneCategoriesActive =
    selectedCategories.length === 1 && selectedCategories[0] === "__NONE__";
  const isAllCategoriesActive =
    !isNoneCategoriesActive &&
    (selectedCategories.length === 0 ||
      (availableCategories.length > 0 && selectedCategories.length >= availableCategories.length));

  const categorySelectedCount = isNoneCategoriesActive
    ? 0
    : isAllCategoriesActive
    ? availableCategories.length
    : selectedCategories.length;

  const isCategoryChecked = (catName: string) => {
    if (isNoneCategoriesActive) return false;
    if (isAllCategoriesActive) return true;
    return selectedCategories.some((sc) => sc.toLowerCase() === catName.toLowerCase());
  };

  const handleToggleSingleCategory = (catName: string) => {
    if (isAllCategoriesActive) {
      // User is deselecting this category from the complete set
      const remaining = allCategoryNames.filter(
        (name) => name.toLowerCase() !== catName.toLowerCase()
      );
      if (onSelectCategories) {
        onSelectCategories(remaining);
      } else if (onToggleCategory) {
        onToggleCategory(catName);
      }
      onCategoryChange?.(catName);
    } else if (isNoneCategoriesActive) {
      // Starting from 0, select only this category
      if (onSelectCategories) {
        onSelectCategories([catName]);
      } else if (onToggleCategory) {
        onToggleCategory(catName);
      }
      onCategoryChange?.(catName);
    } else {
      const isCurrentlyChecked = selectedCategories.some(
        (sc) => sc.toLowerCase() === catName.toLowerCase()
      );
      if (isCurrentlyChecked) {
        const next = selectedCategories.filter(
          (sc) => sc.toLowerCase() !== catName.toLowerCase()
        );
        const resolvedNext = next.length === 0 ? ["__NONE__"] : next;
        if (onSelectCategories) {
          onSelectCategories(resolvedNext);
        } else if (onToggleCategory) {
          onToggleCategory(catName);
        }
      } else {
        const next = [...selectedCategories, catName];
        const resolvedNext =
          next.length >= availableCategories.length ? [] : next;
        if (onSelectCategories) {
          onSelectCategories(resolvedNext);
        } else if (onToggleCategory) {
          onToggleCategory(catName);
        }
      }
      onCategoryChange?.(catName);
    }
  };

  const handleToggleAllCategories = () => {
    if (isAllCategoriesActive) {
      // Deselect all
      if (onSelectCategories) {
        onSelectCategories(["__NONE__"]);
      } else {
        onClearCategories?.();
      }
      onCategoryChange?.("ALL");
    } else {
      // Select all
      if (onSelectCategories) {
        onSelectCategories([]);
      } else {
        onClearCategories?.();
      }
      onCategoryChange?.("ALL");
    }
  };

  // BRAND SELECTION STATE & HELPERS
  const allBrandNames = useMemo(
    () => availableBrands.map((b) => b.brand),
    [availableBrands]
  );
  const isNoneBrandsActive =
    selectedBrands.length === 1 && selectedBrands[0] === "__NONE__";
  const isAllBrandsActive =
    !isNoneBrandsActive &&
    (selectedBrands.length === 0 ||
      (availableBrands.length > 0 && selectedBrands.length >= availableBrands.length));

  const brandSelectedCount = isNoneBrandsActive
    ? 0
    : isAllBrandsActive
    ? availableBrands.length
    : selectedBrands.length;

  const isBrandChecked = (brandName: string) => {
    if (isNoneBrandsActive) return false;
    if (isAllBrandsActive) return true;
    return selectedBrands.some((sb) => sb.toLowerCase() === brandName.toLowerCase());
  };

  const handleToggleSingleBrand = (brandName: string) => {
    if (isAllBrandsActive) {
      // User is deselecting this brand from the complete set
      const remaining = allBrandNames.filter(
        (name) => name.toLowerCase() !== brandName.toLowerCase()
      );
      if (onSelectBrands) {
        onSelectBrands(remaining);
      } else if (onToggleBrand) {
        onToggleBrand(brandName);
      }
      onBrandChange?.(brandName);
    } else if (isNoneBrandsActive) {
      // Starting from 0, select only this brand
      if (onSelectBrands) {
        onSelectBrands([brandName]);
      } else if (onToggleBrand) {
        onToggleBrand(brandName);
      }
      onBrandChange?.(brandName);
    } else {
      const isCurrentlyChecked = selectedBrands.some(
        (sb) => sb.toLowerCase() === brandName.toLowerCase()
      );
      if (isCurrentlyChecked) {
        const next = selectedBrands.filter(
          (sb) => sb.toLowerCase() !== brandName.toLowerCase()
        );
        const resolvedNext = next.length === 0 ? ["__NONE__"] : next;
        if (onSelectBrands) {
          onSelectBrands(resolvedNext);
        } else if (onToggleBrand) {
          onToggleBrand(brandName);
        }
      } else {
        const next = [...selectedBrands, brandName];
        const resolvedNext =
          next.length >= availableBrands.length ? [] : next;
        if (onSelectBrands) {
          onSelectBrands(resolvedNext);
        } else if (onToggleBrand) {
          onToggleBrand(brandName);
        }
      }
      onBrandChange?.(brandName);
    }
  };

  const handleToggleAllBrands = () => {
    if (isAllBrandsActive) {
      // Deselect all
      if (onSelectBrands) {
        onSelectBrands(["__NONE__"]);
      } else {
        onClearBrands?.();
      }
      onBrandChange?.("ALL");
    } else {
      // Select all
      if (onSelectBrands) {
        onSelectBrands([]);
      } else {
        onClearBrands?.();
      }
      onBrandChange?.("ALL");
    }
  };

  return (
    <div className="flex flex-col gap-6 select-none">
      {/* SECTION 1: AVAILABILITY STATUS */}
      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
          AVAILABILITY
        </span>
        <div className="grid grid-cols-2 gap-2 bg-[#1C1C1D] p-1.5 rounded-2xl">
          <button
            type="button"
            onClick={() => onTabChange(ProductStatus.AVAILABLE)}
            className={`py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === ProductStatus.AVAILABLE
                ? "bg-[#3A3B3C] text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>IN STOCK</span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-bold tabular-nums ${
                activeTab === ProductStatus.AVAILABLE
                  ? "bg-[#252728] text-slate-200"
                  : "bg-[#252728]/50 text-slate-500"
              }`}
            >
              {stats.availableCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange(ProductStatus.UNAVAILABLE)}
            className={`py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === ProductStatus.UNAVAILABLE
                ? "bg-[#3A3B3C] text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>OUT OF STOCK</span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-bold tabular-nums ${
                activeTab === ProductStatus.UNAVAILABLE
                  ? "bg-[#252728] text-slate-200"
                  : "bg-[#252728]/50 text-slate-500"
              }`}
            >
              {stats.unavailableCount}
            </span>
          </button>
        </div>
      </div>

      {/* SECTION 2: CATEGORY (Checkbox & Cross-Filter Ready) */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            CATEGORY
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 font-medium">
              {availableCategories.length} categories
            </span>
            {onOpenManage && (
              <button
                type="button"
                onClick={() => {
                  onClose?.();
                  onOpenManage();
                }}
                className="flex items-center gap-1 text-[11px] font-semibold text-[#C7F33C] hover:text-[#d7ff4f] hover:underline cursor-pointer"
                title="Manage, reorder & set default category"
              >
                <FolderTree className="w-3 h-3" />
                <span>Manage</span>
              </button>
            )}
          </div>
        </div>

        {/* Category Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
            placeholder="Search category..."
            className="w-full bg-[#1C1C1D] border border-transparent rounded-xl pl-9 pr-8 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-[#C7F33C] transition-all"
          />
          {categorySearch && (
            <button
              type="button"
              onClick={() => setCategorySearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto hide-scrollbar">
          {/* ALL CATEGORY / SELECT ALL HEADER ROW */}
          <button
            type="button"
            onClick={handleToggleAllCategories}
            className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-xl transition-colors cursor-pointer border ${
              isAllCategoriesActive
                ? "bg-[#2D2E30] border-[#4E5052] text-slate-100 hover:bg-[#343638]"
                : categorySelectedCount > 0
                ? "bg-[#252728] border-[#3E4042] text-slate-200 hover:bg-[#2C2D2F]"
                : "bg-[#1C1C1D] border-transparent hover:bg-[#252728] text-slate-400"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
                  isAllCategoriesActive
                    ? "bg-[#242D16] border-[#7E9E26] text-[#C7F33C]"
                    : categorySelectedCount > 0
                    ? "bg-[#242D16] border-[#7E9E26] text-[#C7F33C]"
                    : "border-slate-600 bg-[#1E2021] hover:border-slate-400"
                }`}
              >
                {isAllCategoriesActive && <Check className="w-3 h-3 stroke-[2.5]" />}
                {!isAllCategoriesActive && categorySelectedCount > 0 && (
                  <div className="w-2 h-0.5 bg-[#C7F33C] rounded-full" />
                )}
              </div>
              <span className="text-xs font-black uppercase tracking-wider">
                {isAllCategoriesActive ? "ALL CATEGORIES" : "SELECT ALL"}
              </span>
              {categorySelectedCount > 0 && (
                <span className="text-[10.5px] px-2 py-0.5 rounded-full font-semibold bg-[#262F16] text-[#B8E62C] border border-[#4D631B] tabular-nums">
                  {categorySelectedCount} selected
                </span>
              )}
            </div>
            <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-[#1E2021] text-slate-400">
              {totalCategoryCount}
            </span>
          </button>

          {/* Individual Categories */}
          {filteredCategories.map((c) => {
            const isChecked = isCategoryChecked(c.category);

            return (
              <button
                key={c.category}
                type="button"
                onClick={() => handleToggleSingleCategory(c.category)}
                className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-xl transition-colors cursor-pointer ${
                  isChecked
                    ? "bg-transparent hover:bg-[#2D2E30] text-slate-200"
                    : "bg-transparent hover:bg-[#252627] text-slate-500 hover:text-slate-300"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
                      isChecked
                        ? "bg-[#242D16] border-[#688523] text-[#C7F33C]"
                        : "border-slate-600/70 bg-[#1E2021]"
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[2.5]" />}
                  </div>
                  <span className={`text-xs ${isChecked ? "font-normal text-slate-200" : "font-normal text-slate-500"}`}>
                    {c.category.toUpperCase()}
                  </span>
                </div>
                <span
                  className={`text-[11px] font-normal px-2 py-0.5 rounded-full ${
                    isChecked
                      ? "bg-[#1E2021] text-slate-400"
                      : "bg-transparent text-slate-600"
                  }`}
                >
                  {c.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 3: BRAND (Checkbox & Cross-Filter Ready) */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            BRAND
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 font-medium">
              {availableBrands.length} brands
            </span>
            {onOpenManage && (
              <button
                type="button"
                onClick={() => {
                  onClose?.();
                  onOpenManage();
                }}
                className="flex items-center gap-1 text-[11px] font-semibold text-[#C7F33C] hover:text-[#d7ff4f] hover:underline cursor-pointer"
                title="Manage, reorder & set default brand"
              >
                <FolderTree className="w-3 h-3" />
                <span>Manage</span>
              </button>
            )}
          </div>
        </div>

        {/* Dedicated Brand Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={brandSearch}
            onChange={(e) => setBrandSearch(e.target.value)}
            placeholder="Search brand..."
            className="w-full bg-[#1C1C1D] border border-transparent rounded-xl pl-9 pr-8 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-[#C7F33C]/60 transition-all"
          />
          {brandSearch && (
            <button
              type="button"
              onClick={() => setBrandSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Brand List */}
        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto hide-scrollbar">
          {/* ALL BRAND / SELECT ALL HEADER ROW */}
          <button
            type="button"
            onClick={handleToggleAllBrands}
            className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-xl transition-colors cursor-pointer border ${
              isAllBrandsActive
                ? "bg-[#2D2E30] border-[#4E5052] text-slate-100 hover:bg-[#343638]"
                : brandSelectedCount > 0
                ? "bg-[#252728] border-[#3E4042] text-slate-200 hover:bg-[#2C2D2F]"
                : "bg-[#1C1C1D] border-transparent hover:bg-[#252728] text-slate-400"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
                  isAllBrandsActive
                    ? "bg-[#242D16] border-[#7E9E26] text-[#C7F33C]"
                    : brandSelectedCount > 0
                    ? "bg-[#242D16] border-[#7E9E26] text-[#C7F33C]"
                    : "border-slate-600 bg-[#1E2021] hover:border-slate-400"
                }`}
              >
                {isAllBrandsActive && <Check className="w-3 h-3 stroke-[2.5]" />}
                {!isAllBrandsActive && brandSelectedCount > 0 && (
                  <div className="w-2 h-0.5 bg-[#C7F33C] rounded-full" />
                )}
              </div>
              <span className="text-xs font-black uppercase tracking-wider">
                {isAllBrandsActive ? "ALL BRANDS" : "SELECT ALL"}
              </span>
              {brandSelectedCount > 0 && (
                <span className="text-[10.5px] px-2 py-0.5 rounded-full font-semibold bg-[#262F16] text-[#B8E62C] border border-[#4D631B] tabular-nums">
                  {brandSelectedCount} selected
                </span>
              )}
            </div>
            <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-[#1E2021] text-slate-400">
              {totalBrandCount}
            </span>
          </button>

          {/* Individual Brands */}
          {filteredBrands.map((b) => {
            const isChecked = isBrandChecked(b.brand);

            return (
              <button
                key={b.brand}
                type="button"
                onClick={() => handleToggleSingleBrand(b.brand)}
                className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-xl transition-colors cursor-pointer ${
                  isChecked
                    ? "bg-transparent hover:bg-[#2D2E30] text-slate-200"
                    : "bg-transparent hover:bg-[#252627] text-slate-500 hover:text-slate-300"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
                      isChecked
                        ? "bg-[#242D16] border-[#688523] text-[#C7F33C]"
                        : "border-slate-600/70 bg-[#1E2021]"
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[2.5]" />}
                  </div>
                  <span className={`text-xs ${isChecked ? "font-normal text-slate-200" : "font-normal text-slate-500"}`}>
                    {b.brand.toUpperCase()}
                  </span>
                </div>
                <span
                  className={`text-[11px] font-normal px-2 py-0.5 rounded-full ${
                    isChecked
                      ? "bg-[#1E2021] text-slate-400"
                      : "bg-transparent text-slate-600"
                  }`}
                >
                  {b.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Reset Filters Action */}
      {activeFilterCount > 0 && (
        <div className="pt-2 border-t border-[#1C1C1D]">
          <button
            type="button"
            onClick={onResetFilters}
            className="w-full py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All Filters</span>
          </button>
        </div>
      )}
    </div>
  );
}

interface ProductFiltersDrawerProps extends ProductFilterContentProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProductFiltersDrawer({
  isOpen,
  onClose,
  ...contentProps
}: ProductFiltersDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Floating Drawer Card (100% matched with AccountFiltersDrawer) */}
      <div
        className={`fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[450px] md:max-w-[calc(100vw-32px)] z-[101] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right ${
          isOpen
            ? "opacity-100 translate-y-0 md:translate-x-0 scale-100"
            : "opacity-0 translate-y-4 md:translate-x-8 scale-[0.97] pointer-events-none"
        }`}
      >
        <div
          ref={drawerRef}
          className="w-full bg-[#252728] border-0 md:border border-[#3A3B3C] flex flex-col h-full rounded-none md:rounded-2xl overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 sm:p-6 border-b border-[#1C1C1D] shrink-0 bg-[#252728]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#3A3B3C] border border-[#4E4F50] flex items-center justify-center shrink-0">
                <SlidersHorizontal className="w-4 h-4 text-[#C7F33C]" />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-100">Manage & Filters</h2>
                {contentProps.activeFilterCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#C7F33C] text-black text-[11px] font-bold">
                    {contentProps.activeFilterCount} Active
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-[#3A3B3C] rounded-full transition-colors text-slate-400 hover:text-slate-200 cursor-pointer"
              aria-label="Close filters"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Filters Body */}
          <div className="flex-1 overflow-y-auto hide-scrollbar p-6">
            <ProductFilterContent {...contentProps} onClose={onClose} />
          </div>
        </div>
      </div>
    </>
  );
}
