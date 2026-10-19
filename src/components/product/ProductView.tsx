"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { ProductStatus } from "@prisma/client";
import { preload } from "swr";
import { FolderTree, Plus, Printer, SlidersHorizontal, Eye, TrendingUp } from "lucide-react";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { useSidebar } from "@/components/layout/SidebarContext";
import {
  ProductListItemDTO,
  getProductOverviewKey,
} from "@/lib/product/product-dto";
import {
  getProductsWithFilters,
  getProductOverview,
  updateProductStarRating,
  getProductCategories,
  getProductBrands,
} from "@/lib/actions/product";

import { ProductFilterSidebar } from "./ProductFilterSidebar";
import { ProductCardList } from "./ProductCardList";
import { ProductSearch } from "./ProductSearch";
import { ProductFiltersDrawer, ProductFilterContent } from "./ProductFiltersDrawer";


const loadProductCatalogPrintModal = () =>
  import("./ProductCatalogPrintModal").then((mod) => mod.ProductCatalogPrintModal);
const ProductCatalogPrintModal = dynamic(loadProductCatalogPrintModal, { ssr: false });

const loadProductOverviewReportModal = () =>
  import("./ProductOverviewReportModal").then((mod) => mod.ProductOverviewReportModal);
const ProductOverviewReportModal = dynamic(loadProductOverviewReportModal, { ssr: false });

const loadEditProductPanel = () =>
  import("./EditProductPanel").then((mod) => mod.EditProductPanel);
const EditProductPanel = dynamic(loadEditProductPanel, { ssr: false });

const loadCreateProductPanel = () =>
  import("./CreateProductPanel").then((mod) => mod.CreateProductPanel);
const CreateProductPanel = dynamic(loadCreateProductPanel, { ssr: false });

const loadManageTaxonomyPanel = () =>
  import("./ManageTaxonomyPanel").then((mod) => mod.ManageTaxonomyPanel);
const ManageTaxonomyPanel = dynamic(loadManageTaxonomyPanel, { ssr: false });

const fetchProductOverview = ([, id]: readonly [string, string] | [string, string]) =>
  getProductOverview(id);

interface ProductViewProps {
  initialProducts: ProductListItemDTO[];
  initialStats: { availableCount: number; unavailableCount: number; totalCount: number };
  initialTotal: number;
  initialCategories?: { id?: string; category: string; count: number; order?: number; isDefault?: boolean }[];
  initialBrands?: { id?: string; brand: string; count: number; order?: number; isDefault?: boolean }[];
}

