"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Search, X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { WorldMapReport, SalesDealRow } from "@/lib/dashboard/sales-overview";
import { WorldMapSvg } from "./WorldMapSvg";
import { getDashboardAccountDeals } from "@/lib/actions/dashboard";

interface WorldMapSectionProps {
  worldMap: WorldMapReport;
  year: number;
  month?: number;
  initialCountryCode?: string | null;
  onCountryFilterChange?: (countryCode: string | null) => void;
}

type MapPeriodMode = "all_time" | "year" | "month";

const PAGE_SIZE = 5;

function formatMoney(amount: number, currency = "THB") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDealMonth(dateString: string | null) {
  if (!dateString) return "No date";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "No date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

export function WorldMapSection({
  worldMap,
  year,
  month,
  initialCountryCode,
  onCountryFilterChange,
}: WorldMapSectionProps) {
  const [periodMode, setPeriodMode] = useState<MapPeriodMode>("all_time");

  // Level 1: Country selection
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(
    initialCountryCode ? initialCountryCode.toUpperCase() : null
  );
  const [displayedCountryCode, setDisplayedCountryCode] = useState<string | null>(
    initialCountryCode ? initialCountryCode.toUpperCase() : null
  );
  const [countrySearchQuery, setCountrySearchQuery] = useState("");
  const [isCountrySearchExpanded, setIsCountrySearchExpanded] = useState(false);
  const countrySearchContainerRef = useRef<HTMLDivElement | null>(null);
  const countrySearchInputRef = useRef<HTMLInputElement | null>(null);
  const [countryPage, setCountryPage] = useState(1);

  useEffect(() => {
    if (initialCountryCode) {
      setSelectedCountryCode(initialCountryCode.toUpperCase());
    } else {
      setSelectedCountryCode(null);
    }
  }, [initialCountryCode]);

  // Level 2: Account selection
  const [selectedAccountKey, setSelectedAccountKey] = useState<string | null>(null);
  const [displayedAccountKey, setDisplayedAccountKey] = useState<string | null>(null);
  const [accountSearchQuery, setAccountSearchQuery] = useState("");
  const [accountPage, setAccountPage] = useState(1);

  // Level 3: Deal search & pagination & on-demand caching
  const [dealSearchQuery, setDealSearchQuery] = useState("");
  const [dealPage, setDealPage] = useState(1);
  const [accountDealsCache, setAccountDealsCache] = useState<Record<string, SalesDealRow[]>>({});
  const [isLoadingDeals, setIsLoadingDeals] = useState(false);

  // Preserve displayed items so slide-out animations remain populated
  useEffect(() => {
    if (selectedCountryCode) {
      setDisplayedCountryCode(selectedCountryCode);
    }
  }, [selectedCountryCode]);

  useEffect(() => {
    if (selectedAccountKey) {
      setDisplayedAccountKey(selectedAccountKey);
    }
  }, [selectedAccountKey]);

  // Click outside listener: collapse if country search input is empty
  useEffect(() => {
    if (!isCountrySearchExpanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        countrySearchContainerRef.current &&
        !countrySearchContainerRef.current.contains(e.target as Node)
      ) {
        if (!countrySearchQuery.trim()) {
          setIsCountrySearchExpanded(false);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isCountrySearchExpanded, countrySearchQuery]);

  // Pressing Escape navigates back one level or closes search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isCountrySearchExpanded) {
          e.preventDefault();
          setCountrySearchQuery("");
          setCountryPage(1);
          setIsCountrySearchExpanded(false);
        } else if (selectedAccountKey) {
          e.preventDefault();
          handleSelectAccount(null);
        } else if (selectedCountryCode) {
          e.preventDefault();
          handleSelectCountry(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCountrySearchExpanded, selectedCountryCode, selectedAccountKey]);

  const currentPeriodData = useMemo(() => {
    if (periodMode === "month") {
      return (
        worldMap.selectedMonth || {
          totalCountries: 0,
          totalDeals: 0,
          totalAmount: 0,
          countries: [],
        }
      );
    }
    if (periodMode === "year") {
      return (
        worldMap.byYear[year] || {
          totalCountries: 0,
          totalDeals: 0,
          totalAmount: 0,
          countries: [],
        }
      );
    }
    return worldMap.allTime;
  }, [worldMap, periodMode, year]);

  const filteredCountries = useMemo(() => {
    const list = currentPeriodData.countries;
    if (!countrySearchQuery.trim()) return list;
    const q = countrySearchQuery.toLowerCase().trim();
    return list.filter(
      (c) =>
        c.countryName.toLowerCase().includes(q) ||
        c.countryCode.toLowerCase().includes(q)
    );
  }, [currentPeriodData, countrySearchQuery]);

  const activeCountry = useMemo(() => {
    const code = selectedCountryCode || displayedCountryCode;
    if (!code) return null;
    return (
      currentPeriodData.countries.find(
        (c) => c.countryCode.toUpperCase() === code.toUpperCase()
      ) || null
    );
  }, [currentPeriodData, selectedCountryCode, displayedCountryCode]);

  const filteredAccounts = useMemo(() => {
    if (!activeCountry) return [];
    const list = activeCountry.accounts || [];
    if (!accountSearchQuery.trim()) return list;
    const q = accountSearchQuery.toLowerCase().trim();
    return list.filter((a) => a.accountName.toLowerCase().includes(q));
  }, [activeCountry, accountSearchQuery]);

  const activeAccount = useMemo(() => {
    const key = selectedAccountKey || displayedAccountKey;
    if (!key || !activeCountry) return null;
    return (
      activeCountry.accounts.find(
        (a) => (a.companyId || a.accountName) === key
      ) || null
    );
  }, [activeCountry, selectedAccountKey, displayedAccountKey]);

  // On-demand fetch deals for selected account
  useEffect(() => {
    if (!selectedAccountKey || !activeAccount) return;
    const cacheKey = `${activeAccount.companyId || activeAccount.accountName}-${periodMode}-${year}-${month || ""}`;
    if (activeAccount.deals && activeAccount.deals.length > 0) {
      setAccountDealsCache((prev) => ({ ...prev, [cacheKey]: activeAccount.deals! }));
      return;
    }
    if (accountDealsCache[cacheKey]) return;

    let cancelled = false;
    setIsLoadingDeals(true);
    getDashboardAccountDeals({
      companyId: activeAccount.companyId,
      accountName: activeAccount.accountName,
      year: periodMode === "year" || periodMode === "month" ? year : undefined,
      month: periodMode === "month" ? month : undefined,
      mode: periodMode,
    })
      .then((deals) => {
        if (!cancelled) {
          setAccountDealsCache((prev) => ({ ...prev, [cacheKey]: deals }));
        }
      })
      .catch((err) => {
        console.error("Failed to load account deals:", err);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingDeals(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAccountKey, activeAccount, periodMode, year, month, accountDealsCache]);

  const currentAccountDeals = useMemo(() => {
    if (!activeAccount) return [];
    const cacheKey = `${activeAccount.companyId || activeAccount.accountName}-${periodMode}-${year}-${month || ""}`;
    return accountDealsCache[cacheKey] || activeAccount.deals || [];
  }, [activeAccount, accountDealsCache, periodMode, year, month]);

  const filteredDeals = useMemo(() => {
    if (!currentAccountDeals) return [];
    if (!dealSearchQuery.trim()) return currentAccountDeals;
    const q = dealSearchQuery.toLowerCase().trim();
    return currentAccountDeals.filter((d) => d.topic.toLowerCase().includes(q));
  }, [currentAccountDeals, dealSearchQuery]);

  // Pagination for countries
  const totalCountryPages = Math.max(1, Math.ceil(filteredCountries.length / PAGE_SIZE));
  const currentCountryPage = Math.min(countryPage, totalCountryPages);
  const countryStartIdx = (currentCountryPage - 1) * PAGE_SIZE;
  const paginatedCountries = filteredCountries.slice(
    countryStartIdx,
    countryStartIdx + PAGE_SIZE
  );

  // Pagination for accounts
  const totalAccountPages = Math.max(1, Math.ceil(filteredAccounts.length / PAGE_SIZE));
  const currentAccountPage = Math.min(accountPage, totalAccountPages);
  const accountStartIdx = (currentAccountPage - 1) * PAGE_SIZE;
  const paginatedAccounts = filteredAccounts.slice(
    accountStartIdx,
    accountStartIdx + PAGE_SIZE
  );

  // Pagination for deals
  const totalDealPages = Math.max(1, Math.ceil(filteredDeals.length / PAGE_SIZE));
  const currentDealPage = Math.min(dealPage, totalDealPages);
  const dealStartIdx = (currentDealPage - 1) * PAGE_SIZE;
  const paginatedDeals = filteredDeals.slice(
    dealStartIdx,
    dealStartIdx + PAGE_SIZE
  );

  const handlePeriodChange = (mode: MapPeriodMode) => {
    setPeriodMode(mode);
    setCountryPage(1);
    setAccountPage(1);
    setDealPage(1);
  };

  const handleSelectCountry = (code: string | null) => {
    setSelectedCountryCode(code);
    setSelectedAccountKey(null);
    setAccountPage(1);
    setAccountSearchQuery("");
    setDealPage(1);
    setDealSearchQuery("");
    onCountryFilterChange?.(code);
  };

  const handleSelectAccount = (key: string | null) => {
    setSelectedAccountKey(key);
    setDealPage(1);
    setDealSearchQuery("");
  };

  return (
    <section aria-labelledby="world-map-heading" className="space-y-4 p-2">
      {/* Section Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C7F33C]">
          World Map
        </p>
        <h2 id="world-map-heading" className="text-xl font-bold text-slate-100">
          Global Sales Distribution
        </h2>
      </div>

      {/* Main Grid: Left = Spacious World Map, Right = 3-Level Sliding Animated Panel Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Large, clean, borderless World Map */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col justify-center min-h-[440px]">
          <WorldMapSvg
            countrySales={currentPeriodData.countries}
            selectedCountryCode={selectedCountryCode}
            onSelectCountry={handleSelectCountry}
          />
        </div>

        {/* Right: Sliding 3-Level Drill-Down Container Card */}
        <div className="lg:col-span-5 xl:col-span-4">
          <article className="rounded-[1.5rem] border border-[#4E4F50] bg-[#3A3B3C] p-5 flex flex-col relative overflow-hidden min-h-[560px]">
            {/* ============================================================ */}
            {/* PANEL 1: LEVEL 1 - COUNTRIES LIST                            */}
            {/* ============================================================ */}
            <div
              className={`flex flex-col justify-between transition-all duration-300 ease-in-out ${
                selectedCountryCode
                  ? "opacity-0 -translate-x-full pointer-events-none absolute inset-5"
                  : "opacity-100 translate-x-0 relative flex-1"
              }`}
            >
              <div>
                {/* Card Header matching Waiting to Load */}
                <div className="flex items-start justify-between gap-4">

                  <div className="flex justify-between w-full items-center gap-2">
                    {/* Period Switcher Pill */}
                    <div className="flex items-center bg-[#252728] p-0.5 rounded-full border border-[#4E4F50]/80 text-[11px]">
                      <button
                        type="button"
                        onClick={() => handlePeriodChange("all_time")}
                        className={`px-2.5 py-0.5 font-semibold rounded-full transition-all cursor-pointer ${
                          periodMode === "all_time"
                            ? "bg-[#3A3B3C] text-slate-100"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePeriodChange("year")}
                        className={`px-2.5 py-0.5 font-semibold rounded-full transition-all cursor-pointer ${
                          periodMode === "year"
                            ? "bg-[#3A3B3C] text-slate-100"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        This Year
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePeriodChange("month")}
                        className={`px-2.5 py-0.5 font-semibold rounded-full transition-all cursor-pointer ${
                          periodMode === "month"
                            ? "bg-[#3A3B3C] text-slate-100"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        This Month
                      </button>
                    </div>

                    {/* Deals Count Badge */}
                    <span className="rounded-full px-2.5 py-1 text-xs font-bold shrink-0 bg-[#252728] text-slate-200">
                      {currentPeriodData.totalDeals}{" "}
                      {currentPeriodData.totalDeals === 1 ? "deal" : "deals"}
                    </span>
                  </div>
                </div>

                {/* Hero Total Amount */}
                <div className="mt-5">
                  <div className="text-xl font-bold tracking-tight text-slate-100">
                    {formatMoney(currentPeriodData.totalAmount, "THB")}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {currentPeriodData.totalCountries}{" "}
                    {currentPeriodData.totalCountries === 1
                      ? "country"
                      : "countries"}{" "}
                    reached
                  </p>
                </div>
              </div>

              {/* List Section */}
              <div className="pt-4 flex-1 flex flex-col justify-between space-y-2.5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 min-h-[32px]">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 shrink-0">
                      Countries ({filteredCountries.length})
                    </p>

                    {/* Expandable Search matching PipelineSearch */}
                    {!isCountrySearchExpanded ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCountrySearchExpanded(true);
                          setTimeout(() => countrySearchInputRef.current?.focus(), 50);
                        }}
                        className={`flex items-center justify-center w-7 h-7 rounded-full transition-all shrink-0 cursor-pointer ${
                          countrySearchQuery.trim()
                            ? "bg-[#252728] border border-[#C7F33C] text-[#C7F33C] shadow-sm"
                            : "bg-[#252728] border border-[#4E4F50] hover:border-slate-300 text-slate-400 hover:text-white"
                        }`}
                        title="Filter countries"
                        aria-label="Filter countries"
                      >
                        <Search className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <div
                        ref={countrySearchContainerRef}
                        className="flex items-center bg-[#252728] border border-[#C7F33C] rounded-full py-0.5 pl-2.5 pr-1.5 gap-1.5 w-44 sm:w-48 shrink-0 transition-all duration-200 ease-out shadow-lg animate-in fade-in zoom-in-95"
                      >
                        <Search className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />
                        <input
                          ref={countrySearchInputRef}
                          type="text"
                          className="flex-1 bg-transparent border-none outline-none text-xs text-slate-100 placeholder:text-slate-500 min-w-0"
                          placeholder="Filter countries..."
                          value={countrySearchQuery}
                          onChange={(e) => {
                            setCountrySearchQuery(e.target.value);
                            setCountryPage(1);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault();
                              e.stopPropagation();
                              setCountrySearchQuery("");
                              setCountryPage(1);
                              setIsCountrySearchExpanded(false);
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setCountrySearchQuery("");
                            setCountryPage(1);
                            setIsCountrySearchExpanded(false);
                          }}
                          className="text-slate-400 hover:text-slate-100 p-0.5 rounded-full hover:bg-[#3A3B3C] transition-colors shrink-0 cursor-pointer"
                          title="Close search"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Header: Region & Amount */}

                  {/* Country Rows */}
                  {filteredCountries.length === 0 ? (
                    <p className="text-xs py-6 text-center text-slate-500">
                      No country sales in this period
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {paginatedCountries.map((country, idx) => {
                        const rank = countryStartIdx + idx + 1;
                        const isSelected = selectedCountryCode === country.countryCode;

                        return (
                          <div
                            key={country.countryCode}
                            onClick={() =>
                              handleSelectCountry(country.countryCode)
                            }
                            className={`group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-xs transition-all cursor-pointer ${
                              isSelected
                                ? "bg-[#252728] border border-[#F59E0B] text-white shadow-sm"
                                : "bg-[#252728] hover:bg-[#2E3032] text-slate-100"
                            }`}
                          >
                            <div className="min-w-0 flex items-center gap-2.5 flex-1 pr-2">
                              <span className="text-slate-500 font-mono text-[11px] w-4 shrink-0 text-left">
                                {rank}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-slate-100 group-hover:text-white">
                                  {country.countryName}
                                </p>
                                <p className="truncate text-[10px] text-slate-500">
                                  {country.dealCount}{" "}
                                  {country.dealCount === 1 ? "deal" : "deals"}
                                  {country.accountCount > 0
                                    ? ` • ${country.accountCount} ${
                                        country.accountCount === 1
                                          ? "account"
                                          : "accounts"
                                      }`
                                    : ""}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="font-bold text-slate-100 text-xs">
                                {country.totalAmount > 0
                                  ? formatMoney(
                                      country.totalAmount,
                                      country.currency
                                    )
                                  : "—"}
                              </span>
                              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-200 transition-colors" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Pagination Underneath Countries */}
                {filteredCountries.length > 0 && (
                  <div className="flex items-center justify-end gap-3 text-xs text-slate-400 select-none">
                    <span className="font-mono text-[11px]">
                      {currentCountryPage} / {totalCountryPages}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={currentCountryPage <= 1}
                        onClick={() =>
                          setCountryPage((p) => Math.max(1, p - 1))
                        }
                        className="p-1 rounded-lg hover:bg-[#252728] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={currentCountryPage >= totalCountryPages}
                        onClick={() =>
                          setCountryPage((p) =>
                            Math.min(totalCountryPages, p + 1)
                          )
                        }
                        className="p-1 rounded-lg hover:bg-[#252728] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        aria-label="Next page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ============================================================ */}
            {/* PANEL 2: LEVEL 2 - ACCOUNTS LIST FOR SELECTED COUNTRY       */}
            {/* ============================================================ */}
            <div
              className={`flex flex-col justify-between transition-all duration-300 ease-in-out ${
                !selectedCountryCode
                  ? "opacity-0 translate-x-full pointer-events-none absolute inset-5"
                  : selectedAccountKey
                  ? "opacity-0 -translate-x-full pointer-events-none absolute inset-5"
                  : "opacity-100 translate-x-0 relative flex-1"
              }`}
            >
              {activeCountry ? (
                <>
                  <div>
                    {/* Header with Back Button and Badges */}
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => handleSelectCountry(null)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#252728] px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#2E3032] border border-[#4E4F50]/80 transition-all cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>All Countries</span>
                        <kbd className="hidden sm:inline-block ml-1 text-[10px] font-mono text-slate-500 bg-[#1C1D1E] px-1 rounded border border-[#4E4F50]/50">
                          Esc
                        </kbd>
                      </button>

                      <div className="flex items-center gap-2">
                        <span className="rounded-full px-2.5 py-1 text-xs font-bold shrink-0 bg-[#252728] text-[#F59E0B] border border-[#F59E0B]/20">
                          {activeCountry.dealCount}{" "}
                          {activeCountry.dealCount === 1 ? "deal" : "deals"}
                        </span>
                      </div>
                    </div>

                    {/* Hero Total for Selected Country */}
                    <div className="mt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F59E0B]">
                        ACCOUNTS IN
                      </p>
                      <h3 className="text-lg font-bold tracking-tight text-slate-100 truncate">
                        {activeCountry.countryName}
                      </h3>
                      <div className="text-xl font-bold tracking-tight text-white">
                        {formatMoney(activeCountry.totalAmount, activeCountry.currency)}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {activeCountry.accounts.length}{" "}
                        {activeCountry.accounts.length === 1 ? "account" : "accounts"}
                      </p>
                    </div>
                  </div>

                  {/* Accounts List Section */}
                  <div className="pt-1.5 flex-1 flex flex-col justify-between space-y-2.5">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Accounts ({filteredAccounts.length})
                        </p>
                      </div>

                      {/* Compact Search Input for Accounts */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={accountSearchQuery}
                          onChange={(e) => {
                            setAccountSearchQuery(e.target.value);
                            setAccountPage(1);
                          }}
                          placeholder="Filter accounts..."
                          className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl pl-8 pr-7 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#C7F33C]/60 transition-colors"
                        />
                        {accountSearchQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setAccountSearchQuery("");
                              setAccountPage(1);
                            }}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Account Rows (Drillable on click) */}
                      {filteredAccounts.length === 0 ? (
                        <p className="text-xs py-6 text-center text-slate-500">
                          No accounts found
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {paginatedAccounts.map((account, idx) => {
                            const rank = accountStartIdx + idx + 1;
                            const accountKey = account.companyId || account.accountName;

                            return (
                              <div
                                key={accountKey}
                                onClick={() => handleSelectAccount(accountKey)}
                                className="group flex items-center justify-between gap-3 rounded-xl bg-[#252728] px-3 py-2.5 text-xs text-slate-100 transition-all hover:bg-[#2E3032] cursor-pointer"
                              >
                                <div className="min-w-0 flex items-center gap-2.5 flex-1 pr-2">
                                  <span className="text-slate-500 font-mono text-[11px] w-4 shrink-0 text-left">
                                    {rank}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-slate-100 group-hover:text-white">
                                      {account.accountName}
                                    </p>
                                    <p className="truncate text-[10px] text-slate-500">
                                      {account.dealCount}{" "}
                                      {account.dealCount === 1 ? "deal" : "deals"}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="font-bold text-slate-100 text-xs">
                                    {account.totalAmount > 0
                                      ? formatMoney(
                                          account.totalAmount,
                                          account.currency
                                        )
                                      : "—"}
                                  </span>
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-200 transition-colors" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Pagination Underneath Accounts */}
                    {filteredAccounts.length > 0 && (
                      <div className="flex items-center justify-end gap-3 text-xs text-slate-400 select-none">
                        <span className="font-mono text-[11px]">
                          {currentAccountPage} / {totalAccountPages}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={currentAccountPage <= 1}
                            onClick={() =>
                              setAccountPage((p) => Math.max(1, p - 1))
                            }
                            className="p-1 rounded-lg hover:bg-[#252728] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                            aria-label="Previous page"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={currentAccountPage >= totalAccountPages}
                            onClick={() =>
                              setAccountPage((p) =>
                                Math.min(totalAccountPages, p + 1)
                              )
                            }
                            className="p-1 rounded-lg hover:bg-[#252728] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                            aria-label="Next page"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-xs text-slate-500">
                  No country selected
                </div>
              )}
            </div>

            {/* ============================================================ */}
            {/* PANEL 3: LEVEL 3 - DEALS LIST FOR SELECTED ACCOUNT           */}
            {/* ============================================================ */}
            <div
              className={`flex flex-col justify-between transition-all duration-300 ease-in-out ${
                selectedCountryCode && selectedAccountKey
                  ? "opacity-100 translate-x-0 relative flex-1"
                  : "opacity-0 translate-x-full pointer-events-none absolute inset-5"
              }`}
            >
              {activeAccount ? (
                <>
                  <div>
                    {/* Header with Back Button and Badges */}
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => handleSelectAccount(null)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#252728] px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#2E3032] border border-[#4E4F50]/80 transition-all cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span className="truncate max-w-[140px]">
                          {activeCountry?.countryName || "Accounts"}
                        </span>
                        <kbd className="hidden sm:inline-block ml-1 text-[10px] font-mono text-slate-500 bg-[#1C1D1E] px-1 rounded border border-[#4E4F50]/50">
                          Esc
                        </kbd>
                      </button>

                      <div className="flex items-center gap-2">
                        <span className="rounded-full px-2.5 py-1 text-xs font-bold shrink-0 bg-[#252728] text-[#F59E0B] border border-[#F59E0B]/20">
                          {activeAccount.dealCount}{" "}
                          {activeAccount.dealCount === 1 ? "deal" : "deals"}
                        </span>
                      </div>
                    </div>

                    {/* Hero Total for Selected Account */}
                    <div className="mt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F59E0B]">
                        DEALS IN ACCOUNT
                      </p>
                      <h3 className="text-lg font-bold tracking-tight text-slate-100 truncate">
                        {activeAccount.accountName}
                      </h3>
                      <div className="text-xl font-bold tracking-tight text-white">
                        {formatMoney(activeAccount.totalAmount, activeAccount.currency)}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {activeAccount.dealCount}{" "}
                        {activeAccount.dealCount === 1 ? "deal" : "deals"} •{" "}
                        {activeCountry?.countryName}
                      </p>
                    </div>
                  </div>

                  {/* Deals List Section */}
                  <div className="pt-1.5 flex-1 flex flex-col justify-between space-y-2.5">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Deals ({filteredDeals.length})
                        </p>
                      </div>

                      {/* Compact Search Input for Deals */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={dealSearchQuery}
                          onChange={(e) => {
                            setDealSearchQuery(e.target.value);
                            setDealPage(1);
                          }}
                          placeholder="Filter deals..."
                          className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl pl-8 pr-7 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#C7F33C]/60 transition-colors"
                        />
                        {dealSearchQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setDealSearchQuery("");
                              setDealPage(1);
                            }}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>



                      {/* Deal Rows (Sorted Latest First with Loading Month) */}
                      {isLoadingDeals && currentAccountDeals.length === 0 ? (
                        <div className="space-y-1.5 py-1">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="h-[46px] rounded-xl bg-[#252728] animate-pulse" />
                          ))}
                        </div>
                      ) : filteredDeals.length === 0 ? (
                        <p className="text-xs py-6 text-center text-slate-500">
                          No deals found
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {paginatedDeals.map((deal, idx) => {
                            const rank = dealStartIdx + idx + 1;

                            return (
                              <div
                                key={deal.id}
                                className="group flex items-center justify-between gap-3 rounded-xl bg-[#252728] px-3 py-2.5 text-xs text-slate-100 transition-all hover:bg-[#2E3032]"
                              >
                                <div className="min-w-0 flex items-center gap-2.5 flex-1 pr-2">
                                  <span className="text-slate-500 font-mono text-[11px] w-4 shrink-0 text-left">
                                    {rank}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-slate-100 group-hover:text-white">
                                      {deal.topic}
                                    </p>
                                    <p className="truncate text-[10px] text-slate-400 mt-0.5">
                                      {formatDealMonth(deal.loadingDate)}
                                    </p>
                                  </div>
                                </div>

                                <span className="shrink-0 font-bold text-slate-100 text-xs">
                                  {deal.amount !== null && deal.amount > 0
                                    ? formatMoney(deal.amount, deal.currency)
                                    : "—"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Pagination Underneath Deals */}
                    {filteredDeals.length > 0 && (
                      <div className="flex items-center justify-end gap-3 text-xs text-slate-400 select-none">
                        <span className="font-mono text-[11px]">
                          {currentDealPage} / {totalDealPages}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={currentDealPage <= 1}
                            onClick={() =>
                              setDealPage((p) => Math.max(1, p - 1))
                            }
                            className="p-1 rounded-lg hover:bg-[#252728] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                            aria-label="Previous page"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={currentDealPage >= totalDealPages}
                            onClick={() =>
                              setDealPage((p) =>
                                Math.min(totalDealPages, p + 1)
                              )
                            }
                            className="p-1 rounded-lg hover:bg-[#252728] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                            aria-label="Next page"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-xs text-slate-500">
                  No account selected
                </div>
              )}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
