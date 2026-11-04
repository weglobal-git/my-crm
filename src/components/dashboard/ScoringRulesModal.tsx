"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  Trophy,
  ShieldCheck,
  Clock,
  Coffee,
  Sparkles,
  Zap,
  CheckCircle2,
  Layers,
  Users,
} from "lucide-react";

interface ScoringRulesModalProps {
  isOpen: boolean;
  initialCategory?: string;
  onClose: () => void;
}

const TABS = [
  { id: "card_health", label: "Health", max: "30 XP" },
  { id: "clean_ltc", label: "Discipline", max: "20 XP" },
  { id: "velocity", label: "Velocity", max: "25 XP" },
  { id: "outcome", label: "Outcome", max: "25 XP" },
];

function normalizeTabId(categoryId: string): string {
  if (categoryId === "clean_bonus" || categoryId === "ltc") return "clean_ltc";
  if (categoryId === "quotation") return "velocity";
  if (TABS.some((t) => t.id === categoryId)) return categoryId;
  return "card_health";
}

export function ScoringRulesModal({
  isOpen,
  initialCategory = "card_health",
  onClose,
}: ScoringRulesModalProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const normalizedInitial = normalizeTabId(initialCategory);
  const [activeTab, setActiveTab] = useState<string>(normalizedInitial);
  const [prevCategory, setPrevCategory] = useState<string>(normalizedInitial);

  if (prevCategory !== normalizedInitial) {
    setPrevCategory(normalizedInitial);
    setActiveTab(normalizedInitial);
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
        className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[100] transition-opacity duration-300 opacity-100"
        onClick={onClose}
      />

      {/* Floating Right Side Drawer (Flat UI - zero shadows) */}
      <div className="fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[490px] md:max-w-[calc(100vw-32px)] z-[101] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right opacity-100 translate-y-0 md:translate-x-0 scale-100">
        <div
          ref={drawerRef}
          className="w-full bg-[#252728] border-0 md:border border-[#3A3B3C] flex flex-col h-full rounded-none md:rounded-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1C1C1D] shrink-0 bg-[#252728]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#3A3B3C] border border-[#4E4F50] flex items-center justify-center shrink-0">
                <Trophy className="w-4 h-4 text-[#C7F33C]" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">Scoring Rules (v2.3)</h2>
                <p className="text-[11px] text-slate-400">
                  Active Contributor &amp; Full-Month Rolling Consistency (100 Max XP)
                </p>
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

          {/* Segmented Sub-Bar */}
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
                    className={`flex-1 px-2 py-1 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                      isCurrent
                        ? "bg-[#3A3B3C] text-[#C7F33C]"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`text-[10px] font-mono px-1 rounded ${
                        isCurrent ? "bg-black/30 text-[#C7F33C]" : "text-slate-500"
                      }`}
                    >
                      {tab.max}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-3">
            {/* Total MVP Formula Banner */}
            <div className="rounded-xl border border-[#3A3B3C] bg-[#222426] p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-semibold text-slate-200">
                  <Trophy className="w-3.5 h-3.5 text-[#C7F33C]" />
                  <span>Unified Monthly Score</span>
                </div>
                <span className="font-mono text-[11px] font-bold text-[#C7F33C] bg-[#1C1C1D] px-2 py-0.5 rounded border border-[#3A3B3C]">
                  100 Max XP
                </span>
              </div>
              <div className="p-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]/60 font-mono text-[11px] text-slate-300">
                100 XP = Health (30) + Discipline &amp; LTC (20) + Velocity (25) + Outcome (25)
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />
                <span>
                  Outcome dynamically weights your active Sales Deals vs Internal Tasks &amp; Collaborations.
                </span>
              </div>
            </div>

            {/* TAB 1: Card Health (30 XP) */}
            {activeTab === "card_health" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-[#3A3B3C] bg-[#222426] p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                      <ShieldCheck className="w-4 h-4 text-[#C7F33C]" />
                      <span>Continuous Red Rate Curve</span>
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono font-medium bg-[#1C1C1D] px-2 py-0.5 rounded border border-[#3A3B3C]">
                      Target ≤ 5%
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]/60 space-y-1">
                    <div className="font-mono text-[11px] text-slate-200">
                      Red Rate % = (Red Hours ÷ Total Card Hours) × 100
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Smooth piecewise linear curve across all owned cards (Pure Collaborators with ≥ 3 assisted cards earn up to 85% = 25.5 XP).
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-0.5">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 px-0.5">
                      <span>Red Rate Checkpoints</span>
                      <span>Reward XP</span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                      <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]">
                        <span className="text-slate-300">0.0% Red</span>
                        <span className="text-[#C7F33C] font-bold">30.0 XP</span>
                      </div>
                      <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]">
                        <span className="text-slate-300">2.5% Red</span>
                        <span className="text-[#C7F33C] font-bold">26.0 XP</span>
                      </div>
                      <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]">
                        <span className="text-slate-300">5.0% (Target)</span>
                        <span className="text-[#C7F33C] font-bold">22.0 XP</span>
                      </div>
                      <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]">
                        <span className="text-slate-300">10.0% Red</span>
                        <span className="text-amber-300 font-semibold">11.0 XP</span>
                      </div>
                      <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] col-span-2">
                        <span className="text-slate-400">≥ 15.0% Red</span>
                        <span className="text-slate-500 font-medium">0.0 XP</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[#3A3B3C] bg-[#222426] p-3 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Zero-Button AI Auto-Grader &amp; Holidays
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]/60 space-y-0.5">
                      <div className="text-slate-200 font-semibold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#C7F33C]" />
                        <span>4 Auto Grades</span>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Note (+0h), Missed Call (+9h), Verbatim Outreach (+27h), or Progress (+27h ★)
                      </p>
                    </div>

                    <div className="p-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]/60 space-y-0.5">
                      <div className="text-slate-200 font-semibold flex items-center gap-1.5">
                        <Coffee className="w-3.5 h-3.5 text-amber-400" />
                        <span>Yellow Card → 08:00 Red</span>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Yellow Card warns all day; turns Red at 08:00 next active workday (no sudden 17:00 OT flip)
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Discipline & LTC Care (20 XP) */}
            {activeTab === "clean_ltc" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-[#3A3B3C] bg-[#222426] p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                      <Sparkles className="w-4 h-4 text-[#C7F33C]" />
                      <span>Clean Discipline &amp; Active LTC Care</span>
                    </span>
                    <span className="text-[10px] text-[#C7F33C] font-mono font-medium bg-[#1C1C1D] px-2 py-0.5 rounded border border-[#3A3B3C]">
                      Max 20 XP
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Rewards daily consistency (with Heavy-Load Shield protection) and individual accountability for re-engaging LTC customers.
                  </p>

                  <div className="space-y-1.5">
                    <div className="p-2.5 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="text-[11px] space-y-0.5 flex-1">
                        <div className="flex items-center justify-between text-slate-200 font-semibold">
                          <span>Clean Workdays &amp; Heavy-Load Shield</span>
                          <span className="font-mono text-[#C7F33C]">Max 10 XP</span>
                        </div>
                        <div className="text-slate-400">
                          +0.5 XP per 0-Red workday. Holding ≥ 10 active cards with only 1 Red Card triggers Heavy-Load Shield (+0.25 XP half-credit). Non-sales / pure task roles scale up to 20 XP.
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] flex items-start gap-2.5">
                      <Users className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                      <div className="text-[11px] space-y-0.5 flex-1">
                        <div className="flex items-center justify-between text-slate-200 font-semibold">
                          <span>Individual 2-Step LTC Care</span>
                          <span className="font-mono text-sky-400">Max 8 XP</span>
                        </div>
                        <div className="text-slate-400">
                          Up to +2.0 XP per LTC-* card (4 cards = 8 XP): +1 XP for verified +27h outreach, +1 XP when achieving Progress, scheduling a real Due Date, or following up across ≥ 2 workdays before closing LOST.
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] flex items-start gap-2.5">
                      <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="text-[11px] space-y-0.5 flex-1">
                        <div className="flex items-center justify-between text-slate-200 font-semibold">
                          <span>Team Zero-LTC Bonus</span>
                          <span className="font-mono text-amber-400">Max 2 XP</span>
                        </div>
                        <div className="text-slate-400">
                          +0.1 XP per workday when 0 pending LTC accounts remain at 17:00 cutoff (20 clean days = 2 XP).
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: Velocity & Teamwork (25 XP) */}
            {activeTab === "velocity" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-[#3A3B3C] bg-[#222426] p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                      <Zap className="w-4 h-4 text-[#C7F33C]" />
                      <span>Full-Month Rolling Velocity &amp; Teamwork</span>
                    </span>
                    <span className="text-[10px] text-[#C7F33C] font-mono font-medium bg-[#1C1C1D] px-2 py-0.5 rounded border border-[#3A3B3C]">
                      Max 25 XP
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Paced dynamically against elapsed working days so employees stay consistently engaged all month rather than maxing out in 5 days (12 + 6 + 7 = 25 XP).
                  </p>

                  <div className="space-y-2 text-[11px]">
                    <div className="p-2.5 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] space-y-1">
                      <div className="font-semibold text-slate-200 flex items-center justify-between">
                        <span>1. Daily Progress Rhythm &amp; Coverage</span>
                        <span className="font-mono text-[10px] text-[#C7F33C]">Max 12 XP</span>
                      </div>
                      <div className="text-slate-400 space-y-0.5">
                        <div>• Daily Rhythm (Max 7 XP): Full 7 XP at ≥ 75% of elapsed workdays with Progress ★ (1.0d) or Outreach +27h / To-Do (0.5d)</div>
                        <div>• Coverage (Max 5 XP): Full 5 XP at ≥ 75% of eligible owned cards progressed (shipping/long-lead holds excluded)</div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] space-y-1">
                      <div className="font-semibold text-slate-200 flex items-center justify-between">
                        <span>2. Consistent Teammate Assists</span>
                        <span className="font-mono text-[10px] text-sky-400">Max 6 XP</span>
                      </div>
                      <div className="text-slate-400 space-y-0.5">
                        <div>• Full 6 XP when posting verified +27h updates (or ≥ 2 To-Dos) on teammate cards across ≥ 30% of elapsed workdays (~2 days/week)</div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] space-y-1">
                      <div className="font-semibold text-slate-200 flex items-center justify-between">
                        <span>3. Daily Clean Load &amp; On-Time Execution</span>
                        <span className="font-mono text-[10px] text-amber-400">Max 7 XP</span>
                      </div>
                      <div className="text-slate-400 space-y-0.5">
                        <div>• Daily Clean Load (Max 3 XP): +0.2 XP per average daily non-red card maintained across the month (15+ clean cards/day = 3 XP)</div>
                        <div>• On-Time Execution (Max 4 XP): Rolling pace of Due Dates met on Due Date (before 08:00 next workday Red cutoff), To-Dos &amp; Urgent Replies × Due Date reliability (late/postponed Due Dates reduce score)</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: Outcome (25 XP) */}
            {activeTab === "outcome" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-[#3A3B3C] bg-[#222426] p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                      <Trophy className="w-4 h-4 text-[#C7F33C]" />
                      <span>Active Contributor Portfolio Outcome</span>
                    </span>
                    <span className="text-[10px] text-[#C7F33C] font-mono font-medium bg-[#1C1C1D] px-2 py-0.5 rounded border border-[#3A3B3C]">
                      Max 25 XP
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Only Card Owners and Active Helpers (verified +27h comments or ≥ 2 To-Dos) earn Outcome XP — passive card visibility members receive 0 XP and never dilute an owner&apos;s Sales Weight.
                  </p>

                  <div className="space-y-2 text-[11px]">
                    <div className="p-2.5 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] space-y-1">
                      <div className="font-semibold text-slate-200 flex items-center justify-between">
                        <span>Sales Deal Outcome (25-pt scale)</span>
                        <span className="font-mono text-[#C7F33C]">WON + Revenue</span>
                      </div>
                      <div className="text-slate-400 space-y-0.5">
                        <div>• Verified WON Deals: +5 pts per closed deal</div>
                        <div>• Revenue Ladder: up to +10 pts (฿100k = +1 pt, ฿1M = 10 pts, or dept share)</div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] space-y-1">
                      <div className="font-semibold text-slate-200 flex items-center justify-between">
                        <span>Internal Task SLA &amp; Active Co-Close Bonus</span>
                        <span className="font-mono text-sky-400">SLA + Assist</span>
                      </div>
                      <div className="text-slate-400 space-y-0.5">
                        <div>• On-Time SLA (Max 15 pts): Earned strictly on owned internal tasks &amp; healthy non-red active projects</div>
                        <div>• Deliverables &amp; Active Assists: Completed Tasks (+2.5), Project Milestones (+1.0), &amp; Active +27h Co-Closed Assists (+2.0 XP, capped at 10 XP for pure helpers)</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
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
