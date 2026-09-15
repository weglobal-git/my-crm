"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  SlidersHorizontal,
  RotateCcw,
  Printer,
  Check,
  Globe,
  Building2,
  ChevronDown,
  Search,
} from "lucide-react";
import {
  getBangkokMonth,
  getBangkokYear,
  type DashboardSectionAccess,
  type FilterCountryOption,
  type FilterAccountOption,
} from "@/lib/dashboard/sales-overview";
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
  country?: string | null;
  account?: string | null;
  availableCountries?: FilterCountryOption[];
  availableAccounts?: FilterAccountOption[];
  onChangePeriod: (month: number, year: number) => void;
  onApplyFilters?: (filters: {
    month: number;
    year: number;
    country?: string | null;
    account?: string | null;
  }) => void;
  onPrint?: (sections: PrintSections, targetMonth: number, targetYear: number) => void;
  allowedSections: DashboardSectionAccess;
}

export function DashboardFiltersDrawer({
  isOpen,
  onClose,
  month,
  year,
  country,
  account,
  availableCountries = [],
  availableAccounts = [],
  onChangePeriod,
  onApplyFilters,
  onPrint,
  allowedSections,
}: DashboardFiltersDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const currentYear = getBangkokYear();
  const currentMonth = getBangkokMonth();

  const [tempYear, setTempYear] = useState(year);
  const [tempMonth, setTempMonth] = useState(month);
  const [tempCountry, setTempCountry] = useState<string | null>(country || null);
  const [tempAccount, setTempAccount] = useState<string | null>(account || null);

  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");

  const countryDropdownRef = useRef<HTMLDivElement>(null);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  const [printSections, setPrintSections] = useState<PrintSections>({
    worldMap: Object.values(allowedSections).some(Boolean),
    worldMapPeriod: "all_time",
    saleSummary: allowedSections.saleSummary,
    saleSummaryPeriod: "month",
    saleTracking: allowedSections.saleTracking,
    annualReport: allowedSections.annualSaleReport,
  });

  // Sync draft selection when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTempYear(year);
      setTempMonth(month);
      setTempCountry(country || null);
      setTempAccount(account || null);
      setIsCountryOpen(false);
      setIsAccountOpen(false);
      setCountrySearch("");
      setAccountSearch("");
    }
  }, [isOpen, year, month, country, account]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleDropdownClickOutside = (e: MouseEvent) => {
      if (
        countryDropdownRef.current &&
        !countryDropdownRef.current.contains(e.target as Node)
      ) {
        setIsCountryOpen(false);
      }
      if (
        accountDropdownRef.current &&
        !accountDropdownRef.current.contains(e.target as Node)
      ) {
        setIsAccountOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDropdownClickOutside);
    return () => document.removeEventListener("mousedown", handleDropdownClickOutside);
  }, []);

  // Click outside drawer and Escape listener
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isCountryOpen) {
          setIsCountryOpen(false);
        } else if (isAccountOpen) {
          setIsAccountOpen(false);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, isCountryOpen, isAccountOpen]);

  const availableYears = Array.from({ length: 11 }, (_, index) => currentYear - index);
  const hasChanged =
    tempMonth !== month ||
    tempYear !== year ||
    (tempCountry || null) !== (country || null) ||
    (tempAccount || null) !== (account || null);

  const selectedCountryObj = useMemo(() => {
    if (!tempCountry) return null;
    return (
      availableCountries.find(
        (c) =>
          c.code.toLowerCase() === tempCountry.toLowerCase() ||
          c.name.toLowerCase() === tempCountry.toLowerCase()
      ) || null
    );
  }, [tempCountry, availableCountries]);

  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return availableCountries;
    const q = countrySearch.toLowerCase().trim();
    return availableCountries.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [availableCountries, countrySearch]);

  const filteredAccounts = useMemo(() => {
    let list = availableAccounts;
    if (tempCountry) {
      const match = list.filter(
        (a) => a.countryCode?.toLowerCase() === tempCountry.toLowerCase()
      );
      if (match.length > 0) list = match;
    }
    if (!accountSearch.trim()) return list;
    const q = accountSearch.toLowerCase().trim();
    return list.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.countryName && a.countryName.toLowerCase().includes(q))
    );
  }, [availableAccounts, tempCountry, accountSearch]);

  const handleApply = () => {
    if (onApplyFilters) {
      onApplyFilters({
        month: tempMonth,
        year: tempYear,
        country: tempCountry || null,
        account: tempAccount || null,
      });
    } else {
      onChangePeriod(tempMonth, tempYear);
    }
    onClose();
  };

  const handleResetToCurrent = () => {
    setTempYear(currentYear);
    setTempMonth(currentMonth);
    setTempCountry(null);
    setTempAccount(null);
  };

  const activeFiltersCount = (tempCountry ? 1 : 0) + (tempAccount ? 1 : 0);

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
                {activeFiltersCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[11px] font-bold border border-amber-500/40">
                    {activeFiltersCount} active
                  </span>
                )}
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

          {/* Main Scrollable Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col min-h-0">
            {/* 2-Column Period (Left: Year, Right: Month) */}
            <div className="p-4">
              <div className="grid grid-cols-2 gap-2 h-[510px]">
                {/* Left Column: Year */}
                <div className="flex flex-col min-h-0 space-y-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-[#3A3B3C]">
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
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all cursor-pointer ${
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
                <div className="flex flex-col min-h-0 space-y-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-[#3A3B3C]">
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
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all cursor-pointer ${
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

            {/* Global Filters Section (Country & Account) */}
            <div className="px-5 sm:px-6 py-4 border-t border-[#3A3B3C] bg-[#1E1F20]/40 space-y-3 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Global Filters
                  </span>
                  <span className="text-[10px] text-slate-400">
                    (Applies to entire page)
                  </span>
                </div>
                {(tempCountry || tempAccount) && (
                  <button
                    type="button"
                    onClick={() => {
                      setTempCountry(null);
                      setTempAccount(null);
                    }}
                    className="text-[11px] font-medium text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                  >
                    Clear Filters
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Country Selector */}
                <div className="relative" ref={countryDropdownRef}>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Country
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCountryOpen((prev) => !prev);
                      setIsAccountOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs border transition-all cursor-pointer ${
                      tempCountry
                        ? "bg-[#3A3B3C] border-amber-500/60 text-amber-300 font-semibold"
                        : "bg-[#1E1F20] border-[#3A3B3C] text-slate-300 hover:border-[#4E4F50]"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">
                        {selectedCountryObj
                          ? `${selectedCountryObj.flag} ${selectedCountryObj.name}`
                          : "All Countries"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      {tempCountry && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setTempCountry(null);
                          }}
                          className="p-0.5 hover:text-white text-slate-400 cursor-pointer"
                          aria-label="Clear country filter"
                        >
                          <X className="w-3 h-3" />
                        </span>
                      )}
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                          isCountryOpen ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {/* Country Dropdown Popover */}
                  {isCountryOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#252728] border border-[#4E4F50] rounded-xl shadow-2xl p-2 space-y-1.5 animate-in fade-in zoom-in-95 duration-150">
                      <div className="relative">
                        <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search country..."
                          value={countrySearch}
                          onChange={(e) => setCountrySearch(e.target.value)}
                          className="w-full bg-[#1E1F20] border border-[#3A3B3C] rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#C7F33C]"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-44 overflow-y-auto space-y-1 custom-scrollbar">
                        <button
                          type="button"
                          onClick={() => {
                            setTempCountry(null);
                            setIsCountryOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                            !tempCountry
                              ? "bg-[#C7F33C] text-black font-semibold"
                              : "text-slate-300 hover:bg-[#3A3B3C]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span>🌐</span>
                            <span>All Countries</span>
                          </div>
                          {!tempCountry && <Check className="w-3 h-3 stroke-[3]" />}
                        </button>

                        {filteredCountries.map((c) => {
                          const isSelected =
                            tempCountry?.toLowerCase() === c.code.toLowerCase() ||
                            tempCountry?.toLowerCase() === c.name.toLowerCase();
                          return (
                            <button
                              key={c.code}
                              type="button"
                              onClick={() => {
                                setTempCountry(c.code);
                                setIsCountryOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                                isSelected
                                  ? "bg-amber-500 text-black font-bold"
                                  : "text-slate-300 hover:bg-[#3A3B3C]"
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span>{c.flag}</span>
                                <span className="truncate">{c.name}</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/20 text-inherit font-mono">
                                  {c.dealCount} deals
                                </span>
                                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Account Selector */}
                <div className="relative" ref={accountDropdownRef}>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Account
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAccountOpen((prev) => !prev);
                      setIsCountryOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs border transition-all cursor-pointer ${
                      tempAccount
                        ? "bg-[#3A3B3C] border-amber-500/60 text-amber-300 font-semibold"
                        : "bg-[#1E1F20] border-[#3A3B3C] text-slate-300 hover:border-[#4E4F50]"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">
                        {tempAccount || "All Accounts"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      {tempAccount && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setTempAccount(null);
                          }}
                          className="p-0.5 hover:text-white text-slate-400 cursor-pointer"
                          aria-label="Clear account filter"
                        >
                          <X className="w-3 h-3" />
                        </span>
                      )}
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                          isAccountOpen ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {/* Account Dropdown Popover */}
                  {isAccountOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#252728] border border-[#4E4F50] rounded-xl shadow-2xl p-2 space-y-1.5 animate-in fade-in zoom-in-95 duration-150">
                      <div className="relative">
                        <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search account..."
                          value={accountSearch}
                          onChange={(e) => setAccountSearch(e.target.value)}
                          className="w-full bg-[#1E1F20] border border-[#3A3B3C] rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#C7F33C]"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-44 overflow-y-auto space-y-1 custom-scrollbar">
                        <button
                          type="button"
                          onClick={() => {
                            setTempAccount(null);
                            setIsAccountOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                            !tempAccount
                              ? "bg-[#C7F33C] text-black font-semibold"
                              : "text-slate-300 hover:bg-[#3A3B3C]"
                          }`}
                        >
                          <span>👥 All Accounts</span>
                          {!tempAccount && <Check className="w-3 h-3 stroke-[3]" />}
                        </button>

                        {filteredAccounts.map((acc) => {
                          const isSelected =
                            tempAccount?.toLowerCase() === acc.name.toLowerCase() ||
                            tempAccount?.toLowerCase() === acc.id.toLowerCase();
                          return (
                            <button
                              key={acc.id}
                              type="button"
                              onClick={() => {
                                setTempAccount(acc.name);
                                setIsAccountOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                                isSelected
                                  ? "bg-amber-500 text-black font-bold"
                                  : "text-slate-300 hover:bg-[#3A3B3C]"
                              }`}
                            >
                              <div className="truncate text-left">
                                <span className="block truncate">{acc.name}</span>
                                {acc.countryName && (
                                  <span className="text-[10px] text-slate-400 block truncate font-normal">
                                    {acc.countryName}
                                  </span>
                                )}
                              </div>
                              {isSelected && <Check className="w-3 h-3 stroke-[3] shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Print Section */}
            <div className="px-5 sm:px-6 py-4 border-t border-[#3A3B3C] bg-[#1E1F20]/80 shrink-0 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Printer className="w-4 h-4 text-[#C7F33C]" />
                  <span className="text-xs font-bold text-slate-200">Print Report (A4)</span>
                </div>
                <span className="text-[11px] font-semibold text-[#C7F33C]">
                  {MONTHS[tempMonth - 1].slice(0, 3)} {tempYear}
                </span>
              </div>

              {/* Cohesive Section Cards */}
              <div className="space-y-2">
                {/* 1. World Map Card with colocated period options */}
                <div
                  className={`rounded-xl border p-2.5 transition-all ${
                    printSections.worldMap
                      ? "bg-[#252728] border-[#C7F33C]/60"
                      : "bg-[#1E1F20]/50 border-[#3A3B3C] opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none min-w-0">
                      <input
                        type="checkbox"
                        checked={printSections.worldMap}
                        onChange={(e) =>
                          setPrintSections((prev) => ({ ...prev, worldMap: e.target.checked }))
                        }
                        className="sr-only"
                      />
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                          printSections.worldMap
                            ? "bg-[#C7F33C] border-[#C7F33C] text-black"
                            : "border-[#4E4F50] bg-[#1E1F20]"
                        }`}
                      >
                        {printSections.worldMap && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                      <span className={`text-xs font-semibold truncate ${printSections.worldMap ? "text-slate-100" : "text-slate-400"}`}>
                        World Map
                      </span>
                    </label>

                    {/* Period Switcher directly inside World Map card */}
                    <div className="flex items-center gap-0.5 bg-[#1E1F20] p-0.5 rounded-lg border border-[#3A3B3C] shrink-0">
                      {([
                        ["all_time", "All Time"],
                        ["year", "Year"],
                        ["month", "Month"],
                      ] as const).map(([value, label]) => {
                        const isSelected = printSections.worldMapPeriod === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => {
                              setPrintSections((prev) => ({
                                ...prev,
                                worldMap: true,
                                worldMapPeriod: value,
                              }));
                            }}
                            className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all cursor-pointer ${
                              isSelected && printSections.worldMap
                                ? "bg-[#C7F33C] text-black"
                                : printSections.worldMap
                                  ? "text-slate-300 hover:text-white"
                                  : "text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 2. Sale Summary Card with colocated period options */}
                {allowedSections.saleSummary && (
                  <div
                    className={`rounded-xl border p-2.5 transition-all ${
                      printSections.saleSummary
                        ? "bg-[#252728] border-[#C7F33C]/60"
                        : "bg-[#1E1F20]/50 border-[#3A3B3C] opacity-60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none min-w-0">
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
                        <span className={`text-xs font-semibold truncate ${printSections.saleSummary ? "text-slate-100" : "text-slate-400"}`}>
                          Sale Summary
                        </span>
                      </label>

                      {/* Period Switcher directly inside Sale Summary card */}
                      <div className="flex items-center gap-0.5 bg-[#1E1F20] p-0.5 rounded-lg border border-[#3A3B3C] shrink-0">
                        {([
                          ["month", "Month"],
                          ["year", "Year"],
                        ] as const).map(([value, label]) => {
                          const isSelected = printSections.saleSummaryPeriod === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => {
                                setPrintSections((prev) => ({
                                  ...prev,
                                  saleSummary: true,
                                  saleSummaryPeriod: value,
                                }));
                              }}
                              className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all cursor-pointer ${
                                isSelected && printSections.saleSummary
                                  ? "bg-[#C7F33C] text-black"
                                  : printSections.saleSummary
                                    ? "text-slate-300 hover:text-white"
                                    : "text-slate-500 hover:text-slate-300"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Sale Tracking Card (Individual Row) */}
                {allowedSections.saleTracking && (
                  <label
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none text-xs ${
                      printSections.saleTracking
                        ? "bg-[#252728] border-[#C7F33C]/60 text-slate-100"
                        : "bg-[#1E1F20]/50 border-[#3A3B3C] text-slate-400 opacity-60 hover:text-slate-200"
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
                    <span className="font-semibold truncate">Sale Tracking</span>
                  </label>
                )}

                {/* 4. Annual Report Card (Individual Row) */}
                {allowedSections.annualSaleReport && (
                  <label
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none text-xs ${
                      printSections.annualReport
                        ? "bg-[#252728] border-[#C7F33C]/60 text-slate-100"
                        : "bg-[#1E1F20]/50 border-[#3A3B3C] text-slate-400 opacity-60 hover:text-slate-200"
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
                    <span className="font-semibold truncate">Annual Report</span>
                  </label>
                )}
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
                  !printSections.worldMap &&
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
          </div>

          {/* Footer Bar */}
          <div className="p-4 sm:p-5 border-t border-[#1C1C1D] bg-[#252728] flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={handleResetToCurrent}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer py-1.5 px-3 rounded-xl hover:bg-[#3A3B3C]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>

            <button
              type="button"
              onClick={handleApply}
              className="px-5 py-2 rounded-full bg-[#C7F33C] text-black font-semibold text-xs hover:bg-[#b0d635] transition-colors cursor-pointer shadow-sm"
            >
              {hasChanged ? "Apply Filters" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
