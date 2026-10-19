"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CompanyCostOverhead,
  CommercialRates,
  DEFAULT_COMPANY_COST_OVERHEAD,
  DEFAULT_COMMERCIAL_RATES,
  COMPANY_COST_OVERHEAD_STORAGE_KEY,
  COMPANY_COST_OVERHEAD_EVENT,
  getTotalOverheadPercent,
  getCommercialRatesFromOverhead,
  calculateEffectiveCost,
  getCostBreakdown,
  getLocalCompanyCostOverhead,
  setLocalCompanyCostOverhead,
} from "./company-cost-overhead";
import { getCompanyCostOverheadAction } from "@/lib/actions/company-cost";

export {
  type CompanyCostOverhead,
  type CommercialRates,
  DEFAULT_COMPANY_COST_OVERHEAD,
  DEFAULT_COMMERCIAL_RATES,
  COMPANY_COST_OVERHEAD_STORAGE_KEY,
  COMPANY_COST_OVERHEAD_EVENT,
  getTotalOverheadPercent,
  getCommercialRatesFromOverhead,
  calculateEffectiveCost,
  getCostBreakdown,
  getLocalCompanyCostOverhead,
  setLocalCompanyCostOverhead,
};

let hasHydratedFromDb = false;

/**
 * React Hook to subscribe to and manage Company Cost Overhead & Commercial Deduction Rates configuration.
 * Instantly loads from localStorage and syncs across all tabs & components.
 */
export function useCompanyCostOverhead() {
  const [overhead, setOverhead] = useState<CompanyCostOverhead>(() => getLocalCompanyCostOverhead());

  useEffect(() => {
    // Sync when storage event or custom event triggers
    const handleUpdate = (e: Event) => {
      if (e instanceof CustomEvent && e.detail) {
        setOverhead(e.detail);
      } else {
        setOverhead(getLocalCompanyCostOverhead());
      }
    };

    window.addEventListener(COMPANY_COST_OVERHEAD_EVENT, handleUpdate);
    window.addEventListener("storage", handleUpdate);

    if (!hasHydratedFromDb) {
      hasHydratedFromDb = true;
      void getCompanyCostOverheadAction().then((dbData) => {
        if (dbData) {
          setLocalCompanyCostOverhead(dbData);
        }
      });
    }

    return () => {
      window.removeEventListener(COMPANY_COST_OVERHEAD_EVENT, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const totalPercent = getTotalOverheadPercent(overhead);

  const commercialRates = useMemo(
    () => getCommercialRatesFromOverhead(overhead),
    [overhead]
  );

  const getEffective = useCallback(
    (baseCost: number | null | undefined) => calculateEffectiveCost(baseCost, overhead),
    [overhead]
  );

  const getBreakdown = useCallback(
    (baseCost: number | null | undefined) => getCostBreakdown(baseCost, overhead),
    [overhead]
  );

  return {
    overhead,
    totalPercent,
    commercialRates,
    calculateEffectiveCost: getEffective,
    getCostBreakdown: getBreakdown,
    updateOverhead: setLocalCompanyCostOverhead,
  };
}

