"use client";

import React, { useState, useRef, useEffect } from "react";
import { Briefcase, Wrench, LayoutGrid, ChevronDown, Check } from "lucide-react";

export type CardTypeFilterValue = "ALL" | "SALES_DEAL" | "INTERNAL_TASK";

interface CardTypeFilterProps {
  value: CardTypeFilterValue;
  onChange: (value: CardTypeFilterValue) => void;
}

export function CardTypeFilter({ value, onChange }: CardTypeFilterProps) {
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

  const handleSelect = (newValue: CardTypeFilterValue) => {
    onChange(newValue);
    setIsOpen(false);
  };

  const getLabelAndIcon = () => {
    switch (value) {
      case "SALES_DEAL":
        return {
          icon: <Briefcase className="w-3.5 h-3.5 text-[#C7F33C]" />,
          label: "Sales",
          isActive: true,
        };
      case "INTERNAL_TASK":
        return {
          icon: <Wrench className="w-3.5 h-3.5 text-[#C7F33C]" />,
          label: "Tasks",
          isActive: true,
        };
      default:
        return {
          icon: <LayoutGrid className="w-3.5 h-3.5 text-slate-400" />,
          label: "All Cards",
          isActive: false,
        };
    }
  };

  const current = getLabelAndIcon();

  return (
    <div className="relative shrink-0" ref={dropdownRef}>
      {/* Compact Dropdown Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer shadow-sm ${
          current.isActive
            ? "bg-[#252728] text-slate-100 border-[#C7F33C]/60 hover:bg-[#3A3B3C]"
            : "bg-[#252728] text-slate-300 border-[#3A3B3C] hover:bg-[#3A3B3C] hover:text-slate-100 hover:border-[#4E4F50]"
        }`}
        title="Filter card types"
      >
        {current.icon}
        <span className={current.isActive ? "text-[#C7F33C]" : "text-slate-300"}>
          {current.label}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-44 bg-[#252728] border border-[#3A3B3C] rounded-2xl p-1.5 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150 backdrop-blur-md">
          <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-[#3A3B3C]/60 mb-1">
            Card Type
          </div>

          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => handleSelect("ALL")}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer text-left ${
                value === "ALL"
                  ? "bg-[#3A3B3C] text-slate-100 font-semibold"
                  : "text-slate-300 hover:bg-[#3A3B3C]/60 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-3.5 h-3.5 text-slate-400" />
                <span>All Cards</span>
              </div>
              {value === "ALL" && <Check className="w-3.5 h-3.5 text-[#C7F33C]" />}
            </button>

            <button
              type="button"
              onClick={() => handleSelect("SALES_DEAL")}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer text-left ${
                value === "SALES_DEAL"
                  ? "bg-[#3A3B3C] text-[#C7F33C] font-semibold"
                  : "text-slate-300 hover:bg-[#3A3B3C]/60 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <Briefcase className="w-3.5 h-3.5 text-[#C7F33C]" />
                <span>Sales Deals</span>
              </div>
              {value === "SALES_DEAL" && <Check className="w-3.5 h-3.5 text-[#C7F33C]" />}
            </button>

            <button
              type="button"
              onClick={() => handleSelect("INTERNAL_TASK")}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer text-left ${
                value === "INTERNAL_TASK"
                  ? "bg-[#3A3B3C] text-[#C7F33C] font-semibold"
                  : "text-slate-300 hover:bg-[#3A3B3C]/60 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <Wrench className="w-3.5 h-3.5 text-[#C7F33C]" />
                <span>Internal Tasks</span>
              </div>
              {value === "INTERNAL_TASK" && <Check className="w-3.5 h-3.5 text-[#C7F33C]" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
