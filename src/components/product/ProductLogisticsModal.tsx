"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  ProductListItemDTO,
  ProductOverviewDTO,
  calculateTierPrice,
  parsePriceConditions,
  PriceStepTier,
} from "@/lib/product/product-dto";
import { getProductOverview, getProductsWithFilters } from "@/lib/actions/product";
import {
  X,
  Printer,
  Copy,
  Check,
  SlidersHorizontal,
  Package,
  RotateCcw,
  Boxes,
  Search,
  Filter,
  Info,
  Settings,
  ArrowLeft,
} from "lucide-react";

interface ContainerTypeSpec {
  id: "20ft" | "40ft" | "40ftHq";
  name: string;
  shortName: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  maxPayloadKg: number;
  nominalCbm: number;
}

const CONTAINER_SPECS: Record<string, ContainerTypeSpec> = {
  "20ft": {
    id: "20ft",
    name: "20ft General Purpose (GP)",
    shortName: "20ft GP",
    lengthCm: 589.8,
    widthCm: 235.2,
    heightCm: 239.3,
    maxPayloadKg: 28200,
    nominalCbm: 33.2,
  },
  "40ft": {
    id: "40ft",
    name: "40ft General Purpose (GP)",
    shortName: "40ft GP",
    lengthCm: 1203.2,
    widthCm: 235.2,
    heightCm: 239.3,
    maxPayloadKg: 28800,
    nominalCbm: 67.7,
  },
  "40ftHq": {
    id: "40ftHq",
    name: "40ft High Cube (HQ)",
    shortName: "40ft HQ",
    lengthCm: 1203.2,
    widthCm: 235.2,
    heightCm: 269.8,
    maxPayloadKg: 28600,
    nominalCbm: 76.4,
  },
};

export interface TiltedGapZone {
  zoneId: "side" | "door" | "overhead";
  nameTh: string;
  boxDimsCm: { w: number; l: number; h: number };
  cartonOrientation: { w: number; l: number; h: number } | null;
  counts: { wCount: number; lCount: number; hCount: number };
  totalCartons: number;
  descTh: string;
}

export interface HybridPackingPlan {
  greenCartons: number;
  greenCbm: number;
  greenUtilization: number;
  greenDims: {
    wCount: number;
    lCount: number;
    hCount: number;
    cartonUsedW: number;
    cartonUsedL: number;
    cartonUsedH: number;
  };
  gaps: {
    sideGapCm: number;
    doorGapCm: number;
    heightGapCm: number;
  };
  sideTilted: TiltedGapZone;
  doorTilted: TiltedGapZone;
  overheadTilted: TiltedGapZone;
  totalOrangeCartons: number;
  totalOrangeCbm: number;
  totalHybridCartons: number;
  totalHybridCbm: number;
  hybridUtilization: number;
  gainPercent: number;
}

function fitTiltedCartonsInBox(
  boxW: number,
  boxL: number,
  boxH: number,
  carton: { w: number; l: number; h: number },
  zoneType: "side" | "door" | "overhead"
): {
  count: number;
  orientation: { w: number; l: number; h: number } | null;
  wCount: number;
  lCount: number;
  hCount: number;
  descTh: string;
} {
  if (boxW < 1 || boxL < 1 || boxH < 1) {
    return {
      count: 0,
      orientation: null,
      wCount: 0,
      lCount: 0,
      hCount: 0,
      descTh: "ไม่มีพื้นที่ว่าง",
    };
  }

  const { w, l, h } = carton;
  // All 6 distinct 3D permutations of carton dimensions
  const perms: [number, number, number][] = [
    [w, l, h],
    [w, h, l],
    [l, w, h],
    [l, h, w],
    [h, w, l],
    [h, l, w],
  ];

  let bestCount = 0;
  let bestOrient: [number, number, number] | null = null;
  let bestWc = 0;
  let bestLc = 0;
  let bestHc = 0;

  for (const [pw, pl, ph] of perms) {
    if (pw <= boxW + 0.05 && pl <= boxL + 0.05 && ph <= boxH + 0.05) {
      const kw = Math.floor((boxW + 0.05) / pw);
      const kl = Math.floor((boxL + 0.05) / pl);
      const kh = Math.floor((boxH + 0.05) / ph);
      const total = kw * kl * kh;
      if (total > bestCount) {
        bestCount = total;
        bestOrient = [pw, pl, ph];
        bestWc = kw;
        bestLc = kl;
        bestHc = kh;
      }
    }
  }

  if (bestCount === 0 || !bestOrient) {
    const minDim = Math.min(w, l, h);
    return {
      count: 0,
      orientation: null,
      wCount: 0,
      lCount: 0,
      hCount: 0,
      descTh: `ช่องว่างแคบกว่าขนาดกล่องขั้นต่ำ (${minDim} cm)`,
    };
  }

  const [ow, ol, oh] = bestOrient;
  let tiltDesc = "";
  if (zoneType === "side") {
    tiltDesc = `ตะแคงด้าน ${ow} cm ขนานผนัง (${ow}×${ol}×${oh} cm) วางได้ ${bestWc} ลังขวาง × ${bestLc} แถวลึก × ${bestHc} ชั้น`;
  } else if (zoneType === "door") {
    tiltDesc = `ตะแคงด้าน ${ol} cm ขนานประตู (${ow}×${ol}×${oh} cm) วางได้ ${bestWc} ลังหน้า × ${bestLc} แถวลึก × ${bestHc} ชั้น`;
  } else {
    tiltDesc = `ตะแคงนอนราบด้าน ${oh} cm ตั้งขึ้น (${ow}×${ol}×${oh} cm) วางได้ ${bestWc} ลังขวาง × ${bestLc} แถวลึก × ${bestHc} ชั้น`;
  }

  return {
    count: bestCount,
    orientation: { w: ow, l: ol, h: oh },
    wCount: bestWc,
    lCount: bestLc,
    hCount: bestHc,
    descTh: tiltDesc,
  };
}

function calculateTiltedGapOptimization(
  container: ContainerTypeSpec,
  carton: { w: number; l: number; h: number; cbmPerCtn: number },
  activePlan: {
    widthCount: number;
    lengthCount: number;
    heightCount: number;
    cartonUsedW: number;
    cartonUsedL: number;
    sideGap: number;
    doorGap: number;
  }
): HybridPackingPlan {
  const cW = container.widthCm;
  const cL = container.lengthCm;
  const cH = container.heightCm;

  const wCount = activePlan.widthCount;
  const lCount = activePlan.lengthCount;
  const hCount = activePlan.heightCount;

  const greenCartons = wCount * lCount * hCount;
  const greenUsedW = Number((wCount * activePlan.cartonUsedW).toFixed(1));
  const greenUsedL = Number((lCount * activePlan.cartonUsedL).toFixed(1));
  const greenUsedH = Number((hCount * carton.h).toFixed(1));

  const sideGapCm = Number((cW - greenUsedW).toFixed(1));
  const doorGapCm = Number((cL - greenUsedL).toFixed(1));
  const heightGapCm = Number((cH - greenUsedH).toFixed(1));

  // Strategy 1: Side along green length, Door across full container width, Overhead across full container
  const s1Side = fitTiltedCartonsInBox(sideGapCm, greenUsedL, greenUsedH, carton, "side");
  const s1Door = fitTiltedCartonsInBox(cW, doorGapCm, greenUsedH, carton, "door");
  const s1Over = fitTiltedCartonsInBox(cW, cL, heightGapCm, carton, "overhead");
  const sum1 = s1Side.count + s1Door.count + s1Over.count;

  // Strategy 2: Side along full container length, Door across green width, Overhead across full container
  const s2Side = fitTiltedCartonsInBox(sideGapCm, cL, greenUsedH, carton, "side");
  const s2Door = fitTiltedCartonsInBox(greenUsedW, doorGapCm, greenUsedH, carton, "door");
  const s2Over = fitTiltedCartonsInBox(cW, cL, heightGapCm, carton, "overhead");
  const sum2 = s2Side.count + s2Door.count + s2Over.count;

  const useS1 = sum1 >= sum2;
  const chosenSide = useS1 ? s1Side : s2Side;
  const chosenDoor = useS1 ? s1Door : s2Door;
  const chosenOver = useS1 ? s1Over : s2Over;

  const totalOrangeCartons = chosenSide.count + chosenDoor.count + chosenOver.count;
  const totalHybridCartons = greenCartons + totalOrangeCartons;

  const greenCbm = Number((greenCartons * carton.cbmPerCtn).toFixed(3));
  const totalOrangeCbm = Number((totalOrangeCartons * carton.cbmPerCtn).toFixed(3));
  const totalHybridCbm = Number((totalHybridCartons * carton.cbmPerCtn).toFixed(3));

  const greenUtilization =
    container.nominalCbm > 0 ? Math.min(100, (greenCbm / container.nominalCbm) * 100) : 0;
  const hybridUtilization =
    container.nominalCbm > 0 ? Math.min(100, (totalHybridCbm / container.nominalCbm) * 100) : 0;

  const gainPercent = greenCartons > 0 ? (totalOrangeCartons / greenCartons) * 100 : 0;

  return {
    greenCartons,
    greenCbm,
    greenUtilization,
    greenDims: {
      wCount,
      lCount,
      hCount,
      cartonUsedW: activePlan.cartonUsedW,
      cartonUsedL: activePlan.cartonUsedL,
      cartonUsedH: carton.h,
    },
    gaps: {
      sideGapCm,
      doorGapCm,
      heightGapCm,
    },
    sideTilted: {
      zoneId: "side",
      nameTh: "ช่องว่างข้างตู้ (Side Gap)",
      boxDimsCm: { w: sideGapCm, l: useS1 ? greenUsedL : cL, h: greenUsedH },
      cartonOrientation: chosenSide.orientation,
      counts: { wCount: chosenSide.wCount, lCount: chosenSide.lCount, hCount: chosenSide.hCount },
      totalCartons: chosenSide.count,
      descTh: chosenSide.descTh,
    },
    doorTilted: {
      zoneId: "door",
      nameTh: "ช่องว่างท้ายตู้ (Door Gap)",
      boxDimsCm: { w: useS1 ? cW : greenUsedW, l: doorGapCm, h: greenUsedH },
      cartonOrientation: chosenDoor.orientation,
      counts: { wCount: chosenDoor.wCount, lCount: chosenDoor.lCount, hCount: chosenDoor.hCount },
      totalCartons: chosenDoor.count,
      descTh: chosenDoor.descTh,
    },
    overheadTilted: {
      zoneId: "overhead",
      nameTh: "ช่องว่างเพดาน (Overhead Gap)",
      boxDimsCm: { w: cW, l: cL, h: heightGapCm },
      cartonOrientation: chosenOver.orientation,
      counts: { wCount: chosenOver.wCount, lCount: chosenOver.lCount, hCount: chosenOver.hCount },
      totalCartons: chosenOver.count,
      descTh: chosenOver.descTh,
    },
    totalOrangeCartons,
    totalOrangeCbm,
    totalHybridCartons,
    totalHybridCbm,
    hybridUtilization,
    gainPercent,
  };
}

export interface ProductLogisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProductId?: string | null;
  products?: ProductListItemDTO[];
}

