"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, SlidersHorizontal, RotateCcw } from "lucide-react";
import { getBangkokMonth, getBangkokYear } from "@/lib/dashboard/sales-overview";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

interface LeaderboardPeriodModalProps {
  isOpen: boolean;
  onClose: () => void;
  month: number;
  year: number;
  onApply: (month: number, year: number) => void;
}

export function LeaderboardPeriodModal({
  isOpen,
  onClose,
  month,
  year,
  onApply,
}: LeaderboardPeriodModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const currentYear = getBangkokYear();
  const currentMonth = getBangkokMonth();

  const [tempYear, setTempYear] = useState(year);
  const [tempMonth, setTempMonth] = useState(month);

  const availableYears = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear; y >= currentYear - 10; y--) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  // Sync selection when opened
  useEffect(() => {
    if (isOpen) {
      setTempYear(year);
      setTempMonth(month);
    }
  }, [isOpen, year, month]);

  // Escape key listener & body scroll lock
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

  const handleApply = () => {
    onApply(tempMonth, tempYear);
    onClose();
  };

  const handleResetToCurrent = () => {
    setTempYear(currentYear);
    setTempMonth(currentMonth);
  };

  const hasChanged = tempYear !== year || tempMonth !== month;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[105] transition-opacity duration-300 opacity-100"
        onClick={onClose}
      />

      {/* Floating Right Side Drawer (EditPanel matches LeaderboardDrawer size: 500px) */}
      <div className="fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[500px] md:max-w-[calc(100vw-32px)] z-[106] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right opacity-100 translate-y-0 md:translate-x-0 scale-100">
        <div
          ref={modalRef}
          className="w-full bg-[#252728] border-0 md:border border-[#3A3B3C] flex flex-col h-full rounded-none md:rounded-2xl overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1C1C1D] shrink-0 bg-[#252728]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#3A3B3C] border border-[#4E4F50] flex items-center justify-center shrink-0">
                <SlidersHorizontal className="w-4 h-4 text-[#C7F33C]" />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100">Period & Filters</h2>
                <span className="px-2 py-0.5 rounded-full bg-[#3A3B3C] text-[#C7F33C] text-[11px] font-bold border border-[#4E4F50] font-mono">
                  {MONTHS[tempMonth - 1].slice(0, 3)} {tempYear}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-[#3A3B3C] rounded-full transition-colors text-slate-400 hover:text-slate-200 cursor-pointer"
              title="Close panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 2-Column Period (Left: Year, Right: Month) */}
          <div className="flex-1 overflow-hidden p-4 sm:p-5 flex flex-col min-h-0 bg-[#202226]">
            <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
              {/* Left Column: Year */}
              <div className="flex flex-col min-h-0 space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-[#3A3B3C]">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Year
                  </span>
                  <span className="text-xs font-mono font-bold text-[#C7F33C]">{tempYear}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                  {availableYears.map((yr) => {
                    const isSelected = yr === tempYear;
                    const isCurrent = yr === currentYear;
                    return (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => setTempYear(yr)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#C7F33C] text-black font-bold shadow-sm"
                            : "bg-[#1E1F20] border border-[#3A3B3C] text-slate-300 hover:border-[#4E4F50] hover:text-white font-medium"
                        }`}
                      >
                        <span className="font-mono text-sm">{yr}</span>
                        {isCurrent && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                              isSelected
                                ? "bg-black/20 text-black"
                                : "bg-[#252728] text-slate-400"
                            }`}
                          >
                            Now
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Month */}
              <div className="flex flex-col min-h-0 space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-[#3A3B3C]">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Month
                  </span>
                  <span className="text-xs font-mono font-bold text-[#C7F33C]">
                    {MONTHS[tempMonth - 1]}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                  {MONTHS.map((name, index) => {
                    const m = index + 1;
                    const isSelected = m === tempMonth;
                    const isCurrent = m === currentMonth && tempYear === currentYear;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setTempMonth(m)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#C7F33C] text-black font-bold shadow-sm"
                            : "bg-[#1E1F20] border border-[#3A3B3C] text-slate-300 hover:border-[#4E4F50] hover:text-white font-medium"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`text-[10px] font-mono shrink-0 ${
                              isSelected ? "text-black/60 font-bold" : "text-slate-500"
                            }`}
                          >
                            {String(m).padStart(2, "0")}
                          </span>
                          <span className="truncate">{name}</span>
                        </div>
                        {isCurrent && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                              isSelected
                                ? "bg-black/20 text-black"
                                : "bg-[#252728] text-slate-400"
                            }`}
                          >
                            Now
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Bar */}
          <div className="p-3.5 sm:p-4 border-t border-[#1C1C1D] bg-[#252728] flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={handleResetToCurrent}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer py-2 px-3.5 rounded-xl hover:bg-[#3A3B3C]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Current</span>
            </button>

            <button
              type="button"
              onClick={handleApply}
              className="px-6 py-2 rounded-full bg-[#C7F33C] text-black font-semibold text-xs hover:bg-[#b0d635] transition-colors cursor-pointer shadow-sm"
            >
              {hasChanged ? "Apply Period" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
