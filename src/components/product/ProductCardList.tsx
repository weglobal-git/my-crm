"use client";

import React, { useEffect, useRef, useMemo } from "react";
import { Check, Loader2, Package } from "lucide-react";
import { ProductListItemDTO } from "@/lib/product/product-dto";
import { ProductCardRow } from "./ProductCardRow";

interface ProductCardListProps {
  products: ProductListItemDTO[];
  categories?: { id?: string; category: string; count?: number; order?: number }[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  totalProducts: number;
  selectedProductId: string | null;
  selectedForPrintIds?: Set<string>;
  onToggleSelectForPrint?: (id: string) => void;
  onToggleGroupSelectForPrint?: (productIds: string[], select: boolean) => void;
  onSelectAllForPrint?: () => void;
  onClearSelectForPrint?: () => void;
  viewOnlySelected?: boolean;
  onViewOnlySelectedChange?: (val: boolean) => void;
  onSelectProduct: (id: string) => void;
  onToggleBestSelling?: (id: string, isBestSelling: boolean) => void;
  onRatingChange?: (id: string, newRating: number) => void;
  onLoadMore: () => void;
  onRowIntent?: (id: string) => void;
  headerAction?: React.ReactNode;
}

function ProductRowSkeleton() {
  return (
    <div className="w-full bg-[#1E1F21] rounded-xl px-4 py-2 mb-2.5 min-h-[52px] flex items-center border border-transparent animate-pulse select-none">
      <div className="hidden sm:grid grid-cols-[20px_44px_minmax(0,1fr)_120px_110px_110px] gap-3 items-center w-full">
        {/* Col 0: Checkbox Skeleton */}
        <div className="w-4 h-4 rounded bg-[#2A2B2D]" />

        {/* Col 1: Square Image Skeleton */}
        <div className="w-10 h-10 rounded-lg bg-[#2A2B2D]" />

        {/* Col 2: Name */}
        <div className="min-w-0 pr-3 flex flex-col justify-center gap-1.5">
          <div className="h-3.5 w-64 rounded bg-[#2A2B2D]" />
        </div>

        {/* Col 3: General Export Price */}
        <div className="min-w-0 flex flex-col gap-1">
          <div className="h-3.5 w-16 rounded bg-[#2A2B2D]" />
          <div className="h-2.5 w-20 rounded bg-[#2A2B2D]/70" />
        </div>

        {/* Col 4: cbm & gw */}
        <div className="min-w-0 flex flex-col gap-1">
          <div className="h-3.5 w-20 rounded bg-[#2A2B2D]" />
          <div className="h-2.5 w-20 rounded bg-[#2A2B2D]/70" />
        </div>

        {/* Col 5: Container 20ft & 40ft */}
        <div className="min-w-0 flex flex-col gap-1 items-end">
          <div className="h-3.5 w-20 rounded bg-[#2A2B2D]" />
          <div className="h-2.5 w-20 rounded bg-[#2A2B2D]/70" />
        </div>
      </div>

      {/* Mobile Skeleton */}
      <div className="flex sm:hidden items-center justify-between w-full py-1">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-4 h-4 rounded bg-[#2A2B2D] shrink-0" />
          <div className="w-10 h-10 rounded-lg bg-[#2A2B2D] shrink-0" />
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="h-3.5 w-32 rounded bg-[#2A2B2D]" />
            <div className="h-2.5 w-20 rounded bg-[#2A2B2D]/70" />
          </div>
        </div>
      </div>
    </div>
  );
}

export const ProductCardList = React.memo(function ProductCardList({
  products,
  categories = [],
  isLoading,
  isLoadingMore,
  hasMore,
  selectedForPrintIds,
  onToggleSelectForPrint,
  onToggleGroupSelectForPrint,
  onSelectAllForPrint,
  onClearSelectForPrint,
  viewOnlySelected = false,
  onViewOnlySelectedChange,
  onSelectProduct,
  onToggleBestSelling,
  onLoadMore,
  onRowIntent,
  headerAction,
}: ProductCardListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoading) {
          onLoadMore();
        }
      },
      {
        root: containerRef.current,
        rootMargin: "300px",
        threshold: 0,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, isLoading, onLoadMore]);

