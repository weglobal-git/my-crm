"use client";

import { useEffect, useRef } from "react";
import {
  ArrowLeft,
  Calendar,
  Zap,
  Trophy,
  Users,
  CheckCircle2,
  Layers,
  Sparkles,
  Clock,
  AlertTriangle,
  Info,
} from "lucide-react";
import type {
  CategoryCardHighlightTone,
  LeaderboardItem,
} from "@/lib/dashboard/leaderboard-types";

export type CategoryDetailMode = "velocity" | "outcome";

interface CategoryDetailDrawerProps {
  item: LeaderboardItem | null;
  mode: CategoryDetailMode | null;
  period: { month: number; year: number };
  onClose: () => void;
  onOpenAnalyse?: (item: LeaderboardItem) => void;
}

const MONTH_NAMES_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtXp(val: number | undefined): string {
  const n = Math.round((val ?? 0) * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function fmtBaht(val: number | undefined): string {
  const n = Math.round(val ?? 0);
  return `฿${n.toLocaleString("en-US")}`;
}

function getBadgeToneClasses(tone: CategoryCardHighlightTone): string {
  switch (tone) {
    case "lime":
      return "bg-[#C7F33C]/15 text-[#C7F33C] border-[#C7F33C]/40";
    case "emerald":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/35";
    case "sky":
      return "bg-sky-500/15 text-sky-300 border-sky-500/35";
    case "amber":
      return "bg-amber-500/15 text-amber-300 border-amber-500/35";
    case "rose":
      return "bg-rose-500/15 text-rose-300 border-rose-500/35";
  }
}

function ProgressBar({
  value,
  max,
  barClass = "bg-[#C7F33C]",
}: {
  value: number;
  max: number;
  barClass?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="w-full h-2 rounded-full bg-[#252728] border border-[#3A3B3C] overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${barClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function CategoryRingGauge({
  score,
  maxScore = 25,
  accentHex = "#C7F33C",
  size = 96,
  strokeWidth = 9,
}: {
  score: number;
  maxScore?: number;
  accentHex?: string;
  size?: number;
  strokeWidth?: number;
}) {
  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const pct = maxScore > 0 ? Math.min(100, Math.max(0, (score / maxScore) * 100)) : 0;
  const strokeDashoffset = circumference - (pct / 100) * circumference;
  const strokeColor = pct > 0 ? accentHex : "#64748B";

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
            stroke={strokeColor}
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
          style={{ color: strokeColor }}
        >
          {fmtXp(score)}
        </span>
        <span className="text-[10px] text-slate-400 font-mono mt-0.5">/ {maxScore} XP</span>
      </div>
    </div>
  );
}

export function CategoryDetailDrawer({
  item,
  mode,
  period,
  onClose,
  onOpenAnalyse,
}: CategoryDetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (item && mode) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "auto";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [item, mode, onClose]);

  if (!item || !mode || !item.breakdown) return null;

  const b = item.breakdown;
  const monthName = MONTH_NAMES_EN[period.month - 1] || "";
  const isVelocity = mode === "velocity";

  // Shared portfolio mix
  const salesPct = b.salesWeightPct ?? 100;
  const taskPct = b.taskWeightPct ?? 0;

  // Velocity metrics (v2.3 Full-Month Rolling Consistency)
  const velocityXp = b.velocityXp ?? 0;
  const velocityProgressXp = b.velocityProgressXp ?? 0;
  const velocityVolumeXp = b.velocityVolumeXp ?? 0;
  const velocityCoverageXp = b.velocityCoverageXp ?? 0;
  const elapsedDays = b.elapsedWorkingDays ?? 20;
  const effProgDays = b.effectiveProgressDays ?? b.progressWorkdaysCount ?? b.progressCardsCount ?? 0;
  const progConsistencyPct = b.dailyProgressConsistencyPct ?? 0;
  const targetProgDays = Math.max(1, Math.round(elapsedDays * 0.75 * 10) / 10);
  const progressCards = b.progressCardsCount ?? 0;
  const eligibleCards = b.eligibleProgressCardsCount ?? 0;
  const coveragePct = b.progressCoveragePct ?? 0;
  const multiStepCards = b.multiStepProgressCardsCount ?? 0;
  const velocityTeamworkXp = b.velocityTeamworkXp ?? 0;
  const teammateAssists = b.teammate27hAssistsCount ?? 0;
  const assistWorkdays = b.teammateAssistWorkdaysCount ?? teammateAssists;
  const targetAssistDays = Math.max(1, Math.round(elapsedDays * 0.3 * 10) / 10);
  const velocityWorkloadXp = b.velocityWorkloadXp ?? 0;
  const velocityExecutionXp = b.velocityExecutionXp ?? 0;
  const workloadAndExecXp = Math.round((velocityWorkloadXp + velocityExecutionXp) * 10) / 10;
  const workedCards = b.workedActiveCardsCount ?? b.activeCards ?? 0;
  const avgCleanCards = b.avgDailyCleanCards ?? workedCards;
  const onTimeDue = b.onTimeDueFulfillmentsCount ?? 0;
  const completedTodos = b.completedTodosCount ?? 0;
  const fastReplies = b.fastRepliesCount ?? 0;
  const missedDue = b.missedOrStalledDueCount ?? 0;
  const onTimeExecPct = b.onTimeExecutionRatePct ?? 0;

  // Outcome metrics (v2.3 Active Contributor Rule)
  const outcomeXp = b.outcomeXp ?? 0;
  const salesOutcomeRaw = b.salesOutcomeRaw ?? 0;
  const taskOutcomeRaw = b.taskOutcomeRaw ?? 0;
  const ownedSales = b.ownedSalesDeals ?? 0;
  const ownedTasks = b.ownedInternalTasks ?? 0;
  const wonSalesDeals =
    b.wonSalesDealsCount ?? Math.max(0, b.dealsWon - (b.completedInternalTasks ?? 0));
  const revenue = b.revenue ?? 0;
  const deptRevenue = b.departmentTotalRevenue ?? 0;
  const completedTasks = b.completedInternalTasks ?? 0;
  const onTimeTasks = b.onTimeInternalTasks ?? 0;
  const healthyProjects = b.healthyActiveProjectTasksCount ?? 0;
  const openMilestones = b.openTaskMilestoneCreditsCount ?? 0;
  const overdueOpenTasks = b.overdueOpenInternalTasksCount ?? 0;
  const collabWonDeals = b.collaboratorWonDealsCount ?? 0;
  const collabAssistWinXp = b.collaboratorAssistWinXp ?? Math.min(ownedSales + ownedTasks === 0 ? 10 : 8, collabWonDeals * 2);

  const details = item.categoryDetails;

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
                  {item.isCurrentUser && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#C7F33C] text-black shrink-0">
                      You
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                  <Calendar className="w-3 h-3 text-[#C7F33C] shrink-0" />
                  <span className="truncate">
                    {isVelocity ? "Velocity & Teamwork" : "Portfolio Outcome"} • {monthName}{" "}
                    {period.year}
                  </span>
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

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-4">
            {isVelocity ? (
              <>
                {/* VELOCITY HERO CARD (Max 25 XP) */}
                <div className="rounded-2xl p-4 bg-[#1C1C1D] border border-[#3A3B3C] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold text-slate-200">
                        Velocity &amp; Teamwork Score
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-amber-500/15 text-amber-300 border border-amber-500/35">
                      Max 25 XP
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <CategoryRingGauge
                      score={velocityXp}
                      maxScore={25}
                      accentHex="#F59E0B"
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Paced across all {elapsedDays} elapsed workdays this month — rewards consistent daily progress, teammate assists, clean workload, and on-time execution.
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#252728] border border-[#3A3B3C] text-[#C7F33C]">
                          {fmtXp(effProgDays)}/{elapsedDays}d Rhythm
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#252728] border border-[#3A3B3C] text-emerald-300">
                          {assistWorkdays}d Assisted ({teammateAssists}C)
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#252728] border border-[#3A3B3C] text-sky-300">
                          {fmtXp(avgCleanCards)} Clean Load
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SUB-PILLAR 1: DAILY PROGRESS RHYTHM & COVERAGE (Max 12 XP) */}
                <div className="rounded-2xl p-4 bg-[#1C1C1D] border border-[#3A3B3C] hover:border-[#C7F33C]/45 transition-colors space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-[#C7F33C] shrink-0" />
                      <span>1. Daily Progress Rhythm &amp; Coverage</span>
                    </span>
                    <span className="text-xs font-mono font-bold text-[#C7F33C] shrink-0">
                      +{fmtXp(velocityProgressXp)} / 12 XP
                    </span>
                  </div>

                  <ProgressBar
                    value={velocityProgressXp}
                    max={12}
                    barClass="bg-[#C7F33C]"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                    <div className="p-2.5 rounded-xl bg-[#252728] border border-[#3A3B3C] hover:border-[#4E4F50] transition-colors">
                      <div className="flex items-center justify-between text-slate-300">
                        <span>Daily Progress Rhythm</span>
                        <span className="font-mono font-bold text-[#C7F33C]">
                          +{fmtXp(velocityVolumeXp)} / 7
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {fmtXp(effProgDays)}/{elapsedDays} workdays ({progConsistencyPct}% • ≥75% ({fmtXp(targetProgDays)}d) = full 7 XP)
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[#252728] border border-[#3A3B3C] hover:border-[#4E4F50] transition-colors">
                      <div className="flex items-center justify-between text-slate-300">
                        <span>Portfolio Coverage</span>
                        <span className="font-mono font-bold text-emerald-300">
                          +{fmtXp(velocityCoverageXp)} / 5
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {coveragePct}% covered ({progressCards} of {eligibleCards} cards • ≥75% = full 5 XP
                        {multiStepCards > 0 ? ` • ${multiStepCards} multi-step` : ""})
                      </div>
                    </div>
                  </div>
                </div>

                {/* SUB-PILLAR 2: CONSISTENT TEAMWORK (Max 6 XP) */}
                <div className="rounded-2xl p-4 bg-[#1C1C1D] border border-[#3A3B3C] hover:border-emerald-400/45 transition-colors space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>2. Consistent Teammate Assists</span>
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-300 shrink-0">
                      +{fmtXp(velocityTeamworkXp)} / 6 XP
                    </span>
                  </div>

                  <ProgressBar
                    value={velocityTeamworkXp}
                    max={6}
                    barClass="bg-emerald-400"
                  />

                  <p className="text-xs text-slate-300 leading-relaxed">
                    Posted verified +27h assists across{" "}
                    <span className="font-bold text-white">{assistWorkdays} workdays</span>{" "}
                    ({teammateAssists} teammate cards){" "}
                    <span className="text-slate-400">
                      (target ≥30% of workdays = {fmtXp(targetAssistDays)}d for full 6 XP)
                    </span>
                  </p>
                </div>

                {/* SUB-PILLAR 3: DAILY CLEAN LOAD & ON-TIME EXECUTION (Max 7 XP) */}
                <div className="rounded-2xl p-4 bg-[#1C1C1D] border border-[#3A3B3C] hover:border-sky-400/45 transition-colors space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-sky-400 shrink-0" />
                      <span>3. Daily Clean Load &amp; On-Time Execution</span>
                    </span>
                    <span className="text-xs font-mono font-bold text-sky-300 shrink-0">
                      +{fmtXp(workloadAndExecXp)} / 7 XP
                    </span>
                  </div>

                  <ProgressBar
                    value={workloadAndExecXp}
                    max={7}
                    barClass="bg-sky-400"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                    <div className="p-2.5 rounded-xl bg-[#252728] border border-[#3A3B3C] hover:border-[#4E4F50] transition-colors">
                      <div className="flex items-center justify-between text-slate-300">
                        <span>Daily Clean Load</span>
                        <span className="font-mono font-bold text-sky-300">
                          +{fmtXp(velocityWorkloadXp)} / 3
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Avg {fmtXp(avgCleanCards)} clean cards/day (+0.2 XP/card • 15+ = full 3 XP)
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[#252728] border border-[#3A3B3C] hover:border-[#4E4F50] transition-colors">
                      <div className="flex items-center justify-between text-slate-300">
                        <span>On-Time &amp; Checklists</span>
                        <span className="font-mono font-bold text-amber-300">
                          +{fmtXp(velocityExecutionXp)} / 4
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {onTimeDue} due met • {completedTodos} todos
                        {fastReplies > 0 ? ` • ${fastReplies} urgent` : ""}
                        {missedDue > 0 ? ` • ${missedDue} late/stalled (${onTimeExecPct}% on-time)` : ""}
                      </div>
                    </div>
                  </div>
                </div>

                {/* REAL CARD EXAMPLES FOR SELF / MANAGER */}
                {details && (details.progressedCards.length > 0 || details.assistedCards.length > 0) && (
                  <div className="space-y-3 pt-1">
                    {details.progressedCards.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs px-1">
                          <span className="font-bold text-slate-200">
                            Progressed Cards This Month
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Showing {details.progressedCards.length} cards
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {details.progressedCards.map((card) => (
                            <div
                              key={card.dealId}
                              className="p-2.5 rounded-xl bg-[#1C1C1D] border border-[#3A3B3C] hover:bg-[#3A3B3C]/60 hover:border-[#C7F33C]/45 transition-colors flex items-center justify-between gap-2"
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
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${getBadgeToneClasses(
                                  card.tone
                                )}`}
                              >
                                {card.badgeText}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {details.assistedCards.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs px-1">
                          <span className="font-bold text-slate-200">
                            Assisted Teammate Cards
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Showing {details.assistedCards.length} cards
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {details.assistedCards.map((card) => (
                            <div
                              key={card.dealId}
                              className="p-2.5 rounded-xl bg-[#1C1C1D] border border-[#3A3B3C] hover:bg-[#3A3B3C]/60 hover:border-emerald-400/45 transition-colors flex items-center justify-between gap-2"
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
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${getBadgeToneClasses(
                                  card.tone
                                )}`}
                              >
                                {card.badgeText}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* OUTCOME HERO CARD (Max 25 XP) */}
                <div className="rounded-2xl p-4 bg-[#1C1C1D] border border-[#3A3B3C] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Trophy className="w-4 h-4 text-sky-400" />
                      <span className="text-xs font-bold text-slate-200">
                        Monthly Portfolio Outcome Score
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-sky-500/15 text-sky-300 border border-sky-500/35">
                      Max 25 XP
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <CategoryRingGauge
                      score={outcomeXp}
                      maxScore={25}
                      accentHex="#38BDF8"
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Credits Card Owners and Active Helpers (+27h comments or ≥2 To-Dos) — passive card members receive 0 XP.
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#252728] border border-[#3A3B3C] text-[#C7F33C] font-semibold">
                          <Layers className="w-3 h-3" />
                          <span>Sales Weight {salesPct}%</span>
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[#252728] border border-[#3A3B3C] text-sky-300 font-semibold">
                          Task Weight {taskPct}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SALES OUTCOME SECTION */}
                {(salesPct > 0 || wonSalesDeals > 0 || (ownedSales + ownedTasks === 0 && b.hasSalesAccess !== false && collabWonDeals === 0)) && (
                  <div className="rounded-2xl p-4 bg-[#1C1C1D] border border-[#3A3B3C] hover:border-[#C7F33C]/45 transition-colors space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-slate-100">
                          Sales Deal Outcome ({salesPct}% Weight)
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Verified WON Deals (+5 pts each) • Revenue Impact (up to +10 pts)
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-[#C7F33C] shrink-0">
                        {fmtXp(salesOutcomeRaw)} / 25
                      </span>
                    </div>

                    <ProgressBar
                      value={salesOutcomeRaw}
                      max={25}
                      barClass="bg-[#C7F33C]"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                      <div className="p-2.5 rounded-xl bg-[#252728] border border-[#3A3B3C] hover:border-[#4E4F50] transition-colors">
                        <div className="text-slate-400 text-[11px]">Verified WON Deals</div>
                        <div className="text-sm font-bold text-slate-100 mt-0.5">
                          {wonSalesDeals} {wonSalesDeals === 1 ? "Deal" : "Deals"}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#252728] border border-[#3A3B3C] hover:border-[#4E4F50] transition-colors">
                        <div className="text-slate-400 text-[11px]">Monthly WON Revenue</div>
                        <div className="text-sm font-mono font-bold text-[#C7F33C] mt-0.5 truncate">
                          {fmtBaht(revenue)}
                        </div>
                        {deptRevenue > 0 && (
                          <div className="text-[10px] text-slate-400 truncate">
                            Dept Total: {fmtBaht(deptRevenue)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* INTERNAL TASK SLA SECTION */}
                {(ownedTasks > 0 ||
                  completedTasks > 0 ||
                  healthyProjects > 0 ||
                  overdueOpenTasks > 0 ||
                  (taskPct > 0 && collabWonDeals === 0)) && (
                  <div className="rounded-2xl p-4 bg-[#1C1C1D] border border-[#3A3B3C] hover:border-sky-400/45 transition-colors space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-slate-100">
                          Internal Task &amp; Project SLA ({taskPct}% Weight)
                        </div>
                        <div className="text-[11px] text-slate-400">
                          On-Time SLA (15 pts) + Completed Tasks &amp; Project Milestones (10 pts)
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-sky-300 shrink-0">
                        {fmtXp(taskOutcomeRaw)} / 25
                      </span>
                    </div>

                    <ProgressBar
                      value={taskOutcomeRaw}
                      max={25}
                      barClass="bg-sky-400"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                      <div className="p-2.5 rounded-xl bg-[#252728] border border-[#3A3B3C] hover:border-[#4E4F50] transition-colors">
                        <div className="text-slate-400 text-[11px]">On-Time Task SLA</div>
                        <div className="text-sm font-bold text-slate-100 mt-0.5">
                          {onTimeTasks} / {completedTasks} Tasks
                        </div>
                        {healthyProjects > 0 && (
                          <div className="text-[10px] text-emerald-300 mt-0.5">
                            + {healthyProjects} active projects ({openMilestones} milestones)
                          </div>
                        )}
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#252728] border border-[#3A3B3C] hover:border-[#4E4F50] transition-colors">
                        <div className="text-slate-400 text-[11px]">Deliverable Milestones</div>
                        <div className="text-sm font-bold text-sky-300 mt-0.5">
                          {completedTasks} Closed • {openMilestones} Milestones
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          +2.5 pts/task • +1.0 pt/milestone
                        </div>
                      </div>
                    </div>

                    {overdueOpenTasks > 0 && (
                      <div className="p-2.5 rounded-xl bg-rose-950/25 border border-rose-500/35 flex items-start gap-2 text-xs text-rose-200">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <span>
                          <span className="font-bold text-white">{overdueOpenTasks} open internal {overdueOpenTasks === 1 ? "task is" : "tasks are"} currently red</span>, lowering your On-Time SLA ratio. Post a verified update to recover SLA points immediately.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* ACTIVE HELPER CO-CLOSE BONUS */}
                {collabWonDeals > 0 && (
                  <div className="rounded-2xl p-4 bg-[#1C1C1D] border border-[#3A3B3C] hover:border-emerald-400/45 transition-colors space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-slate-100">
                          Active Helper Co-Close Bonus
                        </div>
                        <div className="text-[11px] text-slate-400">
                          +2.0 XP per teammate card you actively helped (+27h or ≥2 To-Dos) that closed WON
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-emerald-300 shrink-0">
                        +{fmtXp(collabAssistWinXp)} XP
                      </span>
                    </div>
                    <div className="text-xs text-slate-300">
                      Co-closed <span className="font-bold text-white">{collabWonDeals} {collabWonDeals === 1 ? "card" : "cards"}</span> with verified helper contributions (passive membership = 0 XP).
                    </div>
                  </div>
                )}

                {/* REAL OUTCOME CARDS LIST */}
                {details && details.outcomeCards.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs px-1">
                      <span className="font-bold text-slate-200">
                        Outcome &amp; Deliverable Cards This Month
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Showing {details.outcomeCards.length} items
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {details.outcomeCards.map((card) => (
                        <div
                          key={card.dealId}
                          className="p-2.5 rounded-xl bg-[#1C1C1D] border border-[#3A3B3C] hover:bg-[#3A3B3C]/60 hover:border-sky-400/45 transition-colors flex items-center justify-between gap-2"
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
                          <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getBadgeToneClasses(
                                card.tone
                              )}`}
                            >
                              {card.badgeText}
                            </span>
                            {card.value !== undefined && card.value > 0 && (
                              <span className="text-[11px] font-mono font-bold text-[#C7F33C]">
                                {fmtBaht(card.value)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hint when 0 outcome cards yet */}
                {outcomeXp === 0 && (!details || details.outcomeCards.length === 0) && (
                  <div className="rounded-xl bg-[#1C1C1D] border border-[#3A3B3C] p-3.5 flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                    <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <span>
                      No closed deals or completed deliverables recorded yet this month — closing WON deals, completing internal tasks on time, or co-closing team deals will earn points here automatically.
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