export function ProductLogisticsModal({
  isOpen,
  onClose,
  initialProductId,
  products = [],
}: ProductLogisticsModalProps) {
  // Sidebar tab state: "controls" vs "settings" (Products moved to Header Dropdown)
  const [sidebarTab, setSidebarTab] = useState<"controls" | "settings">("controls");

  // Header Product Dropdown state
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close product dropdown on Escape or clicking outside modal
  useEffect(() => {
    if (!isProductDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const modal = document.getElementById("logistics-calculator-modal-card");
      if (modal && !modal.contains(e.target as Node)) {
        setIsProductDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsProductDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProductDropdownOpen]);

  // Auto-focus search input when product dropdown opens
  useEffect(() => {
    if (isProductDropdownOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isProductDropdownOpen]);

  // Custom Container Specs State (editable in Settings tab, defaults to CONTAINER_SPECS)
  const [customContainerSpecs, setCustomContainerSpecs] = useState<Record<string, ContainerTypeSpec>>(() => ({
    ...CONTAINER_SPECS,
  }));
  const [settingsContainerId, setSettingsContainerId] = useState<"20ft" | "40ft" | "40ftHq">("20ft");

  const handleUpdateSpec = (
    cId: "20ft" | "40ft" | "40ftHq",
    field: keyof ContainerTypeSpec,
    val: number
  ) => {
    setCustomContainerSpecs((prev) => ({
      ...prev,
      [cId]: {
        ...prev[cId],
        [field]: val,
      },
    }));
  };

  const handleResetSpecs = (cId?: "20ft" | "40ft" | "40ftHq") => {
    if (cId) {
      setCustomContainerSpecs((prev) => ({
        ...prev,
        [cId]: { ...CONTAINER_SPECS[cId] },
      }));
    } else {
      setCustomContainerSpecs({ ...CONTAINER_SPECS });
    }
  };

  // Master product catalog
  const [catalogProducts, setCatalogProducts] = useState<ProductListItemDTO[]>(products);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(initialProductId || null);
  const [productOverview, setProductOverview] = useState<ProductOverviewDTO | null>(null);

  // Search & filter state for Products dropdown
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedBrand, setSelectedBrand] = useState<string>("ALL");

  // Simulation controls state
  const [selectedContainer, setSelectedContainer] = useState<"20ft" | "40ft" | "40ftHq">("20ft");
  const [orientationMode, setOrientationMode] = useState<"AUTO" | "A" | "B">("AUTO");
  const [cartons, setCartons] = useState<number>(0);
  const [unitPriceInput, setUnitPriceInput] = useState<string>("");
  const [showTiltedCartons, setShowTiltedCartons] = useState<boolean>(true);
  const [copied, setCopied] = useState(false);

  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);

  // Reset cartons to 0, clear price override, and product selection when modal opens
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (!prevIsOpen && isOpen) {
    setPrevIsOpen(true);
    setCartons(0);
    setSelectedProductId(initialProductId || null);
    setUnitPriceInput("");
    setIsLoadingCatalog(true);
  } else if (prevIsOpen && !isOpen) {
    setPrevIsOpen(false);
  }

  // Sync initialProductId when prop changes
  const [prevInitialProductId, setPrevInitialProductId] = useState(initialProductId);
  if (prevInitialProductId !== initialProductId) {
    setPrevInitialProductId(initialProductId);
    if (initialProductId) {
      setSelectedProductId(initialProductId);
    }
  }

  // Clear product overview when selected product is cleared
  const [prevSelectedProductId, setPrevSelectedProductId] = useState(selectedProductId);
  if (prevSelectedProductId !== selectedProductId) {
    setPrevSelectedProductId(selectedProductId);
    if (!selectedProductId) {
      setProductOverview(null);
    }
  }

  // Fetch complete product catalog for simulator so all products (199+) are available
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    getProductsWithFilters({ status: "ALL", pageSize: 1000 })
      .then((res) => {
        if (!isMounted) return;
        if (res?.products && res.products.length > 0) {
          setCatalogProducts(res.products);
        }
      })
      .catch((err) => console.error("Failed to load products for simulator:", err))
      .finally(() => {
        if (isMounted) setIsLoadingCatalog(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Load detailed ProductOverviewDTO for active product
  useEffect(() => {
    if (!selectedProductId) return;
    let isMounted = true;

    getProductOverview(selectedProductId)
      .then((data) => {
        if (isMounted) {
          setProductOverview(data);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch product overview for simulator:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedProductId]);

  // Active product item from list (null if user has not selected any product yet)
  const activeListItem = useMemo(() => {
    if (!selectedProductId) return null;
    return catalogProducts.find((p) => p.id === selectedProductId) || null;
  }, [catalogProducts, selectedProductId]);

  // Resolve packing specs: prioritize detailed overview, fallback to list item
  const resolvedSpecs = useMemo(() => {
    let cartonW = productOverview?.cartonWidth || 0;
    let cartonL = productOverview?.cartonLength || 0;
    let cartonH = productOverview?.cartonHeight || 0;
    const cartonQty = productOverview?.cartonQuantity || activeListItem?.cartonQuantity || 1;
    let cartonGw =
      productOverview?.variants?.[0]?.cartonGrossWeight ||
      activeListItem?.cartonGrossWeight ||
      0;

    // Parse dimension string if W/L/H are not set numerically
    const dimStr = productOverview?.cartonDimension || activeListItem?.cartonDimension || "";
    if ((!cartonW || !cartonL || !cartonH) && dimStr) {
      const match = dimStr.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
      if (match) {
        cartonW = parseFloat(match[1]);
        cartonL = parseFloat(match[2]);
        cartonH = parseFloat(match[3]);
      }
    }

    // Default safe fallback if product is missing dimensions
    if (cartonW <= 0) cartonW = 30;
    if (cartonL <= 0) cartonL = 40;
    if (cartonH <= 0) cartonH = 12.3;
    if (cartonGw <= 0) cartonGw = 6.6;

    const cbmPerCtn = Number(((cartonW * cartonL * cartonH) / 1_000_000).toFixed(4));

    // Pricing & Step tiers
    const primaryVariant =
      productOverview?.variants?.find((v) => v.isDefault) ||
      productOverview?.variants?.[0] ||
      null;

    const baseUnitPrice = primaryVariant?.price || activeListItem?.minPrice || 0;
    const tiers: PriceStepTier[] = primaryVariant?.priceCondition
      ? parsePriceConditions(primaryVariant.priceCondition)
      : [];

    return {
      cartonW,
      cartonL,
      cartonH,
      cartonQty,
      cartonGw,
      cbmPerCtn,
      baseUnitPrice,
      tiers,
      primaryVariant,
    };
  }, [productOverview, activeListItem]);

  // Sync unit price input when selected product changes or its base price loads
  const [prevPriceSyncKey, setPrevPriceSyncKey] = useState<string>(() => `${initialProductId || ""}-${resolvedSpecs.baseUnitPrice}`);
  const currentPriceSyncKey = `${selectedProductId || ""}-${resolvedSpecs.baseUnitPrice}`;
  if (prevPriceSyncKey !== currentPriceSyncKey) {
    setPrevPriceSyncKey(currentPriceSyncKey);
    setUnitPriceInput(resolvedSpecs.baseUnitPrice > 0 ? resolvedSpecs.baseUnitPrice.toString() : "");
  }

  // Calculate tier discount
  const getTierDiscount = (ctnQty: number): { discountPercent: number; tierIndex: number } => {
    if (!resolvedSpecs.tiers || resolvedSpecs.tiers.length === 0 || ctnQty <= 0) {
      return { discountPercent: 0, tierIndex: -1 };
    }
    for (let i = 0; i < resolvedSpecs.tiers.length; i++) {
      const t = resolvedSpecs.tiers[i];
      if (ctnQty >= t.minQuantity && (!t.maxQuantity || ctnQty <= t.maxQuantity)) {
        return { discountPercent: t.discountPercent, tierIndex: i };
      }
    }
    return { discountPercent: 0, tierIndex: -1 };
  };

  // Effective unit price: user custom price takes precedence over catalog base price
  const parsedCustomPrice = parseFloat(unitPriceInput);
  const effectiveBasePrice =
    unitPriceInput.trim() !== "" && !isNaN(parsedCustomPrice) && parsedCustomPrice >= 0
      ? parsedCustomPrice
      : resolvedSpecs.baseUnitPrice;

  const { discountPercent: appliedDiscount, tierIndex: activeTierIdx } = getTierDiscount(cartons);
  const appliedUnitPrice = calculateTierPrice(effectiveBasePrice, appliedDiscount);

  // Derived financial & physical metrics
  const totalUnits = cartons * resolvedSpecs.cartonQty;
  const totalCbm = cartons * resolvedSpecs.cbmPerCtn;
  const totalGw = cartons * resolvedSpecs.cartonGw;
  const totalAmount = totalUnits * appliedUnitPrice;
  const totalUndiscounted = totalUnits * effectiveBasePrice;
  const totalSavings = Math.max(0, totalUndiscounted - totalAmount);

  // Container Packing Optimization
  const currentContainer = customContainerSpecs[selectedContainer] || CONTAINER_SPECS[selectedContainer];

  // Detailed Orientation Comparative Analysis (Standard Logistics & Cargo Optimization)
  const orientationAnalysis = useMemo(() => {
    const { cartonW, cartonL, cartonH } = resolvedSpecs;

    // Plan A: Width across container, Length along depth
    const wA = Math.max(1, Math.floor(currentContainer.widthCm / cartonW));
    const lA = Math.max(1, Math.floor(currentContainer.lengthCm / cartonL));
    const hA = Math.max(1, Math.floor(currentContainer.heightCm / cartonH));
    const totalA = wA * lA * hA;
    const sideGapA = Number((currentContainer.widthCm - wA * cartonW).toFixed(1));
    const doorGapA = Number((currentContainer.lengthCm - lA * cartonL).toFixed(1));

    // Plan B: Length across container, Width along depth (Rotated 90°)
    const wB = Math.max(1, Math.floor(currentContainer.widthCm / cartonL));
    const lB = Math.max(1, Math.floor(currentContainer.lengthCm / cartonW));
    const hB = Math.max(1, Math.floor(currentContainer.heightCm / cartonH));
    const totalB = wB * lB * hB;
    const sideGapB = Number((currentContainer.widthCm - wB * cartonL).toFixed(1));
    const doorGapB = Number((currentContainer.lengthCm - lB * cartonW).toFixed(1));

    const bestIsA = totalA >= totalB;

    return {
      planA: {
        id: "A" as const,
        name: "Plan A (Depth-wise)",
        summary: `Width ${cartonW} cm across front · Length ${cartonL} cm along depth`,
        widthCount: wA,
        lengthCount: lA,
        heightCount: hA,
        totalCartons: totalA,
        cartonUsedW: cartonW,
        cartonUsedL: cartonL,
        sideGap: sideGapA,
        doorGap: doorGapA,
        isBest: bestIsA,
      },
      planB: {
        id: "B" as const,
        name: "Plan B (Width-wise / 90° Rotated)",
        summary: `Length ${cartonL} cm across front · Width ${cartonW} cm along depth`,
        widthCount: wB,
        lengthCount: lB,
        heightCount: hB,
        totalCartons: totalB,
        cartonUsedW: cartonL,
        cartonUsedL: cartonW,
        sideGap: sideGapB,
        doorGap: doorGapB,
        isBest: !bestIsA,
      },
      diff: Math.abs(totalA - totalB),
      bestIsA,
    };
  }, [resolvedSpecs, currentContainer]);

  const activePlan = useMemo(() => {
    if (orientationMode === "A") return orientationAnalysis.planA;
    if (orientationMode === "B") return orientationAnalysis.planB;
    return orientationAnalysis.bestIsA ? orientationAnalysis.planA : orientationAnalysis.planB;
  }, [orientationMode, orientationAnalysis]);

  const packingPlan = useMemo(() => {
    const { cartonH, cbmPerCtn } = resolvedSpecs;
    const {
      widthCount,
      lengthCount,
      heightCount,
      totalCartons,
      cartonUsedW,
      cartonUsedL,
      sideGap,
      doorGap,
    } = activePlan;

    const hybridPlan = calculateTiltedGapOptimization(
      currentContainer,
      {
        w: resolvedSpecs.cartonW,
        l: resolvedSpecs.cartonL,
        h: cartonH,
        cbmPerCtn,
      },
      activePlan
    );

    const widthGapCm = sideGap;
    const lengthGapCm = doorGap;
    const heightGapCm = Number((currentContainer.heightCm - heightCount * cartonH).toFixed(1));

    const totalCargoCbm = totalCartons * cbmPerCtn;
    const spaceUtilization =
      currentContainer.nominalCbm > 0
        ? Math.min(100, (totalCargoCbm / currentContainer.nominalCbm) * 100)
        : 0;

    const cartonsPerRow = widthCount * heightCount; // 1 full vertical cross-section slice
    const loadedRows = cartonsPerRow > 0 ? cartons / cartonsPerRow : 0;
    const fullRows = Math.floor(loadedRows);
    const partialRowProgress = loadedRows - fullRows;

    return {
      orientation: activePlan.id,
      widthCount,
      lengthCount,
      heightCount,
      cartonsPerRow,
      totalRows: lengthCount,
      loadedRows,
      fullRows,
      partialRowProgress,
      totalCartons,
      widthGapCm,
      lengthGapCm,
      heightGapCm,
      cartonUsedW,
      cartonUsedL,
      totalCargoCbm,
      spaceUtilization,
      hybridPlan,
      greenCartons: hybridPlan.greenCartons,
      orangeCartons: hybridPlan.totalOrangeCartons,
      totalHybridCartons: hybridPlan.totalHybridCartons,
      sideTilted: hybridPlan.sideTilted,
      doorTilted: hybridPlan.doorTilted,
      overheadTilted: hybridPlan.overheadTilted,
    };
  }, [resolvedSpecs, currentContainer, activePlan, cartons]);

  // Container capacity limits: Never allow cartons to exceed container capacity
  const containerMaxCapacity = showTiltedCartons && packingPlan.orangeCartons > 0
    ? packingPlan.totalHybridCartons
    : packingPlan.greenCartons;

  const containerAbsoluteMax = packingPlan.orangeCartons > 0
    ? packingPlan.totalHybridCartons
    : packingPlan.greenCartons;

  // Auto-clamp cartons when container or loading options change so it never exceeds capacity
  if (cartons > containerMaxCapacity && containerMaxCapacity > 0) {
    setCartons(containerMaxCapacity);
  }

  const pctContainerFill = packingPlan && packingPlan.totalCartons > 0
    ? Math.min(100, (cartons / packingPlan.totalCartons) * 100)
    : 0;

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // 1-Click Copy Logistics & Quotation Summary
  const handleCopySummary = () => {
    const pName = activeListItem?.name || productOverview?.name || "Product";
    const discountText =
      appliedDiscount > 0
        ? ` (Volume Discount -${appliedDiscount}%, saved ฿${fmt(totalSavings)})`
        : "";
    const dimText = `${resolvedSpecs.cartonW}×${resolvedSpecs.cartonL}×${resolvedSpecs.cartonH} cm`;
    const fclText = `• Container Loading Plan (${currentContainer.shortName}): ${packingPlan.widthCount}W × ${packingPlan.lengthCount}D × ${packingPlan.heightCount}H = ${packingPlan.totalCartons.toLocaleString()} ctns max FCL (${packingPlan.spaceUtilization.toFixed(1)}% space efficiency)`;

    const text = [
      `📦 CONTAINER LOADING BLUEPRINT & QUOTATION: ${pName}`,
      `----------------------------------------`,
      `• Container: ${currentContainer.name}`,
      `• Order Volume: ${cartons.toLocaleString()} ctns (${totalUnits.toLocaleString()} pcs)`,
      `• Packing: ${resolvedSpecs.cartonQty} pcs/ctn · Dim: ${dimText}`,
      `• Volume: ${totalCbm.toFixed(3)} m³ (${pctContainerFill.toFixed(0)}% Container Fill)`,
      `• Gross Weight: ${fmt(totalGw)} kg (${(totalGw / 1000).toFixed(2)} t)`,
      `• Unit Price: ฿${fmt(appliedUnitPrice)} / pc${discountText}`,
      `• Total Quotation Amount: ฿${fmt(totalAmount)} THB`,
      `----------------------------------------`,
      fclText,
      `• Clearances: Lateral Gap ${packingPlan.widthGapCm} cm · Door Gap ${packingPlan.lengthGapCm} cm · Overhead Gap ${packingPlan.heightGapCm} cm`,
    ]
      .filter(Boolean)
      .join("\n");

    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Categories list for filter in Products dropdown
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    catalogProducts.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ["ALL", ...Array.from(set)];
  }, [catalogProducts]);

  // Brands list for filter in Products dropdown
  const brandsList = useMemo(() => {
    const set = new Set<string>();
    catalogProducts.forEach((p) => {
      if (p.brand) set.add(p.brand);
    });
    return ["ALL", ...Array.from(set)];
  }, [catalogProducts]);

  // Filtered products list for selector dropdown
  const filteredProducts = useMemo(() => {
    return catalogProducts.filter((p) => {
      const matchCat = selectedCategory === "ALL" || p.category === selectedCategory;
      const matchBrand = selectedBrand === "ALL" || p.brand === selectedBrand;
      const matchQuery =
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.brand?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchBrand && matchQuery;
    });
  }, [catalogProducts, selectedCategory, selectedBrand, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 select-none animate-in fade-in duration-200">
      {/* Modal Container: Full-height sleek layout (matching Image 2 architecture) */}
      <div
        id="logistics-calculator-modal-card"
        className="relative w-full max-w-6xl xl:max-w-7xl h-[94vh] bg-[#1C1D1E] border border-[#3E4042] rounded-2xl flex flex-col overflow-hidden my-auto shadow-2xl"
      >
        {/* Main Body (2-Column Layout: Left Controls Sidebar + Right Massive Simulation Canvas) */}
        <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
          {/* ========================================================================= */}
          {/* LEFT SIDEBAR: 2 TABS (Controls vs Product Selector) + Sticky Bottom Export */}
          {/* ========================================================================= */}
          <aside className="w-76 sm:w-84 shrink-0 bg-[#202123] border-r border-[#353638] flex flex-col h-full select-none">
            {isProductDropdownOpen ? (
              /* ========================================================================= */
              /* SIDEBAR MODE: CATALOG FILTERS (When Product Selection is Active)          */
              /* ========================================================================= */
              <div className="flex flex-col h-full overflow-hidden">
                <div className="p-3 border-b border-[#2C2E33] flex items-center justify-between gap-2 shrink-0 bg-[#1A1B1D]">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-[#22252A] flex items-center justify-center shrink-0 border border-[#33373E]">
                      <Filter className="w-3.5 h-3.5 text-[#C7F33C]" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-white truncate">Catalog Filters</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {filteredProducts.length} of {catalogProducts.length} items
                      </span>
                    </div>
                  </div>
                  {(selectedCategory !== "ALL" || selectedBrand !== "ALL" || searchQuery) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory("ALL");
                        setSelectedBrand("ALL");
                        setSearchQuery("");
                      }}
                      className="text-[10.5px] text-[#C7F33C] hover:underline cursor-pointer flex items-center gap-1 font-medium shrink-0"
                      title="Reset all filters"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>

                {/* Filter Controls Body */}
                <div className="flex-1 overflow-y-auto p-3.5 space-y-4 custom-scrollbar">
                  {/* Search Bar */}
                  <div className="space-y-1.5">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 font-mono">Search</span>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Name, brand, category..."
                        className="w-full bg-[#141517] border border-[#2B2D31] focus:border-[#C7F33C] rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 outline-none transition-colors"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer p-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Category Filter */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wider text-slate-400 font-mono border-b border-[#2C2E33] pb-1">
                      <span>Category</span>
                      <span className="text-[9.5px] text-slate-400">{categoriesList.length - 1} types</span>
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                      {categoriesList.map((cat) => {
                        const isSelected = selectedCategory === cat;
                        const count = cat === "ALL" 
                          ? catalogProducts.length 
                          : catalogProducts.filter((p) => p.category === cat).length;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedCategory(cat)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                              isSelected
                                ? "bg-[#282B30] text-[#C7F33C] border border-[#444852]"
                                : "text-slate-400 hover:text-white hover:bg-[#1A1B1D]"
                            }`}
                          >
                            <span className="truncate">{cat}</span>
                            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${isSelected ? "bg-[#C7F33C]/20 text-[#C7F33C]" : "bg-white/5 text-slate-400"}`}>
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Brand Filter */}
                  {brandsList.length > 2 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wider text-slate-400 font-mono border-b border-[#2C2E33] pb-1">
                        <span>Brand</span>
                        <span className="text-[9.5px] text-slate-400">{brandsList.length - 1} brands</span>
                      </div>
                      <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                        {brandsList.map((b) => {
                          const isSelected = selectedBrand === b;
                          const count = b === "ALL" 
                            ? catalogProducts.length 
                            : catalogProducts.filter((p) => p.brand === b).length;
                          return (
                            <button
                              key={b}
                              type="button"
                              onClick={() => setSelectedBrand(b)}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                                isSelected
                                  ? "bg-[#282B30] text-[#C7F33C] border border-[#444852]"
                                  : "text-slate-400 hover:text-white hover:bg-[#1A1B1D]"
                              }`}
                            >
                              <span className="truncate">{b}</span>
                              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${isSelected ? "bg-[#C7F33C]/20 text-[#C7F33C]" : "bg-white/5 text-slate-400"}`}>
                                {count}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Sidebar Bottom: Back to Simulator button */}
                <div className="p-3 border-t border-[#2C2E33] bg-[#1A1B1D] shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsProductDropdownOpen(false)}
                    className="w-full py-2.5 px-3 rounded-xl bg-[#25272B] hover:bg-[#2F3238] border border-[#3A3D44] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
                    <span>Return to Simulator</span>
                  </button>
                </div>
              </div>
            ) : (
              /* ========================================================================= */
              /* SIDEBAR MODE: CONTROLS & SETTINGS (Normal Simulation Mode)                */
              /* ========================================================================= */
              <>
                {/* Sidebar Top: Tab Switcher (Controls vs Settings) */}
                <div className="p-2.5 border-b border-[#2C2E33] flex items-center justify-between gap-2 shrink-0 bg-[#1A1B1D]">
                  <div className="flex items-center gap-1 bg-[#141517] p-1 rounded-xl border border-[#2B2D31] flex-1">
                    <button
                      type="button"
                      onClick={() => setSidebarTab("controls")}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        sidebarTab === "controls"
                          ? "bg-[#282A2E] text-white shadow-xs border border-[#3A3D42]"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Controls</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSidebarTab("settings")}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        sidebarTab === "settings"
                          ? "bg-[#282A2E] text-white shadow-xs border border-[#3A3D42]"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Settings</span>
                    </button>
                  </div>
                </div>

            {/* Sidebar Middle Content Area */}
            {sidebarTab === "controls" && (
              /* TAB 1: SIMULATION CONTROLS & COMMERCIAL SPECIFICATIONS (Clean Category List in English) */
              <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-5 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                {/* ============================================================== */}
                {/* Section 1: Packing Parameters (INPUT)                           */}
                {/* ============================================================== */}
                <div className="space-y-3">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 border-b border-[#2C2E33] pb-1.5 flex items-center justify-between">
                    <span>1. Packing Parameters</span>
                    <span className="text-[9px] font-mono text-slate-400">INPUT</span>
                  </div>

                  <div className="space-y-3 text-xs">
                    {/* Tilted Cartons (Gap Fill) Toggle (Moved from Header) */}
                    <div className="pb-2.5 border-b border-[#242629]">
                      <label className="flex items-center justify-between p-2 rounded-xl bg-[#18191B] hover:bg-[#202225] border border-[#2B2D31] cursor-pointer transition-colors select-none">
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={showTiltedCartons}
                            onChange={(e) => setShowTiltedCartons(e.target.checked)}
                            className="sr-only"
                          />
                          <div
                            className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                              showTiltedCartons
                                ? "bg-amber-500 border-amber-500 text-black"
                                : "border-[#4E4F50] bg-[#141517] text-transparent hover:border-slate-400"
                            }`}
                          >
                            <Check className={`w-3 h-3 stroke-[3] transition-transform ${showTiltedCartons ? "scale-100" : "scale-0"}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
                              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                              <span>Show Tilted Cartons (Gap Fill)</span>
                            </div>
                            <div className="text-[10px] text-slate-400">Optimize empty side, door & ceiling space</div>
                          </div>
                        </div>
                        {packingPlan.orangeCartons > 0 && (
                          <span className="text-[10.5px] text-amber-400 font-mono font-bold">
                            +{packingPlan.orangeCartons.toLocaleString()} ctns
                          </span>
                        )}
                      </label>
                    </div>

                    {/* Row 2: Container Type */}
                    <div className="space-y-1.5 pb-2.5 border-b border-[#242629]">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">Container Type</span>
                        <button
                          type="button"
                          onClick={() => setSidebarTab("settings")}
                          className="text-slate-400 hover:text-white underline cursor-pointer text-[9.5px]"
                        >
                          Specs & Settings
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {(["20ft", "40ft", "40ftHq"] as const).map((cId) => {
                          const isSel = selectedContainer === cId;
                          return (
                            <button
                              key={cId}
                              type="button"
                              onClick={() => setSelectedContainer(cId)}
                              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors text-center ${
                                isSel
                                  ? "bg-[#282A2E] text-white border border-[#3E4249]"
                                  : "bg-[#18191B] text-slate-400 hover:text-slate-200 border border-transparent"
                              }`}
                            >
                              {customContainerSpecs[cId]?.shortName || CONTAINER_SPECS[cId].shortName}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Row 3: Carton Orientation */}
                    <div className="space-y-1.5 pb-2.5 border-b border-[#242629]">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">Carton Orientation</span>
                        {orientationAnalysis.diff > 0 && (
                          <span className="text-slate-400 font-mono">Diff: {orientationAnalysis.diff} ctns</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setOrientationMode("A")}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] cursor-pointer transition-colors text-left ${
                            activePlan.id === "A"
                              ? "bg-[#282A2E] text-white font-bold border border-[#3E4249]"
                              : "bg-[#18191B] text-slate-400 hover:text-slate-200 border border-transparent"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>Plan A (Depth-wise)</span>
                            {orientationAnalysis.bestIsA && <span className="text-emerald-400 text-[10px]">★</span>}
                          </div>
                          <div className="text-[9.5px] opacity-75 font-mono">
                            {orientationAnalysis.planA.totalCartons.toLocaleString()} ctns
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrientationMode("B")}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] cursor-pointer transition-colors text-left ${
                            activePlan.id === "B"
                              ? "bg-[#282A2E] text-white font-bold border border-[#3E4249]"
                              : "bg-[#18191B] text-slate-400 hover:text-slate-200 border border-transparent"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>Plan B (Width-wise)</span>
                            {!orientationAnalysis.bestIsA && <span className="text-emerald-400 text-[10px]">★</span>}
                          </div>
                          <div className="text-[9.5px] opacity-75 font-mono">
                            {orientationAnalysis.planB.totalCartons.toLocaleString()} ctns
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Row 4: Packaging Quantity & Price Per Piece */}
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        {/* Packaging Quantity */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-400">Packaging Qty</span>
                            <span className="font-mono text-slate-500 font-semibold text-[9px]">
                              Max {containerMaxCapacity.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center bg-[#18191B] border border-[#2B2D31] rounded-lg px-2.5 py-1.5 focus-within:border-slate-400">
                            <input
                              type="number"
                              min={1}
                              max={containerAbsoluteMax}
                              value={cartons || ""}
                              onChange={(e) => {
                                const raw = parseInt(e.target.value, 10);
                                if (isNaN(raw) || raw <= 0) {
                                  setCartons(0);
                                  return;
                                }
                                // Auto-switch to FCL + Tilted if entered quantity exceeds standard green capacity but fits hybrid
                                if (raw > packingPlan.greenCartons && packingPlan.orangeCartons > 0 && !showTiltedCartons) {
                                  setShowTiltedCartons(true);
                                }
                                const effectiveMax = (raw > packingPlan.greenCartons && packingPlan.orangeCartons > 0) || showTiltedCartons
                                  ? containerAbsoluteMax
                                  : packingPlan.greenCartons;
                                setCartons(Math.min(raw, effectiveMax));
                              }}
                              className="w-full bg-transparent text-sm font-bold text-white outline-none tabular-nums"
                              placeholder="0"
                            />
                            <span className="text-[11px] text-slate-400 font-mono shrink-0 ml-1">ctns</span>
                          </div>
                        </div>

                        {/* Price per Piece */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-400">Price / Piece</span>
                            {resolvedSpecs.baseUnitPrice > 0 && unitPriceInput !== "" && parseFloat(unitPriceInput) !== resolvedSpecs.baseUnitPrice ? (
                              <button
                                type="button"
                                onClick={() => setUnitPriceInput(resolvedSpecs.baseUnitPrice.toString())}
                                className="font-mono text-[9px] text-[#C7F33C] hover:underline cursor-pointer"
                                title="Reset to catalog price"
                              >
                                ฿{fmt(resolvedSpecs.baseUnitPrice)}
                              </button>
                            ) : resolvedSpecs.cartonQty > 1 ? (
                              <span className="font-mono text-slate-500 font-semibold text-[9px]">
                                {resolvedSpecs.cartonQty} pcs/ctn
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center bg-[#18191B] border border-[#2B2D31] rounded-lg px-2.5 py-1.5 focus-within:border-slate-400">
                            <span className="text-xs text-slate-400 mr-1.5 font-semibold shrink-0">฿</span>
                            <input
                              type="number"
                              step="any"
                              min={0}
                              value={unitPriceInput}
                              onChange={(e) => setUnitPriceInput(e.target.value)}
                              className="w-full bg-transparent text-sm font-bold text-white outline-none tabular-nums"
                              placeholder={resolvedSpecs.baseUnitPrice > 0 ? resolvedSpecs.baseUnitPrice.toString() : "0.00"}
                            />
                            <span className="text-[11px] text-slate-400 font-mono shrink-0 ml-1">/ pc</span>
                          </div>
                        </div>
                      </div>

                      {/* Quick Fill FCL Buttons */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setCartons(packingPlan.greenCartons);
                            setShowTiltedCartons(false);
                          }}
                          className={`flex-1 py-1 px-2 rounded-lg text-[10.5px] border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                            cartons === packingPlan.greenCartons && !showTiltedCartons
                              ? "bg-emerald-950/70 border-emerald-500/60 text-emerald-200"
                              : "bg-[#1B1D1F] hover:bg-[#25272A] text-slate-300 hover:text-white border-[#2C2E33]"
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>Standard FCL ({packingPlan.greenCartons.toLocaleString()})</span>
                        </button>
                        {packingPlan.orangeCartons > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setCartons(packingPlan.totalHybridCartons);
                              setShowTiltedCartons(true);
                            }}
                            className={`flex-1 py-1 px-2 rounded-lg text-[10.5px] border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                              cartons === packingPlan.totalHybridCartons && showTiltedCartons
                                ? "bg-amber-950/70 border-amber-500/60 text-amber-200"
                                : "bg-[#1B1D1F] hover:bg-[#25272A] text-slate-300 hover:text-white border-[#2C2E33]"
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            <span>FCL + Tilted ({packingPlan.totalHybridCartons.toLocaleString()})</span>
                          </button>
                        )}
                      </div>

                      {/* Tier pricing if any */}
                      {resolvedSpecs.tiers.length > 0 && (
                        <div className="pt-1 flex items-center gap-1 flex-wrap">
                          {resolvedSpecs.tiers.map((t, idx) => {
                            const isAct = activeTierIdx === idx;
                            const rText = t.maxQuantity ? `${t.minQuantity}-${t.maxQuantity}` : `${t.minQuantity}+`;
                            const p = calculateTierPrice(effectiveBasePrice, t.discountPercent);
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setCartons(Math.min(containerMaxCapacity, t.minQuantity))}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer border flex items-center gap-1 transition-colors ${
                                  isAct
                                    ? "bg-[#282A2E] border-[#44474E] text-white font-bold"
                                    : "bg-[#18191B] border-[#282A2E] text-slate-400 hover:text-white"
                                }`}
                              >
                                <span>{rText} ctn</span>
                                <span className="opacity-75">(-{t.discountPercent}%)</span>
                                <span className="font-bold text-slate-200">฿{fmt(p)}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ============================================================== */}
                {/* Section 2: Calculation Summary (OUTPUT)                         */}
                {/* ============================================================== */}
                <div className="space-y-2">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 border-b border-[#2C2E33] pb-1.5 flex items-center justify-between">
                    <span>2. Calculation Summary</span>
                    <span className="text-[9px] font-mono text-slate-400">OUTPUT</span>
                  </div>

                  <div className="divide-y divide-[#242629] text-xs">
                    <div className="py-1.5 flex items-center justify-between">
                      <span className="text-slate-400">Total Cartons</span>
                      <div className="text-right">
                        <span className="font-bold text-white tabular-nums">{cartons.toLocaleString()} ctns</span>
                        <span className="text-[10px] text-slate-400 ml-1.5 font-mono">({totalUnits.toLocaleString()} pcs)</span>
                      </div>
                    </div>

                    <div className="py-1.5 flex items-center justify-between">
                      <span className="text-slate-400">Total Volume (CBM)</span>
                      <div className="text-right">
                        <span className="font-bold text-white tabular-nums">{totalCbm.toFixed(3)} m³</span>
                        <span className="text-[10px] text-slate-400 ml-1.5 font-mono">({pctContainerFill.toFixed(0)}% FCL)</span>
                      </div>
                    </div>

                    <div className="py-1.5 flex items-center justify-between">
                      <span className="text-slate-400">Gross Weight</span>
                      <div className="text-right">
                        <span className="font-bold text-white tabular-nums">{fmt(totalGw)} kg</span>
                        <span className="text-[10px] text-slate-400 ml-1.5 font-mono">({(totalGw / 1000).toFixed(2)} tons)</span>
                      </div>
                    </div>

                    <div className="py-1.5 flex items-center justify-between">
                      <span className="text-slate-400">Total Amount</span>
                      <div className="text-right">
                        <span className="font-bold text-[#C7F33C] tabular-nums">฿{fmt(totalAmount)}</span>
                        <span className="text-[10px] text-slate-400 ml-1.5 font-mono">(@฿{fmt(appliedUnitPrice)}/pc)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ============================================================== */}
                {/* Section 3: Placement & Capacity (LAYOUT)                        */}
                {/* ============================================================== */}
                <div className="space-y-2">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 border-b border-[#2C2E33] pb-1.5 flex items-center justify-between">
                    <span>3. Placement & Capacity</span>
                    <span className="text-[9px] font-mono text-slate-400">LAYOUT</span>
                  </div>

                  <div className="divide-y divide-[#242629] text-xs">
                    {/* Max FCL Capacity */}
                    <div className="py-1.5 flex items-center justify-between">
                      <span className="text-slate-300 font-medium">Max FCL Capacity</span>
                      <div className="text-right">
                        <span className="font-bold text-white tabular-nums">{packingPlan.totalHybridCartons.toLocaleString()} ctns</span>
                        <span className="text-[10px] text-slate-400 ml-1.5 font-mono">({packingPlan.hybridPlan.hybridUtilization.toFixed(1)}%)</span>
                      </div>
                    </div>

                    {/* Standard Orthogonal Grid */}
                    <div className="py-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                          <span className="font-medium">Standard Grid (Orthogonal)</span>
                        </div>
                        <div className="font-bold text-emerald-400 tabular-nums">
                          {packingPlan.greenCartons.toLocaleString()} ctns
                        </div>
                      </div>
                      <div className="text-[10.5px] text-slate-400 pl-3.5 font-mono flex items-center justify-between">
                        <span>{packingPlan.widthCount}W × {packingPlan.lengthCount}L × {packingPlan.heightCount}H ctns</span>
                        <span>({packingPlan.hybridPlan.greenCbm.toFixed(2)} m³)</span>
                      </div>
                    </div>

                    {/* Tilted Gap Optimization */}
                    <div className="py-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                          <span className="font-medium">Tilted Gap Optimization</span>
                        </div>
                        <div className="font-bold text-amber-400 tabular-nums">
                          {packingPlan.orangeCartons > 0 ? `+${packingPlan.orangeCartons.toLocaleString()} ctns` : "0 ctns"}
                          {packingPlan.orangeCartons > 0 && (
                            <span className="text-[10px] text-slate-400 font-normal ml-1 font-mono">
                              (+{packingPlan.hybridPlan.gainPercent.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 3 Gap Details */}
                      <div className="pl-3.5 space-y-1 text-[10.5px] font-mono">
                        <div className="flex items-center justify-between text-slate-400">
                          <span>• Side Gap (rem. {packingPlan.widthGapCm} cm)</span>
                          <span className={packingPlan.sideTilted.totalCartons > 0 ? "text-amber-400 font-semibold" : "text-slate-400"}>
                            {packingPlan.sideTilted.totalCartons > 0 ? `+${packingPlan.sideTilted.totalCartons} ctns` : "Insufficient space"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span>• Door Gap (rem. {packingPlan.lengthGapCm} cm)</span>
                          <span className={packingPlan.doorTilted.totalCartons > 0 ? "text-amber-400 font-semibold" : "text-slate-400"}>
                            {packingPlan.doorTilted.totalCartons > 0 ? `+${packingPlan.doorTilted.totalCartons} ctns` : "Insufficient space"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span>• Ceiling Gap (rem. {packingPlan.heightGapCm} cm)</span>
                          <span className={packingPlan.overheadTilted.totalCartons > 0 ? "text-amber-400 font-semibold" : "text-slate-400"}>
                            {packingPlan.overheadTilted.totalCartons > 0 ? `+${packingPlan.overheadTilted.totalCartons} ctns` : "Insufficient space"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: CONTAINER SPECIFICATIONS SETTINGS */}
            {sidebarTab === "settings" && (
              <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-4 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                {/* Header with container switch pills & reset */}
                <div className="space-y-2">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 border-b border-[#2C2E33] pb-1.5 flex items-center justify-between">
                    <span>Container Specifications</span>
                    <button
                      type="button"
                      onClick={() => handleResetSpecs(settingsContainerId)}
                      className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                      title="Reset this container to standard specifications"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  </div>

                  {/* Container Type Selector Pills */}
                  <div className="flex items-center gap-1.5">
                    {(["20ft", "40ft", "40ftHq"] as const).map((cId) => {
                      const isSel = settingsContainerId === cId;
                      return (
                        <button
                          key={cId}
                          type="button"
                          onClick={() => setSettingsContainerId(cId)}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors text-center ${
                            isSel
                              ? "bg-[#282A2E] text-white border border-[#3E4249]"
                              : "bg-[#18191B] text-slate-400 hover:text-slate-200 border border-transparent"
                          }`}
                        >
                          {CONTAINER_SPECS[cId].shortName}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sub-section 1: Inner Dimensions */}
                <div className="space-y-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-[#242629] pb-1">
                    Inner Usable Dimensions
                  </div>

                  {/* Length / Depth */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>Inner Depth / Length (L)</span>
                      <span className="font-mono text-slate-500">Std: {CONTAINER_SPECS[settingsContainerId].lengthCm} cm</span>
                    </div>
                    <div className="flex items-center bg-[#18191B] border border-[#2B2D31] rounded-lg px-2.5 py-1.5 focus-within:border-slate-400">
                      <input
                        type="number"
                        step="0.1"
                        min="100"
                        value={customContainerSpecs[settingsContainerId]?.lengthCm ?? ""}
                        onChange={(e) =>
                          handleUpdateSpec(settingsContainerId, "lengthCm", parseFloat(e.target.value) || 0)
                        }
                        className="w-full bg-transparent text-xs font-bold text-white outline-none tabular-nums"
                      />
                      <span className="text-[10px] text-slate-400 font-mono ml-1">cm</span>
                    </div>
                  </div>

                  {/* Width */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>Inner Width (W)</span>
                      <span className="font-mono text-slate-500">Std: {CONTAINER_SPECS[settingsContainerId].widthCm} cm</span>
                    </div>
                    <div className="flex items-center bg-[#18191B] border border-[#2B2D31] rounded-lg px-2.5 py-1.5 focus-within:border-slate-400">
                      <input
                        type="number"
                        step="0.1"
                        min="50"
                        value={customContainerSpecs[settingsContainerId]?.widthCm ?? ""}
                        onChange={(e) =>
                          handleUpdateSpec(settingsContainerId, "widthCm", parseFloat(e.target.value) || 0)
                        }
                        className="w-full bg-transparent text-xs font-bold text-white outline-none tabular-nums"
                      />
                      <span className="text-[10px] text-slate-400 font-mono ml-1">cm</span>
                    </div>
                  </div>

                  {/* Height */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>Inner Height (H)</span>
                      <span className="font-mono text-slate-500">Std: {CONTAINER_SPECS[settingsContainerId].heightCm} cm</span>
                    </div>
                    <div className="flex items-center bg-[#18191B] border border-[#2B2D31] rounded-lg px-2.5 py-1.5 focus-within:border-slate-400">
                      <input
                        type="number"
                        step="0.1"
                        min="50"
                        value={customContainerSpecs[settingsContainerId]?.heightCm ?? ""}
                        onChange={(e) =>
                          handleUpdateSpec(settingsContainerId, "heightCm", parseFloat(e.target.value) || 0)
                        }
                        className="w-full bg-transparent text-xs font-bold text-white outline-none tabular-nums"
                      />
                      <span className="text-[10px] text-slate-400 font-mono ml-1">cm</span>
                    </div>
                  </div>
                </div>

                {/* Sub-section 2: Capacity & Payload Limits */}
                <div className="space-y-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-[#242629] pb-1">
                    Payload & Volume Ratings
                  </div>

                  {/* Max Gross Weight / Payload */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>Max Gross Payload (GW)</span>
                      <span className="font-mono text-slate-500">
                        Std: {CONTAINER_SPECS[settingsContainerId].maxPayloadKg.toLocaleString()} kg
                      </span>
                    </div>
                    <div className="flex items-center bg-[#18191B] border border-[#2B2D31] rounded-lg px-2.5 py-1.5 focus-within:border-slate-400">
                      <input
                        type="number"
                        step="100"
                        min="1000"
                        value={customContainerSpecs[settingsContainerId]?.maxPayloadKg ?? ""}
                        onChange={(e) =>
                          handleUpdateSpec(settingsContainerId, "maxPayloadKg", parseInt(e.target.value, 10) || 0)
                        }
                        className="w-full bg-transparent text-xs font-bold text-white outline-none tabular-nums"
                      />
                      <span className="text-[10px] text-slate-400 font-mono ml-1">kg</span>
                    </div>
                    <div className="text-[9.5px] text-slate-500 font-mono text-right">
                      {((customContainerSpecs[settingsContainerId]?.maxPayloadKg || 0) / 1000).toFixed(2)} metric tons
                    </div>
                  </div>

                  {/* Nominal / Max Usable CBM */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>Max Usable Volume (CBM)</span>
                      <span className="font-mono text-slate-500">Std: {CONTAINER_SPECS[settingsContainerId].nominalCbm} m³</span>
                    </div>
                    <div className="flex items-center bg-[#18191B] border border-[#2B2D31] rounded-lg px-2.5 py-1.5 focus-within:border-slate-400">
                      <input
                        type="number"
                        step="0.1"
                        min="1"
                        value={customContainerSpecs[settingsContainerId]?.nominalCbm ?? ""}
                        onChange={(e) =>
                          handleUpdateSpec(settingsContainerId, "nominalCbm", parseFloat(e.target.value) || 0)
                        }
                        className="w-full bg-transparent text-xs font-bold text-white outline-none tabular-nums"
                      />
                      <span className="text-[10px] text-slate-400 font-mono ml-1">m³</span>
                    </div>
                  </div>
                </div>

                {/* Helper / Action Box */}
                <div className="p-2.5 rounded-xl bg-[#161719] border border-[#26282B] space-y-2 text-[10.5px]">
                  <div className="flex items-start gap-1.5 text-slate-400 leading-relaxed">
                    <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span>Adjustments dynamically recalculate all 3D/2D CAD schematics, clearances, and load capacity.</span>
                  </div>

                  {selectedContainer !== settingsContainerId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedContainer(settingsContainerId);
                        setSidebarTab("controls");
                      }}
                      className="w-full py-1.5 px-2 rounded-lg bg-[#282A2E] hover:bg-[#34373C] text-white text-xs font-semibold cursor-pointer border border-[#3E4249] transition-colors flex items-center justify-center gap-1.5"
                    >
                      <span>Simulate this {CONTAINER_SPECS[settingsContainerId].shortName}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSidebarTab("controls")}
                      className="w-full py-1.5 px-2 rounded-lg bg-[#1B1D1F] hover:bg-[#25272A] text-slate-300 hover:text-white text-xs font-semibold cursor-pointer border border-[#2C2E33] transition-colors flex items-center justify-center gap-1.5"
                    >
                      <span>Return to Simulation Controls</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleResetSpecs()}
                    className="w-full py-1 px-2 rounded-lg text-slate-500 hover:text-slate-300 text-[10px] cursor-pointer transition-colors text-center"
                  >
                    Reset all containers to ISO standards
                  </button>
                </div>
              </div>
            )}

            {/* Sticky Bottom Actions */}
            <div className="p-3 border-t border-[#2B2D31] bg-[#1A1B1D] flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopySummary}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  copied
                    ? "bg-[#282A2E] border border-[#3E4249] text-white"
                    : "bg-[#232427] hover:bg-[#2B2D31] text-slate-300 hover:text-white border border-[#33353A]"
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                <span>{copied ? "Copied" : "Copy Summary"}</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="py-2 px-4 rounded-xl bg-slate-100 hover:bg-white text-black text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                title="Print Container Loading Blueprint"
              >
                <Printer className="w-3.5 h-3.5 text-black" />
                <span>Print</span>
              </button>
            </div>
              </>
            )}
          </aside>

          {/* ========================================================================= */}
          {/* RIGHT MAIN AREA: PRODUCT CATALOG (FULL WIDTH) OR SIMULATOR CANVASES        */}
          {/* ========================================================================= */}
          <main className="flex-1 flex flex-col bg-[#141516] min-w-0 h-full overflow-hidden">
            {/* Top Canvas Bar: Active Product Display with Quick Dropdown Selector + Close X */}
            <header className="h-12 w-full border-b border-[#2A2B2D] bg-[#1A1B1D] px-4 flex items-center justify-between gap-3 shrink-0 relative z-30">
              <div className="relative flex items-center w-full" ref={productDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsProductDropdownOpen((prev) => !prev)}
                  className={`group flex items-center w-full gap-2.5 sm:gap-3 px-3 py-1.5 rounded-xl border transition-all cursor-pointer text-left ${
                    isProductDropdownOpen
                      ? "bg-[#222428] border-[#C7F33C]/60 text-white shadow-lg"
                      : "bg-[#141517] hover:bg-[#1E2024] border-[#2B2D31] hover:border-[#3E424A] text-slate-200"
                  }`}
                  title={isProductDropdownOpen ? "Close catalog view" : "Click to browse and change product"}
                >
                  <div className="w-6 h-6 rounded-lg bg-[#22252A] flex items-center justify-center shrink-0 border border-[#33373E] group-hover:border-[#C7F33C]/40">
                    <Package className="w-3.5 h-3.5 text-[#C7F33C]" />
                  </div>

                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs sm:text-sm font-bold text-slate-100 group-hover:text-white truncate max-w-[150px] sm:max-w-xs md:max-w-sm">
                      {activeListItem?.name || productOverview?.name || "เลือกสินค้าเพื่อจำลองการบรรจุ (Select a Product...)"}
                    </span>
                    {(activeListItem?.brand || activeListItem?.category) ? (
                      <span className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded-md bg-[#25282D] text-slate-400 font-medium">
                        {activeListItem?.brand || activeListItem?.category}
                      </span>
                    ) : !activeListItem ? (
                      <span className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded-md bg-[#C7F33C]/10 text-[#C7F33C] font-medium border border-[#C7F33C]/30">
                        ตู้ว่าง / ยังไม่เลือกสินค้า
                      </span>
                    ) : null}
                  </div>

                  {activeListItem ? (
                    <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono text-slate-400 bg-[#0E0F11] px-2 py-0.5 rounded-lg border border-[#222428]">
                      <span>{resolvedSpecs.cartonW}×{resolvedSpecs.cartonL}×{resolvedSpecs.cartonH} cm</span>
                      <span className="text-slate-600">·</span>
                      <span>{resolvedSpecs.cartonGw} kg</span>
                    </div>
                  ) : (
                    <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono text-slate-400 bg-[#0E0F11] px-2 py-0.5 rounded-lg border border-[#222428]">
                      <span className="text-slate-400">Carton: 0 ctns (ตู้โล่ง)</span>
                    </div>
                  )}
                </button>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#252728] transition-colors cursor-pointer shrink-0"
                title="Close Simulator"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            {isProductDropdownOpen ? (
              /* ========================================================================= */
              /* FULL-WIDTH PRODUCT CATALOG VIEW (ความกว้างเต็มพื้นที่ สุด modal)                 */
              /* ========================================================================= */
              <div className="flex-1 flex flex-col min-h-0 bg-[#121315] overflow-hidden">
                {/* Catalog View Subheader */}
                <div className="px-5 py-3 border-b border-[#24262A] bg-[#202123] flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-[#C7F33C]/10 border border-[#C7F33C]/30 flex items-center justify-center text-[#C7F33C]">
                      <Boxes className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-white">Product Catalog for Container Simulation</h2>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#24272D] text-[#C7F33C] font-mono font-bold border border-[#343842]">
                          {filteredProducts.length} items
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Select a product below to simulate container packaging, load capacities, and 3D/2D CAD blueprints.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {(selectedCategory !== "ALL" || selectedBrand !== "ALL" || searchQuery) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory("ALL");
                          setSelectedBrand("ALL");
                          setSearchQuery("");
                        }}
                        className="text-xs text-[#C7F33C] hover:underline cursor-pointer flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#202327] border border-[#31353D]"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset Filters</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsProductDropdownOpen(false)}
                      className="px-3 py-1.5 rounded-xl bg-[#26282D] hover:bg-[#30333A] text-slate-200 hover:text-white text-xs font-semibold border border-[#393D45] transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
                      <span>Back to Simulator</span>
                    </button>
                  </div>
                </div>

                {/* Catalog Grid Area */}
                <div className="flex-1 p-5 overflow-y-auto custom-scrollbar bg-[#202123]">
                  {isLoadingCatalog && catalogProducts.length === 0 ? (
                    <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
                      <div className="w-10 h-10 border-2 border-[#C7F33C] border-t-transparent rounded-full animate-spin" />
                      <div className="text-xs text-slate-400">Loading complete product catalog...</div>
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-[#1D1F23] border border-[#2D3037] flex items-center justify-center text-slate-500">
                        <Package className="w-7 h-7 stroke-[1.5]" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-slate-300">No products match the selected criteria</div>
                        <div className="text-xs text-slate-500 max-w-sm">
                          Try adjusting your search query or selecting a different category or brand filter on the sidebar.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory("ALL");
                          setSelectedBrand("ALL");
                          setSearchQuery("");
                        }}
                        className="mt-2 px-3.5 py-2 rounded-xl bg-[#26282D] hover:bg-[#32363E] border border-[#3C404B] text-[#C7F33C] text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Clear All Filters</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {/* Table Column Headers (Visible on md+ screens) */}
                      <div className="hidden md:flex items-center justify-between px-4 py-2 text-[10px] uppercase font-mono font-bold text-slate-400 border-b border-[#222428] gap-4">
                        <div className="flex-1 min-w-0">Product Info</div>
                        <div className="w-40 text-left shrink-0">Carton Dimensions (W×L×H)</div>
                        <div className="w-24 text-right shrink-0">Gross Weight</div>
                        <div className="w-24 text-right shrink-0">Packaging</div>
                      </div>

                      {/* Product Rows List */}
                      {filteredProducts.map((p) => {
                        const isSelected = p.id === selectedProductId;
                        const dim = p.cartonDimension || "30×40×12.3 cm";
                        const gw = p.cartonGrossWeight ? `${p.cartonGrossWeight} kg` : "—";
                        const qty = p.cartonQuantity ? `${p.cartonQuantity} pcs/ctn` : "—";

                        return (
                          <div
                            key={p.id}
                            onClick={() => {
                              setSelectedProductId(p.id);
                              setIsProductDropdownOpen(false);
                            }}
                            className={`group w-full px-3.5 py-2.5 rounded-xl border-none transition-all duration-150 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-2.5 md:gap-4 text-left ${
                              isSelected
                                ? "bg-[#25282D] text-white"
                                : "bg-[#202123] hover:bg-[#1C1E22]"
                            }`}
                          >
                            {/* Product Info (Icon + Full Name + Brand/Category Badges) */}
                            <div className="flex items-center gap-3 flex-1 min-w-0 pr-3">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                  isSelected
                                    ? "bg-[#C7F33C]/20 border-[#C7F33C]/50 text-[#C7F33C]"
                                    : "bg-[#202226] border-[#2B2E34] text-slate-400 group-hover:text-slate-200 group-hover:border-[#3A3E47]"
                                }`}
                              >
                                {isSelected ? (
                                  <Check className="w-4 h-4 text-[#C7F33C] stroke-[2.5]" />
                                ) : (
                                  <Package className="w-4 h-4" />
                                )}
                              </div>
                              <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className={`text-xs font-bold transition-colors ${
                                      isSelected ? "text-[#C7F33C]" : "text-slate-100 group-hover:text-white"
                                    }`}
                                    title={p.name}
                                  >
                                    {p.name}
                                  </span>
                                  {isSelected && (
                                    <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-[#C7F33C]/15 border border-[#C7F33C]/40 text-[#C7F33C] font-semibold shrink-0">
                                      Active
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {p.brand && (
                                    <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-[#202226] text-slate-300 border border-[#2B2D33] font-medium">
                                      {p.brand}
                                    </span>
                                  )}
                                  {p.category && (
                                    <span className="text-[9.5px] text-slate-400">
                                      {p.category}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Mobile Specs Summary (shown only on small screens) */}
                            <div className="md:hidden flex items-center justify-between text-[11px] font-mono text-slate-400 bg-[#111214] px-2.5 py-1.5 rounded-lg border border-[#222428]">
                              <span className="text-slate-200 font-bold">{dim}</span>
                              <span>· {gw}</span>
                              <span>· {qty}</span>
                            </div>

                            {/* Desktop Columns: Dimensions, Gross Wt, Packaging */}
                            <div className="hidden md:block w-40 text-left shrink-0 font-mono text-xs text-slate-200 font-medium">
                              {dim}
                            </div>
                            <div className="hidden md:block w-24 text-right shrink-0 font-mono text-xs text-slate-300">
                              {gw}
                            </div>
                            <div className="hidden md:block w-24 text-right shrink-0 font-mono text-xs text-slate-300">
                              {qty}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Canvas Body: All 4 Views Sequentially Displayed on the Same Page */
              <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-8 bg-[#202123] custom-scrollbar">
              {/* ============================================================== */}
              {/* 01 · 3D ISOMETRIC SIMULATION                                   */}
              {/* ============================================================== */}
              <div id="sim-3d" className="w-full max-w-5xl mx-auto flex flex-col items-center">
                <div className="w-full flex items-center justify-between text-xs text-slate-400 font-mono mb-2 px-1">
                  <span className="text-slate-200 font-bold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                    01 · 3D Isometric Simulation ({currentContainer.shortName})
                  </span>
                  <span className="text-[11px] text-slate-500 font-sans">
                    Axonometric True Scale Projection (Open Door Perspective)
                  </span>
                </div>
                <div className="w-full flex items-center justify-center">
                  <svg
                    viewBox="0 0 960 480"
                    className="w-full h-auto select-none"
                    style={{ filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.7))" }}
                  >
                    <defs>
                      <pattern id="modal-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#2D3035" strokeWidth="0.6" />
                      </pattern>
                      <linearGradient id="floorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#262B33" />
                        <stop offset="100%" stopColor="#1C2026" />
                      </linearGradient>
                      <linearGradient id="ctnTopGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#4D7C0F" />
                        <stop offset="100%" stopColor="#4D7C0F" />
                      </linearGradient>
                      <linearGradient id="ctnFrontGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#365314" />
                        <stop offset="100%" stopColor="#365314" />
                      </linearGradient>
                      <linearGradient id="ctnSideGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#273E0C" />
                        <stop offset="100%" stopColor="#273E0C" />
                      </linearGradient>
                      <linearGradient id="ctnOrangeTopGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#B45309" />
                        <stop offset="100%" stopColor="#B45309" />
                      </linearGradient>
                      <linearGradient id="ctnOrangeFrontGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#9A3412" />
                        <stop offset="100%" stopColor="#9A3412" />
                      </linearGradient>
                      <linearGradient id="ctnOrangeSideGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#78350F" />
                        <stop offset="100%" stopColor="#78350F" />
                      </linearGradient>
                    </defs>

                    {/* Canvas Background */}
                    <rect x="0" y="0" width="960" height="480" fill="url(#modal-grid)" rx="10" />

                    {/*
                      Axonometric 3D Engineering Model (Matching Reference Logistics Software):
                      - Viewed from open isometric front-right perspective looking inside.
                      - Far Wall on upper-left, Rear Bulkhead on upper-right, Open Floor with 1m grid along length.
                      - True 5:1:1 aspect ratio for 40ft (12m x 2.35m x 2.39m) and 2.5:1:1 for 20ft (5.9m x 2.35m x 2.39m).
                      - Constant carton scale (same pixels per cm in 20ft, 40ft, 40HQ).
                      - 1m interval tick markers (1m, 2m, 3m... 12m) along floor edge, exactly like the reference diagram.
                    */}
                    {(() => {
                      const Wc = packingPlan.widthCount;
                      const Lc = packingPlan.lengthCount;
                      const Hc = packingPlan.heightCount;
                      const Nslice = Wc * Hc;
                      const cartonUsedW = packingPlan.cartonUsedW;
                      const cartonUsedL = packingPlan.cartonUsedL;
                      const cartonH = resolvedSpecs.cartonH;

                      const doorL = currentContainer.lengthCm;
                      const contW = currentContainer.widthCm;
                      const contH = currentContainer.heightCm;

                      // Viewport positioning: perfectly centered for 20ft and 40ft container simulation
                      const originX = doorL === 589.8 ? 560 : 705;
                      const originY = doorL === 589.8 ? 225 : 170;

                      // True 3D Isometric CAD Scale Constants:
                      // Length: moves left (-X) and down (+Y) towards the door (50.34px per 1m)
                      const dxL = -0.47;
                      const dyL = +0.18;
                      // Width: moves right (+X) and down (+Y) towards the open near edge
                      // Exactly matching length step (50.34px per 1m) so 1m x 1m grid squares are equilateral!
                      const dxW = +0.47;
                      const dyW = +0.18;
                      // Height: moves straight UP (-Y)
                      const dyH = -0.503;

                      const calcX = (l: number, w: number) => {
                        return originX + l * dxL + w * dxW;
                      };
                      const calcY = (l: number, w: number, h: number) => {
                        return originY + l * dyL + w * dyW + h * dyH;
                      };
                      const pt = (l: number, w: number, h: number) => {
                        return `${calcX(l, w).toFixed(1)},${calcY(l, w, h).toFixed(1)}`;
                      };

                      const loadedCount = Math.min(cartons, packingPlan.totalCartons);
                      const fullRowCount = Math.floor(loadedCount / Nslice);
                      const remCartonsInActiveRow = loadedCount % Nslice;

                      const renderedCartonElements: React.JSX.Element[] = [];

                      // Render Cargo Rows loaded from Rear (l = 0) towards Door (l = doorL)
                      for (let r = 0; r < fullRowCount; r++) {
                        const l0 = r * cartonUsedL;
                        const l1 = (r + 1) * cartonUsedL;
                        const w0 = 0; // against far wall
                        const w1 = Wc * cartonUsedW;
                        const h0 = 0; // floor
                        const h1 = Hc * cartonH;

                        const isFrontmostRow = r === fullRowCount - 1;

                        renderedCartonElements.push(
                          <g key={`full-row-${r}`}>
                            {/* Top Face */}
                            <polygon
                              points={`${pt(l0, w0, h1)} ${pt(l0, w1, h1)} ${pt(l1, w1, h1)} ${pt(l1, w0, h1)}`}
                              fill="url(#ctnTopGrad)"
                              stroke="#A3E635"
                              strokeWidth="1.1"
                            />
                            {/* Top Face Column Grid Lines */}
                            {Array.from({ length: Wc - 1 }).map((_, c) => {
                              const colW = (c + 1) * cartonUsedW;
                              return (
                                <line
                                  key={`top-col-${c}`}
                                  x1={calcX(l0, colW).toFixed(1)}
                                  y1={calcY(l0, colW, h1).toFixed(1)}
                                  x2={calcX(l1, colW).toFixed(1)}
                                  y2={calcY(l1, colW, h1).toFixed(1)}
                                  stroke="#84CC16"
                                  strokeWidth="0.8"
                                  strokeOpacity="0.9"
                                />
                              );
                            })}

                            {/* Near-Side Face (Facing Viewer!) */}
                            <polygon
                              points={`${pt(l0, w1, h1)} ${pt(l1, w1, h1)} ${pt(l1, w1, h0)} ${pt(l0, w1, h0)}`}
                              fill="url(#ctnSideGrad)"
                              stroke="#84CC16"
                              strokeWidth="1.1"
                            />
                            {/* Near-Side Tier Grid Lines */}
                            {Array.from({ length: Hc - 1 }).map((_, l) => {
                              const tierH = (l + 1) * cartonH;
                              return (
                                <line
                                  key={`side-tier-${l}`}
                                  x1={calcX(l0, w1).toFixed(1)}
                                  y1={calcY(l0, w1, tierH).toFixed(1)}
                                  x2={calcX(l1, w1).toFixed(1)}
                                  y2={calcY(l1, w1, tierH).toFixed(1)}
                                  stroke="#65A30D"
                                  strokeWidth="0.8"
                                  strokeOpacity="0.9"
                                />
                              );
                            })}

                            {/* Front Face (Facing Door, rendered on frontmost full row) */}
                            {isFrontmostRow && (
                              <g>
                                <polygon
                                  points={`${pt(l1, w0, h0)} ${pt(l1, w1, h0)} ${pt(l1, w1, h1)} ${pt(l1, w0, h1)}`}
                                  fill="url(#ctnFrontGrad)"
                                  stroke="#BEF264"
                                  strokeWidth="1.2"
                                />
                                {/* Individual carton column lines on front face */}
                                {Array.from({ length: Wc - 1 }).map((_, c) => {
                                  const colW = (c + 1) * cartonUsedW;
                                  return (
                                    <line
                                      key={`fcol-${c}`}
                                      x1={calcX(l1, colW).toFixed(1)}
                                      y1={calcY(l1, colW, h0).toFixed(1)}
                                      x2={calcX(l1, colW).toFixed(1)}
                                      y2={calcY(l1, colW, h1).toFixed(1)}
                                      stroke="#84CC16"
                                      strokeWidth="0.8"
                                      strokeOpacity="0.9"
                                    />
                                  );
                                })}
                                {/* Individual carton tier lines on front face */}
                                {Array.from({ length: Hc - 1 }).map((_, l) => {
                                  const tierH = (l + 1) * cartonH;
                                  return (
                                    <line
                                      key={`flayer-${l}`}
                                      x1={calcX(l1, w0).toFixed(1)}
                                      y1={calcY(l1, w0, tierH).toFixed(1)}
                                      x2={calcX(l1, w1).toFixed(1)}
                                      y2={calcY(l1, w1, tierH).toFixed(1)}
                                      stroke="#84CC16"
                                      strokeWidth="0.8"
                                      strokeOpacity="0.9"
                                    />
                                  );
                                })}
                              </g>
                            )}
                          </g>
                        );
                      }

                      // Active Partially Loaded Row (Individual Box by Box!)
                      if (remCartonsInActiveRow > 0 && fullRowCount < Lc) {
                        const activeRow = fullRowCount;
                        const l0 = activeRow * cartonUsedL;
                        const l1 = (activeRow + 1) * cartonUsedL;

                        for (let j = 0; j < remCartonsInActiveRow; j++) {
                          const z = Math.floor(j / Wc); // tier index
                          const x = j % Wc; // column index

                          const boxW0 = x * cartonUsedW;
                          const boxW1 = (x + 1) * cartonUsedW;
                          const boxH0 = z * cartonH;
                          const boxH1 = (z + 1) * cartonH;

                          renderedCartonElements.push(
                            <g key={`single-box-${activeRow}-${j}`}>
                              {/* Box Top Face */}
                              <polygon
                                points={`${pt(l0, boxW0, boxH1)} ${pt(l0, boxW1, boxH1)} ${pt(l1, boxW1, boxH1)} ${pt(l1, boxW0, boxH1)}`}
                                fill="url(#ctnTopGrad)"
                                stroke="#A3E635"
                                strokeWidth="1.1"
                              />

                              {/* Box Near-Side Face */}
                              <polygon
                                points={`${pt(l0, boxW1, boxH1)} ${pt(l1, boxW1, boxH1)} ${pt(l1, boxW1, boxH0)} ${pt(l0, boxW1, boxH0)}`}
                                fill="url(#ctnSideGrad)"
                                stroke="#84CC16"
                                strokeWidth="1.1"
                              />

                              {/* Box Front Face */}
                              <polygon
                                points={`${pt(l1, boxW0, boxH0)} ${pt(l1, boxW1, boxH0)} ${pt(l1, boxW1, boxH1)} ${pt(l1, boxW0, boxH1)}`}
                                fill="url(#ctnFrontGrad)"
                                stroke="#BEF264"
                                strokeWidth="1.2"
                              />
                            </g>
                          );
                        }
                      }

                      // Render Tilted Orange Cartons in Overhead Gap & Side Gap (if enabled, cartons > 0, and space fits)
                      if (cartons > 0 && showTiltedCartons && packingPlan.overheadTilted.totalCartons > 0 && packingPlan.overheadTilted.cartonOrientation) {
                        const ohOri = packingPlan.overheadTilted.cartonOrientation;
                        const ohCounts = packingPlan.overheadTilted.counts;
                        const oh_w0 = 0;
                        const oh_w1 = Math.min(contW, ohCounts.wCount * ohOri.w);
                        const oh_l0 = 0;
                        const rawL = fullRowCount > 0 ? (fullRowCount + (remCartonsInActiveRow > 0 ? 1 : 0)) * cartonUsedL : doorL;
                        const oh_l1 = Math.min(doorL, rawL > 0 ? rawL : doorL);
                        const oh_h0 = Hc * cartonH;
                        const oh_h1 = Math.min(contH, oh_h0 + ohCounts.hCount * ohOri.h);
                        const nl = Math.min(ohCounts.lCount, Math.floor(oh_l1 / ohOri.l) || 1);

                        if (oh_l1 > 0 && oh_h1 > oh_h0 && oh_w1 > oh_w0) {
                          renderedCartonElements.push(
                            <g key="3d-tilted-overhead-cartons" id="3d-tilted-overhead-gap">
                              {/* Top Face of tilted overhead cartons */}
                              <polygon
                                points={`${pt(oh_l0, oh_w0, oh_h1)} ${pt(oh_l0, oh_w1, oh_h1)} ${pt(oh_l1, oh_w1, oh_h1)} ${pt(oh_l1, oh_w0, oh_h1)}`}
                                fill="url(#ctnOrangeTopGrad)"
                                fillOpacity="0.85"
                                stroke="#FBBF24"
                                strokeWidth="1.1"
                              />
                              {/* Top Face carton grid lines */}
                              {Array.from({ length: ohCounts.wCount - 1 }).map((_, c) => {
                                const w = oh_w0 + (c + 1) * ohOri.w;
                                if (w >= oh_w1) return null;
                                return (
                                  <line
                                    key={`3d-oh-top-w-${c}`}
                                    x1={calcX(oh_l0, w).toFixed(1)}
                                    y1={calcY(oh_l0, w, oh_h1).toFixed(1)}
                                    x2={calcX(oh_l1, w).toFixed(1)}
                                    y2={calcY(oh_l1, w, oh_h1).toFixed(1)}
                                    stroke="#FCD34D"
                                    strokeWidth="0.8"
                                    strokeOpacity="0.9"
                                  />
                                );
                              })}
                              {Array.from({ length: nl - 1 }).map((_, r) => {
                                const l = oh_l0 + (r + 1) * ohOri.l;
                                if (l >= oh_l1) return null;
                                return (
                                  <line
                                    key={`3d-oh-top-l-${r}`}
                                    x1={calcX(l, oh_w0).toFixed(1)}
                                    y1={calcY(l, oh_w0, oh_h1).toFixed(1)}
                                    x2={calcX(l, oh_w1).toFixed(1)}
                                    y2={calcY(l, oh_w1, oh_h1).toFixed(1)}
                                    stroke="#FCD34D"
                                    strokeWidth="0.8"
                                    strokeOpacity="0.9"
                                  />
                                );
                              })}

                              {/* Near-Side Face of tilted overhead cartons */}
                              <polygon
                                points={`${pt(oh_l0, oh_w1, oh_h1)} ${pt(oh_l1, oh_w1, oh_h1)} ${pt(oh_l1, oh_w1, oh_h0)} ${pt(oh_l0, oh_w1, oh_h0)}`}
                                fill="url(#ctnOrangeSideGrad)"
                                fillOpacity="0.85"
                                stroke="#F59E0B"
                                strokeWidth="1.1"
                              />
                              {/* Near-Side Face carton grid lines */}
                              {Array.from({ length: ohCounts.hCount - 1 }).map((_, hIdx) => {
                                const h = oh_h0 + (hIdx + 1) * ohOri.h;
                                if (h >= oh_h1) return null;
                                return (
                                  <line
                                    key={`3d-oh-side-h-${hIdx}`}
                                    x1={calcX(oh_l0, oh_w1).toFixed(1)}
                                    y1={calcY(oh_l0, oh_w1, h).toFixed(1)}
                                    x2={calcX(oh_l1, oh_w1).toFixed(1)}
                                    y2={calcY(oh_l1, oh_w1, h).toFixed(1)}
                                    stroke="#FBBF24"
                                    strokeWidth="0.8"
                                    strokeOpacity="0.9"
                                  />
                                );
                              })}
                              {Array.from({ length: nl - 1 }).map((_, r) => {
                                const l = oh_l0 + (r + 1) * ohOri.l;
                                if (l >= oh_l1) return null;
                                return (
                                  <line
                                    key={`3d-oh-side-l-${r}`}
                                    x1={calcX(l, oh_w1).toFixed(1)}
                                    y1={calcY(l, oh_w1, oh_h0).toFixed(1)}
                                    x2={calcX(l, oh_w1).toFixed(1)}
                                    y2={calcY(l, oh_w1, oh_h1).toFixed(1)}
                                    stroke="#FBBF24"
                                    strokeWidth="0.8"
                                    strokeOpacity="0.9"
                                  />
                                );
                              })}

                              {/* Front Face if loaded */}
                              <polygon
                                points={`${pt(oh_l1, oh_w0, oh_h0)} ${pt(oh_l1, oh_w1, oh_h0)} ${pt(oh_l1, oh_w1, oh_h1)} ${pt(oh_l1, oh_w0, oh_h1)}`}
                                fill="url(#ctnOrangeFrontGrad)"
                                fillOpacity="0.85"
                                stroke="#FBBF24"
                                strokeWidth="1.2"
                              />
                              {/* Front Face carton grid lines */}
                              {Array.from({ length: ohCounts.wCount - 1 }).map((_, c) => {
                                const w = oh_w0 + (c + 1) * ohOri.w;
                                if (w >= oh_w1) return null;
                                return (
                                  <line
                                    key={`3d-oh-front-w-${c}`}
                                    x1={calcX(oh_l1, w).toFixed(1)}
                                    y1={calcY(oh_l1, w, oh_h0).toFixed(1)}
                                    x2={calcX(oh_l1, w).toFixed(1)}
                                    y2={calcY(oh_l1, w, oh_h1).toFixed(1)}
                                    stroke="#FCD34D"
                                    strokeWidth="0.8"
                                    strokeOpacity="0.9"
                                  />
                                );
                              })}
                              {Array.from({ length: ohCounts.hCount - 1 }).map((_, hIdx) => {
                                const h = oh_h0 + (hIdx + 1) * ohOri.h;
                                if (h >= oh_h1) return null;
                                return (
                                  <line
                                    key={`3d-oh-front-h-${hIdx}`}
                                    x1={calcX(oh_l1, oh_w0).toFixed(1)}
                                    y1={calcY(oh_l1, oh_w0, h).toFixed(1)}
                                    x2={calcX(oh_l1, oh_w1).toFixed(1)}
                                    y2={calcY(oh_l1, oh_w1, h).toFixed(1)}
                                    stroke="#FCD34D"
                                    strokeWidth="0.8"
                                    strokeOpacity="0.9"
                                  />
                                );
                              })}
                            </g>
                          );
                        }
                      }

                      // Render Tilted Orange Cartons in Side Gap (if enabled, cartons > 0, and side gap has tilted capacity)
                      if (cartons > 0 && showTiltedCartons && packingPlan.sideTilted.totalCartons > 0 && packingPlan.sideTilted.cartonOrientation) {
                        const sideOri = packingPlan.sideTilted.cartonOrientation;
                        const sideCounts = packingPlan.sideTilted.counts;
                        const w0 = Wc * cartonUsedW;
                        const w1 = Math.min(contW, w0 + sideCounts.wCount * sideOri.w);
                        const l0 = 0;
                        const rawL = fullRowCount > 0 ? (fullRowCount + (remCartonsInActiveRow > 0 ? 1 : 0)) * cartonUsedL : doorL;
                        const l1 = Math.min(doorL, rawL > 0 ? rawL : doorL);
                        const h0 = 0;
                        const h1 = Math.min(Hc * cartonH, sideCounts.hCount * sideOri.h);
                        const nl = Math.min(sideCounts.lCount, Math.floor(l1 / sideOri.l) || 1);

                        if (l1 > 0 && w1 > w0 && h1 > 0) {
                          renderedCartonElements.push(
                            <g key="3d-tilted-side-cartons" id="3d-tilted-side-gap">
                              {/* Top Face of tilted side cartons */}
                              <polygon
                                points={`${pt(l0, w0, h1)} ${pt(l0, w1, h1)} ${pt(l1, w1, h1)} ${pt(l1, w0, h1)}`}
                                fill="url(#ctnOrangeTopGrad)"
                                fillOpacity="0.85"
                                stroke="#FBBF24"
                                strokeWidth="1.1"
                              />
                              {/* Top Face grid lines */}
                              {Array.from({ length: nl - 1 }).map((_, r) => {
                                const l = l0 + (r + 1) * sideOri.l;
                                if (l >= l1) return null;
                                return (
                                  <line
                                    key={`3d-side-top-l-${r}`}
                                    x1={calcX(l, w0).toFixed(1)}
                                    y1={calcY(l, w0, h1).toFixed(1)}
                                    x2={calcX(l, w1).toFixed(1)}
                                    y2={calcY(l, w1, h1).toFixed(1)}
                                    stroke="#FCD34D"
                                    strokeWidth="0.8"
                                    strokeOpacity="0.9"
                                  />
                                );
                              })}
                              {sideCounts.wCount > 1 && Array.from({ length: sideCounts.wCount - 1 }).map((_, c) => {
                                const w = w0 + (c + 1) * sideOri.w;
                                if (w >= w1) return null;
                                return (
                                  <line
                                    key={`3d-side-top-w-${c}`}
                                    x1={calcX(l0, w).toFixed(1)}
                                    y1={calcY(l0, w, h1).toFixed(1)}
                                    x2={calcX(l1, w).toFixed(1)}
                                    y2={calcY(l1, w, h1).toFixed(1)}
                                    stroke="#FCD34D"
                                    strokeWidth="0.8"
                                    strokeOpacity="0.9"
                                  />
                                );
                              })}

                              {/* Near-Side Face of tilted side cartons */}
                              <polygon
                                points={`${pt(l0, w1, h1)} ${pt(l1, w1, h1)} ${pt(l1, w1, h0)} ${pt(l0, w1, h0)}`}
                                fill="url(#ctnOrangeSideGrad)"
                                fillOpacity="0.85"
                                stroke="#F59E0B"
                                strokeWidth="1.1"
                              />
                              {/* Near-Side Face grid lines */}
                              {Array.from({ length: sideCounts.hCount - 1 }).map((_, hIdx) => {
                                const h = h0 + (hIdx + 1) * sideOri.h;
                                if (h >= h1) return null;
                                return (
                                  <line
                                    key={`3d-side-side-h-${hIdx}`}
                                    x1={calcX(l0, w1).toFixed(1)}
                                    y1={calcY(l0, w1, h).toFixed(1)}
                                    x2={calcX(l1, w1).toFixed(1)}
                                    y2={calcY(l1, w1, h).toFixed(1)}
                                    stroke="#FBBF24"
                                    strokeWidth="0.8"
                                    strokeOpacity="0.9"
                                  />
                                );
                              })}
                              {Array.from({ length: nl - 1 }).map((_, r) => {
                                const l = l0 + (r + 1) * sideOri.l;
                                if (l >= l1) return null;
                                return (
                                  <line
                                    key={`3d-side-side-l-${r}`}
                                    x1={calcX(l, w1).toFixed(1)}
                                    y1={calcY(l, w1, h0).toFixed(1)}
                                    x2={calcX(l, w1).toFixed(1)}
                                    y2={calcY(l, w1, h1).toFixed(1)}
                                    stroke="#FBBF24"
                                    strokeWidth="0.8"
                                    strokeOpacity="0.9"
                                  />
                                );
                              })}

                              {/* Front Face if loaded */}
                              <polygon
                                points={`${pt(l1, w0, h0)} ${pt(l1, w1, h0)} ${pt(l1, w1, h1)} ${pt(l1, w0, h1)}`}
                                fill="url(#ctnOrangeFrontGrad)"
                                fillOpacity="0.85"
                                stroke="#FBBF24"
                                strokeWidth="1.2"
                              />
                              {/* Front Face grid lines */}
                              {Array.from({ length: sideCounts.hCount - 1 }).map((_, hIdx) => {
                                const h = h0 + (hIdx + 1) * sideOri.h;
                                if (h >= h1) return null;
                                return (
                                  <line
                                    key={`3d-side-front-h-${hIdx}`}
                                    x1={calcX(l1, w0).toFixed(1)}
                                    y1={calcY(l1, w0, h).toFixed(1)}
                                    x2={calcX(l1, w1).toFixed(1)}
                                    y2={calcY(l1, w1, h).toFixed(1)}
                                    stroke="#FCD34D"
                                    strokeWidth="0.8"
                                    strokeOpacity="0.9"
                                  />
                                );
                              })}
                              {sideCounts.wCount > 1 && Array.from({ length: sideCounts.wCount - 1 }).map((_, c) => {
                                const w = w0 + (c + 1) * sideOri.w;
                                if (w >= w1) return null;
                                return (
                                  <line
                                    key={`3d-side-front-w-${c}`}
                                    x1={calcX(l1, w).toFixed(1)}
                                    y1={calcY(l1, w, h0).toFixed(1)}
                                    x2={calcX(l1, w).toFixed(1)}
                                    y2={calcY(l1, w, h1).toFixed(1)}
                                    stroke="#FCD34D"
                                    strokeWidth="0.8"
                                    strokeOpacity="0.9"
                                  />
                                );
                              })}
                            </g>
                          );
                        }
                      }

                      // Render Tilted Orange Cartons in Door Gap (if enabled, cartons > 0, and door gap has tilted capacity)
                      if (cartons > 0 && showTiltedCartons && packingPlan.doorTilted.totalCartons > 0 && packingPlan.doorTilted.cartonOrientation) {
                        const doorOri = packingPlan.doorTilted.cartonOrientation;
                        const doorCounts = packingPlan.doorTilted.counts;
                        const greenUsedL = Lc * cartonUsedL;
                        const l0 = greenUsedL;
                        const l1 = Math.min(doorL, l0 + doorCounts.lCount * doorOri.l);
                        const w0 = 0;
                        const w1 = Math.min(contW, doorCounts.wCount * doorOri.w);
                        const h0 = 0;
                        const h1 = Math.min(contH, doorCounts.hCount * doorOri.h);

                        if (l1 > l0 && w1 > w0 && h1 > h0) {
                          renderedCartonElements.push(
                            <g key="3d-tilted-door-cartons" id="3d-tilted-door-gap">
                              {/* Top Face of tilted door cartons */}
                              <polygon
                                points={`${pt(l0, w0, h1)} ${pt(l0, w1, h1)} ${pt(l1, w1, h1)} ${pt(l1, w0, h1)}`}
                                fill="url(#ctnOrangeTopGrad)"
                                fillOpacity="0.88"
                                stroke="#FBBF24"
                                strokeWidth="1.1"
                              />
                              {/* Top Face grid lines */}
                              {Array.from({ length: doorCounts.lCount - 1 }).map((_, r) => {
                                const l = l0 + (r + 1) * doorOri.l;
                                if (l >= l1) return null;
                                return (
                                  <line
                                    key={`3d-door-top-l-${r}`}
                                    x1={calcX(l, w0).toFixed(1)}
                                    y1={calcY(l, w0, h1).toFixed(1)}
                                    x2={calcX(l, w1).toFixed(1)}
                                    y2={calcY(l, w1, h1).toFixed(1)}
                                    stroke="#FCD34D"
                                    strokeWidth="0.8"
                                    strokeOpacity="0.9"
                                  />
                                );
                              })}
                              {doorCounts.wCount > 1 && Array.from({ length: doorCounts.wCount - 1 }).map((_, c) => {
                                const w = w0 + (c + 1) * doorOri.w;
                                if (w >= w1) return null;
                                return (
                                  <line
                                    key={`3d-door-top-w-${c}`}
                                    x1={calcX(l0, w).toFixed(1)}
                                    y1={calcY(l0, w, h1).toFixed(1)}
                                    x2={calcX(l1, w).toFixed(1)}
                                    y2={calcY(l1, w, h1).toFixed(1)}
                                    stroke="#FCD34D"
                                    strokeWidth="0.8"
                                    strokeOpacity="0.9"
                                  />
                                );
                              })}

                              {/* Near-Side Face of tilted door cartons (at w = w1) */}
                              <polygon
                                points={`${pt(l0, w1, h1)} ${pt(l1, w1, h1)} ${pt(l1, w1, h0)} ${pt(l0, w1, h0)}`}
                                fill="url(#ctnOrangeSideGrad)"
                                fillOpacity="0.88"
                                stroke="#F59E0B"
                                strokeWidth="1.1"
                              />
                              {/* Near-Side Face grid lines */}
                              {Array.from({ length: doorCounts.hCount - 1 }).map((_, hIdx) => {
                                const h = h0 + (hIdx + 1) * doorOri.h;
                                if (h >= h1) return null;
                                return (
                                  <line
                                    key={`3d-door-side-h-${hIdx}`}
                                    x1={calcX(l0, w1).toFixed(1)}
                                    y1={calcY(l0, w1, h).toFixed(1)}
                                    x2={calcX(l1, w1).toFixed(1)}
                                    y2={calcY(l1, w1, h).toFixed(1)}
                                    stroke="#FBBF24"
                                    strokeWidth="0.8"
                                    strokeOpacity="0.9"
                                  />
                                );
                              })}
                              {Array.from({ length: doorCounts.lCount - 1 }).map((_, r) => {
                                const l = l0 + (r + 1) * doorOri.l;
                                if (l >= l1) return null;
                                return (
                                  <line
                                    key={`3d-door-side-l-${r}`}
                                    x1={calcX(l, w1).toFixed(1)}
                                    y1={calcY(l, w1, h0).toFixed(1)}
                                    x2={calcX(l, w1).toFixed(1)}
                                    y2={calcY(l, w1, h1).toFixed(1)}
                                    stroke="#FBBF24"
                                    strokeWidth="0.8"
                                    strokeOpacity="0.9"
                                  />
                                );
                              })}

                              {/* Front Face of tilted door cartons (at l = l1, closest to door opening) */}
                              <polygon
                                points={`${pt(l1, w0, h0)} ${pt(l1, w1, h0)} ${pt(l1, w1, h1)} ${pt(l1, w0, h1)}`}
                                fill="url(#ctnOrangeFrontGrad)"
                                fillOpacity="0.88"
                                stroke="#FBBF24"
                                strokeWidth="1.2"
                              />
                              {/* Front Face grid lines */}
                              {doorCounts.wCount > 1 && Array.from({ length: doorCounts.wCount - 1 }).map((_, c) => {
                                const w = w0 + (c + 1) * doorOri.w;
                                if (w >= w1) return null;
                                return (
                                  <line
                                    key={`3d-door-front-w-${c}`}
                                    x1={calcX(l1, w).toFixed(1)}
                                    y1={calcY(l1, w, h0).toFixed(1)}
                                    x2={calcX(l1, w).toFixed(1)}
                                    y2={calcY(l1, w, h1).toFixed(1)}
                                    stroke="#FCD34D"
                                    strokeWidth="0.8"
                                    strokeOpacity="0.9"
                                  />
                                );
                              })}
                              {Array.from({ length: doorCounts.hCount - 1 }).map((_, hIdx) => {
                                const h = h0 + (hIdx + 1) * doorOri.h;
                                if (h >= h1) return null;
                                return (
                                  <line
                                    key={`3d-door-front-h-${hIdx}`}
                                    x1={calcX(l1, w0).toFixed(1)}
                                    y1={calcY(l1, w0, h).toFixed(1)}
                                    x2={calcX(l1, w1).toFixed(1)}
                                    y2={calcY(l1, w1, h).toFixed(1)}
                                    stroke="#FCD34D"
                                    strokeWidth="0.8"
                                    strokeOpacity="0.9"
                                  />
                                );
                              })}
                            </g>
                          );
                        }
                      }

                      return (
                        <g>
                          {/* 1. Container Floor Base */}
                          <polygon
                            points={`${pt(0, 0, 0)} ${pt(0, contW, 0)} ${pt(doorL, contW, 0)} ${pt(doorL, 0, 0)}`}
                            fill="url(#floorGrad)"
                            stroke="#4E5564"
                            strokeWidth="1.5"
                          />

                          {/* 1m x 1m Floor Grid Lines (like reference Image 1) */}
                          {/* Meter lines across width (every 100 cm along length) */}
                          {Array.from({ length: Math.floor(doorL / 100) }).map((_, mIdx) => {
                            const mCm = (mIdx + 1) * 100;
                            return (
                              <line
                                key={`floor-m-${mIdx}`}
                                x1={calcX(mCm, 0).toFixed(1)}
                                y1={calcY(mCm, 0, 0).toFixed(1)}
                                x2={calcX(mCm, contW).toFixed(1)}
                                y2={calcY(mCm, contW, 0).toFixed(1)}
                                stroke="#38404C"
                                strokeWidth="0.8"
                              />
                            );
                          })}
                          {/* Meter lines along length (at 100 cm and 200 cm width) */}
                          {[100, 200].map((wCm) => (
                            <line
                              key={`floor-w-${wCm}`}
                              x1={calcX(0, wCm).toFixed(1)}
                              y1={calcY(0, wCm, 0).toFixed(1)}
                              x2={calcX(doorL, wCm).toFixed(1)}
                              y2={calcY(doorL, wCm, 0).toFixed(1)}
                              stroke="#38404C"
                              strokeWidth="0.8"
                            />
                          ))}

                          {/* 2. Left / Far Wall (Spanning full length along w = 0) */}
                          <polygon
                            points={`${pt(0, 0, 0)} ${pt(doorL, 0, 0)} ${pt(doorL, 0, contH)} ${pt(0, 0, contH)}`}
                            fill="#1F2329"
                            fillOpacity="0.85"
                            stroke="#47505C"
                            strokeWidth="1.2"
                          />
                          {/* Far Wall 1m Grid Lines */}
                          {Array.from({ length: Math.floor(doorL / 100) }).map((_, mIdx) => {
                            const mCm = (mIdx + 1) * 100;
                            return (
                              <line
                                key={`far-v-${mIdx}`}
                                x1={calcX(mCm, 0).toFixed(1)}
                                y1={calcY(mCm, 0, 0).toFixed(1)}
                                x2={calcX(mCm, 0).toFixed(1)}
                                y2={calcY(mCm, 0, contH).toFixed(1)}
                                stroke="#333A44"
                                strokeWidth="0.8"
                              />
                            );
                          })}
                          {[100, 200].map((hCm) => (
                            <line
                              key={`far-h-${hCm}`}
                              x1={calcX(0, 0).toFixed(1)}
                              y1={calcY(0, 0, hCm).toFixed(1)}
                              x2={calcX(doorL, 0).toFixed(1)}
                              y2={calcY(doorL, 0, hCm).toFixed(1)}
                              stroke="#333A44"
                              strokeWidth="0.8"
                            />
                          ))}
                          {/* Top Rail of Far Wall */}
                          <line
                            x1={calcX(0, 0).toFixed(1)}
                            y1={calcY(0, 0, contH).toFixed(1)}
                            x2={calcX(doorL, 0).toFixed(1)}
                            y2={calcY(doorL, 0, contH).toFixed(1)}
                            stroke="#64748B"
                            strokeWidth="2.5"
                          />

                          {/* 3. Rear Bulkhead Wall (at l = 0) */}
                          <polygon
                            points={`${pt(0, 0, 0)} ${pt(0, contW, 0)} ${pt(0, contW, contH)} ${pt(0, 0, contH)}`}
                            fill="#232830"
                            stroke="#47505C"
                            strokeWidth="1.2"
                          />
                          {/* Rear Wall Grid Lines */}
                          {[100, 200].map((wCm) => (
                            <line
                              key={`rear-v-${wCm}`}
                              x1={calcX(0, wCm).toFixed(1)}
                              y1={calcY(0, wCm, 0).toFixed(1)}
                              x2={calcX(0, wCm).toFixed(1)}
                              y2={calcY(0, wCm, contH).toFixed(1)}
                              stroke="#333A44"
                              strokeWidth="0.8"
                            />
                          ))}
                          {[100, 200].map((hCm) => (
                            <line
                              key={`rear-h-${hCm}`}
                              x1={calcX(0, 0).toFixed(1)}
                              y1={calcY(0, 0, hCm).toFixed(1)}
                              x2={calcX(0, contW).toFixed(1)}
                              y2={calcY(0, contW, hCm).toFixed(1)}
                              stroke="#333A44"
                              strokeWidth="0.8"
                            />
                          ))}
                          {/* Top Rail of Rear Wall */}
                          <line
                            x1={calcX(0, 0).toFixed(1)}
                            y1={calcY(0, 0, contH).toFixed(1)}
                            x2={calcX(0, contW).toFixed(1)}
                            y2={calcY(0, contW, contH).toFixed(1)}
                            stroke="#64748B"
                            strokeWidth="2.5"
                          />
                          {/* Rear Wall Dimension Labels (like reference Image 1) */}
                          <text
                            x={(calcX(0, 100) + 2).toFixed(1)}
                            y={(calcY(0, 100, contH) - 6).toFixed(1)}
                            fill="#94A3B8"
                            fontSize="8"
                            fontWeight="bold"
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            1 m.
                          </text>
                          <text
                            x={(calcX(0, 200) + 2).toFixed(1)}
                            y={(calcY(0, 200, contH) - 6).toFixed(1)}
                            fill="#94A3B8"
                            fontSize="8"
                            fontWeight="bold"
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            2 m.
                          </text>

                          {/* 4. Ceiling Wireframe Perimeter (Dashed guide lines) */}
                          <polygon
                            points={`${pt(0, 0, contH)} ${pt(0, contW, contH)} ${pt(doorL, contW, contH)} ${pt(doorL, 0, contH)}`}
                            fill="none"
                            stroke="#47505C"
                            strokeWidth="0.8"
                            strokeDasharray="3 3"
                            opacity="0.8"
                          />

                          {/* 5. Render Cargo Elements (Cartons) */}
                          {renderedCartonElements}

                          {/* 6. Front Door Portal Frame (at l = doorL) */}
                          {/* Bottom threshold beam */}
                          <line
                            x1={calcX(doorL, 0).toFixed(1)}
                            y1={calcY(doorL, 0, 0).toFixed(1)}
                            x2={calcX(doorL, contW).toFixed(1)}
                            y2={calcY(doorL, contW, 0).toFixed(1)}
                            stroke="#555C66"
                            strokeWidth="2.5"
                          />
                          {/* Far vertical door post */}
                          <line
                            x1={calcX(doorL, 0).toFixed(1)}
                            y1={calcY(doorL, 0, 0).toFixed(1)}
                            x2={calcX(doorL, 0).toFixed(1)}
                            y2={calcY(doorL, 0, contH).toFixed(1)}
                            stroke="#555C66"
                            strokeWidth="2.5"
                          />
                          {/* Near vertical door post (semi-transparent guide so cargo is visible) */}
                          <line
                            x1={calcX(doorL, contW).toFixed(1)}
                            y1={calcY(doorL, contW, 0).toFixed(1)}
                            x2={calcX(doorL, contW).toFixed(1)}
                            y2={calcY(doorL, contW, contH).toFixed(1)}
                            stroke="#3A4048"
                            strokeWidth="1.5"
                            strokeDasharray="3 3"
                          />
                          {/* Top door header beam (guide) */}
                          <line
                            x1={calcX(doorL, 0).toFixed(1)}
                            y1={calcY(doorL, 0, contH).toFixed(1)}
                            x2={calcX(doorL, contW).toFixed(1)}
                            y2={calcY(doorL, contW, contH).toFixed(1)}
                            stroke="#3A4048"
                            strokeWidth="1.5"
                            strokeDasharray="3 3"
                          />

                          {/* 7. Corner Castings (Steel blocks at key structural corners) */}
                          {[
                            [calcX(0, 0), calcY(0, 0, contH)],
                            [calcX(0, contW), calcY(0, contW, contH)],
                            [calcX(doorL, 0), calcY(doorL, 0, contH)],
                            [calcX(doorL, 0), calcY(doorL, 0, 0)],
                            [calcX(doorL, contW), calcY(doorL, contW, 0)],
                          ].map(([cx, cy], i) => (
                            <rect
                              key={`casting-${i}`}
                              x={cx - 3.5}
                              y={cy - 3.5}
                              width="7"
                              height="7"
                              rx="1.2"
                              fill="#474E57"
                              stroke="#68727F"
                              strokeWidth="0.8"
                            />
                          ))}

                          {/* 8. Floor Edge 1m Metric Markers (Exactly like reference Image 1) */}
                          {Array.from({ length: Math.floor(doorL / 100) }).map((_, mIdx) => {
                            const m = mIdx + 1;
                            const mCm = m * 100;
                            const px = calcX(mCm, contW);
                            const py = calcY(mCm, contW, 0);
                            return (
                              <g key={`marker-${m}`}>
                                <line
                                  x1={px.toFixed(1)}
                                  y1={py.toFixed(1)}
                                  x2={(px + 4).toFixed(1)}
                                  y2={(py + 7).toFixed(1)}
                                  stroke="#64748B"
                                  strokeWidth="1"
                                />
                                <text
                                  x={(px + 7).toFixed(1)}
                                  y={(py + 15).toFixed(1)}
                                  fill="#94A3B8"
                                  fontSize="8"
                                  fontWeight="bold"
                                  fontFamily="monospace"
                                  textAnchor="middle"
                                >
                                  {m} m.
                                </text>
                              </g>
                            );
                          })}

                          {/* Rear height markings */}
                          {[100, 200].map((hCm) => {
                            const px = calcX(0, contW);
                            const py = calcY(0, contW, hCm);
                            return (
                              <text
                                key={`h-marker-${hCm}`}
                                x={(px + 8).toFixed(1)}
                                y={(py + 3).toFixed(1)}
                                fill="#64748B"
                                fontSize="8"
                                fontWeight="bold"
                                fontFamily="monospace"
                              >
                                {hCm / 100} m.
                              </text>
                            );
                          })}

                          {/* 9. High-Tech Blueprint Dimension Leaders */}
                          {/* Width Dimension (Tilted on the same plane as the width line) */}
                          {(() => {
                            const x1 = calcX(doorL, 0) - 10;
                            const y1 = calcY(doorL, 0, 0) + 12;
                            const x2 = calcX(doorL, contW) - 10;
                            const y2 = calcY(doorL, contW, 0) + 12;
                            const dx = x2 - x1;
                            const dy = y2 - y1;
                            const len = Math.sqrt(dx * dx + dy * dy);
                            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                            // Perpendicular offset away from container (pointing downward-left)
                            const nx = -dy / len;
                            const ny = dx / len;
                            const offsetDist = 13;
                            const midX = (x1 + x2) / 2 + nx * offsetDist;
                            const midY = (y1 + y2) / 2 + ny * offsetDist;
                            return (
                              <g>
                                <path
                                  d={`M ${x1.toFixed(1)},${y1.toFixed(1)} L ${x2.toFixed(1)},${y2.toFixed(1)}`}
                                  stroke="#C7F33C"
                                  strokeWidth="1.2"
                                  strokeDasharray="3 2"
                                />
                                <text
                                  x={midX.toFixed(1)}
                                  y={midY.toFixed(1)}
                                  fill="#C7F33C"
                                  fontSize="9.5"
                                  fontWeight="bold"
                                  textAnchor="middle"
                                  transform={`rotate(${angle.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)})`}
                                  className="font-mono select-none"
                                >
                                  Width {currentContainer.widthCm} cm ({packingPlan.widthCount} ctns)
                                </text>
                              </g>
                            );
                          })()}

                          {/* Height Dimension (Vertical text aligned along height line) */}
                          {(() => {
                            const xLine = calcX(doorL, 0) - 18;
                            const yBottom = calcY(doorL, 0, 0);
                            const yTop = calcY(doorL, 0, contH);
                            const midX = xLine - 11;
                            const midY = (yBottom + yTop) / 2;
                            return (
                              <g>
                                <path
                                  d={`M ${xLine.toFixed(1)},${yBottom.toFixed(1)} L ${xLine.toFixed(1)},${yTop.toFixed(1)}`}
                                  stroke="#94A3B8"
                                  strokeWidth="1.2"
                                  strokeDasharray="3 2"
                                />
                                <text
                                  x={midX.toFixed(1)}
                                  y={midY.toFixed(1)}
                                  fill="#CBD5E1"
                                  fontSize="9.5"
                                  fontWeight="bold"
                                  textAnchor="middle"
                                  transform={`rotate(-90 ${midX.toFixed(1)} ${midY.toFixed(1)})`}
                                  className="font-mono select-none"
                                >
                                  Height {currentContainer.heightCm} cm ({packingPlan.heightCount} tiers)
                                </text>
                              </g>
                            );
                          })()}

                          {/* Depth / Length Dimension */}
                          {(() => {
                            const dOffset = 30;
                            const x1 = calcX(doorL, contW) + dOffset;
                            const y1 = calcY(doorL, contW, 0) + (dOffset * 0.5);
                            const x2 = calcX(0, contW) + dOffset;
                            const y2 = calcY(0, contW, 0) + (dOffset * 0.5);
                            const midX = (x1 + x2) / 2 + 12;
                            const midY = (y1 + y2) / 2 + 16;
                            return (
                              <g>
                                <path
                                  d={`M ${x1.toFixed(1)},${y1.toFixed(1)} L ${x2.toFixed(1)},${y2.toFixed(1)}`}
                                  stroke="#94A3B8"
                                  strokeWidth="1.2"
                                  strokeDasharray="3 2"
                                />
                                <text
                                  x={midX.toFixed(1)}
                                  y={midY.toFixed(1)}
                                  fill="#CBD5E1"
                                  fontSize="9.5"
                                  fontWeight="bold"
                                  textAnchor="middle"
                                  transform={`rotate(-21 ${midX.toFixed(1)} ${midY.toFixed(1)})`}
                                  className="font-mono select-none"
                                >
                                  Depth {currentContainer.lengthCm} cm ({packingPlan.lengthCount} rows)
                                </text>
                              </g>
                            );
                          })()}
                        </g>
                      );
                    })()}


                  </svg>
                </div>
              </div>

              {/* ============================================================== */}
              {/* 02 · 2D FRONT DOOR ELEVATION (MINIMAL CAD 1:1 SCALE)           */}
              {/* ============================================================== */}
              <div id="sim-front" className="w-full max-w-5xl mx-auto flex flex-col items-center pt-8 border-t border-[#1E2024]">
                <div className="w-full flex items-center justify-between text-xs text-slate-400 font-mono mb-2 px-1">
                  <span className="text-slate-200 font-bold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                    02 · Container Front Door Elevation ({currentContainer.widthCm} × {currentContainer.heightCm} cm)
                  </span>
                  <span className="text-[11px] text-slate-500 font-sans">
                    {packingPlan.widthCount} wide × {packingPlan.heightCount} tiers stacked = {packingPlan.cartonsPerRow} ctns per cross-section
                  </span>
                </div>
                <div className="w-full flex items-center justify-center">
                  <svg
                    viewBox="0 0 960 480"
                    className="w-full h-auto select-none"
                    style={{ filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.7))" }}
                  >
                    <defs>
                      <pattern id="modal-grid-front" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#2D3035" strokeWidth="0.6" />
                      </pattern>
                      <linearGradient id="ctnFrontGrad2D" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#739B22" />
                        <stop offset="100%" stopColor="#547514" />
                      </linearGradient>
                      <linearGradient id="ctnOrangeFrontGrad2D" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#F59E0B" />
                        <stop offset="100%" stopColor="#B45309" />
                      </linearGradient>
                    </defs>

                    {/* Canvas Background */}
                    <rect x="0" y="0" width="960" height="480" fill="url(#modal-grid-front)" rx="10" />

                    {(() => {
                      const scale = 1.15;
                      const contW = currentContainer.widthCm;
                      const contH = currentContainer.heightCm;
                      const maxContH = 269.8;
                      const contW_px = contW * scale; // 270.5 px
                      const contH_px = contH * scale; // 275.2 px (GP) or 310.3 px (HQ)

                      const originX = (960 - contW_px) / 2; // 344.75 px
                      const roadY = 428; // Road surface line
                      const floorY = 350; // Container floor level sitting on chassis
                      const roofY = floorY - contH_px;
                      const hqRoofY = floorY - maxContH * scale;

                      const ctnW_px = packingPlan.cartonUsedW * scale;
                      const ctnH_px = resolvedSpecs.cartonH * scale;
                      const Wc = packingPlan.widthCount;
                      const Hc = packingPlan.heightCount;

                      return (
                        <g>
                          {/* =================================================== */}
                          {/* 1. ROAD SURFACE & PAVEMENT BASELINE                 */}
                          {/* =================================================== */}
                          <line x1="180" y1={roadY} x2="780" y2={roadY} stroke="#3E4552" strokeWidth="1.5" />
                          <line x1="180" y1={roadY + 10} x2="780" y2={roadY + 10} stroke="#282E37" strokeWidth="1" strokeDasharray="12 8" />
                          <text x="775" y={roadY - 6} textAnchor="end" fill="#64748B" fontSize="7.5" className="font-mono">
                            ROAD SURFACE ▼
                          </text>

                          {/* =================================================== */}
                          {/* 2. TRAILER REAR CHASSIS & SUSPENSION (ใต้ตู้)       */}
                          {/* =================================================== */}
                          <g id="trailer-rear-chassis">
                            {/* Main Chassis Transverse Crossmember under container floor */}
                            <rect
                              x={originX - 6}
                              y={floorY}
                              width={contW_px + 12}
                              height="14"
                              fill="#252A32"
                              stroke="#555D6B"
                              strokeWidth="1.2"
                              rx="1"
                            />

                            {/* Heavy Vertical Chassis I-Beam Frame Rails */}
                            <rect x={originX + 32} y={floorY + 14} width="22" height="28" fill="#22262E" stroke="#47505C" strokeWidth="1" />
                            <rect x={originX + contW_px - 54} y={floorY + 14} width="22" height="28" fill="#22262E" stroke="#47505C" strokeWidth="1" />

                            {/* Heavy Round Axle Tube Connecting Left and Right Hubs */}
                            <line
                              x1={originX + 20}
                              y1="396"
                              x2={originX + contW_px - 20}
                              y2="396"
                              stroke="#38404C"
                              strokeWidth="8"
                            />

                            {/* Left Dual Wheels (ล้อคู่หลังฝั่งซ้าย) */}
                            <g id="left-dual-wheels">
                              {/* Outer Tire */}
                              <rect x={originX - 10} y="364" width="22" height={roadY - 364} rx="3" fill="#181B1F" stroke="#555D6B" strokeWidth="1.2" />
                              <line x1={originX - 3} y1="368" x2={originX - 3} y2={roadY - 4} stroke="#2D3540" strokeWidth="1" />
                              <line x1={originX + 4} y1="368" x2={originX + 4} y2={roadY - 4} stroke="#2D3540" strokeWidth="1" />

                              {/* Inner Tire */}
                              <rect x={originX + 16} y="364" width="22" height={roadY - 364} rx="3" fill="#181B1F" stroke="#555D6B" strokeWidth="1.2" />
                              <line x1={originX + 23} y1="368" x2={originX + 23} y2={roadY - 4} stroke="#2D3540" strokeWidth="1" />
                              <line x1={originX + 30} y1="368" x2={originX + 30} y2={roadY - 4} stroke="#2D3540" strokeWidth="1" />

                              {/* Wheel Hub & Spindle */}
                              <circle cx={originX + 14} cy="396" r="6" fill="#333A45" stroke="#717D91" strokeWidth="1" />
                              <circle cx={originX + 14} cy="396" r="2.5" fill="#555D6B" />

                              {/* Mud Flap (บังโคลนยาง) */}
                              <rect x={originX - 9} y="375" width="46" height="46" rx="1" fill="#1E2228" stroke="#3E4654" strokeWidth="1" />
                              <line x1={originX - 3} y1="410" x2={originX + 7} y2="420" stroke="#CBD5E1" strokeWidth="1.5" />
                              <line x1={originX + 12} y1="410" x2={originX + 22} y2="420" stroke="#CBD5E1" strokeWidth="1.5" />
                              <line x1={originX + 27} y1="410" x2={originX + 37} y2="420" stroke="#CBD5E1" strokeWidth="1.5" />
                            </g>

                            {/* Right Dual Wheels (ล้อคู่หลังฝั่งขวา) */}
                            <g id="right-dual-wheels">
                              {/* Inner Tire */}
                              <rect x={originX + contW_px - 38} y="364" width="22" height={roadY - 364} rx="3" fill="#181B1F" stroke="#555D6B" strokeWidth="1.2" />
                              <line x1={originX + contW_px - 31} y1="368" x2={originX + contW_px - 31} y2={roadY - 4} stroke="#2D3540" strokeWidth="1" />
                              <line x1={originX + contW_px - 24} y1="368" x2={originX + contW_px - 24} y2={roadY - 4} stroke="#2D3540" strokeWidth="1" />

                              {/* Outer Tire */}
                              <rect x={originX + contW_px - 12} y="364" width="22" height={roadY - 364} rx="3" fill="#181B1F" stroke="#555D6B" strokeWidth="1.2" />
                              <line x1={originX + contW_px - 5} y1="368" x2={originX + contW_px - 5} y2={roadY - 4} stroke="#2D3540" strokeWidth="1" />
                              <line x1={originX + contW_px + 2} y1="368" x2={originX + contW_px + 2} y2={roadY - 4} stroke="#2D3540" strokeWidth="1" />

                              {/* Wheel Hub & Spindle */}
                              <circle cx={originX + contW_px - 14} cy="396" r="6" fill="#333A45" stroke="#717D91" strokeWidth="1" />
                              <circle cx={originX + contW_px - 14} cy="396" r="2.5" fill="#555D6B" />

                              {/* Mud Flap (บังโคลนยาง) */}
                              <rect x={originX + contW_px - 37} y="375" width="46" height="46" rx="1" fill="#1E2228" stroke="#3E4654" strokeWidth="1" />
                              <line x1={originX + contW_px - 31} y1="410" x2={originX + contW_px - 21} y2="420" stroke="#CBD5E1" strokeWidth="1.5" />
                              <line x1={originX + contW_px - 16} y1="410" x2={originX + contW_px - 6} y2="420" stroke="#CBD5E1" strokeWidth="1.5" />
                              <line x1={originX + contW_px - 1} y1="410" x2={originX + contW_px + 9} y2="420" stroke="#CBD5E1" strokeWidth="1.5" />
                            </g>

                            {/* ICC Rear Underride Bumper Bar (กันชนท้าย) */}
                            <rect
                              x={originX - 14}
                              y="402"
                              width={contW_px + 28}
                              height="10"
                              rx="2"
                              fill="#2B323D"
                              stroke="#64748B"
                              strokeWidth="1"
                            />
                            {/* Left Tail Light LEDs */}
                            <circle cx={originX - 5} cy="407" r="2.5" fill="#EF4444" opacity="0.9" />
                            <circle cx={originX + 3} cy="407" r="2.5" fill="#F59E0B" opacity="0.9" />
                            <circle cx={originX + 11} cy="407" r="2.5" fill="#FFFFFF" opacity="0.8" />

                            {/* Right Tail Light LEDs */}
                            <circle cx={originX + contW_px - 11} cy="407" r="2.5" fill="#FFFFFF" opacity="0.8" />
                            <circle cx={originX + contW_px - 3} cy="407" r="2.5" fill="#F59E0B" opacity="0.9" />
                            <circle cx={originX + contW_px + 5} cy="407" r="2.5" fill="#EF4444" opacity="0.9" />

                            {/* Center Bumper Reflective Tape */}
                            <line
                              x1={originX + contW_px / 2 - 35}
                              y1="407"
                              x2={originX + contW_px / 2 + 35}
                              y2="407"
                              stroke="#EF4444"
                              strokeWidth="2.5"
                              strokeDasharray="6 4"
                            />
                          </g>

                          {/* =================================================== */}
                          {/* 3. OPEN CONTAINER DOORS (FOLDED 270° AT SIDES)      */}
                          {/* =================================================== */}
                          {/* Left Open Door Leaf */}
                          <g id="left-door-leaf">
                            <rect
                              x={originX - 16}
                              y={roofY}
                              width="14"
                              height={contH_px}
                              rx="1"
                              fill="#252B34"
                              stroke="#555D6B"
                              strokeWidth="1"
                            />
                            {/* Vertical Locking Bar Rods */}
                            <line x1={originX - 11} y1={roofY + 4} x2={originX - 11} y2={floorY - 4} stroke="#64748B" strokeWidth="1" />
                            <line x1={originX - 6} y1={roofY + 4} x2={originX - 6} y2={floorY - 4} stroke="#64748B" strokeWidth="1" />
                            {/* Hinges connecting to container post */}
                            {[roofY + 20, roofY + 85, floorY - 85, floorY - 20].map((hy, idx) => (
                              <rect key={`l-hinge-${idx}`} x={originX - 3} y={hy - 4} width="5" height="8" rx="1" fill="#64748B" />
                            ))}
                          </g>

                          {/* Right Open Door Leaf */}
                          <g id="right-door-leaf">
                            <rect
                              x={originX + contW_px + 2}
                              y={roofY}
                              width="14"
                              height={contH_px}
                              rx="1"
                              fill="#252B34"
                              stroke="#555D6B"
                              strokeWidth="1"
                            />
                            {/* Vertical Locking Bar Rods */}
                            <line x1={originX + contW_px + 7} y1={roofY + 4} x2={originX + contW_px + 7} y2={floorY - 4} stroke="#64748B" strokeWidth="1" />
                            <line x1={originX + contW_px + 12} y1={roofY + 4} x2={originX + contW_px + 12} y2={floorY - 4} stroke="#64748B" strokeWidth="1" />
                            {/* Hinges connecting to container post */}
                            {[roofY + 20, roofY + 85, floorY - 85, floorY - 20].map((hy, idx) => (
                              <rect key={`r-hinge-${idx}`} x={originX + contW_px - 2} y={hy - 4} width="5" height="8" rx="1" fill="#64748B" />
                            ))}
                          </g>

                          {/* =================================================== */}
                          {/* 4. CONTAINER INTERIOR OPENING & CARGO               */}
                          {/* =================================================== */}
                          <rect
                            x={originX}
                            y={roofY}
                            width={contW_px}
                            height={contH_px}
                            fill="#1A1C20"
                            stroke="#555D6B"
                            strokeWidth="1.5"
                            rx="2"
                          />

                          {/* Floor Baseline Extension */}
                          <line
                            x1={originX - 35}
                            y1={floorY}
                            x2={originX + contW_px + 35}
                            y2={floorY}
                            stroke="#2C3038"
                            strokeWidth="1.5"
                          />

                          {/* High Cube Headroom Reference Zone (Only when 40ft GP is active) */}
                          {selectedContainer === "40ft" && contH < maxContH && (
                            <g>
                              <rect
                                x={originX}
                                y={hqRoofY}
                                width={contW_px}
                                height={roofY - hqRoofY}
                                fill="#111315"
                                stroke="#2B2F36"
                                strokeWidth="1"
                                strokeDasharray="3 3"
                                rx="2"
                              />
                              <text
                                x={originX + contW_px / 2}
                                y={hqRoofY + (roofY - hqRoofY) / 2 + 3}
                                textAnchor="middle"
                                fill="#64748B"
                                fontSize="9"
                                fontWeight="bold"
                                className="font-mono"
                              >
                                +30.5 cm High Cube Headroom (40ft HQ only)
                              </text>
                            </g>
                          )}

                          {/* 1m & 2m Height Guide Lines inside Door */}
                          <g>
                            <line
                              x1={originX}
                              y1={floorY - 100 * scale}
                              x2={originX + contW_px}
                              y2={floorY - 100 * scale}
                              stroke="#1E2228"
                              strokeWidth="0.8"
                              strokeDasharray="4 4"
                            />
                            <text
                              x={originX + 6}
                              y={floorY - 100 * scale - 4}
                              fill="#475569"
                              fontSize="7.5"
                              className="font-mono"
                            >
                              1 m
                            </text>
                            <text
                              x={originX + contW_px - 6}
                              y={floorY - 100 * scale - 4}
                              textAnchor="end"
                              fill="#475569"
                              fontSize="7.5"
                              className="font-mono"
                            >
                              1 m
                            </text>

                            <line
                              x1={originX}
                              y1={floorY - 200 * scale}
                              x2={originX + contW_px}
                              y2={floorY - 200 * scale}
                              stroke="#1E2228"
                              strokeWidth="0.8"
                              strokeDasharray="4 4"
                            />
                            <text
                              x={originX + 6}
                              y={floorY - 200 * scale - 4}
                              fill="#475569"
                              fontSize="7.5"
                              className="font-mono"
                            >
                              2 m
                            </text>
                            <text
                              x={originX + contW_px - 6}
                              y={floorY - 200 * scale - 4}
                              textAnchor="end"
                              fill="#475569"
                              fontSize="7.5"
                              className="font-mono"
                            >
                              2 m
                            </text>
                          </g>

                          {/* Cartons Cross-Section Stack */}
                          {cartons > 0 && Array.from({ length: Hc }).map((_, tierIdx) => {
                            const y = floorY - (tierIdx + 1) * ctnH_px;
                            return Array.from({ length: Wc }).map((_, colIdx) => {
                              const x = originX + colIdx * ctnW_px;
                              return (
                                <rect
                                  key={`front-ctn-${tierIdx}-${colIdx}`}
                                  x={x + 0.3}
                                  y={y + 0.3}
                                  width={ctnW_px - 0.6}
                                  height={ctnH_px - 0.6}
                                  rx="0"
                                  fill="#365314"
                                  stroke="#84CC16"
                                  strokeWidth="1"
                                />
                              );
                            });
                          })}

                          {/* Overhead Gap Region & Tilted Cartons */}
                          {packingPlan.heightGapCm > 0 && (() => {
                            const hasOverTilted = cartons > 0 && showTiltedCartons && packingPlan.overheadTilted.totalCartons > 0 && packingPlan.overheadTilted.cartonOrientation;
                            const gapH_px = packingPlan.heightGapCm * scale;
                            const topCargoY = floorY - Hc * ctnH_px;
                            const ohOri = packingPlan.overheadTilted.cartonOrientation;
                            const ohCounts = packingPlan.overheadTilted.counts;
                            const th = (ohOri?.h || 0) * scale;
                            const totalOhH = ohCounts.hCount * th;

                            return (
                              <g id="front-overhead-gap-region">
                                {/* Dashed Clearance Boundary */}
                                <rect
                                  x={originX}
                                  y={roofY}
                                  width={contW_px}
                                  height={gapH_px}
                                  fill="rgba(245, 158, 11, 0.04)"
                                  stroke="#F59E0B"
                                  strokeWidth="0.8"
                                  strokeDasharray="3 3"
                                />

                                {/* Render Tilted Cartons in Overhead Gap - Resting directly on top of green cargo! */}
                                {hasOverTilted && ohOri && (
                                  <g id="front-tilted-overhead-cartons">
                                    {Array.from({ length: ohCounts.hCount }).map((_, ohIdx) => {
                                      const ty = topCargoY - (ohIdx + 1) * th;
                                      return Array.from({ length: Math.min(ohCounts.wCount, 30) }).map((_, owIdx) => {
                                        const tx = originX + owIdx * (ohOri.w * scale);
                                        const tw = ohOri.w * scale;
                                        return (
                                          <rect
                                            key={`front-oh-ctn-${ohIdx}-${owIdx}`}
                                            x={tx + 0.3}
                                            y={ty + 0.3}
                                            width={tw - 0.6}
                                            height={th - 0.6}
                                            rx="0"
                                            fill="#9A3412"
                                            stroke="#FBBF24"
                                            strokeWidth="1"
                                          />
                                        );
                                      });
                                    })}
                                  </g>
                                )}

                                {/* Overhead Gap Label with Non-Colliding HUD Pill Badge (Moved Outside to the Right) */}
                                {(() => {
                                  const ohText = hasOverTilted
                                    ? `Tilted Overhead: +${packingPlan.overheadTilted.totalCartons} ctns (${packingPlan.heightGapCm} cm)`
                                    : `Overhead Gap: ${packingPlan.heightGapCm} cm`;
                                  const badgeLen = Math.max(76, ohText.length * 5.1 + 16);
                                  const badgeY = hasOverTilted
                                    ? topCargoY - totalOhH / 2
                                    : roofY + gapH_px / 2;
                                  const calloutX = originX + contW_px + 28;

                                  return (
                                    <g id="front-overhead-badge">
                                      {/* Exterior Leader Line connecting gap to outside badge */}
                                      <line
                                        x1={originX + contW_px}
                                        y1={badgeY}
                                        x2={calloutX - 4}
                                        y2={badgeY}
                                        stroke="#F59E0B"
                                        strokeWidth="1"
                                      />
                                      <circle cx={originX + contW_px} cy={badgeY} r="2" fill="#F59E0B" />
                                      <rect
                                        x={calloutX}
                                        y={badgeY - 9}
                                        width={badgeLen}
                                        height="18"
                                        rx="4"
                                        fill="#0B0D0F"
                                        fillOpacity="0.95"
                                        stroke="#F59E0B"
                                        strokeWidth="0.9"
                                      />
                                      <text
                                        x={calloutX + badgeLen / 2}
                                        y={badgeY + 3.2}
                                        textAnchor="middle"
                                        fill="#FEF08A"
                                        fontSize="7.5"
                                        fontWeight="bold"
                                        className="font-mono"
                                      >
                                        {ohText}
                                      </text>
                                    </g>
                                  );
                                })()}
                              </g>
                            );
                          })()}

                          {/* Side Gap Region & Tilted Cartons */}
                          {packingPlan.widthGapCm > 0 && (() => {
                            const sideGapX = originX + Wc * ctnW_px;
                            const sideGapW = contW_px - Wc * ctnW_px;
                            const cargoH = Hc * ctnH_px;
                            const hasSideTilted = cartons > 0 && showTiltedCartons && packingPlan.sideTilted.totalCartons > 0 && packingPlan.sideTilted.cartonOrientation;
                            return (
                              <g id="front-side-gap-region">
                                <rect
                                  x={sideGapX}
                                  y={floorY - cargoH}
                                  width={sideGapW}
                                  height={cargoH}
                                  fill="rgba(245, 158, 11, 0.08)"
                                  stroke="#F59E0B"
                                  strokeWidth="0.8"
                                  strokeDasharray={hasSideTilted ? "none" : "3 3"}
                                />

                                {/* Render Tilted Cartons in Side Gap */}
                                {hasSideTilted && (
                                  <g id="front-tilted-side-cartons">
                                    {Array.from({ length: packingPlan.sideTilted.counts.hCount }).map((_, thIdx) => {
                                      const ty = floorY - (thIdx + 1) * (packingPlan.sideTilted.cartonOrientation!.h * scale);
                                      const th = packingPlan.sideTilted.cartonOrientation!.h * scale;
                                      return Array.from({ length: packingPlan.sideTilted.counts.wCount }).map((_, twIdx) => {
                                        const tx = sideGapX + twIdx * (packingPlan.sideTilted.cartonOrientation!.w * scale);
                                        const tw = packingPlan.sideTilted.cartonOrientation!.w * scale;
                                        return (
                                          <rect
                                            key={`front-side-tilted-${thIdx}-${twIdx}`}
                                            x={tx + 0.3}
                                            y={ty + 0.3}
                                            width={tw - 0.6}
                                            height={th - 0.6}
                                            rx="0"
                                            fill="#9A3412"
                                            stroke="#FBBF24"
                                            strokeWidth="1"
                                          />
                                        );
                                      });
                                    })}
                                  </g>
                                )}

                                {/* Side Gap Label with Non-Colliding HUD Pill Badge (Moved Outside to the Right) */}
                                {(() => {
                                  const sideText = hasSideTilted
                                    ? `Tilted Side: +${packingPlan.sideTilted.totalCartons} ctns (${packingPlan.widthGapCm} cm)`
                                    : `Side Gap: ${packingPlan.widthGapCm} cm`;
                                  const badgeLen = Math.max(76, sideText.length * 5.1 + 16);
                                  const badgeCenterY = floorY - cargoH / 2;
                                  const calloutX = originX + contW_px + 28;

                                  return (
                                    <g id="front-side-gap-badge">
                                      {/* Exterior Leader Line connecting side gap to outside badge */}
                                      <line
                                        x1={originX + contW_px}
                                        y1={badgeCenterY}
                                        x2={calloutX - 4}
                                        y2={badgeCenterY}
                                        stroke="#F59E0B"
                                        strokeWidth="1"
                                      />
                                      <circle cx={originX + contW_px} cy={badgeCenterY} r="2" fill="#F59E0B" />
                                      <rect
                                        x={calloutX}
                                        y={badgeCenterY - 9}
                                        width={badgeLen}
                                        height="18"
                                        rx="4"
                                        fill="#0B0D0F"
                                        fillOpacity="0.95"
                                        stroke="#F59E0B"
                                        strokeWidth="0.9"
                                      />
                                      <text
                                        x={calloutX + badgeLen / 2}
                                        y={badgeCenterY + 3.2}
                                        textAnchor="middle"
                                        fill="#FEF08A"
                                        fontSize="7.5"
                                        fontWeight="bold"
                                        className="font-mono"
                                      >
                                        {sideText}
                                      </text>
                                    </g>
                                  );
                                })()}
                              </g>
                            );
                          })()}

                          {/* Door Gap Region & Tilted Cartons (Front Doorway Foreground) */}
                          {packingPlan.lengthGapCm > 0 && (() => {
                            const hasDoorTilted = cartons > 0 && showTiltedCartons && packingPlan.doorTilted.totalCartons > 0 && packingPlan.doorTilted.cartonOrientation;
                            const doorOri = packingPlan.doorTilted.cartonOrientation;
                            const doorCounts = packingPlan.doorTilted.counts;
                            const th = (doorOri?.h || 0) * scale;
                            const totalDoorH = doorCounts.hCount * th;

                            return (
                              <g id="front-door-gap-region">
                                {/* Render Tilted Cartons at the Doorway (Sitting directly in front of the green cargo) */}
                                {hasDoorTilted && doorOri && (
                                  <g id="front-tilted-door-cartons">
                                    {/* Semi-transparent bounding zone to highlight Door Gap loading area */}
                                    <rect
                                      x={originX}
                                      y={floorY - totalDoorH}
                                      width={doorCounts.wCount * (doorOri.w * scale)}
                                      height={totalDoorH}
                                      fill="rgba(245, 158, 11, 0.12)"
                                      stroke="#F59E0B"
                                      strokeWidth="1.2"
                                      strokeDasharray="4 2"
                                    />
                                    {Array.from({ length: doorCounts.hCount }).map((_, dhIdx) => {
                                      const ty = floorY - (dhIdx + 1) * th;
                                      return Array.from({ length: Math.min(doorCounts.wCount, 30) }).map((_, dwIdx) => {
                                        const tx = originX + dwIdx * (doorOri.w * scale);
                                        const tw = doorOri.w * scale;
                                        return (
                                          <rect
                                            key={`front-door-ctn-${dhIdx}-${dwIdx}`}
                                            x={tx + 0.3}
                                            y={ty + 0.3}
                                            width={tw - 0.6}
                                            height={th - 0.6}
                                            rx="0"
                                            fill="#9A3412"
                                            fillOpacity="0.9"
                                            stroke="#FBBF24"
                                            strokeWidth="1"
                                          />
                                        );
                                      });
                                    })}
                                  </g>
                                )}

                                {/* Door Gap Label with Non-Colliding HUD Pill Badge (Below Side Gap on Right) */}
                                {(() => {
                                  const doorText = hasDoorTilted
                                    ? `Tilted Door: +${packingPlan.doorTilted.totalCartons} ctns (${packingPlan.lengthGapCm} cm)`
                                    : `Door Gap: ${packingPlan.lengthGapCm} cm`;
                                  const badgeLen = Math.max(76, doorText.length * 5.1 + 16);
                                  const badgeDoorY = floorY - 26;
                                  const calloutX = originX + contW_px + 28;

                                  return (
                                    <g id="front-door-gap-badge">
                                      {/* Exterior Leader Line connecting door threshold to outside badge */}
                                      <line
                                        x1={originX + contW_px}
                                        y1={badgeDoorY}
                                        x2={calloutX - 4}
                                        y2={badgeDoorY}
                                        stroke="#F59E0B"
                                        strokeWidth="1"
                                      />
                                      <circle cx={originX + contW_px} cy={badgeDoorY} r="2" fill="#F59E0B" />
                                      <rect
                                        x={calloutX}
                                        y={badgeDoorY - 9}
                                        width={badgeLen}
                                        height="18"
                                        rx="4"
                                        fill="#0B0D0F"
                                        fillOpacity="0.95"
                                        stroke="#F59E0B"
                                        strokeWidth="0.9"
                                      />
                                      <text
                                        x={calloutX + badgeLen / 2}
                                        y={badgeDoorY + 3.2}
                                        textAnchor="middle"
                                        fill="#FEF08A"
                                        fontSize="7.5"
                                        fontWeight="bold"
                                        className="font-mono"
                                      >
                                        {doorText}
                                      </text>
                                    </g>
                                  );
                                })()}
                              </g>
                            );
                          })()}

                          {/* Bottom Width Dimension Line (Below Road Surface) */}
                          <g>
                            <line
                              x1={originX}
                              y1={roadY + 24}
                              x2={originX + contW_px}
                              y2={roadY + 24}
                              stroke="#C7F33C"
                              strokeWidth="1.2"
                            />
                            <line
                              x1={originX}
                              y1={roadY + 18}
                              x2={originX}
                              y2={roadY + 30}
                              stroke="#C7F33C"
                              strokeWidth="1.2"
                            />
                            <line
                              x1={originX + contW_px}
                              y1={roadY + 18}
                              x2={originX + contW_px}
                              y2={roadY + 30}
                              stroke="#C7F33C"
                              strokeWidth="1.2"
                            />
                            <text
                              x={originX + contW_px / 2}
                              y={roadY + 39}
                              textAnchor="middle"
                              fill="#C7F33C"
                              fontSize="9"
                              fontWeight="bold"
                              className="font-mono"
                            >
                              Width {contW} cm ({Wc} ctns × {packingPlan.cartonUsedW} cm)
                            </text>
                          </g>

                          {/* Left Height Dimension Line */}
                          <g>
                            <line
                              x1={originX - 35}
                              y1={roofY}
                              x2={originX - 35}
                              y2={floorY}
                              stroke="#94A3B8"
                              strokeWidth="1.2"
                            />
                            <line
                              x1={originX - 40}
                              y1={roofY}
                              x2={originX - 30}
                              y2={roofY}
                              stroke="#94A3B8"
                              strokeWidth="1.2"
                            />
                            <line
                              x1={originX - 40}
                              y1={floorY}
                              x2={originX - 30}
                              y2={floorY}
                              stroke="#94A3B8"
                              strokeWidth="1.2"
                            />
                            <text
                              x={originX - 44}
                              y={(roofY + floorY) / 2}
                              textAnchor="middle"
                              fill="#CBD5E1"
                              fontSize="9"
                              fontWeight="bold"
                              className="font-mono"
                              transform={`rotate(-90 ${originX - 44} ${(roofY + floorY) / 2})`}
                            >
                              Height {contH} cm ({Hc} tiers × {resolvedSpecs.cartonH} cm)
                            </text>
                          </g>
                        </g>
                      );
                    })()}

                  </svg>
                </div>
              </div>

              {/* ============================================================== */}
              {/* 03 · 2D TOP VIEW (BIRD'S-EYE FLOOR PLAN 1:1 CAD)               */}
              {/* ============================================================== */}
              <div id="sim-top" className="w-full max-w-5xl mx-auto flex flex-col items-center pt-8 border-t border-[#1E2024]">
                <div className="w-full flex items-center justify-between text-xs text-slate-400 font-mono mb-2 px-1">
                  <span className="text-slate-200 font-bold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                    03 · Top Bird&apos;s-Eye Floor Plan ({currentContainer.lengthCm} × {currentContainer.widthCm} cm)
                  </span>
                  <span className="text-[11px] text-slate-500 font-sans">
                    {packingPlan.lengthCount} length × {packingPlan.widthCount} width = {packingPlan.lengthCount * packingPlan.widthCount} floor positions
                  </span>
                </div>
                <div className="w-full flex items-center justify-center">
                  <svg
                    viewBox="0 0 960 480"
                    className="w-full h-auto select-none"
                    style={{ filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.7))" }}
                  >
                    <defs>
                      <pattern id="modal-grid-top" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#2D3035" strokeWidth="0.6" />
                      </pattern>
                      <linearGradient id="ctnTopGrad2D" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#82AB27" />
                        <stop offset="100%" stopColor="#6C921C" />
                      </linearGradient>
                      <linearGradient id="ctnOrangeTopGrad2D" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#F59E0B" />
                        <stop offset="100%" stopColor="#B45309" />
                      </linearGradient>
                    </defs>

                    {/* Canvas Background */}
                    <rect x="0" y="0" width="960" height="480" fill="url(#modal-grid-top)" rx="10" />

                    {(() => {
                      const maxContL = 1203.2;
                      const contL = currentContainer.lengthCm;
                      const contW = currentContainer.widthCm;
                      const scale = 0.56; // 0.56 px/cm matches Side View exactly

                      const originX = 195; // Container front bulkhead
                      const contL_px = contL * scale;
                      const contW_px = contW * scale; // 131.7 px

                      const centerY = 240;
                      const originY = centerY - contW_px / 2; // 174.15 px
                      const floorBottomY = originY + contW_px; // 305.85 px
                      const doorX = originX + contL_px;

                      const ctnL_px = packingPlan.cartonUsedL * scale;
                      const ctnW_px = packingPlan.cartonUsedW * scale;
                      const Lc = packingPlan.lengthCount;
                      const Wc = packingPlan.widthCount;
                      const Hc = packingPlan.heightCount;

                      const fullRows = packingPlan.fullRows;
                      const remCartons = cartons % packingPlan.cartonsPerRow;

                      return (
                        <g>
                          {/* =================================================== */}
                          {/* 1. TRACTOR CAB (BIRD'S EYE TOP-DOWN SILHOUETTE)     */}
                          {/* =================================================== */}
                          <g id="tractor-cab-top">
                            {/* Steer Tires (Left & Right) */}
                            <rect x="62" y={originY - 6} width="24" height="11" rx="2" fill="#181B1F" stroke="#555D6B" strokeWidth="1.2" />
                            <rect x="62" y={floorBottomY - 5} width="24" height="11" rx="2" fill="#181B1F" stroke="#555D6B" strokeWidth="1.2" />

                            {/* Tandem Drive Dual Tires (Axle 1) */}
                            <rect x="128" y={originY - 8} width="20" height="13" rx="2" fill="#181B1F" stroke="#555D6B" strokeWidth="1.2" />
                            <rect x="128" y={floorBottomY - 5} width="20" height="13" rx="2" fill="#181B1F" stroke="#555D6B" strokeWidth="1.2" />

                            {/* Tandem Drive Dual Tires (Axle 2) */}
                            <rect x="178" y={originY - 8} width="20" height="13" rx="2" fill="#181B1F" stroke="#555D6B" strokeWidth="1.2" />
                            <rect x="178" y={floorBottomY - 5} width="20" height="13" rx="2" fill="#181B1F" stroke="#555D6B" strokeWidth="1.2" />

                            {/* Chassis Rails between axles */}
                            <rect x="50" y={centerY - 22} width="160" height="44" fill="#22262E" stroke="#47505C" strokeWidth="1" />

                            {/* Fifth Wheel Hitch Disk */}
                            <circle cx="163" cy={centerY} r="10" fill="#333A45" stroke="#717D91" strokeWidth="1" />
                            <circle cx="163" cy={centerY} r="3" fill="#555D6B" />

                            {/* Main Cab Body Shell */}
                            <rect
                              x="54"
                              y={originY + 5}
                              width="118"
                              height={contW_px - 10}
                              rx="3"
                              fill="#2B303A"
                              stroke="#64748B"
                              strokeWidth="1.2"
                            />

                            {/* Front Rounded Bumper */}
                            <rect
                              x="46"
                              y={originY + 2}
                              width="8"
                              height={contW_px - 4}
                              rx="3"
                              fill="#333A45"
                              stroke="#64748B"
                              strokeWidth="1"
                            />
                            {/* Headlights on bumper */}
                            <rect x="47" y={originY + 6} width="4" height="12" rx="1" fill="#C7F33C" opacity="0.8" />
                            <rect x="47" y={floorBottomY - 18} width="4" height="12" rx="1" fill="#C7F33C" opacity="0.8" />

                            {/* Curved Windshield (Top-Down Arc) */}
                            <path
                              d={`
                                M 92,${originY + 8}
                                Q 106,${centerY} 92,${floorBottomY - 8}
                                L 106,${floorBottomY - 8}
                                Q 118,${centerY} 106,${originY + 8}
                                Z
                              `}
                              fill="#16202A"
                              stroke="#3B4C60"
                              strokeWidth="1"
                            />

                            {/* Aerodynamic Roof Channels */}
                            <line x1="112" y1={centerY - 20} x2="168" y2={centerY - 20} stroke="#383F4C" strokeWidth="1.5" />
                            <line x1="112" y1={centerY} x2="168" y2={centerY} stroke="#383F4C" strokeWidth="1.5" />
                            <line x1="112" y1={centerY + 20} x2="168" y2={centerY + 20} stroke="#383F4C" strokeWidth="1.5" />

                            {/* Side Rearview Mirrors (Top & Bottom wings) */}
                            <line x1="94" y1={originY + 5} x2="94" y2={originY - 14} stroke="#64748B" strokeWidth="1.2" />
                            <rect x="88" y={originY - 18} width="12" height="5" rx="1" fill="#2B303A" stroke="#64748B" strokeWidth="0.8" />

                            <line x1="94" y1={floorBottomY - 5} x2="94" y2={floorBottomY + 14} stroke="#64748B" strokeWidth="1.2" />
                            <rect x="88" y={floorBottomY + 13} width="12" height="5" rx="1" fill="#2B303A" stroke="#64748B" strokeWidth="0.8" />

                            {/* Tractor Cab Label */}
                            <text x="135" y={centerY + 3} textAnchor="middle" fill="#94A3B8" fontSize="7.5" fontWeight="bold" className="font-mono">
                              TRACTOR CAB
                            </text>
                          </g>

                          {/* =================================================== */}
                          {/* 2. TRAILER REAR TRIDEM TIRES & BUMPER               */}
                          {/* =================================================== */}
                          <g id="trailer-rear-top">
                            {/* Tridem Dual Wheels peeking under container corners */}
                            {[doorX - 110, doorX - 62, doorX - 14].map((wx, idx) => (
                              <g key={`top-axle-${idx}`}>
                                <rect x={wx - 10} y={originY - 7} width="20" height="12" rx="2" fill="#181B1F" stroke="#555D6B" strokeWidth="1" />
                                <rect x={wx - 10} y={floorBottomY - 5} width="20" height="12" rx="2" fill="#181B1F" stroke="#555D6B" strokeWidth="1" />
                              </g>
                            ))}

                            {/* Rear Underride Bumper Tube */}
                            <line x1={doorX + 2} y1={originY - 4} x2={doorX + 2} y2={floorBottomY + 4} stroke="#64748B" strokeWidth="2.5" />
                            <circle cx={doorX + 2} cy={originY + 2} r="2.5" fill="#EF4444" opacity="0.9" />
                            <circle cx={doorX + 2} cy={floorBottomY - 2} r="2.5" fill="#EF4444" opacity="0.9" />

                            {/* Open Container Door Leaves folded flat against side walls */}
                            <line x1={doorX - 70} y1={originY - 3} x2={doorX} y2={originY - 3} stroke="#717D91" strokeWidth="1.5" strokeDasharray="3 2" />
                            <line x1={doorX - 70} y1={floorBottomY + 3} x2={doorX} y2={floorBottomY + 3} stroke="#717D91" strokeWidth="1.5" strokeDasharray="3 2" />
                          </g>

                          {/* =================================================== */}
                          {/* 3. CONTAINER FLOOR PERIMETER & CARGO STACKS        */}
                          {/* =================================================== */}
                          <rect
                            x={originX}
                            y={originY}
                            width={contL_px}
                            height={contW_px}
                            fill="#1A1C20"
                            stroke="#555D6B"
                            strokeWidth="1.5"
                            rx="2"
                          />

                          {/* Front Bulkhead Wall Beam (Left - Facing Tractor) */}
                          <line
                            x1={originX}
                            y1={originY - 8}
                            x2={originX}
                            y2={floorBottomY + 8}
                            stroke="#64748B"
                            strokeWidth="2.5"
                          />
                          <text
                            x={originX - 8}
                            y={originY - 10}
                            textAnchor="end"
                            fill="#94A3B8"
                            fontSize="8.5"
                            fontWeight="bold"
                            className="font-mono"
                          >
                            FRONT BULKHEAD ►
                          </text>

                          {/* Door Opening Beam (Right - Loading Door) */}
                          <line
                            x1={doorX}
                            y1={originY - 8}
                            x2={doorX}
                            y2={floorBottomY + 8}
                            stroke="#64748B"
                            strokeWidth="2.5"
                          />
                          <text
                            x={contL < maxContL ? doorX + 10 : doorX - 10}
                            y={originY - 10}
                            textAnchor={contL < maxContL ? "start" : "end"}
                            fill="#94A3B8"
                            fontSize="8.5"
                            fontWeight="bold"
                            className="font-mono"
                          >
                            {contL < maxContL ? "◄ CONTAINER DOORS (REAR)" : "CONTAINER DOORS (REAR) ►"}
                          </text>

                          {/* 1m Meter Tick Markers along container length */}
                          {Array.from({ length: Math.floor(contL / 100) }).map((_, i) => {
                            const meter = i + 1;
                            const xm = originX + meter * 100 * scale;
                            return (
                              <g key={`top-meter-${meter}`}>
                                <line
                                  x1={xm}
                                  y1={floorBottomY}
                                  x2={xm}
                                  y2={floorBottomY + 5}
                                  stroke="#3E444D"
                                  strokeWidth="1"
                                />
                                <text
                                  x={xm}
                                  y={floorBottomY + 16}
                                  textAnchor="middle"
                                  fill="#64748B"
                                  fontSize="7"
                                  className="font-mono"
                                >
                                  {meter}m
                                </text>
                              </g>
                            );
                          })}

                          {/* Carton Floor Grid Stacks */}
                          {(() => {
                            const sideGapH = contW_px - Wc * ctnW_px;
                            return Array.from({ length: Lc }).map((_, rIdx) => {
                              const x = originX + rIdx * ctnL_px;
                              const isFull = rIdx < fullRows;
                              const isPartial = rIdx === fullRows && packingPlan.partialRowProgress > 0;

                              return Array.from({ length: Wc }).map((_, cIdx) => {
                                // Aligned to bottom of container (Left side of vehicle):
                                const y = originY + sideGapH + cIdx * ctnW_px;
                                let tiers = 0;
                                if (isFull) {
                                  tiers = Hc;
                                } else if (isPartial) {
                                  const base = Math.floor(remCartons / Wc);
                                  const extra = cIdx < remCartons % Wc ? 1 : 0;
                                  tiers = base + extra;
                                }

                                if (tiers === 0) return null;

                                return (
                                  <g key={`top-ctn-${rIdx}-${cIdx}`}>
                                    <rect
                                      x={x + 0.3}
                                      y={y + 0.3}
                                      width={ctnL_px - 0.6}
                                      height={ctnW_px - 0.6}
                                      rx="0"
                                      fill="#365314"
                                      stroke="#84CC16"
                                      strokeWidth="1"
                                    />
                                    {/* Show tier badge only on the lead reference carton or on irregular partial rows */}
                                    {(isPartial || (rIdx === 0 && cIdx === 0)) && (
                                      <text
                                        x={x + ctnL_px / 2}
                                        y={y + ctnW_px / 2 + 2.5}
                                        textAnchor="middle"
                                        fill="#FFFFFF"
                                        fontSize="7"
                                        fontWeight="bold"
                                        className="font-mono"
                                      >
                                        {tiers}x
                                      </text>
                                    )}
                                  </g>
                                );
                              });
                            });
                          })()}

                          {/* Door Clearance Gap Region & Tilted Cartons */}
                          {packingPlan.lengthGapCm > 0 && (() => {
                            const cargoEndX = originX + Lc * ctnL_px;
                            const gapW = doorX - cargoEndX;
                            const hasDoorTilted = cartons > 0 && showTiltedCartons && packingPlan.doorTilted.totalCartons > 0 && packingPlan.doorTilted.cartonOrientation;
                            const doorText = hasDoorTilted
                              ? `Tilted Door: +${packingPlan.doorTilted.totalCartons} ctns (${packingPlan.lengthGapCm} cm)`
                              : `Door Clearance: ${packingPlan.lengthGapCm} cm`;
                            const badgeLen = Math.max(80, doorText.length * 5.1 + 16);

                            return (
                              <g id="top-door-gap-region">
                                <rect
                                  x={cargoEndX}
                                  y={originY}
                                  width={gapW}
                                  height={contW_px}
                                  fill="rgba(245, 158, 11, 0.08)"
                                  stroke="#F59E0B"
                                  strokeWidth="0.8"
                                  strokeDasharray={hasDoorTilted ? "none" : "3 3"}
                                />

                                {/* Render Tilted Cartons in Door Gap */}
                                {hasDoorTilted && (
                                  <g id="top-tilted-door-cartons">
                                    {Array.from({ length: packingPlan.doorTilted.counts.lCount }).map((_, dlIdx) => {
                                      const tx = cargoEndX + dlIdx * (packingPlan.doorTilted.cartonOrientation!.l * scale);
                                      const tw = packingPlan.doorTilted.cartonOrientation!.l * scale;
                                      return Array.from({ length: packingPlan.doorTilted.counts.wCount }).map((_, dwIdx) => {
                                        const ty = originY + dwIdx * (packingPlan.doorTilted.cartonOrientation!.w * scale);
                                        const th = packingPlan.doorTilted.cartonOrientation!.w * scale;
                                        return (
                                          <rect
                                            key={`top-door-tilted-${dlIdx}-${dwIdx}`}
                                            x={tx + 0.3}
                                            y={ty + 0.3}
                                            width={tw - 0.6}
                                            height={th - 0.6}
                                            rx="0"
                                            fill="#9A3412"
                                            stroke="#FBBF24"
                                            strokeWidth="1"
                                          />
                                        );
                                      });
                                    })}
                                  </g>
                                )}

                                {/* Door Gap Label with Non-Colliding HUD Pill Badge (Moved Outside Rear Door) */}
                                <g transform={`rotate(-90 ${doorX + 16} ${centerY})`}>
                                  <rect
                                    x={doorX + 16 - badgeLen / 2}
                                    y={centerY - 9}
                                    width={badgeLen}
                                    height="18"
                                    rx="4"
                                    fill="#0B0D0F"
                                    fillOpacity="0.95"
                                    stroke="#F59E0B"
                                    strokeWidth="0.9"
                                  />
                                  <text
                                    x={doorX + 16}
                                    y={centerY + 3.2}
                                    textAnchor="middle"
                                    fill="#FEF08A"
                                    fontSize="7.5"
                                    fontWeight="bold"
                                    className="font-mono"
                                  >
                                    {doorText}
                                  </text>
                                </g>
                              </g>
                            );
                          })()}

                          {/* Side Gap Region & Tilted Cartons in Top View (Top side of container = Right side of vehicle) */}
                          {packingPlan.widthGapCm > 0 && (() => {
                            const sideGapY = originY; // Top of container canvas!
                            const sideGapH = contW_px - Wc * ctnW_px;
                            const cargoL = Lc * ctnL_px;
                            const hasSideTilted = cartons > 0 && showTiltedCartons && packingPlan.sideTilted.totalCartons > 0 && packingPlan.sideTilted.cartonOrientation;
                            const sideText = hasSideTilted
                              ? `Tilted Side: +${packingPlan.sideTilted.totalCartons} ctns (${packingPlan.widthGapCm} cm)`
                              : `Side Gap: ${packingPlan.widthGapCm} cm`;
                            const badgeLen = Math.max(76, sideText.length * 5.1 + 16);

                            return (
                              <g id="top-side-gap-region">
                                <rect
                                  x={originX}
                                  y={sideGapY}
                                  width={cargoL}
                                  height={sideGapH}
                                  fill="rgba(245, 158, 11, 0.08)"
                                  stroke="#F59E0B"
                                  strokeWidth="0.8"
                                  strokeDasharray={hasSideTilted ? "none" : "3 3"}
                                />

                                {/* Render Tilted Cartons along side gap in Top View */}
                                {hasSideTilted && (
                                  <g id="top-tilted-side-cartons">
                                    {Array.from({ length: Math.min(packingPlan.sideTilted.counts.lCount, 60) }).map((_, slIdx) => {
                                      const tx = originX + slIdx * (packingPlan.sideTilted.cartonOrientation!.l * scale);
                                      const tw = packingPlan.sideTilted.cartonOrientation!.l * scale;
                                      return Array.from({ length: packingPlan.sideTilted.counts.wCount }).map((_, swIdx) => {
                                        const ty = sideGapY + swIdx * (packingPlan.sideTilted.cartonOrientation!.w * scale);
                                        const th = packingPlan.sideTilted.cartonOrientation!.w * scale;
                                        return (
                                          <rect
                                            key={`top-side-tilted-${slIdx}-${swIdx}`}
                                            x={tx + 0.3}
                                            y={ty + 0.3}
                                            width={tw - 0.6}
                                            height={th - 0.6}
                                            rx="0"
                                            fill="#9A3412"
                                            stroke="#FBBF24"
                                            strokeWidth="1"
                                          />
                                        );
                                      });
                                    })}
                                  </g>
                                )}

                                {/* Side Gap Label with Non-Colliding HUD Pill Badge (Moved Outside Container Top Wall) */}
                                <g id="top-side-gap-badge">
                                  {/* Small leader tick connecting top wall to exterior badge */}
                                  <line
                                    x1={originX + cargoL / 2}
                                    y1={sideGapY}
                                    x2={originX + cargoL / 2}
                                    y2={sideGapY - 24}
                                    stroke="#F59E0B"
                                    strokeWidth="1"
                                  />
                                  <circle cx={originX + cargoL / 2} cy={sideGapY} r="2" fill="#F59E0B" />
                                  <rect
                                    x={originX + cargoL / 2 - badgeLen / 2}
                                    y={sideGapY - 42}
                                    width={badgeLen}
                                    height="18"
                                    rx="4"
                                    fill="#0B0D0F"
                                    fillOpacity="0.95"
                                    stroke="#F59E0B"
                                    strokeWidth="0.9"
                                  />
                                  <text
                                    x={originX + cargoL / 2}
                                    y={sideGapY - 30}
                                    textAnchor="middle"
                                    fill="#FEF08A"
                                    fontSize="7.5"
                                    fontWeight="bold"
                                    className="font-mono"
                                  >
                                    {sideText}
                                  </text>
                                </g>
                              </g>
                            );
                          })()}

                          {/* Top Length Dimension Line */}
                          <g>
                            <line
                              x1={originX}
                              y1={originY - 60}
                              x2={doorX}
                              y2={originY - 60}
                              stroke="#CBD5E1"
                              strokeWidth="1.2"
                            />
                            <line
                              x1={originX}
                              y1={originY - 66}
                              x2={originX}
                              y2={originY - 54}
                              stroke="#CBD5E1"
                              strokeWidth="1.2"
                            />
                            <line
                              x1={doorX}
                              y1={originY - 66}
                              x2={doorX}
                              y2={originY - 54}
                              stroke="#CBD5E1"
                              strokeWidth="1.2"
                            />
                            <text
                              x={(originX + doorX) / 2}
                              y={originY - 70}
                              textAnchor="middle"
                              fill="#CBD5E1"
                              fontSize="9"
                              fontWeight="bold"
                              className="font-mono"
                            >
                              Length {contL} cm ({Lc} rows × {packingPlan.cartonUsedL} cm)
                            </text>
                          </g>

                          {/* Right Width Dimension Line (Cleanly shifted to accommodate exterior door badge) */}
                          <g>
                            <line
                              x1={doorX + 38}
                              y1={originY}
                              x2={doorX + 38}
                              y2={floorBottomY}
                              stroke="#C7F33C"
                              strokeWidth="1.2"
                            />
                            <line
                              x1={doorX + 32}
                              y1={originY}
                              x2={doorX + 44}
                              y2={originY}
                              stroke="#C7F33C"
                              strokeWidth="1.2"
                            />
                            <line
                              x1={doorX + 32}
                              y1={floorBottomY}
                              x2={doorX + 44}
                              y2={floorBottomY}
                              stroke="#C7F33C"
                              strokeWidth="1.2"
                            />
                            <text
                              x={doorX + 52}
                              y={centerY}
                              textAnchor="middle"
                              fill="#C7F33C"
                              fontSize="9"
                              fontWeight="bold"
                              className="font-mono"
                              transform={`rotate(90 ${doorX + 52} ${centerY})`}
                            >
                              Width {contW} cm ({Wc} ctns × {packingPlan.cartonUsedW} cm)
                            </text>
                          </g>
                        </g>
                      );
                    })()}

                  </svg>
                </div>
              </div>

              {/* ============================================================== */}
              {/* 04 · 2D SIDE VIEW (LONGITUDINAL ELEVATION 1:1 CAD)             */}
              {/* ============================================================== */}
              <div id="sim-side" className="w-full max-w-5xl mx-auto flex flex-col items-center pt-8 border-t border-[#1E2024]">
                <div className="w-full flex items-center justify-between text-xs text-slate-400 font-mono mb-2 px-1">
                  <span className="text-slate-200 font-bold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                    04 · Side Longitudinal Elevation ({currentContainer.lengthCm} × {currentContainer.heightCm} cm)
                  </span>
                  <span className="text-[11px] text-slate-500 font-sans">
                    {packingPlan.lengthCount} rows length × {packingPlan.heightCount} tiers stacked
                  </span>
                </div>
                <div className="w-full flex items-center justify-center">
                  <svg
                    viewBox="0 0 960 480"
                    className="w-full h-auto select-none"
                    style={{ filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.7))" }}
                  >
                    <defs>
                      <pattern id="modal-grid-side" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#2D3035" strokeWidth="0.6" />
                      </pattern>
                      <linearGradient id="ctnSideGrad2D" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#6B911E" />
                        <stop offset="100%" stopColor="#4E6D12" />
                      </linearGradient>
                      <linearGradient id="ctnOrangeSideGrad2D" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#F59E0B" />
                        <stop offset="100%" stopColor="#B45309" />
                      </linearGradient>
                    </defs>

                    {/* Canvas Background */}
                    <rect x="0" y="0" width="960" height="480" fill="url(#modal-grid-side)" rx="10" />

                    {(() => {
                      const maxContL = 1203.2;
                      const maxContH = 269.8;
                      const contL = currentContainer.lengthCm;
                      const contH = currentContainer.heightCm;
                      const scale = 0.56; // 0.56 px/cm ensures 40ft (674px) + tractor cab (130px) fits in 960px canvas

                      const originX = 195; // Container front bulkhead
                      const contL_px = contL * scale; // 673.8 px (40ft) or 330.3 px (20ft)
                      const contH_px = contH * scale; // 134.0 px (GP) or 151.1 px (HQ)

                      const roadY = 293; // Road surface line (shifted to provide clear bottom-right for HUD Bullets card)
                      const floorY = 240; // Container bottom sitting on trailer chassis
                      const roofY = floorY - contH_px;
                      const hqRoofY = floorY - maxContH * scale;
                      const doorX = originX + contL_px;

                      const ctnL_px = packingPlan.cartonUsedL * scale;
                      const ctnH_px = resolvedSpecs.cartonH * scale;
                      const Lc = packingPlan.lengthCount;
                      const Hc = packingPlan.heightCount;
                      const Wc = packingPlan.widthCount;

                      const fullRows = packingPlan.fullRows;
                      const remCartons = cartons % packingPlan.cartonsPerRow;

                      return (
                        <g>
                          {/* =================================================== */}
                          {/* 1. ROAD SURFACE & BASELINE MARKINGS                 */}
                          {/* =================================================== */}
                          <line x1="30" y1={roadY} x2="930" y2={roadY} stroke="#3E4552" strokeWidth="1.5" />
                          <line x1="30" y1={roadY + 12} x2="930" y2={roadY + 12} stroke="#282E37" strokeWidth="1" strokeDasharray="16 12" />
                          <text x="925" y={roadY - 6} textAnchor="end" fill="#64748B" fontSize="7.5" className="font-mono">
                            ROAD SURFACE ▼
                          </text>

                          {/* =================================================== */}
                          {/* 2. TRACTOR CAB - LEFT OF CONTAINER                  */}
                          {/* =================================================== */}
                          <g id="tractor-cab-side">
                            {/* Aerodynamic Roof Deflector & Cab Shell */}
                            <path
                              d={`
                                M 50,${roadY - 22}
                                L 50,${roadY - 55}
                                Q 54,${roadY - 110} 70,${roadY - 145}
                                L 90,${roofY}
                                L 175,${roofY}
                                L 175,${roadY - 52}
                                L 140,${roadY - 52}
                                L 140,${roadY - 22}
                                Z
                              `}
                              fill="#2B303A"
                              stroke="#64748B"
                              strokeWidth="1.2"
                              strokeLinejoin="round"
                            />

                            {/* Cab Side Window */}
                            <path
                              d={`
                                M 74,${roadY - 140}
                                L 94,${roofY + 8}
                                L 142,${roofY + 8}
                                L 142,${roadY - 105}
                                L 86,${roadY - 105}
                                Z
                              `}
                              fill="#16202A"
                              stroke="#3B4C60"
                              strokeWidth="1"
                            />

                            {/* Cab Door Seam & Handle */}
                            <path d={`M 142,${roofY + 8} L 142,${roadY - 55}`} stroke="#383F4C" strokeWidth="1" />
                            <rect x="130" y={roadY - 95} width="6" height="2" rx="0.5" fill="#64748B" />

                            {/* Front Windshield A-pillar Accent */}
                            <line x1="72" y1={roadY - 142} x2="92" y2={roofY + 4} stroke="#64748B" strokeWidth="1.2" />

                            {/* Driver Side Rearview Mirror */}
                            <rect x="65" y={roadY - 138} width="4" height="18" rx="1" fill="#2B303A" stroke="#64748B" strokeWidth="0.8" />
                            <line x1="69" y1={roadY - 130} x2="74" y2={roadY - 130} stroke="#64748B" strokeWidth="0.8" />

                            {/* Front Bumper & Headlights */}
                            <rect x="44" y={roadY - 50} width="8" height="28" rx="2" fill="#333A45" stroke="#64748B" strokeWidth="1" />
                            <rect x="46" y={roadY - 44} width="4" height="6" rx="1" fill="#C7F33C" opacity="0.8" />
                            <rect x="46" y={roadY - 34} width="4" height="4" rx="1" fill="#F59E0B" opacity="0.8" />

                            {/* Fuel Tank (between steer & drive axles) */}
                            <rect x="100" y={roadY - 40} width="14" height="18" rx="3" fill="#252A32" stroke="#555D6B" strokeWidth="1" />
                            <line x1="107" y1={roadY - 40} x2="107" y2={roadY - 22} stroke="#383F4C" strokeWidth="1" />

                            {/* Tractor Chassis Rail */}
                            <rect x="50" y={roadY - 54} width="160" height="6" fill="#22262E" stroke="#47505C" strokeWidth="1" />

                            {/* Fifth Wheel Hitch (Coupler Plate under container front - centered at 163) */}
                            <path d={`M 154,${floorY} L 172,${floorY} L 168,${roadY - 54} L 158,${roadY - 54} Z`} fill="#333A45" stroke="#717D91" strokeWidth="1" />

                            {/* Tractor Steer Wheel (Front Steer Axle - Center at 74) */}
                            <g transform={`translate(74, ${roadY - 24})`}>
                              <circle cx="0" cy="0" r="24" fill="#181B1F" stroke="#555D6B" strokeWidth="1.5" />
                              <circle cx="0" cy="0" r="14" fill="#333A45" stroke="#717D91" strokeWidth="1" />
                              <circle cx="0" cy="0" r="5" fill="#555D6B" />
                            </g>

                            {/* Tractor Drive Tandem Axles (Axle 1 center 138, Axle 2 center 188 -> 50px spread, 0 overlap!) */}
                            <g transform={`translate(138, ${roadY - 24})`}>
                              <circle cx="0" cy="0" r="24" fill="#181B1F" stroke="#555D6B" strokeWidth="1.5" />
                              <circle cx="0" cy="0" r="14" fill="#333A45" stroke="#717D91" strokeWidth="1" />
                              <circle cx="0" cy="0" r="5" fill="#555D6B" />
                            </g>
                            <g transform={`translate(188, ${roadY - 24})`}>
                              <circle cx="0" cy="0" r="24" fill="#181B1F" stroke="#555D6B" strokeWidth="1.5" />
                              <circle cx="0" cy="0" r="14" fill="#333A45" stroke="#717D91" strokeWidth="1" />
                              <circle cx="0" cy="0" r="5" fill="#555D6B" />
                            </g>

                            {/* Technical Label: Tractor Cab */}
                            <text x="125" y={roadY - 65} textAnchor="middle" fill="#94A3B8" fontSize="7.5" fontWeight="bold" className="font-mono">
                              TRACTOR CAB
                            </text>
                          </g>

                          {/* =================================================== */}
                          {/* 3. TRAILER CHASSIS (คัสซีหางเทรลเลอร์)             */}
                          {/* =================================================== */}
                          <g id="trailer-chassis-side">
                            {/* Main Longitudinal Steel I-Beam underneath container floor */}
                            <rect
                              x={originX - 15}
                              y={floorY}
                              width={contL_px + 20}
                              height="10"
                              fill="#252A32"
                              stroke="#555D6B"
                              strokeWidth="1.2"
                              rx="1"
                            />

                            {/* Chassis Web Truss Reinforcement Lines */}
                            {Array.from({ length: Math.floor(contL / 120) }).map((_, i) => (
                              <line
                                key={`truss-${i}`}
                                x1={originX + 30 + i * 120 * scale}
                                y1={floorY + 1}
                                x2={originX + 30 + i * 120 * scale}
                                y2={floorY + 9}
                                stroke="#383F4C"
                                strokeWidth="1"
                              />
                            ))}

                            {/* Landing Gear (ขาค้ำยันเทรลเลอร์ - approx 1.5m behind bulkhead) */}
                            <g transform={`translate(${originX + 65}, ${floorY + 10})`}>
                              <rect x="0" y="0" width="8" height="30" fill="#2B303A" stroke="#555D6B" strokeWidth="1" />
                              <line x1="8" y1="4" x2="22" y2="28" stroke="#47505C" strokeWidth="1" />
                              {/* Foot Shoe pad (above road when driving) */}
                              <rect x="-4" y="30" width="16" height="4" rx="1" fill="#3E4754" stroke="#64748B" strokeWidth="0.8" />
                              {/* Crank Handle */}
                              <path d="M 8,14 L 14,14 L 14,20" fill="none" stroke="#64748B" strokeWidth="1" />
                              <text x="4" y="44" textAnchor="middle" fill="#64748B" fontSize="6.5" className="font-mono">
                                LANDING GEAR
                              </text>
                            </g>

                            {/* Trailer Rear Tridem Wheels (3 เพลาล้อหลังท้ายตู้) */}
                            {[
                              { cx: doorX - 110, id: "axle-1" },
                              { cx: doorX - 62, id: "axle-2" },
                              { cx: doorX - 14, id: "axle-3" },
                            ].map((wheel) => (
                              <g key={wheel.id} transform={`translate(${wheel.cx}, ${roadY - 24})`}>
                                <circle cx="0" cy="0" r="24" fill="#181B1F" stroke="#555D6B" strokeWidth="1.5" />
                                <circle cx="0" cy="0" r="14" fill="#333A45" stroke="#717D91" strokeWidth="1" />
                                <circle cx="0" cy="0" r="5" fill="#555D6B" />
                              </g>
                            ))}

                            {/* Mudguard / Fender Arch over trailer wheels */}
                            <path
                              d={`
                                M ${doorX - 138},${roadY - 14}
                                L ${doorX - 138},${floorY + 14}
                                L ${doorX + 5},${floorY + 14}
                                L ${doorX + 5},${roadY - 14}
                              `}
                              fill="none"
                              stroke="#555D6B"
                              strokeWidth="1.2"
                            />

                            {/* Rear Underride Guard (กันชนท้าย) & Mudflap */}
                            <rect x={doorX + 3} y={floorY + 10} width="3" height="35" fill="#333A45" />
                            <rect x={doorX - 2} y={roadY - 25} width="10" height="8" rx="1" fill="#22262E" stroke="#555D6B" strokeWidth="1" />
                            {/* Tail Light LED Cluster */}
                            <circle cx={doorX + 6} cy={roadY - 21} r="2.5" fill="#EF4444" opacity="0.9" />
                            <circle cx={doorX + 6} cy={roadY - 14} r="2.5" fill="#F59E0B" opacity="0.9" />
                          </g>

                          {/* =================================================== */}
                          {/* 4. CONTAINER SIDE WALL & INTERIOR                   */}
                          {/* =================================================== */}
                          <rect
                            x={originX}
                            y={roofY}
                            width={contL_px}
                            height={contH_px}
                            fill="#1A1C20"
                            stroke="#555D6B"
                            strokeWidth="1.5"
                            rx="2"
                          />

                          {/* High Cube Headroom Reference Zone (Only when 40ft GP is active) */}
                          {selectedContainer === "40ft" && contH < maxContH && (
                            <g>
                              <rect
                                x={originX}
                                y={hqRoofY}
                                width={contL_px}
                                height={roofY - hqRoofY}
                                fill="#1E2126"
                                stroke="#3D4450"
                                strokeWidth="1"
                                strokeDasharray="3 3"
                                rx="2"
                              />
                              <text
                                x={(originX + doorX) / 2}
                                y={hqRoofY + (roofY - hqRoofY) / 2 + 3}
                                textAnchor="middle"
                                fill="#94A3B8"
                                fontSize="8.5"
                                fontWeight="bold"
                                className="font-mono"
                              >
                                +30.5 cm High Cube Headroom (40ft HQ only)
                              </text>
                            </g>
                          )}

                          {/* Front Bulkhead Wall Beam (Left - Facing Tractor) */}
                          <line
                            x1={originX}
                            y1={roofY - 8}
                            x2={originX}
                            y2={floorY + 8}
                            stroke="#64748B"
                            strokeWidth="2.5"
                          />
                          <text
                            x={originX - 8}
                            y={roofY - 10}
                            textAnchor="end"
                            fill="#94A3B8"
                            fontSize="8.5"
                            fontWeight="bold"
                            className="font-mono"
                          >
                            FRONT BULKHEAD ►
                          </text>

                          {/* Rear Door Opening Beam (Right - Loading Door) */}
                          <line
                            x1={doorX}
                            y1={roofY - 8}
                            x2={doorX}
                            y2={floorY + 8}
                            stroke="#64748B"
                            strokeWidth="2.5"
                          />
                          <text
                            x={contL < maxContL ? doorX + 10 : doorX - 10}
                            y={roofY - 10}
                            textAnchor={contL < maxContL ? "start" : "end"}
                            fill="#94A3B8"
                            fontSize="8.5"
                            fontWeight="bold"
                            className="font-mono"
                          >
                            {contL < maxContL ? "◄ CONTAINER DOORS (REAR)" : "CONTAINER DOORS (REAR) ►"}
                          </text>

                          {/* 1m & 2m Height Guides */}
                          <g>
                            <line
                              x1={originX}
                              y1={floorY - 100 * scale}
                              x2={doorX}
                              y2={floorY - 100 * scale}
                              stroke="#1E2228"
                              strokeWidth="0.8"
                              strokeDasharray="4 4"
                            />
                            <text
                              x={originX + 6}
                              y={floorY - 100 * scale - 4}
                              fill="#475569"
                              fontSize="7.5"
                              className="font-mono"
                            >
                              1 m
                            </text>
                            <line
                              x1={originX}
                              y1={floorY - 200 * scale}
                              x2={doorX}
                              y2={floorY - 200 * scale}
                              stroke="#1E2228"
                              strokeWidth="0.8"
                              strokeDasharray="4 4"
                            />
                            <text
                              x={originX + 6}
                              y={floorY - 200 * scale - 4}
                              fill="#475569"
                              fontSize="7.5"
                              className="font-mono"
                            >
                              2 m
                            </text>
                          </g>

                          {/* 1m Meter Tick Markers along container length */}
                          {Array.from({ length: Math.floor(contL / 100) }).map((_, i) => {
                            const meter = i + 1;
                            const xm = originX + meter * 100 * scale;
                            return (
                              <g key={`side-meter-${meter}`}>
                                <line
                                  x1={xm}
                                  y1={floorY}
                                  x2={xm}
                                  y2={floorY + 5}
                                  stroke="#3E444D"
                                  strokeWidth="1"
                                />
                                <text
                                  x={xm}
                                  y={floorY + 16}
                                  textAnchor="middle"
                                  fill="#64748B"
                                  fontSize="7"
                                  className="font-mono"
                                >
                                  {meter}m
                                </text>
                              </g>
                            );
                          })}

                          {/* Stacks of Cartons along container length */}
                          {cartons > 0 && Array.from({ length: Lc }).map((_, rIdx) => {
                            const x = originX + rIdx * ctnL_px;
                            const isFull = rIdx < fullRows;
                            const isPartial = rIdx === fullRows && packingPlan.partialRowProgress > 0;

                            let tiers = 0;
                            if (isFull) {
                              tiers = Hc;
                            } else if (isPartial) {
                              const base = Math.floor(remCartons / Wc);
                              const extra = remCartons % Wc > 0 ? 1 : 0;
                              tiers = base + extra;
                            }

                            if (tiers === 0) return null;

                            return Array.from({ length: tiers }).map((_, tIdx) => {
                              const y = floorY - (tIdx + 1) * ctnH_px;
                              return (
                                <rect
                                  key={`side-ctn-${rIdx}-${tIdx}`}
                                  x={x + 0.3}
                                  y={y + 0.3}
                                  width={ctnL_px - 0.6}
                                  height={ctnH_px - 0.6}
                                  rx="0"
                                  fill="#365314"
                                  stroke="#84CC16"
                                  strokeWidth="1"
                                />
                              );
                            });
                          })}

                          {/* Overhead Gap Region & Tilted Cartons - Resting directly on cargo stack */}
                          {packingPlan.heightGapCm > 0 && (() => {
                            const hasOverTilted = cartons > 0 && showTiltedCartons && packingPlan.overheadTilted.totalCartons > 0 && packingPlan.overheadTilted.cartonOrientation;
                            const gapH_px = packingPlan.heightGapCm * scale;
                            const topCargoY = floorY - Hc * ctnH_px;
                            const ohOri = packingPlan.overheadTilted.cartonOrientation;
                            const ohCounts = packingPlan.overheadTilted.counts;
                            const th = (ohOri?.h || 0) * scale;

                            // Limit overhead cartons to rows with cargo support below them
                            const maxLoadedLengthPx = cartons >= packingPlan.greenCartons
                              ? Lc * ctnL_px
                              : (fullRows + (packingPlan.partialRowProgress > 0 ? 1 : 0)) * ctnL_px;
                            const activeOhLCount = fullRows > 0 || cartons >= packingPlan.greenCartons
                              ? Math.min(ohCounts.lCount, Math.floor(maxLoadedLengthPx / ((ohOri?.l || 1) * scale)))
                              : 0;

                            return (
                              <g id="side-overhead-gap-region">
                                {/* Dashed Clearance Boundary */}
                                <rect
                                  x={originX}
                                  y={roofY}
                                  width={doorX - originX}
                                  height={gapH_px}
                                  fill="rgba(245, 158, 11, 0.04)"
                                  stroke="#F59E0B"
                                  strokeWidth="0.8"
                                  strokeDasharray="3 3"
                                />

                                {/* Render Tilted Cartons in Overhead Gap - Resting directly on green cargo! */}
                                {hasOverTilted && ohOri && activeOhLCount > 0 && (
                                  <g id="side-tilted-overhead-cartons">
                                    {Array.from({ length: ohCounts.hCount }).map((_, ohIdx) => {
                                      const ty = topCargoY - (ohIdx + 1) * th;
                                      return Array.from({ length: Math.min(activeOhLCount, 60) }).map((_, olIdx) => {
                                        const tx = originX + olIdx * (ohOri.l * scale);
                                        const tw = ohOri.l * scale;
                                        return (
                                          <rect
                                            key={`side-oh-ctn-${ohIdx}-${olIdx}`}
                                            x={tx + 0.3}
                                            y={ty + 0.3}
                                            width={tw - 0.6}
                                            height={th - 0.6}
                                            rx="0"
                                            fill="#9A3412"
                                            stroke="#FBBF24"
                                            strokeWidth="1"
                                          />
                                        );
                                      });
                                    })}
                                  </g>
                                )}

                                {/* Overhead Gap Label with Non-Colliding HUD Pill Badge (Moved Outside Above Roof) */}
                                {(() => {
                                  const ohText = hasOverTilted
                                    ? `Tilted Overhead: +${packingPlan.overheadTilted.totalCartons} ctns (${packingPlan.heightGapCm} cm)`
                                    : `Overhead Gap: ${packingPlan.heightGapCm} cm`;
                                  const badgeLen = Math.max(76, ohText.length * 5.1 + 16);
                                  const badgeX = doorX - Math.min(80, contL_px * 0.22);
                                  const badgeY = 56;

                                  return (
                                    <g id="side-overhead-badge">
                                      {/* Small leader tick connecting roof to exterior overhead badge */}
                                      <line
                                        x1={badgeX}
                                        y1={roofY}
                                        x2={badgeX}
                                        y2={badgeY + 9}
                                        stroke="#F59E0B"
                                        strokeWidth="1"
                                      />
                                      <circle cx={badgeX} cy={roofY} r="2" fill="#F59E0B" />
                                      <rect
                                        x={badgeX - badgeLen / 2}
                                        y={badgeY - 9}
                                        width={badgeLen}
                                        height="18"
                                        rx="4"
                                        fill="#0B0D0F"
                                        fillOpacity="0.95"
                                        stroke="#F59E0B"
                                        strokeWidth="0.9"
                                      />
                                      <text
                                        x={badgeX}
                                        y={badgeY + 3.2}
                                        textAnchor="middle"
                                        fill="#FEF08A"
                                        fontSize="7.5"
                                        fontWeight="bold"
                                        className="font-mono"
                                      >
                                        {ohText}
                                      </text>
                                    </g>
                                  );
                                })()}
                              </g>
                            );
                          })()}

                          {/* Door Clearance Gap Region & Tilted Cartons */}
                          {packingPlan.lengthGapCm > 0 && (() => {
                            const cargoEndX = originX + Lc * ctnL_px;
                            const gapW = doorX - cargoEndX;
                            const cargoH = Hc * ctnH_px;
                            const hasDoorTilted = cartons > 0 && showTiltedCartons && packingPlan.doorTilted.totalCartons > 0 && packingPlan.doorTilted.cartonOrientation;
                            return (
                              <g id="side-door-gap-region">
                                <rect
                                  x={cargoEndX}
                                  y={floorY - cargoH}
                                  width={gapW}
                                  height={cargoH}
                                  fill="rgba(245, 158, 11, 0.08)"
                                  stroke="#F59E0B"
                                  strokeWidth="0.8"
                                  strokeDasharray={hasDoorTilted ? "none" : "3 3"}
                                />

                                {/* Render Tilted Cartons in Door Gap */}
                                {hasDoorTilted && (
                                  <g id="side-tilted-door-cartons">
                                    {Array.from({ length: packingPlan.doorTilted.counts.hCount }).map((_, dhIdx) => {
                                      const ty = floorY - (dhIdx + 1) * (packingPlan.doorTilted.cartonOrientation!.h * scale);
                                      const th = packingPlan.doorTilted.cartonOrientation!.h * scale;
                                      return Array.from({ length: packingPlan.doorTilted.counts.lCount }).map((_, dlIdx) => {
                                        const tx = cargoEndX + dlIdx * (packingPlan.doorTilted.cartonOrientation!.l * scale);
                                        const tw = packingPlan.doorTilted.cartonOrientation!.l * scale;
                                        return (
                                          <rect
                                            key={`side-door-ctn-${dhIdx}-${dlIdx}`}
                                            x={tx + 0.3}
                                            y={ty + 0.3}
                                            width={tw - 0.6}
                                            height={th - 0.6}
                                            rx="0"
                                            fill="#9A3412"
                                            stroke="#FBBF24"
                                            strokeWidth="1"
                                          />
                                        );
                                      });
                                    })}
                                  </g>
                                )}

                                {/* Door Gap Label with Non-Colliding HUD Pill Badge (Moved Outside Rear Door) */}
                                {(() => {
                                  const doorText = hasDoorTilted
                                    ? `Tilted Door: +${packingPlan.doorTilted.totalCartons} ctns (${packingPlan.lengthGapCm} cm)`
                                    : `Door Clearance: ${packingPlan.lengthGapCm} cm`;
                                  const badgeLen = Math.max(76, doorText.length * 5.1 + 16);
                                  const badgeCenterX = doorX + 16;
                                  const badgeCenterY = floorY - cargoH / 2;

                                  return (
                                    <g transform={`rotate(-90 ${badgeCenterX} ${badgeCenterY})`}>
                                      <rect
                                        x={badgeCenterX - badgeLen / 2}
                                        y={badgeCenterY - 9}
                                        width={badgeLen}
                                        height="18"
                                        rx="4"
                                        fill="#0B0D0F"
                                        fillOpacity="0.95"
                                        stroke="#F59E0B"
                                        strokeWidth="0.9"
                                      />
                                      <text
                                        x={badgeCenterX}
                                        y={badgeCenterY + 3.2}
                                        textAnchor="middle"
                                        fill="#FEF08A"
                                        fontSize="7.5"
                                        fontWeight="bold"
                                        className="font-mono"
                                      >
                                        {doorText}
                                      </text>
                                    </g>
                                  );
                                })()}
                              </g>
                            );
                          })()}

                          {/* Bottom Depth Dimension Line (Cleanly below road line) */}
                          <g>
                            <line
                              x1={originX}
                              y1={roadY + 28}
                              x2={doorX}
                              y2={roadY + 28}
                              stroke="#CBD5E1"
                              strokeWidth="1.2"
                            />
                            <line
                              x1={originX}
                              y1={roadY + 22}
                              x2={originX}
                              y2={roadY + 34}
                              stroke="#CBD5E1"
                              strokeWidth="1.2"
                            />
                            <line
                              x1={doorX}
                              y1={roadY + 22}
                              x2={doorX}
                              y2={roadY + 34}
                              stroke="#CBD5E1"
                              strokeWidth="1.2"
                            />
                            <text
                              x={(originX + doorX) / 2}
                              y={roadY + 44}
                              textAnchor="middle"
                              fill="#CBD5E1"
                              fontSize="9"
                              fontWeight="bold"
                              className="font-mono"
                            >
                              Depth {contL} cm ({Lc} rows × {packingPlan.cartonUsedL} cm)
                            </text>
                          </g>

                          {/* Right Height Dimension Line (Cleanly shifted to accommodate exterior door badge) */}
                          <g>
                            <line
                              x1={doorX + 38}
                              y1={roofY}
                              x2={doorX + 38}
                              y2={floorY}
                              stroke="#C7F33C"
                              strokeWidth="1.2"
                            />
                            <line
                              x1={doorX + 32}
                              y1={roofY}
                              x2={doorX + 44}
                              y2={roofY}
                              stroke="#C7F33C"
                              strokeWidth="1.2"
                            />
                            <line
                              x1={doorX + 32}
                              y1={floorY}
                              x2={doorX + 44}
                              y2={floorY}
                              stroke="#C7F33C"
                              strokeWidth="1.2"
                            />
                            <text
                              x={doorX + 52}
                              y={(roofY + floorY) / 2}
                              textAnchor="middle"
                              fill="#C7F33C"
                              fontSize="9"
                              fontWeight="bold"
                              className="font-mono"
                              transform={`rotate(90 ${doorX + 52} ${(roofY + floorY) / 2})`}
                            >
                              Height {contH} cm ({Hc} tiers × {resolvedSpecs.cartonH} cm)
                            </text>
                          </g>
                        </g>
                      );
                    })()}

                  </svg>
                </div>
              </div>
            </div>
          )}
        </main>
        </div>
      </div>
    </div>
  );
}
