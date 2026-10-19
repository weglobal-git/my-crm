export interface ContainerTypeSpec {
  id: "20ft" | "40ft" | "40ftHq";
  name: string;
  shortName: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  maxPayloadKg: number;
  nominalCbm: number;
}

export const CONTAINER_SPECS: Record<"20ft" | "40ft" | "40ftHq", ContainerTypeSpec> = {
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

/**
 * Default corrugated carton compression / measurement tolerance per carton (in mm)
 * during tight factory floor-loading (~1.8 mm per carton under stacking/stowing pressure).
 */
export const DEFAULT_CARTON_TOLERANCE_MM = 1.8;

function countBestUniformFit(
  boxW: number,
  boxL: number,
  boxH: number,
  perms: [number, number, number][],
  toleranceCm: number
): number {
  if (boxW < 1 || boxL < 1 || boxH < 1) return 0;
  let maxFit = 0;
  for (const [pw, pl, ph] of perms) {
    const ew = Math.max(1, pw - toleranceCm);
    const el = Math.max(1, pl - toleranceCm);
    const eh = Math.max(1, ph - toleranceCm);
    if (ew <= boxW + 0.05 && el <= boxL + 0.05 && eh <= boxH + 0.05) {
      const kw = Math.floor((boxW + 0.05) / ew);
      const kl = Math.floor((boxL + 0.05) / el);
      const kh = Math.floor((boxH + 0.05) / eh);
      const total = kw * kl * kh;
      if (total > maxFit) maxFit = total;
    }
  }
  return maxFit;
}

export function fitTiltedCartonsInBox(
  boxW: number,
  boxL: number,
  boxH: number,
  carton: { w: number; l: number; h: number },
  zoneType: "side" | "door" | "overhead",
  toleranceCm = 0
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
  let bestSubCount = 0;
  let bestOrient: [number, number, number] | null = null;
  let bestWc = 0;
  let bestLc = 0;
  let bestHc = 0;

  for (const [pw, pl, ph] of perms) {
    const ew = Math.max(1, pw - toleranceCm);
    const el = Math.max(1, pl - toleranceCm);
    const eh = Math.max(1, ph - toleranceCm);
    if (ew <= boxW + 0.05 && el <= boxL + 0.05 && eh <= boxH + 0.05) {
      const kw = Math.floor((boxW + 0.05) / ew);
      const kl = Math.floor((boxL + 0.05) / el);
      const kh = Math.floor((boxH + 0.05) / eh);
      const primaryTotal = kw * kl * kh;
      if (primaryTotal <= 0) continue;

      const usedW = Math.min(boxW, kw * ew);
      const usedL = Math.min(boxL, kl * el);
      const usedH = Math.min(boxH, kh * eh);

      // Check non-overlapping residual sub-gaps inside this gap zone
      const remH = Math.max(0, boxH - usedH);
      const remW = Math.max(0, boxW - usedW);
      const remL = Math.max(0, boxL - usedL);

      const subTop = countBestUniformFit(boxW, boxL, remH, perms, toleranceCm);
      const subSide = countBestUniformFit(remW, boxL, usedH, perms, toleranceCm);
      const subDepth = countBestUniformFit(usedW, remL, usedH, perms, toleranceCm);
      const subTotal = subTop + subSide + subDepth;
      const total = primaryTotal + subTotal;

      if (total > bestCount || (total === bestCount && primaryTotal > bestWc * bestLc * bestHc)) {
        bestCount = total;
        bestSubCount = subTotal;
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
  const subSuffix = bestSubCount > 0 ? ` (+สอดช่องว่างย่อย ${bestSubCount} ลัง)` : "";
  let tiltDesc = "";
  if (zoneType === "side") {
    tiltDesc = `ตะแคงด้าน ${ow} cm ขนานผนัง (${ow}×${ol}×${oh} cm) วางได้ ${bestWc} ลังขวาง × ${bestLc} แถวลึก × ${bestHc} ชั้น${subSuffix}`;
  } else if (zoneType === "door") {
    tiltDesc = `ตะแคงด้าน ${ol} cm ขนานประตู (${ow}×${ol}×${oh} cm) วางได้ ${bestWc} ลังหน้า × ${bestLc} แถวลึก × ${bestHc} ชั้น${subSuffix}`;
  } else {
    tiltDesc = `ตะแคงนอนราบด้าน ${oh} cm ตั้งขึ้น (${ow}×${ol}×${oh} cm) วางได้ ${bestWc} ลังขวาง × ${bestLc} แถวลึก × ${bestHc} ชั้น${subSuffix}`;
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

export function calculateTiltedGapOptimization(
  container: ContainerTypeSpec,
  carton: {
    w: number;
    l: number;
    h: number;
    cbmPerCtn: number;
    gwPerCtn?: number;
    toleranceCm?: number;
  },
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
  const toleranceCm = carton.toleranceCm ?? 0;

  const wCount = activePlan.widthCount;
  const lCount = activePlan.lengthCount;
  const hCount = activePlan.heightCount;

  const exactCbmPerCtn =
    carton.w > 0 && carton.l > 0 && carton.h > 0
      ? (carton.w * carton.l * carton.h) / 1_000_000
      : carton.cbmPerCtn;

  const maxByGw =
    carton.gwPerCtn && carton.gwPerCtn > 0 && container.maxPayloadKg > 0
      ? Math.floor(container.maxPayloadKg / carton.gwPerCtn)
      : Infinity;
  const maxByCbm =
    exactCbmPerCtn > 0 && container.nominalCbm > 0
      ? Math.floor(container.nominalCbm / exactCbmPerCtn)
      : Infinity;
  const maxAllowedCartons = Math.max(0, Math.min(maxByGw, maxByCbm));

  const rawGreenCartons = wCount * lCount * hCount;
  const greenCartons = Math.min(rawGreenCartons, maxAllowedCartons);
  const greenUsedW = Math.min(cW, Number((wCount * activePlan.cartonUsedW).toFixed(1)));
  const greenUsedL = Math.min(cL, Number((lCount * activePlan.cartonUsedL).toFixed(1)));
  const greenUsedH = Math.min(cH, Number((hCount * carton.h).toFixed(1)));

  const sideGapCm = Math.max(0, Number((cW - greenUsedW).toFixed(1)));
  const doorGapCm = Math.max(0, Number((cL - greenUsedL).toFixed(1)));
  const heightGapCm = Math.max(0, Number((cH - greenUsedH).toFixed(1)));

  // Evaluate 4 non-overlapping 3D gap partitions:
  const candidates = [
    {
      sideBox: { w: sideGapCm, l: greenUsedL, h: greenUsedH },
      doorBox: { w: cW, l: doorGapCm, h: greenUsedH },
      overBox: { w: cW, l: cL, h: heightGapCm },
      side: fitTiltedCartonsInBox(sideGapCm, greenUsedL, greenUsedH, carton, "side", toleranceCm),
      door: fitTiltedCartonsInBox(cW, doorGapCm, greenUsedH, carton, "door", toleranceCm),
      over: fitTiltedCartonsInBox(cW, cL, heightGapCm, carton, "overhead", toleranceCm),
    },
    {
      sideBox: { w: sideGapCm, l: cL, h: greenUsedH },
      doorBox: { w: greenUsedW, l: doorGapCm, h: greenUsedH },
      overBox: { w: cW, l: cL, h: heightGapCm },
      side: fitTiltedCartonsInBox(sideGapCm, cL, greenUsedH, carton, "side", toleranceCm),
      door: fitTiltedCartonsInBox(greenUsedW, doorGapCm, greenUsedH, carton, "door", toleranceCm),
      over: fitTiltedCartonsInBox(cW, cL, heightGapCm, carton, "overhead", toleranceCm),
    },
    {
      sideBox: { w: sideGapCm, l: greenUsedL, h: cH },
      doorBox: { w: cW, l: doorGapCm, h: cH },
      overBox: { w: greenUsedW, l: greenUsedL, h: heightGapCm },
      side: fitTiltedCartonsInBox(sideGapCm, greenUsedL, cH, carton, "side", toleranceCm),
      door: fitTiltedCartonsInBox(cW, doorGapCm, cH, carton, "door", toleranceCm),
      over: fitTiltedCartonsInBox(greenUsedW, greenUsedL, heightGapCm, carton, "overhead", toleranceCm),
    },
    {
      sideBox: { w: sideGapCm, l: cL, h: cH },
      doorBox: { w: greenUsedW, l: doorGapCm, h: cH },
      overBox: { w: greenUsedW, l: greenUsedL, h: heightGapCm },
      side: fitTiltedCartonsInBox(sideGapCm, cL, cH, carton, "side", toleranceCm),
      door: fitTiltedCartonsInBox(greenUsedW, doorGapCm, cH, carton, "door", toleranceCm),
      over: fitTiltedCartonsInBox(greenUsedW, greenUsedL, heightGapCm, carton, "overhead", toleranceCm),
    },
  ];

  let bestCandidate = candidates[2];
  let bestSum = -1;
  for (const cand of candidates) {
    const sum = cand.side.count + cand.door.count + cand.over.count;
    if (sum > bestSum) {
      bestSum = sum;
      bestCandidate = cand;
    }
  }

  const chosenSide = bestCandidate.side;
  const chosenDoor = bestCandidate.door;
  const chosenOver = bestCandidate.over;

  // Cap tilted gap cartons by remaining weight/volume capacity
  const remForOrange = Math.max(0, maxAllowedCartons - greenCartons);
  const cappedSideCount = Math.min(chosenSide.count, remForOrange);
  const remAfterSide = Math.max(0, remForOrange - cappedSideCount);
  const cappedDoorCount = Math.min(chosenDoor.count, remAfterSide);
  const remAfterDoor = Math.max(0, remAfterSide - cappedDoorCount);
  const cappedOverCount = Math.min(chosenOver.count, remAfterDoor);

  const sideEffectiveLCount =
    cappedSideCount <= 0
      ? 0
      : chosenSide.wCount * chosenSide.hCount > 0
      ? Math.min(chosenSide.lCount, Math.ceil(cappedSideCount / (chosenSide.wCount * chosenSide.hCount)))
      : chosenSide.lCount;
  const doorEffectiveWCount =
    cappedDoorCount <= 0
      ? 0
      : chosenDoor.lCount * chosenDoor.hCount > 0
      ? Math.min(chosenDoor.wCount, Math.ceil(cappedDoorCount / (chosenDoor.lCount * chosenDoor.hCount)))
      : chosenDoor.wCount;
  const overEffectiveLCount =
    cappedOverCount <= 0
      ? 0
      : chosenOver.wCount * chosenOver.hCount > 0
      ? Math.min(chosenOver.lCount, Math.ceil(cappedOverCount / (chosenOver.wCount * chosenOver.hCount)))
      : chosenOver.lCount;

  const totalOrangeCartons = cappedSideCount + cappedDoorCount + cappedOverCount;
  const totalHybridCartons = greenCartons + totalOrangeCartons;

  const greenCbm = Number((greenCartons * exactCbmPerCtn).toFixed(3));
  const totalOrangeCbm = Number((totalOrangeCartons * exactCbmPerCtn).toFixed(3));
  const totalHybridCbm = Number((totalHybridCartons * exactCbmPerCtn).toFixed(3));

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
      boxDimsCm: bestCandidate.sideBox,
      cartonOrientation: chosenSide.orientation,
      counts: { wCount: chosenSide.wCount, lCount: sideEffectiveLCount, hCount: chosenSide.hCount },
      totalCartons: cappedSideCount,
      descTh: chosenSide.descTh,
    },
    doorTilted: {
      zoneId: "door",
      nameTh: "ช่องว่างท้ายตู้ (Door Gap)",
      boxDimsCm: bestCandidate.doorBox,
      cartonOrientation: chosenDoor.orientation,
      counts: { wCount: doorEffectiveWCount, lCount: chosenDoor.lCount, hCount: chosenDoor.hCount },
      totalCartons: cappedDoorCount,
      descTh: chosenDoor.descTh,
    },
    overheadTilted: {
      zoneId: "overhead",
      nameTh: "ช่องว่างเพดาน (Overhead Gap)",
      boxDimsCm: bestCandidate.overBox,
      cartonOrientation: chosenOver.orientation,
      counts: { wCount: chosenOver.wCount, lCount: overEffectiveLCount, hCount: chosenOver.hCount },
      totalCartons: cappedOverCount,
      descTh: chosenOver.descTh,
    },
    totalOrangeCartons,
    totalOrangeCbm,
    totalHybridCbm,
    totalHybridCartons,
    hybridUtilization,
    gainPercent,
  };
}

export function resolveCartonDimensions(input: {
  cartonWidth?: number | null;
  cartonLength?: number | null;
  cartonHeight?: number | null;
  cartonDimension?: string | null;
  cbm?: number | null;
}): {
  cartonW: number;
  cartonL: number;
  cartonH: number;
  hasDimensions: boolean;
  cbmPerCtn: number;
} {
  let cartonW = typeof input.cartonWidth === "number" && input.cartonWidth > 0 ? input.cartonWidth : 0;
  let cartonL = typeof input.cartonLength === "number" && input.cartonLength > 0 ? input.cartonLength : 0;
  let cartonH = typeof input.cartonHeight === "number" && input.cartonHeight > 0 ? input.cartonHeight : 0;

  if ((!cartonW || !cartonL || !cartonH) && input.cartonDimension) {
    const match = input.cartonDimension.match(
      /(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i
    );
    if (match) {
      cartonW = parseFloat(match[1]) || 0;
      cartonL = parseFloat(match[2]) || 0;
      cartonH = parseFloat(match[3]) || 0;
    }
  }

  const hasDimensions = cartonW > 0 && cartonL > 0 && cartonH > 0;
  const rawCbm =
    typeof input.cbm === "number"
      ? input.cbm
      : parseFloat(input.cbm as unknown as string) || 0;

  const cbmPerCtn = hasDimensions
    ? (cartonW * cartonL * cartonH) / 1_000_000
    : rawCbm > 0
    ? rawCbm
    : 0;

  return {
    cartonW,
    cartonL,
    cartonH,
    hasDimensions,
    cbmPerCtn,
  };
}

export interface ContainerCartonRangeResult {
  minCartons: number;
  maxCartons: number;
  planACartons: number;
  planBCartons: number;
  bestHybridCartons: number;
  maxByGwMin: number;
  maxByGwMax: number;
  maxByCbm: number;
}

const containerRangeCache = new Map<string, ContainerCartonRangeResult>();

export function calculateContainerCartonRange(
  product: {
    cartonWidth?: number | null;
    cartonLength?: number | null;
    cartonHeight?: number | null;
    cartonDimension?: string | null;
    cbm?: number | null;
    cartonGrossWeight?: number | null;
    minGrossWeight?: number | null;
    maxGrossWeight?: number | null;
  },
  containerId: "20ft" | "40ft" | "40ftHq",
  customContainer?: ContainerTypeSpec,
  toleranceMm: number = DEFAULT_CARTON_TOLERANCE_MM
): ContainerCartonRangeResult {
  const container = customContainer || CONTAINER_SPECS[containerId];
  const { cartonW, cartonL, cartonH, hasDimensions, cbmPerCtn } = resolveCartonDimensions(product);
  const toleranceCm = Math.max(0, toleranceMm / 10);

  const gwForMin =
    product.maxGrossWeight && product.maxGrossWeight > 0
      ? product.maxGrossWeight
      : product.cartonGrossWeight && product.cartonGrossWeight > 0
      ? product.cartonGrossWeight
      : 0;

  const gwForMax =
    product.minGrossWeight && product.minGrossWeight > 0
      ? product.minGrossWeight
      : product.cartonGrossWeight && product.cartonGrossWeight > 0
      ? product.cartonGrossWeight
      : 0;

  const cacheKey = !customContainer
    ? `${containerId}|${cartonW}|${cartonL}|${cartonH}|${cbmPerCtn}|${gwForMin}|${gwForMax}|${toleranceMm}`
    : null;

  if (cacheKey) {
    const cached = containerRangeCache.get(cacheKey);
    if (cached) return cached;
  }

  const maxByGwMin =
    gwForMin > 0 && container.maxPayloadKg > 0
      ? Math.floor(container.maxPayloadKg / gwForMin)
      : Infinity;

  const maxByGwMax =
    gwForMax > 0 && container.maxPayloadKg > 0
      ? Math.floor(container.maxPayloadKg / gwForMax)
      : Infinity;

  const maxByCbm =
    cbmPerCtn > 0 && container.nominalCbm > 0
      ? Math.floor(container.nominalCbm / cbmPerCtn)
      : Infinity;

  let result: ContainerCartonRangeResult;

  if (hasDimensions) {
    // 1. Conservative Min: Strict rigid dimensions (0 mm compression) across Plan A & Plan B
    const wA_strict = Math.floor(container.widthCm / cartonW);
    const lA_strict = Math.floor(container.lengthCm / cartonL);
    const hA_strict = Math.floor(container.heightCm / cartonH);
    const greenA_strict = wA_strict * lA_strict * hA_strict;

    const wB_strict = Math.floor(container.widthCm / cartonL);
    const lB_strict = Math.floor(container.lengthCm / cartonW);
    const hB_strict = Math.floor(container.heightCm / cartonH);
    const greenB_strict = wB_strict * lB_strict * hB_strict;

    // 2. Practical Max: Factory stuffing with corrugated carton compression tolerance + tilted gap optimization
    const effW = Math.max(1, cartonW - toleranceCm);
    const effL = Math.max(1, cartonL - toleranceCm);
    const effH = Math.max(1, cartonH - toleranceCm);

    // Plan A (with tolerance)
    const wA = Math.floor(container.widthCm / effW);
    const lA = Math.floor(container.lengthCm / effL);
    const hA = Math.floor(container.heightCm / effH);
    const greenA = wA * lA * hA;
    const sideGapA = Math.max(0, Number((container.widthCm - wA * cartonW).toFixed(1)));
    const doorGapA = Math.max(0, Number((container.lengthCm - lA * cartonL).toFixed(1)));
    const hybridA =
      greenA > 0
        ? calculateTiltedGapOptimization(
            container,
            { w: cartonW, l: cartonL, h: cartonH, cbmPerCtn, gwPerCtn: gwForMax, toleranceCm },
            {
              widthCount: wA,
              lengthCount: lA,
              heightCount: hA,
              cartonUsedW: cartonW,
              cartonUsedL: cartonL,
              sideGap: sideGapA,
              doorGap: doorGapA,
            }
          ).totalHybridCartons
        : 0;

    // Plan B (with tolerance)
    const wB = Math.floor(container.widthCm / effL);
    const lB = Math.floor(container.lengthCm / effW);
    const hB = Math.floor(container.heightCm / effH);
    const greenB = wB * lB * hB;
    const sideGapB = Math.max(0, Number((container.widthCm - wB * cartonL).toFixed(1)));
    const doorGapB = Math.max(0, Number((container.lengthCm - lB * cartonW).toFixed(1)));
    const hybridB =
      greenB > 0
        ? calculateTiltedGapOptimization(
            container,
            { w: cartonW, l: cartonL, h: cartonH, cbmPerCtn, gwPerCtn: gwForMax, toleranceCm },
            {
              widthCount: wB,
              lengthCount: lB,
              heightCount: hB,
              cartonUsedW: cartonL,
              cartonUsedL: cartonW,
              sideGap: sideGapB,
              doorGap: doorGapB,
            }
          ).totalHybridCartons
        : 0;

    const rawMin =
      greenA_strict > 0 && greenB_strict > 0
        ? Math.min(greenA_strict, greenB_strict)
        : Math.max(greenA_strict, greenB_strict, Math.min(greenA, greenB));
    const rawMax = Math.max(hybridA, hybridB, greenA, greenB);

    const cappedMin = Math.max(0, Math.min(rawMin, maxByCbm, maxByGwMin));
    const cappedMax = Math.max(0, Math.min(rawMax, maxByCbm, maxByGwMax));

    result = {
      minCartons: Math.min(cappedMin, cappedMax),
      maxCartons: Math.max(cappedMin, cappedMax),
      planACartons: Math.max(0, Math.min(greenA, maxByCbm, maxByGwMax)),
      planBCartons: Math.max(0, Math.min(greenB, maxByCbm, maxByGwMax)),
      bestHybridCartons: Math.max(0, Math.min(rawMax, maxByCbm, maxByGwMax)),
      maxByGwMin,
      maxByGwMax,
      maxByCbm,
    };
  } else if (cbmPerCtn > 0) {
    const practicalCbm = containerId === "20ft" ? 28 : containerId === "40ft" ? 58 : 65;
    const rawMin = Math.floor(practicalCbm / cbmPerCtn);
    const rawMax = Math.floor(container.nominalCbm / cbmPerCtn);

    const cappedMin = Math.max(0, Math.min(rawMin, maxByCbm, maxByGwMin));
    const cappedMax = Math.max(0, Math.min(rawMax, maxByCbm, maxByGwMax));

    result = {
      minCartons: Math.min(cappedMin, cappedMax),
      maxCartons: Math.max(cappedMin, cappedMax),
      planACartons: Math.min(cappedMin, cappedMax),
      planBCartons: Math.max(cappedMin, cappedMax),
      bestHybridCartons: Math.max(cappedMin, cappedMax),
      maxByGwMin,
      maxByGwMax,
      maxByCbm,
    };
  } else {
    result = {
      minCartons: 0,
      maxCartons: 0,
      planACartons: 0,
      planBCartons: 0,
      bestHybridCartons: 0,
      maxByGwMin,
      maxByGwMax,
      maxByCbm,
    };
  }

  if (cacheKey) {
    if (containerRangeCache.size > 2000) {
      containerRangeCache.clear();
    }
    containerRangeCache.set(cacheKey, result);
  }

  return result;
}

export function formatContainerRangeLabel(
  prefix: "20ft" | "40ft" | "40HQ",
  range: { minCartons: number; maxCartons: number }
): string {
  const { minCartons, maxCartons } = range;
  if (maxCartons <= 0) {
    return `${prefix}: —`;
  }
  if (minCartons <= 0 || minCartons === maxCartons) {
    return `${prefix}: ${maxCartons.toLocaleString()} ctn`;
  }
  return `${prefix}: ${minCartons.toLocaleString()} - ${maxCartons.toLocaleString()} ctn`;
}
