"use client";

import { useEffect, useRef, useState } from "react";
import {
  Trophy,
  X,
  ChevronDown,
  ShieldCheck,
  AlertCircle,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type {
  DepartmentLeaderboardData,
  LeaderboardItem,
} from "@/lib/dashboard/leaderboard-types";
import { DashboardCategoryColumns } from "@/components/dashboard/DashboardCategoryColumns";
import {
  ScoreBreakdownModal,
  type DrilldownCategoryId,
} from "@/components/dashboard/ScoreBreakdownModal";
import { DailyCardHealthDrawer } from "@/components/dashboard/DailyCardHealthDrawer";
import {
  DailyLtcDrawer,
  type DisciplineDrawerTab,
} from "@/components/dashboard/DailyLtcDrawer";
import { CategoryDetailDrawer } from "@/components/dashboard/CategoryDetailDrawer";
import { Crown2DIcon } from "@/components/dashboard/Crown2DIcon";
import { LeaderboardPeriodModal } from "@/components/dashboard/LeaderboardPeriodModal";
import {
  LeaderboardAnalyseModal,
  type AnalyseViewMode,
} from "@/components/dashboard/LeaderboardAnalyseModal";
import { canUserInspectAnalyseTarget } from "@/lib/dashboard/leaderboard-score-analysis";

type SubDrawerEntry =
  | { kind: "breakdown"; item: LeaderboardItem }
  | { kind: "health"; item: LeaderboardItem }
  | { kind: "discipline"; item: LeaderboardItem; initialTab: DisciplineDrawerTab }
  | { kind: "velocity"; item: LeaderboardItem }
  | { kind: "outcome"; item: LeaderboardItem }
  | { kind: "analyse"; mode: AnalyseViewMode; userId: string | null };

export interface LeaderboardDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  data?: DepartmentLeaderboardData | null;
  isLoading?: boolean;
  error?: Error | null;
  selectedDeptId: string | null;
  onSelectDepartment: (deptId: string) => void;
  currentMonth: number;
  currentYear: number;
  selectedMonth?: number;
  selectedYear?: number;
  onChangePeriod?: (month: number, year: number) => void;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function LeaderboardDrawer({
  isOpen,
  onClose,
  data,
  isLoading,
  error,
  selectedDeptId,
  onSelectDepartment,
  currentMonth,
  currentYear,
  selectedMonth,
  selectedYear,
  onChangePeriod,
}: LeaderboardDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [isDeptDropdownOpen, setIsDeptDropdownOpen] = useState(false);
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
  const deptDropdownRef = useRef<HTMLDivElement>(null);

  const activeMonth = selectedMonth ?? currentMonth;
  const activeYear = selectedYear ?? currentYear;
  const isCustomPeriod = activeMonth !== currentMonth || activeYear !== currentYear;

  // Active Category Tab for Section 2
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>("card_health");
  const activeCategory =
    data?.categories?.find((c) => c.id === activeCategoryTab) ||
    data?.categories?.[0] ||
    null;

  // Navigation stack for newly opened sub-windows ("Back" pops to previous view)
  const [subDrawerStack, setSubDrawerStack] = useState<SubDrawerEntry[]>([]);
  const activeSubDrawer =
    subDrawerStack.length > 0 ? subDrawerStack[subDrawerStack.length - 1] : null;
  const hasActiveSubDrawer = activeSubDrawer !== null;

  const pushSubDrawer = (entry: SubDrawerEntry) => {
    setSubDrawerStack((prev) => [...prev, entry]);
  };

  const popSubDrawer = () => {
    setSubDrawerStack((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
  };

  useEffect(() => {
    if (!isOpen) {
      setSubDrawerStack([]);
    }
  }, [isOpen]);

  // Close on Escape or click outside (only when no sub-drawer is open)
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (hasActiveSubDrawer || isPeriodModalOpen) {
        return;
      }
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !hasActiveSubDrawer && !isPeriodModalOpen) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, hasActiveSubDrawer, isPeriodModalOpen]);

  // Close department dropdown on outside click
  useEffect(() => {
    if (!isDeptDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (deptDropdownRef.current && !deptDropdownRef.current.contains(e.target as Node)) {
        setIsDeptDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isDeptDropdownOpen]);

  const podium = data?.overallPodium;
  const rank1 = podium?.rank1 || data?.overallXpItems?.[0] || null;
  const rank2 = podium?.rank2 || data?.overallXpItems?.[1] || null;
  const rank3 = podium?.rank3 || data?.overallXpItems?.[2] || null;

  const availableDepts = data?.availableDepartments || [];
  const currentDeptName = data?.departmentName || "Department";
  const overallItems = data?.overallXpItems || [];
  const canAnalyseAll = Boolean(data?.canAnalyseDepartment);
  const selfItem = overallItems.find((i) => i.isCurrentUser) || null;
  const canShowTopAnalyseButton = canAnalyseAll
    ? overallItems.length > 0
    : Boolean(selfItem);

  const resolveFullItem = (target: LeaderboardItem): LeaderboardItem => {
    const overallMatch = overallItems.find((i) => i.userId === target.userId);
    const ltcCat = data?.categories?.find(
      (c) => c.id === "clean_ltc" || c.id === "ltc"
    );
    const fallbackLtcSummary =
      ltcCat?.items?.find((i) => i.dailyLtcSummary)?.dailyLtcSummary;

    return {
      ...overallMatch,
      ...target,
      breakdown: target.breakdown ?? overallMatch?.breakdown,
      dailyHealthSummary:
        target.dailyHealthSummary ?? overallMatch?.dailyHealthSummary,
      dailyLtcSummary:
        target.dailyLtcSummary ??
        overallMatch?.dailyLtcSummary ??
        fallbackLtcSummary,
      categoryDetails: target.categoryDetails ?? overallMatch?.categoryDetails,
    };
  };

  const handleOpenCategoryDetail = (
    categoryId: DrilldownCategoryId,
    target: LeaderboardItem,
    initialDisciplineTab: DisciplineDrawerTab = "discipline"
  ) => {
    const enriched = resolveFullItem(target);
    if (categoryId === "card_health") {
      pushSubDrawer({ kind: "health", item: enriched });
    } else if (categoryId === "clean_ltc") {
      pushSubDrawer({
        kind: "discipline",
        item: enriched,
        initialTab: initialDisciplineTab,
      });
    } else if (categoryId === "velocity") {
      pushSubDrawer({ kind: "velocity", item: enriched });
    } else {
      pushSubDrawer({ kind: "outcome", item: enriched });
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-xs z-[100] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Floating Right Side Drawer (Flat UI - zero shadows) */}
      <div
        className={`fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[500px] md:max-w-[calc(100vw-32px)] z-[101] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right ${
          isOpen
            ? "opacity-100 translate-y-0 md:translate-x-0 scale-100"
            : "opacity-0 translate-y-4 md:translate-x-8 scale-[0.97] pointer-events-none"
        }`}
      >
        <div
          ref={drawerRef}
          className="w-full bg-[#252728] border-0 md:border border-[#3A3B3C] flex flex-col h-full rounded-none md:rounded-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1C1C1D] shrink-0 bg-[#252728] relative">
            {isLoading && data && (
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#1C1C1D] overflow-hidden z-20">
                <div className="w-full h-full bg-[#C7F33C] animate-pulse" />
              </div>
            )}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 flex items-center justify-center shrink-0">
                <Trophy className="w-7 h-7 text-[#C7F33C]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-100 truncate">
                    Leaderboard
                  </h2>
                  {/* Department Switcher Dropdown */}
                  {availableDepts.length > 1 ? (
                    <div className="relative shrink-0" ref={deptDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setIsDeptDropdownOpen(!isDeptDropdownOpen)}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#3A3B3C] text-slate-200 border border-[#4E4F50] hover:border-[#C7F33C] transition-colors cursor-pointer"
                      >
                        <span className="max-w-[120px] truncate">{currentDeptName}</span>
                        <ChevronDown className="w-3 h-3 text-slate-400" />
                      </button>

                      {isDeptDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1.5 w-48 rounded-xl bg-[#252728] border border-[#4E4F50] py-1 z-50">
                          {availableDepts.map((d) => (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => {
                                onSelectDepartment(d.id);
                                setIsDeptDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 text-xs font-medium transition-colors flex items-center justify-between ${
                                d.id === (selectedDeptId || data?.departmentId)
                                  ? "bg-[#C7F33C]/10 text-[#C7F33C] font-bold"
                                  : "text-slate-300 hover:bg-[#3A3B3C]"
                              }`}
                            >
                              <span className="truncate">{d.name}</span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {d.userCount} reps
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#3A3B3C] text-slate-300 border border-[#4E4F50] shrink-0">
                      {currentDeptName}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
                  {MONTH_NAMES[activeMonth - 1]} {activeYear}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-[#3A3B3C] rounded-full transition-colors text-slate-400 hover:text-slate-200 cursor-pointer"
              aria-label="Close leaderboard"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div
            className={`flex-1 overflow-y-auto hide-scrollbar p-4 space-y-6 transition-opacity duration-200 ${
              isLoading && data ? "opacity-60" : "opacity-100"
            }`}
          >
            {error ? (
              <div className="p-6 text-center space-y-2 rounded-2xl bg-[#1C1C1D] border border-[#3A3B3C]">
                <AlertCircle className="w-6 h-6 text-rose-400 mx-auto" />
                <p className="text-xs text-slate-300 font-medium">
                  Unable to load leaderboard data
                </p>
                <p className="text-[11px] text-slate-500">{error.message}</p>
              </div>
            ) : isLoading && !data ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400">
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-4 h-4 border-2 border-[#C7F33C] border-t-transparent rounded-full animate-spin" />
                  <span>Loading standings...</span>
                </div>
              </div>
            ) : (
              <>
                {/* SECTION 1: TOP 3 MVP (Overlapping Circles - Full Width) */}
                <section className="rounded-2xl w-full flex flex-col items-center">
                  {/* Analyse & Period Filter Buttons placed at top-right of podium section */}
                  <div className="w-full flex items-center justify-end gap-2 px-1 pt-1 pb-1">
                    {canShowTopAnalyseButton && (
                      <button
                        type="button"
                        onClick={() =>
                          pushSubDrawer(
                            canAnalyseAll
                              ? {
                                  kind: "analyse",
                                  mode: "team",
                                  userId:
                                    selfItem?.userId ??
                                    overallItems[0]?.userId ??
                                    null,
                                }
                              : {
                                  kind: "analyse",
                                  mode: "individual",
                                  userId: selfItem?.userId ?? null,
                                }
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#C7F33C]/15 border border-[#C7F33C]/45 text-[#C7F33C] hover:bg-[#C7F33C] hover:text-black transition-all cursor-pointer"
                        title={
                          canAnalyseAll
                            ? "Analyse department team summary & member scores in Thai"
                            : "Explain your score and formula in Thai"
                        }
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Analyse</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsPeriodModalOpen(true)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all cursor-pointer ${
                        isCustomPeriod
                          ? "bg-[#C7F33C]/15 border-[#C7F33C] text-[#C7F33C]"
                          : "bg-[#3A3B3C] border-[#4E4F50] text-slate-300 hover:text-white hover:border-slate-400"
                      }`}
                      title="Filter Month & Year: Click to view past performance"
                    >
                      <SlidersHorizontal className="w-3 h-3 text-[#C7F33C]" />
                      <span>
                        {MONTH_NAMES[activeMonth - 1]} {activeYear}
                      </span>
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </button>
                  </div>

                  {/* 3-Circle Overlapping Podium */}
                  <div className="flex items-end justify-center w-full pt-4 pb-2">
                    {/* Rank #2 (Left - tucked behind Rank 1) */}
                    <div
                      onClick={() =>
                        rank2 &&
                        pushSubDrawer({
                          kind: "breakdown",
                          item: resolveFullItem(rank2),
                        })
                      }
                      className={`flex flex-col items-center z-10 w-28 sm:w-32 shrink-0 ${
                        rank2 ? "cursor-pointer group" : "opacity-40"
                      }`}
                      title={rank2 ? `${rank2.name} - View 4-category score breakdown` : undefined}
                    >
                      {rank2 ? (
                        <>
                          <div className="relative mb-2 transition-transform group-hover:scale-105">
                            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-[#4E4F50] bg-[#252728] overflow-hidden flex items-center justify-center">
                              {rank2.image ? (
                                <img
                                  src={rank2.image}
                                  alt={rank2.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-xl sm:text-2xl font-black text-slate-300">
                                  {getInitials(rank2.name)}
                                </span>
                              )}
                            </div>
                            <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#4E4F50] text-slate-200 text-xs sm:text-sm font-black flex items-center justify-center">
                              2
                            </span>
                          </div>
                          <span className="text-xs sm:text-sm font-semibold text-slate-300 text-center max-w-[100px] truncate mt-2">
                            {rank2.name}
                          </span>
                          <span className="text-sm sm:text-base font-mono font-bold text-slate-100">
                            {rank2.score.toLocaleString()} XP
                          </span>
                        </>
                      ) : (
                        <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-dashed border-[#4E4F50] flex items-center justify-center text-xs text-slate-500">
                          -
                        </div>
                      )}
                    </div>

                    {/* Rank #1 (Center - Elevated, overlapping, larger with 2D Crown) */}
                    <div
                      onClick={() =>
                        rank1 &&
                        pushSubDrawer({
                          kind: "breakdown",
                          item: resolveFullItem(rank1),
                        })
                      }
                      className={`flex flex-col items-center z-20 w-36 sm:w-40 shrink-0 -mx-7 sm:-mx-9 -translate-y-5 sm:-translate-y-6 ${
                        rank1 ? "cursor-pointer group" : "opacity-40"
                      }`}
                      title={rank1 ? `${rank1.name} - View 4-category score breakdown` : undefined}
                    >
                      {rank1 ? (
                        <>
                          <div className="select-none">
                            <Crown2DIcon className="w-9 h-9 sm:w-10 sm:h-10" />
                          </div>
                          <div className="relative mb-2 transition-transform group-hover:scale-105">
                            <div className="w-36 h-36 sm:w-40 sm:h-40 rounded-full border-4 border-[#C7F33C] bg-[#252728] overflow-hidden flex items-center justify-center">
                              {rank1.image ? (
                                <img
                                  src={rank1.image}
                                  alt={rank1.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-2xl sm:text-3xl font-black text-[#C7F33C]">
                                  {getInitials(rank1.name)}
                                </span>
                              )}
                            </div>
                            <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#C7F33C] text-black text-md font-black flex items-center justify-center">
                              1
                            </span>
                          </div>
                          <span className="text-base sm:text-lg font-bold text-[#C7F33C] font-mono font-black text-center max-w-[130px] truncate mt-2.5">
                            {rank1.name}
                            {rank1.isCurrentUser && (
                              <span className="text-[10px] text-[#C7F33C] ml-1 font-normal">
                                (You)
                              </span>
                            )}
                          </span>
                          <span className="text-base sm:text-lg font-mono font-black text-[#C7F33C]">
                            {rank1.score.toLocaleString()} XP
                          </span>
                        </>
                      ) : (
                        <div className="w-36 h-36 sm:w-40 sm:h-40 rounded-full border-4 border-dashed border-[#4E4F50] flex items-center justify-center text-xs text-slate-500">
                          -
                        </div>
                      )}
                    </div>

                    {/* Rank #3 (Right - tucked behind Rank 1) */}
                    <div
                      onClick={() =>
                        rank3 &&
                        pushSubDrawer({
                          kind: "breakdown",
                          item: resolveFullItem(rank3),
                        })
                      }
                      className={`flex flex-col items-center z-10 w-28 sm:w-32 shrink-0 ${
                        rank3 ? "cursor-pointer group" : "opacity-40"
                      }`}
                      title={rank3 ? `${rank3.name} - View 4-category score breakdown` : undefined}
                    >
                      {rank3 ? (
                        <>
                          <div className="relative mb-2 transition-transform group-hover:scale-105">
                            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-[#4E4F50] bg-[#252728] overflow-hidden flex items-center justify-center">
                              {rank3.image ? (
                                <img
                                  src={rank3.image}
                                  alt={rank3.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-xl sm:text-2xl font-black text-amber-200">
                                  {getInitials(rank3.name)}
                                </span>
                              )}
                            </div>
                            <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#4E4F50] text-slate-200 text-xs sm:text-sm font-black flex items-center justify-center">
                              3
                            </span>
                          </div>
                          <span className="text-xs sm:text-sm font-semibold text-slate-300 text-center max-w-[100px] truncate mt-2">
                            {rank3.name}
                          </span>
                          <span className="text-sm sm:text-base font-mono font-bold text-slate-100">
                            {rank3.score.toLocaleString()} XP
                          </span>
                        </>
                      ) : (
                        <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-dashed border-[#4E4F50] flex items-center justify-center text-xs text-slate-500">
                          -
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* SECTION 2: 4 CATEGORY TABS (Health / Discipline / Velocity / Outcome) */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#C7F33C]" />
                      Categories
                    </span>
                    {activeCategory && (
                      <span className="text-[11px] font-normal text-slate-400 font-mono">
                        {activeCategory.unit}
                      </span>
                    )}
                  </div>

                  {data?.categories && data.categories.length > 0 ? (
                    <DashboardCategoryColumns
                      categories={data.categories}
                      layout="tabs"
                      activeTab={activeCategoryTab}
                      onTabChange={setActiveCategoryTab}
                      canAnalyseAll={canAnalyseAll}
                      onAnalyseUser={(item) =>
                        pushSubDrawer({
                          kind: "analyse",
                          mode: "individual",
                          userId: item.userId,
                        })
                      }
                      onSelectUser={(item) =>
                        pushSubDrawer({
                          kind: "breakdown",
                          item: resolveFullItem(item),
                        })
                      }
                      onSelectHealthUser={(item) =>
                        handleOpenCategoryDetail("card_health", item)
                      }
                      onSelectDisciplineUser={(item, tab) =>
                        handleOpenCategoryDetail("clean_ltc", item, tab ?? "discipline")
                      }
                      onSelectVelocityUser={(item) =>
                        handleOpenCategoryDetail("velocity", item)
                      }
                      onSelectOutcomeUser={(item) =>
                        handleOpenCategoryDetail("outcome", item)
                      }
                    />
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-400 rounded-2xl bg-[#1C1C1D] border border-[#3A3B3C]">
                      No category data recorded for this month
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Active Sub-Window (Only top of stack renders; "Back" returns to previous view) */}
      {activeSubDrawer?.kind === "breakdown" && (
        <ScoreBreakdownModal
          item={activeSubDrawer.item}
          onClose={popSubDrawer}
          onSelectCategory={(categoryId, target) =>
            handleOpenCategoryDetail(categoryId, target)
          }
          onOpenAnalyse={
            canUserInspectAnalyseTarget(activeSubDrawer.item, canAnalyseAll)
              ? (target) =>
                  pushSubDrawer({
                    kind: "analyse",
                    mode: "individual",
                    userId: target.userId,
                  })
              : undefined
          }
        />
      )}

      {activeSubDrawer?.kind === "health" && (
        <DailyCardHealthDrawer
          item={activeSubDrawer.item}
          period={{ month: activeMonth, year: activeYear }}
          onClose={popSubDrawer}
          onOpenAnalyse={
            canUserInspectAnalyseTarget(activeSubDrawer.item, canAnalyseAll)
              ? (target) =>
                  pushSubDrawer({
                    kind: "analyse",
                    mode: "individual",
                    userId: target.userId,
                  })
              : undefined
          }
        />
      )}

      {activeSubDrawer?.kind === "discipline" && (
        <DailyLtcDrawer
          item={activeSubDrawer.item}
          period={{ month: activeMonth, year: activeYear }}
          initialTab={activeSubDrawer.initialTab}
          onClose={popSubDrawer}
          onOpenAnalyse={
            canUserInspectAnalyseTarget(activeSubDrawer.item, canAnalyseAll)
              ? (target) =>
                  pushSubDrawer({
                    kind: "analyse",
                    mode: "individual",
                    userId: target.userId,
                  })
              : undefined
          }
        />
      )}

      {(activeSubDrawer?.kind === "velocity" ||
        activeSubDrawer?.kind === "outcome") && (
        <CategoryDetailDrawer
          item={activeSubDrawer.item}
          mode={activeSubDrawer.kind}
          period={{ month: activeMonth, year: activeYear }}
          onClose={popSubDrawer}
          onOpenAnalyse={
            canUserInspectAnalyseTarget(activeSubDrawer.item, canAnalyseAll)
              ? (target) =>
                  pushSubDrawer({
                    kind: "analyse",
                    mode: "individual",
                    userId: target.userId,
                  })
              : undefined
          }
        />
      )}

      <LeaderboardAnalyseModal
        isOpen={activeSubDrawer?.kind === "analyse"}
        onClose={popSubDrawer}
        items={overallItems}
        initialUserId={
          activeSubDrawer?.kind === "analyse" ? activeSubDrawer.userId : null
        }
        initialMode={
          activeSubDrawer?.kind === "analyse"
            ? activeSubDrawer.mode
            : "individual"
        }
        canAnalyseAll={canAnalyseAll}
        hasSalesAccess={data?.hasSalesAccess}
        month={activeMonth}
        year={activeYear}
        currentMonth={currentMonth}
        currentYear={currentYear}
        departmentName={data?.departmentName}
      />

      {/* Period & Filters Modal */}
      <LeaderboardPeriodModal
        isOpen={isPeriodModalOpen}
        onClose={() => setIsPeriodModalOpen(false)}
        month={activeMonth}
        year={activeYear}
        onApply={(m, y) => onChangePeriod?.(m, y)}
      />
    </>
  );
}
