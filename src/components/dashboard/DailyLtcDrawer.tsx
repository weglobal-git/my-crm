"use client";

import { useEffect, useRef, useMemo } from "react";
import {
  X,
  Clock,
  Calendar,
  Coffee,
  Palmtree,
  Info,
  CheckCircle2,
  AlertCircle,
  Users,
} from "lucide-react";
import type { LeaderboardItem } from "@/lib/dashboard/leaderboard-types";
import { calculateDailyLtcForMonth } from "@/lib/ltc-utils";

interface DailyLtcDrawerProps {
  item: LeaderboardItem | null;
  period: { month: number; year: number };
  onClose: () => void;
}

const MONTH_NAMES_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAY_NAMES_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function LtcDonutGauge({
  cleanDays,
  totalDays,
  size = 112,
  strokeWidth = 10,
}: {
  cleanDays: number;
  totalDays: number;
  size?: number;
  strokeWidth?: number;
}) {
  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const rate = totalDays > 0 ? (cleanDays / totalDays) * 100 : 100;
  const strokeDashoffset = circumference - (rate / 100) * circumference;

  const color = rate >= 80 ? "#C7F33C" : rate >= 50 ? "#F59E0B" : "#F43F5E";
  const glowColor =
    rate >= 80
      ? "rgba(199, 243, 60, 0.3)"
      : rate >= 50
      ? "rgba(245, 158, 11, 0.3)"
      : "rgba(244, 63, 94, 0.3)";

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
        <defs>
          <filter id={`ltc-donut-glow-${size}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={glowColor} />
          </filter>
        </defs>

        {/* Background Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke="#26282B"
          strokeWidth={strokeWidth}
        />

        {/* Progress Arc */}
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
          filter={`url(#ltc-donut-glow-${size})`}
          className="transition-all duration-700 ease-out"
        />
      </svg>

      {/* Center Percentage */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span
          className="text-lg font-black font-mono leading-none tracking-tight"
          style={{ color }}
        >
          {rate.toFixed(0)}%
        </span>
        <span className="text-[10px] text-slate-400 font-sans mt-0.5">Clean</span>
      </div>
    </div>
  );
}

export function DailyLtcDrawer({ item, period, onClose }: DailyLtcDrawerProps) {
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

  const summary = useMemo(() => {
    if (item?.dailyLtcSummary) return item.dailyLtcSummary;
    return calculateDailyLtcForMonth({
      companies: [],
      month: period.month,
      year: period.year,
      companyHolidays: new Set<string>(),
    });
  }, [item?.dailyLtcSummary, period.month, period.year]);

  if (!item) return null;

  const monthName = MONTH_NAMES_EN[period.month - 1] || "";
  const cleanLtcDaysCount = summary?.cleanLtcDaysCount ?? item.score;
  const totalWorkingDays = summary?.totalWorkingDays ?? 0;
  const teamLtcXp = summary?.teamLtcXp ?? item.score;
  const currentLtcCount = summary?.currentLtcCount ?? 0;
  const dailyRecords = summary?.dailyRecords || [];

  // Sort daily records in descending order (latest day first)
  const sortedDailyRecords = [...dailyRecords].sort((a, b) => b.dayIndex - a.dayIndex);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[100] transition-opacity duration-300 opacity-100"
        onClick={onClose}
      />

      {/* Floating Right Side Drawer (matches DailyCardHealthDrawer / Pipeline style) */}
      <div className="fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[500px] z-[101] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right opacity-100 translate-y-0 md:translate-x-0 scale-100">
        <div
          ref={drawerRef}
          className="w-full bg-[#252728] border-0 md:border border-[#3A3B3C] flex flex-col h-full rounded-none md:rounded-2xl overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1C1C1D] shrink-0 bg-[#252728]">
            <div className="flex items-center gap-3 min-w-0">
              {/* User Avatar */}
              <div className="w-10 h-10 rounded-full border-2 border-[#C7F33C] bg-[#252728] overflow-hidden flex items-center justify-center shrink-0">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-black text-[#C7F33C]">
                    {item.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Title & Period */}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-base font-bold text-slate-100 truncate">
                    {item.name}
                  </h2>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#C7F33C]/10 text-[#C7F33C] border border-[#C7F33C]/20">
                    <Users className="w-2.5 h-2.5" />
                    Team Metric
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                  <Calendar className="w-3.5 h-3.5 text-[#C7F33C]" />
                  <span>
                    Daily LTC History · {monthName} {period.year}
                  </span>
                </div>
              </div>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#3A3B3C] transition-colors cursor-pointer"
              title="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Body: Scrollable */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-4">
            {/* Top Metric Card (Image 2 style) */}
            <div className="rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-[#202226] to-[#18191B] border border-[#3A3B3C] shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#C7F33C]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Monthly Team LTC Health
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider uppercase bg-[#C7F33C]/10 text-[#C7F33C] border border-[#C7F33C]/30">
                  Target: 0 LTC
                </span>
              </div>

              {/* Gauges & Summary */}
              <div className="flex items-center gap-4 sm:gap-5">
                <LtcDonutGauge
                  cleanDays={cleanLtcDaysCount}
                  totalDays={totalWorkingDays}
                  size={104}
                  strokeWidth={9}
                />

                {/* Metric Numbers */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-[#C7F33C]">
                      {cleanLtcDaysCount}
                    </span>
                    <span className="text-base sm:text-lg font-mono text-slate-500 font-normal">
                      / {totalWorkingDays} Days
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                    Days with 0 pending LTC accounts at 17:00 cutoff
                  </div>

                  {/* Status & Score Chips */}
                  <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1 ${
                        cleanLtcDaysCount >= totalWorkingDays && totalWorkingDays > 0
                          ? "bg-emerald-500/15 text-[#C7F33C] border border-emerald-500/30"
                          : cleanLtcDaysCount > 0
                          ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                          : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>
                        {cleanLtcDaysCount >= totalWorkingDays && totalWorkingDays > 0
                          ? "100% Cleared"
                          : `${cleanLtcDaysCount} Days Clean`}
                      </span>
                    </span>

                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-[#252728] border border-[#3A3B3C] text-[#C7F33C]">
                      {teamLtcXp} XP (Max 20)
                    </span>

                    {currentLtcCount > 0 && (
                      <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-400">
                        {currentLtcCount} pending today
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Daily History: Compact List (Image 2 style) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span className="font-bold uppercase tracking-wider text-slate-300">
                  Daily Sampling (17:00 Cutoff)
                </span>
                <span className="text-[11px]">
                  {sortedDailyRecords.length} days recorded
                </span>
              </div>

              <div className="space-y-1.5">
                {sortedDailyRecords.map((day) => {
                  const dayName = DAY_NAMES_EN[day.dayOfWeek] || "";

                  return (
                    <div
                      key={day.dateKey}
                      className={`rounded-xl border transition-all ${
                        day.isOffDay
                          ? "bg-[#1C1C1D]/60 border-[#3A3B3C]/50 opacity-60"
                          : day.isClean
                          ? "bg-emerald-950/15 border-[#C7F33C]/40"
                          : "bg-rose-950/20 border-rose-500/30"
                      }`}
                    >
                      {/* Compact Day Row */}
                      <div className="flex items-center justify-between p-2.5">
                        {/* Left: Date Badge + Ratio / Off status */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Compact Date Box */}
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

                          {/* Detail text */}
                          {day.isOffDay ? (
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                              {day.offDayReason === "Sunday" ? (
                                <Coffee className="w-3.5 h-3.5 text-amber-400" />
                              ) : (
                                <Palmtree className="w-3.5 h-3.5 text-emerald-400" />
                              )}
                              <span className="font-semibold text-slate-300">
                                {day.offDayReason === "Sunday" ? "Sunday" : "Dayoff"}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-xs">
                              <span
                                className={`font-mono font-bold ${
                                  day.isClean ? "text-[#C7F33C]" : "text-rose-400"
                                }`}
                              >
                                {day.isClean
                                  ? "0 LTC Accounts"
                                  : `${day.ltcCount} Pending LTC`}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Right: Status Pill */}
                        <div className="shrink-0">
                          {day.isOffDay ? (
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-[#252728] border border-slate-700/60 text-slate-500">
                              Paused
                            </span>
                          ) : day.isClean ? (
                            <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-emerald-500/10 border border-[#C7F33C]/40 text-[#C7F33C]">
                              +1 XP (Cleared)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-rose-500/10 border border-rose-500/30 text-rose-400">
                              0 XP (Uncleared)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Info Box */}
            <div className="rounded-xl bg-[#202226] border border-[#3A3B3C]/60 p-3.5 space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-1.5 font-bold text-slate-300">
                <Info className="w-4 h-4 text-[#C7F33C]" />
                <span>LTC Scoring Logic:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1 border-t border-[#3A3B3C]/50">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C7F33C]" />
                  <span>08:00–17:00 (workday window)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>Sundays & Dayoffs paused</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>17:00 daily cutoff evaluation</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                  <span>Team reward added to all reps</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
