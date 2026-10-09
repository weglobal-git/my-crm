"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { ProductStatus } from "@prisma/client";
import { preload } from "swr";
import { FolderTree, Plus, Printer, SlidersHorizontal, Calculator } from "lucide-react";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { useSidebar } from "@/components/layout/SidebarContext";
import {
  ProductListItemDTO,
  productMatchesFilters,
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

const loadProductLogisticsModal = () =>
  import("./ProductLogisticsModal").then((mod) => mod.ProductLogisticsModal);
const ProductLogisticsModal = dynamic(loadProductLogisticsModal, { ssr: false });

const loadProductCatalogPrintModal = () =>
  import("./ProductCatalogPrintModal").then((mod) => mod.ProductCatalogPrintModal);
const ProductCatalogPrintModal = dynamic(loadProductCatalogPrintModal, { ssr: false });

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

  // Modals & Panels State
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isCreateProductOpen, setIsCreateProductOpen] = useState(false);
  const [isEditProductOpen, setIsEditProductOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    initialProducts[0]?.id || null
  );

  // Print & Logistics simulation modals state
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isLogisticsModalOpen, setIsLogisticsModalOpen] = useState(false);
  const [selectedForPrintIds, setSelectedForPrintIds] = useState<Set<string>>(new Set());

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

  const handleSelectAllForPrint = useCallback(() => {
    setSelectedForPrintIds(new Set(products.map((p) => p.id)));
  }, [products]);

  const handleClearSelectForPrint = useCallback(() => {
    setSelectedForPrintIds(new Set());
  }, []);

  const printTargetProducts = useMemo(() => {
    if (selectedForPrintIds.size === 0) return products;
    return products.filter((p) => selectedForPrintIds.has(p.id));
  }, [products, selectedForPrintIds]);

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

  // 0ms Optimistic Star Rating Mutation
  const handleRatingChange = useCallback(async (id: string, newRating: number) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, starRating: newRating } : p))
    );
    const cached = knownProductsMapRef.current.get(id);
    if (cached) {
      knownProductsMapRef.current.set(id, { ...cached, starRating: newRating });
    }

    try {
      await updateProductStarRating(id, newRating);
    } catch (err) {
      console.error("Failed to update star rating:", err);
      if (cached) {
        setProducts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, starRating: cached.starRating } : p))
        );
      }
    }
  }, []);

  // Registry of known products for 0ms optimistic filtering
  const knownProductsMapRef = useRef<Map<string, ProductListItemDTO>>(new Map());

  useEffect(() => {
    for (const p of initialProducts) {
      if (!knownProductsMapRef.current.has(p.id)) {
        knownProductsMapRef.current.set(p.id, p);
      }
    }
  }, [initialProducts]);

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
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const selectedCategoriesRef = useRef(selectedCategories);
  selectedCategoriesRef.current = selectedCategories;
  const selectedBrandsRef = useRef(selectedBrands);
  selectedBrandsRef.current = selectedBrands;
  const debouncedSearchRef = useRef(debouncedSearch);
  debouncedSearchRef.current = debouncedSearch;

  const fetchFilteredProducts = useCallback(async () => {
    setIsFilterLoading(true);
    try {
      const res = await getProductsWithFilters({
        status: activeTabRef.current,
        categories: selectedCategoriesRef.current.length > 0 ? selectedCategoriesRef.current : undefined,
        brands: selectedBrandsRef.current.length > 0 ? selectedBrandsRef.current : undefined,
        search: debouncedSearchRef.current,
        page: 1,
        pageSize: 20,
      });

      setProducts(res.products);
      setTotalProducts(res.total);
      setStats(res.stats);
      setPage(1);
      setHasMore(res.total > res.products.length);

      for (const p of res.products) {
        knownProductsMapRef.current.set(p.id, p);
      }
    } catch (err) {
      console.error("Failed to filter products:", err);
    } finally {
      setIsFilterLoading(false);
    }
  }, []);

  const isInitialMountRef = useRef(true);

  // Filter effect: 0ms in-memory optimistic filter followed by server sync
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    // 1. Optimistic instant filter from known registry
    const localMatches: ProductListItemDTO[] = [];
    for (const p of knownProductsMapRef.current.values()) {
      if (
        productMatchesFilters(p, {
          status: activeTab,
          categories: selectedCategories.length > 0 ? selectedCategories : undefined,
          brands: selectedBrands.length > 0 ? selectedBrands : undefined,
          search: debouncedSearch,
        })
      ) {
        localMatches.push(p);
      }
    }

    if (localMatches.length > 0) {
      setProducts(localMatches);
    }

    // 2. Fetch authoritative page from server
    void fetchFilteredProducts();
  }, [activeTab, selectedCategories, selectedBrands, debouncedSearch, fetchFilteredProducts]);

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
        pageSize: 20,
      });

      setProducts((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const newItems = res.products.filter((p) => !existingIds.has(p.id));
        return [...prev, ...newItems];
      });

      for (const p of res.products) {
        knownProductsMapRef.current.set(p.id, p);
      }

      setPage(nextPage);
      setHasMore(products.length + res.products.length < res.total);
    } catch (err) {
      console.error("Failed to load more products:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, page, activeTab, selectedCategories, selectedBrands, debouncedSearch, products.length]);

  // Select card to open Slide-over drawer
  const handleSelectProduct = useCallback((id: string) => {
    setSelectedProductId(id);
    void loadEditProductPanel();
    setIsEditProductOpen(true);
  }, []);

  // Intent preload on card hover
  const handleProductIntent = useCallback((id: string) => {
    void loadEditProductPanel();
    const key = getProductOverviewKey(id);
    if (key) {
      void preload(key, fetchProductOverview);
    }
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
          />

          {/* Right Main Cards Workspace */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <ProductCardList
              products={products}
              isLoading={isFilterLoading}
              isLoadingMore={isLoadingMore}
              hasMore={hasMore}
              totalProducts={totalProducts}
              selectedProductId={selectedProductId}
              selectedForPrintIds={selectedForPrintIds}
              onToggleSelectForPrint={handleToggleSelectForPrint}
              onSelectAllForPrint={handleSelectAllForPrint}
              onClearSelectForPrint={handleClearSelectForPrint}
              onSelectProduct={handleSelectProduct}
              onRatingChange={handleRatingChange}
              onLoadMore={handleLoadMore}
              onRowIntent={handleProductIntent}
              headerAction={
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {/* Stock Status Tabs (Desktop Only) */}
                  <div className="hidden md:flex gap-1 bg-[#1E1F21] p-1 rounded-full shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveTab(ProductStatus.AVAILABLE)}
                      className={`px-3 py-1 text-xs font-bold rounded-full transition-all cursor-pointer ${
                        activeTab === ProductStatus.AVAILABLE
                          ? "bg-[#3A3B3C] text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <span>AVAILABLE</span>
                      <span className="ml-1 text-[11px] opacity-70 tabular-nums">
                        {stats.availableCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab(ProductStatus.UNAVAILABLE)}
                      className={`px-3 py-1 text-xs font-bold rounded-full transition-all cursor-pointer ${
                        activeTab === ProductStatus.UNAVAILABLE
                          ? "bg-[#3A3B3C] text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <span>UNAVAILABLE</span>
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
                    title="Manage Categories & Brands"
                  >
                    <FolderTree className="w-3.5 h-3.5" />
                  </button>

                  {/* Logistics & Container Loading Simulator Button */}
                  <button
                    type="button"
                    onClick={() => {
                      void loadProductLogisticsModal();
                      setIsLogisticsModalOpen(true);
                    }}
                    className="hidden md:flex w-8 h-8 rounded-full items-center justify-center border border-[#3A3B3C] bg-[#252728] text-slate-300 hover:text-[#C7F33C] hover:border-[#C7F33C]/50 hover:bg-[#2F3031] transition-all cursor-pointer shrink-0"
                    title="Logistics & Container Loading Simulation"
                  >
                    <Calculator className="w-3.5 h-3.5" />
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
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#C7F33C] text-black text-[10px] font-bold flex items-center justify-center shadow-xs">
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
                    className="w-8 h-8 rounded-full bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center justify-center shrink-0 cursor-pointer shadow-none"
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
              knownProductsMapRef.current.set(newProduct.id, newProduct);
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
          onClose={() => setIsEditProductOpen(false)}
          availableCategories={availableCategories}
          availableBrands={availableBrands}
          onProductUpdated={(updated) => {
            if (updated.id) {
              setProducts((prev) =>
                prev.map((p) =>
                  p.id === updated.id
                    ? {
                        ...p,
                        ...(updated.name ? { name: updated.name } : {}),
                        ...(updated.brand !== undefined ? { brand: updated.brand } : {}),
                        ...(updated.category !== undefined ? { category: updated.category } : {}),
                        ...(updated.description !== undefined ? { description: updated.description } : {}),
                        ...(updated.status ? { status: updated.status } : {}),
                        ...(updated.cbm !== undefined ? { cbm: updated.cbm } : {}),
                        ...(updated.cartonQuantity !== undefined ? { cartonQuantity: updated.cartonQuantity } : {}),
                        ...(updated.primaryImageUrl !== undefined ? { primaryImageUrl: updated.primaryImageUrl } : {}),
                        ...(updated.starRating !== undefined ? { starRating: updated.starRating } : {}),
                      }
                    : p
                )
              );
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

      {/* Product Logistics & Container Loading Simulator Modal */}
      {isLogisticsModalOpen && (
        <ProductLogisticsModal
          isOpen={isLogisticsModalOpen}
          onClose={() => setIsLogisticsModalOpen(false)}
          products={products}
          initialProductId={selectedProductId}
        />
      )}
    </WorkspaceLayout>
  );
}
