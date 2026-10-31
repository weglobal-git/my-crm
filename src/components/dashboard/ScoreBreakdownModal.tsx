"use client";

import {
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  Zap,
  Trophy,
  Layers,
} from "lucide-react";
import type { LeaderboardItem } from "@/lib/dashboard/leaderboard-types";
import { useEffect, useRef } from "react";

export type DrilldownCategoryId =
  | "card_health"
  | "clean_ltc"
  | "velocity"
  | "outcome";

interface ScoreBreakdownModalProps {
  item: LeaderboardItem | null;
  onClose: () => void;
  onOpenAnalyse?: (item: LeaderboardItem) => void;
  onSelectCategory?: (categoryId: DrilldownCategoryId, item: LeaderboardItem) => void;
}

function fmtXp(val: number | undefined): string {
  const n = Math.round((val ?? 0) * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function ScoreBreakdownModal({
  item,
  onClose,
  onOpenAnalyse,
  onSelectCategory,
}: ScoreBreakdownModalProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (item) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "auto";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [item, onClose]);

  if (!item || !item.breakdown) return null;

  const b = item.breakdown;
  const disciplineXp = b.disciplineTotalXp ?? b.cleanBonusXp + (b.ltcXp ?? 0);
  const velocityXp = b.velocityXp ?? b.quotationXp ?? 0;
  const outcomeXp = b.outcomeXp ?? b.dealsWonXp ?? 0;
  const salesPct = b.salesWeightPct ?? 100;
  const taskPct = b.taskWeightPct ?? 0;
  const wonSales =
    b.wonSalesDealsCount ?? Math.max(0, b.dealsWon - (b.completedInternalTasks ?? 0));
  const isClickable = Boolean(onSelectCategory);

  return (
    <>
      {/* Dark Overlay over parent LeaderboardDrawer (z-[101]) */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs z-[110] transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Floating Right Side Drawer (Flat UI - zero shadows) */}
      <div className="fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[500px] md:max-w-[calc(100vw-32px)] z-[111] flex transition-all duration-200 ease-out">
        <div
          ref={drawerRef}
          className="w-full bg-[#252728] border-0 md:border border-[#4E4F50] flex flex-col h-full rounded-none md:rounded-2xl overflow-hidden"
        >
          {/* Header with Back Navigation */}
          <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5 border-b border-[#1C1C1D] shrink-0 bg-[#252728]">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#3A3B3C] border border-[#4E4F50] text-slate-200 hover:bg-[#C7F33C] hover:text-black hover:border-[#C7F33C] text-xs font-bold transition-colors cursor-pointer shrink-0"
                title="Back to previous view"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>

              <div className="w-9 h-9 rounded-full bg-[#3A3B3C] border border-[#4E4F50] overflow-hidden flex items-center justify-center shrink-0">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xs font-black text-slate-200">
                    {item.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm sm:text-base font-bold text-slate-100 truncate">
                    {item.name}
                  </h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#C7F33C] text-black shrink-0">
                    #{item.rank}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate">
                  Unified Portfolio Breakdown (Max 100 XP)
                </p>
              </div>
            </div>

            {onOpenAnalyse && (
              <button
                type="button"
                onClick={() => onOpenAnalyse(item)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#C7F33C]/15 border border-[#C7F33C]/40 text-[#C7F33C] hover:bg-[#C7F33C] hover:text-black text-[11px] font-bold transition-all cursor-pointer shrink-0"
                title="Explain score calculation in Thai"
              >
                <Sparkles className="w-3 h-3" />
                <span>Analyse</span>
              </button>
            )}
          </div>

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-3 text-xs">
            {/* Total Highlight */}
            <div className="p-4 rounded-2xl bg-[#1C1C1D] border border-[#C7F33C]/45 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-100 text-sm">Total Monthly XP</div>
                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-[#C7F33C]" />
                  <span>
                    Sales {salesPct}% • Internal Tasks {taskPct}%
                  </span>
                </div>
              </div>
              <span className="text-xl font-black font-mono text-[#C7F33C] shrink-0">
                {fmtXp(b.totalXp)} / 100 XP
              </span>
            </div>

            {isClickable && (
              <div className="text-[11px] text-slate-400 px-1">
                Click any category below to inspect its detailed breakdown:
              </div>
            )}

            {/* 1. Card Health (Max 30 XP) */}
            <div
              onClick={() => onSelectCategory?.("card_health", item)}
              className={`flex items-center justify-between p-3.5 rounded-2xl bg-[#1C1C1D] border border-[#3A3B3C] hover:bg-[#3A3B3C]/65 hover:border-[#C7F33C]/50 transition-colors ${
                isClickable ? "cursor-pointer group" : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="w-8 h-8 rounded-xl bg-[#C7F33C]/10 border border-[#C7F33C]/30 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-[#C7F33C]" />
                </div>
                <div className="min-w-0">
                  <div className="text-slate-100 font-bold text-xs">
                    1. Card Health (Max 30 XP)
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                    Accumulated Red Rate {b.redRate?.toFixed(1) ?? "0.0"}% • Target ≤ 5%
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  className={`font-mono font-bold ${
                    b.cardHealthTotalXp > 0 ? "text-[#C7F33C]" : "text-rose-400"
                  }`}
                >
                  +{fmtXp(b.cardHealthTotalXp)} XP
                </span>
                {isClickable && (
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#C7F33C] transition-colors" />
                )}
              </div>
            </div>

            {/* 2. Discipline & LTC Care (Max 20 XP) */}
            <div
              onClick={() => onSelectCategory?.("clean_ltc", item)}
              className={`flex items-center justify-between p-3.5 rounded-2xl bg-[#1C1C1D] border border-[#3A3B3C] hover:bg-[#3A3B3C]/65 hover:border-emerald-400/50 transition-colors ${
                isClickable ? "cursor-pointer group" : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-slate-100 font-bold text-xs">
                    2. Discipline &amp; LTC Care (Max 20 XP)
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                    {b.cleanBonusDays ?? 0} Clean Days
                    {(b.graceDaysCount ?? 0) > 0 ? ` + ${b.graceDaysCount} Shield` : ""}
                    {b.hasSalesAccess !== false
                      ? ` • LTC +${fmtXp((b.individualLtcXp ?? 0) + (b.teamZeroLtcXp ?? 0))}`
                      : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="font-mono font-bold text-emerald-300">
                  +{fmtXp(disciplineXp)} XP
                </span>
                {isClickable && (
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-300 transition-colors" />
                )}
              </div>
            </div>

            {/* 3. Velocity & Teamwork (Max 25 XP) */}
            <div
              onClick={() => onSelectCategory?.("velocity", item)}
              className={`flex items-center justify-between p-3.5 rounded-2xl bg-[#1C1C1D] border border-[#3A3B3C] hover:bg-[#3A3B3C]/65 hover:border-amber-400/50 transition-colors ${
                isClickable ? "cursor-pointer group" : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-slate-100 font-bold text-xs">
                    3. Velocity &amp; Teamwork (Max 25 XP)
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                    {fmtXp(b.effectiveProgressDays ?? b.progressCardsCount ?? 0)}/{b.elapsedWorkingDays ?? 20}d Rhythm •{" "}
                    {b.teammateAssistWorkdaysCount ?? b.teammate27hAssistsCount ?? 0}d Assisted • Avg {fmtXp(b.avgDailyCleanCards ?? b.workedActiveCardsCount ?? 0)} Clean Load
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="font-mono font-bold text-amber-300">
                  +{fmtXp(velocityXp)} XP
                </span>
                {isClickable && (
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-300 transition-colors" />
                )}
              </div>
            </div>

            {/* 4. Portfolio Outcome (Max 25 XP) */}
            <div
              onClick={() => onSelectCategory?.("outcome", item)}
              className={`flex items-center justify-between p-3.5 rounded-2xl bg-[#1C1C1D] border border-[#3A3B3C] hover:bg-[#3A3B3C]/65 hover:border-sky-400/50 transition-colors ${
                isClickable ? "cursor-pointer group" : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center shrink-0">
                  <Trophy className="w-4 h-4 text-sky-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-slate-100 font-bold text-xs">
                    4. Portfolio Outcome (Max 25 XP)
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                    {wonSales} Won {wonSales === 1 ? "Deal" : "Deals"}
                    {(b.completedInternalTasks ?? 0) > 0 || (b.ownedInternalTasks ?? 0) > 0
                      ? ` • SLA ${b.onTimeInternalTasks ?? 0}/${b.completedInternalTasks ?? 0} Tasks`
                      : ""}
                    {(b.collaboratorWonDealsCount ?? 0) > 0
                      ? ` • ${b.collaboratorWonDealsCount} Assist Win`
                      : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="font-mono font-bold text-sky-300">
                  +{fmtXp(outcomeXp)} XP
                </span>
                {isClickable && (
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-sky-300 transition-colors" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
