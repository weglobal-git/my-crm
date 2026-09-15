"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown, Sparkles } from "lucide-react";
import {
  calculateSharePercent,
  calculateYoY,
  type AnnualAccountSales,
  type MoneyTotal,
} from "@/lib/dashboard/sales-overview";

interface AnnualSalesReportTableProps {
  annual: {
    years: number[];
    allYears?: number[];
    totals: Record<number, MoneyTotal[]>;
    accounts: AnnualAccountSales[];
  };
  anchorYear: number;
  visibleYears?: number[];
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function AnnualSalesReportTable({
  annual,
  anchorYear,
  visibleYears,
}: AnnualSalesReportTableProps) {
  const { totals, accounts } = annual;
  const years = visibleYears || annual.years;

  // Build lookup maps for total per year and currency
  const yearCurrencyTotalMap = useMemo(() => {
    const map = new Map<string, number>(); // `${year}-${currency}` -> total
    for (const yr of years) {
      const yrTotals = totals[yr] || [];
      for (const t of yrTotals) {
        map.set(`${yr}-${t.currency}`, t.amount);
      }
    }
    return map;
  }, [years, totals]);

  return (
    <div className="overflow-hidden rounded-[2rem] border border-[#4E4F50] bg-[#3A3B3C]">
      <div className="overflow-x-auto">
        <table className="min-w-[850px] w-full border-separate border-spacing-0 text-left text-xs">
          <thead>
            <tr className="bg-[#2E2F30]">
              <th className="sticky left-0 z-20 bg-[#2E2F30] px-5 py-4 font-semibold text-slate-300 w-64 shadow-[1px_0_0_#4E4F50] border-b border-[#4E4F50]">
                Account
              </th>
              {years.map((year) => {
                const yearTotals = totals[year] || [];
                const isAnchor = year === anchorYear;
                const hasAccounts = accounts.length > 0;

                return (
                  <th
                    key={year}
                    className={`px-4 py-4 font-semibold text-slate-200 min-w-[140px] transition-colors ${
                      isAnchor
                        ? `bg-[#C7F33C]/10 border-t-2 border-l-2 border-r-2 border-[#C7F33C]/60 ${
                            hasAccounts ? "rounded-t-2xl" : "rounded-2xl border-b-2 border-[#C7F33C]/60"
                          }`
                        : "border-b border-[#4E4F50]"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{year}</span>
                      {isAnchor && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#C7F33C] text-black">
                          Selected
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 space-y-0.5 text-[11px] font-normal">
                      {yearTotals.length === 0 ? (
                        <span className="text-slate-500">—</span>
                      ) : (
                        yearTotals.map((yt) => (
                          <div key={yt.currency} className="text-slate-300 font-medium">
                            {formatMoney(yt.amount, yt.currency)}
                          </div>
                        ))
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td
                  colSpan={years.length + 1}
                  className="px-5 py-12 text-center text-slate-400 text-xs"
                >
                  No won sales recorded in this period.
                </td>
              </tr>
            ) : (
              accounts.map((account, accountIndex) => {
                const isLastRow = accountIndex === accounts.length - 1;

                return (
                  <tr
                    key={account.companyId || account.accountName}
                    className="hover:bg-[#434445]/40 transition-colors"
                  >
                    <th className="sticky left-0 z-10 bg-[#3A3B3C] px-5 py-3.5 font-medium text-slate-100 shadow-[1px_0_0_#4E4F50] whitespace-nowrap">
                      <span className="truncate max-w-[220px] block" title={account.accountName}>
                        {account.accountName}
                      </span>
                      {account.country && (
                        <span
                          className="truncate max-w-[220px] block text-[11px] font-normal text-slate-400 mt-0.5"
                          title={account.country}
                        >
                          {account.country}
                        </span>
                      )}
                    </th>

                    {years.map((year, yearIndex) => {
                      const values = account.values[year] || [];
                      const previousYear = years[yearIndex + 1]; // Array is sorted descending [2026, 2025, ...]
                      const previousValues = previousYear ? account.values[previousYear] || [] : [];
                      const isAnchor = year === anchorYear;

                      return (
                        <td
                          key={year}
                          className={`px-4 py-3.5 align-top transition-colors ${
                            isAnchor
                              ? `bg-[#C7F33C]/5 border-l-2 border-r-2 border-[#C7F33C]/40 ${
                                  isLastRow
                                    ? "border-b-2 border-[#C7F33C]/60 rounded-b-2xl"
                                    : ""
                                }`
                              : ""
                          }`}
                        >
                        {values.length === 0 ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <div className="space-y-2">
                            {values.map((v) => {
                              const totalForCurrency =
                                yearCurrencyTotalMap.get(`${year}-${v.currency}`) || 0;
                              const share = calculateSharePercent(v.amount, totalForCurrency);

                              const prevVal =
                                previousValues.find((pv) => pv.currency === v.currency)?.amount || 0;
                              const hasOrderedBefore = Object.entries(account.values).some(
                                ([priorYearStr, priorVals]) => {
                                  const priorYear = Number(priorYearStr);
                                  return priorYear < year && priorVals.some((pv) => pv.amount > 0);
                                }
                              );
                              const yoy = previousYear
                                ? calculateYoY(v.amount, prevVal, hasOrderedBefore)
                                : null;

                              return (
                                <div key={v.currency} className="space-y-0.5">
                                  <div className="font-semibold text-slate-100">
                                    {formatMoney(v.amount, v.currency)}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                    {share !== null && (
                                      <span className="text-slate-400" title="Share of year total">
                                        {share}% share
                                      </span>
                                    )}

                                    {yoy && (
                                      <>
                                        {yoy.type === "new" ? (
                                          <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded font-bold bg-[#C7F33C]/20 text-[#C7F33C] border border-[#C7F33C]/30">
                                            <Sparkles className="w-2.5 h-2.5" />
                                            New
                                          </span>
                                        ) : yoy.deltaPercent > 0 ? (
                                          <span className="inline-flex items-center gap-0.5 text-[#C7F33C] font-semibold">
                                            <TrendingUp className="w-2.5 h-2.5" />
                                            +{yoy.deltaPercent}%
                                          </span>
                                        ) : yoy.deltaPercent < 0 ? (
                                          <span className="inline-flex items-center gap-0.5 text-rose-400 font-semibold">
                                            <TrendingDown className="w-2.5 h-2.5" />
                                            {yoy.deltaPercent}%
                                          </span>
                                        ) : (
                                          <span className="text-slate-500 font-medium">0%</span>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
