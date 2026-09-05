"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";
import { COUNTRIES, CountryData, DEFAULT_COUNTRY } from "@/lib/data/countries";

interface PhoneInputWithCountryProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function PhoneInputWithCountry({
  value = "",
  onChange,
  placeholder = "81 234 5678",
  disabled = false,
  className = "",
  id,
}: PhoneInputWithCountryProps) {
  const [isDialDropdownOpen, setIsDialDropdownOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-detect whether dropdown should open upwards or downwards based on available space
  useEffect(() => {
    if (isDialDropdownOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const scrollParent = dropdownRef.current.closest(".overflow-y-auto");
      let effectiveSpaceBelow = window.innerHeight - rect.bottom;
      if (scrollParent) {
        const parentRect = scrollParent.getBoundingClientRect();
        effectiveSpaceBelow = Math.min(effectiveSpaceBelow, parentRect.bottom - rect.bottom);
      }
      // If less than 290px below and space above is sufficient, open upward
      if (effectiveSpaceBelow < 290 && rect.top > 220) {
        setOpenUpward(true);
      } else {
        setOpenUpward(false);
      }
    }
  }, [isDialDropdownOpen]);

  // Parse dial code and national number from value
  const parsePhone = useCallback((phoneStr: string): { country: CountryData; nationalNumber: string } => {
    if (!phoneStr) {
      return { country: DEFAULT_COUNTRY, nationalNumber: "" };
    }

    const trimmed = phoneStr.trim();
    if (trimmed.startsWith("+")) {
      // Find matching country by longest dial code prefix
      const sortedByDialLen = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);
      for (const c of sortedByDialLen) {
        if (trimmed.startsWith(c.dialCode)) {
          const rest = trimmed.slice(c.dialCode.length).trim();
          return { country: c, nationalNumber: rest };
        }
      }
    }

    // Default to Thailand if domestic number starting with 0
    if (trimmed.startsWith("0")) {
      return { country: DEFAULT_COUNTRY, nationalNumber: trimmed.replace(/^0/, "") };
    }

    return { country: DEFAULT_COUNTRY, nationalNumber: trimmed };
  }, []);

  const parsed = useMemo(() => parsePhone(value), [value, parsePhone]);
  const [selectedCountry, setSelectedCountry] = useState<CountryData>(parsed.country);

  const filteredCountries = useMemo(() => {
    if (!search.trim()) return COUNTRIES;
    const q = search.trim().toLowerCase();
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q)
    );
  }, [search]);

  const closeDialDropdown = useCallback(() => {
    setIsDialDropdownOpen(false);
    setSearch("");
  }, []);

  // Click outside to close dial picker
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closeDialDropdown();
      }
    };
    if (isDialDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDialDropdownOpen, closeDialDropdown]);

  // Focus search on open
  useEffect(() => {
    if (isDialDropdownOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isDialDropdownOpen]);

  const handleCountryChange = (country: CountryData) => {
    setSelectedCountry(country);
    closeDialDropdown();
    const combined = parsed.nationalNumber ? `${country.dialCode} ${parsed.nationalNumber}` : "";
    onChange(combined);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    // If user typed '+' directly into input, re-parse
    if (val.startsWith("+")) {
      const p = parsePhone(val);
      setSelectedCountry(p.country);
      onChange(val);
      return;
    }

    // Strip leading zero if typed for international formatting
    if (val.startsWith("0") && selectedCountry.dialCode === "+66") {
      val = val.replace(/^0+/, "");
    }

    const combined = val ? `${selectedCountry.dialCode} ${val}` : "";
    onChange(combined);
  };

  // Determine current active country (either from parsed value if value has dial code, or manually selected)
  const activeCountry = value && value.trim().startsWith("+") ? parsed.country : selectedCountry;

  return (
    <div className={`flex items-stretch rounded-xl bg-[#252728] border border-[#4E4F50]/40 focus-within:border-[#C7F33C] transition-colors ${className}`}>
      {/* Dial Code Dropdown Button */}
      <div ref={dropdownRef} className="relative shrink-0">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (isDialDropdownOpen) {
              closeDialDropdown();
            } else {
              setIsDialDropdownOpen(true);
            }
          }}
          className={`h-full px-2.5 py-2 flex items-center gap-1.5 bg-[#252728] hover:bg-[#3A3B3C] text-slate-200 border-r border-[#4E4F50]/40 rounded-l-xl transition-colors cursor-pointer text-xs ${
            disabled ? "opacity-50 cursor-not-allowed" : ""
          }`}
          title={`${activeCountry.name} (${activeCountry.dialCode})`}
        >
          <span className="text-base leading-none">{activeCountry.flag}</span>
          <span className="font-mono text-xs text-slate-100 font-semibold">
            {activeCountry.dialCode}
          </span>
          <ChevronDown
            className={`w-3 h-3 text-slate-400 transition-transform ${
              isDialDropdownOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* Dial Code Search Popover */}
        {isDialDropdownOpen && (
          <div
            className={`absolute left-0 z-[60] w-72 bg-[#252728] border border-[#4E4F50] rounded-xl overflow-hidden flex flex-col max-h-64 shadow-2xl ${
              openUpward ? "bottom-full mb-1.5" : "top-full mt-1.5"
            }`}
          >
            {/* Search Input */}
            <div className="p-2 border-b border-[#3A3B3C] bg-[#2a2c2d] flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country or code (+66)..."
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
                  No country or dial code found
                </div>
              ) : (
                filteredCountries.map((c) => {
                  const isSelected = activeCountry.code === c.code;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => handleCountryChange(c)}
                      className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 hover:bg-[#3A3B3C] transition-colors cursor-pointer ${
                        isSelected ? "bg-[#3A3B3C] text-[#C7F33C] font-semibold" : "text-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base shrink-0">{c.flag}</span>
                        <span className="truncate">{c.name}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-xs text-slate-400 font-medium">
                          {c.dialCode}
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

      {/* National Number Input */}
      <input
        id={id}
        type="tel"
        value={parsed.nationalNumber}
        onChange={handleNumberChange}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full bg-transparent px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none rounded-r-xl"
      />
    </div>
  );
}
