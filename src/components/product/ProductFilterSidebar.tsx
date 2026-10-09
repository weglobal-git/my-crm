"use client";

import React, { useState, useMemo } from "react";
import { Search, X, Check, Star } from "lucide-react";

interface ProductFilterSidebarProps {
  selectedCategories: string[];
  onToggleCategory: (category: string) => void;
  onClearCategories: () => void;
  onSelectCategories?: (categories: string[]) => void;
  availableCategories?: { id?: string; category: string; count: number; isDefault?: boolean }[];
  selectedBrands: string[];
  onToggleBrand: (brand: string) => void;
  onClearBrands: () => void;
  onSelectBrands?: (brands: string[]) => void;
  availableBrands?: { id?: string; brand: string; count: number; isDefault?: boolean }[];
}

export const ProductFilterSidebar = React.memo(function ProductFilterSidebar({
  selectedCategories = [],
  onToggleCategory,
  onClearCategories,
  onSelectCategories,
  availableCategories = [],
  selectedBrands = [],
  onToggleBrand,
  onClearBrands,
  onSelectBrands,
  availableBrands = [],
}: ProductFilterSidebarProps) {
  const [categorySearch, setCategorySearch] = useState("");
  const [brandSearch, setBrandSearch] = useState("");

  const catQ = categorySearch.trim().toLowerCase();
  const brandQ = brandSearch.trim().toLowerCase();

  // Total count across all categories
  const totalCategoryCount = useMemo(() => {
    return availableCategories.reduce((sum, c) => sum + c.count, 0);
  }, [availableCategories]);

  // Total count across all brands
  const totalBrandCount = useMemo(() => {
    return availableBrands.reduce((sum, b) => sum + b.count, 0);
  }, [availableBrands]);

  // Filtered categories by search
  const filteredCategories = useMemo(() => {
    if (!catQ) return availableCategories;
    return availableCategories.filter((c) => c.category.toLowerCase().includes(catQ));
  }, [availableCategories, catQ]);

  // Filtered brands by search
  const filteredBrands = useMemo(() => {
    if (!brandQ) return availableBrands;
    return availableBrands.filter((b) => b.brand.toLowerCase().includes(brandQ));
  }, [availableBrands, brandQ]);

  // CATEGORY SELECTION STATE & HELPERS (Matching CRM Table Multi-Select standard)
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
      } else {
        onToggleCategory(catName);
      }
    } else if (isNoneCategoriesActive) {
      // Starting from 0, select only this category
      if (onSelectCategories) {
        onSelectCategories([catName]);
      } else {
        onToggleCategory(catName);
      }
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
        } else {
          onToggleCategory(catName);
        }
      } else {
        const next = [...selectedCategories, catName];
        const resolvedNext =
          next.length >= availableCategories.length ? [] : next;
        if (onSelectCategories) {
          onSelectCategories(resolvedNext);
        } else {
          onToggleCategory(catName);
        }
      }
    }
  };

  const handleToggleAllCategories = () => {
    if (isAllCategoriesActive) {
      // Deselect all
      if (onSelectCategories) {
        onSelectCategories(["__NONE__"]);
      } else {
        onClearCategories();
      }
    } else {
      // Select all
      if (onSelectCategories) {
        onSelectCategories([]);
      } else {
        onClearCategories();
      }
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
      } else {
        onToggleBrand(brandName);
      }
    } else if (isNoneBrandsActive) {
      // Starting from 0, select only this brand
      if (onSelectBrands) {
        onSelectBrands([brandName]);
      } else {
        onToggleBrand(brandName);
      }
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
        } else {
          onToggleBrand(brandName);
        }
      } else {
        const next = [...selectedBrands, brandName];
        const resolvedNext =
          next.length >= availableBrands.length ? [] : next;
        if (onSelectBrands) {
          onSelectBrands(resolvedNext);
        } else {
          onToggleBrand(brandName);
        }
      }
    }
  };

  const handleToggleAllBrands = () => {
    if (isAllBrandsActive) {
      // Deselect all
      if (onSelectBrands) {
        onSelectBrands(["__NONE__"]);
      } else {
        onClearBrands();
      }
    } else {
      // Select all
      if (onSelectBrands) {
        onSelectBrands([]);
      } else {
        onClearBrands();
      }
    }
  };

  return (
    <div className="hidden md:flex w-full md:w-64 lg:w-72 shrink-0 h-full flex-col select-none gap-2 pb-2">
      {/* TOP HALF (50%): CATEGORY WITH CHECKBOXES */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="h-8 flex items-center justify-between px-2 shrink-0">
          <span className="font-black text-xs uppercase text-slate-100 tracking-wider">
            CATEGORY
          </span>
          {!isAllCategoriesActive && (
            <button
              type="button"
              onClick={handleToggleAllCategories}
              className="text-[11px] text-[#C7F33C] hover:underline cursor-pointer font-semibold"
            >
              Reset ({categorySelectedCount})
            </button>
          )}
        </div>

        {/* Category Search Input */}
        <div className="relative mb-2 mt-0.5 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setCategorySearch("");
            }}
            placeholder="Search category..."
            className="w-full bg-[#3A3B3C] border border-transparent rounded-full pl-8 pr-7 py-1 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-[#C7F33C] transition-all"
          />
          {categorySearch && (
            <button
              type="button"
              onClick={() => setCategorySearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Scrollable Checkbox Categories List */}
        <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar flex flex-col gap-0.5 pr-1">
          {/* ALL CATEGORIES / SELECT ALL HEADER ROW */}
          <button
            type="button"
            onClick={handleToggleAllCategories}
            className={`group/item w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left transition-colors rounded-lg cursor-pointer border ${
              isAllCategoriesActive
                ? "bg-[#2D2E30] border-[#4E5052] text-slate-100 hover:bg-[#343638]"
                : categorySelectedCount > 0
                ? "bg-[#252728] border-[#3E4042] text-slate-200 hover:bg-[#2C2D2F]"
                : "bg-[#1C1C1D] border-transparent hover:bg-[#252728] text-slate-400"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div
                className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
                  isAllCategoriesActive
                    ? "bg-[#242D16] border-[#7E9E26] text-[#C7F33C]"
                    : categorySelectedCount > 0
                    ? "bg-[#242D16] border-[#7E9E26] text-[#C7F33C]"
                    : "border-slate-600 bg-[#1E2021] group-hover/item:border-slate-400"
                }`}
              >
                {isAllCategoriesActive && <Check className="w-3 h-3 stroke-[2.5]" />}
                {!isAllCategoriesActive && categorySelectedCount > 0 && (
                  <div className="w-2 h-0.5 bg-[#C7F33C] rounded-full" />
                )}
              </div>
              <span className="text-xs font-bold uppercase tracking-wider truncate">
                {isAllCategoriesActive ? "ALL CATEGORIES" : "SELECT ALL"}
              </span>
              {categorySelectedCount > 0 && (
                <span className="text-[10.5px] px-2 py-0.5 rounded-full font-semibold bg-[#262F16] text-[#B8E62C] border border-[#4D631B] tabular-nums shrink-0">
                  {categorySelectedCount} selected
                </span>
              )}
            </div>
            <span className="text-xs font-normal px-1.5 py-0.5 rounded shrink-0 bg-[#1E2021] text-slate-400">
              {totalCategoryCount}
            </span>
          </button>

          {/* CHECKBOX CATEGORY ITEMS */}
          {filteredCategories.map((c) => {
            const isChecked = isCategoryChecked(c.category);

            return (
              <button
                key={c.category}
                type="button"
                onClick={() => handleToggleSingleCategory(c.category)}
                className={`group/item w-full flex items-center justify-between gap-2 px-2.5 py-1 text-left transition-colors rounded-md cursor-pointer border-0 ${
                  isChecked
                    ? "bg-transparent hover:bg-[#323335] text-slate-200 hover:text-white"
                    : "bg-transparent hover:bg-[#2D2E30] text-slate-500 hover:text-slate-300"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
                      isChecked
                        ? "bg-[#242D16] border-[#688523] text-[#C7F33C]"
                        : "border-slate-600/70 bg-[#1E2021] group-hover/item:border-slate-400"
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[2.5]" />}
                  </div>
                  <span
                    className={`text-xs truncate tracking-wide flex items-center gap-1.5 min-w-0 ${
                      isChecked
                        ? "font-normal text-slate-200 group-hover/item:text-white"
                        : "font-normal text-slate-500 group-hover/item:text-slate-300"
                    }`}
                  >
                    <span className="truncate">{c.category}</span>
                    {c.isDefault && (
                      <span title="Default category view on open" className="shrink-0 flex items-center">
                        <Star className="w-3 h-3 text-amber-400/80 fill-amber-400/70" />
                      </span>
                    )}
                  </span>
                </div>

                <span
                  className={`text-xs font-normal px-1.5 py-0.5 rounded shrink-0 transition-colors ${
                    isChecked
                      ? "bg-[#1E2021] text-slate-400 group-hover/item:text-slate-200"
                      : "bg-transparent text-slate-600 group-hover/item:text-slate-400"
                  }`}
                >
                  {c.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* DIVIDER */}
      <div className="border-t border-[#3A3B3C]/60 my-0.5 shrink-0" />

      {/* BOTTOM HALF (50%): BRAND WITH BEAUTIFUL CHECKBOXES */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="h-8 flex items-center justify-between px-2 shrink-0">
          <span className="font-black text-xs uppercase text-slate-100 tracking-wider">
            BRAND
          </span>
          {!isAllBrandsActive && (
            <button
              type="button"
              onClick={handleToggleAllBrands}
              className="text-[11px] text-slate-400 hover:text-[#C7F33C] hover:underline cursor-pointer font-medium transition-colors"
            >
              Reset ({brandSelectedCount})
            </button>
          )}
        </div>

        {/* Brand Search Input */}
        <div className="relative mb-2 mt-0.5 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={brandSearch}
            onChange={(e) => setBrandSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setBrandSearch("");
            }}
            placeholder="Search brand..."
            className="w-full bg-[#3A3B3C] border border-transparent rounded-full pl-8 pr-7 py-1 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-[#C7F33C]/60 transition-all"
          />
          {brandSearch && (
            <button
              type="button"
              onClick={() => setBrandSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Scrollable Checkbox Brands List */}
        <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar flex flex-col gap-0.5 pr-1">
          {/* ALL BRANDS / SELECT ALL HEADER ROW */}
          <button
            type="button"
            onClick={handleToggleAllBrands}
            className={`group/item w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left transition-colors rounded-lg cursor-pointer border ${
              isAllBrandsActive
                ? "bg-[#2D2E30] border-[#4E5052] text-slate-100 hover:bg-[#343638]"
                : brandSelectedCount > 0
                ? "bg-[#252728] border-[#3E4042] text-slate-200 hover:bg-[#2C2D2F]"
                : "bg-[#1C1C1D] border-transparent hover:bg-[#252728] text-slate-400"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div
                className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
                  isAllBrandsActive
                    ? "bg-[#242D16] border-[#7E9E26] text-[#C7F33C]"
                    : brandSelectedCount > 0
                    ? "bg-[#242D16] border-[#7E9E26] text-[#C7F33C]"
                    : "border-slate-600 bg-[#1E2021] group-hover/item:border-slate-400"
                }`}
              >
                {isAllBrandsActive && <Check className="w-3 h-3 stroke-[2.5]" />}
                {!isAllBrandsActive && brandSelectedCount > 0 && (
                  <div className="w-2 h-0.5 bg-[#C7F33C] rounded-full" />
                )}
              </div>
              <span className="text-xs font-bold uppercase tracking-wider truncate">
                {isAllBrandsActive ? "ALL BRANDS" : "SELECT ALL"}
              </span>
              {brandSelectedCount > 0 && (
                <span className="text-[10.5px] px-2 py-0.5 rounded-full font-semibold bg-[#262F16] text-[#B8E62C] border border-[#4D631B] tabular-nums shrink-0">
                  {brandSelectedCount} selected
                </span>
              )}
            </div>
            <span className="text-xs font-normal px-1.5 py-0.5 rounded shrink-0 bg-[#1E2021] text-slate-400">
              {totalBrandCount}
            </span>
          </button>

          {/* CHECKBOX BRAND ITEMS */}
          {filteredBrands.map((b) => {
            const isChecked = isBrandChecked(b.brand);

            return (
              <button
                key={b.brand}
                type="button"
                onClick={() => handleToggleSingleBrand(b.brand)}
                className={`group/item w-full flex items-center justify-between gap-2 px-2.5 py-1 text-left transition-colors rounded-md cursor-pointer border-0 ${
                  isChecked
                    ? "bg-transparent hover:bg-[#323335] text-slate-200 hover:text-white"
                    : "bg-transparent hover:bg-[#2D2E30] text-slate-500 hover:text-slate-300"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
                      isChecked
                        ? "bg-[#242D16] border-[#688523] text-[#C7F33C]"
                        : "border-slate-600/70 bg-[#1E2021] group-hover/item:border-slate-400"
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[2.5]" />}
                  </div>
                  <span
                    className={`text-xs truncate tracking-wide flex items-center gap-1.5 min-w-0 ${
                      isChecked
                        ? "font-normal text-slate-200 group-hover/item:text-white"
                        : "font-normal text-slate-500 group-hover/item:text-slate-300"
                    }`}
                  >
                    <span className="truncate">{b.brand}</span>
                    {b.isDefault && (
                      <span title="Default brand view on open" className="shrink-0 flex items-center">
                        <Star className="w-3 h-3 text-amber-400/80 fill-amber-400/70" />
                      </span>
                    )}
                  </span>
                </div>

                <span
                  className={`text-xs font-normal px-1.5 py-0.5 rounded shrink-0 transition-colors ${
                    isChecked
                      ? "bg-[#1E2021] text-slate-400 group-hover/item:text-slate-200"
                      : "bg-transparent text-slate-600 group-hover/item:text-slate-400"
                  }`}
                >
                  {b.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});
