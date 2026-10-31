"use client";

import { useState } from "react";
import {
  CircleDollarSign,
  Trophy,
  FileText,
  Zap,
  CheckSquare,
  MessageSquare,
  Users,
  Calendar,
  ShieldCheck,
  Sparkles,
  Clock,
  ChevronDown,
} from "lucide-react";
import type { LeaderboardCategoryData, LeaderboardItem } from "@/lib/dashboard/leaderboard-types";
import { canUserInspectAnalyseTarget } from "@/lib/dashboard/leaderboard-score-analysis";

interface DashboardCategoryColumnsProps {
  categories: LeaderboardCategoryData[];
  onSelectUser?: (item: LeaderboardItem) => void;
  onSelectHealthUser?: (item: LeaderboardItem) => void;
  onSelectDisciplineUser?: (item: LeaderboardItem, initialTab?: "discipline" | "ltc") => void;
  onSelectLtcUser?: (item: LeaderboardItem) => void;
  onSelectVelocityUser?: (item: LeaderboardItem) => void;
  onSelectOutcomeUser?: (item: LeaderboardItem) => void;
  onAnalyseUser?: (item: LeaderboardItem) => void;
  canAnalyseAll?: boolean;
  onOpenCategoryRules?: (categoryId: string) => void;
  layout?: "grid" | "vertical" | "tabs";
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  CircleDollarSign,
  Trophy,
  FileText,
  Zap,
  CheckSquare,
  MessageSquare,
  Users,
  Calendar,
  ShieldCheck,
  Sparkles,
  Clock,
};

