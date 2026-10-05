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
} from "lucide-react";
import type { LeaderboardCategoryData, LeaderboardItem } from "@/lib/dashboard/leaderboard-types";

interface DashboardCategoryColumnsProps {
  categories: LeaderboardCategoryData[];
  onSelectUser?: (item: LeaderboardItem) => void;
  onSelectHealthUser?: (item: LeaderboardItem) => void;
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
  { id: "clean_bonus", label: "Clean" },
  { id: "ltc", label: "LTC" },
  { id: "quotation", label: "Quote" },
];

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function DashboardCategoryColumns({
  categories,
  onSelectUser,
  onSelectHealthUser,
  layout = "tabs",
  activeTab: activeTabProp,
  onTabChange,
}: DashboardCategoryColumnsProps) {
  const [internalActiveTab, setInternalActiveTab] = useState<string>("card_health");
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
    const isCleanBonus = category.id === "clean_bonus";
    const isLtc = category.id === "ltc";

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
                if (
                  (isHealth || isCleanBonus) &&
                  onSelectHealthUser &&
                  item.dailyHealthSummary
                ) {
                  onSelectHealthUser(item);
                } else {
                  onSelectUser?.(item);
                }
              }}
              className={`flex items-center justify-between p-2 text-sm rounded-xl transition-colors cursor-pointer ${
                item.isCurrentUser
                  ? "bg-[#C7F33C]/10 border border-[#C7F33C]/40"
                  : "hover:bg-[#4E4F50]/50"
              }`}
              title={
                isHealth || isCleanBonus
                  ? "View daily card health history"
                  : item.breakdown
                  ? "View score breakdown"
                  : undefined
              }
            >
              {/* Left: Rank Badge + Avatar + Name */}
              <div className="flex items-center gap-2.5 min-w-0 pr-2 flex-1">
                {/* Rank Badge */}
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

                {/* Avatar */}
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

                {/* Name */}
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

              {/* Right: Compact Score Value / Health Status */}
              <div className="text-right shrink-0">
                {isHealth ? (
                  (() => {
                    const activeCards =
                      item.dailyHealthSummary?.currentActiveCards ??
                      item.breakdown?.activeCards ??
                      0;
                    const redCards =
                      item.dailyHealthSummary?.currentRedCards ??
                      item.breakdown?.redCards ??
                      0;
                    const rate = item.dailyHealthSummary?.avgMonthlyRedRate ?? 0;
                    const xp = item.score ?? 0;

                    return (
                      <div className="flex items-center gap-1.5 justify-end">
                        {/* 1) Daily RedCard / TotalCard Count Badge */}
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded leading-none shrink-0 ${
                            redCards > 0
                              ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                              : activeCards === 0
                              ? "bg-slate-800/40 text-slate-500 border border-slate-700/50"
                              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          }`}
                          title={`Today: ${redCards} red / ${activeCards} total active cards`}
                        >
                          Daily {redCards}/{activeCards}
                        </span>

                        {/* 2) Accu (Accumulated Monthly) Red Rate Badge */}
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded leading-none shrink-0 ${
                            activeCards > 0 && rate >= 5
                              ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                              : activeCards === 0
                              ? "bg-slate-800/40 text-slate-500 border border-slate-700/50"
                              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          }`}
                          title={`Monthly Accumulated Red Rate: ${item.formattedValue}`}
                        >
                          Accu {item.formattedValue}
                        </span>

                        {/* Earned Health XP outside the badge */}
                        <span
                          className={`text-xs font-mono font-bold min-w-[38px] text-right shrink-0 ${
                            xp > 0 ? "text-[#C7F33C]" : "text-slate-500"
                          }`}
                        >
                          {xp} XP
                        </span>
                      </div>
                    );
                  })()
                ) : isCleanBonus ? (
                  <span
                    className={`text-xs font-mono font-bold ${
                      item.score > 0 ? "text-[#C7F33C]" : "text-slate-400"
                    }`}
                  >
                    {item.formattedValue}
                  </span>
                ) : isLtc ? (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-[#252728] text-slate-400 border border-[#4E4F50] font-mono">
                    Phase 2
                  </span>
                ) : (
                  <span className="text-xs font-bold text-slate-100 font-mono">
                    {item.formattedValue}
                  </span>
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
        <div className="rounded-xl bg-[#1C1C1D] border border-[#3A3B3C] p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#C7F33C]" />
              <span>Scoring Rules</span>
            </span>
            <span className="font-mono text-[#C7F33C] font-semibold">Max 50 XP</span>
          </div>

          <div className="p-2 rounded-lg bg-[#252728] border border-[#3A3B3C]/60 text-[11px] font-mono text-slate-300 space-y-0.5">
            <div>Red Rate % = (Red Hours ÷ Total Card Hours) × 100</div>
            <div className="text-[10px] font-sans text-slate-400">
              1 active card = 9h/day (08:00–17:00). Daily cutoff at 23:00.
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 px-0.5">
              <span>Red Rate Target</span>
              <span>Reward XP</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
              <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#252728] border border-[#3A3B3C]/60">
                <span className="text-slate-300">&lt; 1%</span>
                <span className="text-[#C7F33C] font-bold">50 XP</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#252728] border border-[#3A3B3C]/60">
                <span className="text-slate-300">&lt; 2%</span>
                <span className="text-[#C7F33C] font-bold">45 XP</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#252728] border border-[#3A3B3C]/60">
                <span className="text-slate-300">&lt; 3%</span>
                <span className="text-[#C7F33C] font-bold">40 XP</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#252728] border border-[#3A3B3C]/60">
                <span className="text-slate-300">&lt; 4%</span>
                <span className="text-[#C7F33C] font-bold">35 XP</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#252728] border border-[#3A3B3C]/60">
                <span className="text-slate-300">&lt; 5%</span>
                <span className="text-[#C7F33C] font-bold">30 XP</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#252728] border border-[#3A3B3C]/60">
                <span className="text-slate-300">&lt; 10%</span>
                <span className="text-slate-200 font-semibold">20 XP</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#252728] border border-[#3A3B3C]/60">
                <span className="text-slate-300">&lt; 20%</span>
                <span className="text-slate-200 font-semibold">10 XP</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#252728] border border-[#3A3B3C]/60">
                <span className="text-slate-400">&gt; 20%</span>
                <span className="text-slate-500 font-medium">0 XP</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (categoryId === "clean_bonus") {
      return (
        <div className="rounded-xl bg-[#1C1C1D] border border-[#3A3B3C] p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#C7F33C]" />
              <span>Scoring Rules</span>
            </span>
            <span className="font-mono text-[#C7F33C] font-semibold">Max 20 XP</span>
          </div>

          <div className="space-y-1.5 text-[11px]">
            <div className="p-2 rounded-lg bg-[#252728] border border-[#3A3B3C]/60 space-y-0.5">
              <div className="text-slate-200 font-semibold flex items-center justify-between">
                <span>Daily 100% Clean Board (0 Red Cards)</span>
                <span className="font-mono font-bold text-[#C7F33C]">+1 XP</span>
              </div>
              <div className="text-slate-400 text-[10px]">
                Evaluated at 23:00 daily cutoff.
              </div>
            </div>
            <div className="p-2 rounded-lg bg-[#252728] border border-[#3A3B3C]/60 space-y-0.5">
              <div className="text-slate-200 font-semibold flex items-center justify-between">
                <span>Active Red Card at Cutoff</span>
                <span className="font-mono text-slate-500 font-semibold">0 XP</span>
              </div>
              <div className="text-slate-400 text-[10px]">
                0 XP earned on that day if even 1 Red Card is active.
              </div>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-[#252728] border border-[#3A3B3C]/60">
              <span className="text-slate-400">Monthly Cap</span>
              <span className="font-mono font-bold text-[#C7F33C]">Max 20 XP</span>
            </div>
          </div>
        </div>
      );
    }

    if (categoryId === "ltc") {
      return (
        <div className="rounded-xl bg-[#1C1C1D] border border-[#3A3B3C] p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#C7F33C]" />
              <span>Scoring Rules</span>
            </span>
            <span className="font-mono text-slate-400 font-semibold">Max 20 XP</span>
          </div>

          <div className="space-y-1.5 text-[11px]">
            <p className="text-slate-300 leading-relaxed">
              Team metric encouraging reps to follow up and resolve Long-Time-Contact deals across the department.
            </p>
            <div className="p-2 rounded-lg bg-[#252728] border border-[#3A3B3C]/60 text-slate-400 space-y-0.5">
              <div className="text-slate-200 font-semibold">Status: Phase 2 In Development</div>
              <div className="text-[10px]">
                Operates similarly to Red Card health. Scored at 0 XP for Phase 1.
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (categoryId === "quotation") {
      return (
        <div className="rounded-xl bg-[#1C1C1D] border border-[#3A3B3C] p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[#C7F33C]" />
              <span>Scoring Rules</span>
            </span>
            <span className="font-mono text-[#C7F33C] font-semibold">Max 10 XP</span>
          </div>

          <div className="space-y-1.5 text-[11px]">
            <p className="text-slate-300 leading-relaxed">
              Shared team metric rewarding monthly proposal and quotation activity across the department.
            </p>
            <div className="flex items-center justify-between p-2 rounded-lg bg-[#252728] border border-[#3A3B3C]/60">
              <span className="text-slate-200">1 Quotation issued</span>
              <span className="font-mono font-bold text-[#C7F33C]">+1 XP</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-[#252728] border border-[#3A3B3C]/60">
              <span className="text-slate-400">Monthly Team Cap</span>
              <span className="font-mono font-bold text-[#C7F33C]">Max 10 XP</span>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  // If tabs layout is selected (default for drawer)
  if (layout === "tabs") {
    if (!currentCategory) return null;

    return (
      <div className="flex flex-col gap-3">
        {/* 4 Tabs: Health / Clean / LTC / Quote */}
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
                    ? "bg-[#3A3B3C] text-slate-100 font-bold shadow-xs border border-[#4E4F50]"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Section 1 of Tab: Standings (อันดับ) */}
        {renderCategoryItems(currentCategory)}

        {/* Section 2 of Tab: Scoring Rules (วิธีคิดคะแนน) */}
        {renderCategoryRules(currentCategory.id)}
      </div>
    );
  }

  // Grid or vertical layout fallback
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
