"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  X,
  SlidersHorizontal,
  RotateCcw,
  Search,
  Building2,
  Globe,
  Plus,
} from "lucide-react";
import { ContactType } from "@prisma/client";

export interface AccountFiltersState {
  status?: "QUALIFIED" | "UNQUALIFIED" | "ALL";
  type: ContactType | "ALL";
  country: string;
  minRating: number;
}

interface AccountFilterContentProps {
  activeTab: "QUALIFIED" | "UNQUALIFIED";
  onTabChange: (tab: "QUALIFIED" | "UNQUALIFIED") => void;
  activeType: ContactType | "ALL";
  onTypeChange: (type: ContactType | "ALL") => void;
  availableTypes: { type: ContactType; count: number }[];
  activeCountry: string;
  onCountryChange: (country: string) => void;
  availableCountries: { country: string; count: number }[];
  stats: { qualifiedCount: number; unqualifiedCount: number; totalCount: number };
  activeFilterCount: number;
  onResetFilters: () => void;
  onOpenCreateAccount?: () => void;
  onClose?: () => void;
}

const TYPE_LABEL_MAP: Record<string, string> = {
  CUSTOMER: "CUSTOMER",
  TRADER: "TRADING",
  SHIPPING: "SHIPPING",
  MY_OFFICE: "MY OFFICE",
  SUPPLIER: "SUPPLIER",
  PARTNER: "PARTNER",
  OTHER: "OTHER",
};

function formatTypeLabel(type: string): string {
  return TYPE_LABEL_MAP[type] || type.replace(/_/g, " ").toUpperCase();
}

const DEFAULT_COUNTRIES = [
  "Thailand",
  "Vietnam",
  "Laos",
  "Cambodia",
  "China",
  "USA",
  "Japan",
  "Singapore",
];

