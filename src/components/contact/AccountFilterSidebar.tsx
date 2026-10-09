"use client";

import React, { useState, useMemo } from "react";
import { Search, X, Check, Building2, Globe } from "lucide-react";
import { ContactType } from "@prisma/client";
import { normalizeCountryName } from "@/lib/data/countries";

interface AccountFilterSidebarProps {
  // Multi-select props (Primary)
  selectedTypes?: string[];
  onToggleType?: (type: string) => void;
  onClearTypes?: () => void;
  onSelectTypes?: (types: string[]) => void;
  availableTypes?: { type: ContactType; count: number }[];

  selectedCountries?: string[];
  onToggleCountry?: (country: string) => void;
  onClearCountries?: () => void;
  onSelectCountries?: (countries: string[]) => void;
  availableCountries?: { country: string; count: number }[];

  // Backward compatibility / Single-select fallbacks
  activeType?: ContactType | "ALL";
  onTypeChange?: (type: ContactType | "ALL") => void;
  activeCountry?: string;
  onCountryChange?: (country: string) => void;
}

const TYPE_LABEL_MAP: Record<string, string> = {
  CUSTOMER: "Customer",
  TRADER: "Trading",
  SHIPPING: "Shipping",
  MY_OFFICE: "My Office",
  SUPPLIER: "Supplier",
  PARTNER: "Partner",
  OTHER: "Other",
};

