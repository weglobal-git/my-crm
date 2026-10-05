"use client";

import { X, ShieldCheck, Sparkles, Clock, FileText } from "lucide-react";
import type { LeaderboardItem } from "@/lib/dashboard/leaderboard-types";
import { useEffect, useRef } from "react";

interface ScoreBreakdownModalProps {
  item: LeaderboardItem | null;
  onClose: () => void;
}

export function ScoreBreakdownModal({ item, onClose }: ScoreBreakdownModalProps) {
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

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[100] transition-opacity duration-300 opacity-100"
        onClick={onClose}
      />

      {/* Floating Right Side Drawer (matches AccountFiltersDrawer / Pipeline style) */}
      <div className="fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[450px] md:max-w-[calc(100vw-32px)] z-[101] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right opacity-100 translate-y-0 md:translate-x-0 scale-100">
        <div
          ref={drawerRef}
          className="w-full bg-[#252728] border-0 md:border border-[#3A3B3C] flex flex-col h-full rounded-none md:rounded-2xl overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1C1C1D] shrink-0 bg-[#252728]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#3A3B3C] border border-[#4E4F50] overflow-hidden flex items-center justify-center shrink-0">
                {item.image ? (
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-black text-slate-200">{item.name.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-100">{item.name}</h2>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#C7F33C] text-black">
                    #{item.rank}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">Score Breakdown (Max 100 XP)</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-[#3A3B3C] rounded-full transition-colors text-slate-400 hover:text-slate-200 cursor-pointer"
              aria-label="Close breakdown"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3 font-mono text-xs">
            {/* 1. Card Health (Max 50 XP) */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#3A3B3C]/50 border border-[#4E4F50]">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#C7F33C]" />
                <div>
                  <div className="font-sans text-slate-200 font-semibold">Card Health (Max 50 XP)</div>
                  <div className="font-sans text-[11px] text-slate-400">
                    Avg Red {b.redRate?.toFixed(1) ?? '0.0'}% (Target &lt; 5%)
                  </div>
                </div>
              </div>
              <span className={`font-bold ${b.cardHealthTotalXp > 0 ? 'text-[#C7F33C]' : 'text-rose-400'}`}>
                +{b.cardHealthTotalXp} XP
              </span>
            </div>

            {/* 2. Clean Bonus (Max 20 XP) */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#3A3B3C]/50 border border-[#4E4F50]">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <div>
                  <div className="font-sans text-slate-200 font-semibold">Clean Bonus (Max 20 XP)</div>
                  <div className="font-sans text-[11px] text-slate-400">
                    Clean 100% on {b.cleanBonusDays ?? 0} days (+1 XP/day)
                  </div>
                </div>
              </div>
              <span className="font-bold text-emerald-400">+{b.cleanBonusXp} XP</span>
            </div>

            {/* 3. LTC (Max 20 XP) */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#3A3B3C]/50 border border-[#4E4F50]">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-sky-400" />
                <div>
                  <div className="font-sans text-slate-200 font-semibold">LTC (Max 20 XP)</div>
                  <div className="font-sans text-[11px] text-slate-400">Long-Time-Contact (Team Score)</div>
                </div>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30">
                Phase 2
              </span>
            </div>

            {/* 4. Quotation (Max 10 XP) */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#3A3B3C]/50 border border-[#4E4F50]">
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-amber-400" />
                <div>
                  <div className="font-sans text-slate-200 font-semibold">Quotation (Max 10 XP)</div>
                  <div className="font-sans text-[11px] text-slate-400">
                    Team Quotations: {b.quotationCount ?? 0} issued
                  </div>
                </div>
              </div>
              <span className="font-bold text-amber-400">+{b.quotationXp ?? 0} XP</span>
            </div>

            {/* Total Highlight */}
            <div className="p-4 rounded-xl bg-[#252728] border border-[#C7F33C]/40 flex items-center justify-between mt-4">
              <span className="font-sans font-bold text-slate-100 text-sm">Total Net</span>
              <span className="text-xl font-black text-[#C7F33C]">{b.totalXp} / 100 XP</span>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 sm:p-5 border-t border-[#1C1C1D] bg-[#252728] flex justify-end shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-full bg-[#3A3B3C] border border-[#4E4F50] text-slate-300 hover:text-white text-xs font-semibold hover:bg-[#4E4F50] transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
