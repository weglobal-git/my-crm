"use client";

import { useState } from "react";
import { SlidersHorizontal, RefreshCw, AlertCircle, Trophy, Briefcase } from "lucide-react";
import { getBangkokMonth, getBangkokYear } from "@/lib/dashboard/sales-overview";
import { DashboardFiltersDrawer } from "./DashboardFiltersDrawer";
import type { PrintSections } from "./DashboardPrintReport";
import type { DashboardSectionAccess } from "@/lib/dashboard/sales-overview";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export type DashboardTab = "leaderboard" | "sale_deal";

interface DashboardToolbarProps {
  month: number;
  year: number;
  isPending: boolean;
  onChangePeriod: (month: number, year: number) => void;
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
  isPending,
  onChangePeriod,
  onRefresh,
  isStale = false,
  onPrint,
  activeTab = "sale_deal",
  onTabChange,
  canSeeSales = true,
  allowedSections,
}: DashboardToolbarProps) {
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const currentYear = getBangkokYear();
  const currentMonth = getBangkokMonth();
  const isCustomPeriod = month !== currentMonth || year !== currentYear;

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 p-2">
        <div className="flex items-center gap-3">
          {/* Pill Tab Switcher matching PipelineView */}
          <div className="flex gap-1.5 bg-[#252728] p-1 rounded-full shrink-0 border border-[#3A3B3C]">
            <button
              type="button"
              onClick={() => onTabChange?.("leaderboard")}
              className={`px-5 py-2 text-xs font-semibold flex items-center gap-2 rounded-full transition-all cursor-pointer ${
                activeTab === "leaderboard"
                  ? "bg-[#3A3B3C] text-slate-100 shadow-sm"
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
                    ? "bg-[#3A3B3C] text-slate-100 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Briefcase className="w-3.5 h-3.5" />
                <span>Sale Deal</span>
              </button>
            )}
          </div>

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
            onClick={() => setIsFiltersOpen(true)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer ${
              isCustomPeriod
                ? "bg-[#C7F33C]/10 border-[#C7F33C] text-[#C7F33C]"
                : "bg-[#252728] border-[#3A3B3C] text-slate-300 hover:text-white hover:bg-[#3A3B3C]"
            }`}
            title="Manage & Filters"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                isCustomPeriod
                  ? "bg-[#C7F33C] text-black"
                  : "bg-[#3A3B3C] text-slate-200 border border-[#4E4F50]"
              }`}
            >
              {MONTHS[month - 1].slice(0, 3)} {year}
            </span>
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

      {/* Standard Period Filters Drawer (2-column: Year on left, Month on right) */}
      <DashboardFiltersDrawer
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        month={month}
        year={year}
        onChangePeriod={onChangePeriod}
        onPrint={onPrint}
        allowedSections={allowedSections}
      />
    </>
  );
}