function formatTypeLabel(type: string): string {
  if (TYPE_LABEL_MAP[type]) return TYPE_LABEL_MAP[type];
  return type
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const AccountFilterSidebar = React.memo(function AccountFilterSidebar({
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
}: AccountFilterSidebarProps) {
  const [countrySearch, setCountrySearch] = useState("");
  const countryQ = countrySearch.trim().toLowerCase();

  // Total count across all types
  const totalTypeCount = useMemo(() => {
    return availableTypes.reduce((sum, t) => sum + t.count, 0);
  }, [availableTypes]);

  // Total count across all countries
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
    return list;
  }, [availableCountries]);

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

  // Filter countries by search query
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
      const isCurrentlyChecked = selectedCountries.some(
        (sc) => sc.toLowerCase() === countryName.toLowerCase()
      );
      if (isCurrentlyChecked) {
        const next = selectedCountries.filter(
          (sc) => sc.toLowerCase() !== countryName.toLowerCase()
        );
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
    <div className="hidden md:flex w-full md:w-64 lg:w-72 shrink-0 h-full flex-col select-none gap-2 pb-2">
      {/* TOP HALF: TYPE WITH CALM CHECKBOXES */}
      <div className="shrink-0 flex flex-col">
        <div className="h-8 flex items-center justify-between px-2 shrink-0">
          <span className="font-black text-xs uppercase text-slate-100 tracking-wider">
            TYPE
          </span>
          {!isAllTypesActive && (
            <button
              type="button"
              onClick={handleToggleAllTypes}
              className="text-[11px] text-slate-400 hover:text-[#C7F33C] hover:underline cursor-pointer font-medium transition-colors"
            >
              Reset ({typeSelectedCount})
            </button>
          )}
        </div>

        {/* Scrollable Checkbox Types List */}
        <div className="flex flex-col gap-0.5 pr-1">
          {/* ALL TYPES / SELECT ALL HEADER ROW */}
          <button
            type="button"
            onClick={handleToggleAllTypes}
            className={`group/item w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left transition-colors rounded-lg cursor-pointer border ${
              isAllTypesActive
                ? "bg-[#2D2E30] border-[#4E5052] text-slate-100 hover:bg-[#343638]"
                : typeSelectedCount > 0
                ? "bg-[#252728] border-[#3E4042] text-slate-200 hover:bg-[#2C2D2F]"
                : "bg-[#1C1C1D] border-transparent hover:bg-[#252728] text-slate-400"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div
                className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
                  isAllTypesActive
                    ? "bg-[#242D16] border-[#7E9E26] text-[#C7F33C]"
                    : typeSelectedCount > 0
                    ? "bg-[#242D16] border-[#7E9E26] text-[#C7F33C]"
                    : "border-slate-600 bg-[#1E2021] group-hover/item:border-slate-400"
                }`}
              >
                {isAllTypesActive && <Check className="w-3 h-3 stroke-[2.5]" />}
                {!isAllTypesActive && typeSelectedCount > 0 && (
                  <div className="w-2 h-0.5 bg-[#C7F33C] rounded-full" />
                )}
              </div>
              <span className="text-xs font-bold uppercase tracking-wider truncate">
                {isAllTypesActive ? "ALL TYPES" : "SELECT ALL"}
              </span>
              {typeSelectedCount > 0 && (
                <span className="text-[10.5px] px-2 py-0.5 rounded-full font-semibold bg-[#262F16] text-[#B8E62C] border border-[#4D631B] tabular-nums shrink-0">
                  {typeSelectedCount} selected
                </span>
              )}
            </div>
            <span className="text-xs font-normal px-1.5 py-0.5 rounded shrink-0 bg-[#1E2021] text-slate-400">
              {totalTypeCount}
            </span>
          </button>

          {/* CHECKBOX TYPE ITEMS */}
          {availableTypes.map((t) => {
            const isChecked = isTypeChecked(t.type);

            return (
              <button
                key={t.type}
                type="button"
                onClick={() => handleToggleSingleType(t.type)}
                className={`group/item w-full flex items-center justify-between gap-2 px-2.5 py-1 text-left transition-colors rounded-md cursor-pointer border-0 ${
                  isChecked
                    ? "bg-transparent hover:bg-[#323335] text-slate-200 hover:text-white"
                    : "bg-transparent hover:bg-[#2D2E30] text-slate-500 hover:text-slate-300"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
                      isChecked
                        ? "bg-[#242D16] border-[#688523] text-[#C7F33C]"
                        : "border-slate-600/70 bg-[#1E2021] group-hover/item:border-slate-400"
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[2.5]" />}
                  </div>
                  <span
                    className={`text-xs truncate tracking-wide flex items-center gap-1.5 min-w-0 ${
                      isChecked
                        ? "font-normal text-slate-200 group-hover/item:text-white"
                        : "font-normal text-slate-500 group-hover/item:text-slate-300"
                    }`}
                  >
                    <span className="truncate">{formatTypeLabel(t.type)}</span>
                  </span>
                </div>

                <span
                  className={`text-xs font-normal px-1.5 py-0.5 rounded shrink-0 transition-colors ${
                    isChecked
                      ? "bg-[#1E2021] text-slate-400 group-hover/item:text-slate-200"
                      : "bg-transparent text-slate-600 group-hover/item:text-slate-400"
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* DIVIDER */}
      <div className="border-t border-[#3A3B3C]/60 my-0.5 shrink-0" />

      {/* BOTTOM HALF: COUNTRY WITH CHECKBOXES & SEARCH */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="h-8 flex items-center justify-between px-2 shrink-0">
          <span className="font-black text-xs uppercase text-slate-100 tracking-wider">
            COUNTRY
          </span>
          {!isAllCountriesActive && (
            <button
              type="button"
              onClick={handleToggleAllCountries}
              className="text-[11px] text-slate-400 hover:text-[#C7F33C] hover:underline cursor-pointer font-medium transition-colors"
            >
              Reset ({countrySelectedCount})
            </button>
          )}
        </div>

        {/* Country Search Input */}
        <div className="relative mb-2 mt-0.5 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={countrySearch}
            onChange={(e) => setCountrySearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setCountrySearch("");
            }}
            placeholder="Search country..."
            className="w-full bg-[#3A3B3C] border border-transparent rounded-full pl-8 pr-7 py-1 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-[#C7F33C]/60 transition-all"
          />
          {countrySearch && (
            <button
              type="button"
              onClick={() => setCountrySearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Scrollable Checkbox Countries List */}
        <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar flex flex-col gap-0.5 pr-1">
          {/* ALL COUNTRIES / SELECT ALL HEADER ROW */}
          <button
            type="button"
            onClick={handleToggleAllCountries}
            className={`group/item w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left transition-colors rounded-lg cursor-pointer border ${
              isAllCountriesActive
                ? "bg-[#2D2E30] border-[#4E5052] text-slate-100 hover:bg-[#343638]"
                : countrySelectedCount > 0
                ? "bg-[#252728] border-[#3E4042] text-slate-200 hover:bg-[#2C2D2F]"
                : "bg-[#1C1C1D] border-transparent hover:bg-[#252728] text-slate-400"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div
                className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
                  isAllCountriesActive
                    ? "bg-[#242D16] border-[#7E9E26] text-[#C7F33C]"
                    : countrySelectedCount > 0
                    ? "bg-[#242D16] border-[#7E9E26] text-[#C7F33C]"
                    : "border-slate-600 bg-[#1E2021] group-hover/item:border-slate-400"
                }`}
              >
                {isAllCountriesActive && <Check className="w-3 h-3 stroke-[2.5]" />}
                {!isAllCountriesActive && countrySelectedCount > 0 && (
                  <div className="w-2 h-0.5 bg-[#C7F33C] rounded-full" />
                )}
              </div>
              <span className="text-xs font-bold uppercase tracking-wider truncate">
                {isAllCountriesActive ? "ALL COUNTRIES" : "SELECT ALL"}
              </span>
              {countrySelectedCount > 0 && (
                <span className="text-[10.5px] px-2 py-0.5 rounded-full font-semibold bg-[#262F16] text-[#B8E62C] border border-[#4D631B] tabular-nums shrink-0">
                  {countrySelectedCount} selected
                </span>
              )}
            </div>
            <span className="text-xs font-normal px-1.5 py-0.5 rounded shrink-0 bg-[#1E2021] text-slate-400">
              {totalCountryCount}
            </span>
          </button>

          {/* CHECKBOX COUNTRY ITEMS */}
          {filteredCountries.map((countryName) => {
            const isChecked = isCountryChecked(countryName);
            const count = countryCountMap.get(countryName.trim().toUpperCase()) ?? 0;

            return (
              <button
                key={countryName}
                type="button"
                onClick={() => handleToggleSingleCountry(countryName)}
                className={`group/item w-full flex items-center justify-between gap-2 px-2.5 py-1 text-left transition-colors rounded-md cursor-pointer border-0 ${
                  isChecked
                    ? "bg-transparent hover:bg-[#323335] text-slate-200 hover:text-white"
                    : "bg-transparent hover:bg-[#2D2E30] text-slate-500 hover:text-slate-300"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={`w-4 h-4 rounded transition-all shrink-0 flex items-center justify-center border ${
                      isChecked
                        ? "bg-[#242D16] border-[#688523] text-[#C7F33C]"
                        : "border-slate-600/70 bg-[#1E2021] group-hover/item:border-slate-400"
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[2.5]" />}
                  </div>
                  <span
                    className={`text-xs truncate tracking-wide flex items-center gap-1.5 min-w-0 ${
                      isChecked
                        ? "font-normal text-slate-200 group-hover/item:text-white"
                        : "font-normal text-slate-500 group-hover/item:text-slate-300"
                    }`}
                  >
                    <span className="truncate">{countryName}</span>
                  </span>
                </div>

                <span
                  className={`text-xs font-normal px-1.5 py-0.5 rounded shrink-0 transition-colors ${
                    isChecked
                      ? "bg-[#1E2021] text-slate-400 group-hover/item:text-slate-200"
                      : "bg-transparent text-slate-600 group-hover/item:text-slate-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});
