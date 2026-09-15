"use client";

import { useLayoutEffect } from "react";
import type { SalesOverviewSnapshot } from "@/lib/dashboard/sales-overview";
import { calculateSharePercent, calculateYoY } from "@/lib/dashboard/sales-overview";
import { WORLD_MAP_FEATURES, WORLD_MAP_VIEWBOX } from "@/lib/data/world-map-paths";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export interface PrintSections {
  worldMap: boolean;
  worldMapPeriod: "all_time" | "year" | "month";
  saleSummary: boolean;
  saleSummaryPeriod: "year" | "month";
  saleTracking: boolean;
  annualReport: boolean;
}

interface DashboardPrintReportProps {
  snapshot: SalesOverviewSnapshot;
  sections: PrintSections;
  onReady?: () => void;
}

function formatMoney(amount: number | null, currency: string) {
  if (amount === null || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(d);
}

function PrintWorldMap({
  snapshot,
  period,
}: {
  snapshot: SalesOverviewSnapshot;
  period: PrintSections["worldMapPeriod"];
}) {
  const year = snapshot.period.year;
  const report = period === "all_time"
    ? snapshot.worldMap.allTime
    : period === "month"
      ? snapshot.worldMap.selectedMonth
      : snapshot.worldMap.byYear[year] || snapshot.worldMap.allTime;
  const periodLabel = period === "all_time"
    ? "all time"
    : period === "month"
      ? `${MONTHS[snapshot.period.month - 1]} ${year}`
      : String(year);
  const countryByCode = new Map(
    report.countries.map((country) => [country.countryCode.toUpperCase(), country])
  );
  const maxAmount = Math.max(0, ...report.countries.map((country) => country.totalAmount));
  const leadingCountries = report.countries.slice(0, 8);

  return (
    <div className="rounded-2xl border border-slate-300 bg-white p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_180px] items-center gap-5">
        <svg
          viewBox={WORLD_MAP_VIEWBOX}
          className="h-auto w-full bg-white"
          aria-label={`Sales distribution map for ${periodLabel}`}
        >
          <g>
            {WORLD_MAP_FEATURES.map((feature) => {
              const country = countryByCode.get(feature.id.toUpperCase());
              const ratio = country && maxAmount > 0 ? country.totalAmount / maxAmount : 0;
              const fill = country
                ? ratio >= 0.5
                  ? "#B8D45A"
                  : ratio >= 0.15
                    ? "#DCE8B5"
                    : "#EEF3DF"
                : "#FFFFFF";

              return feature.paths.map((path, index) => (
                <path
                  key={`${feature.id}-${index}`}
                  d={path}
                  fill={fill}
                  stroke="#94A3B8"
                  strokeWidth="0.35"
                />
              ));
            })}
          </g>
        </svg>

        <div className="border-l border-slate-200 pl-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Leading countries
          </p>
          <div className="mt-2 space-y-1.5">
            {leadingCountries.length === 0 ? (
              <p className="text-[10px] italic text-slate-400">No sales recorded.</p>
            ) : (
              leadingCountries.map((country, index) => (
                <div key={country.countryCode} className="flex items-baseline justify-between gap-2 text-[10px]">
                  <span className="min-w-0 truncate text-slate-700">
                    {index + 1}. {country.countryName}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-bold text-slate-900">
                      {formatMoney(country.totalAmount, country.currency)}
                    </span>
                    <span className="block text-[8px] text-slate-500">
                      {country.dealCount} {country.dealCount === 1 ? "deal" : "deals"}
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2 text-[10px] text-slate-500">
        <span>{report.totalCountries} countries • {report.totalDeals} deals</span>
        <span>Light shading indicates relative sales volume</span>
      </div>
    </div>
  );
}

export function DashboardPrintReport({ snapshot, sections, onReady }: DashboardPrintReportProps) {
  useLayoutEffect(() => {
    onReady?.();
  }, [onReady]);

  const { month, year } = snapshot.period;
  const monthName = MONTHS[month - 1];
  const mapPeriodLabel = sections.worldMapPeriod === "all_time"
    ? "All time"
    : sections.worldMapPeriod === "month"
      ? `${monthName} ${year}`
      : String(year);
  const summary = sections.saleSummaryPeriod === "year" ? snapshot.yearly : snapshot.monthly;
  const summaryPeriodLabel = sections.saleSummaryPeriod === "year" ? String(year) : `${monthName} ${year}`;
  const summaryPeriodNoun = sections.saleSummaryPeriod === "year" ? "Year" : "Month";
  const nowFormatted = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date());

  const anchorYear = snapshot.annual.years[0] || year;
  const years = snapshot.annual.years;
  const sectionOrder = [
    sections.worldMap,
    sections.saleSummary,
    sections.saleTracking,
    sections.annualReport,
  ];
  const sectionNumber = (index: number) =>
    sectionOrder.slice(0, index + 1).filter(Boolean).length;

  // Build yearCurrencyTotalMap for annual report
  const yearCurrencyTotalMap = new Map<string, number>();
  for (const yr of years) {
    for (const total of snapshot.annual.totals[yr] || []) {
      yearCurrencyTotalMap.set(`${yr}-${total.currency}`, total.amount);
    }
  }

  return (
    <div
      id="dashboard-print-report"
      className="hidden print:block w-full bg-white text-slate-900 font-sans text-xs p-6 print:p-0 leading-normal"
    >
      {/* Printable Header */}
      <header className="print-report-header border-b-2 border-slate-900 pb-4 mb-6 flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            SB Interlab CRM
          </p>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 mt-0.5">
            Sales Overview Report
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Period: <span className="font-bold text-slate-900">{monthName} {year}</span>
            {" • "}
            Scope: <span className="font-semibold text-slate-900">{snapshot.scopeLabel}</span>
          </p>
        </div>

        <div className="text-right text-[11px] text-slate-500">
          <p>Printed: {nowFormatted} (BKK)</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Confidential • Internal Use Only</p>
        </div>
      </header>

      {sections.worldMap && (
        <section className="mb-8 print-avoid-break">
          <div className="mb-4 flex items-center justify-between border-b border-slate-300 pb-2">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <span className="inline-block h-2.5 w-2.5 rounded-full border border-slate-500 bg-white" />
              {sectionNumber(0)}. World Sales Distribution ({mapPeriodLabel})
            </h2>
            <span className="text-[11px] font-medium text-slate-500">{mapPeriodLabel}</span>
          </div>
          <PrintWorldMap snapshot={snapshot} period={sections.worldMapPeriod} />
        </section>
      )}

      {/* SECTION 1: SALE SUMMARY (EXPANDED) */}
      {sections.saleSummary && (
        <section className="mb-8">
          <div className="border-b border-slate-300 pb-2 mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-900" />
              {sectionNumber(1)}. Sales Summary — {summaryPeriodLabel}
            </h2>
            <span className="text-[11px] text-slate-500 font-medium">
              Expanded Deals View
            </span>
          </div>

          {/* 3 Summary Cards */}
          <div className="grid grid-cols-3 gap-3 mb-5 print-avoid-break">
            {/* Waiting to Load */}
            <div className="border border-slate-300 rounded-lg p-3 bg-slate-50">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
                  Waiting to Load
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 text-[10px] font-bold">
                  {summary.waiting.count} deals
                </span>
              </div>
              <div className="space-y-0.5 mt-2">
                {summary.waiting.totals.length === 0 ? (
                  <p className="text-sm font-bold text-slate-800">THB 0</p>
                ) : (
                  summary.waiting.totals.map((t) => (
                    <p key={t.currency} className="text-sm font-black text-slate-900">
                      {formatMoney(t.amount, t.currency)}
                    </p>
                  ))
                )}
              </div>
            </div>

            {/* Won */}
            <div className="border border-slate-300 rounded-lg p-3 bg-slate-50">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
                  Won
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 text-[10px] font-bold">
                  {summary.won.count} deals
                </span>
              </div>
              <div className="space-y-0.5 mt-2">
                {summary.won.totals.length === 0 ? (
                  <p className="text-sm font-bold text-slate-800">THB 0</p>
                ) : (
                  summary.won.totals.map((t) => (
                    <p key={t.currency} className="text-sm font-black text-slate-900">
                      {formatMoney(t.amount, t.currency)}
                    </p>
                  ))
                )}
              </div>
            </div>

            {/* Total This Month */}
            <div className="border-2 border-slate-900 rounded-lg p-3 bg-slate-100">
              <div className="flex items-center justify-between mb-1">
                <span className="font-black text-slate-950 text-[11px] uppercase tracking-wider">
                  Total This {summaryPeriodNoun}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white text-[10px] font-black">
                  {summary.total.count} deals
                </span>
              </div>
              <div className="space-y-0.5 mt-2">
                {summary.total.totals.length === 0 ? (
                  <p className="text-sm font-black text-slate-950">THB 0</p>
                ) : (
                  summary.total.totals.map((t) => (
                    <p key={t.currency} className="text-sm font-black text-slate-950">
                      {formatMoney(t.amount, t.currency)}
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Expanded Deals: Waiting to Load */}
          <div className="mb-4">
            <h3 className="font-bold text-slate-800 text-xs mb-1.5">
              Waiting to Load Deals ({summary.waiting.count})
              {summary.waiting.deals.length < summary.waiting.count && (
                <span className="ml-1 font-normal text-slate-500">— showing first {summary.waiting.deals.length}</span>
              )}
            </h3>
            {summary.waiting.deals.length === 0 ? (
              <p className="text-slate-400 italic text-[11px]">No waiting deals in this period.</p>
            ) : (
              <div className="print-table-frame overflow-hidden rounded-xl bg-white">
              <table className="print-data-table w-full table-fixed text-[11px]">
                <colgroup>
                  <col className="w-[5%]" />
                  <col className="w-[15%]" />
                  <col className="w-[30%]" />
                  <col className="w-[30%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 text-slate-700">
                    <th className="border border-slate-300 px-2 py-1 text-center w-8">#</th>
                    <th className="border border-slate-300 px-2 py-1 text-left w-24">Goods Date</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Deal Topic</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Account</th>
                    <th className="border border-slate-300 px-2 py-1 text-right w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.waiting.deals.map((deal, idx) => (
                    <tr key={deal.id} className="bg-white">
                      <td className="border border-slate-300 px-2 py-1 text-center text-slate-500">{idx + 1}</td>
                      <td className="border border-slate-300 px-2 py-1 text-slate-700">{formatDate(deal.loadingDate)}</td>
                      <td className="border border-slate-300 px-2 py-1 font-medium text-slate-900">{deal.topic}</td>
                      <td className="border border-slate-300 px-2 py-1 text-slate-700">{deal.accountName}</td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-semibold text-slate-900">
                        {formatMoney(deal.amount, deal.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>

          {/* Expanded Deals: Won */}
          <div className="mb-2">
            <h3 className="font-bold text-slate-800 text-xs mb-1.5">
              Won Deals ({summary.won.count})
              {summary.won.deals.length < summary.won.count && (
                <span className="ml-1 font-normal text-slate-500">— showing first {summary.won.deals.length}</span>
              )}
            </h3>
            {summary.won.deals.length === 0 ? (
              <p className="text-slate-400 italic text-[11px]">No won deals in this period.</p>
            ) : (
              <div className="print-table-frame overflow-hidden rounded-xl bg-white">
              <table className="print-data-table w-full table-fixed text-[11px]">
                <colgroup>
                  <col className="w-[5%]" />
                  <col className="w-[15%]" />
                  <col className="w-[30%]" />
                  <col className="w-[30%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 text-slate-700">
                    <th className="border border-slate-300 px-2 py-1 text-center w-8">#</th>
                    <th className="border border-slate-300 px-2 py-1 text-left w-24">Goods Date</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Deal Topic</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Account</th>
                    <th className="border border-slate-300 px-2 py-1 text-right w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.won.deals.map((deal, idx) => (
                    <tr key={deal.id} className="bg-white">
                      <td className="border border-slate-300 px-2 py-1 text-center text-slate-500">{idx + 1}</td>
                      <td className="border border-slate-300 px-2 py-1 text-slate-700">{formatDate(deal.loadingDate)}</td>
                      <td className="border border-slate-300 px-2 py-1 font-medium text-slate-900">{deal.topic}</td>
                      <td className="border border-slate-300 px-2 py-1 text-slate-700">{deal.accountName}</td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-semibold text-slate-900">
                        {formatMoney(deal.amount, deal.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* SECTION 2: SALE TRACKING */}
      {sections.saleTracking && (
        <section className="mb-8">
          <div className="border-b border-slate-300 pb-2 mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-900" />
              {sectionNumber(2)}. Annual Sale Target Progress ({year})
            </h2>
            <span className="text-[11px] text-slate-500 font-medium">
              {snapshot.tracking.length} Accounts Tracked
            </span>
          </div>

          {snapshot.tracking.length === 0 ? (
            <p className="text-slate-400 italic text-[11px]">No target tracking configured for {year}.</p>
          ) : (
            <div className="print-table-frame overflow-hidden rounded-xl bg-white">
            <table className="print-data-table w-full table-fixed text-[11px]">
              <colgroup>
                <col className="w-[5%]" />
                <col className="w-[25%]" />
                <col className="w-[18%]" />
                <col className="w-[18%]" />
                <col className="w-[12%]" />
                <col className="w-[22%]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-slate-700">
                  <th className="border border-slate-300 px-2 py-1.5 text-center w-8">#</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left">Account Name</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-right w-28">Actual Sales</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-right w-28">Target Amount</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-center w-20">Progress</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left w-48">Status / Remaining</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.tracking.map((item, idx) => {
                  const isZero = item.target === 0;
                  const isReached = item.percentage !== null && item.percentage >= 100;
                  return (
                    <tr key={`${item.companyId}-${item.currency}`} className="bg-white">
                      <td className="border border-slate-300 px-2 py-1.5 text-center text-slate-500">{idx + 1}</td>
                      <td className="border border-slate-300 px-2 py-1.5 font-bold text-slate-900">{item.accountName}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-right font-semibold text-slate-900">
                        {formatMoney(item.actual, item.currency)}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-right text-slate-600">
                        {formatMoney(item.target, item.currency)}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-bold">
                        {item.percentage === null ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span className={isReached ? "text-emerald-700" : "text-slate-900"}>
                            {Math.round(item.percentage)}%
                          </span>
                        )}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-slate-600 text-[10px]">
                        {isZero ? (
                          <span className="text-amber-700 font-medium">Target is 0</span>
                        ) : isReached ? (
                          <span className="text-emerald-700 font-bold">Target achieved</span>
                        ) : (
                          <span>{formatMoney(Math.max(item.target - item.actual, 0), item.currency)} remaining</span>
                        )}
                        {item.excludedCurrencyDealCount > 0 && (
                          <span className="text-slate-500 block text-[9px]">
                            ({item.excludedCurrencyDealCount} {item.excludedCurrencyDealCount === 1 ? "deal" : "deals"} in other currency excluded)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </section>
      )}

      {/* SECTION 3: 5-YEAR ANNUAL SALE REPORT */}
      {sections.annualReport && (
        <section className="mb-6">
          <div className="border-b border-slate-300 pb-2 mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-900" />
              {sectionNumber(3)}. 5-Year Annual Sales Report ({anchorYear} – {anchorYear - (years.length - 1)})
            </h2>
            <span className="text-[11px] text-slate-500 font-medium">
              {snapshot.annual.accounts.length} Accounts
            </span>
          </div>

          <div className="print-table-frame overflow-hidden rounded-xl bg-white">
          <table className="print-data-table w-full table-fixed text-[10px]">
            <colgroup>
              <col className="w-1/4" />
              {years.map((yr) => (
                <col key={yr} style={{ width: `${75 / Math.max(years.length, 1)}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-slate-50 text-slate-900">
                <th className="border border-slate-300 px-2 py-2 text-left font-bold">
                  Account
                </th>
                {years.map((yr) => (
                  <th
                    key={yr}
                    className={`border border-slate-300 px-2 py-2 text-right ${
                      yr === anchorYear ? "bg-slate-100 font-black text-slate-950" : "font-bold text-slate-800"
                    }`}
                  >
                    <div>{yr} {yr === anchorYear && "(Selected)"}</div>
                    <div className="font-normal text-[9px] text-slate-600 mt-0.5 space-y-0.5">
                      {(snapshot.annual.totals[yr] || []).map((t) => (
                        <div key={t.currency}>{formatMoney(t.amount, t.currency)}</div>
                      ))}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.annual.accounts.length === 0 ? (
                <tr>
                  <td colSpan={years.length + 1} className="p-4 text-center text-slate-400 italic">
                    No won sales recorded in this five-year period.
                  </td>
                </tr>
              ) : (
                snapshot.annual.accounts.map((account) => (
                  <tr key={account.companyId || account.accountName} className="bg-white">
                    <td className="border border-slate-300 px-2 py-1.5 font-bold text-slate-900 break-words">
                      {account.accountName}
                    </td>

                    {years.map((yr, yrIdx) => {
                      const values = account.values[yr] || [];
                      const previousYear = years[yrIdx + 1];
                      const previousValues = previousYear ? account.values[previousYear] || [] : [];
                      const isAnchor = yr === anchorYear;

                      return (
                        <td
                          key={yr}
                          className={`border border-slate-300 px-2 py-1.5 text-right align-top ${
                            isAnchor ? "bg-slate-50 font-semibold" : ""
                          }`}
                        >
                          {values.length === 0 ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <div className="space-y-1">
                              {values.map((v) => {
                                const totalForCurrency =
                                  yearCurrencyTotalMap.get(`${yr}-${v.currency}`) || 0;
                                const share = calculateSharePercent(v.amount, totalForCurrency);
                                const prevVal =
                                  previousValues.find((pv) => pv.currency === v.currency)?.amount || 0;
                                const hasOrderedBefore = Object.entries(account.values).some(
                                  ([priorYearStr, priorVals]) => {
                                    const priorYear = Number(priorYearStr);
                                    return priorYear < yr && priorVals.some((pv) => pv.amount > 0);
                                  }
                                );
                                const yoy = previousYear
                                  ? calculateYoY(v.amount, prevVal, hasOrderedBefore)
                                  : null;

                                return (
                                  <div key={v.currency}>
                                    <div className="font-bold text-slate-900">
                                      {formatMoney(v.amount, v.currency)}
                                    </div>
                                    <div className="text-[9px] text-slate-500 flex items-center justify-end gap-1 flex-wrap">
                                      {share !== null && <span>{share}% sh</span>}
                                      {yoy && (
                                        <>
                                          {yoy.type === "new" ? (
                                            <span className="px-1 rounded bg-slate-200 text-slate-800 font-bold">
                                              New
                                            </span>
                                          ) : yoy.deltaPercent > 0 ? (
                                            <span className="text-emerald-700 font-bold">
                                              +{yoy.deltaPercent}%
                                            </span>
                                          ) : yoy.deltaPercent < 0 ? (
                                            <span className="text-rose-700 font-bold">
                                              {yoy.deltaPercent}%
                                            </span>
                                          ) : (
                                            <span className="text-slate-400">0%</span>
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
                ))
              )}
            </tbody>
          </table>
          </div>
        </section>
      )}

      {/* Printable Footer */}
      <footer className="pt-4 border-t border-slate-300 text-[10px] text-slate-400 flex items-center justify-between">
        <span>SB Interlab CRM System • Internal Report</span>
        <span>Page generated in Asia/Bangkok Timezone</span>
      </footer>
    </div>
  );
}
