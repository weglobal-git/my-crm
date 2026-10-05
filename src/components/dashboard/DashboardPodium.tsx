"use client";

import { Crown } from "lucide-react";
import type { LeaderboardItem, LeaderboardCategoryData } from "@/lib/dashboard/leaderboard-types";
import { buildPodium } from "@/lib/dashboard/leaderboard-scoring";
import { useState } from "react";

interface DashboardPodiumProps {
  overallItems: LeaderboardItem[];
  categories: LeaderboardCategoryData[];
  onSelectUser?: (item: LeaderboardItem) => void;
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function DashboardPodium({ overallItems, categories, onSelectUser }: DashboardPodiumProps) {
  const [selectedMetricId, setSelectedMetricId] = useState<string>("xp");

  // Determine which list to build podium from
  const currentCategory = categories.find((c) => c.id === selectedMetricId);
  const activeItems = currentCategory ? currentCategory.items : overallItems;
  const metricLabel = currentCategory ? currentCategory.label : "Overall MVP";

  const podium = buildPodium(activeItems, selectedMetricId, metricLabel);

  const { rank1, rank2, rank3 } = podium;

  return (
    <section className="rounded-[2rem] border border-[#4E4F50] bg-[#3A3B3C] p-6 lg:p-8 flex flex-col items-center relative">
      {/* Category Pills Switcher for Podium */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 mb-8">
        <button
          type="button"
          onClick={() => setSelectedMetricId("xp")}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
            selectedMetricId === "xp"
              ? "bg-[#C7F33C] text-black font-bold"
              : "bg-[#252728] border border-[#4E4F50] text-slate-300 hover:text-white hover:bg-[#4E4F50]"
          }`}
        >
          🏆 Overall MVP
        </button>
        {categories.map((cat) => {
          const isSelected = selectedMetricId === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedMetricId(cat.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                isSelected
                  ? "bg-[#C7F33C] text-black font-bold"
                  : "bg-[#252728] border border-[#4E4F50] text-slate-300 hover:text-white hover:bg-[#4E4F50]"
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* 3-Circle Overlapping Podium Layout (Matching Reference Image) */}
      <div className="flex items-end justify-center w-full max-w-lg mx-auto pt-2 pb-2">
        {/* === RANK #2 (LEFT - TUCKED BEHIND RANK 1) === */}
        <div 
          onClick={() => rank2 && onSelectUser?.(rank2)}
          className={`flex flex-col items-center z-10 w-28 sm:w-36 shrink-0 ${rank2 ? 'cursor-pointer group' : ''}`}
          title={rank2?.breakdown ? "View score breakdown" : undefined}
        >
          {rank2 ? (
            <>
              <div className="relative mb-2 transition-transform group-hover:scale-105">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-[#38BDF8] bg-[#1E293B] overflow-hidden flex items-center justify-center shadow-lg">
                  {rank2.image ? (
                    <img
                      src={rank2.image}
                      alt={rank2.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl sm:text-3xl font-black text-[#38BDF8]">
                      {getInitials(rank2.name)}
                    </span>
                  )}
                </div>
                {/* Rank Badge #2 */}
                <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#E2E8F0] text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center ring-4 ring-[#3A3B3C] shadow-md">
                  2
                </span>
              </div>

              <span
                className="text-xs sm:text-sm font-semibold text-slate-200 truncate max-w-[100px] sm:max-w-[120px] text-center mt-2 group-hover:text-white"
                title={rank2.name}
              >
                {rank2.name}
              </span>
              <span className="text-base sm:text-lg font-bold text-slate-100 group-hover:text-[#38BDF8]">
                {rank2.formattedValue}
              </span>
            </>
          ) : (
            <div className="flex flex-col items-center opacity-40">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-dashed border-[#4E4F50] flex items-center justify-center text-slate-500 font-bold text-sm">
                2
              </div>
              <span className="text-xs text-slate-500 mt-2">-</span>
            </div>
          )}
        </div>

        {/* === RANK #1 (CENTER - ELEVATED & OVERLAPPING) === */}
        <div 
          onClick={() => rank1 && onSelectUser?.(rank1)}
          className={`flex flex-col items-center z-20 w-36 sm:w-44 shrink-0 -mx-5 sm:-mx-8 -translate-y-5 sm:-translate-y-7 ${rank1 ? 'cursor-pointer group' : ''}`}
          title={rank1?.breakdown ? "View score breakdown" : undefined}
        >
          {rank1 ? (
            <>
              {/* Floating Crown directly over Rank 1 */}
              <div className="mb-1.5 animate-bounce">
                <Crown className="w-8 h-8 sm:w-9 sm:h-9 text-[#FACC15] fill-[#FACC15]/20" />
              </div>

              <div className="relative mb-2 transition-transform group-hover:scale-105">
                <div className="w-32 h-32 sm:w-38 sm:h-38 rounded-full border-4 border-[#FACC15] bg-[#292524] overflow-hidden flex items-center justify-center shadow-2xl">
                  {rank1.image ? (
                    <img
                      src={rank1.image}
                      alt={rank1.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl sm:text-4xl font-black text-[#FACC15]">
                      {getInitials(rank1.name)}
                    </span>
                  )}
                </div>
                {/* Rank Badge #1 */}
                <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#FACC15] text-slate-950 font-black text-sm sm:text-base flex items-center justify-center ring-4 ring-[#3A3B3C] shadow-lg">
                  1
                </span>
              </div>

              <span
                className="text-sm sm:text-base font-bold text-slate-100 truncate max-w-[130px] sm:max-w-[160px] text-center mt-2.5 group-hover:text-[#FACC15]"
                title={rank1.name}
              >
                {rank1.name}
              </span>
              <span className="text-xl sm:text-2xl font-black text-white">
                {rank1.formattedValue}
              </span>
            </>
          ) : (
            <div className="flex flex-col items-center opacity-40">
              <div className="w-32 h-32 sm:w-38 sm:h-38 rounded-full border-4 border-dashed border-[#4E4F50] flex items-center justify-center text-slate-500 font-bold text-lg">
                1
              </div>
              <span className="text-xs text-slate-500 mt-2">No data yet</span>
            </div>
          )}
        </div>

        {/* === RANK #3 (RIGHT - TUCKED BEHIND RANK 1) === */}
        <div 
          onClick={() => rank3 && onSelectUser?.(rank3)}
          className={`flex flex-col items-center z-10 w-28 sm:w-36 shrink-0 ${rank3 ? 'cursor-pointer group' : ''}`}
          title={rank3?.breakdown ? "View score breakdown" : undefined}
        >
          {rank3 ? (
            <>
              <div className="relative mb-2 transition-transform group-hover:scale-105">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-[#FB923C] bg-[#2A1E17] overflow-hidden flex items-center justify-center shadow-lg">
                  {rank3.image ? (
                    <img
                      src={rank3.image}
                      alt={rank3.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl sm:text-3xl font-black text-[#FB923C]">
                      {getInitials(rank3.name)}
                    </span>
                  )}
                </div>
                {/* Rank Badge #3 */}
                <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#EA580C] text-white font-black text-xs sm:text-sm flex items-center justify-center ring-4 ring-[#3A3B3C] shadow-md">
                  3
                </span>
              </div>

              <span
                className="text-xs sm:text-sm font-semibold text-slate-200 truncate max-w-[100px] sm:max-w-[120px] text-center mt-2 group-hover:text-white"
                title={rank3.name}
              >
                {rank3.name}
              </span>
              <span className="text-base sm:text-lg font-bold text-slate-100 group-hover:text-[#FB923C]">
                {rank3.formattedValue}
              </span>
            </>
          ) : (
            <div className="flex flex-col items-center opacity-40">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-dashed border-[#4E4F50] flex items-center justify-center text-slate-500 font-bold text-sm">
                3
              </div>
              <span className="text-xs text-slate-500 mt-2">-</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
