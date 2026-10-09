"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import useSWR from "swr";
import {
  FileText,
  Tag,
  Users,
  Box,
  Save,
  Loader2,
  Check,
  Search,
  Star,
  Upload,
  X,
  Package,
  Plus,
  Trash2,
  Copy,
  Printer,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  GripVertical,
  Sparkles,
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
  updateProductDetails,
  updateVariantPrice,
  updateVariantStatus,
  setDefaultVariant,
  upsertCompanyPrice,
  updateProductStarRating,
  getProductCategories,
  getProductBrands,
  reorderProductVariants,
} from "@/lib/actions/product";
import {
  ProductListItemDTO,
  ProductVariantDTO,
  parsePriceConditions,
  serializePriceConditions,
  calculateTierPrice,
  PriceStepTier,
} from "@/lib/product/product-dto";
import { getOptimizedCloudinaryUrl } from "@/lib/utils";
import {
  CommercialRates,
  DEFAULT_COMMERCIAL_RATES,
} from "./ExportPricingSimulation";
import { ProductCommercialReportModal } from "./ProductCommercialReportModal";
import { SortableVariantCard } from "./SortableVariantCard";
import { ProductLogisticsModal } from "./ProductLogisticsModal";

interface EditProductPanelProps {
  productId: string | null;
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
  isOpen,
  onClose,
  onProductUpdated,
  availableCategories = [],
  availableBrands = [],
}: EditProductPanelProps) {
  const [activeTab, setActiveTab] = useState("details");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Available categories & brands with fallback loading
  const [categoriesList, setCategoriesList] = useState(availableCategories);
  const [brandsList, setBrandsList] = useState(availableBrands);

  useEffect(() => {
    if (availableCategories.length > 0) {
      setCategoriesList(availableCategories);
    } else if (isOpen) {
      void getProductCategories().then((res) => {
        if (Array.isArray(res)) setCategoriesList(res);
      });
    }
  }, [availableCategories, isOpen]);

  useEffect(() => {
    if (availableBrands.length > 0) {
      setBrandsList(availableBrands);
    } else if (isOpen) {
      void getProductBrands().then((res) => {
        if (Array.isArray(res)) setBrandsList(res);
      });
    }
  }, [availableBrands, isOpen]);

  // Form states
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [hsCode, setHsCode] = useState("");
  const [remark, setRemark] = useState("");
  const [status, setStatus] = useState<ProductStatus>(ProductStatus.AVAILABLE);
  const [starRating, setStarRating] = useState(0);
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  // Logistics state
  const [cbm, setCbm] = useState<number | string>("");
  const [cartonQuantity, setCartonQuantity] = useState<number | string>("");
  const [cartonWidth, setCartonWidth] = useState<number | string>("");
  const [cartonLength, setCartonLength] = useState<number | string>("");
  const [cartonHeight, setCartonHeight] = useState<number | string>("");
  const [cartonDimension, setCartonDimension] = useState("");

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
  const [customerSearch, setCustomerSearch] = useState("");
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
      setName(overview.name || "");
      setBrand(overview.brand || "");
      setCategory(overview.category || "");
      setDescription(overview.description || "");
      setHsCode(overview.hsCode || "");
      setRemark(overview.remark || "");
      setStatus(overview.status);
      setStarRating(overview.starRating || 0);

      // Default variant
      const primaryV = overview.variants.find((v) => v.isDefault) || overview.variants[0];
      if (primaryV) {
        setPrimaryVariantId(primaryV.id);
        if (primaryV.imageUrl) setImageUrl(primaryV.imageUrl);
      }

      setCbm(overview.cbm ?? "");
      setCartonQuantity(overview.cartonQuantity ?? "");
      setCartonWidth(overview.cartonWidth ?? "");
      setCartonLength(overview.cartonLength ?? "");
      setCartonHeight(overview.cartonHeight ?? "");
      setCartonDimension(overview.cartonDimension || "");

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
    let currentMin = 1;

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
    const nextStatus =
      status === ProductStatus.AVAILABLE
        ? ProductStatus.UNAVAILABLE
        : ProductStatus.AVAILABLE;

    setStatus(nextStatus);
    try {
      await updateProductStatus(productId, nextStatus);
      onProductUpdated?.({ id: productId, status: nextStatus });
      void mutate();
    } catch (err) {
      console.error("Failed to toggle product status:", err);
      setStatus(status); // Rollback
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

      // 0b. Validate Profit Margin: cannot be negative if cost is provided
      const cost = vData.productCost;
      if (typeof cost === "number" && cost > 0) {
        const basePrice = Number(vData.price || 0);
        const pricesToCheck = [basePrice];
        tiers.forEach((t) => {
          if (t.discountPercent > 0) {
            pricesToCheck.push(calculateTierPrice(basePrice, t.discountPercent));
          }
        });

        const vRate = variantRates[v.id] || DEFAULT_COMMERCIAL_RATES;
        const genDeductionRate = vRate.commissionRate;

        for (const p of pricesToCheck) {
          const genNetRev = p * (1 - genDeductionRate / 100);
          const genMargin = genNetRev - cost;
          if (genMargin < 0) {
            setSaveError(
              `ไม่สามารถบันทึกได้: สูตร "${formulaName}" มี Profit Margin ติดลบใน General Export (${genMargin.toFixed(2)} THB) ที่ราคา ฿${p.toFixed(2)} กรุณาปรับราคาหรือส่วนลด`
            );
            setActiveTab("pricing");
            setExpandedVariantIds((prev) => ({ ...prev, [v.id]: true }));
            setIsSaving(false);
            return;
          }

          const exclQuotation = p * (1 - vRate.distFeeRate / 100);
          const exclNetRev = exclQuotation * (1 - (vRate.mktSupportRate + vRate.rebateRate) / 100);
          const exclMargin = exclNetRev - cost;
          if (exclMargin < 0) {
            setSaveError(
              `ไม่สามารถบันทึกได้: สูตร "${formulaName}" มี Profit Margin ติดลบใน Exclusive Distributor (${exclMargin.toFixed(2)} THB) ที่ราคา ฿${p.toFixed(2)} กรุณาปรับราคาหรือส่วนลด`
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
      // 1. Update parent product details
      const wVal = typeof cartonWidth === "number" ? cartonWidth : parseFloat(cartonWidth as string) || 0;
      const lVal = typeof cartonLength === "number" ? cartonLength : parseFloat(cartonLength as string) || 0;
      const hVal = typeof cartonHeight === "number" ? cartonHeight : parseFloat(cartonHeight as string) || 0;
      const autoComputedCbm =
        wVal > 0 && lVal > 0 && hVal > 0
          ? Number(((wVal * lVal * hVal) / 1_000_000).toFixed(4))
          : typeof cbm === "number"
          ? cbm
          : parseFloat(cbm as string) || null;

      await updateProductDetails(productId, {
        name,
        brand: brand || null,
        category: category || null,
        description: description || null,
        imageUrl: displayImage || null,
        hsCode: hsCode || null,
        remark: remark || null,
        starRating,
        cbm: autoComputedCbm,
        cartonQuantity: typeof cartonQuantity === "number" ? cartonQuantity : parseInt(cartonQuantity as string, 10) || null,
        cartonWidth: wVal || null,
        cartonLength: lVal || null,
        cartonHeight: hVal || null,
        cartonDimension: cartonDimension || null,
      });

      // 2. Update variant prices, images, price conditions, and status
      for (const [vId, vData] of Object.entries(variantEdits)) {
        await updateVariantPrice(vId, {
          price: vData.price,
          productCost: vData.productCost,
          priceCondition: vData.priceCondition || null,
          imageUrl: vData.imageUrl,
          status: vData.status,
        });
      }

      // If primary variant was selected, persist it
      if (primaryVariantId) {
        await setDefaultVariant(productId, primaryVariantId);
      }

      // 3. Upsert customer prices
      for (const [vId, compMap] of Object.entries(customerPriceEdits)) {
        for (const [compId, price] of Object.entries(compMap)) {
          if (price > 0) {
            await upsertCompanyPrice(vId, compId, price);
          }
        }
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);

      onProductUpdated?.({
        id: productId,
        name,
        brand: brand || null,
        category: category || null,
        description: description || null,
        status,
        starRating,
        primaryImageUrl: displayImage || null,
        cbm: autoComputedCbm,
        cartonQuantity: typeof cartonQuantity === "number" ? cartonQuantity : parseInt(cartonQuantity as string, 10) || null,
      });

      void mutate();
    } catch (err: any) {
      console.error("Failed to save product:", err);
      setSaveError(err?.message || "บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
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
  const numericCbm =
    computedCbmFromDim > 0
      ? computedCbmFromDim
      : typeof cbm === "number"
      ? cbm
      : parseFloat(cbm as string) || 0;
  const numericCartonQty = typeof cartonQuantity === "number" ? cartonQuantity : parseInt(cartonQuantity as string, 10) || 0;

  const cartons20ft = numericCbm > 0 ? Math.floor(28 / numericCbm) : 0;
  const cartons40ft = numericCbm > 0 ? Math.floor(58 / numericCbm) : 0;
  const units20ft = cartons20ft * (numericCartonQty || 1);
  const units40ft = cartons40ft * (numericCartonQty || 1);

  const derivedGrossWeight = useMemo(() => {
    const list = orderedVariants.length > 0 ? orderedVariants : overview?.variants || [];
    const pv =
      list.find((v) => (primaryVariantId ? v.id === primaryVariantId : v.isDefault)) ||
      list[0];
    if (pv?.cartonGrossWeight && pv.cartonGrossWeight > 0) {
      return pv.cartonGrossWeight;
    }
    const anyGw = list.find((v) => (v.cartonGrossWeight ?? 0) > 0);
    return anyGw?.cartonGrossWeight || 0;
  }, [orderedVariants, overview?.variants, primaryVariantId]);

  const hasDimensions = numericW > 0 && numericL > 0 && numericH > 0;
  const hasPackingSpecs = hasDimensions && derivedGrossWeight > 0;

  const effectiveRating = hoverRating !== null ? hoverRating : starRating;

  const categoryOptions = useMemo(() => {
    const opts = categoriesList.map((c) => ({
      label: c.category,
      value: c.category,
      searchTerms: c.category,
    }));
    if (category && !opts.some((o) => o.value.toLowerCase() === category.toLowerCase())) {
      opts.unshift({ label: category, value: category, searchTerms: category });
    }
    return opts;
  }, [categoriesList, category]);

  const brandOptions = useMemo(() => {
    const opts = brandsList.map((b) => ({
      label: b.brand,
      value: b.brand,
      searchTerms: b.brand,
    }));
    if (brand && !opts.some((o) => o.value.toLowerCase() === brand.toLowerCase())) {
      opts.unshift({ label: brand, value: brand, searchTerms: brand });
    }
    return opts;
  }, [brandsList, brand]);

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
                ? `${category} • ${brand || "No Brand"} • ${overview?.variants?.length || 0} Variants`
                : `${brand || "No Brand"} • ${overview?.variants?.length || 0} Variants`}
            </p>
          </div>
        </div>
      }
      subtitle={null}
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
      widthClass="w-[650px]"
    >
      {isLoading && !overview ? (
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
                {/* Header: Title & Priority Star Rating */}
                <div className="flex items-center justify-between border-b border-[#252728] pb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Product Details
                  </span>

                  {/* Priority Star Rating */}
                  <div
                    className="flex items-center gap-1.5"
                    onMouseLeave={() => setHoverRating(null)}
                  >
                    <span className="text-xs font-semibold text-slate-400 mr-1">Priority:</span>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => {
                          const next = starRating === star ? 0 : star;
                          setStarRating(next);
                          if (productId) {
                            void updateProductStarRating(productId, next);
                            onProductUpdated?.({ id: productId, starRating: next });
                          }
                        }}
                        onMouseEnter={() => setHoverRating(star)}
                        className="p-0.5 cursor-pointer hover:scale-125 transition-transform"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            star <= effectiveRating
                              ? "fill-amber-400 text-amber-400"
                              : "text-slate-600 fill-transparent"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Full-Width Product Name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Product Name <span className="text-[#C7F33C]">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
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
                      onChange={setCategory}
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
                      onChange={setBrand}
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
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-[#C7F33C] outline-none"
                      placeholder="Thai name or local description..."
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-300">HS Code</label>
                    <input
                      type="text"
                      value={hsCode}
                      onChange={(e) => setHsCode(e.target.value)}
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
                    onChange={(e) => setRemark(e.target.value)}
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
                      onChange={(e) => setCartonQuantity(e.target.value)}
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
                      onChange={(e) => setCartonWidth(e.target.value)}
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
                      onChange={(e) => setCartonLength(e.target.value)}
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
                      onChange={(e) => setCartonHeight(e.target.value)}
                      className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-100 outline-none focus:border-[#C7F33C] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="Height"
                    />
                  </div>
                </div>

                {/* Clean Simulator Shortcut (Replaces inline calculator for maximum elegance) */}
                {hasPackingSpecs && (
                  <div className="pt-2 flex items-center justify-between border-t border-[#252728]">
                    <span className="text-[11px] text-slate-400">
                      คำนวนการบรรจุตู้คอนเทนเนอร์ (Container Loading Simulation)
                    </span>
                    <button
                      type="button"
                      onClick={() => setLogisticsModalOpen(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#242D16] border border-[#688523] text-[#C7F33C] text-[11px] font-bold hover:bg-[#2e3b18] transition-colors cursor-pointer"
                    >
                      <Calculator className="w-3 h-3" />
                      <span>เปิด Simulator</span>
                    </button>
                  </div>
                )}
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

          {/* TAB 3: CUSTOMER PRICES */}
          {activeTab === "customer_prices" && (
            <div className="flex flex-col gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Filter customer company..."
                  className="w-full bg-[#3A3B3C] border border-transparent rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-[#C7F33C]"
                />
              </div>

              {(orderedVariants.length > 0 ? orderedVariants : overview?.variants || []).map((v) => {
                const filteredPrices = v.customPrices.filter((cp) =>
                  cp.companyName.toLowerCase().includes(customerSearch.toLowerCase())
                );

                if (filteredPrices.length === 0) return null;

                return (
                  <div key={v.id} className="bg-[#3A3B3C] rounded-2xl p-5 space-y-3 border-0">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      {v.fullName || v.formula} — Customer Specific Rates
                    </h4>

                    <div className="divide-y divide-[#252728]">
                      {filteredPrices.map((cp) => {
                        const currentVal =
                          customerPriceEdits[v.id]?.[cp.companyId] ?? cp.price;

                        return (
                          <div
                            key={cp.id}
                            className="flex items-center justify-between py-2 gap-4"
                          >
                            <span className="text-xs font-medium text-slate-200 truncate flex-1">
                              {cp.companyName}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400">฿</span>
                              <input
                                type="number"
                                step="0.01"
                                value={currentVal}
                                onChange={(e) => {
                                  const num = parseFloat(e.target.value) || 0;
                                  setCustomerPriceEdits((prev) => ({
                                    ...prev,
                                    [v.id]: {
                                      ...(prev[v.id] || {}),
                                      [cp.companyId]: num,
                                    },
                                  }));
                                }}
                                className="w-24 bg-[#252728] border border-[#4E4F50] hover:border-slate-400 focus:border-[#C7F33C] rounded-lg px-2.5 py-1 text-xs text-right text-slate-100 outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}


        </div>
      )}
      </SlideOverPanel>

      {/* Commercial Specification & Pricing Waterfall Report Modal */}
      {overview && (
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

      {/* Logistics & Container Loading Simulation Modal */}
      {overview && (
        <ProductLogisticsModal
          isOpen={logisticsModalOpen}
          onClose={() => setLogisticsModalOpen(false)}
          initialProductId={productId}
        />
      )}
    </>
  );
}
