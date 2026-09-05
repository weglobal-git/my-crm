"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Check } from "lucide-react";
import { AddressType } from "@prisma/client";

interface AddressTypeSelectProps {
  value?: AddressType;
  onChange: (value: AddressType) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export const ADDRESS_TYPE_OPTIONS: { value: AddressType; label: string }[] = [
  { value: "HEADQUARTERS", label: "Headquarters" },
  { value: "BRANCH", label: "Branch" },
  { value: "BILLING", label: "Billing" },
  { value: "SHIPPING", label: "Shipping" },
  { value: "OTHER", label: "Other" },
];

export function AddressTypeSelect({
  value,
  onChange,
  disabled = false,
  className = "",
  id,
}: AddressTypeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption =
    ADDRESS_TYPE_OPTIONS.find((opt) => opt.value === value) || ADDRESS_TYPE_OPTIONS[0];

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Close when clicking outside
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

  const handleSelect = (val: AddressType) => {
    onChange(val);
    closeDropdown();
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 border border-[#4E4F50]/40 hover:border-[#4E4F50] focus:outline-none focus:ring-1 focus:ring-[#C7F33C] transition-colors flex items-center justify-between cursor-pointer ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        <span className="font-medium text-slate-100">{selectedOption.label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu (Strictly positioned below the field, never covering it) */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-full bg-[#252728] border border-[#4E4F50] rounded-xl shadow-2xl overflow-hidden p-1 animate-in fade-in-50 duration-100">
          <div className="space-y-0.5">
            {ADDRESS_TYPE_OPTIONS.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full px-3 py-2 text-xs rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-[#3A3B3C] text-[#C7F33C] font-semibold"
                      : "text-slate-300 hover:bg-[#3A3B3C]/60 hover:text-white"
                  }`}
                >
                  <span>{opt.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#C7F33C]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
