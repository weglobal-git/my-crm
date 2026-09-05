"use client";

import React, { useState, useRef, useEffect } from "react";
import { CircleDollarSign, FileText, Check } from "lucide-react";

export type OpportunityType = "SALES_DEAL" | "INTERNAL_TASK" | string;

interface DealTypeIconProps {
  type: OpportunityType;
  size?: "sm" | "md" | "lg";
  className?: string;
  highlight?: boolean;
}

export function DealTypeIcon({
  type,
  size = "sm",
  className = "",
  highlight = false,
}: DealTypeIconProps) {
  const isSales = type === "SALES_DEAL";

  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-7 h-7",
    lg: "w-8 h-8",
  }[size];

  const iconSizes = {
    sm: "w-4 h-4",
    md: "w-4.5 h-4.5",
    lg: "w-5 h-5",
  }[size];

  if (isSales) {
    return (
      <div
        className={`${sizeClasses} rounded-full flex items-center justify-center transition-all ${
          highlight
            ? "bg-[#C7F33C] text-slate-900 border border-[#C7F33C]"
            : "bg-[#C7F33C] text-black border border-[#C7F33C]/40"
        } ${className}`}
        title="Sales Deal"
      >
        <CircleDollarSign className={iconSizes} />
      </div>
    );
  }

  // INTERNAL_TASK (Default)
  return (
    <div
      className={`${sizeClasses} rounded-full flex items-center justify-center transition-all ${
        highlight
          ? "bg-[#C7F33C] text-slate-900 border border-[#C7F33C]"
          : "bg-slate-700 text-slate-200 border border-slate-600"
      } ${className}`}
      title="Internal Task"
    >
      <FileText className={iconSizes} />
    </div>
  );
}

interface DealTypeSelectorProps {
  value: OpportunityType;
  onChange: (newType: "SALES_DEAL" | "INTERNAL_TASK") => Promise<void> | void;
  disabled?: boolean;
}

export function DealTypeSelector({
  value,
  onChange,
  disabled = false,
}: DealTypeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isSales = value === "SALES_DEAL";

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

  const handleSelect = async (newType: "SALES_DEAL" | "INTERNAL_TASK") => {
    setIsOpen(false);
    if (newType !== value) {
      await onChange(newType);
    }
  };

  return (
    <div className="relative inline-flex items-center shrink-0" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        title={
          disabled
            ? isSales
              ? "Sales Deal"
              : "Internal Task"
            : `Click to switch (Current: ${isSales ? "Sales Deal" : "Internal Task"})`
        }
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
          disabled ? "cursor-default opacity-85" : "cursor-pointer hover:scale-105 active:scale-95"
        }`}
      >
        <DealTypeIcon type={value} size="md" />
      </button>

      {/* Custom CRM Standard Dropdown (matching Header.tsx layout) */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-52 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] z-50 p-2 shadow-xl animate-fade-in-up">
          <div className="px-3 py-1.5 border-b border-[#4E4F50]/60 mb-1 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Card Type
            </span>
          </div>

          <div className="flex flex-col gap-1">
            {/* Sales Deal Option */}
            <button
              type="button"
              onClick={() => handleSelect("SALES_DEAL")}
              className={`w-full flex items-center justify-between gap-2.5 p-2 rounded-xl transition-colors text-left cursor-pointer ${
                isSales
                  ? "bg-[#4E4F50] text-slate-100 font-semibold"
                  : "text-slate-300 hover:bg-[#4E4F50]/60 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <DealTypeIcon type="SALES_DEAL" size="sm" />
                <span className="text-sm">Sales Deal</span>
              </div>
              {isSales && <Check className="w-4 h-4 text-[#C7F33C] shrink-0" />}
            </button>

            {/* Internal Task Option */}
            <button
              type="button"
              onClick={() => handleSelect("INTERNAL_TASK")}
              className={`w-full flex items-center justify-between gap-2.5 p-2 rounded-xl transition-colors text-left cursor-pointer ${
                !isSales
                  ? "bg-[#4E4F50] text-slate-100 font-semibold"
                  : "text-slate-300 hover:bg-[#4E4F50]/60 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <DealTypeIcon type="INTERNAL_TASK" size="sm" />
                <span className="text-sm">Internal Task</span>
              </div>
              {!isSales && <Check className="w-4 h-4 text-[#C7F33C] shrink-0" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
