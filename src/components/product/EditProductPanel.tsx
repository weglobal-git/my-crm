"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import {
  FileText,
  Tag,
  Users,
  Save,
  Loader2,
  Check,
  X,
  Package,
  Printer,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Calculator,
} from "lucide-react";
import { ProductStatus } from "@prisma/client";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SlideOverPanel, SlideOverTab } from "@/components/ui/SlideOverPanel";
import { SlideOverSubBar } from "@/components/ui/SlideOverSubBar";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  getProductOverview,
  updateProductStatus,
  updateVariantStatus,
  setDefaultVariant,
  saveProductAll,
  getProductCategories,
  getProductBrands,
  reorderProductVariants,
} from "@/lib/actions/product";
import {
  ProductListItemDTO,
  ProductVariantDTO,
  parsePriceConditions,
  serializePriceConditions,
  PriceStepTier,
} from "@/lib/product/product-dto";
import { getOptimizedCloudinaryUrl } from "@/lib/utils";
import {
  CommercialRates,
  DEFAULT_COMMERCIAL_RATES,
  useCompanyCostOverhead,
} from "@/lib/product/use-company-cost-overhead";
import { SortableVariantCard } from "./SortableVariantCard";

const ProductCommercialReportModal = dynamic(
  () => import("./ProductCommercialReportModal").then((mod) => mod.ProductCommercialReportModal),
  { ssr: false }
);

const ProductLogisticsModal = dynamic(
  () => import("./ProductLogisticsModal").then((mod) => mod.ProductLogisticsModal),
  { ssr: false }
);

const CustomerPriceComparisonTab = dynamic(
  () => import("./CustomerPriceComparisonTab").then((mod) => mod.CustomerPriceComparisonTab),
  { ssr: false }
);

interface EditProductPanelProps {
  productId: string | null;
  initialProduct?: ProductListItemDTO | null;
  isOpen: boolean;
  onClose: () => void;
  onProductUpdated?: (updated: Partial<ProductListItemDTO>) => void;
  availableCategories?: { category: string; count: number }[];
  availableBrands?: { brand: string; count: number }[];
}

const TABS: SlideOverTab[] = [
  { key: "details", label: "Details", icon: FileText },
  { key: "pricing", label: "Pricing & Variants", icon: Tag },
  { key: "customer_prices", label: "Customer Prices", icon: Users },
];

