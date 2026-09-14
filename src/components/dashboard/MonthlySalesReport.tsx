"use client";

import type { MoneyTotal, MonthlyGroup } from "@/lib/dashboard/sales-overview";

interface MonthlySalesReportProps {
  monthly: {
    waiting: MonthlyGroup;
    won: MonthlyGroup;
    total: MonthlyGroup;
  };
  showDeals?: boolean;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function MoneyTotalsDisplay({ totals }: { totals: MoneyTotal[] }) {
  if (totals.length === 0) {
    return <span className="text-2xl font-bold tracking-tight text-slate-100">—</span>;
  }
  return (
    <div className="space-y-1">
      {totals.map((total) => (
        <div key={total.currency} className="text-2xl font-bold tracking-tight text-slate-100">
          {formatMoney(total.amount, total.currency)}
        </div>
      ))}
    </div>
  );
}

interface MonthlyCardProps {
  title: string;
  description: string;
  group: MonthlyGroup;
  accent?: boolean;
  showDeals?: boolean;
}

function MonthlyCard({
  title,
  description,
  group,
  accent = false,
  showDeals = false,
}: MonthlyCardProps) {
  const dealsList = group.deals && group.deals.length > 0 ? group.deals : group.preview;

  return (
    <article
      className={`rounded-[2rem] border p-5 flex flex-col ${
        accent
          ? "border-[#C7F33C] bg-[#C7F33C] text-black"
          : "border-[#4E4F50] bg-[#3A3B3C]"
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              className={`text-xs font-semibold uppercase tracking-[0.14em] ${
                accent ? "text-slate-900 font-bold" : "text-slate-400"
              }`}
            >
              {title}
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-bold shrink-0 ${
              accent
                ? "bg-black text-[#C7F33C]"
                : "bg-[#252728] text-slate-200"
            }`}
          >
            {group.count} {group.count === 1 ? "deal" : "deals"}
          </span>
        </div>

        <div className="mt-5">
          {group.totals.length === 0 ? (
            <span
              className={`text-2xl font-bold tracking-tight ${
                accent ? "text-slate-900" : "text-slate-100"
              }`}
            >
              —
            </span>
          ) : (
            <div className="space-y-1">
              {group.totals.map((total) => (
                <div
                  key={total.currency}
                  className={`text-2xl font-bold tracking-tight ${
                    accent ? "text-slate-950 font-extrabold" : "text-slate-100"
                  }`}
                >
                  {formatMoney(total.amount, total.currency)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showDeals && (
        <div
          className={`mt-5 pt-4 border-t space-y-2 ${
            accent ? "border-black/20" : "border-[#4E4F50]/70"
          }`}
        >
          <p
            className={`text-[11px] font-semibold uppercase tracking-wider ${
              accent ? "text-slate-900 font-bold" : "text-slate-400"
            }`}
          >
            Deals ({dealsList.length})
          </p>
          {dealsList.length === 0 ? (
            <p
              className={`text-xs py-2 text-center ${
                accent ? "text-slate-800" : "text-slate-500"
              }`}
            >
              No deals in this category
            </p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {dealsList.map((deal) => (
                <div
                  key={deal.id}
                  className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs ${
                    accent
                      ? "bg-black/10 text-slate-950"
                      : "bg-[#252728] text-slate-100"
                  }`}
                >
                  <div className="min-w-0">
                    <p
                      className={`truncate font-medium ${
                        accent ? "text-slate-950 font-bold" : "text-slate-100"
                      }`}
                    >
                      {deal.accountName}
                    </p>
                    <p
                      className={`truncate text-[11px] ${
                        accent ? "text-slate-700" : "text-slate-500"
                      }`}
                    >
                      {deal.topic}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-bold ${
                      accent ? "text-slate-950" : "text-slate-200"
                    }`}
                  >
                    {deal.amount === null
                      ? "Not specified"
                      : formatMoney(deal.amount, deal.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function MonthlySalesReport({ monthly, showDeals = false }: MonthlySalesReportProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <MonthlyCard
        title="Waiting to load"
        description="Loading confirmed, deal still open"
        group={monthly.waiting}
        showDeals={showDeals}
      />
      <MonthlyCard
        title="Won"
        description="Loaded and closed won"
        group={monthly.won}
        showDeals={showDeals}
      />
      <MonthlyCard
        title="Total this month"
        description="Waiting to load + Won deals"
        group={monthly.total}
        accent
        showDeals={showDeals}
      />
    </div>
  );
}
