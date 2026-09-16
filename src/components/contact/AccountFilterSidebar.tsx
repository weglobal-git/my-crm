"use client";

import React, { useState, useMemo } from "react";
import { Globe, Search, X, Building2 } from "lucide-react";
import { ContactType } from "@prisma/client";

interface AccountFilterSidebarProps {
  activeType: ContactType | "ALL";
  onTypeChange: (type: ContactType | "ALL") => void;
  availableTypes?: { type: ContactType; count: number }[];
  activeCountry: string;
  onCountryChange: (country: string) => void;
  availableCountries?: { country: string; count: number }[];
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



function SidebarItem({
  icon,
  label,
  count,
  isActive,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group/item w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors rounded-xl cursor-pointer border-0 ${
        isActive
          ? "bg-[#C7F33C] text-black"
          : "hover:bg-[#4E4F50] border-transparent text-slate-300"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className={`p-1.5 rounded-lg transition-colors shrink-0 flex items-center justify-center ${
            isActive
              ? "bg-black text-white"
              : "text-slate-400 bg-[#3A3B3C] group-hover/item:bg-[#4E4F50] group-hover/item:text-slate-200"
          }`}
        >
          <div className="flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5">
            {icon}
          </div>
        </div>
        <span className="font-normal text-xs tracking-wide truncate">{label}</span>
      </div>

      {count !== undefined && (
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 transition-colors ${
            isActive
              ? "bg-black/15 text-black"
              : "bg-[#2A2B2D] text-slate-400 group-hover/item:text-slate-200"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function AccountFilterSidebar({
  activeType,
  onTypeChange,
  availableTypes = [],
  activeCountry,
  onCountryChange,
  availableCountries = [],
}: AccountFilterSidebarProps) {
  const [countrySearch, setCountrySearch] = useState("");

  const q = countrySearch.trim().toLowerCase();

  // Total count across all types
  const totalTypeCount = useMemo(() => {
    return availableTypes.reduce((sum, t) => sum + t.count, 0);
  }, [availableTypes]);

  // Country counts map for quick lookup
  const countryCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of availableCountries) {
      if (c.country && c.country.trim()) {
        map.set(c.country.trim().toUpperCase(), c.count);
      }
    }
    return map;
  }, [availableCountries]);

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

  // Filter countries only by countrySearch
  const filteredCountries = useMemo(() => {
    if (!q) return countryList;
    return countryList.filter((c) => c.toLowerCase().includes(q));
  }, [countryList, q]);

  const isAllCountryActive =
    !activeCountry || activeCountry.trim().toUpperCase() === "ALL";

  return (
    <div className="hidden md:flex w-full md:w-64 lg:w-72 shrink-0 h-full flex-col select-none">
      {/* GROUP 1: TYPE (Header aligns horizontally with ACCOUNT header) */}
      <div className="shrink-0">
        <div className="h-10 flex items-center px-2 mb-2">
          <span className="font-black text-xs uppercase text-slate-100 tracking-wider">
            TYPE
          </span>
        </div>

        <div className="flex flex-col gap-1 px-2">
          {/* ALL TYPE item */}
          <SidebarItem
            icon={<Building2 className="w-5 h-5" />}
            label="All Type"
            count={totalTypeCount}
            isActive={activeType === "ALL"}
            onClick={() => onTypeChange("ALL")}
          />

          {/* Database-populated types only, each with lucide Building2 & count badge */}
          {availableTypes.map((t) => (
            <SidebarItem
              key={t.type}
              icon={<Building2 className="w-5 h-5" />}
              label={formatTypeLabel(t.type)}
              count={t.count}
              isActive={activeType === t.type}
              onClick={() => onTypeChange(t.type)}
            />
          ))}
        </div>
      </div>

      {/* GROUP 2: COUNTRY (Flex-1 to fill all remaining height to screen bottom) */}
      <div className="flex-1 min-h-0 flex flex-col gap-1 px-2 mt-5">
        <div className="h-8 flex items-center shrink-0">
          <span className="font-black text-xs uppercase text-slate-100 tracking-wider">
            COUNTRY
          </span>
        </div>

        {/* Static Search Input dedicated exclusively to Country */}
        <div className="relative mb-2 mt-1 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={countrySearch}
            onChange={(e) => setCountrySearch(e.target.value)}
            placeholder="Search country..."
            className="w-full bg-[#3A3B3C] border border-transparent rounded-xl pl-9 pr-8 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-[#C7F33C] transition-all"
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

        {/* ALL COUNTRY */}
        <div className="shrink-0 mb-1">
          <SidebarItem
            icon={<Globe className="w-5 h-5" />}
            label="All Country"
            count={totalCountryCount}
            isActive={isAllCountryActive}
            onClick={() => onCountryChange("ALL")}
          />
        </div>

        {/* Filtered Country List: expands and scrolls to screen bottom */}
        <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar flex flex-col gap-1 pb-4">
          {filteredCountries.map((countryName) => {
            const isActive =
              !isAllCountryActive &&
              activeCountry.trim().toUpperCase() === countryName.trim().toUpperCase();
            const count = countryCountMap.get(countryName.trim().toUpperCase()) ?? 0;

            return (
              <SidebarItem
                key={countryName}
                icon={<Globe className="w-5 h-5" />}
                label={countryName}
                count={count}
                isActive={isActive}
                onClick={() => onCountryChange(countryName)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