export function ProductView({
  initialProducts,
  initialStats,
  initialTotal,
  initialCategories = [],
  initialBrands = [],
}: ProductViewProps) {
  const { setPageSearchConfig, setPageManageContent, setHasActiveFilters } = useSidebar();

  // State: Tab & Filters (Default category/brand applied on load)
  const [activeTab, setActiveTab] = useState<ProductStatus>(ProductStatus.AVAILABLE);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    return initialCategories.filter((c) => c.isDefault).map((c) => c.category);
  });
  const [selectedBrands, setSelectedBrands] = useState<string[]>(() => {
    return initialBrands.filter((b) => b.isDefault).map((b) => b.brand);
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Products List State
  const [products, setProducts] = useState<ProductListItemDTO[]>(initialProducts);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialTotal > initialProducts.length);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isFilterLoading, setIsFilterLoading] = useState(false);
  const [stats, setStats] = useState(initialStats);
  const [totalProducts, setTotalProducts] = useState(initialTotal);

  // Available metadata
  const [availableCategories, setAvailableCategories] = useState(initialCategories);
  const [availableBrands, setAvailableBrands] = useState(initialBrands);

  // Registry of known products across filters & pages
  const [knownProductsMap, setKnownProductsMap] = useState<Map<string, ProductListItemDTO>>(
    () => new Map(initialProducts.map((p) => [p.id, p]))
  );

  // Modals & Panels State
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isCreateProductOpen, setIsCreateProductOpen] = useState(false);
  const [isEditProductOpen, setIsEditProductOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    initialProducts[0]?.id || null
  );

  // Print & Overview Report modal state
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isOverviewReportOpen, setIsOverviewReportOpen] = useState(false);
  const [selectedForPrintIds, setSelectedForPrintIds] = useState<Set<string>>(new Set());
  const [viewOnlySelected, setViewOnlySelected] = useState(false);
  const effectiveViewOnlySelected = viewOnlySelected && selectedForPrintIds.size > 0;

  const handleToggleSelectForPrint = useCallback((id: string) => {
    setSelectedForPrintIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleToggleGroupForPrint = useCallback((productIds: string[], select: boolean) => {
    setSelectedForPrintIds((prev) => {
      const next = new Set(prev);
      if (select) {
        productIds.forEach((id) => next.add(id));
      } else {
        productIds.forEach((id) => next.delete(id));
      }
      return next;
    });
  }, []);

  const handleSelectAllForPrint = useCallback(() => {
    setSelectedForPrintIds(new Set(products.map((p) => p.id)));
  }, [products]);

  const handleClearSelectForPrint = useCallback(() => {
    setSelectedForPrintIds(new Set());
    setViewOnlySelected(false);
  }, []);

  const printTargetProducts = useMemo(() => {
    if (selectedForPrintIds.size === 0) return products;
    const result: ProductListItemDTO[] = [];
    const seen = new Set<string>();
    for (const p of products) {
      if (selectedForPrintIds.has(p.id)) {
        result.push(p);
        seen.add(p.id);
      }
    }
    for (const id of selectedForPrintIds) {
      if (!seen.has(id)) {
        const known = knownProductsMap.get(id);
        if (known) {
          result.push(known);
          seen.add(id);
        }
      }
    }
    return result;
  }, [products, selectedForPrintIds, knownProductsMap]);

  // Count of selected products for the active tab (On vs Off)
  const activeSelectedProductCount = useMemo(() => {
    if (selectedForPrintIds.size === 0) return 0;
    let count = 0;
    for (const id of selectedForPrintIds) {
      const p = knownProductsMap.get(id) || products.find((prod) => prod.id === id);
      if (!p?.status || p.status === activeTab) {
        count++;
      }
    }
    return count;
  }, [activeTab, products, selectedForPrintIds, knownProductsMap]);

  // Selected products grouped by category, scoped to the current active tab
  const selectedProductsByCategory = useMemo(() => {
    if (selectedForPrintIds.size === 0) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const id of selectedForPrintIds) {
      const p = knownProductsMap.get(id) || products.find((prod) => prod.id === id);
      if (p?.category && (!p.status || p.status === activeTab)) {
        const catKey = p.category.trim().toLowerCase();
        map.set(catKey, (map.get(catKey) || 0) + 1);
      }
    }
    return map;
  }, [activeTab, products, selectedForPrintIds, knownProductsMap]);

  // Total products in each category for the active tab
  const activeCategoryProductCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of knownProductsMap.values()) {
      if (p.status === activeTab && p.category) {
        const catKey = p.category.trim().toLowerCase();
        map.set(catKey, (map.get(catKey) || 0) + 1);
      }
    }
    for (const p of products) {
      if (p.status === activeTab && p.category) {
        const catKey = p.category.trim().toLowerCase();
        if (!map.has(catKey)) {
          map.set(catKey, 1);
        }
      }
    }
    return map;
  }, [activeTab, products, knownProductsMap]);

  // Quick Select: Select all or deselect all items in a category for the active tab only
  const handleQuickSelectCategory = useCallback(
    async (category: string) => {
      const catKey = category.trim().toLowerCase();

      // Gather matching items in memory
      const targetMap = new Map<string, ProductListItemDTO>();
      for (const p of knownProductsMap.values()) {
        if (p.category?.trim().toLowerCase() === catKey && p.status === activeTab) {
          targetMap.set(p.id, p);
        }
      }
      for (const p of products) {
        if (p.category?.trim().toLowerCase() === catKey && p.status === activeTab) {
          targetMap.set(p.id, p);
        }
      }

      // If none found in memory, query server
      if (targetMap.size === 0) {
        try {
          const res = await getProductsWithFilters({
            status: activeTab,
            categories: [category],
            pageSize: 500,
          });
          setKnownProductsMap((prev) => {
            const next = new Map(prev);
            for (const p of res.products) {
              next.set(p.id, p);
            }
            return next;
          });
          for (const p of res.products) {
            if (p.category?.trim().toLowerCase() === catKey && p.status === activeTab) {
              targetMap.set(p.id, p);
            }
          }
        } catch (err) {
          console.error("Failed to load category products for quick select:", err);
        }
      }

      if (targetMap.size === 0) return;

      const targetIds = Array.from(targetMap.keys());

      setSelectedForPrintIds((prev) => {
        const next = new Set(prev);
        const allSelected = targetIds.length > 0 && targetIds.every((id) => next.has(id));

        if (allSelected) {
          for (const id of targetIds) {
            next.delete(id);
          }
        } else {
          for (const id of targetIds) {
            next.add(id);
          }
        }
        return next;
      });
    },
    [activeTab, knownProductsMap, products]
  );

  const defaultCategoryNames = useMemo(
    () => availableCategories.filter((c) => c.isDefault).map((c) => c.category),
    [availableCategories]
  );
  const defaultBrandNames = useMemo(
    () => availableBrands.filter((b) => b.isDefault).map((b) => b.brand),
    [availableBrands]
  );

  // Active filter count badge (Stock status is a view tab, NOT a filter)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    const isCatFiltered =
      (selectedCategories.length > 0 && selectedCategories.length < availableCategories.length) ||
      (selectedCategories.length === 1 && selectedCategories[0] === "__NONE__");
    if (isCatFiltered) count++;

    const isBrandFiltered =
      (selectedBrands.length > 0 && selectedBrands.length < availableBrands.length) ||
      (selectedBrands.length === 1 && selectedBrands[0] === "__NONE__");
    if (isBrandFiltered) count++;

    return count;
  }, [selectedCategories, availableCategories.length, selectedBrands, availableBrands.length]);

  const handleResetFilters = useCallback(() => {
    setSelectedCategories(defaultCategoryNames);
    setSelectedBrands(defaultBrandNames);
  }, [defaultCategoryNames, defaultBrandNames]);

  const handleSelectCategories = useCallback((cats: string[]) => {
    setSelectedCategories(cats);
  }, []);

  const handleSelectBrands = useCallback((brs: string[]) => {
    setSelectedBrands(brs);
  }, []);

  const handleToggleCategory = useCallback((category: string) => {
    setSelectedCategories((prev) => {
      const exists = prev.some((c) => c.toLowerCase() === category.toLowerCase());
      if (exists) {
        return prev.filter((c) => c.toLowerCase() !== category.toLowerCase());
      } else {
        return [...prev, category];
      }
    });
  }, []);

  const handleClearCategories = useCallback(() => {
    setSelectedCategories([]);
  }, []);

  const handleToggleBrand = useCallback((brand: string) => {
    setSelectedBrands((prev) => {
      const exists = prev.some((b) => b.toLowerCase() === brand.toLowerCase());
      if (exists) {
        return prev.filter((b) => b.toLowerCase() !== brand.toLowerCase());
      } else {
        return [...prev, brand];
      }
    });
  }, []);

  const handleClearBrands = useCallback(() => {
    setSelectedBrands([]);
  }, []);

  const handleTaxonomyChanged = useCallback(
    async (newDefaults?: {
      category?: string | null;
      brand?: string | null;
      categories?: string[];
      brands?: string[];
    }) => {
      try {
        const [cats, brs] = await Promise.all([
          getProductCategories(),
          getProductBrands(),
        ]);
        setAvailableCategories(cats);
        setAvailableBrands(brs);

        if (newDefaults?.categories !== undefined) {
          setSelectedCategories(newDefaults.categories);
        } else if (newDefaults?.category !== undefined) {
          setSelectedCategories(newDefaults.category ? [newDefaults.category] : []);
        }

        if (newDefaults?.brands !== undefined) {
          setSelectedBrands(newDefaults.brands);
        } else if (newDefaults?.brand !== undefined) {
          setSelectedBrands(newDefaults.brand ? [newDefaults.brand] : []);
        }
      } catch (err) {
        console.error("Failed to refresh taxonomy:", err);
      }
    },
    []
  );

  // Category Warp Navigation Handler (Instant jump, no smooth sliding or visual effects)
  const handleWarpToCategory = useCallback(
    (categoryName: string) => {
      const isCatChecked =
        selectedCategories.length === 0 ||
        selectedCategories.some((c) => c.toLowerCase() === categoryName.toLowerCase());

      if (!isCatChecked) {
        setSelectedCategories((prev) => [...prev, categoryName]);
      }

      const normalizedId = `category-group-${encodeURIComponent(categoryName.trim().toLowerCase())}`;

      const jumpToTarget = () => {
        const el = document.getElementById(normalizedId);
        if (el) {
          el.scrollIntoView({ behavior: "auto", block: "start" });
          return true;
        }
        return false;
      };

      if (!jumpToTarget()) {
        requestAnimationFrame(() => {
          jumpToTarget();
        });
      }
    },
    [selectedCategories]
  );

  // 0ms Optimistic Best Selling Mutation
  const handleToggleBestSelling = useCallback(async (id: string, isBestSelling: boolean) => {
    const newRating = isBestSelling ? 1 : 0;

    // 1. Instant 0ms optimistic state update
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, starRating: newRating } : p))
    );

    let prevRating = 0;
    setKnownProductsMap((prev) => {
      const next = new Map(prev);
      const cached = next.get(id);
      if (cached) {
        prevRating = cached.starRating ?? 0;
        next.set(id, { ...cached, starRating: newRating });
      }
      return next;
    });

    // 2. Server persistence
    try {
      await updateProductStarRating(id, newRating);
    } catch (err) {
      console.error("Failed to update best selling status:", err);
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, starRating: prevRating } : p))
      );
      setKnownProductsMap((prev) => {
        const next = new Map(prev);
        const cached = next.get(id);
        if (cached) {
          next.set(id, { ...cached, starRating: prevRating });
        }
        return next;
      });
    }
  }, []);

  // Idle Background Preload
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    let idleId: number | null = null;

    const primePanels = () => {
      void loadEditProductPanel();
      if (initialProducts[0]?.id) {
        const key = getProductOverviewKey(initialProducts[0].id);
        if (key) {
          void preload(key, fetchProductOverview);
        }
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(primePanels, { timeout: 1200 });
    } else {
      timer = setTimeout(primePanels, 300);
    }

    return () => {
      if (idleId !== null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      }
      if (timer) clearTimeout(timer);
    };
  }, [initialProducts]);

  // Debounced search (280ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch with filters on change
  const fetchFilteredProducts = useCallback(async () => {
    setIsFilterLoading(true);
    try {
      const res = await getProductsWithFilters({
        status: activeTab,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
        brands: selectedBrands.length > 0 ? selectedBrands : undefined,
        search: debouncedSearch,
        page: 1,
        pageSize: 300,
      });

      setProducts(res.products);
      setTotalProducts(res.total);
      setStats(res.stats);
      setPage(1);
      setHasMore(res.total > res.products.length);

      setKnownProductsMap((prev) => {
        const next = new Map(prev);
        for (const p of res.products) {
          next.set(p.id, p);
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to filter products:", err);
    } finally {
      setIsFilterLoading(false);
    }
  }, [activeTab, selectedCategories, selectedBrands, debouncedSearch]);

  const isInitialMountRef = useRef(true);

  // Filter effect: Fetch authoritative page from server on filter changes
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    void fetchFilteredProducts();
  }, [fetchFilteredProducts]);

  // Infinite scroll loader
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);

    try {
      const nextPage = page + 1;
      const res = await getProductsWithFilters({
        status: activeTab,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
        brands: selectedBrands.length > 0 ? selectedBrands : undefined,
        search: debouncedSearch,
        page: nextPage,
        pageSize: 300,
      });

      setProducts((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const newItems = res.products.filter((p) => !existingIds.has(p.id));
        return [...prev, ...newItems];
      });

      setKnownProductsMap((prev) => {
        const next = new Map(prev);
        for (const p of res.products) {
          next.set(p.id, p);
        }
        return next;
      });

      setPage(nextPage);
      setHasMore(products.length + res.products.length < res.total);
    } catch (err) {
      console.error("Failed to load more products:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, page, activeTab, selectedCategories, selectedBrands, debouncedSearch, products.length]);

  const intentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Select card to open Slide-over drawer
  const handleSelectProduct = useCallback((id: string) => {
    if (intentTimerRef.current) {
      clearTimeout(intentTimerRef.current);
      intentTimerRef.current = null;
    }
    setSelectedProductId(id);
    void loadEditProductPanel();
    setIsEditProductOpen(true);
  }, []);

  // Intent preload on card hover (debounced so sweeping cursor across rows doesn't flood DB)
  const handleProductIntent = useCallback((id: string) => {
    void loadEditProductPanel();
    if (intentTimerRef.current) {
      clearTimeout(intentTimerRef.current);
    }
    intentTimerRef.current = setTimeout(() => {
      const key = getProductOverviewKey(id);
      if (key) {
        void preload(key, fetchProductOverview);
      }
    }, 120);
  }, []);

  const handleCreatePanelIntent = useCallback(() => {
    void loadCreateProductPanel();
  }, []);

  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q);
  }, []);

  // Mobile sidebar integration
  const hasActiveFilters = Boolean(
    searchQuery.trim() || selectedCategories.length > 0 || selectedBrands.length > 0
  );

  useEffect(() => {
    setHasActiveFilters(hasActiveFilters);
  }, [hasActiveFilters, setHasActiveFilters]);

  useEffect(() => {
    setPageSearchConfig({
      query: searchQuery,
      onSearch: handleSearchChange,
      placeholder: "Search products...",
    });
    return () => setPageSearchConfig(null);
  }, [searchQuery, handleSearchChange, setPageSearchConfig]);

  useEffect(() => {
    setPageManageContent(
      <ProductFilterContent
        activeTab={activeTab}
        onTabChange={setActiveTab}
        selectedCategories={selectedCategories}
        onToggleCategory={handleToggleCategory}
        onClearCategories={handleClearCategories}
        onSelectCategories={handleSelectCategories}
        availableCategories={availableCategories}
        selectedBrands={selectedBrands}
        onToggleBrand={handleToggleBrand}
        onClearBrands={handleClearBrands}
        onSelectBrands={handleSelectBrands}
        availableBrands={availableBrands}
        stats={stats}
        activeFilterCount={activeFilterCount}
        onResetFilters={handleResetFilters}
      />
    );
    return () => setPageManageContent(null);
  }, [
    activeTab,
    selectedCategories,
    handleToggleCategory,
    handleClearCategories,
    handleSelectCategories,
    availableCategories,
    selectedBrands,
    handleToggleBrand,
    handleClearBrands,
    handleSelectBrands,
    availableBrands,
    stats,
    activeFilterCount,
    handleResetFilters,
    setPageManageContent,
  ]);

  return (
    <WorkspaceLayout>
      <div className="flex-1 flex flex-col min-h-0 bg-[#252728]">
        {/* 2-Column Responsive Workspace (100% matched with ContactView) */}
        <div className="flex-1 flex min-h-0 overflow-hidden px-4 md:px-6 pt-2 pb-0 gap-6">
          {/* Left Filter Sidebar */}
          <ProductFilterSidebar
            selectedCategories={selectedCategories}
            onToggleCategory={handleToggleCategory}
            onSelectCategories={handleSelectCategories}
            onClearCategories={handleClearCategories}
            availableCategories={availableCategories}
            selectedBrands={selectedBrands}
            onToggleBrand={handleToggleBrand}
            onSelectBrands={handleSelectBrands}
            onClearBrands={handleClearBrands}
            availableBrands={availableBrands}
            onWarpToCategory={handleWarpToCategory}
            onQuickSelectCategory={handleQuickSelectCategory}
            activeCategoryProductCounts={activeCategoryProductCounts}
            selectedProductCount={activeSelectedProductCount}
            selectedProductsByCategory={selectedProductsByCategory}
          />

          {/* Right Main Cards Workspace */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <ProductCardList
              products={products}
              categories={availableCategories}
              isLoading={isFilterLoading}
              isLoadingMore={isLoadingMore}
              hasMore={hasMore}
              totalProducts={totalProducts}
              selectedProductId={selectedProductId}
              selectedForPrintIds={selectedForPrintIds}
              onToggleSelectForPrint={handleToggleSelectForPrint}
              onToggleGroupSelectForPrint={handleToggleGroupForPrint}
              onSelectAllForPrint={handleSelectAllForPrint}
              onClearSelectForPrint={handleClearSelectForPrint}
              viewOnlySelected={effectiveViewOnlySelected}
              onViewOnlySelectedChange={setViewOnlySelected}
              onSelectProduct={handleSelectProduct}
              onToggleBestSelling={handleToggleBestSelling}
              onLoadMore={handleLoadMore}
              onRowIntent={handleProductIntent}
              headerAction={
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {/* Stock Status Tabs (Desktop Only) */}
                  <div className="hidden md:flex gap-1 bg-[#1E1F21] p-1 rounded-full shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveTab(ProductStatus.AVAILABLE)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-full transition-all cursor-pointer ${
                        activeTab === ProductStatus.AVAILABLE
                          ? "bg-[#3A3B3C] text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                      title={`Available: ${stats.availableCount} products`}
                    >
                      <span>ON</span>
                      <span className="ml-1 text-[11px] opacity-70 tabular-nums">
                        {stats.availableCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab(ProductStatus.UNAVAILABLE)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-full transition-all cursor-pointer ${
                        activeTab === ProductStatus.UNAVAILABLE
                          ? "bg-[#3A3B3C] text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                      title={`Unavailable: ${stats.unavailableCount} products`}
                    >
                      <span>OFF</span>
                      <span className="ml-1 text-[11px] opacity-70 tabular-nums">
                        {stats.unavailableCount}
                      </span>
                    </button>
                  </div>

                  {/* Product Search */}
                  <ProductSearch
                    value={searchQuery}
                    onChange={handleSearchChange}
                    placeholder="Search products..."
                  />

                  {/* View Selected Quick Toggle (Icon only, directly to the right of Search) */}
                  {selectedForPrintIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setViewOnlySelected((prev) => !prev)}
                      className={`hidden md:flex w-8 h-8 rounded-full items-center justify-center border transition-all cursor-pointer relative shrink-0 ${
                        effectiveViewOnlySelected
                          ? "bg-[#C7F33C] border-[#C7F33C] text-black shadow-xs font-bold"
                          : "bg-[#252728] border-[#3A3B3C] text-[#C7F33C] hover:text-white hover:bg-[#3A3B3C]"
                      }`}
                      title={
                        effectiveViewOnlySelected
                          ? "Show all products"
                          : `View only selected products (${selectedForPrintIds.size})`
                      }
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Centralized Filters Button (Desktop Only, matches Pipeline/Account style) */}
                  <button
                    type="button"
                    onClick={() => setIsFiltersOpen(true)}
                    className={`hidden md:flex w-8 h-8 rounded-full items-center justify-center border transition-all cursor-pointer relative shrink-0 ${
                      activeFilterCount > 0
                        ? "bg-[#C7F33C]/10 border-[#C7F33C] text-[#C7F33C] hover:bg-[#C7F33C]/20"
                        : "bg-[#252728] border-[#3A3B3C] text-slate-300 hover:text-white hover:bg-[#3A3B3C]"
                    }`}
                    title="Filters & Options"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#C7F33C] text-black text-[10px] font-bold flex items-center justify-center shadow-xs">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>

                  {/* Manage Button (Categories & Brands) */}
                  <button
                    type="button"
                    onClick={() => {
                      void loadManageTaxonomyPanel();
                      setIsManageOpen(true);
                    }}
                    className="hidden md:flex w-8 h-8 rounded-full items-center justify-center border border-[#3A3B3C] bg-[#252728] text-slate-300 hover:text-white hover:bg-[#3A3B3C] transition-all cursor-pointer shrink-0"
                    title="Manage Categories, Brands & Settings"
                  >
                    <FolderTree className="w-3.5 h-3.5" />
                  </button>


                  {/* Overview Report Button */}
                  <button
                    type="button"
                    onClick={() => {
                      void loadProductOverviewReportModal();
                      setIsOverviewReportOpen(true);
                    }}
                    className={`hidden md:flex w-8 h-8 rounded-full items-center justify-center border transition-all cursor-pointer relative shrink-0 ${
                      selectedForPrintIds.size > 0
                        ? "bg-[#C7F33C]/10 border-[#C7F33C] text-[#C7F33C] hover:bg-[#C7F33C]/20"
                        : "bg-[#252728] border-[#3A3B3C] text-slate-300 hover:text-white hover:bg-[#3A3B3C]"
                    }`}
                    title={
                      selectedForPrintIds.size > 0
                        ? `Overview Report (${selectedForPrintIds.size} selected)`
                        : "Overview Report"
                    }
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    {selectedForPrintIds.size > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#C7F33C] text-black text-[10px] font-bold flex items-center justify-center">
                        {selectedForPrintIds.size}
                      </span>
                    )}
                  </button>

                  {/* Print / Export Catalog Button */}
                  <button
                    type="button"
                    onClick={() => {
                      void loadProductCatalogPrintModal();
                      setIsPrintModalOpen(true);
                    }}
                    className={`hidden md:flex w-8 h-8 rounded-full items-center justify-center border transition-all cursor-pointer relative shrink-0 ${
                      selectedForPrintIds.size > 0
                        ? "bg-[#C7F33C]/10 border-[#C7F33C] text-[#C7F33C] hover:bg-[#C7F33C]/20"
                        : "bg-[#252728] border-[#3A3B3C] text-slate-300 hover:text-white hover:bg-[#3A3B3C]"
                    }`}
                    title={
                      selectedForPrintIds.size > 0
                        ? `Print & Export Catalog (${selectedForPrintIds.size} selected)`
                        : "Print & Export Catalog"
                    }
                  >
                    <Printer className="w-3.5 h-3.5" />
                    {selectedForPrintIds.size > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#C7F33C] text-black text-[10px] font-bold flex items-center justify-center">
                        {selectedForPrintIds.size}
                      </span>
                    )}
                  </button>

                  {/* Add Product Button */}
                  <button
                    type="button"
                    onClick={() => {
                      void loadCreateProductPanel();
                      setIsCreateProductOpen(true);
                    }}
                    onPointerEnter={handleCreatePanelIntent}
                    className="w-8 h-8 rounded-full bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center justify-center shrink-0 cursor-pointer"
                    title="Add Product"
                  >
                    <Plus className="w-4 h-4 text-black stroke-[2.5]" />
                  </button>
                </div>
              }
            />
          </div>
        </div>
      </div>

      {/* Centralized Product Filters Drawer (Desktop Modal) */}
      <ProductFiltersDrawer
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        selectedCategories={selectedCategories}
        onToggleCategory={handleToggleCategory}
        onClearCategories={handleClearCategories}
        onSelectCategories={handleSelectCategories}
        availableCategories={availableCategories}
        selectedBrands={selectedBrands}
        onToggleBrand={handleToggleBrand}
        onClearBrands={handleClearBrands}
        onSelectBrands={handleSelectBrands}
        availableBrands={availableBrands}
        stats={stats}
        activeFilterCount={activeFilterCount}
        onResetFilters={handleResetFilters}
        onOpenManage={() => {
          void loadManageTaxonomyPanel();
          setIsManageOpen(true);
        }}
      />

      {/* Manage Taxonomy Drawer */}
      {isManageOpen && (
        <ManageTaxonomyPanel
          isOpen={isManageOpen}
          onClose={() => setIsManageOpen(false)}
          onTaxonomyChanged={handleTaxonomyChanged}
        />
      )}

      {/* Create Product Slide-over Panel */}
      {isCreateProductOpen && (
        <CreateProductPanel
          isOpen={isCreateProductOpen}
          onClose={() => setIsCreateProductOpen(false)}
          availableCategories={availableCategories}
          availableBrands={availableBrands}
          onProductCreated={(newProduct) => {
            setIsCreateProductOpen(false);
            if (newProduct) {
              setKnownProductsMap((prev) => {
                const next = new Map(prev);
                next.set(newProduct.id, newProduct);
                return next;
              });
              setProducts((prev) => [newProduct, ...prev]);
              setStats((prev) => ({
                ...prev,
                availableCount: prev.availableCount + 1,
                totalCount: prev.totalCount + 1,
              }));
              setTotalProducts((prev) => prev + 1);
            }
          }}
        />
      )}

      {/* Edit Product Slide-over Panel */}
      {isEditProductOpen && selectedProductId && (
        <EditProductPanel
          key={selectedProductId}
          isOpen={isEditProductOpen}
          productId={selectedProductId}
          initialProduct={
            knownProductsMap.get(selectedProductId) ||
            products.find((p) => p.id === selectedProductId) ||
            null
          }
          onClose={() => setIsEditProductOpen(false)}
          availableCategories={availableCategories}
          availableBrands={availableBrands}
          onProductUpdated={(updated) => {
            const updatedId = updated.id;
            if (updatedId) {
              const mergePatch = (base: ProductListItemDTO): ProductListItemDTO => {
                const next = { ...base };
                for (const [k, v] of Object.entries(updated)) {
                  if (v !== undefined) {
                    (next as Record<string, unknown>)[k] = v;
                  }
                }
                return next;
              };

              const existingItem =
                knownProductsMap.get(updatedId) ||
                products.find((p) => p.id === updatedId);
              const statusChanged =
                Boolean(updated.status) &&
                Boolean(existingItem) &&
                updated.status !== existingItem?.status;

              if (updated.status && updated.status !== activeTab) {
                setProducts((prev) => prev.filter((p) => p.id !== updatedId));
                void fetchFilteredProducts();
              } else {
                setProducts((prev) =>
                  prev.map((p) => (p.id === updatedId ? mergePatch(p) : p))
                );
                if (statusChanged) {
                  void fetchFilteredProducts();
                }
              }

              setKnownProductsMap((prev) => {
                const existing = prev.get(updatedId);
                if (!existing) return prev;
                const next = new Map(prev);
                next.set(updatedId, mergePatch(existing));
                return next;
              });
            }
          }}
        />
      )}

      {/* Product Catalog Print & Export Modal */}
      {isPrintModalOpen && (
        <ProductCatalogPrintModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          selectedProducts={printTargetProducts}
          allProducts={products}
          availableCategories={availableCategories}
          availableBrands={availableBrands}
          isExplicitSelection={selectedForPrintIds.size > 0}
        />
      )}

      {/* Product Overview Report Modal */}
      {isOverviewReportOpen && (
        <ProductOverviewReportModal
          isOpen={isOverviewReportOpen}
          onClose={() => setIsOverviewReportOpen(false)}
          selectedProducts={printTargetProducts}
          isExplicitSelection={selectedForPrintIds.size > 0}
        />
      )}

    </WorkspaceLayout>
  );
}
