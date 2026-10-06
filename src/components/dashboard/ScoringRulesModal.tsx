"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  Trophy,
  ShieldCheck,
  Clock,
  Coffee,
  Sparkles,
  FileText,
  CheckCircle2,
  AlertTriangle,
  CalendarCheck2,
  Layers,
} from "lucide-react";

interface ScoringRulesModalProps {
  isOpen: boolean;
  initialCategory?: string;
  onClose: () => void;
}

const TABS = [
  { id: "card_health", label: "Health", max: "50 XP" },
  { id: "clean_bonus", label: "Clean", max: "20 XP" },
  { id: "ltc", label: "LTC", max: "20 XP" },
  { id: "quotation", label: "Quote", max: "10 XP" },
];

export function ScoringRulesModal({ isOpen, initialCategory = "card_health", onClose }: ScoringRulesModalProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<string>(initialCategory);
  const [prevCategory, setPrevCategory] = useState<string>(initialCategory);

  if (prevCategory !== initialCategory) {
    setPrevCategory(initialCategory);
    setActiveTab(initialCategory);
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "auto";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[100] transition-opacity duration-300 opacity-100"
        onClick={onClose}
      />

      {/* Floating Right Side Drawer (Edit / Filter style) */}
      <div className="fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[480px] md:max-w-[calc(100vw-32px)] z-[101] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right opacity-100 translate-y-0 md:translate-x-0 scale-100">
        <div
          ref={drawerRef}
          className="w-full bg-[#252728] border-0 md:border border-[#3A3B3C] flex flex-col h-full rounded-none md:rounded-2xl overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1C1C1D] shrink-0 bg-[#252728]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#3A3B3C] border border-[#4E4F50] flex items-center justify-center shrink-0">
                <Trophy className="w-4 h-4 text-[#C7F33C]" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">Scoring Rules</h2>
                <p className="text-[11px] text-slate-400">Gamification Architecture (100 Max XP)</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-[#3A3B3C] rounded-full transition-colors text-slate-400 hover:text-slate-200 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Standard Segmented Sub-Bar (Matches EditDealSubBar:L123) */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#1C1C1D] bg-[#252728] shrink-0 min-h-[44px]">
            <div className="flex items-center gap-1 bg-[#1C1C1D] p-0.5 rounded-lg w-full" role="tablist">
              {TABS.map((tab) => {
                const isCurrent = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    role="tab"
                    aria-selected={isCurrent}
                    className={`flex-1 px-3 py-1 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                      isCurrent
                        ? "bg-[#3A3B3C] text-[#C7F33C]"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`text-[10px] font-mono px-1 py-0.2 rounded ${isCurrent ? "bg-black/30 text-[#C7F33C]" : "text-slate-500"}`}>
                      {tab.max}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable Body: Compact, Calm & Harmonious */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-3">
            {/* Total MVP Formula Banner */}
            <div className="rounded-xl border border-[#3A3B3C] bg-[#222426] p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-semibold text-slate-200">
                  <Trophy className="w-3.5 h-3.5 text-[#C7F33C]" />
                  <span>Total Monthly Target</span>
                </div>
                <span className="font-mono text-[11px] font-bold text-[#C7F33C] bg-[#1C1C1D] px-2 py-0.5 rounded border border-[#3A3B3C]">
                  100 Max XP
                </span>
              </div>
              <div className="p-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]/60 font-mono text-[11px] text-slate-300">
                100 XP = Health (50) + Clean (20) + LTC (20) + Quote (10)
              </div>
            </div>

            {/* TAB 1: Health (Card Health) */}
            {activeTab === "card_health" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-[#3A3B3C] bg-[#222426] p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                      <ShieldCheck className="w-4 h-4 text-[#C7F33C]" />
                      <span>Card Health Ladder</span>
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono font-medium bg-[#1C1C1D] px-2 py-0.5 rounded border border-[#3A3B3C]">
                      Target &lt; 5%
                    </span>
                  </div>

                  {/* Formula Box */}
                  <div className="p-2.5 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]/60 space-y-1">
                    <div className="font-mono text-[11px] text-slate-200">
                      Red Rate % = (Red Hours ÷ Total Card Hours) × 100
                    </div>
                    <div className="text-[10px] text-slate-400">
                      1 active card = 9 working hours/day (08:00–17:00). Evaluated at 23:00 daily.
                    </div>
                  </div>

                  {/* 8-Tier Ladder (Balanced 2-Col Grid) */}
                  <div className="space-y-1.5 pt-0.5">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 px-0.5">
                      <span>Rate Threshold</span>
                      <span>Reward XP</span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                      {/* Row 1 */}
                      <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]">
                        <span className="text-slate-300">&lt; 1%</span>
                        <span className="text-[#C7F33C] font-bold">50 XP</span>
                      </div>
                      <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]">
                        <span className="text-slate-300">&lt; 2%</span>
                        <span className="text-[#C7F33C] font-bold">45 XP</span>
                      </div>

                      {/* Row 2 */}
                      <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]">
                        <span className="text-slate-300">&lt; 3%</span>
                        <span className="text-[#C7F33C] font-bold">40 XP</span>
                      </div>
                      <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]">
                        <span className="text-slate-300">&lt; 4%</span>
                        <span className="text-[#C7F33C] font-bold">35 XP</span>
                      </div>

                      {/* Row 3 */}
                      <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]">
                        <span className="text-slate-300">&lt; 5%</span>
                        <span className="text-[#C7F33C] font-bold">30 XP</span>
                      </div>
                      <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]">
                        <span className="text-slate-300">&lt; 10%</span>
                        <span className="text-slate-200 font-semibold">20 XP</span>
                      </div>

                      {/* Row 4 */}
                      <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]">
                        <span className="text-slate-300">&lt; 20%</span>
                        <span className="text-slate-200 font-semibold">10 XP</span>
                      </div>
                      <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]">
                        <span className="text-slate-400">&gt; 20%</span>
                        <span className="text-slate-500 font-medium">0 XP</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Fair-Play Parameters */}
                <div className="rounded-xl border border-[#3A3B3C] bg-[#222426] p-3 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Working Hours & Rules
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]/60 space-y-0.5">
                      <div className="text-slate-200 font-semibold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#C7F33C]" />
                        <span>08:00 – 17:00</span>
                      </div>
                      <p className="text-[10px] text-slate-400">9 working hours/day</p>
                    </div>

                    <div className="p-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]/60 space-y-0.5">
                      <div className="text-slate-200 font-semibold flex items-center gap-1.5">
                        <Coffee className="w-3.5 h-3.5 text-amber-400" />
                        <span>Auto-Pause</span>
                      </div>
                      <p className="text-[10px] text-slate-400">Sundays, holidays & leaves</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Clean (Clean Bonus) */}
            {activeTab === "clean_bonus" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-[#3A3B3C] bg-[#222426] p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                      <Sparkles className="w-4 h-4 text-[#C7F33C]" />
                      <span>Clean Bonus</span>
                    </span>
                    <span className="text-[10px] text-[#C7F33C] font-mono font-medium bg-[#1C1C1D] px-2 py-0.5 rounded border border-[#3A3B3C]">
                      +1 XP / Day
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Daily discipline reward for keeping your active portfolio 100% clean of overdue cards.
                  </p>

                  <div className="space-y-1.5">
                    <div className="p-2.5 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="text-[11px] space-y-0.5">
                        <div className="text-slate-200 font-semibold">+1 XP per day</div>
                        <div className="text-slate-400">
                          100% clean board (0 Red Cards) at 23:00 cutoff.
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div className="text-[11px] space-y-0.5">
                        <div className="text-slate-200 font-semibold">0 XP on that day</div>
                        <div className="text-slate-400">
                          If even 1 Red Card is active at 23:00 cutoff.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Monthly Cap</span>
                    <span className="font-mono font-bold text-[#C7F33C]">20 XP</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#222426] border border-[#3A3B3C] flex items-center gap-2.5 text-xs text-slate-300">
                  <CalendarCheck2 className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>Click rep row in Clean Bonus column to view daily calendar history.</span>
                </div>
              </div>
            )}

            {/* TAB 3: LTC (Long-Time-Contact) */}
            {activeTab === "ltc" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-[#3A3B3C] bg-[#222426] p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                      <Clock className="w-4 h-4 text-[#C7F33C]" />
                      <span>LTC (Long-Time-Contact)</span>
                    </span>
                    <span className="text-[10px] text-[#C7F33C] font-mono font-medium bg-[#1C1C1D] px-2 py-0.5 rounded border border-[#3A3B3C]">
                      Team Metric
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Shared team metric rewarding proactive follow-ups and resolving stale customer contacts across the department.
                  </p>

                  <div className="space-y-1.5">
                    <div className="p-2.5 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="text-[11px] space-y-0.5">
                        <div className="text-slate-200 font-semibold">+1 XP per day for team</div>
                        <div className="text-slate-400">
                          100% cleared (0 LTC accounts) at 17:00 end of workday cutoff.
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div className="text-[11px] space-y-0.5">
                        <div className="text-slate-200 font-semibold">0 XP on that day</div>
                        <div className="text-slate-400">
                          If even 1 LTC account remains pending at 17:00 cutoff.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Sundays &amp; Company Holidays</span>
                    <span className="font-mono text-amber-400">Auto-Pause</span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Monthly Team Cap</span>
                    <span className="font-mono font-bold text-[#C7F33C]">20 XP</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: Quote (Quotation) */}
            {activeTab === "quotation" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-[#3A3B3C] bg-[#222426] p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                      <FileText className="w-4 h-4 text-[#C7F33C]" />
                      <span>Quotation</span>
                    </span>
                    <span className="text-[10px] text-amber-400 font-mono font-medium bg-[#1C1C1D] px-2 py-0.5 rounded border border-[#3A3B3C]">
                      Team Metric
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Shared team metric rewarding monthly proposal and quotation activity across the department.
                  </p>

                  <div className="p-3 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] space-y-2">
                    <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      <span>Scoring Rules</span>
                    </div>
                    <div className="space-y-1.5 text-[11px] text-slate-300">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-[#252728] border border-[#3A3B3C]/60">
                        <span>1 Quotation issued</span>
                        <span className="font-mono font-bold text-[#C7F33C]">+1 XP</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-[#252728] border border-[#3A3B3C]/60">
                        <span>Monthly Team Cap</span>
                        <span className="font-mono font-bold text-[#C7F33C]">10 XP</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer (Edit / Filter drawer style) */}
          <div className="p-3.5 sm:p-4 border-t border-[#1C1C1D] bg-[#252728] flex justify-end shrink-0">
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
