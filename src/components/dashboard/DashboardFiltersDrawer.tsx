"use client";

import { useEffect, useRef, useState } from "react";
import { X, SlidersHorizontal, RotateCcw, Printer, Check } from "lucide-react";
import { getBangkokMonth, getBangkokYear, type DashboardSectionAccess } from "@/lib/dashboard/sales-overview";
import type { PrintSections } from "./DashboardPrintReport";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

interface DashboardFiltersDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  month: number;
  year: number;
  onChangePeriod: (month: number, year: number) => void;
  onPrint?: (sections: PrintSections, targetMonth: number, targetYear: number) => void;
  allowedSections: DashboardSectionAccess;
}

export function DashboardFiltersDrawer({
  isOpen,
  onClose,
  month,
  year,
  onChangePeriod,
  onPrint,
  allowedSections,
}: DashboardFiltersDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const currentYear = getBangkokYear();
  const currentMonth = getBangkokMonth();

  const [tempYear, setTempYear] = useState(year);
  const [tempMonth, setTempMonth] = useState(month);
  const [printSections, setPrintSections] = useState<PrintSections>({
    saleSummary: allowedSections.saleSummary,
    saleTracking: allowedSections.saleTracking,
    annualReport: allowedSections.annualSaleReport,
  });

  // Sync draft selection when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTempYear(year);
      setTempMonth(month);
    }
  }, [isOpen, year, month]);

  // Click outside and Escape / Enter key listeners
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter") {
        if (tempMonth !== month || tempYear !== year) {
          onChangePeriod(tempMonth, tempYear);
        }
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, tempMonth, tempYear, month, year, onChangePeriod]);

  const availableYears = Array.from({ length: 11 }, (_, index) => currentYear - index);
  const hasChanged = tempMonth !== month || tempYear !== year;

  const handleApply = () => {
    if (hasChanged) {
      onChangePeriod(tempMonth, tempYear);
    }
    onClose();
  };

  const handleResetToCurrent = () => {
    setTempYear(currentYear);
    setTempMonth(currentMonth);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Floating Drawer Card matching PipelineFiltersDrawer */}
      <div
        className={`fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[480px] md:max-w-[calc(100vw-32px)] z-[101] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right ${
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
          <div className="flex items-center justify-between p-5 sm:p-6 border-b border-[#1C1C1D] shrink-0 bg-[#252728]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#3A3B3C] border border-[#4E4F50] flex items-center justify-center shrink-0">
                <SlidersHorizontal className="w-4 h-4 text-[#C7F33C]" />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-100">Period & Filters</h2>
                <span className="px-2 py-0.5 rounded-full bg-[#3A3B3C] text-[#C7F33C] text-[11px] font-bold border border-[#4E4F50]">
                  {MONTHS[tempMonth - 1].slice(0, 3)} {tempYear}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-[#3A3B3C] rounded-full transition-colors text-slate-400 hover:text-slate-200 cursor-pointer"
              aria-label="Close filters"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 2-Column Body (Left: Year, Right: Month) */}
          <div className="flex-1 overflow-hidden p-5 sm:p-6 flex flex-col min-h-0">
            <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
              {/* Left Column: Year */}
              <div className="flex flex-col min-h-0 space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-[#3A3B3C]">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Year
                  </span>
                  <span className="text-xs font-bold text-[#C7F33C]">{tempYear}</span>
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
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#C7F33C] text-black font-bold shadow-sm"
                            : "bg-[#1E1F20] border border-[#3A3B3C] text-slate-300 hover:border-[#4E4F50] hover:text-white font-medium"
                        }`}
                      >
                        <span>{yr}</span>
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
              <div className="flex flex-col min-h-0 space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-[#3A3B3C]">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Month
                  </span>
                  <span className="text-xs font-bold text-[#C7F33C]">
                    {MONTHS[tempMonth - 1].slice(0, 3)}
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
                        className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer ${
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

          {/* Print Section */}
          <div className="px-5 sm:px-6 py-4 border-t border-[#3A3B3C] bg-[#1E1F20]/70 shrink-0 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-[#C7F33C]" />
                <span className="text-xs font-bold text-slate-200">Print Report (A4)</span>
              </div>
              <span className="text-[11px] font-semibold text-[#C7F33C]">
                {MONTHS[tempMonth - 1].slice(0, 3)} {tempYear}
              </span>
            </div>

            {/* Round Checkboxes */}
            <div className="grid grid-cols-3 gap-2">
              {allowedSections.saleSummary && <label
                className={`flex items-center gap-2 p-2 rounded-xl border transition-all cursor-pointer select-none text-xs ${
                  printSections.saleSummary
                    ? "bg-[#3A3B3C] border-[#C7F33C]/60 text-white"
                    : "bg-[#252728] border-[#3A3B3C] text-slate-400 hover:text-slate-200"
                }`}
              >
                <input
                  type="checkbox"
                  checked={printSections.saleSummary}
                  onChange={(e) =>
                    setPrintSections((prev) => ({ ...prev, saleSummary: e.target.checked }))
                  }
                  className="sr-only"
                />
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                    printSections.saleSummary
                      ? "bg-[#C7F33C] border-[#C7F33C] text-black"
                      : "border-[#4E4F50] bg-[#1E1F20]"
                  }`}
                >
                  {printSections.saleSummary && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                </div>
                <span className="truncate font-medium">Sale Summary</span>
              </label>}

              {allowedSections.saleTracking && <label
                className={`flex items-center gap-2 p-2 rounded-xl border transition-all cursor-pointer select-none text-xs ${
                  printSections.saleTracking
                    ? "bg-[#3A3B3C] border-[#C7F33C]/60 text-white"
                    : "bg-[#252728] border-[#3A3B3C] text-slate-400 hover:text-slate-200"
                }`}
              >
                <input
                  type="checkbox"
                  checked={printSections.saleTracking}
                  onChange={(e) =>
                    setPrintSections((prev) => ({ ...prev, saleTracking: e.target.checked }))
                  }
                  className="sr-only"
                />
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                    printSections.saleTracking
                      ? "bg-[#C7F33C] border-[#C7F33C] text-black"
                      : "border-[#4E4F50] bg-[#1E1F20]"
                  }`}
                >
                  {printSections.saleTracking && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                </div>
                <span className="truncate font-medium">Sale Tracking</span>
              </label>}

              {allowedSections.annualSaleReport && <label
                className={`flex items-center gap-2 p-2 rounded-xl border transition-all cursor-pointer select-none text-xs ${
                  printSections.annualReport
                    ? "bg-[#3A3B3C] border-[#C7F33C]/60 text-white"
                    : "bg-[#252728] border-[#3A3B3C] text-slate-400 hover:text-slate-200"
                }`}
              >
                <input
                  type="checkbox"
                  checked={printSections.annualReport}
                  onChange={(e) =>
                    setPrintSections((prev) => ({ ...prev, annualReport: e.target.checked }))
                  }
                  className="sr-only"
                />
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                    printSections.annualReport
                      ? "bg-[#C7F33C] border-[#C7F33C] text-black"
                      : "border-[#4E4F50] bg-[#1E1F20]"
                  }`}
                >
                  {printSections.annualReport && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                </div>
                <span className="truncate font-medium">Annual Report</span>
              </label>}
            </div>

            {/* Print Action Button */}
            <button
              type="button"
              onClick={() => {
                if (onPrint) {
                  onPrint(printSections, tempMonth, tempYear);
                  onClose();
                }
              }}
              disabled={
                !printSections.saleSummary &&
                !printSections.saleTracking &&
                !printSections.annualReport
              }
              className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-[#3A3B3C] hover:bg-[#4E4F50] text-slate-100 hover:text-[#C7F33C] border border-[#4E4F50] text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print A4 Report ({MONTHS[tempMonth - 1].slice(0, 3)} {tempYear})</span>
            </button>
          </div>

          {/* Footer Bar */}
          <div className="p-4 sm:p-5 border-t border-[#1C1C1D] bg-[#252728] flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={handleResetToCurrent}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer py-1.5 px-3 rounded-xl hover:bg-[#3A3B3C]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>This Month</span>
            </button>

            <button
              type="button"
              onClick={handleApply}
              className="px-5 py-2 rounded-full bg-[#C7F33C] text-black font-semibold text-xs hover:bg-[#b0d635] transition-colors cursor-pointer"
            >
              {hasChanged
                ? `Apply (${MONTHS[tempMonth - 1].slice(0, 3)} ${tempYear})`
                : "Done"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
