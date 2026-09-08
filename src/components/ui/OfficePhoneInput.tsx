"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Search, ChevronDown, Check, X, ShieldAlert } from "lucide-react";
import { parsePhoneNumberFromString, AsYouType, CountryCode } from "libphonenumber-js/max";
import { COUNTRIES, CountryData, DEFAULT_COUNTRY } from "@/lib/data/countries";

export interface OfficePhoneInputProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function OfficePhoneInput({
  value = "",
  onChange,
  placeholder = "02 123 4567",
  disabled = false,
  className = "",
  id,
}: OfficePhoneInputProps) {
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
      if (effectiveSpaceBelow < 290 && rect.top > 220) {
        setOpenUpward(true);
      } else {
        setOpenUpward(false);
      }
    }
  }, [isDialDropdownOpen]);

  // Parse dial code, national number, and extension from value
  const parsePhone = useCallback(
    (phoneStr: string): { country: CountryData; nationalNumber: string; extension: string } => {
      if (!phoneStr) {
        return { country: DEFAULT_COUNTRY, nationalNumber: "", extension: "" };
      }

      let trimmed = phoneStr.trim();
      let extension = "";

      // Extract extension if present (e.g. ext. 123, ต่อ 123, #123, x123)
      const extMatch = trimmed.match(/(?:ext\.?|x|ต่อ|#)\s*([0-9]{1,6})/i);
      if (extMatch) {
        extension = extMatch[1];
        trimmed = trimmed.replace(extMatch[0], "").trim();
      }

      if (trimmed.startsWith("+")) {
        const sortedByDialLen = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);
        for (const c of sortedByDialLen) {
          if (trimmed.startsWith(c.dialCode)) {
            const rest = trimmed.slice(c.dialCode.length).trim();
            return { country: c, nationalNumber: rest, extension };
          }
        }
      }

      // Default to Thailand if domestic number starting with 0
      if (trimmed.startsWith("0")) {
        return { country: DEFAULT_COUNTRY, nationalNumber: trimmed.replace(/^0/, ""), extension };
      }

      return { country: DEFAULT_COUNTRY, nationalNumber: trimmed, extension };
    },
    []
  );

  const parsed = useMemo(() => parsePhone(value), [value, parsePhone]);
  const [selectedCountry, setSelectedCountry] = useState<CountryData>(parsed.country);

  // Helper to build standardized phone string
  const buildCombined = useCallback((country: CountryData, national: string, ext: string) => {
    const cleanNat = national.trim();
    const cleanExt = ext.trim();
    if (!cleanNat) return "";
    let res = `${country.dialCode} ${cleanNat}`;
    if (cleanExt) {
      res += ` ext. ${cleanExt}`;
    }
    return res;
  }, []);

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

  const activeCountry = value && value.trim().startsWith("+") ? parsed.country : selectedCountry;

  const handleCountryChange = (country: CountryData) => {
    setSelectedCountry(country);
    closeDialDropdown();
    const combined = buildCombined(country, parsed.nationalNumber, parsed.extension);
    onChange(combined);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let rawVal = e.target.value;

    // Check if user pasted with an extension (e.g. "02 152 3787 ext 79" or "ต่อ 79")
    let currentExt = parsed.extension;
    const extMatch = rawVal.match(/(?:ext\.?|x|ต่อ|#)\s*([0-9]{1,6})/i);
    if (extMatch) {
      currentExt = extMatch[1];
      rawVal = rawVal.replace(extMatch[0], "");
    }

    // Detect if user pasted multiple numbers separated by delimiters
    if (/[,\/;\n|]|\band\b|\bor\b|และ|หรือ/i.test(rawVal)) {
      const parts = rawVal.split(/[,\/;\n|]|\band\b|\bor\b|และ|หรือ/i);
      rawVal = parts[0] || "";
    }

    // If user typed '+' directly into input, re-parse
    if (rawVal.trim().startsWith("+")) {
      const p = parsePhone(rawVal.trim());
      setSelectedCountry(p.country);
      onChange(buildCombined(p.country, p.nationalNumber, p.extension || currentExt));
      return;
    }

    // Allow only digits, hyphens, and spaces
    let sanitized = rawVal.replace(/[^\d\s-]/g, "");

    // Strip leading zero if typed after an international dial code
    const digitsOnly = sanitized.replace(/\D/g, "");
    if (digitsOnly.startsWith("0")) {
      sanitized = digitsOnly.replace(/^0+/, "");
    }

    // Max length protection: standard ITU-T E.164 phone numbers are max 15 digits
    if (digitsOnly.length > 15) {
      sanitized = digitsOnly.slice(0, 15);
    }

    // Format As-You-Type for the selected country
    let formattedNational = sanitized;
    if (digitsOnly.length >= 2) {
      try {
        const ayt = new AsYouType(activeCountry.code as CountryCode);
        if (activeCountry.code === "TH") {
          // For Thailand, landlines (02) require leading 0 for AsYouType pattern detection
          const domestic = digitsOnly.startsWith("0") ? digitsOnly : "0" + digitsOnly;
          formattedNational = ayt.input(domestic).replace(/^0\s?/, "");
        } else {
          formattedNational = ayt.input(sanitized);
          if (formattedNational.startsWith("0") && activeCountry.dialCode) {
            formattedNational = formattedNational.replace(/^0\s?/, "");
          }
        }
      } catch {
        formattedNational = sanitized;
      }
    }

    const combined = buildCombined(activeCountry, formattedNational, currentExt);
    onChange(combined);
  };

  const handleExtensionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const extDigits = e.target.value.replace(/\D/g, "").slice(0, 6);
    onChange(buildCombined(activeCountry, parsed.nationalNumber, extDigits));
  };

  // Real-time phone number validation using Google's libphonenumber dataset
  const validationInfo = useMemo(() => {
    const rawDigits = parsed.nationalNumber.replace(/\D/g, "");
    if (!rawDigits || rawDigits.length < 3) {
      return { isValid: null, type: null, isPossible: null, rawLength: rawDigits.length, hint: null };
    }

    const fullNumber = `${activeCountry.dialCode}${rawDigits}`;
    try {
      const p = parsePhoneNumberFromString(fullNumber, activeCountry.code as CountryCode);
      if (!p) {
        let hint = "Check number";
        if (activeCountry.code === "TH" && rawDigits.startsWith("2") && rawDigits.length > 8) {
          hint = "เบอร์ 02 มี 8 หลัก (หลัง +66)";
        }
        return { isValid: false, type: null, isPossible: false, rawLength: rawDigits.length, hint };
      }

      let hint: string | null = null;
      if (!p.isValid() && activeCountry.code === "TH" && rawDigits.startsWith("2") && rawDigits.length > 8) {
        hint = "เบอร์ 02 มี 8 หลัก (หลัง +66)";
      }

      return {
        isValid: p.isValid(),
        type: p.getType(),
        isPossible: p.isPossible(),
        rawLength: rawDigits.length,
        hint,
      };
    } catch {
      return { isValid: false, type: null, isPossible: false, rawLength: rawDigits.length, hint: null };
    }
  }, [activeCountry.dialCode, activeCountry.code, parsed.nationalNumber]);

  return (
    <div
      className={`flex items-center rounded-xl bg-[#252728] border transition-colors ${
        validationInfo.isValid === true
          ? "border-[#C7F33C]/40 focus-within:border-[#C7F33C]"
          : validationInfo.isValid === false && validationInfo.rawLength >= 7
          ? "border-amber-500/40 focus-within:border-amber-400"
          : "border-[#4E4F50]/40 focus-within:border-[#C7F33C]"
      } ${className}`}
    >
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
                  className="text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Country List */}
            <div className="overflow-y-auto max-h-52 p-1 divide-y divide-[#3A3B3C]/40">
              {filteredCountries.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-400">No country found</div>
              ) : (
                filteredCountries.map((c) => {
                  const isSelected = c.code === activeCountry.code;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => handleCountryChange(c)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left ${
                        isSelected
                          ? "bg-[#C7F33C]/15 text-[#C7F33C] font-semibold"
                          : "text-slate-300 hover:bg-[#3A3B3C] hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-base leading-none shrink-0">{c.flag}</span>
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
        maxLength={20}
        placeholder={placeholder}
        className="w-full bg-transparent px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
      />

      {/* Extension (เบอร์ต่อ) */}
      <div className="flex items-center pl-2 pr-1 border-l border-[#4E4F50]/40 shrink-0 select-none">
        <span className="text-xs text-slate-400 font-medium mr-1" title="เบอร์ต่อสำนักงาน (Extension)">
          Ext:
        </span>
        <input
          type="text"
          value={parsed.extension}
          onChange={handleExtensionChange}
          disabled={disabled}
          maxLength={6}
          placeholder="ต่อ"
          className="w-10 bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50"
          title="เบอร์ต่อภายในสำนักงาน เช่น 101, 79"
        />
      </div>

      {/* Action & Live Validation Badge */}
      <div className="flex items-center gap-1.5 pr-2.5 shrink-0 select-none">
        {(parsed.nationalNumber || parsed.extension) && !disabled && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="p-1 text-slate-500 hover:text-slate-300 rounded-full transition-colors cursor-pointer"
            title="Clear phone number"
          >
            <X className="w-3 h-3" />
          </button>
        )}

        {validationInfo.isValid === true && (
          <span
            className="text-xs font-bold text-[#C7F33C] bg-[#C7F33C]/10 border border-[#C7F33C]/30 px-2 py-0.5 rounded-full flex items-center gap-1 animate-in fade-in duration-150"
            title="Valid landline/office number format"
          >
            <Check className="w-2.5 h-2.5 text-[#C7F33C]" />
            <span>
              {validationInfo.type === "FIXED_LINE"
                ? parsed.extension
                  ? `Landline (ต่อ ${parsed.extension})`
                  : "Landline"
                : "Office"}
            </span>
          </span>
        )}

        {validationInfo.isValid === false && validationInfo.rawLength >= 7 && (
          <span
            className="text-xs font-medium text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full flex items-center gap-1 animate-in fade-in duration-150"
            title={validationInfo.hint || "Check number length or prefix for selected country"}
          >
            <ShieldAlert className="w-2.5 h-2.5 text-amber-400" />
            <span>{validationInfo.hint || "Check number"}</span>
          </span>
        )}
      </div>
    </div>
  );
}
