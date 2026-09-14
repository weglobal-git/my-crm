"use client";

import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import type { DashboardSectionAccess, SalesOverviewSnapshot } from "@/lib/dashboard/sales-overview";
import { MonthlySalesReport } from "./MonthlySalesReport";
import { SaleTrackingGrid, type SortOption } from "./SaleTrackingGrid";
import { AnnualSalesReportTable } from "./AnnualSalesReportTable";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

interface SalesSummarySectionProps {
  snapshot: SalesOverviewSnapshot;
  sections: DashboardSectionAccess;
}

export function SalesSummarySection({ snapshot, sections }: SalesSummarySectionProps) {
  const [showDeals, setShowDeals] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("lowest");
  const monthName = MONTHS[snapshot.period.month - 1];
  const year = snapshot.period.year;

  return (
    <div className="space-y-8">
      {/* Monthly Report */}
      {sections.saleSummary && <section aria-labelledby="sale-summary-heading" className="space-y-4 p-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C7F33C]">
            Sale Summary
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <h2 id="sale-summary-heading" className="text-xl font-bold text-slate-100">
              {monthName} {year}
            </h2>
            <div className="flex items-center gap-3">
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

        <MonthlySalesReport monthly={snapshot.monthly} showDeals={showDeals} />
      </section>}

      {/* Sale Tracking */}
      {sections.saleTracking && <section aria-labelledby="tracking-heading" className="space-y-4 p-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C7F33C]">
            Sale Tracking
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <h2 id="tracking-heading" className="text-xl font-bold text-slate-100">
              Annual Target Progress ({year})
            </h2>
            {snapshot.tracking.length > 0 && (
              <div className="flex items-center gap-1.5">
                <label htmlFor="sort-tracking" className="sr-only">
                  Sort tracking accounts
                </label>
                <div className="flex items-center gap-1 text-xs text-slate-400 bg-[#252728] px-2.5 py-1 rounded-lg border border-[#4E4F50]">
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  <select
                    id="sort-tracking"
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as SortOption)}
                    className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
                  >
                    <option value="lowest" className="bg-[#252728]">
                      Lowest progress first
                    </option>
                    <option value="highest" className="bg-[#252728]">
                      Highest progress first
                    </option>
                    <option value="alphabetical" className="bg-[#252728]">
                      Account A–Z
                    </option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        <SaleTrackingGrid tracking={snapshot.tracking} year={year} sortOption={sortOption} />
      </section>}

      {/* Annual Sale Report */}
      {sections.annualSaleReport && <section aria-labelledby="annual-heading" className="space-y-4 pb-6 p-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C7F33C]">
            Annual Sale Report
          </p>
          <h2 id="annual-heading" className="mt-1 text-xl font-bold text-slate-100">
            Five-Year Account Performance
          </h2>
        </div>

        <AnnualSalesReportTable annual={snapshot.annual} anchorYear={year} />
      </section>}
    </div>
  );
}