export function EditProductPanel({
  productId,
  initialProduct,
  isOpen,
  onClose,
  onProductUpdated,
  availableCategories = [],
  availableBrands = [],
}: EditProductPanelProps) {
  const {
    commercialRates,
    totalPercent: companyCostOverheadPercent,
    calculateEffectiveCost,
  } = useCompanyCostOverhead();
  const [activeTab, setActiveTab] = useState("details");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const userEditedDetailsRef = useRef(false);

  // Available categories & brands with fallback loading
  const [categoriesList, setCategoriesList] = useState<{ category: string; count: number }[]>([]);
  const [brandsList, setBrandsList] = useState<{ brand: string; count: number }[]>([]);

  useEffect(() => {
    if (availableCategories.length === 0 && isOpen) {
      void getProductCategories().then((res) => {
        if (Array.isArray(res)) setCategoriesList(res);
      });
    }
  }, [availableCategories.length, isOpen]);

  useEffect(() => {
    if (availableBrands.length === 0 && isOpen) {
      void getProductBrands().then((res) => {
        if (Array.isArray(res)) setBrandsList(res);
      });
    }
  }, [availableBrands.length, isOpen]);

  const effectiveCategoriesList =
    availableCategories.length > 0 ? availableCategories : categoriesList;
  const effectiveBrandsList =
    availableBrands.length > 0 ? availableBrands : brandsList;

  // Form states seeded immediately from initialProduct so Details tab opens in 0ms
  const [name, setName] = useState(() => initialProduct?.name || "");
  const [brand, setBrand] = useState(() => initialProduct?.brand || "");
  const [category, setCategory] = useState(() => initialProduct?.category || "");
  const [description, setDescription] = useState(() => initialProduct?.description || "");
  const [imageUrl, setImageUrl] = useState(() => initialProduct?.primaryImageUrl || "");
  const [hsCode, setHsCode] = useState(() => initialProduct?.hsCode || "");
  const [remark, setRemark] = useState("");
  const [status, setStatus] = useState<ProductStatus>(
    () => initialProduct?.status || ProductStatus.AVAILABLE
  );
  const [starRating, setStarRating] = useState(() => initialProduct?.starRating || 0);

  // Logistics state seeded from initialProduct
  const [cbm, setCbm] = useState<number | string>(() => initialProduct?.cbm ?? "");
  const [cartonQuantity, setCartonQuantity] = useState<number | string>(
    () => initialProduct?.cartonQuantity ?? ""
  );
  const [cartonWidth, setCartonWidth] = useState<number | string>(
    () => initialProduct?.cartonWidth ?? ""
  );
  const [cartonLength, setCartonLength] = useState<number | string>(
    () => initialProduct?.cartonLength ?? ""
  );
  const [cartonHeight, setCartonHeight] = useState<number | string>(
    () => initialProduct?.cartonHeight ?? ""
  );
  const [cartonDimension, setCartonDimension] = useState(
    () => initialProduct?.cartonDimension || ""
  );

  // Variants and Customer Prices state
  const [variantEdits, setVariantEdits] = useState<
    Record<
      string,
      {
        price: number;
        productCost: number | null;
        priceCondition: string;
        imageUrl?: string | null;
        status?: ProductStatus;
      }
    >
  >({});
  const [appliedVariantId, setAppliedVariantId] = useState<string | null>(null);
  const [customerPriceEdits, setCustomerPriceEdits] = useState<
    Record<string, Record<string, number>>
  >({});
  const handleCustomerPriceChange = useCallback(
    (variantId: string, companyId: string, price: number) => {
      setCustomerPriceEdits((prev) => ({
        ...prev,
        [variantId]: {
          ...(prev[variantId] || {}),
          [companyId]: price,
        },
      }));
    },
    []
  );
  const [variantRates, setVariantRates] = useState<Record<string, CommercialRates>>({});

  const [primaryVariantId, setPrimaryVariantId] = useState<string | null>(null);
  const [uploadingVariantId, setUploadingVariantId] = useState<string | null>(null);

  // Variant ordering, collapse/expand & commercial report state
  const [orderedVariants, setOrderedVariants] = useState<ProductVariantDTO[]>([]);
  const [expandedVariantIds, setExpandedVariantIds] = useState<Record<string, boolean>>({});
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportInitialVariantId, setReportInitialVariantId] = useState<string | null>(null);
  const [logisticsModalOpen, setLogisticsModalOpen] = useState(false);

  const toggleVariantExpanded = (variantId: string, currentExpanded: boolean) => {
    setExpandedVariantIds((prev) => ({
      ...prev,
      [variantId]: !currentExpanded,
    }));
  };

  // SWR fetch overview
  const { data: overview, mutate, isLoading } = useSWR(
    isOpen && productId ? ["product-overview", productId] : null,
    ([, id]) => getProductOverview(id),
    { revalidateOnFocus: false, dedupingInterval: 10000 }
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleVariantDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentList = orderedVariants.length > 0 ? orderedVariants : overview?.variants || [];
    const oldIndex = currentList.findIndex((v) => v.id === active.id);
    const newIndex = currentList.findIndex((v) => v.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(currentList, oldIndex, newIndex);
    setOrderedVariants(reordered);

    try {
      const orderedIds = reordered.map((v) => v.id);
      if (productId) {
        await reorderProductVariants(productId, orderedIds);
        mutate(
          (prev) => (prev ? { ...prev, variants: reordered } : prev),
          false
        );
      }
    } catch (err) {
      console.error("Failed to persist variant reorder:", err);
      void mutate();
    }
  };

  const handleMoveVariant = async (index: number, direction: "up" | "down") => {
    const currentList = orderedVariants.length > 0 ? orderedVariants : overview?.variants || [];
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= currentList.length) return;

    const reordered = arrayMove(currentList, index, newIndex);
    setOrderedVariants(reordered);

    try {
      const orderedIds = reordered.map((v) => v.id);
      if (productId) {
        await reorderProductVariants(productId, orderedIds);
        mutate(
          (prev) => (prev ? { ...prev, variants: reordered } : prev),
          false
        );
      }
    } catch (err) {
      console.error("Failed to reorder variants:", err);
      void mutate();
    }
  };

  const allExpanded = useMemo(() => {
    const variants = orderedVariants.length > 0 ? orderedVariants : overview?.variants || [];
    if (variants.length === 0) return false;
    return variants.every((v) => !!expandedVariantIds[v.id]);
  }, [orderedVariants, overview?.variants, expandedVariantIds]);

  const handleToggleAllVariants = () => {
    const variants = orderedVariants.length > 0 ? orderedVariants : overview?.variants || [];
    const shouldExpand = !allExpanded;
    const nextState: Record<string, boolean> = {};
    variants.forEach((v) => {
      nextState[v.id] = shouldExpand;
    });
    setExpandedVariantIds(nextState);
  };

  // Populate local form state when overview loads
  useEffect(() => {
    if (overview) {
      React.startTransition(() => {
        if (!userEditedDetailsRef.current) {
          setName(overview.name || "");
          setBrand(overview.brand || "");
          setCategory(overview.category || "");
          setDescription(overview.description || "");
          setHsCode(overview.hsCode || "");
          setRemark(overview.remark || "");
          setStatus(overview.status);
          setStarRating(overview.starRating || 0);
          setCbm(overview.cbm ?? "");
          setCartonQuantity(overview.cartonQuantity ?? "");
          setCartonWidth(overview.cartonWidth ?? "");
          setCartonLength(overview.cartonLength ?? "");
          setCartonHeight(overview.cartonHeight ?? "");
          setCartonDimension(overview.cartonDimension || "");
        } else {
          setRemark((prev) => (prev === "" ? overview.remark || "" : prev));
        }

        // Default variant
        const primaryV = overview.variants.find((v) => v.isDefault) || overview.variants[0];
        if (primaryV) {
          setPrimaryVariantId((prev) => prev || primaryV.id);
          if (primaryV.imageUrl && !userEditedDetailsRef.current) {
            setImageUrl(primaryV.imageUrl);
          }
        }

        // Initialize variant pricing edits
        const vMap: Record<
          string,
          {
            price: number;
            productCost: number | null;
            priceCondition: string;
            imageUrl?: string | null;
            status?: ProductStatus;
          }
        > = {};
        const cpMap: Record<string, Record<string, number>> = {};

        overview.variants.forEach((v) => {
          vMap[v.id] = {
            price: v.price,
            productCost: v.productCost,
            priceCondition: v.priceCondition || "",
            imageUrl: v.imageUrl,
            status: v.status || ProductStatus.AVAILABLE,
          };

          cpMap[v.id] = {};
          v.customPrices.forEach((cp) => {
            cpMap[v.id][cp.companyId] = cp.price;
          });
        });

        setVariantEdits(vMap);
        setCustomerPriceEdits(cpMap);
        setOrderedVariants(overview.variants || []);
        setExpandedVariantIds({});
      });
    }
  }, [overview]);

  // Display Image for Header
  const displayImage = useMemo(() => {
    if (primaryVariantId && variantEdits[primaryVariantId]?.imageUrl) {
      return variantEdits[primaryVariantId].imageUrl;
    }
    const variants = orderedVariants.length > 0 ? orderedVariants : overview?.variants;
    if (variants) {
      for (const v of variants) {
        if (variantEdits[v.id]?.imageUrl) return variantEdits[v.id].imageUrl;
        if (v.imageUrl) return v.imageUrl;
      }
    }
    return imageUrl || null;
  }, [primaryVariantId, variantEdits, orderedVariants, overview?.variants, imageUrl]);

  // Set Variant as Primary Image
  const handleSetPrimaryVariant = async (variantId: string) => {
    setPrimaryVariantId(variantId);
    const chosenImg = variantEdits[variantId]?.imageUrl;
    if (chosenImg) {
      setImageUrl(chosenImg);
    }
    if (!productId) return;
    try {
      await setDefaultVariant(productId, variantId);
      if (chosenImg) {
        onProductUpdated?.({ id: productId, primaryImageUrl: chosenImg });
      }
      void mutate();
    } catch (err) {
      console.error("Failed to set primary variant:", err);
    }
  };

  // Upload image for specific variant
  const handleVariantImageUpload = async (variantId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setUploadingVariantId(variantId);
      try {
        const res = await fetch("/api/upload/product-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, productId }),
        });
        const data = await res.json();
        if (data.success && data.url) {
          setVariantEdits((prev) => ({
            ...prev,
            [variantId]: {
              ...(prev[variantId] || { price: 0, productCost: null, priceCondition: "" }),
              imageUrl: data.url,
            },
          }));
          if (variantId === primaryVariantId) {
            setImageUrl(data.url);
            onProductUpdated?.({ id: productId!, primaryImageUrl: data.url });
          }
        } else {
          alert("Image upload failed: " + (data.error || "Unknown error"));
        }
      } catch (err) {
        console.error("Upload error:", err);
        alert("Image upload failed");
      } finally {
        setUploadingVariantId(null);
      }
    };
    reader.readAsDataURL(file);
  };

  // Remove variant image
  const handleRemoveVariantImage = (variantId: string) => {
    setVariantEdits((prev) => ({
      ...prev,
      [variantId]: {
        ...(prev[variantId] || { price: 0, productCost: null, priceCondition: "" }),
        imageUrl: null,
      },
    }));
    if (variantId === primaryVariantId) {
      setImageUrl("");
    }
  };

  // Step Price Tier Handlers: do not auto-fill arbitrary numbers; let user input cleanly
  const handleAddPriceTier = (variantId: string) => {
    const currentTiers = parsePriceConditions(variantEdits[variantId]?.priceCondition);
    let updated: PriceStepTier[] = [];

    if (currentTiers.length === 0) {
      // Row 1: Carton 1+, discount blank (0)
      updated = [
        { minQuantity: 1, maxQuantity: null, discountPercent: 0 },
      ];
    } else {
      const lastTier = currentTiers[currentTiers.length - 1];
      const prevMin = lastTier.minQuantity;

      const modifiedCurrent = [...currentTiers];
      // Keep previous tier max as-is, leaving blank if not yet filled
      modifiedCurrent[modifiedCurrent.length - 1] = {
        ...lastTier,
        maxQuantity: lastTier.maxQuantity || null,
      };

      // Next tier min starts from previous max + 1 if available, otherwise prevMin + 1
      const nextMin = lastTier.maxQuantity && lastTier.maxQuantity >= prevMin
        ? lastTier.maxQuantity + 1
        : prevMin + 1;

      const newLastTier: PriceStepTier = {
        minQuantity: nextMin,
        maxQuantity: null,
        discountPercent: 0, // Blank discount %
      };

      updated = [...modifiedCurrent, newLastTier];
    }

    setVariantEdits((prev) => ({
      ...prev,
      [variantId]: {
        ...(prev[variantId] || { price: 0, productCost: null, priceCondition: "" }),
        priceCondition: serializePriceConditions(updated),
      },
    }));
  };

  const handleUpdateTierMin = (variantId: string, index: number, newMin: number) => {
    const currentTiers = parsePriceConditions(variantEdits[variantId]?.priceCondition);
    if (!currentTiers[index]) return;

    const safeMin = Math.max(1, newMin);
    const updated = [...currentTiers];

    if (index === 0) {
      let maxQty = updated[0].maxQuantity;
      if (maxQty != null && maxQty <= safeMin) {
        maxQty = null;
      }
      updated[0] = {
        ...updated[0],
        minQuantity: safeMin,
        maxQuantity: maxQty,
      };

      let nextMin = maxQty ? maxQty + 1 : safeMin + 1;
      for (let k = 1; k < updated.length; k++) {
        const isLast = k === updated.length - 1;
        const prevItemMax = updated[k].maxQuantity;

        let newTierMax: number | null = null;
        if (isLast) {
          newTierMax = null;
        } else if (prevItemMax && prevItemMax > nextMin) {
          newTierMax = prevItemMax;
        }

        updated[k] = {
          ...updated[k],
          minQuantity: nextMin,
          maxQuantity: newTierMax,
        };

        nextMin = newTierMax ? newTierMax + 1 : nextMin + 1;
      }

      setVariantEdits((prev) => ({
        ...prev,
        [variantId]: {
          ...(prev[variantId] || { price: 0, productCost: null, priceCondition: "" }),
          priceCondition: serializePriceConditions(updated),
        },
      }));
    }
  };

  const handleUpdateTierMax = (variantId: string, index: number, newMax: number | null) => {
    const currentTiers = parsePriceConditions(variantEdits[variantId]?.priceCondition);
    if (!currentTiers[index]) return;

    const updated = [...currentTiers];
    const currentMin = updated[index].minQuantity;
    const safeMax = newMax && newMax >= currentMin ? newMax : null;
    updated[index] = { ...updated[index], maxQuantity: safeMax };

    let nextMin = safeMax ? safeMax + 1 : currentMin + 1;
    for (let k = index + 1; k < updated.length; k++) {
      const isLast = k === updated.length - 1;
      const prevItemMax = updated[k].maxQuantity;

      let newTierMax: number | null = null;
      if (isLast) {
        newTierMax = null;
      } else if (prevItemMax && prevItemMax > nextMin) {
        newTierMax = prevItemMax;
      }

      updated[k] = {
        ...updated[k],
        minQuantity: nextMin,
        maxQuantity: newTierMax,
      };

      nextMin = newTierMax ? newTierMax + 1 : nextMin + 1;
    }

    setVariantEdits((prev) => ({
      ...prev,
      [variantId]: {
        ...(prev[variantId] || { price: 0, productCost: null, priceCondition: "" }),
        priceCondition: serializePriceConditions(updated),
      },
    }));
  };

  const handleUpdateTierDiscount = (variantId: string, index: number, discountPercent: number | null) => {
    const currentTiers = parsePriceConditions(variantEdits[variantId]?.priceCondition);
    if (!currentTiers[index]) return;

    const updated = [...currentTiers];
    const val = discountPercent != null && discountPercent >= 0 ? Math.min(100, discountPercent) : 0;

    updated[index] = {
      ...updated[index],
      discountPercent: val,
    };

    setVariantEdits((prev) => ({
      ...prev,
      [variantId]: {
        ...(prev[variantId] || { price: 0, productCost: null, priceCondition: "" }),
        priceCondition: serializePriceConditions(updated),
      },
    }));
  };

  const handleApplyStepPriceToAll = (sourceVariantId: string) => {
    const variants = orderedVariants.length > 0 ? orderedVariants : overview?.variants || [];
    const sourceV = variants.find((v) => v.id === sourceVariantId);
    const sourceEdit = variantEdits[sourceVariantId];

    const sourcePrice = sourceEdit?.price ?? sourceV?.price ?? 0;
    const sourceCost = sourceEdit?.productCost ?? sourceV?.productCost ?? null;
    const sourcePriceCondition =
      sourceEdit?.priceCondition ??
      sourceV?.priceCondition ??
      "";

    const sourceRates = variantRates[sourceVariantId] || { ...DEFAULT_COMMERCIAL_RATES };

    setVariantEdits((prev) => {
      const next = { ...prev };
      variants.forEach((v) => {
        const current = next[v.id] || {
          price: v.price,
          productCost: v.productCost,
          priceCondition: v.priceCondition || "",
          imageUrl: v.imageUrl,
          status: v.status || ProductStatus.AVAILABLE,
        };
        next[v.id] = {
          ...current,
          price: sourcePrice,
          productCost: sourceCost,
          priceCondition: sourcePriceCondition,
        };
      });
      return next;
    });

    setVariantRates((prev) => {
      const next = { ...prev };
      variants.forEach((v) => {
        next[v.id] = { ...sourceRates };
      });
      return next;
    });

    setAppliedVariantId(sourceVariantId);
    setTimeout(() => {
      setAppliedVariantId(null);
    }, 2000);
  };

  const handleRemovePriceTier = (variantId: string, index: number) => {
    const currentTiers = parsePriceConditions(variantEdits[variantId]?.priceCondition);
    const filtered = currentTiers.filter((_, idx) => idx !== index);

    if (filtered.length === 0) {
      setVariantEdits((prev) => ({
        ...prev,
        [variantId]: {
          ...(prev[variantId] || { price: 0, productCost: null, priceCondition: "" }),
          priceCondition: "",
        },
      }));
      return;
    }

    const reChained: PriceStepTier[] = [];
    let currentMin = Math.max(1, filtered[0]?.minQuantity || 1);

    for (let i = 0; i < filtered.length; i++) {
      const isLast = i === filtered.length - 1;
      const item = filtered[i];

      let maxQty: number | null = null;
      if (isLast) {
        maxQty = null;
      } else {
        maxQty = item.maxQuantity && item.maxQuantity > currentMin ? item.maxQuantity : currentMin + 19;
      }

      reChained.push({
        minQuantity: currentMin,
        maxQuantity: maxQty,
        discountPercent: item.discountPercent,
      });

      if (maxQty !== null) {
        currentMin = maxQty + 1;
      }
    }

    setVariantEdits((prev) => ({
      ...prev,
      [variantId]: {
        ...(prev[variantId] || { price: 0, productCost: null, priceCondition: "" }),
        priceCondition: serializePriceConditions(reChained),
      },
    }));
  };

  const handleToggleVariantStatus = async (variantId: string) => {
    const current =
      variantEdits[variantId]?.status ??
      overview?.variants.find((v) => v.id === variantId)?.status ??
      ProductStatus.AVAILABLE;

    const nextStatus =
      current === ProductStatus.AVAILABLE
        ? ProductStatus.UNAVAILABLE
        : ProductStatus.AVAILABLE;

    // Optimistic UI update in variantEdits
    setVariantEdits((prev) => ({
      ...prev,
      [variantId]: {
        ...(prev[variantId] || {
          price: 0,
          productCost: null,
          priceCondition: "",
        }),
        status: nextStatus,
      },
    }));

    try {
      const res = await updateVariantStatus(variantId, nextStatus);
      setStatus(res.productStatus);
      if (productId) {
        onProductUpdated?.({ id: productId, status: res.productStatus });
      }
      void mutate();
    } catch (err) {
      console.error("Failed to toggle variant status:", err);
      // Rollback
      setVariantEdits((prev) => ({
        ...prev,
        [variantId]: {
          ...(prev[variantId] || {
            price: 0,
            productCost: null,
            priceCondition: "",
          }),
          status: current,
        },
      }));
    }
  };

  // Toggle status (parent product fallback)
  const handleToggleStatus = async () => {
    if (!productId) return;
    const prevStatus = status;
    const nextStatus =
      prevStatus === ProductStatus.AVAILABLE
        ? ProductStatus.UNAVAILABLE
        : ProductStatus.AVAILABLE;

    setStatus(nextStatus);

    // Optimistically update variant edits in local state
    setVariantEdits((prev) => {
      const next = { ...prev };
      for (const vId of Object.keys(next)) {
        next[vId] = { ...next[vId], status: nextStatus };
      }
      return next;
    });

    try {
      await updateProductStatus(productId, nextStatus);
      onProductUpdated?.({ id: productId, status: nextStatus });
      void mutate();
    } catch (err) {
      console.error("Failed to toggle product status:", err);
      setStatus(prevStatus); // Rollback
      void mutate();
    }
  };

  // Save changes
  const handleSaveAll = async () => {
    if (!productId) return;
    setSaveError(null);
    setIsSaving(true);
    setSaveSuccess(false);

    // 0. Validate Variants Data before saving
    const variantsList = orderedVariants.length > 0 ? orderedVariants : overview?.variants || [];
    for (const v of variantsList) {
      const vData = variantEdits[v.id];
      if (!vData) continue;
      const formulaName = v.formula || "Standard";

      // 0a. Validate Volume Tier Discounts completeness
      const tiers = parsePriceConditions(vData.priceCondition);
      if (tiers.length > 0) {
        for (let i = 0; i < tiers.length; i++) {
          const t = tiers[i];
          const isLast = i === tiers.length - 1;

          // Discount % must be filled and > 0
          if (t.discountPercent == null || t.discountPercent <= 0) {
            setSaveError(
              `ไม่สามารถบันทึกได้: กรุณาระบุส่วนลด (Discount %) ใน Tier ${i + 1} ของสูตร "${formulaName}"`
            );
            setActiveTab("pricing");
            setExpandedVariantIds((prev) => ({ ...prev, [v.id]: true }));
            setIsSaving(false);
            return;
          }

          // Discount % must be strictly ascending
          if (i > 0 && t.discountPercent <= tiers[i - 1].discountPercent) {
            setSaveError(
              `ไม่สามารถบันทึกได้: ส่วนลดใน Tier ${i + 1} (${t.discountPercent}%) ต้องมากกว่า Tier ${i} (${tiers[i - 1].discountPercent}%) ของสูตร "${formulaName}"`
            );
            setActiveTab("pricing");
            setExpandedVariantIds((prev) => ({ ...prev, [v.id]: true }));
            setIsSaving(false);
            return;
          }

          // Carton max volume must be filled and > min on intermediate tiers
          if (!isLast && (!t.maxQuantity || t.maxQuantity <= t.minQuantity)) {
            setSaveError(
              `ไม่สามารถบันทึกได้: กรุณาระบุจำนวนลังสูงสุด (Carton Volume) ใน Tier ${i + 1} ของสูตร "${formulaName}"`
            );
            setActiveTab("pricing");
            setExpandedVariantIds((prev) => ({ ...prev, [v.id]: true }));
            setIsSaving(false);
            return;
          }
        }
      }
    }

    try {
      const wVal = typeof cartonWidth === "number" ? cartonWidth : parseFloat(cartonWidth as string) || 0;
      const lVal = typeof cartonLength === "number" ? cartonLength : parseFloat(cartonLength as string) || 0;
      const hVal = typeof cartonHeight === "number" ? cartonHeight : parseFloat(cartonHeight as string) || 0;
      const autoComputedCbm =
        wVal > 0 && lVal > 0 && hVal > 0
          ? Number(((wVal * lVal * hVal) / 1_000_000).toFixed(4))
          : typeof cbm === "number"
          ? cbm
          : parseFloat(cbm as string) || null;
      const parsedCartonQuantity =
        typeof cartonQuantity === "number"
          ? cartonQuantity
          : parseInt(cartonQuantity as string, 10) || null;

      // Dirty check variants: only send variants that actually changed
      const origVariantsMap = new Map(
        (overview?.variants || []).map((v) => [v.id, v])
      );
      const dirtyVariants: Array<{
        id: string;
        price?: number;
        productCost?: number | null;
        priceCondition?: string | null;
        imageUrl?: string | null;
        status?: ProductStatus;
      }> = [];

      for (const [vId, vData] of Object.entries(variantEdits)) {
        const origV = origVariantsMap.get(vId);
        const nextCond = vData.priceCondition || null;
        const origCond = origV?.priceCondition || null;
        if (
          !origV ||
          vData.price !== origV.price ||
          vData.productCost !== origV.productCost ||
          nextCond !== origCond ||
          vData.imageUrl !== origV.imageUrl ||
          vData.status !== origV.status
        ) {
          dirtyVariants.push({
            id: vId,
            price: vData.price,
            productCost: vData.productCost,
            priceCondition: nextCond,
            imageUrl: vData.imageUrl,
            status: vData.status,
          });
        }
      }

      const origPrimaryV =
        overview?.variants.find((v) => v.isDefault) || overview?.variants[0];
      const dirtyPrimaryVariantId =
        primaryVariantId && primaryVariantId !== origPrimaryV?.id
          ? primaryVariantId
          : displayImage !== origPrimaryV?.imageUrl
          ? primaryVariantId || origPrimaryV?.id || null
          : null;

      // Dirty check customer prices: only send customer prices that were added or changed
      const dirtyCustomerPrices: Array<{
        variantId: string;
        companyId: string;
        price: number;
      }> = [];
      for (const [vId, compMap] of Object.entries(customerPriceEdits)) {
        const origV = origVariantsMap.get(vId);
        const origCpMap = new Map(
          (origV?.customPrices || []).map((cp) => [cp.companyId, cp.price])
        );
        for (const [compId, price] of Object.entries(compMap)) {
          if (price > 0 && origCpMap.get(compId) !== price) {
            dirtyCustomerPrices.push({
              variantId: vId,
              companyId: compId,
              price,
            });
          }
        }
      }

      const res = await saveProductAll(productId, {
        details: {
          name,
          brand: brand || null,
          category: category || null,
          description: description || null,
          imageUrl: displayImage || null,
          hsCode: hsCode || null,
          remark: remark || null,
          starRating,
          cbm: autoComputedCbm,
          cartonQuantity: parsedCartonQuantity,
          cartonWidth: wVal || null,
          cartonLength: lVal || null,
          cartonHeight: hVal || null,
          cartonDimension: cartonDimension || null,
        },
        variants: dirtyVariants,
        primaryVariantId: dirtyPrimaryVariantId,
        customerPrices: dirtyCustomerPrices,
      });

      userEditedDetailsRef.current = false;
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);

      onProductUpdated?.(res.product);
      void mutate(res.overview, false);
    } catch (err: unknown) {
      console.error("Failed to save product:", err);
      const errMsg = err instanceof Error ? err.message : (err as { message?: string })?.message;
      setSaveError(errMsg || "บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSaving(false);
    }
  };

  // Dynamic CBM & Dimension Calculations
  const numericW = typeof cartonWidth === "number" ? cartonWidth : parseFloat(cartonWidth as string) || 0;
  const numericL = typeof cartonLength === "number" ? cartonLength : parseFloat(cartonLength as string) || 0;
  const numericH = typeof cartonHeight === "number" ? cartonHeight : parseFloat(cartonHeight as string) || 0;
  const computedCbmFromDim =
    numericW > 0 && numericL > 0 && numericH > 0
      ? Number(((numericW * numericL * numericH) / 1_000_000).toFixed(4))
      : 0;

  const derivedGrossWeight = useMemo(() => {
    const list = orderedVariants.length > 0 ? orderedVariants : overview?.variants || [];
    const pv =
      list.find((v) => (primaryVariantId ? v.id === primaryVariantId : v.isDefault)) ||
      list[0];
    if (pv?.cartonGrossWeight && pv.cartonGrossWeight > 0) {
      return pv.cartonGrossWeight;
    }
    const anyGw = list.find((v) => (v.cartonGrossWeight ?? 0) > 0);
    if (anyGw?.cartonGrossWeight) return anyGw.cartonGrossWeight;
    return initialProduct?.cartonGrossWeight || 0;
  }, [orderedVariants, overview?.variants, primaryVariantId, initialProduct?.cartonGrossWeight]);

  const categoryOptions = useMemo(() => {
    const opts = effectiveCategoriesList.map((c) => ({
      label: c.category,
      value: c.category,
      searchTerms: c.category,
    }));
    if (category && !opts.some((o) => o.value.toLowerCase() === category.toLowerCase())) {
      opts.unshift({ label: category, value: category, searchTerms: category });
    }
    return opts;
  }, [effectiveCategoriesList, category]);

  const brandOptions = useMemo(() => {
    const opts = effectiveBrandsList.map((b) => ({
      label: b.brand,
      value: b.brand,
      searchTerms: b.brand,
    }));
    if (brand && !opts.some((o) => o.value.toLowerCase() === brand.toLowerCase())) {
      opts.unshift({ label: brand, value: brand, searchTerms: brand });
    }
    return opts;
  }, [effectiveBrandsList, brand]);

  const headerVariantCount = overview
    ? overview.variants.length
    : initialProduct?.variantCount ?? 0;

  return (
    <>
      <SlideOverPanel
      isOpen={isOpen && !!productId}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#1C1C1D] border border-[#3A3B3C] overflow-hidden flex items-center justify-center shrink-0 shadow-sm">
            {displayImage ? (
              <img
                src={getOptimizedCloudinaryUrl(displayImage, 100)}
                alt={name}
                className="w-full h-full object-contain p-0.5"
              />
            ) : (
              <Package className="w-5 h-5 text-slate-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-100 truncate" title={name}>
              {name || "Edit Product"}
            </h3>
            <p className="text-xs text-slate-400 truncate mt-0.5 font-normal">
              {category
                ? `${category} • ${brand || "No Brand"} • ${headerVariantCount} Variants`
                : `${brand || "No Brand"} • ${headerVariantCount} Variants`}
            </p>
          </div>
        </div>
      }
      subtitle={null}
      headerRight={
        <div className="flex items-center px-1">
          <button
            type="button"
            role="switch"
            aria-checked={status === ProductStatus.AVAILABLE}
            onClick={handleToggleStatus}
            className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 cursor-pointer focus:outline-none ${
              status === ProductStatus.AVAILABLE
                ? "bg-[#C7F33C]"
                : "bg-[#3A3B3C]"
            }`}
            title={
              status === ProductStatus.AVAILABLE
                ? "Available (Click to switch to Unavailable)"
                : "Unavailable (Click to switch to Available)"
            }
          >
            <div
              className={`w-4 h-4 rounded-full transition-transform ${
                status === ProductStatus.AVAILABLE
                  ? "translate-x-4 bg-black"
                  : "translate-x-0 bg-slate-400"
              }`}
            />
          </button>
        </div>
      }
      subBar={
        <SlideOverSubBar
          customActionSlot={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setLogisticsModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#252728] border border-[#3A3B3C] text-slate-300 hover:text-[#C7F33C] hover:border-[#C7F33C]/50 hover:bg-[#2F3031] text-xs font-semibold transition-all cursor-pointer shadow-xs"
                title="Container Loading Simulation"
              >
                <Calculator className="w-3.5 h-3.5 text-[#C7F33C]" />
                <span>Loading Simulator</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setReportInitialVariantId(null);
                  setReportModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#252728] border border-[#3A3B3C] text-slate-300 hover:text-[#C7F33C] hover:border-[#C7F33C]/50 hover:bg-[#2F3031] text-xs font-semibold transition-all cursor-pointer shadow-xs"
                title="Print Product Commercial Report & Pricing Calculations"
              >
                <Printer className="w-3.5 h-3.5 text-[#C7F33C]" />
                <span>Commercial Report</span>
              </button>
            </div>
          }
          actions={[
            {
              id: "save",
              label: isSaving ? "Saving..." : saveSuccess ? "Saved!" : "Save Changes",
              icon: isSaving ? Loader2 : saveSuccess ? Check : Save,
              onClick: handleSaveAll,
              disabled: isSaving,
              variant: "default",
            },
          ]}
        />
      }
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      widthClass={
        activeTab === "customer_prices"
          ? "w-[960px] max-w-[96vw]"
          : "w-[650px]"
      }
    >
      {isLoading && !overview && (!initialProduct || activeTab !== "details") ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#C7F33C] animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-6 pb-8">
          {/* Validation Save Error Banner */}
          {saveError && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start justify-between gap-3 animate-in fade-in duration-200">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">{saveError}</span>
              </div>
              <button
                type="button"
                onClick={() => setSaveError(null)}
                className="text-rose-400 hover:text-white p-0.5 rounded cursor-pointer"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* TAB 1: DETAILS (Consolidated with Logistics & Two-Way Calculator) */}
          {activeTab === "details" && (
            <div className="flex flex-col gap-5">
              {/* Box 1: Product Basic Details */}
              <div className="bg-[#3A3B3C] rounded-2xl p-5 space-y-5 border-0">
                {/* Header: Title */}
                <div className="flex items-center justify-between border-b border-[#252728] pb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Product Details
                  </span>
                </div>

                {/* Full-Width Product Name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Product Name <span className="text-[#C7F33C]">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      userEditedDetailsRef.current = true;
                      setName(e.target.value);
                    }}
                    className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-[#C7F33C] outline-none"
                    placeholder="Enter product title..."
                  />
                </div>

                {/* Category & Brand (2-Column Grid) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-300">Category</label>
                    <SearchableSelect
                      options={categoryOptions}
                      value={category}
                      onChange={(val) => {
                        userEditedDetailsRef.current = true;
                        setCategory(val);
                      }}
                      placeholder="Select or type category..."
                      isClearable
                      allowCustom
                      buttonClassName="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-left text-xs text-slate-100 focus:border-[#C7F33C] transition-colors flex items-center justify-between outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-300">Brand</label>
                    <SearchableSelect
                      options={brandOptions}
                      value={brand}
                      onChange={(val) => {
                        userEditedDetailsRef.current = true;
                        setBrand(val);
                      }}
                      placeholder="Select or type brand..."
                      isClearable
                      allowCustom
                      buttonClassName="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-left text-xs text-slate-100 focus:border-[#C7F33C] transition-colors flex items-center justify-between outline-none"
                    />
                  </div>
                </div>

                {/* Thai Name & HS Code (2-Column Grid) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      Thai Name / Description
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => {
                        userEditedDetailsRef.current = true;
                        setDescription(e.target.value);
                      }}
                      className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-[#C7F33C] outline-none"
                      placeholder="Thai name or local description..."
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-300">HS Code</label>
                    <input
                      type="text"
                      value={hsCode}
                      onChange={(e) => {
                        userEditedDetailsRef.current = true;
                        setHsCode(e.target.value);
                      }}
                      className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-[#C7F33C] outline-none"
                      placeholder="e.g. 3304.99.90"
                    />
                  </div>
                </div>

                {/* Remark (Textarea) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-300">Remark</label>
                  <textarea
                    rows={2}
                    value={remark}
                    onChange={(e) => {
                      userEditedDetailsRef.current = true;
                      setRemark(e.target.value);
                    }}
                    className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-[#C7F33C] outline-none resize-none"
                    placeholder="Additional notes for this product..."
                  />
                </div>
              </div>

              {/* Box 2: Carton & Packing Specifications */}
              <div className="bg-[#3A3B3C] rounded-2xl p-5 space-y-4 border-0">
                <div className="flex items-center justify-between border-b border-[#252728] pb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Carton & Packing Specifications
                  </span>
                  {computedCbmFromDim > 0 && (
                    <span className="text-[11px] font-medium text-slate-400">
                      CBM: <span className="text-slate-200 font-bold tabular-nums">{computedCbmFromDim} m³</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      Units per Carton (pcs)
                    </label>
                    <input
                      type="number"
                      value={cartonQuantity}
                      onChange={(e) => {
                        userEditedDetailsRef.current = true;
                        setCartonQuantity(e.target.value);
                      }}
                      className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-100 outline-none focus:border-[#C7F33C] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="e.g. 12"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      Carton GW (kg)
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={derivedGrossWeight > 0 ? `${Number(derivedGrossWeight.toFixed(2))} kg` : "—"}
                      className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-400 outline-none cursor-not-allowed"
                      title="Gross weight derived from variant packaging"
                    />
                  </div>
                </div>

                {/* Dimensions (cm) */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-300">Width (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={cartonWidth}
                      onChange={(e) => {
                        userEditedDetailsRef.current = true;
                        setCartonWidth(e.target.value);
                      }}
                      className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-100 outline-none focus:border-[#C7F33C] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="Width"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-300">Length (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={cartonLength}
                      onChange={(e) => {
                        userEditedDetailsRef.current = true;
                        setCartonLength(e.target.value);
                      }}
                      className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-100 outline-none focus:border-[#C7F33C] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="Length"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-300">Height (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={cartonHeight}
                      onChange={(e) => {
                        userEditedDetailsRef.current = true;
                        setCartonHeight(e.target.value);
                      }}
                      className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-100 outline-none focus:border-[#C7F33C] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="Height"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PRICING & VARIANTS */}
          {activeTab === "pricing" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Formula Variants ({(orderedVariants.length > 0 ? orderedVariants : overview?.variants || []).length})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleAllVariants}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#252728] hover:bg-[#2F3031] text-slate-300 hover:text-white text-xs font-semibold border border-[#3E4042] transition-colors cursor-pointer"
                  >
                    {allExpanded ? (
                      <>
                        <ChevronUp className="w-3.5 h-3.5" />
                        <span>Collapse All</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3.5 h-3.5" />
                        <span>Expand All</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleVariantDragEnd}
              >
                <SortableContext
                  items={(orderedVariants.length > 0 ? orderedVariants : overview?.variants || []).map((v) => v.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4">
                    {(orderedVariants.length > 0 ? orderedVariants : overview?.variants || []).map((v, idx) => {
                      const currentEdit = variantEdits[v.id] || {
                        price: v.price,
                        productCost: v.productCost,
                        priceCondition: v.priceCondition || "",
                        imageUrl: v.imageUrl,
                        status: v.status || ProductStatus.AVAILABLE,
                      };
                      const isThisPrimary =
                        primaryVariantId === v.id || (!primaryVariantId && v.isDefault);
                      const isExpanded = !!expandedVariantIds[v.id];
                      const totalVariants = (orderedVariants.length > 0 ? orderedVariants : overview?.variants || []).length;

                      return (
                        <SortableVariantCard
                          key={v.id}
                          v={v}
                          idx={idx}
                          total={totalVariants}
                          currentEdit={currentEdit}
                          isThisPrimary={isThisPrimary}
                          isExpanded={isExpanded}
                          productName={overview?.name || name}
                          uploadingVariantId={uploadingVariantId}
                          variantRates={variantRates[v.id] || DEFAULT_COMMERCIAL_RATES}
                          appliedVariantId={appliedVariantId}
                          companyCostOverheadPercent={companyCostOverheadPercent}
                          commercialRates={commercialRates}
                          calculateEffectiveCost={calculateEffectiveCost}
                          onToggleExpand={() => toggleVariantExpanded(v.id, isExpanded)}
                          onMove={handleMoveVariant}
                          onImageUpload={(file) => void handleVariantImageUpload(v.id, file)}
                          onRemoveImage={() => handleRemoveVariantImage(v.id)}
                          onSetPrimary={() => void handleSetPrimaryVariant(v.id)}
                          onToggleStatus={() => handleToggleVariantStatus(v.id)}
                          onPriceChange={(val) => {
                            setVariantEdits((prev) => ({
                              ...prev,
                              [v.id]: { ...currentEdit, price: val },
                            }));
                          }}
                          onCostChange={(val) => {
                            setVariantEdits((prev) => ({
                              ...prev,
                              [v.id]: { ...currentEdit, productCost: val },
                            }));
                          }}
                          onAddTier={() => handleAddPriceTier(v.id)}
                          onUpdateTier={(tIdx, field, val) => {
                            if (field === "maxQuantity") handleUpdateTierMax(v.id, tIdx, val);
                            else if (field === "minQuantity") handleUpdateTierMin(v.id, tIdx, val);
                            else handleUpdateTierDiscount(v.id, tIdx, val);
                          }}
                          onRemoveTier={(tIdx) => handleRemovePriceTier(v.id, tIdx)}
                          onApplyToAll={() => handleApplyStepPriceToAll(v.id)}
                          onRatesChange={(newRates) => {
                            setVariantRates((prev) => ({
                              ...prev,
                              [v.id]: newRates,
                            }));
                          }}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}

          {/* TAB 3: CUSTOMER PRICES & PROFITABILITY COMPARISON */}
          {activeTab === "customer_prices" && (
            <CustomerPriceComparisonTab
              variants={
                orderedVariants.length > 0
                  ? orderedVariants
                  : overview?.variants || []
              }
              variantEdits={variantEdits}
              customerPriceEdits={customerPriceEdits}
              onCustomerPriceChange={handleCustomerPriceChange}
              commercialRates={commercialRates}
              companyCostOverheadPercent={companyCostOverheadPercent}
              calculateEffectiveCost={calculateEffectiveCost}
            />
          )}


        </div>
      )}
      </SlideOverPanel>

      {/* Commercial Specification & Pricing Waterfall Report Modal (Lazy mounted only when opened) */}
      {overview && reportModalOpen && (
        <ProductCommercialReportModal
          isOpen={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          product={{ ...overview, variants: orderedVariants.length > 0 ? orderedVariants : overview.variants }}
          productName={name || overview.name || "Product"}
          category={category || overview.category || ""}
          brand={brand || overview.brand || ""}
          hsCode={hsCode || overview.hsCode || ""}
          variantEdits={variantEdits}
          variantRates={variantRates}
          initialVariantId={reportInitialVariantId}
        />
      )}

      {/* Logistics & Container Loading Simulation Modal (Lazy mounted only when opened) */}
      {overview && logisticsModalOpen && (
        <ProductLogisticsModal
          isOpen={logisticsModalOpen}
          onClose={() => setLogisticsModalOpen(false)}
          initialProductId={productId}
          initialProductOverview={overview}
        />
      )}
    </>
  );
}