const TABS = [
  { id: "card_health", label: "Health" },
  { id: "clean_ltc", label: "Discipline" },
  { id: "velocity", label: "Velocity" },
  { id: "outcome", label: "Outcome" },
];

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function fmtXp(val: number): string {
  const n = Math.round(val * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function DashboardCategoryColumns({
  categories,
  onSelectUser,
  onSelectHealthUser,
  onSelectDisciplineUser,
  onSelectLtcUser,
  onSelectVelocityUser,
  onSelectOutcomeUser,
  onAnalyseUser,
  canAnalyseAll = false,
  layout = "tabs",
  activeTab: activeTabProp,
  onTabChange,
}: DashboardCategoryColumnsProps) {
  const [internalActiveTab, setInternalActiveTab] = useState<string>("card_health");
  const [isRulesExpanded, setIsRulesExpanded] = useState<boolean>(false);
  const activeTab = activeTabProp ?? internalActiveTab;

  const handleTabChange = (tabId: string) => {
    setInternalActiveTab(tabId);
    onTabChange?.(tabId);
  };

  const currentCategory =
    categories.find((c) => c.id === activeTab) || categories[0] || null;

  const renderCategoryItems = (category: LeaderboardCategoryData) => {
    const top10 = category.items.slice(0, 10);
    const isHealth = category.id === "card_health";
    const isCleanLtc = category.id === "clean_ltc" || category.id === "clean_bonus";
    const isVelocity = category.id === "velocity";
    const isOutcome = category.id === "outcome";

    if (top10.length === 0) {
      return (
        <div className="p-6 text-center text-xs text-slate-400">
          No activity recorded
        </div>
      );
    }

    return (
      <div className="flex flex-col">
        {top10.map((item) => {
          const isGold = item.rank === 1;
          const isSilver = item.rank === 2;
          const isBronze = item.rank === 3;

          return (
            <div
              key={item.userId}
              onClick={() => {
                if (isHealth && onSelectHealthUser) {
                  onSelectHealthUser(item);
                } else if (isCleanLtc && (onSelectDisciplineUser || onSelectLtcUser)) {
                  if (onSelectDisciplineUser) {
                    onSelectDisciplineUser(item, "discipline");
                  } else {
                    onSelectLtcUser?.(item);
                  }
                } else if (isVelocity && onSelectVelocityUser) {
                  onSelectVelocityUser(item);
                } else if (isOutcome && onSelectOutcomeUser) {
                  onSelectOutcomeUser(item);
                } else {
                  onSelectUser?.(item);
                }
              }}
              className={`flex items-center justify-between p-2 text-sm rounded-xl transition-colors cursor-pointer ${
                item.isCurrentUser
                  ? "bg-[#C7F33C]/10 border border-[#C7F33C]/40 hover:bg-[#C7F33C]/20 hover:border-[#C7F33C]"
                  : "border border-transparent hover:bg-[#4E4F50]/60 hover:border-[#4E4F50]"
              }`}
              title={
                isHealth
                  ? "View daily card health"
                  : isCleanLtc
                  ? "View daily discipline & LTC care"
                  : isVelocity
                  ? "View velocity & teamwork breakdown"
                  : isOutcome
                  ? "View outcome & SLA breakdown"
                  : item.breakdown
                  ? "View score breakdown"
                  : undefined
              }
            >
              {/* Left: Rank Badge + Avatar + Name */}
              <div className="flex items-center gap-2.5 min-w-0 pr-2 flex-1">
                <span
                  className={`w-6 h-6 rounded-full font-black text-[11px] flex items-center justify-center shrink-0 ${
                    isGold
                      ? "bg-[#C7F33C] text-black"
                      : isSilver
                      ? "bg-[#4E4F50] text-slate-100"
                      : isBronze
                      ? "bg-[#3A3B3C] border border-[#4E4F50] text-slate-300"
                      : "bg-[#252728] border border-[#4E4F50] text-slate-400"
                  }`}
                >
                  {item.rank}
                </span>

                <div className="w-7 h-7 rounded-full bg-[#252728] border border-[#4E4F50] overflow-hidden flex items-center justify-center shrink-0">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] font-bold text-slate-200">
                      {getInitials(item.name)}
                    </span>
                  )}
                </div>

                <span
                  className={`text-xs truncate ${
                    item.isCurrentUser
                      ? "font-bold text-[#C7F33C]"
                      : "font-semibold text-slate-200"
                  }`}
                  title={item.name}
                >
                  {item.name}
                  {item.isCurrentUser && (
                    <span className="ml-1 text-[10px] font-normal text-slate-400">
                      (You)
                    </span>
                  )}
                </span>
              </div>

              {/* Right: Compact Score Value / Category Badges + Role-Gated Analyse Action */}
              <div className="text-right shrink-0 flex items-center gap-1.5 justify-end">
                {isHealth ? (
                  (() => {
                    const activeCards =
                      item.dailyHealthSummary?.currentActiveCards ??
                      item.breakdown?.activeCards ??
                      0;
                    const hasExposure =
                      activeCards > 0 ||
                      (item.dailyHealthSummary?.totalCardHours ?? 0) > 0 ||
                      Boolean(item.breakdown?.isCollaboratorCardHealth);
                    const redCards =
                      item.dailyHealthSummary?.currentRedCards ??
                      item.breakdown?.redCards ??
                      0;
                    const rate = item.dailyHealthSummary?.avgMonthlyRedRate ?? 0;
                    const xp = item.score ?? 0;

                    return (
                      <div className="flex items-center gap-1.5 justify-end">
                        {item.breakdown?.isCollaboratorCardHealth ? (
                          <span
                            className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded leading-none shrink-0 bg-sky-500/15 text-sky-300 border border-sky-500/30"
                            title="Pure Collaborator Health (85% cap on assisted team cards)"
                          >
                            Collab {item.breakdown.teammate27hAssistsCount ?? 0}C
                          </span>
                        ) : (
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded leading-none shrink-0 ${
                              redCards > 0
                                ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                : !hasExposure
                                ? "bg-slate-800/40 text-slate-500 border border-slate-700/50"
                                : "bg-[#C7F33C]/10 text-[#C7F33C] border border-[#C7F33C]"
                            }`}
                            title={`Today: ${redCards} red / ${activeCards} active cards`}
                          >
                            Daily {redCards}/{activeCards}
                          </span>
                        )}

                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded leading-none shrink-0 ${
                            hasExposure && rate > 5
                              ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                              : !hasExposure
                              ? "bg-slate-800/40 text-slate-500 border border-slate-700/50"
                              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          }`}
                          title={`Monthly Accumulated Red Rate: ${item.formattedValue}`}
                        >
                          Accu {item.formattedValue}
                        </span>

                        <span
                          className={`text-xs font-mono font-bold min-w-[44px] text-right shrink-0 ${
                            xp > 0 ? "text-[#C7F33C]" : "text-slate-500"
                          }`}
                        >
                          {fmtXp(xp)} XP
                        </span>
                      </div>
                    );
                  })()
                ) : isCleanLtc ? (
                  (() => {
                    const cleanDays =
                      item.dailyHealthSummary?.cleanDaysCount ??
                      item.breakdown?.cleanBonusDays ??
                      0;
                    const graceDays =
                      item.dailyHealthSummary?.graceDaysCount ??
                      item.breakdown?.graceDaysCount ??
                      0;
                    const indivLtcXp = item.breakdown?.individualLtcXp ?? 0;
                    const indivLtcCards = item.breakdown?.individualLtcCardsCount ?? 0;
                    const teamLtcXp =
                      item.breakdown?.teamZeroLtcXp ??
                      item.dailyLtcSummary?.teamZeroBonusXp ??
                      0;

                    return (
                      <div className="flex items-center gap-1.5 justify-end">
                        <span
                          className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded leading-none shrink-0 bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                          title={`Clean Workdays: ${cleanDays}D${
                            graceDays > 0 ? ` + Heavy-Load Shield: ${graceDays}D (+0.25 XP)` : ""
                          }`}
                        >
                          Clean {cleanDays}D{graceDays > 0 ? `+${graceDays}S` : ""}
                        </span>

                        {item.dailyLtcSummary && item.dailyLtcSummary.totalWorkingDays > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onSelectDisciplineUser) {
                                onSelectDisciplineUser(item, "ltc");
                              } else {
                                onSelectLtcUser?.(item);
                              }
                            }}
                            className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded leading-none shrink-0 cursor-pointer hover:brightness-110 transition-all ${
                              indivLtcXp > 0 ||
                              item.dailyLtcSummary.cleanLtcDaysCount >=
                                item.dailyLtcSummary.totalWorkingDays
                                ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                                : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                            }`}
                            title={`Individual LTC Care: +${fmtXp(indivLtcXp)}/8 XP (${indivLtcCards} LTC) · Team Zero-LTC: ${item.dailyLtcSummary.cleanLtcDaysCount}/${item.dailyLtcSummary.totalWorkingDays}D (+${fmtXp(teamLtcXp)}/2 XP) — Click to inspect`}
                          >
                            LTC +{fmtXp(indivLtcXp + teamLtcXp)}
                          </button>
                        )}

                        <span
                          className={`text-xs font-mono font-bold min-w-[44px] text-right shrink-0 ${
                            item.score > 0 ? "text-[#C7F33C]" : "text-slate-400"
                          }`}
                        >
                          {fmtXp(item.score)} XP
                        </span>
                      </div>
                    );
                  })()
                ) : isVelocity ? (
                  <div className="flex items-center gap-1.5 justify-end">
                    {item.breakdown && (
                      <span
                        className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded leading-none shrink-0 bg-[#252728] border border-[#4E4F50] text-slate-300"
                        title={`Daily Progress & Coverage ${fmtXp(item.breakdown.velocityProgressXp ?? 0)}/12 • Consistent Teamwork ${fmtXp(item.breakdown.velocityTeamworkXp ?? 0)}/6 • Clean Load & On-Time Exec ${fmtXp((item.breakdown.velocityWorkloadXp ?? 0) + (item.breakdown.velocityExecutionXp ?? 0))}/7`}
                      >
                        {`${fmtXp(
                          item.breakdown.effectiveProgressDays ??
                            item.breakdown.progressCardsCount ??
                            0
                        )}d Prog${
                          (item.breakdown.teammate27hAssistsCount ?? 0) > 0
                            ? ` · ${
                                item.breakdown.teammateAssistWorkdaysCount ??
                                item.breakdown.teammate27hAssistsCount
                              }d Help`
                            : ""
                        }`}
                      </span>
                    )}
                    <span
                      className={`text-xs font-mono font-bold min-w-[44px] text-right shrink-0 ${
                        item.score > 0 ? "text-[#C7F33C]" : "text-slate-400"
                      }`}
                    >
                      {fmtXp(item.score)} XP
                    </span>
                  </div>
                ) : isOutcome ? (
                  <div className="flex items-center gap-1.5 justify-end">
                    {item.breakdown && (
                      <span
                        className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded leading-none shrink-0 bg-[#252728] border border-[#4E4F50] text-slate-300"
                        title="Active Owner Won Deals / Task SLA & Active Helper Co-Close Bonus (passive members = 0 XP)"
                      >
                        {(item.breakdown.ownedSalesDeals ?? 0) === 0 &&
                        (item.breakdown.ownedInternalTasks ?? 0) === 0 &&
                        (item.breakdown.collaboratorWonDealsCount ?? 0) > 0
                          ? `${item.breakdown.collaboratorWonDealsCount} Assist Win`
                          : (item.breakdown.taskWeightPct ?? 0) === 100
                          ? (item.breakdown.completedInternalTasks ?? 0) > 0
                            ? `${item.breakdown.onTimeInternalTasks ?? 0}/${item.breakdown.completedInternalTasks ?? 0} SLA`
                            : (item.breakdown.healthyActiveProjectTasksCount ?? 0) > 0
                            ? `${item.breakdown.healthyActiveProjectTasksCount} Active SLA`
                            : `0 Tasks`
                          : `${item.breakdown.dealsWon} Won`}
                      </span>
                    )}
                    <span
                      className={`text-xs font-mono font-bold min-w-[44px] text-right shrink-0 ${
                        item.score > 0 ? "text-[#C7F33C]" : "text-slate-400"
                      }`}
                    >
                      {fmtXp(item.score)} XP
                    </span>
                  </div>
                ) : (
                  <span className="text-xs font-bold text-slate-100 font-mono">
                    {item.formattedValue}
                  </span>
                )}

                {onAnalyseUser && canUserInspectAnalyseTarget(item, canAnalyseAll) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAnalyseUser(item);
                    }}
                    className="w-6 h-6 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] text-[#C7F33C] hover:bg-[#C7F33C] hover:text-black hover:border-[#C7F33C] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                    title={`Analyse ${item.name}'s score in Thai`}
                    aria-label={`Analyse ${item.name}`}
                  >
                    <Sparkles className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCategoryRules = (categoryId: string) => {
    if (categoryId === "card_health") {
      return (
        <div className="rounded-xl bg-[#1C1C1D] border border-[#3A3B3C] p-3 text-xs transition-all">
          <button
            type="button"
            onClick={() => setIsRulesExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between text-[11px] cursor-pointer select-none text-left group"
            title={isRulesExpanded ? "Click to collapse rules" : "Click to expand rules"}
            aria-expanded={isRulesExpanded}
          >
            <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 group-hover:text-slate-100 transition-colors">
              <ShieldCheck className="w-3.5 h-3.5 text-[#C7F33C]" />
              <span>Scoring Rules</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[#C7F33C] font-semibold">Max 30 XP</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-transform duration-200 ${
                  isRulesExpanded ? "rotate-180" : ""
                }`}
              />
            </div>
          </button>

          {isRulesExpanded && (
            <div className="mt-2.5 space-y-2 pt-2 border-t border-[#3A3B3C]/50">
              <div className="p-2 rounded-lg bg-[#252728] border border-[#3A3B3C]/60 text-[11px] font-mono text-slate-300 space-y-0.5">
                <div>Continuous Curve: 0% → 30 XP • 5% → 22 XP • ≥ 15% → 0 XP</div>
                <div className="text-[10px] font-sans text-slate-400">
                  1 active card = 9h/day (08:00–17:00). AI auto-grades +0h, +9h, or +27h.
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#252728] border border-[#3A3B3C]/60">
                  <span className="text-slate-300">0.0% Red</span>
                  <span className="text-[#C7F33C] font-bold">30.0 XP</span>
                </div>
                <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#252728] border border-[#3A3B3C]/60">
                  <span className="text-slate-300">2.5% Red</span>
                  <span className="text-[#C7F33C] font-bold">26.0 XP</span>
                </div>
                <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#252728] border border-[#3A3B3C]/60">
                  <span className="text-slate-300">5.0% Target</span>
                  <span className="text-[#C7F33C] font-bold">22.0 XP</span>
                </div>
                <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#252728] border border-[#3A3B3C]/60">
                  <span className="text-slate-300">10.0% Red</span>
                  <span className="text-amber-300 font-semibold">11.0 XP</span>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (categoryId === "clean_ltc") {
      return (
        <div className="rounded-xl bg-[#1C1C1D] border border-[#3A3B3C] p-3 text-xs transition-all">
          <button
            type="button"
            onClick={() => setIsRulesExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between text-[11px] cursor-pointer select-none text-left group"
            aria-expanded={isRulesExpanded}
          >
            <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 group-hover:text-slate-100 transition-colors">
              <Sparkles className="w-3.5 h-3.5 text-[#C7F33C]" />
              <span>Scoring Rules</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[#C7F33C] font-semibold">Max 20 XP</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-transform duration-200 ${
                  isRulesExpanded ? "rotate-180" : ""
                }`}
              />
            </div>
          </button>

          {isRulesExpanded && (
            <div className="mt-2.5 space-y-1.5 text-[11px] pt-2 border-t border-[#3A3B3C]/50">
              <div className="p-2 rounded-lg bg-[#252728] border border-[#3A3B3C]/60 flex items-center justify-between">
                <span className="text-slate-200 font-semibold">Clean Days &amp; 15+ Card Shield</span>
                <span className="font-mono font-bold text-[#C7F33C]">+0.5 / +0.25 (Max 10)</span>
              </div>
              <div className="p-2 rounded-lg bg-[#252728] border border-[#3A3B3C]/60 flex items-center justify-between">
                <span className="text-slate-200 font-semibold">2-Step LTC Care (8) + Team Zero-LTC (2)</span>
                <span className="font-mono font-bold text-sky-400">Max 10 XP</span>
              </div>
              <div className="text-[10px] text-slate-400 px-0.5">
                +2 XP per LTC-* card genuinely cared for (max 8) + 0.1 XP/day when 0 LTC at 17:00.
              </div>
            </div>
          )}
        </div>
      );
    }

    if (categoryId === "velocity") {
      return (
        <div className="rounded-xl bg-[#1C1C1D] border border-[#3A3B3C] p-3 text-xs transition-all">
          <button
            type="button"
            onClick={() => setIsRulesExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between text-[11px] cursor-pointer select-none text-left group"
            aria-expanded={isRulesExpanded}
          >
            <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 group-hover:text-slate-100 transition-colors">
              <Zap className="w-3.5 h-3.5 text-[#C7F33C]" />
              <span>Scoring Rules</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[#C7F33C] font-semibold">Max 25 XP</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-transform duration-200 ${
                  isRulesExpanded ? "rotate-180" : ""
                }`}
              />
            </div>
          </button>

          {isRulesExpanded && (
            <div className="mt-2.5 space-y-1.5 text-[11px] pt-2 border-t border-[#3A3B3C]/50">
              <div className="p-2 rounded-lg bg-[#252728] border border-[#3A3B3C]/60 space-y-0.5">
                <div className="text-slate-200 font-semibold">Daily Progress &amp; Coverage (Max 12 XP)</div>
                <div className="text-slate-400 text-[10px]">
                  Daily Rhythm ≥75% of workdays (+7 XP) + Portfolio Coverage ≥75% of cards (+5 XP).
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[#252728] border border-[#3A3B3C]/60 space-y-0.5">
                <div className="text-slate-200 font-semibold">Consistent Teamwork (6) + Clean Load &amp; Exec (7)</div>
                <div className="text-slate-400 text-[10px]">
                  Assist Days ≥30% of workdays (6) + Avg Daily Clean Cards (3) + On-Time Execution Rate (4).
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (categoryId === "outcome") {
      return (
        <div className="rounded-xl bg-[#1C1C1D] border border-[#3A3B3C] p-3 text-xs transition-all">
          <button
            type="button"
            onClick={() => setIsRulesExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between text-[11px] cursor-pointer select-none text-left group"
            aria-expanded={isRulesExpanded}
          >
            <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 group-hover:text-slate-100 transition-colors">
              <Trophy className="w-3.5 h-3.5 text-[#C7F33C]" />
              <span>Scoring Rules</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[#C7F33C] font-semibold">Max 25 XP</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-transform duration-200 ${
                  isRulesExpanded ? "rotate-180" : ""
                }`}
              />
            </div>
          </button>

          {isRulesExpanded && (
            <div className="mt-2.5 space-y-1.5 text-[11px] pt-2 border-t border-[#3A3B3C]/50">
              <div className="p-2 rounded-lg bg-[#252728] border border-[#3A3B3C]/60 space-y-0.5">
                <div className="text-slate-200 font-semibold">Sales Deal Outcome (25-pt scale)</div>
                <div className="text-slate-400 text-[10px]">
                  Verified WON Deals (+5 pts each) + Revenue Impact (฿100k = +1 pt, max 10 pts).
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[#252728] border border-[#3A3B3C]/60 space-y-0.5">
                <div className="text-slate-200 font-semibold">Internal Task SLA &amp; Active Assists</div>
                <div className="text-slate-400 text-[10px]">
                  On-Time SLA (15 pts) + Tasks/Milestones (10 pts) • Active +27h Assist Win (+2 XP, passive = 0).
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  if (layout === "tabs") {
    if (!currentCategory) return null;

    return (
      <div className="flex flex-col gap-3">
        {/* 4 Tabs: Health / Discipline / Velocity / Outcome */}
        <div className="flex bg-[#1C1C1D] p-1 rounded-xl border border-[#3A3B3C] gap-1">
          {TABS.map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
                  isSelected
                    ? "bg-[#3A3B3C] text-slate-100 font-bold border border-[#4E4F50]"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Section 1 of Tab: Standings */}
        {renderCategoryItems(currentCategory)}

        {/* Section 2 of Tab: Scoring Rules */}
        {renderCategoryRules(currentCategory.id)}
      </div>
    );
  }

  return (
    <div
      className={
        layout === "vertical"
          ? "flex flex-col gap-4"
          : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4"
      }
    >
      {categories.map((category) => {
        const IconComponent = ICON_MAP[category.iconName] || Trophy;

        return (
          <div key={category.id} className="rounded-[1.5rem] p-4 flex flex-col gap-3">
            <div className="rounded-xl bg-[#252728] border border-[#4E4F50] px-4 py-2.5 flex items-center justify-between text-slate-100 font-bold text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <IconComponent className="w-4 h-4 text-[#C7F33C] shrink-0" />
                <span className="truncate">{category.label}</span>
              </div>
              <span className="text-[11px] font-normal text-slate-400 font-mono">
                {category.unit}
              </span>
            </div>

            {renderCategoryItems(category)}
          </div>
        );
      })}
    </div>
  );
}