export function AccountFilterContent({
  activeTab,
  onTabChange,
  activeType,
  onTypeChange,
  availableTypes,
  activeCountry,
  onCountryChange,
  availableCountries,
  stats,
  activeFilterCount,
  onResetFilters,
  onOpenCreateAccount,
  onClose,
}: AccountFilterContentProps) {
  const [countrySearch, setCountrySearch] = useState("");
  const q = countrySearch.trim().toLowerCase();

  // Total count across all types
  const totalTypeCount = useMemo(() => {
    return availableTypes.reduce((sum, t) => sum + t.count, 0);
  }, [availableTypes]);

  // Country counts map
  const countryCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of availableCountries) {
      if (c.country && c.country.trim()) {
        map.set(c.country.trim().toUpperCase(), c.count);
      }
    }
    return map;
  }, [availableCountries]);

  const totalCountryCount = useMemo(() => {
    return availableCountries.reduce((sum, c) => sum + c.count, 0);
  }, [availableCountries]);

  // Normalized country options
  const countryList = useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();

    for (const c of availableCountries) {
      if (c.country && c.country.trim()) {
        const canonical = c.country.trim();
        const upper = canonical.toUpperCase();
        if (!seen.has(upper)) {
          seen.add(upper);
          list.push(canonical);
        }
      }
    }
    for (const d of DEFAULT_COUNTRIES) {
      const upper = d.toUpperCase();
      if (!seen.has(upper)) {
        seen.add(upper);
        list.push(d);
      }
    }
    return list;
  }, [availableCountries]);

  const filteredCountries = useMemo(() => {
    if (!q) return countryList;
    return countryList.filter((c) => c.toLowerCase().includes(q));
  }, [countryList, q]);

  const isAllCountryActive =
    !activeCountry || activeCountry.trim().toUpperCase() === "ALL";

  return (
    <div className="flex flex-col gap-6 select-none">
      {/* Top Action: + Add Account */}
      {onOpenCreateAccount && (
        <div className="w-full">
          <button
            type="button"
            onClick={() => {
              onClose?.();
              onOpenCreateAccount();
            }}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-none"
          >
            <Plus className="w-4 h-4 text-black" />
            <span>Add Account</span>
          </button>
        </div>
      )}

      {/* Section 1: Qualification Status */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider pl-1">
          Qualification Status
        </label>
        <div className="grid grid-cols-2 gap-2 bg-[#1C1C1D] p-1 rounded-xl">
          <button
            type="button"
            onClick={() => onTabChange("QUALIFIED")}
            className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "QUALIFIED"
                ? "bg-[#3A3B3C] text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>QUALIFIED</span>
            <span className="text-[11px] opacity-70">({stats.qualifiedCount})</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange("UNQUALIFIED")}
            className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "UNQUALIFIED"
                ? "bg-[#3A3B3C] text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>UNQUALIFIED</span>
            <span className="text-[11px] opacity-70">({stats.unqualifiedCount})</span>
          </button>
        </div>
      </div>

      {/* Section 2: Account Type */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider pl-1">
          Account Type
        </label>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => onTypeChange("ALL")}
            className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-xl transition-colors cursor-pointer ${
              activeType === "ALL"
                ? "bg-[#C7F33C] text-black"
                : "bg-[#1C1C1D] hover:bg-[#3A3B3C] text-slate-300"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Building2 className="w-4 h-4" />
              <span className="font-bold text-xs">ALL TYPE</span>
            </div>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                activeType === "ALL"
                  ? "bg-black/15 text-black"
                  : "bg-[#252728] text-slate-400"
              }`}
            >
              {totalTypeCount}
            </span>
          </button>

          {availableTypes.map((t) => {
            const isActive = activeType === t.type;
            return (
              <button
                key={t.type}
                type="button"
                onClick={() => onTypeChange(t.type)}
                className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-xl transition-colors cursor-pointer ${
                  isActive
                    ? "bg-[#C7F33C] text-black"
                    : "bg-[#1C1C1D] hover:bg-[#3A3B3C] text-slate-300"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-4 h-4" />
                  <span className="font-bold text-xs">{formatTypeLabel(t.type)}</span>
                </div>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    isActive
                      ? "bg-black/15 text-black"
                      : "bg-[#252728] text-slate-400"
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 3: Country */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider pl-1">
          Country
        </label>

        {/* Country Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={countrySearch}
            onChange={(e) => setCountrySearch(e.target.value)}
            placeholder="Search country..."
            className="w-full bg-[#1C1C1D] border border-transparent rounded-xl pl-9 pr-8 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-[#C7F33C] transition-all"
          />
          {countrySearch && (
            <button
              type="button"
              onClick={() => setCountrySearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Country List */}
        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto hide-scrollbar">
          <button
            type="button"
            onClick={() => onCountryChange("ALL")}
            className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-xl transition-colors cursor-pointer ${
              isAllCountryActive
                ? "bg-[#C7F33C] text-black"
                : "bg-[#1C1C1D] hover:bg-[#3A3B3C] text-slate-300"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Globe className="w-4 h-4" />
              <span className="font-bold text-xs">ALL COUNTRY</span>
            </div>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                isAllCountryActive
                  ? "bg-black/15 text-black"
                  : "bg-[#252728] text-slate-400"
              }`}
            >
              {totalCountryCount}
            </span>
          </button>

          {filteredCountries.map((countryName) => {
            const isActive =
              !isAllCountryActive &&
              activeCountry.trim().toUpperCase() === countryName.trim().toUpperCase();
            const count = countryCountMap.get(countryName.trim().toUpperCase()) ?? 0;

            return (
              <button
                key={countryName}
                type="button"
                onClick={() => onCountryChange(countryName)}
                className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-xl transition-colors cursor-pointer ${
                  isActive
                    ? "bg-[#C7F33C] text-black"
                    : "bg-[#1C1C1D] hover:bg-[#3A3B3C] text-slate-300"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4" />
                  <span className="font-bold text-xs">{countryName.toUpperCase()}</span>
                </div>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    isActive
                      ? "bg-black/15 text-black"
                      : "bg-[#252728] text-slate-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Reset Filters Action */}
      {activeFilterCount > 0 && (
        <div className="pt-2 border-t border-[#1C1C1D]">
          <button
            type="button"
            onClick={onResetFilters}
            className="w-full py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All Filters</span>
          </button>
        </div>
      )}
    </div>
  );
}

interface AccountFiltersDrawerProps extends AccountFilterContentProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccountFiltersDrawer({
  isOpen,
  onClose,
  ...contentProps
}: AccountFiltersDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

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
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Floating Drawer Card (matches PipelineFiltersDrawer style) */}
      <div
        className={`fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[450px] md:max-w-[calc(100vw-32px)] z-[101] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right ${
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
                <h2 className="text-xl font-bold text-slate-100">Manage & Filters</h2>
                {contentProps.activeFilterCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#C7F33C] text-black text-[11px] font-bold">
                    {contentProps.activeFilterCount} Active
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

          {/* Scrollable Filters Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <AccountFilterContent {...contentProps} onClose={onClose} />
          </div>
        </div>
      </div>
    </>
  );
}
