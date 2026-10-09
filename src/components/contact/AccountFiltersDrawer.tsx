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
  Check,
} from "lucide-react";
import { ContactType } from "@prisma/client";
import { normalizeCountryName } from "@/lib/data/countries";

export interface AccountFiltersState {
  status?: "QUALIFIED" | "UNQUALIFIED" | "ALL";
  type: ContactType | "ALL";
  country: string;
  minRating: number;
}

export interface AccountFilterContentProps {
  activeTab: "QUALIFIED" | "UNQUALIFIED";
  onTabChange: (tab: "QUALIFIED" | "UNQUALIFIED") => void;

  // Multi-select props (Primary)
  selectedTypes?: string[];
  onToggleType?: (type: string) => void;
  onClearTypes?: () => void;
  onSelectTypes?: (types: string[]) => void;
  availableTypes: { type: ContactType; count: number }[];

  selectedCountries?: string[];
  onToggleCountry?: (country: string) => void;
  onClearCountries?: () => void;
  onSelectCountries?: (countries: string[]) => void;
  availableCountries: { country: string; count: number }[];

  // Backward compatibility / Single-select fallbacks
  activeType?: ContactType | "ALL";
  onTypeChange?: (type: ContactType | "ALL") => void;
  activeCountry?: string;
  onCountryChange?: (country: string) => void;

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

  selectedTypes = [],
  onToggleType,
  onClearTypes,
  onSelectTypes,
  availableTypes = [],

  selectedCountries = [],
  onToggleCountry,
  onClearCountries,
  onSelectCountries,
  availableCountries = [],

  // Legacy fallback props
  activeType = "ALL",
  onTypeChange,
  activeCountry = "ALL",
  onCountryChange,

