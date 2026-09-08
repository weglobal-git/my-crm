"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Users, ShoppingBag, Truck, Building2, LucideIcon } from "lucide-react";
import { ContactType } from "@prisma/client";

export interface AccountTypeOption {
  label: string;
  value: ContactType;
  icon: LucideIcon;
}

export const ACCOUNT_TYPE_OPTIONS: AccountTypeOption[] = [
  { label: "Customer", value: "CUSTOMER", icon: Users },
  { label: "Trader", value: "TRADER", icon: ShoppingBag },
  { label: "Shipping", value: "SHIPPING", icon: Truck },
  { label: "My Office", value: "MY_OFFICE", icon: Building2 },
];

export interface AccountTypeFilterProps {
  value: ContactType;
  onChange: (value: ContactType) => void;
  variant?: "dropdown" | "segmented";
  onHoverItem?: (value: ContactType) => void;
}

export function AccountTypeFilter({
  value,
  onChange,
  variant = "dropdown",
  onHoverItem,
}: AccountTypeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelect = (newValue: ContactType) => {
    onChange(newValue);
    setIsOpen(false);
  };

  if (variant === "segmented") {
    return (
      <div className="grid grid-cols-2 gap-1.5 bg-[#1C1C1D] p-1 rounded-xl">
        {ACCOUNT_TYPE_OPTIONS.map((item) => {
          const isSelected = value === item.value;
          const Icon = item.icon;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onChange(item.value)}
              onPointerEnter={() => onHoverItem?.(item.value)}
              className={`py-2 px-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                isSelected
                  ? "bg-[#3A3B3C] text-slate-100"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon
                className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-[#C7F33C]" : "text-slate-400"}`}
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const currentOption = ACCOUNT_TYPE_OPTIONS.find((opt) => opt.value === value) || ACCOUNT_TYPE_OPTIONS[0];
  const CurrentIcon = currentOption.icon;
  const isCustomActive = value !== "CUSTOMER";

  return (
    <div className="relative shrink-0" ref={dropdownRef}>
      {/* Compact Dropdown Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
          isCustomActive
            ? "bg-[#252728] text-slate-100 border-[#C7F33C]/60 hover:bg-[#3A3B3C]"
            : "bg-[#252728] text-slate-300 border-[#3A3B3C] hover:bg-[#3A3B3C] hover:text-slate-100 hover:border-[#4E4F50]"
        }`}
        title="Filter account type"
      >
        <CurrentIcon
          className={`w-3.5 h-3.5 ${isCustomActive ? "text-[#C7F33C]" : "text-slate-400"}`}
        />
        <span className={isCustomActive ? "text-[#C7F33C]" : "text-slate-300"}>
          {currentOption.label}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-44 bg-[#252728] border border-[#3A3B3C] rounded-2xl p-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150 backdrop-blur-md">
          <div className="px-2.5 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-[#3A3B3C]/60 mb-1">
            Account Type
          </div>

          <div className="flex flex-col gap-0.5">
            {ACCOUNT_TYPE_OPTIONS.map((item) => {
              const Icon = item.icon;
              const isSelected = value === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => handleSelect(item.value)}
                  onPointerEnter={() => onHoverItem?.(item.value)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer text-left ${
                    isSelected
                      ? "bg-[#3A3B3C] text-slate-100 font-semibold"
                      : "text-slate-300 hover:bg-[#3A3B3C]/60 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-[#C7F33C]" : "text-slate-400"}`} />
                    <span>{item.label}</span>
                  </div>
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
