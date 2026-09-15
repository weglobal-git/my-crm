"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import type { DashboardSectionAccess, SalesOverviewSnapshot } from "@/lib/dashboard/sales-overview";
import { MonthlySalesReport } from "./MonthlySalesReport";
import { SaleTrackingGrid, type SortOption } from "./SaleTrackingGrid";
import { AnnualSalesReportTable } from "./AnnualSalesReportTable";

const WorldMapSection = dynamic(
  () => import("./WorldMapSection").then((mod) => mod.WorldMapSection),
  {
    loading: () => (
      <div className="space-y-4 p-2">
        <div className="space-y-1">
          <div className="h-3 w-20 rounded bg-[#3A3B3C] animate-pulse" />
          <div className="h-6 w-48 rounded bg-[#3A3B3C] animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col justify-center min-h-[440px] rounded-[2rem] border border-[#4E4F50] bg-[#3A3B3C]/40 animate-pulse" />
          <div className="lg:col-span-5 xl:col-span-4 min-h-[630px] rounded-[2rem] border border-[#4E4F50] bg-[#3A3B3C]/40 animate-pulse" />
        </div>
      </div>
    ),
    ssr: false,
  }
);

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "lowest", label: "Lowest first" },
  { value: "highest", label: "Highest first" },
  { value: "alphabetical", label: "Account A–Z" },
];

interface SalesSummarySectionProps {
  snapshot: SalesOverviewSnapshot;
  sections: DashboardSectionAccess;
  onCountryFilterChange?: (countryCode: string | null) => void;
}

