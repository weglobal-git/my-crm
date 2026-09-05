"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";
import { COUNTRIES, CountryData, findCountry } from "@/lib/data/countries";

interface CountrySelectProps {
  value?: string;
  onChange: (countryName: string, country?: CountryData) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showFlag?: boolean;
  id?: string;
}

export function CountrySelect({
  value,
  onChange,
  placeholder = "Select country...",
  disabled = false,
  className = "",
  showFlag = true,
  id,
}: CountrySelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedCountry = useMemo(() => {
    return findCountry(value);
  }, [value]);

  const filteredCountries = useMemo(() => {
    if (!search.trim()) return COUNTRIES;
    const q = search.trim().toLowerCase();
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.dialCode.toLowerCase().includes(q)
    );
  }, [search]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setSearch("");
  }, []);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, closeDropdown]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSelect = (country: CountryData) => {
    onChange(country.name, country);
    closeDropdown();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("", undefined);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Dropdown Trigger Button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (isOpen) {
            closeDropdown();
          } else {
            setIsOpen(true);
          }
        }}
        className={`w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-left flex items-center justify-between gap-2 border border-[#4E4F50]/40 transition-colors focus:outline-none focus:border-[#C7F33C] ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-slate-500"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {selectedCountry ? (
            <>
              {showFlag && <span className="text-base leading-none">{selectedCountry.flag}</span>}
              <span className="text-slate-100 font-medium truncate">{selectedCountry.name}</span>
              <span className="text-[10px] text-slate-400 uppercase font-mono px-1.5 py-0.5 rounded bg-[#3A3B3C]">
                {selectedCountry.code}
              </span>
            </>
          ) : value ? (
            <span className="text-slate-100 font-medium truncate">{value}</span>
          ) : (
            <span className="text-slate-500">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-slate-400">
          {value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleClear(e as unknown as React.MouseEvent);
              }}
              className="p-0.5 hover:text-slate-200 rounded"
              title="Clear selection"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Popover Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#252728] border border-[#4E4F50] rounded-xl overflow-hidden flex flex-col max-h-64">
          {/* Search Box */}
          <div className="p-2 border-b border-[#3A3B3C] bg-[#2a2c2d] flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country or code..."
              className="w-full bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* List of Countries */}
          <div className="overflow-y-auto hide-scrollbar divide-y divide-[#3A3B3C]/30 flex-1">
            {filteredCountries.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400">
                No country found for &quot;{search}&quot;
              </div>
            ) : (
              filteredCountries.map((country) => {
                const isSelected = selectedCountry?.code === country.code || value === country.name;
                return (
                  <button
                    key={country.code}
                    type="button"
                    onClick={() => handleSelect(country)}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 hover:bg-[#3A3B3C] transition-colors cursor-pointer ${
                      isSelected ? "bg-[#3A3B3C] text-[#C7F33C] font-semibold" : "text-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-base shrink-0">{country.flag}</span>
                      <span className="truncate">{country.name}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-slate-400 font-mono px-1.5 py-0.5 rounded bg-[#1C1C1D]">
                        {country.code}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-[#C7F33C]" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
