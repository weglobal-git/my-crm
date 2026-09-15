"use client";

import { useState, useMemo } from "react";
import { Target } from "lucide-react";
import type { AccountSaleProgress } from "@/lib/dashboard/sales-overview";

export type SortOption = "lowest" | "highest" | "alphabetical";

interface SaleTrackingGridProps {
  tracking: AccountSaleProgress[];
  year: number;
  sortOption?: SortOption;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function SaleTrackingGrid({ tracking, year, sortOption = "lowest" }: SaleTrackingGridProps) {
  const [showAll, setShowAll] = useState(false);

  const sortedTracking = useMemo(() => {
    const list = [...tracking];
    if (sortOption === "lowest") {
      return list.sort(
        (a, b) =>
          (a.percentage ?? Number.POSITIVE_INFINITY) - (b.percentage ?? Number.POSITIVE_INFINITY) ||
          a.accountName.localeCompare(b.accountName)
      );
    }
    if (sortOption === "highest") {
      return list.sort(
        (a, b) =>
          (b.percentage ?? -1) - (a.percentage ?? -1) ||
          a.accountName.localeCompare(b.accountName)
      );
    }
    return list.sort((a, b) => a.accountName.localeCompare(b.accountName));
  }, [tracking, sortOption]);

  const displayedItems = showAll ? sortedTracking : sortedTracking.slice(0, 6);

  if (tracking.length === 0) {
    return (
      <div className="rounded-[2rem] border border-[#4E4F50] bg-[#3A3B3C] p-6 text-sm text-slate-400">
        No accounts have a sale target for {year}.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {displayedItems.map((item) => {
          const isZeroTarget = item.target === 0;
          const percentage = item.percentage;
          const isReached = percentage !== null && percentage >= 100;
          const visualProgress = percentage === null ? 0 : Math.min(Math.max(percentage, 0), 100);

          return (
            <article
              key={`${item.companyId}-${item.currency}`}
              className="rounded-[1.5rem] border border-[#4E4F50] bg-[#3A3B3C] p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-100 truncate text-sm">
                      {item.accountName}
                    </h3>
                    <div className="mt-1 text-xs text-slate-400">
                      <div>
                        {formatMoney(item.actual, item.currency)} /{" "}
                        {formatMoney(item.target, item.currency)}
                      </div>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        {isZeroTarget ? (
                          <span className="text-amber-400 font-medium">
                            (Target is 0)
                          </span>
                        ) : isReached ? (
                          <span className="text-[#C7F33C] font-medium">
                            (Target achieved)
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            ({formatMoney(Math.max(item.target - item.actual, 0), item.currency)} remaining)
                          </span>
                        )}
                        {item.excludedCurrencyDealCount > 0 && (
                          <span className="text-slate-500 text-[11px]">
                            ({item.excludedCurrencyDealCount} other currency {item.excludedCurrencyDealCount === 1 ? "deal" : "deals"} excluded)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {percentage === null ? (
                      <span className="text-xs font-semibold text-slate-400">—</span>
                    ) : (
                      <span
                        className={`text-xl font-bold tracking-tight ${
                          isReached ? "text-[#C7F33C]" : "text-slate-100"
                        }`}
                      >
                        {Math.round(percentage)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar (Flat design, no gradient/shadow) */}
                <div
                  className="mt-6 h-2.5 overflow-hidden rounded-full bg-[#252728]"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(visualProgress)}
                  aria-label={`${item.accountName} target progress`}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300 bg-[#C7F33C]"
                    style={{ width: `${visualProgress}%` }}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Show more toggle */}
      {tracking.length > 6 && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="px-4 py-1.5 rounded-full border border-[#4E4F50] bg-[#3A3B3C] text-xs font-medium text-slate-300 hover:text-white hover:border-slate-300 transition-colors"
          >
            {showAll ? "Show less" : `Show all ${tracking.length} accounts`}
          </button>
        </div>
      )}
    </div>
  );
}
