"use client";

import React, { useState, useEffect, useRef } from "react";
import { Plus, X, Check } from "lucide-react";

interface PipelineQuickFiltersProps {
  userId: string;
  activeFilter?: string;
  onSelectFilter: (filter: string) => void;
}

const MAX_FILTERS = 5;

export function PipelineQuickFilters({
  userId,
  activeFilter = "",
  onSelectFilter,
}: PipelineQuickFiltersProps) {
  const storageKey = `pipeline_quick_filters_${userId || "default"}`;

  const [filters, setFilters] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, MAX_FILTERS);
        }
      }
    } catch {
      // Fallback if localStorage access fails
    }
    return [];
  });
  const [isAdding, setIsAdding] = useState(false);
  const [newFilterText, setNewFilterText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [prevStorageKey, setPrevStorageKey] = useState(storageKey);
  if (storageKey !== prevStorageKey) {
    setPrevStorageKey(storageKey);
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
      if (saved) {
        const parsed = JSON.parse(saved);
        setFilters(Array.isArray(parsed) ? parsed.slice(0, MAX_FILTERS) : []);
      } else {
        setFilters([]);
      }
    } catch {
      setFilters([]);
    }
  }

  // Focus input when user clicks add button
  useEffect(() => {
    if (isAdding) {
      inputRef.current?.focus();
    }
  }, [isAdding]);

  const saveFilters = (newFilters: string[]) => {
    setFilters(newFilters);
    try {
      localStorage.setItem(storageKey, JSON.stringify(newFilters));
    } catch {
      // Ignore storage errors
    }
  };

  const handleToggle = (filter: string) => {
    if (activeFilter.toLowerCase() === filter.toLowerCase()) {
      // Unfilter
      onSelectFilter("");
    } else {
      // Filter
      onSelectFilter(filter);
    }
  };

  const handleAddFilter = () => {
    const trimmed = newFilterText.trim();
    if (!trimmed) {
      setIsAdding(false);
      setNewFilterText("");
      return;
    }

    // Check duplicate (case-insensitive)
    const exists = filters.some(
      (f) => f.toLowerCase() === trimmed.toLowerCase()
    );

    if (!exists && filters.length < MAX_FILTERS) {
      const updated = [...filters, trimmed];
      saveFilters(updated);
    }

    setNewFilterText("");
    setIsAdding(false);
  };

  const handleDelete = (e: React.MouseEvent, filterToDelete: string) => {
    e.stopPropagation();
    const updated = filters.filter((f) => f !== filterToDelete);
    saveFilters(updated);

    // If deleting active filter, reset filter
    if (activeFilter.toLowerCase() === filterToDelete.toLowerCase()) {
      onSelectFilter("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleAddFilter();
    } else if (e.key === "Escape") {
      setIsAdding(false);
      setNewFilterText("");
    }
  };

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-[380px] shrink-0">
      {filters.map((filter) => {
        const isActive = activeFilter.toLowerCase() === filter.toLowerCase();

        return (
          <div
            key={filter}
            onClick={() => handleToggle(filter)}
            className={`group relative flex items-center px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer border transition-all select-none ${
              isActive
                ? "bg-[#C7F33C] text-slate-950 border-[#C7F33C] shadow-sm shadow-[#C7F33C]/20"
                : "bg-[#252728] text-slate-300 border-[#3A3B3C] hover:bg-[#3A3B3C] hover:text-slate-100 hover:border-[#4E4F50]"
            }`}
            title={isActive ? `Click to clear "${filter}" filter` : `Filter by "${filter}"`}
          >
            <span className="truncate max-w-[90px]">{filter}</span>

            {/* Quick delete button visible on hover */}
            <button
              type="button"
              onClick={(e) => handleDelete(e, filter)}
              className={`ml-1 -mr-1 p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${
                isActive
                  ? "hover:bg-black/20 text-slate-900"
                  : "hover:bg-[#4E4F50] text-slate-400 hover:text-rose-400"
              }`}
              title={`Remove "${filter}"`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      {/* Inline Add Input */}
      {isAdding ? (
        <div className="flex items-center gap-1 bg-[#1E1F20] border border-[#C7F33C] rounded-full px-2 py-0.5 shadow-sm">
          <input
            ref={inputRef}
            type="text"
            value={newFilterText}
            onChange={(e) => setNewFilterText(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleAddFilter}
            maxLength={20}
            placeholder="Name"
            className="w-20 bg-transparent text-slate-100 text-xs focus:outline-none placeholder-slate-500 py-1"
          />
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleAddFilter();
            }}
            className="p-1 text-black bg-[#C7F33C] hover:bg-[#b0d932] rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Save filter"
          >
            <Check className="w-3 h-3 stroke-[2.5]" />
          </button>
        </div>
      ) : (
        filters.length < MAX_FILTERS && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold bg-[#252728] text-slate-400 hover:text-slate-200 border border-dashed border-[#3A3B3C] hover:border-slate-500 transition-all shrink-0"
            title="Add quick filter (max 5)"
          >
            <Plus className="w-3.5 h-3.5" />
            {filters.length === 0 && <span className="text-[11px]">Filter</span>}
          </button>
        )
      )}
    </div>
  );
}
