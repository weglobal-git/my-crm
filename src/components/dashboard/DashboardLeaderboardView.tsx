"use client";

import { Trophy, Medal, Award, Sparkles, TrendingUp, Target } from "lucide-react";
import type { SalesOverviewSnapshot } from "@/lib/dashboard/sales-overview";

interface DashboardLeaderboardViewProps {
  snapshot: SalesOverviewSnapshot | null;
  year: number;
}

function formatMoney(amount: number, currency: string = "THB") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function DashboardLeaderboardView({ snapshot, year }: DashboardLeaderboardViewProps) {
  if (!snapshot) {
    return (
      <section className="rounded-[2rem] border border-[#4E4F50] bg-[#3A3B3C] p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-[#252728] border border-[#4E4F50] flex items-center justify-center mx-auto text-[#C7F33C]">
          <Trophy className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold text-slate-100">
          Leaderboard Restricted
        </h2>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Your department does not have access to sales ranking data.
          Contact an administrator if you require leaderboard permissions.
        </p>
      </section>
    );
  }

  // Rank accounts by sales in the selected year
  const accounts = [...snapshot.annual.accounts]
    .map((acc) => {
      const yearValues = acc.values[year] || [];
      const totalAmount = yearValues.reduce((sum, v) => sum + v.amount, 0);
      const mainCurrency = yearValues[0]?.currency || "THB";
      const targetProgress = snapshot.tracking.find((t) => t.companyId === acc.companyId);
      return {
        ...acc,
        totalAmount,
        currency: mainCurrency,
        targetProgress,
      };
    })
    .filter((acc) => acc.totalAmount > 0)
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const top3 = accounts.slice(0, 3);
  const remaining = accounts.slice(3, 10);

  const totalYearSales = (snapshot.annual.totals[year] || []).find((t) => t.currency === "THB")?.amount || 0;

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="p-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C7F33C]">
          Leaderboard
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-slate-100">
            Top Performing Accounts ({year})
          </h2>
          <span className="text-xs text-slate-400 font-medium">
            {accounts.length} {accounts.length === 1 ? "account" : "accounts"} ranked
          </span>
        </div>
      </div>

      {/* Top 3 Podium Highlights */}
      {top3.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {top3.map((acc, index) => {
            const rank = index + 1;
            const isGold = rank === 1;
            const isSilver = rank === 2;
            const isBronze = rank === 3;

            return (
              <article
                key={acc.companyId || acc.accountName}
                className={`rounded-[1.5rem] border p-5 flex flex-col justify-between transition-all ${
                  isGold
                    ? "bg-[#C7F33C]/10 border-[#C7F33C]/60"
                    : isSilver
                    ? "bg-[#3A3B3C] border-slate-400/40"
                    : "bg-[#3A3B3C] border-amber-600/30"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black ${
                        isGold
                          ? "bg-[#C7F33C] text-black"
                          : isSilver
                          ? "bg-slate-300 text-slate-900"
                          : "bg-amber-600 text-white"
                      }`}
                    >
                      {isGold && <Trophy className="w-3.5 h-3.5" />}
                      {isSilver && <Medal className="w-3.5 h-3.5" />}
                      {isBronze && <Award className="w-3.5 h-3.5" />}
                      Rank #{rank}
                    </span>

                    {totalYearSales > 0 && (
                      <span className="text-xs text-slate-400 font-medium">
                        {Math.round((acc.totalAmount / totalYearSales) * 100)}% of total
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-slate-100 text-base truncate" title={acc.accountName}>
                    {acc.accountName}
                  </h3>

                  <div className="mt-2 text-2xl font-black tracking-tight text-slate-50">
                    {formatMoney(acc.totalAmount, acc.currency)}
                  </div>
                </div>

                {acc.targetProgress && acc.targetProgress.percentage !== null && (
                  <div className="mt-4 pt-3 border-t border-[#4E4F50]/50 flex items-center justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Target className="w-3 h-3 text-[#C7F33C]" />
                      Target Progress
                    </span>
                    <span className="font-bold text-[#C7F33C]">
                      {Math.round(acc.targetProgress.percentage)}%
                    </span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[2rem] border border-[#4E4F50] bg-[#3A3B3C] p-8 text-center text-sm text-slate-400">
          No closed won sales recorded for {year} yet.
        </div>
      )}

      {/* Ranks #4 to #10 Table */}
      {remaining.length > 0 && (
        <section className="rounded-[2rem] border border-[#4E4F50] bg-[#3A3B3C] p-5 space-y-3">
          <h3 className="font-semibold text-slate-200 text-sm">
            Top 10 Contenders
          </h3>
          <div className="divide-y divide-[#4E4F50]/40">
            {remaining.map((acc, idx) => {
              const rank = idx + 4;
              return (
                <div
                  key={acc.companyId || acc.accountName}
                  className="py-3 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 text-center text-xs font-bold text-slate-500">
                      #{rank}
                    </span>
                    <span className="font-medium text-slate-200 text-sm truncate">
                      {acc.accountName}
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-semibold text-slate-100 text-sm">
                      {formatMoney(acc.totalAmount, acc.currency)}
                    </div>
                    {totalYearSales > 0 && (
                      <div className="text-[11px] text-slate-400">
                        {Math.round((acc.totalAmount / totalYearSales) * 100)}% share
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Future Phase Announcement */}
      <div className="rounded-2xl border border-[#4E4F50]/40 bg-[#252728] p-4 flex items-center gap-3 text-xs text-slate-400">
        <Sparkles className="w-4 h-4 text-[#C7F33C] shrink-0" />
        <p>
          <strong className="text-slate-200">Gamification & Individual Sales Rep Rankings:</strong> Rep-level scoring, deals closed, and achievement badges will be introduced in the next phase.
        </p>
      </div>
    </div>
  );
}
