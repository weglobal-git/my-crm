"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Coffee,
  Palmtree,
  Info,
  Sparkles,
  ShieldCheck,
  Users,
  CheckCircle2,
} from "lucide-react";
import type { LeaderboardItem } from "@/lib/dashboard/leaderboard-types";
import { calculateDailyLtcForMonth } from "@/lib/ltc-utils";

export type DisciplineDrawerTab = "discipline" | "ltc";

interface DailyLtcDrawerProps {
  item: LeaderboardItem | null;
  period: { month: number; year: number };
  initialTab?: DisciplineDrawerTab;
  onClose: () => void;
  onOpenAnalyse?: (item: LeaderboardItem) => void;
}

const MONTH_NAMES_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAY_NAMES_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtXp(val: number | undefined): string {
  const n = Math.round((val ?? 0) * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function ScoreRingGauge({
  score,
  maxScore = 20,
  size = 96,
  strokeWidth = 9,
}: {
  score: number;
  maxScore?: number;
  size?: number;
  strokeWidth?: number;
}) {
  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const pct = maxScore > 0 ? Math.min(100, Math.max(0, (score / maxScore) * 100)) : 0;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  const color = pct >= 75 ? "#C7F33C" : pct >= 45 ? "#10B981" : pct > 0 ? "#F59E0B" : "#64748B";

  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke="#252728"
          strokeWidth={strokeWidth}
        />
        {pct > 0 && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span
          className="text-lg font-black font-mono leading-none tracking-tight"
          style={{ color }}
        >
          {fmtXp(score)}
        </span>
        <span className="text-[10px] text-slate-400 font-mono mt-0.5">/ {maxScore} XP</span>
      </div>
    </div>
  );
}

export function DailyLtcDrawer({
  item,
  period,
  initialTab = "discipline",
  onClose,
  onOpenAnalyse,
}: DailyLtcDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<DisciplineDrawerTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, item?.userId]);

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

  const ltcSummary = useMemo(() => {
    if (item?.dailyLtcSummary) return item.dailyLtcSummary;
    return calculateDailyLtcForMonth({
      companies: [],
      month: period.month,
      year: period.year,
      companyHolidays: new Set<string>(),
    });
  }, [item?.dailyLtcSummary, period.month, period.year]);

  if (!item) return null;

  const b = item.breakdown;
  const monthName = MONTH_NAMES_EN[period.month - 1] || "";

  // Determine whether this user/department uses the 10+10 Sales Discipline+LTC split or 20 XP pure Clean Discipline
  const hasSalesAccess = b?.hasSalesAccess ?? Boolean(item.dailyLtcSummary);
  const cleanBonusXp = b?.cleanBonusXp ?? 0;
  const individualLtcXp = b?.individualLtcXp ?? 0;
  const individualLtcCardsCount = b?.individualLtcCardsCount ?? 0;
  const teamZeroBonusXp = b?.teamZeroLtcXp ?? ltcSummary?.teamZeroBonusXp ?? 0;
  const ltcTotalXp = b?.ltcXp ?? Math.min(10, individualLtcXp + teamZeroBonusXp);
  const disciplineTotalXp = b?.disciplineTotalXp ?? cleanBonusXp + ltcTotalXp;

  // Pure task/collab role inside sales dept can earn up to 20 XP directly from clean days if cleanBonusXp > 10
  const usesPureClean20Scale = !hasSalesAccess || (cleanBonusXp > 10 && ltcTotalXp === 0);
  const cleanMaxXp = usesPureClean20Scale ? 20 : 10;
  const cleanDayUnitXp = usesPureClean20Scale ? "1.0" : "0.5";
  const shieldUnitXp = usesPureClean20Scale ? "0.5" : "0.25";
  const showLtcTab = hasSalesAccess && !usesPureClean20Scale;

  const cleanDaysCount =
    item.dailyHealthSummary?.cleanDaysCount ?? b?.cleanBonusDays ?? 0;
  const graceDaysCount =
    item.dailyHealthSummary?.graceDaysCount ?? b?.graceDaysCount ?? 0;
  const healthDailyRecords = useMemo(() => {
    const records = item.dailyHealthSummary?.dailyRecords || [];
    return [...records].reverse();
  }, [item.dailyHealthSummary?.dailyRecords]);

  const cleanLtcDaysCount = ltcSummary?.cleanLtcDaysCount ?? 0;
  const totalLtcWorkingDays = ltcSummary?.totalWorkingDays ?? 0;
  const currentLtcCount = ltcSummary?.currentLtcCount ?? 0;
  const sortedLtcDailyRecords = useMemo(() => {
    const records = ltcSummary?.dailyRecords || [];
    return [...records].sort((a, b) => b.dayIndex - a.dayIndex);
  }, [ltcSummary?.dailyRecords]);

  const ltcCaredCards = item.categoryDetails?.ltcCaredCards;
  const effectiveTab: DisciplineDrawerTab = showLtcTab ? activeTab : "discipline";

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
          {/* Header with Back Button */}
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
                  {item.isCurrentUser && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#C7F33C] text-black shrink-0">
                      You
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5 truncate">
                  <Calendar className="w-3 h-3 text-[#C7F33C] shrink-0" />
                  <span className="truncate">
                    {showLtcTab ? "Daily Discipline & LTC Care" : "Daily Clean Discipline"} • {monthName} {period.year}
                  </span>
                </div>
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

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-4">
            {/* Hero Summary Card (Max 20 XP) */}
            <div className="rounded-2xl p-4 bg-[#1C1C1D] border border-[#3A3B3C] space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#C7F33C]" />
                  <span className="text-xs font-bold text-slate-200">
                    {showLtcTab ? "Discipline & LTC Care Score" : "Daily Clean Discipline Score"}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-[#C7F33C]/10 text-[#C7F33C] border border-[#C7F33C]/30">
                  Max 20 XP
                </span>
              </div>

              <div className="flex items-center gap-4">
                <ScoreRingGauge score={disciplineTotalXp} maxScore={20} />

                <div className="flex-1 min-w-0 grid grid-cols-1 gap-2">
                  {/* Pillar A: Clean Workdays */}
                  <button
                    type="button"
                    onClick={() => setActiveTab("discipline")}
                    className={`text-left p-2.5 rounded-xl border transition-colors cursor-pointer ${
                      effectiveTab === "discipline"
                        ? "bg-[#252728] border-[#C7F33C]/50 hover:border-[#C7F33C]"
                        : "bg-[#252728]/60 border-[#3A3B3C] hover:bg-[#252728] hover:border-[#4E4F50]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Daily Clean Workdays</span>
                      </span>
                      <span className="text-xs font-mono font-bold text-[#C7F33C] shrink-0">
                        +{fmtXp(cleanBonusXp)} / {cleanMaxXp} XP
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {cleanDaysCount} clean days
                      {graceDaysCount > 0 ? ` • ${graceDaysCount} shield days` : ""}
                    </div>
                  </button>

                  {/* Pillar B: LTC Care (only when sales department) */}
                  {showLtcTab && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("ltc")}
                      className={`text-left p-2.5 rounded-xl border transition-colors cursor-pointer ${
                        effectiveTab === "ltc"
                          ? "bg-[#252728] border-sky-400/60 hover:border-sky-400"
                          : "bg-[#252728]/60 border-[#3A3B3C] hover:bg-[#252728] hover:border-[#4E4F50]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          <span>LTC Customer Care</span>
                        </span>
                        <span className="text-xs font-mono font-bold text-sky-300 shrink-0">
                          +{fmtXp(ltcTotalXp)} / 10 XP
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Individual +{fmtXp(individualLtcXp)}/8 ({individualLtcCardsCount} cards) • Team +{fmtXp(teamZeroBonusXp)}/2
                      </div>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Sub-tab Switcher */}
            {showLtcTab && (
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#1C1C1D] border border-[#3A3B3C]">
                <button
                  type="button"
                  onClick={() => setActiveTab("discipline")}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    effectiveTab === "discipline"
                      ? "bg-[#C7F33C] text-black"
                      : "text-slate-300 hover:text-white hover:bg-[#3A3B3C]/60"
                  }`}
                >
                  Daily Discipline ({cleanMaxXp} XP)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("ltc")}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    effectiveTab === "ltc"
                      ? "bg-[#C7F33C] text-black"
                      : "text-slate-300 hover:text-white hover:bg-[#3A3B3C]/60"
                  }`}
                >
                  LTC Care (10 XP)
                </button>
              </div>
            )}

            {/* TAB 1: DAILY CLEAN DISCIPLINE */}
            {effectiveTab === "discipline" && (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-[#1C1C1D] border border-[#3A3B3C] text-xs text-slate-300 leading-relaxed">
                  <span className="text-[#C7F33C] font-bold">How it works:</span>{" "}
                  Keep 0 red cards all day to earn{" "}
                  <span className="font-bold text-white">+{cleanDayUnitXp} XP/day</span> •
                  Holders of 15+ active cards with only 1 red card still earn a Heavy-Load Shield{" "}
                  <span className="font-bold text-sky-300">(+{shieldUnitXp} XP)</span>.
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                  <span className="font-bold text-slate-200">
                    Daily Discipline Log (23:00 Cutoff)
                  </span>
                  <span className="text-[11px]">{healthDailyRecords.length} days</span>
                </div>

                {healthDailyRecords.length === 0 ? (
                  <div className="p-6 text-center rounded-xl bg-[#1C1C1D] border border-[#3A3B3C] text-xs text-slate-400">
                    No workday records yet for this month
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {healthDailyRecords.map((day) => {
                      const dayName = DAY_NAMES_EN[day.dayOfWeek] || "";
                      const isCleanWorkday =
                        !day.isOffDay && !day.isNoCards && day.redCardsCount === 0;
                      const isShieldDay =
                        !day.isOffDay && !day.isNoCards && Boolean(day.isGraceShieldDay);

                      return (
                        <div
                          key={day.dateKey}
                          className={`rounded-xl border p-2.5 flex items-center justify-between gap-2 transition-colors ${
                            day.isOffDay
                              ? "bg-[#1C1C1D]/60 border-[#3A3B3C]/50 opacity-75 hover:opacity-100 hover:bg-[#252728] hover:border-[#4E4F50]"
                              : day.isNoCards
                              ? "bg-[#1C1C1D]/60 border-[#3A3B3C]/60 hover:bg-[#252728] hover:border-[#4E4F50]"
                              : isCleanWorkday
                              ? "bg-emerald-950/15 border-[#C7F33C]/40 hover:bg-emerald-950/30 hover:border-[#C7F33C]"
                              : isShieldDay
                              ? "bg-sky-950/20 border-sky-500/40 hover:bg-sky-950/35 hover:border-sky-400"
                              : "bg-rose-950/20 border-rose-500/30 hover:bg-rose-950/35 hover:border-rose-400/60"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg flex flex-col items-center justify-center font-bold text-center shrink-0 border ${
                                day.isOffDay || day.isNoCards
                                  ? "bg-[#252728] border-[#3A3B3C] text-slate-400"
                                  : isCleanWorkday
                                  ? "bg-[#C7F33C]/10 border-[#C7F33C]/30 text-[#C7F33C]"
                                  : isShieldDay
                                  ? "bg-sky-500/15 border-sky-500/35 text-sky-300"
                                  : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                              }`}
                            >
                              <span className="text-[8px] uppercase leading-none font-medium text-slate-400">
                                {dayName}
                              </span>
                              <span className="text-xs leading-tight font-black">
                                {day.dayIndex}
                              </span>
                            </div>

                            <div className="min-w-0 text-xs">
                              {day.isOffDay ? (
                                <div className="flex items-center gap-1.5 text-slate-300">
                                  {day.offDayReason === "Leave" ? (
                                    <Palmtree className="w-3.5 h-3.5 text-[#C7F33C]" />
                                  ) : (
                                    <Coffee className="w-3.5 h-3.5 text-amber-400" />
                                  )}
                                  <span>
                                    {day.offDayReason === "Sunday"
                                      ? "Sunday (Timer Paused)"
                                      : day.offDayReason === "Leave"
                                      ? "Personal Leave (Timer Paused)"
                                      : "Company Holiday"}
                                  </span>
                                </div>
                              ) : day.isNoCards ? (
                                <span className="text-slate-400">No active cards</span>
                              ) : isCleanWorkday ? (
                                <span className="text-slate-200 font-medium">
                                  All{" "}
                                  <span className="font-bold text-[#C7F33C]">
                                    {day.activeCardsCount} cards
                                  </span>{" "}
                                  clean
                                </span>
                              ) : isShieldDay ? (
                                <span className="text-sky-200 font-medium">
                                  15+ Load ({day.activeCardsCount} cards) • 1 Red Card
                                </span>
                              ) : (
                                <span className="text-rose-300 font-medium">
                                  {day.redCardsCount} / {day.activeCardsCount} Red Cards
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0">
                            {day.isOffDay ? (
                              <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-[#252728] border border-[#3A3B3C] text-slate-400">
                                Paused
                              </span>
                            ) : day.isNoCards ? (
                              <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-[#252728] border border-[#3A3B3C] text-slate-400">
                                0 XP
                              </span>
                            ) : isCleanWorkday ? (
                              <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-[#C7F33C]/15 border border-[#C7F33C]/40 text-[#C7F33C]">
                                +{cleanDayUnitXp} XP
                              </span>
                            ) : isShieldDay ? (
                              <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-sky-500/15 border border-sky-500/40 text-sky-300">
                                Shield +{shieldUnitXp} XP
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-rose-500/15 border border-rose-500/30 text-rose-400">
                                0 XP
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: LTC CARE (INDIVIDUAL 8 XP + TEAM 2 XP) */}
            {effectiveTab === "ltc" && showLtcTab && (
              <div className="space-y-4">
                {/* Part 1: Individual LTC-* Care (Max 8 XP) */}
                <div className="rounded-2xl p-4 bg-[#1C1C1D] border border-[#3A3B3C] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-[#C7F33C]" />
                        <span>1. Individual LTC Card Care</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Step 1 Outreach (+1 XP) • Step 2 Progress (+2 XP/card, max 4 cards = 8 XP)
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-[#252728] border border-[#4E4F50] text-[#C7F33C] shrink-0">
                      +{fmtXp(individualLtcXp)} / 8 XP
                    </span>
                  </div>

                  {ltcCaredCards ? (
                    ltcCaredCards.length > 0 ? (
                      <div className="space-y-1.5 pt-1">
                        {ltcCaredCards.map((card) => (
                          <div
                            key={card.dealId}
                            className="p-2.5 rounded-xl bg-[#252728] border border-[#3A3B3C] hover:bg-[#3A3B3C]/70 hover:border-[#C7F33C]/40 transition-colors flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              {card.companyName && (
                                <div className="text-xs font-bold text-slate-100 truncate">
                                  {card.companyName}
                                </div>
                              )}
                              <div className="text-[11px] text-slate-400 truncate">
                                {card.topic}
                              </div>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 border ${
                                card.tone === "lime"
                                  ? "bg-[#C7F33C]/15 text-[#C7F33C] border-[#C7F33C]/40"
                                  : "bg-sky-500/15 text-sky-300 border-sky-500/35"
                              }`}
                            >
                              {card.badgeText}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-[#252728] border border-[#3A3B3C] text-xs text-slate-300 leading-relaxed">
                        No <span className="font-mono text-[#C7F33C]">LTC-*</span> cards earned yet this month •
                        Click the <span className="font-bold text-white">LTC</span> button on Pipeline to claim overdue accounts and earn up to{" "}
                        <span className="font-bold text-[#C7F33C]">+8 XP</span>.
                      </div>
                    )
                  ) : (
                    <div className="p-3 rounded-xl bg-[#252728] border border-[#3A3B3C] text-xs text-slate-300 flex items-center justify-between">
                      <span>LTC cards cared for this month</span>
                      <span className="font-mono font-bold text-[#C7F33C]">
                        {individualLtcCardsCount} cards (+{fmtXp(individualLtcXp)} XP)
                      </span>
                    </div>
                  )}
                </div>

                {/* Part 2: Team Zero-LTC Daily Bonus (Max 2 XP) */}
                <div className="space-y-2">
                  <div className="rounded-2xl p-3.5 bg-[#1C1C1D] border border-[#3A3B3C] flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-sky-400" />
                        <span>2. Team Zero-LTC Daily Bonus</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Cleared {cleanLtcDaysCount}/{totalLtcWorkingDays} workdays (+0.1 XP/day when 0 LTC pending at 17:00)
                        {currentLtcCount > 0 ? ` • ${currentLtcCount} pending today` : ""}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-[#252728] border border-[#4E4F50] text-sky-300 shrink-0">
                      +{fmtXp(teamZeroBonusXp)} / 2 XP
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {sortedLtcDailyRecords.map((day) => {
                      const dayName = DAY_NAMES_EN[day.dayOfWeek] || "";
                      return (
                        <div
                          key={day.dateKey}
                          className={`rounded-xl border p-2.5 flex items-center justify-between transition-colors ${
                            day.isOffDay
                              ? "bg-[#1C1C1D]/60 border-[#3A3B3C]/50 opacity-75 hover:opacity-100 hover:bg-[#252728] hover:border-[#4E4F50]"
                              : day.isClean
                              ? "bg-emerald-950/15 border-[#C7F33C]/40 hover:bg-emerald-950/30 hover:border-[#C7F33C]"
                              : "bg-rose-950/20 border-rose-500/30 hover:bg-rose-950/35 hover:border-rose-400/60"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg flex flex-col items-center justify-center font-bold text-center shrink-0 border ${
                                day.isOffDay
                                  ? "bg-[#252728] border-[#3A3B3C] text-slate-400"
                                  : day.isClean
                                  ? "bg-[#C7F33C]/10 border-[#C7F33C]/30 text-[#C7F33C]"
                                  : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                              }`}
                            >
                              <span className="text-[8px] uppercase leading-none font-medium text-slate-400">
                                {dayName}
                              </span>
                              <span className="text-xs leading-tight font-black">
                                {day.dayIndex}
                              </span>
                            </div>

                            {day.isOffDay ? (
                              <div className="flex items-center gap-1.5 text-xs text-slate-300">
                                {day.offDayReason === "Sunday" ? (
                                  <Coffee className="w-3.5 h-3.5 text-amber-400" />
                                ) : (
                                  <Palmtree className="w-3.5 h-3.5 text-emerald-400" />
                                )}
                                <span>
                                  {day.offDayReason === "Sunday" ? "Sunday" : "Company Holiday"}
                                </span>
                              </div>
                            ) : (
                              <span
                                className={`text-xs font-semibold ${
                                  day.isClean ? "text-[#C7F33C]" : "text-rose-300"
                                }`}
                              >
                                {day.isClean
                                  ? "0 Pending LTC Accounts"
                                  : `${day.ltcCount} Pending LTC ${day.ltcCount === 1 ? "Account" : "Accounts"}`}
                              </span>
                            )}
                          </div>

                          <div className="shrink-0">
                            {day.isOffDay ? (
                              <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-[#252728] border border-[#3A3B3C] text-slate-400">
                                Paused
                              </span>
                            ) : day.isClean ? (
                              <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-[#C7F33C]/15 border border-[#C7F33C]/40 text-[#C7F33C]">
                                +0.1 XP
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-rose-500/15 border border-rose-500/30 text-rose-400">
                                0 XP
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Compact Footer Hint */}
            <div className="rounded-xl bg-[#1C1C1D] border border-[#3A3B3C] p-3 flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed">
              <Info className="w-4 h-4 text-[#C7F33C] shrink-0 mt-0.5" />
              <span>
                Sundays, company holidays, and approved personal leaves automatically pause card timers with zero penalty.
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
