"use client";

import React, { useEffect, useRef } from "react";
import { Check, Loader2, Package } from "lucide-react";
import { ProductListItemDTO } from "@/lib/product/product-dto";
import { ProductCardRow } from "./ProductCardRow";

interface ProductCardListProps {
  products: ProductListItemDTO[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  totalProducts: number;
  selectedProductId: string | null;
  selectedForPrintIds?: Set<string>;
  onToggleSelectForPrint?: (id: string) => void;
  onSelectAllForPrint?: () => void;
  onClearSelectForPrint?: () => void;
  onSelectProduct: (id: string) => void;
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
  isLoading,
  isLoadingMore,
  hasMore,
  totalProducts: _totalProducts,
  selectedProductId: _selectedProductId,
  selectedForPrintIds,
  onToggleSelectForPrint,
  onSelectAllForPrint,
  onClearSelectForPrint,
  onSelectProduct,
  onRatingChange,
  onLoadMore,
  onRowIntent,
  headerAction,
}: ProductCardListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef(onLoadMore);
  loadMoreRef.current = onLoadMore;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoading) {
          loadMoreRef.current();
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
  }, [hasMore, isLoadingMore, isLoading]);

  const selectedCount = selectedForPrintIds?.size || 0;
  const isAllSelected =
    products.length > 0 && selectedCount >= products.length && products.every((p) => selectedForPrintIds?.has(p.id));

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 overflow-y-auto pb-8 hide-scrollbar select-none pr-1"
    >
      {/* Header matching the image: "PRODUCT" (Desktop only - hidden on mobile) */}
      <div className="hidden md:flex h-10 items-center justify-between mb-2 px-1 sticky top-0 bg-[#252728] z-10">
        <div className="flex items-center gap-2.5">
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
                    ? "bg-[#C7F33C] border-[#C7F33C] text-black"
                    : selectedCount > 0
                    ? "bg-[#C7F33C]/40 border-[#C7F33C] text-black"
                    : "border-slate-500/60 bg-[#252728] hover:border-slate-300"
                }`}
              >
                {isAllSelected && <Check className="w-3 h-3 stroke-[3]" />}
                {!isAllSelected && selectedCount > 0 && (
                  <div className="w-2 h-0.5 bg-black rounded-full" />
                )}
              </div>
            </div>
          )}
          <span className="font-black text-xs uppercase text-slate-100 tracking-wider">
            PRODUCT
          </span>
          {selectedCount > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-[#C7F33C]/15 text-[#C7F33C] border border-[#C7F33C]/30 tabular-nums">
              {selectedCount} selected
            </span>
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
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Package className="w-12 h-12 text-slate-600 mb-3" />
          <p className="text-sm font-bold text-slate-300">No products found</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            Try adjusting your search query, or selecting different category or brand filters.
          </p>
        </div>
      ) : (
        <div>
          {products.map((product) => (
            <ProductCardRow
              key={product.id}
              product={product}
              isChecked={selectedForPrintIds?.has(product.id) ?? false}
              onToggleCheck={onToggleSelectForPrint}
              onSelect={onSelectProduct}
              onRatingChange={onRatingChange}
              onIntent={onRowIntent}
            />
          ))}

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
