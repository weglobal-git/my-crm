"use client";

import { useEffect, useRef, useState } from "react";
import { Trophy, X, ChevronDown, ShieldCheck, AlertCircle, SlidersHorizontal } from "lucide-react";
import type {
  DepartmentLeaderboardData,
  LeaderboardItem,
} from "@/lib/dashboard/leaderboard-types";
import { DashboardCategoryColumns } from "@/components/dashboard/DashboardCategoryColumns";
import { ScoreBreakdownModal } from "@/components/dashboard/ScoreBreakdownModal";
import { DailyCardHealthDrawer } from "@/components/dashboard/DailyCardHealthDrawer";
import { DailyLtcDrawer } from "@/components/dashboard/DailyLtcDrawer";
import { Crown2DIcon } from "@/components/dashboard/Crown2DIcon";
import { LeaderboardPeriodModal } from "@/components/dashboard/LeaderboardPeriodModal";

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

  // Sub-modal states
  const [breakdownItem, setBreakdownItem] = useState<LeaderboardItem | null>(null);
  const [healthDrawerItem, setHealthDrawerItem] = useState<LeaderboardItem | null>(null);
  const [ltcDrawerItem, setLtcDrawerItem] = useState<LeaderboardItem | null>(null);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      // Don't close if a sub-modal or sub-drawer is open
      if (breakdownItem || healthDrawerItem || ltcDrawerItem || isPeriodModalOpen) return;
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !breakdownItem && !healthDrawerItem && !ltcDrawerItem && !isPeriodModalOpen) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, breakdownItem, healthDrawerItem, ltcDrawerItem, isPeriodModalOpen]);

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

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-xs z-[100] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Floating Right Side Drawer */}
      <div
        className={`fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[500px] md:max-w-[calc(100vw-32px)] z-[101] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right ${
          isOpen
            ? "opacity-100 translate-y-0 md:translate-x-0 scale-100"
            : "opacity-0 translate-y-4 md:translate-x-8 scale-[0.97] pointer-events-none"
        }`}
      >
        <div
          ref={drawerRef}
          className="w-full bg-[#252728] border-0 md:border border-[#3A3B3C] flex flex-col h-full rounded-none md:rounded-2xl overflow-hidden shadow-2xl"
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
                        <div className="absolute top-full left-0 mt-1.5 w-48 rounded-xl bg-[#252728] border border-[#4E4F50] shadow-xl py-1 z-50">
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
          <div className={`flex-1 overflow-y-auto hide-scrollbar p-4 space-y-6 transition-opacity duration-200 ${isLoading && data ? 'opacity-60' : 'opacity-100'}`}>
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
                  {/* Period & Filter Button placed at top-right of podium section */}
                  <div className="w-full flex justify-end px-1 pt-1 pb-1">
                    <button
                      type="button"
                      onClick={() => setIsPeriodModalOpen(true)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all cursor-pointer ${
                        isCustomPeriod
                          ? "bg-[#C7F33C]/15 border-[#C7F33C] text-[#C7F33C] shadow-sm"
                          : "bg-[#3A3B3C] border-[#4E4F50] text-slate-300 hover:text-white hover:border-slate-400"
                      }`}
                      title="Filter Month & Year: Click to view past performance"
                    >
                      <SlidersHorizontal className="w-3 h-3 text-[#C7F33C]" />
                      <span>{MONTH_NAMES[activeMonth - 1]} {activeYear}</span>
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </button>
                  </div>

                  {/* 3-Circle Overlapping Podium matching Reference Image */}
                  <div className="flex items-end justify-center w-full pt-4 pb-2">
                    {/* Rank #2 (Left - tucked behind Rank 1) */}
                    <div
                      onClick={() => rank2 && setBreakdownItem(rank2)}
                      className={`flex flex-col items-center z-10 w-28 sm:w-32 shrink-0 ${
                        rank2 ? "cursor-pointer group" : "opacity-40"
                      }`}
                      title={rank2 ? `${rank2.name} - View score breakdown` : undefined}
                    >
                      {rank2 ? (
                        <>
                          <div className="relative mb-2 transition-transform group-hover:scale-105">
                            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-[#4E4F50] bg-[#252728] overflow-hidden flex items-center justify-center shadow-lg">
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
                      onClick={() => rank1 && setBreakdownItem(rank1)}
                      className={`flex flex-col items-center z-20 w-36 sm:w-40 shrink-0 -mx-7 sm:-mx-9 -translate-y-5 sm:-translate-y-6 ${
                        rank1 ? "cursor-pointer group" : "opacity-40"
                      }`}
                      title={rank1 ? `${rank1.name} - View score breakdown` : undefined}
                    >
                      {rank1 ? (
                        <>
                          <div className=" select-none">
                            <Crown2DIcon className="w-9 h-9 sm:w-10 sm:h-10 drop-shadow-[0_2px_10px_rgba(245,158,11,0.5)]" />
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
                      onClick={() => rank3 && setBreakdownItem(rank3)}
                      className={`flex flex-col items-center z-10 w-28 sm:w-32 shrink-0 ${
                        rank3 ? "cursor-pointer group" : "opacity-40"
                      }`}
                      title={rank3 ? `${rank3.name} - View score breakdown` : undefined}
                    >
                      {rank3 ? (
                        <>
                          <div className="relative mb-2 transition-transform group-hover:scale-105">
                            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-[#4E4F50] bg-[#252728] overflow-hidden flex items-center justify-center shadow-lg">
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

                {/* SECTION 2: 4 CATEGORY TABS (Health / Clean / LTC / Quote) */}
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
                      onSelectUser={(item) => setBreakdownItem(item)}
                      onSelectHealthUser={(item) => setHealthDrawerItem(item)}
                      onSelectLtcUser={(item) => {
                        const ltcCat = data?.categories?.find((c) => c.id === "ltc");
                        const fallbackSummary =
                          ltcCat?.items?.find((i) => i.dailyLtcSummary)?.dailyLtcSummary;
                        const itemWithSummary = item.dailyLtcSummary
                          ? item
                          : fallbackSummary
                          ? { ...item, dailyLtcSummary: fallbackSummary }
                          : item;
                        setLtcDrawerItem(itemWithSummary);
                      }}
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

      {/* Sub-modals & Drawer */}
      <ScoreBreakdownModal
        item={breakdownItem}
        onClose={() => setBreakdownItem(null)}
      />

      <DailyCardHealthDrawer
        item={healthDrawerItem}
        period={{ month: activeMonth, year: activeYear }}
        onClose={() => setHealthDrawerItem(null)}
      />

      <DailyLtcDrawer
        item={ltcDrawerItem}
        period={{ month: activeMonth, year: activeYear }}
        onClose={() => setLtcDrawerItem(null)}
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
