"use client";

import { useMemo, useState } from "react";
import {
  SlidersHorizontal,
  RefreshCw,
  AlertCircle,
  Trophy,
  Briefcase,
  Globe,
  Building2,
  X,
} from "lucide-react";
import {
  getBangkokMonth,
  getBangkokYear,
  type FilterCountryOption,
  type FilterAccountOption,
} from "@/lib/dashboard/sales-overview";
import dynamic from "next/dynamic";
import type { PrintSections } from "./DashboardPrintReport";
import type { DashboardSectionAccess } from "@/lib/dashboard/sales-overview";

const DashboardFiltersDrawer = dynamic(
  () => import("./DashboardFiltersDrawer").then((mod) => mod.DashboardFiltersDrawer),
  { ssr: false }
);

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export type DashboardTab = "leaderboard" | "sale_deal";

interface DashboardToolbarProps {
  month: number;
  year: number;
  country?: string | null;
  account?: string | null;
  availableCountries?: FilterCountryOption[];
  availableAccounts?: FilterAccountOption[];
  isPending: boolean;
  onChangePeriod: (month: number, year: number) => void;
  onApplyFilters?: (filters: {
    month: number;
    year: number;
    country?: string | null;
    account?: string | null;
  }) => void;
  onClearCountry?: () => void;
  onClearAccount?: () => void;
  onRefresh: () => void;
  isStale?: boolean;
  onPrint?: (sections: PrintSections, targetMonth: number, targetYear: number) => void;
  activeTab?: DashboardTab;
  onTabChange?: (tab: DashboardTab) => void;
  canSeeSales?: boolean;
  allowedSections: DashboardSectionAccess;
}

export function DashboardToolbar({
  month,
  year,
  country,
  account,
  availableCountries = [],
  availableAccounts = [],
  isPending,
  onChangePeriod,
  onApplyFilters,
  onClearCountry,
  onClearAccount,
  onRefresh,
  isStale = false,
  onPrint,
  activeTab = "sale_deal",
  onTabChange,
  canSeeSales = true,
  allowedSections,
}: DashboardToolbarProps) {
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [hasOpenedFilters, setHasOpenedFilters] = useState(false);
  const currentYear = getBangkokYear();
  const currentMonth = getBangkokMonth();
  const isCustomPeriod = month !== currentMonth || year !== currentYear;
  const hasCustomFilters = Boolean(country || account);

  const selectedCountryObj = useMemo(() => {
    if (!country) return null;
    return (
      availableCountries.find(
        (c) =>
          c.code.toLowerCase() === country.toLowerCase() ||
          c.name.toLowerCase() === country.toLowerCase()
      ) || null
    );
  }, [country, availableCountries]);

  return (
    <>
      <header className="sticky -top-2 z-20 bg-[#252728] -mt-2 pt-2.5 pb-2 px-1 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Pill Tab Switcher matching PipelineView */}
          <div className="flex gap-1.5 bg-[#252728] p-1 rounded-full shrink-0 border border-[#3A3B3C]">
            <button
              type="button"
              onClick={() => onTabChange?.("leaderboard")}
              className={`px-5 py-2 text-xs font-semibold flex items-center gap-2 rounded-full transition-all cursor-pointer ${
                activeTab === "leaderboard"
                  ? "bg-[#3A3B3C] text-slate-100"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>Leaderboard</span>
            </button>

            {canSeeSales && (
              <button
                type="button"
                onClick={() => onTabChange?.("sale_deal")}
                className={`px-5 py-2 text-xs font-semibold flex items-center gap-2 rounded-full transition-all cursor-pointer ${
                  activeTab === "sale_deal"
                    ? "bg-[#3A3B3C] text-slate-100"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Briefcase className="w-3.5 h-3.5" />
                <span>Sale Deal</span>
              </button>
            )}
          </div>

          {/* Active Global Filter Badges */}
          {country && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#3A3B3C] border border-amber-500/50 text-amber-300">
              <Globe className="w-3 h-3 text-amber-400" />
              <span>{selectedCountryObj ? `${selectedCountryObj.name}` : country}</span>
              {onClearCountry && (
                <button
                  type="button"
                  onClick={onClearCountry}
                  className="p-0.5 hover:text-white text-amber-400/80 cursor-pointer ml-0.5 transition-colors"
                  title="Clear country filter"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          )}

          {account && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#3A3B3C] border border-amber-500/50 text-amber-300">
              <Building2 className="w-3 h-3 text-amber-400" />
              <span className="max-w-[150px] truncate">{account}</span>
              {onClearAccount && (
                <button
                  type="button"
                  onClick={onClearAccount}
                  className="p-0.5 hover:text-white text-amber-400/80 cursor-pointer ml-0.5 transition-colors"
                  title="Clear account filter"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          )}

          {isStale && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-950/60 border border-amber-800/80 text-amber-300">
              <AlertCircle className="w-3 h-3" />
              Data may be outdated
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Standard Filters Button matching Pipeline */}
          <button
            type="button"
            onClick={() => {
              setHasOpenedFilters(true);
              setIsFiltersOpen(true);
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer ${
              isCustomPeriod || hasCustomFilters
                ? "bg-[#C7F33C]/10 border-[#C7F33C] text-[#C7F33C]"
                : "bg-[#252728] border-[#3A3B3C] text-slate-300 hover:text-white hover:bg-[#3A3B3C]"
            }`}
            title="Period & Filters"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                isCustomPeriod || hasCustomFilters
                  ? "bg-[#C7F33C] text-black"
                  : "bg-[#3A3B3C] text-slate-200 border border-[#4E4F50]"
              }`}
            >
              {MONTHS[month - 1].slice(0, 3)} {year}
            </span>
            {hasCustomFilters && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-black">
                {(country ? 1 : 0) + (account ? 1 : 0)}
              </span>
            )}
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isPending}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#3A3B3C] bg-[#252728] text-slate-300 hover:text-white hover:bg-[#3A3B3C] disabled:opacity-50 transition-colors cursor-pointer"
            aria-label="Refresh dashboard"
            title="Refresh dashboard"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {/* Standard Period Filters Drawer (Loaded dynamically on first open) */}
      {hasOpenedFilters && (
        <DashboardFiltersDrawer
          isOpen={isFiltersOpen}
          onClose={() => setIsFiltersOpen(false)}
          month={month}
          year={year}
          country={country}
          account={account}
          availableCountries={availableCountries}
          availableAccounts={availableAccounts}
          onChangePeriod={onChangePeriod}
          onApplyFilters={onApplyFilters}
          onPrint={onPrint}
          allowedSections={allowedSections}
        />
      )}
    </>
  );
}