  const selectedCount = selectedForPrintIds?.size || 0;
  const hasSelection = selectedCount > 0;
  const isAllSelected =
    products.length > 0 && selectedCount >= products.length && products.every((p) => selectedForPrintIds?.has(p.id));

  // If viewOnlySelected is true, filter items to only those checked
  const displayedProducts = useMemo(() => {
    if (!viewOnlySelected) return products;
    return products.filter((p) => selectedForPrintIds?.has(p.id));
  }, [products, viewOnlySelected, selectedForPrintIds]);

  // Group products by Category preserving availableCategories order
  const groupedProducts = useMemo(() => {
    const groups: { category: string; products: ProductListItemDTO[] }[] = [];
    const groupMap = new Map<string, { category: string; products: ProductListItemDTO[] }>();

    if (categories && categories.length > 0) {
      for (const cat of categories) {
        if (!cat.category || cat.category === "ALL") continue;
        const entry = { category: cat.category, products: [] as ProductListItemDTO[] };
        groupMap.set(cat.category.trim().toLowerCase(), entry);
        groups.push(entry);
      }
    }

    const uncategorized: ProductListItemDTO[] = [];

    // Distribute displayed products into groups
    for (const p of displayedProducts) {
      const catKey = p.category?.trim().toLowerCase();
      if (catKey && groupMap.has(catKey)) {
        groupMap.get(catKey)!.products.push(p);
      } else if (catKey) {
        const newEntry = { category: p.category!.trim(), products: [p] };
        groupMap.set(catKey, newEntry);
        groups.push(newEntry);
      } else {
        uncategorized.push(p);
      }
    }

    // Keep only groups with at least 1 product
    const result = groups.filter((g) => g.products.length > 0);

    // Sort within each group: Best Selling items at the very top, then name
    for (const g of result) {
      g.products.sort((a, b) => {
        const aBest = (a.starRating || 0) > 0 ? 1 : 0;
        const bBest = (b.starRating || 0) > 0 ? 1 : 0;
        if (aBest !== bBest) {
          return bBest - aBest; // Best selling first
        }
        return a.name.localeCompare(b.name);
      });
    }

    // Add uncategorized if any
    if (uncategorized.length > 0) {
      uncategorized.sort((a, b) => {
        const aBest = (a.starRating || 0) > 0 ? 1 : 0;
        const bBest = (b.starRating || 0) > 0 ? 1 : 0;
        if (aBest !== bBest) {
          return bBest - aBest;
        }
        return a.name.localeCompare(b.name);
      });
      result.push({
        category: "Other / Uncategorized",
        products: uncategorized,
      });
    }

    return result;
  }, [displayedProducts, categories]);

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 overflow-y-auto pb-8 hide-scrollbar select-none pr-1"
    >
      {/* Header matching the image: "PRODUCT" (Desktop only - hidden on mobile) */}
      <div className="hidden md:flex h-10 items-center justify-between mb-2 px-4 sticky top-0 bg-[#252728] z-20">
        <div className="flex items-center gap-3">
          {products.length > 0 && onToggleSelectForPrint && (
            <div
              role="checkbox"
              aria-checked={isAllSelected}
              onClick={isAllSelected ? onClearSelectForPrint : onSelectAllForPrint}
              className="w-5 h-5 flex items-center justify-center shrink-0 cursor-pointer"
              title={isAllSelected ? "Deselect all products" : "Select all products for print"}
            >
              <div
                className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
                  isAllSelected
                    ? "bg-[#242D16] border-[#688523] text-[#C7F33C]"
                    : selectedCount > 0
                    ? "bg-[#242D16] border-[#7E9E26] text-[#C7F33C]"
                    : "border-[#4E5052] bg-[#2D2E30]  hover:border-slate-400"
                }`}
              >
                {isAllSelected && <Check className="w-3 h-3 stroke-[2.5]" />}
                {!isAllSelected && selectedCount > 0 && (
                  <div className="w-2 h-0.5 bg-[#C7F33C] rounded-full" />
                )}
              </div>
            </div>
          )}
          <span className="font-black text-xs uppercase text-slate-100 tracking-wider">
            PRODUCT
          </span>

          {selectedCount > 0 && onClearSelectForPrint && (
            <button
              type="button"
              onClick={onClearSelectForPrint}
              className="text-[11px] text-slate-400 hover:text-rose-400 transition-colors cursor-pointer ml-1 font-medium"
              title="Clear selected products"
            >
              Clear
            </button>
          )}
        </div>
        {headerAction && <div>{headerAction}</div>}
      </div>

      {/* Main Content */}
      {isLoading && products.length === 0 ? (
        <div className="space-y-2.5">
          <ProductRowSkeleton />
          <ProductRowSkeleton />
          <ProductRowSkeleton />
          <ProductRowSkeleton />
          <ProductRowSkeleton />
        </div>
      ) : viewOnlySelected && displayedProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Package className="w-12 h-12 text-slate-600 mb-3" />
          <p className="text-sm font-bold text-slate-300">No selected products</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mb-3">
            None of the selected products match your current filters.
          </p>
          {onViewOnlySelectedChange && (
            <button
              type="button"
              onClick={() => onViewOnlySelectedChange(false)}
              className="text-xs font-bold text-[#C7F33C] hover:underline"
            >
              Show all products
            </button>
          )}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Package className="w-12 h-12 text-slate-600 mb-3" />
          <p className="text-sm font-bold text-slate-300">No products found</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            Try adjusting your search query, or selecting different category or brand filters.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedProducts.map((group) => {
            const groupProductIds = group.products.map((p) => p.id);
            const groupSelectedCount = groupProductIds.filter((id) =>
              selectedForPrintIds?.has(id)
            ).length;
            const isGroupAllSelected =
              groupProductIds.length > 0 && groupSelectedCount === groupProductIds.length;
            const isGroupIndeterminate =
              groupSelectedCount > 0 && !isGroupAllSelected;

            return (
              <div
                key={group.category}
                id={`category-group-${encodeURIComponent(group.category.trim().toLowerCase())}`}
                className="scroll-mt-10"
              >
                {/* Category Sticky Subheader with Category Group Checkbox */}
                <div className="sticky top-10 z-10 bg-[#252728]/95 border-b border-[#4E5052] backdrop-blur-md px-4 py-2 mb-2 flex items-center justify-between select-none">
                  <div className="flex items-center gap-3 min-w-0">
                    {onToggleGroupSelectForPrint && (
                      <div
                        role="checkbox"
                        aria-checked={isGroupAllSelected}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleGroupSelectForPrint(
                            groupProductIds,
                            !isGroupAllSelected
                          );
                        }}
                        className="w-5 h-5 flex items-center justify-center shrink-0 cursor-pointer"
                        title={
                          isGroupAllSelected
                            ? `Deselect all ${group.category} products`
                            : `Select all ${group.category} products`
                        }
                      >
                        <div
                          className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
                            isGroupAllSelected
                              ? "bg-[#242D16] border-[#688523] text-[#C7F33C]"
                              : isGroupIndeterminate
                              ? "bg-[#242D16] border-[#7E9E26] text-[#C7F33C]"
                              : "border-[#4E5052] bg-[#2D2E30] hover:border-slate-400"
                          }`}
                        >
                          {isGroupAllSelected && <Check className="w-3 h-3 stroke-[2.5]" />}
                          {isGroupIndeterminate && (
                            <div className="w-2 h-0.5 bg-[#C7F33C] rounded-full" />
                          )}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-3.5 bg-[#C7F33C] rounded-full shrink-0" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-100 truncate">
                        {group.category}
                      </h3>
                    </div>
                  </div>
                </div>

                {/* Products in this category */}
                <div>
                  {group.products.map((product) => {
                    const isChecked = selectedForPrintIds?.has(product.id) ?? false;
                    return (
                      <ProductCardRow
                        key={product.id}
                        product={product}
                        isChecked={isChecked}
                        isDimmed={hasSelection && !isChecked}
                        onToggleCheck={onToggleSelectForPrint}
                        onSelect={onSelectProduct}
                        onToggleBestSelling={onToggleBestSelling}
                        onIntent={onRowIntent}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Infinite Scroll Sentinel */}
          <div ref={sentinelRef} className="py-4 flex items-center justify-center">
            {isLoadingMore && (
              <Loader2 className="w-6 h-6 text-[#C7F33C] animate-spin" />
            )}
          </div>
        </div>
      )}
    </div>
  );
});
