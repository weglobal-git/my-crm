"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ShieldCheck,
  Clock,
  Calendar,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Coffee,
  Palmtree,
  Info,
  Layers,
  Sparkles,
} from "lucide-react";
import type { LeaderboardItem } from "@/lib/dashboard/leaderboard-types";

interface DailyCardHealthDrawerProps {
  item: LeaderboardItem | null;
  period: { month: number; year: number };
  onClose: () => void;
  onOpenAnalyse?: (item: LeaderboardItem) => void;
}

const MONTH_NAMES_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAY_NAMES_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function DonutGauge({
  rate,
  size = 112,
  strokeWidth = 10,
}: {
  rate: number;
  size?: number;
  strokeWidth?: number;
}) {
  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const normalizedRate = Math.min(100, Math.max(0, rate));
  const strokeDashoffset = circumference - (normalizedRate / 100) * circumference;

  const color =
    rate === 0
      ? "#C7F33C"
      : rate < 5
      ? "#10B981"
      : rate < 10
      ? "#F59E0B"
      : "#F43F5E";

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
        {normalizedRate > 0 && (
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
            className="transition-all duration-700 ease-out"
          />
        )}
      </svg>

      {/* Center Label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none pointer-events-none">
      </div>
    </div>
  );
}

export function DailyCardHealthDrawer({
  item,
  period,
  onClose,
  onOpenAnalyse,
}: DailyCardHealthDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

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

  if (!item || !item.dailyHealthSummary) return null;

  const summary = item.dailyHealthSummary;
  const monthName = MONTH_NAMES_EN[period.month - 1] || "";
  const sortedDailyRecords = [...summary.dailyRecords].reverse();

  // Metrics (preserve monthly card exposure even if all open deals were closed today)
  const activeCards = summary.currentActiveCards;
  const hasCardExposure = activeCards > 0 || summary.totalCardHours > 0;
  const avgMonthlyRedRate = summary.avgMonthlyRedRate ?? 0;
  const totalHealthXp = summary.totalCardHealthXp ?? item.score ?? 0;

  const toggleExpand = (dateKey: string) => {
    setExpandedDay((prev) => (prev === dateKey ? null : dateKey));
  };

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
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-black text-slate-200">
                    {item.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm sm:text-base font-bold text-slate-100 truncate">{item.name}</h2>
                  {item.isCurrentUser && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#C7F33C] text-black shrink-0">
                      You
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                  <Calendar className="w-3 h-3 text-[#C7F33C] shrink-0" />
                  <span className="truncate">
                    Daily Card Health • {monthName} {period.year}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onOpenAnalyse && (
                <button
                  type="button"
                  onClick={() => onOpenAnalyse(item)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#C7F33C]/15 border border-[#C7F33C]/40 text-[#C7F33C] hover:bg-[#C7F33C] hover:text-black text-[11px] font-bold transition-all cursor-pointer"
                  title="Explain score calculation in Thai"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Analyse</span>
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-4">
            {/* Hero Card: Modern Donut Gauge & Hours Ratio */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#1C1C1D] border border-[#3A3B3C] relative overflow-hidden">
              {/* Subtle background glow */}
              <div
                className="absolute -top-12 -right-12 w-44 h-44 rounded-full blur-3xl pointer-events-none opacity-20"
                style={{
                  backgroundColor:
                    avgMonthlyRedRate === 0
                      ? "#C7F33C"
                      : avgMonthlyRedRate < 5
                      ? "#10B981"
                      : avgMonthlyRedRate < 10
                      ? "#F59E0B"
                      : "#F43F5E",
                }}
              />

              <div className="flex items-center justify-between text-[11px] font-bold tracking-wider text-slate-400 uppercase mb-3">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#C7F33C]" />
                  <span>Monthly Red Card Health</span>
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border border-slate-700/60 bg-[#252728] text-slate-300">
                  Target &lt; 5%
                </span>
              </div>

              <div className="flex items-center gap-4 sm:gap-6">
                {/* Modern Donut Gauge */}
                <DonutGauge rate={avgMonthlyRedRate} size={112} strokeWidth={10} />

                {/* Metric Numbers */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-3xl sm:text-4xl font-black font-mono tracking-tight ${
                        !hasCardExposure
                          ? "text-slate-400"
                          : avgMonthlyRedRate <= 5
                          ? "text-[#C7F33C]"
                          : avgMonthlyRedRate < 15
                          ? "text-amber-400"
                          : "text-rose-400"
                      }`}
                    >
                      {!hasCardExposure
                        ? "0%"
                        : avgMonthlyRedRate < 10
                        ? `${avgMonthlyRedRate.toFixed(avgMonthlyRedRate % 1 === 0 ? 0 : 2)}%`
                        : `${avgMonthlyRedRate.toFixed(1)}%`}
                    </span>
                  </div>

                  {/* Exact Hours Ratio: 36.4h / 2,353h */}
                  <div className="text-base sm:text-lg font-mono font-bold text-slate-200 tracking-tight mt-1 flex items-baseline gap-1">
                    <span
                      className={
                        summary.totalRedCardHours > 0 && avgMonthlyRedRate > 5
                          ? "text-rose-400 font-extrabold"
                          : "text-slate-100"
                      }
                    >
                      {summary.totalRedCardHours.toLocaleString()}h
                    </span>
                    <span className="text-slate-500 font-normal">/</span>
                    <span className="text-slate-400">
                      {summary.totalCardHours.toLocaleString()}h
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                    Red Card Hours vs Total (9h/card)
                  </div>

                  {/* Status & Score Chips */}
                  <div className="flex items-center gap-2 mt-2.5">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1 ${
                        !hasCardExposure
                          ? "bg-slate-800 text-slate-400"
                          : avgMonthlyRedRate <= 5
                          ? "bg-emerald-500/15 text-[#C7F33C] border border-emerald-500/30"
                          : avgMonthlyRedRate < 15
                          ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                          : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                      }`}
                    >
                      {!hasCardExposure
                        ? "No Cards"
                        : avgMonthlyRedRate <= 5
                        ? "Target Met (≤ 5%)"
                        : avgMonthlyRedRate < 15
                        ? "Warning (< 15%)"
                        : "Critical (≥ 15%)"}
                    </span>

                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-[#252728] border border-[#3A3B3C] text-[#C7F33C]">
                      {totalHealthXp} / 30 XP
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Daily History: Compact List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span className="font-bold uppercase tracking-wider text-slate-300">
                  Daily Workday Sampling (08:00–17:00)
                </span>
                <span className="text-[11px]">
                  {sortedDailyRecords.length} days
                </span>
              </div>

              <div className="space-y-1.5">
                {sortedDailyRecords.map((day) => {
                  const dayName = DAY_NAMES_EN[day.dayOfWeek] || "";
                  const isExpanded = expandedDay === day.dateKey;
                  const hasRedDeals = day.redCardDetails && day.redCardDetails.length > 0;

                  return (
                    <div
                      key={day.dateKey}
                      className={`rounded-xl border transition-colors ${
                        day.isOffDay
                          ? "bg-[#1C1C1D]/60 border-[#3A3B3C]/50 opacity-75 hover:opacity-100 hover:bg-[#252728] hover:border-[#4E4F50]"
                          : day.isNoCards
                          ? "bg-[#1C1C1D]/60 border-[#3A3B3C]/60 hover:bg-[#252728] hover:border-[#4E4F50]"
                          : day.redCardsCount > 0
                          ? "bg-rose-950/20 border-rose-500/30 hover:bg-rose-950/35 hover:border-rose-400/60"
                          : "bg-emerald-950/15 border-[#C7F33C]/40 hover:bg-emerald-950/30 hover:border-[#C7F33C]"
                      }`}
                    >
                      {/* Compact Day Row */}
                      <div
                        onClick={() => hasRedDeals && toggleExpand(day.dateKey)}
                        className={`flex items-center justify-between p-2.5 rounded-xl transition-colors ${
                          hasRedDeals ? "cursor-pointer" : ""
                        }`}
                      >
                        {/* Left: Date Badge + Ratio / Off status */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Compact Date Box */}
                          <div
                            className={`w-8 h-8 rounded-lg flex flex-col items-center justify-center font-bold text-center shrink-0 border ${
                              day.isOffDay
                                ? "bg-[#252728] border-[#3A3B3C] text-slate-400"
                                : day.redCardsCount > 0
                                ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                                : "bg-[#C7F33C]/10 border-[#C7F33C]/30 text-[#C7F33C]"
                            }`}
                          >
                            <span className="text-[8px] uppercase leading-none font-medium text-slate-400">
                              {dayName}
                            </span>
                            <span className="text-xs font-black leading-tight">
                              {day.dayIndex}
                            </span>
                          </div>

                          {/* Center: Ratio (e.g. 6/12) & Red Hours */}
                          <div className="min-w-0">
                            {day.isOffDay ? (
                              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                                {day.offDayReason === "Sunday" ? (
                                  <>
                                    <Coffee className="w-3.5 h-3.5 text-amber-400/80" />
                                    <span>Sunday</span>
                                  </>
                                ) : day.offDayReason === "Dayoff" ? (
                                  <>
                                    <Coffee className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Company Dayoff</span>
                                  </>
                                ) : (
                                  <>
                                    <Palmtree className="w-3.5 h-3.5 text-[#C7F33C]" />
                                    <span>Leave</span>
                                  </>
                                )}
                              </div>
                            ) : day.isNoCards ? (
                              <div className="text-xs text-slate-400">
                                0 cards
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                {/* Compact Red/Total Ratio (e.g. 6/12) */}
                                <span
                                  className={`text-xs font-mono font-bold ${
                                    day.redCardsCount > 0 ? "text-rose-400" : "text-[#C7F33C]"
                                  }`}
                                  title={`${day.redCardsCount} Red / ${day.activeCardsCount} Total`}
                                >
                                  {day.redCardsCount}/{day.activeCardsCount}
                                </span>

                                {/* Red hours vs Total Card Hours (9.5h each) & Red Rate % */}
                                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  <span>
                                    {day.redCardHoursToday ?? day.redHours}h/
                                    {day.totalCardHours ?? (day.activeCardsCount * 9)}h
                                  </span>
                                  <span className="text-slate-600">•</span>
                                  <span
                                    className={`font-semibold ${
                                      (day.dailyRedRate ?? (100 - day.healthRate)) > 0
                                        ? "text-rose-400"
                                        : "text-[#C7F33C]"
                                    }`}
                                  >
                                    {day.dailyRedRate ?? (100 - day.healthRate)}% Red
                                  </span>
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right: Status Pill & Accordion arrow */}
                        <div className="flex items-center gap-1.5 shrink-0 text-right">
                          {day.isOffDay ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#3A3B3C] text-slate-400">
                              Paused
                            </span>
                          ) : day.isNoCards ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#3A3B3C] text-slate-400">
                              No Cards
                            </span>
                          ) : day.redCardsCount > 0 ? (
                            <>
                              {day.isGraceShieldDay && (
                                <span
                                  title="Heavy-Load Shield: ≥ 10 active cards with only 1 Red Card earns +0.25 XP half-credit"
                                  className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/35"
                                >
                                  Shield +0.25
                                </span>
                              )}
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">
                                {day.dailyRedRate ?? (100 - day.healthRate)}% Red
                              </span>
                            </>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#C7F33C]/20 text-[#C7F33C] border border-[#C7F33C]/40">
                              0% Red
                            </span>
                          )}

                          {hasRedDeals && (
                            <button
                              type="button"
                              className="text-slate-400 hover:text-slate-200 p-0.5"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expandable Red Cards Details */}
                      {isExpanded && hasRedDeals && (
                        <div className="border-t border-rose-500/20 p-2.5 bg-rose-950/30 space-y-1.5">
                          <div className="text-[10px] font-bold text-rose-300 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-rose-400" />
                            <span>Overdue Deals ({day.redCardDetails.length}):</span>
                          </div>
                          <div className="space-y-1 pl-4">
                            {day.redCardDetails.map((detail) => (
                              <div
                                key={detail.dealId}
                                className="flex items-center justify-between text-[11px] py-1 px-2 -mx-2 rounded-lg hover:bg-rose-900/30 transition-colors border-b border-rose-500/10 last:border-b-0"
                              >
                                <div className="min-w-0 pr-2">
                                  {detail.companyName && (
                                    <div className="font-medium font-[14px] text-white truncate">
                                      {detail.companyName}
                                    </div>
                                  )}
                                  <div className="text-[10px] text-slate-400 truncate">
                                    {detail.topic}
                                  </div>
                     
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-[10px] font-bold text-rose-400">
                                    +{detail.redHoursToday}h today
                                  </span>
                                  <div className="text-[9px] text-slate-400">
                                    {detail.overdueWorkingHours}h overdue
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Compact Rules Guide (English & Icon-driven) */}
            <div className="p-3 rounded-xl bg-[#1C1C1D] border border-[#3A3B3C] text-xs space-y-2">
              <div className="flex items-center gap-1.5 text-slate-200 font-bold text-[11px]">
                <Info className="w-3.5 h-3.5 text-[#C7F33C]" />
                <span>Daily Sampling Logic:</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-300">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-sky-400 shrink-0" />
                  <span>08:00–17:00 (9h/d)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Coffee className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>Pause nights & holidays</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-[#C7F33C] shrink-0" />
                  <span>Yellow all day → 08:00 Red</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-purple-400 shrink-0" />
                  <span>Monthly avg of daily rates</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