export function SalesSummarySection({
  snapshot,
  sections,
  onCountryFilterChange,
}: SalesSummarySectionProps) {
  const [summaryPeriod, setSummaryPeriod] = useState<"month" | "year">("month");
  const [showDeals, setShowDeals] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("lowest");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);

  const monthName = MONTHS[snapshot.period.month - 1];
  const year = snapshot.period.year;

  // Close sort menu on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowSortMenu(false);
      }
    };
    if (showSortMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showSortMenu]);

  const activeSummaryData =
    summaryPeriod === "year" ? (snapshot.yearly || snapshot.monthly) : snapshot.monthly;

  // Annual report year window navigation
  const allAvailableAnnualYears = useMemo(() => {
    const list = snapshot.annual.allYears || snapshot.annual.years;
    const set = new Set<number>([year, ...list]);
    return Array.from(set).sort((a, b) => b - a);
  }, [snapshot.annual, year]);

  const maxAvailableYear = allAvailableAnnualYears[0] || year;
  const minAvailableYear = allAvailableAnnualYears[allAvailableAnnualYears.length - 1] || year - 4;

  const [windowEndYear, setWindowEndYear] = useState<number>(year);

  useEffect(() => {
    setWindowEndYear(year);
  }, [year]);

  const visibleYears = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => windowEndYear - i);
  }, [windowEndYear]);

  const minVisibleYear = visibleYears[visibleYears.length - 1];
  const maxVisibleYear = visibleYears[0];

  const canGoPrev = minVisibleYear > minAvailableYear;
  const canGoNext = maxVisibleYear < maxAvailableYear;

  const handlePrevYears = () => {
    if (!canGoPrev) return;
    setWindowEndYear((prev) => prev - 1);
  };

  const handleNextYears = () => {
    if (!canGoNext) return;
    setWindowEndYear((prev) => prev + 1);
  };

  return (
    <div className="space-y-8">
      {/* World Map Section (Placed directly above SALE SUMMARY) */}
      {snapshot.worldMap && (
        <WorldMapSection
          worldMap={snapshot.worldMap}
          year={year}
          month={snapshot.period.month}
          initialCountryCode={snapshot.filters?.country || null}
          onCountryFilterChange={onCountryFilterChange}
        />
      )}

      {/* Sale Summary Report (Monthly / Yearly) */}
      {sections.saleSummary && (
        <section aria-labelledby="sale-summary-heading" className="space-y-4 p-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C7F33C]">
              Sale Summary
            </p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <h2 id="sale-summary-heading" className="text-xl font-bold text-slate-100">
                {summaryPeriod === "year" ? `Year ${year}` : `${monthName} ${year}`}
              </h2>
              <div className="flex items-center gap-3">
                {/* Year / Month Switcher Pill */}
                <div className="flex items-center bg-[#252728] p-0.5 rounded-full border border-[#4E4F50]/80 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSummaryPeriod("year")}
                    className={`px-2.5 py-0.5 font-semibold rounded-full transition-all cursor-pointer ${
                      summaryPeriod === "year"
                        ? "bg-[#3A3B3C] text-slate-100"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Year
                  </button>
                  <button
                    type="button"
                    onClick={() => setSummaryPeriod("month")}
                    className={`px-2.5 py-0.5 font-semibold rounded-full transition-all cursor-pointer ${
                      summaryPeriod === "month"
                        ? "bg-[#3A3B3C] text-slate-100"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Month
                  </button>
                </div>

                {/* Show Deals Button */}
                <button
                  type="button"
                  onClick={() => setShowDeals((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-[#4E4F50] bg-[#252728] text-xs font-semibold text-slate-200 hover:text-white hover:border-slate-300 transition-colors cursor-pointer"
                >
                  {showDeals ? "Hide Deals" : "Show Deals"}
                </button>
              </div>
            </div>
          </div>

          <MonthlySalesReport
            monthly={activeSummaryData}
            periodType={summaryPeriod}
            showDeals={showDeals}
          />
        </section>
      )}

      {/* Sale Tracking */}
      {sections.saleTracking && (
        <section aria-labelledby="tracking-heading" className="space-y-4 p-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C7F33C]">
              Sale Tracking
            </p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <h2 id="tracking-heading" className="text-xl font-bold text-slate-100">
                Annual Progress ({year})
              </h2>
              {snapshot.tracking.length > 0 && (
                <div className="relative" ref={sortMenuRef}>
                  <button
                    type="button"
                    id="sort-tracking-button"
                    onClick={() => setShowSortMenu((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-slate-200 bg-[#252728] hover:border-slate-300 px-2.5 py-1 rounded-lg border border-[#4E4F50] transition-colors cursor-pointer"
                    aria-haspopup="listbox"
                    aria-expanded={showSortMenu}
                  >
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    <span>
                      {SORT_OPTIONS.find((o) => o.value === sortOption)?.label || "Sort"}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                        showSortMenu ? "rotate-180 text-[#C7F33C]" : ""
                      }`}
                    />
                  </button>

                  {showSortMenu && (
                    <div className="absolute right-0 top-full mt-1.5 min-w-[140px] bg-[#252728] border border-[#3A3B3C] rounded-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                      {SORT_OPTIONS.map((option) => {
                        const isSelected = sortOption === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              setSortOption(option.value);
                              setShowSortMenu(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium rounded-lg transition-colors text-left cursor-pointer ${
                              isSelected
                                ? "bg-[#3A3B3C] text-[#C7F33C]"
                                : "text-slate-200 hover:bg-[#3A3B3C] hover:text-white"
                            }`}
                          >
                            <span className="truncate">{option.label}</span>
                            {isSelected && (
                              <Check className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <SaleTrackingGrid tracking={snapshot.tracking} year={year} sortOption={sortOption} />
        </section>
      )}

      {/* Annual Sale Report */}
      {sections.annualSaleReport && (
        <section aria-labelledby="annual-heading" className="space-y-4 pb-6 p-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C7F33C]">
                Annual Sale Report
              </p>
              <h2 id="annual-heading" className="mt-1 text-xl font-bold text-slate-100">
                Five-Year Account Performance
              </h2>
            </div>

            {/* Previous / Next Year Navigation */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-[#252728] p-1 rounded-full border border-[#4E4F50]/80 text-xs font-semibold">
                <button
                  type="button"
                  onClick={handlePrevYears}
                  disabled={!canGoPrev}
                  className={`px-3 py-1.5 mr-1 rounded-full flex items-center gap-1 transition-all ${
                    canGoPrev
                      ? "text-slate-300 hover:text-white hover:bg-[#3A3B3C] cursor-pointer"
                      : "text-slate-600 cursor-not-allowed opacity-40"
                  }`}
                  title={canGoPrev ? "View earlier years" : "No earlier data available"}
                  aria-label="View earlier years"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>

                <span className="px-3 py-1 text-slate-200 font-bold border-x border-[#3A3B3C] select-none text-[11px]">
                  {minVisibleYear} – {maxVisibleYear}
                </span>

                <button
                  type="button"
                  onClick={handleNextYears}
                  disabled={!canGoNext}
                  className={`px-3 py-1.5 ml-1 rounded-full flex items-center gap-1 transition-all ${
                    canGoNext
                      ? "text-slate-300 hover:text-white hover:bg-[#3A3B3C] cursor-pointer"
                      : "text-slate-600 cursor-not-allowed opacity-40"
                  }`}
                  title={canGoNext ? "View newer years" : "Already at latest year"}
                  aria-label="View newer years"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <AnnualSalesReportTable
            annual={snapshot.annual}
            anchorYear={year}
            visibleYears={visibleYears}
          />
        </section>
      )}
    </div>
  );
}
