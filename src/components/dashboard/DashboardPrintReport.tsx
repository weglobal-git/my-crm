import type { SalesOverviewSnapshot } from "@/lib/dashboard/sales-overview";
import { calculateSharePercent, calculateYoY } from "@/lib/dashboard/sales-overview";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export interface PrintSections {
  saleSummary: boolean;
  saleTracking: boolean;
  annualReport: boolean;
}

interface DashboardPrintReportProps {
  snapshot: SalesOverviewSnapshot;
  sections: PrintSections;
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

export function DashboardPrintReport({ snapshot, sections }: DashboardPrintReportProps) {
  const { month, year } = snapshot.period;
  const monthName = MONTHS[month - 1];
  const nowFormatted = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date());

  const anchorYear = snapshot.annual.years[0] || year;
  const years = snapshot.annual.years;

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
      <header className="border-b-2 border-slate-900 pb-4 mb-6 flex items-start justify-between">
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

      {/* SECTION 1: SALE SUMMARY (EXPANDED) */}
      {sections.saleSummary && (
        <section className="mb-8 print-avoid-break">
          <div className="border-b border-slate-300 pb-2 mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-900" />
              1. Monthly Sales Summary — {monthName} {year}
            </h2>
            <span className="text-[11px] text-slate-500 font-medium">
              Expanded Deals View
            </span>
          </div>

          {/* 3 Summary Cards */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {/* Waiting to Load */}
            <div className="border border-slate-300 rounded-lg p-3 bg-slate-50">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
                  Waiting to Load
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 text-[10px] font-bold">
                  {snapshot.monthly.waiting.count} deals
                </span>
              </div>
              <div className="space-y-0.5 mt-2">
                {snapshot.monthly.waiting.totals.length === 0 ? (
                  <p className="text-sm font-bold text-slate-800">THB 0</p>
                ) : (
                  snapshot.monthly.waiting.totals.map((t) => (
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
                  {snapshot.monthly.won.count} deals
                </span>
              </div>
              <div className="space-y-0.5 mt-2">
                {snapshot.monthly.won.totals.length === 0 ? (
                  <p className="text-sm font-bold text-slate-800">THB 0</p>
                ) : (
                  snapshot.monthly.won.totals.map((t) => (
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
                  Total This Month
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white text-[10px] font-black">
                  {snapshot.monthly.total.count} deals
                </span>
              </div>
              <div className="space-y-0.5 mt-2">
                {snapshot.monthly.total.totals.length === 0 ? (
                  <p className="text-sm font-black text-slate-950">THB 0</p>
                ) : (
                  snapshot.monthly.total.totals.map((t) => (
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
              Waiting to Load Deals ({snapshot.monthly.waiting.deals.length})
            </h3>
            {snapshot.monthly.waiting.deals.length === 0 ? (
              <p className="text-slate-400 italic text-[11px]">No waiting deals in this period.</p>
            ) : (
              <table className="w-full border-collapse border border-slate-300 text-[11px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="border border-slate-300 px-2 py-1 text-center w-8">#</th>
                    <th className="border border-slate-300 px-2 py-1 text-left w-24">Goods Date</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Deal Topic</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Account</th>
                    <th className="border border-slate-300 px-2 py-1 text-right w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.monthly.waiting.deals.map((deal, idx) => (
                    <tr key={deal.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
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
            )}
          </div>

          {/* Expanded Deals: Won */}
          <div className="mb-2">
            <h3 className="font-bold text-slate-800 text-xs mb-1.5">
              Won Deals ({snapshot.monthly.won.deals.length})
            </h3>
            {snapshot.monthly.won.deals.length === 0 ? (
              <p className="text-slate-400 italic text-[11px]">No won deals in this period.</p>
            ) : (
              <table className="w-full border-collapse border border-slate-300 text-[11px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="border border-slate-300 px-2 py-1 text-center w-8">#</th>
                    <th className="border border-slate-300 px-2 py-1 text-left w-24">Goods Date</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Deal Topic</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Account</th>
                    <th className="border border-slate-300 px-2 py-1 text-right w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.monthly.won.deals.map((deal, idx) => (
                    <tr key={deal.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
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
            )}
          </div>
        </section>
      )}

      {/* SECTION 2: SALE TRACKING */}
      {sections.saleTracking && (
        <section className="mb-8 print-avoid-break">
          <div className="border-b border-slate-300 pb-2 mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-900" />
              2. Annual Sale Target Progress ({year})
            </h2>
            <span className="text-[11px] text-slate-500 font-medium">
              {snapshot.tracking.length} Accounts Tracked
            </span>
          </div>

          {snapshot.tracking.length === 0 ? (
            <p className="text-slate-400 italic text-[11px]">No target tracking configured for {year}.</p>
          ) : (
            <table className="w-full border-collapse border border-slate-300 text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
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
                    <tr key={`${item.companyId}-${item.currency}`} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
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
          )}
        </section>
      )}

      {/* SECTION 3: 5-YEAR ANNUAL SALE REPORT */}
      {sections.annualReport && (
        <section className="mb-6 print-avoid-break">
          <div className="border-b border-slate-300 pb-2 mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-900" />
              3. 5-Year Annual Sales Report ({anchorYear} – {anchorYear - (years.length - 1)})
            </h2>
            <span className="text-[11px] text-slate-500 font-medium">
              {snapshot.annual.accounts.length} Accounts
            </span>
          </div>

          <table className="w-full border-collapse border border-slate-300 text-[10px]">
            <thead>
              <tr className="bg-slate-100 text-slate-900">
                <th className="border border-slate-300 px-2 py-2 text-left font-bold w-44">
                  Account
                </th>
                {years.map((yr) => (
                  <th
                    key={yr}
                    className={`border border-slate-300 px-2 py-2 text-right ${
                      yr === anchorYear ? "bg-slate-200 font-black text-slate-950" : "font-bold text-slate-800"
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
                snapshot.annual.accounts.map((account, idx) => (
                  <tr key={account.companyId || account.accountName} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="border border-slate-300 px-2 py-1.5 font-bold text-slate-900 truncate max-w-[150px]">
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
                            isAnchor ? "bg-slate-100/70 font-semibold" : ""
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