  stats,
  activeFilterCount,
  onResetFilters,
  onOpenCreateAccount,
  onClose,
}: AccountFilterContentProps) {
  const [countrySearch, setCountrySearch] = useState("");
  const countryQ = countrySearch.trim().toLowerCase();

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
    if (!countryQ) return countryList;
    return countryList.filter((c) => c.toLowerCase().includes(countryQ));
  }, [countryList, countryQ]);

  // ==========================================
  // TYPE SELECTION STATE & ACTIONS (Select All / Deselect)
  // ==========================================
  const allTypeNames = useMemo(
    () => availableTypes.map((t) => t.type),
    [availableTypes]
  );

  const isNoneTypesActive =
    selectedTypes.length === 1 && selectedTypes[0] === "__NONE__";
  const isAllTypesActive =
    !isNoneTypesActive &&
    (selectedTypes.length === 0 ||
      (availableTypes.length > 0 && selectedTypes.length >= availableTypes.length));

  const typeSelectedCount = isNoneTypesActive
    ? 0
    : isAllTypesActive
    ? availableTypes.length
    : selectedTypes.length;

  const isTypeChecked = (typeName: string) => {
    if (isNoneTypesActive) return false;
    if (isAllTypesActive) return true;
    return selectedTypes.some((st) => st.toLowerCase() === typeName.toLowerCase());
  };

  const handleToggleSingleType = (typeName: string) => {
    if (isAllTypesActive) {
      // User is deselecting this type from the full set
      const remaining = allTypeNames.filter(
        (name) => name.toLowerCase() !== typeName.toLowerCase()
      );
      if (onSelectTypes) {
        onSelectTypes(remaining);
      } else if (onToggleType) {
        onToggleType(typeName);
      } else {
        onTypeChange?.(typeName as ContactType);
      }
    } else if (isNoneTypesActive) {
      // Starting from empty, select only this type
      if (onSelectTypes) {
        onSelectTypes([typeName]);
      } else if (onToggleType) {
        onToggleType(typeName);
      } else {
        onTypeChange?.(typeName as ContactType);
      }
    } else {
      const isCurrentlyChecked = selectedTypes.some(
        (st) => st.toLowerCase() === typeName.toLowerCase()
      );
      if (isCurrentlyChecked) {
        const next = selectedTypes.filter(
          (st) => st.toLowerCase() !== typeName.toLowerCase()
        );
        const resolvedNext = next.length === 0 ? ["__NONE__"] : next;
        if (onSelectTypes) {
          onSelectTypes(resolvedNext);
        } else if (onToggleType) {
          onToggleType(typeName);
        } else {
          onTypeChange?.("ALL");
        }
      } else {
        const next = [...selectedTypes, typeName];
        const resolvedNext =
          next.length >= availableTypes.length ? [] : next;
        if (onSelectTypes) {
          onSelectTypes(resolvedNext);
        } else if (onToggleType) {
          onToggleType(typeName);
        } else {
          onTypeChange?.(typeName as ContactType);
        }
      }
    }
  };

  const handleToggleAllTypes = () => {
    if (isAllTypesActive) {
      // Deselect all
      if (onSelectTypes) {
        onSelectTypes(["__NONE__"]);
      } else if (onClearTypes) {
        onClearTypes();
      } else {
        onTypeChange?.("ALL");
      }
    } else {
      // Select all
      if (onSelectTypes) {
        onSelectTypes([]);
      } else if (onClearTypes) {
        onClearTypes();
      } else {
        onTypeChange?.("ALL");
      }
    }
  };

  // ==========================================
  // COUNTRY SELECTION STATE & ACTIONS (Select All / Deselect)
  // ==========================================
  const allCountryNames = countryList;

  const isNoneCountriesActive =
    selectedCountries.length === 1 && selectedCountries[0] === "__NONE__";
  const isAllCountriesActive =
    !isNoneCountriesActive &&
    (selectedCountries.length === 0 ||
      (allCountryNames.length > 0 && selectedCountries.length >= allCountryNames.length));

  const countrySelectedCount = isNoneCountriesActive
    ? 0
    : isAllCountriesActive
    ? allCountryNames.length
    : selectedCountries.length;

  const isCountryChecked = (countryName: string) => {
    if (isNoneCountriesActive) return false;
    if (isAllCountriesActive) return true;
    const norm = normalizeCountryName(countryName).toLowerCase();
    const cLower = countryName.toLowerCase();
    return selectedCountries.some((sc) => {
      const scLower = sc.toLowerCase();
      const scNorm = normalizeCountryName(sc).toLowerCase();
      return scLower === cLower || scNorm === norm;
    });
  };

  const handleToggleSingleCountry = (countryName: string) => {
    if (isAllCountriesActive) {
      // User is deselecting this country from the full set
      const remaining = allCountryNames.filter(
        (name) => name.toLowerCase() !== countryName.toLowerCase()
      );
      if (onSelectCountries) {
        onSelectCountries(remaining);
      } else if (onToggleCountry) {
        onToggleCountry(countryName);
      } else {
        onCountryChange?.(countryName);
      }
    } else if (isNoneCountriesActive) {
      // Starting from empty, select only this country
      if (onSelectCountries) {
        onSelectCountries([countryName]);
      } else if (onToggleCountry) {
        onToggleCountry(countryName);
      } else {
        onCountryChange?.(countryName);
      }
    } else {
      const isCurrentlyChecked = isCountryChecked(countryName);
      if (isCurrentlyChecked) {
        const norm = normalizeCountryName(countryName).toLowerCase();
        const cLower = countryName.toLowerCase();
        const next = selectedCountries.filter((sc) => {
          const scLower = sc.toLowerCase();
          const scNorm = normalizeCountryName(sc).toLowerCase();
          return scLower !== cLower && scNorm !== norm;
        });
        const resolvedNext = next.length === 0 ? ["__NONE__"] : next;
        if (onSelectCountries) {
          onSelectCountries(resolvedNext);
        } else if (onToggleCountry) {
          onToggleCountry(countryName);
        } else {
          onCountryChange?.("ALL");
        }
      } else {
        const next = [...selectedCountries, countryName];
        const resolvedNext =
          next.length >= allCountryNames.length ? [] : next;
        if (onSelectCountries) {
          onSelectCountries(resolvedNext);
        } else if (onToggleCountry) {
          onToggleCountry(countryName);
        } else {
          onCountryChange?.(countryName);
        }
      }
    }
  };

  const handleToggleAllCountries = () => {
    if (isAllCountriesActive) {
      // Deselect all
      if (onSelectCountries) {
        onSelectCountries(["__NONE__"]);
      } else if (onClearCountries) {
        onClearCountries();
      } else {
        onCountryChange?.("ALL");
      }
    } else {
      // Select all
      if (onSelectCountries) {
        onSelectCountries([]);
      } else if (onClearCountries) {
        onClearCountries();
      } else {
        onCountryChange?.("ALL");
      }
    }
  };

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
        <div className="flex items-center justify-between pl-1">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Account Type
          </label>
          {!isAllTypesActive && (
            <button
              type="button"
              onClick={() => onSelectTypes ? onSelectTypes([]) : onTypeChange?.("ALL")}
              className="text-[10px] text-slate-400 hover:text-[#C7F33C] underline cursor-pointer"
            >
              Reset ({typeSelectedCount})
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1">
          {/* Header Row: ALL TYPES */}
          <button
            type="button"
            onClick={handleToggleAllTypes}
            className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-xl transition-colors cursor-pointer border ${
              isAllTypesActive
                ? "bg-[#2D2E30] border-[#4E5052] text-slate-100 hover:bg-[#343638]"
                : typeSelectedCount > 0
                ? "bg-[#252728] border-[#3E4042] text-slate-200 hover:bg-[#2C2D2F]"
                : "bg-[#1C1C1D] border-transparent hover:bg-[#252728] text-slate-400"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
                  isAllTypesActive
                    ? "bg-[#242D16] border-[#7E9E26] text-[#C7F33C]"
                    : typeSelectedCount > 0
                    ? "bg-[#242D16] border-[#7E9E26] text-[#C7F33C]"
                    : "border-slate-600 bg-[#1E2021] hover:border-slate-400"
                }`}
              >
                {isAllTypesActive && <Check className="w-3 h-3 stroke-[2.5]" />}
                {!isAllTypesActive && typeSelectedCount > 0 && (
                  <div className="w-2 h-0.5 bg-[#C7F33C] rounded-full" />
                )}
              </div>
              <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-xs font-black uppercase tracking-wider">
                {isAllTypesActive ? "ALL TYPES" : "SELECT ALL"}
              </span>
              {typeSelectedCount > 0 && (
                <span className="text-[10.5px] px-2 py-0.5 rounded-full font-semibold bg-[#262F16] text-[#B8E62C] border border-[#4D631B] tabular-nums">
                  {typeSelectedCount} selected
                </span>
              )}
            </div>
            <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-[#1E2021] text-slate-400">
              {totalTypeCount}
            </span>
          </button>

          {/* Individual Types */}
          {availableTypes.map((t) => {
            const isChecked = isTypeChecked(t.type);
            return (
              <button
                key={t.type}
                type="button"
                onClick={() => handleToggleSingleType(t.type)}
                className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-xl transition-colors cursor-pointer ${
                  isChecked
                    ? "bg-transparent hover:bg-[#2D2E30] text-slate-200"
                    : "bg-transparent hover:bg-[#252627] text-slate-500 hover:text-slate-300"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
                      isChecked
                        ? "bg-[#242D16] border-[#688523] text-[#C7F33C]"
                        : "border-slate-600/70 bg-[#1E2021]"
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[2.5]" />}
                  </div>
                  <span className={`text-xs ${isChecked ? "font-normal text-slate-200" : "font-normal text-slate-500"}`}>
                    {formatTypeLabel(t.type)}
                  </span>
                </div>
                <span
                  className={`text-[11px] font-normal px-2 py-0.5 rounded-full ${
                    isChecked
                      ? "bg-[#1E2021] text-slate-400"
                      : "bg-transparent text-slate-600"
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
        <div className="flex items-center justify-between pl-1">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Country
          </label>
          {!isAllCountriesActive && (
            <button
              type="button"
              onClick={() => onSelectCountries ? onSelectCountries([]) : onCountryChange?.("ALL")}
              className="text-[10px] text-slate-400 hover:text-[#C7F33C] underline cursor-pointer"
            >
              Reset ({countrySelectedCount})
            </button>
          )}
        </div>

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
          {/* Header Row: ALL COUNTRIES */}
          <button
            type="button"
            onClick={handleToggleAllCountries}
            className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-xl transition-colors cursor-pointer border ${
              isAllCountriesActive
                ? "bg-[#2D2E30] border-[#4E5052] text-slate-100 hover:bg-[#343638]"
                : countrySelectedCount > 0
                ? "bg-[#252728] border-[#3E4042] text-slate-200 hover:bg-[#2C2D2F]"
                : "bg-[#1C1C1D] border-transparent hover:bg-[#252728] text-slate-400"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
                  isAllCountriesActive
                    ? "bg-[#242D16] border-[#7E9E26] text-[#C7F33C]"
                    : countrySelectedCount > 0
                    ? "bg-[#242D16] border-[#7E9E26] text-[#C7F33C]"
                    : "border-slate-600 bg-[#1E2021] hover:border-slate-400"
                }`}
              >
                {isAllCountriesActive && <Check className="w-3 h-3 stroke-[2.5]" />}
                {!isAllCountriesActive && countrySelectedCount > 0 && (
                  <div className="w-2 h-0.5 bg-[#C7F33C] rounded-full" />
                )}
              </div>
              <Globe className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-xs font-black uppercase tracking-wider">
                {isAllCountriesActive ? "ALL COUNTRIES" : "SELECT ALL"}
              </span>
              {countrySelectedCount > 0 && (
                <span className="text-[10.5px] px-2 py-0.5 rounded-full font-semibold bg-[#262F16] text-[#B8E62C] border border-[#4D631B] tabular-nums">
                  {countrySelectedCount} selected
                </span>
              )}
            </div>
            <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-[#1E2021] text-slate-400">
              {totalCountryCount}
            </span>
          </button>

          {/* Individual Countries */}
          {filteredCountries.map((countryName) => {
            const isChecked = isCountryChecked(countryName);
            const count = countryCountMap.get(countryName.trim().toUpperCase()) ?? 0;

            return (
              <button
                key={countryName}
                type="button"
                onClick={() => handleToggleSingleCountry(countryName)}
                className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-xl transition-colors cursor-pointer ${
                  isChecked
                    ? "bg-transparent hover:bg-[#2D2E30] text-slate-200"
                    : "bg-transparent hover:bg-[#252627] text-slate-500 hover:text-slate-300"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
                      isChecked
                        ? "bg-[#242D16] border-[#688523] text-[#C7F33C]"
                        : "border-slate-600/70 bg-[#1E2021]"
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[2.5]" />}
                  </div>
                  <span className={`text-xs ${isChecked ? "font-normal text-slate-200" : "font-normal text-slate-500"}`}>
                    {countryName.toUpperCase()}
                  </span>
                </div>
                <span
                  className={`text-[11px] font-normal px-2 py-0.5 rounded-full ${
                    isChecked
                      ? "bg-[#1E2021] text-slate-400"
                      : "bg-transparent text-slate-600"
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
                  <span className="px-2 py-0.5 rounded-full bg-[#262F16] text-[#B8E62C] border border-[#4D631B] text-[11px] font-bold">
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
