"use client";

import React, { useState, useRef, useEffect } from "react";
import { Search, X, ChevronDown, Loader2 } from "lucide-react";

export interface SubBarTab {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
}

export interface SubBarActionItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "default" | "danger" | "success";
}

export interface SubBarSearchConfig {
  isActive: boolean;
  query: string;
  placeholder?: string;
  onToggle: () => void;
  onChange: (query: string) => void;
  onClear: () => void;
}

export interface EditDealSubBarProps {
  // Left side tabs or custom content
  tabs?: SubBarTab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  leftContent?: React.ReactNode;

  // Right side: At most 2 buttons (Search, Actions)
  search?: SubBarSearchConfig;
  actions?: SubBarActionItem[];
  customActionSlot?: React.ReactNode;
  className?: string;
}

export function EditDealSubBar({
  tabs,
  activeTab,
  onTabChange,
  leftContent,
  search,
  actions,
  customActionSlot,
  className,
}: EditDealSubBarProps) {
  const [showActionMenu, setShowActionMenu] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  // Close action dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setShowActionMenu(false);
      }
    }
    if (showActionMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showActionMenu]);

  // If search is currently active in expanded mode
  if (search?.isActive) {
    return (
      <div className={className ? `flex items-center gap-2 ${className} animate-in fade-in duration-200` : "flex items-center gap-2 px-4 py-2 border-b border-[#1C1C1D] bg-[#252728] shrink-0 min-h-[44px] animate-in fade-in duration-200"}>
        <div className="relative flex-1 flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-[#C7F33C]" />
          <input
            autoFocus
            type="text"
            placeholder={search.placeholder || "Search..."}
            value={search.query}
            onChange={(e) => search.onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                search.onToggle();
              }
            }}
            className="w-full bg-[#1C1C1D] border border-[#C7F33C]/60 rounded-full pl-9 pr-8 py-1 text-xs text-slate-100 focus:outline-none focus:border-[#C7F33C] transition-all placeholder:text-slate-500"
          />
          {search.query && (
            <button
              type="button"
              onClick={search.onClear}
              className="absolute right-2.5 p-0.5 text-slate-400 hover:text-white rounded-full transition-colors cursor-pointer"
              title="Clear"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            search.onToggle();
            search.onClear();
          }}
          className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white rounded-md hover:bg-[#3A3B3C] transition-colors shrink-0 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className={className ? `flex items-center justify-between ${className}` : "flex items-center justify-between px-4 py-2 border-b border-[#1C1C1D] bg-[#252728] shrink-0 min-h-[44px]"}>
      {/* Left: Sub-tabs or custom content */}
      <div className="flex items-center gap-2 min-w-0">
        {tabs && tabs.length > 0 && onTabChange ? (
          <div className="flex items-center gap-1 bg-[#1C1C1D] p-0.5 rounded-lg" role="tablist">
            {tabs.map((tab) => {
              const isCurrent = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  role="tab"
                  aria-selected={isCurrent}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors flex items-center cursor-pointer ${
                    isCurrent
                      ? "bg-[#3A3B3C] text-[#C7F33C]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.badge}
                </button>
              );
            })}
          </div>
        ) : (
          leftContent || <div />
        )}
      </div>

      {/* Right: At most 2 buttons: Search & Actions */}
      <div className="flex items-center gap-2 shrink-0 relative">
        {/* Filter Pill if query exists but not expanded */}
        {search && search.query && (
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-[#C7F33C] bg-[#1C1C1D] px-2 py-0.5 rounded-full border border-[#C7F33C]/30">
            <Search className="w-3 h-3" />
            <span className="truncate max-w-[100px]">&quot;{search.query}&quot;</span>
            <button
              type="button"
              onClick={search.onClear}
              className="ml-0.5 text-slate-400 hover:text-white cursor-pointer"
              title="Clear filter"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* 1. Search Button (Icon only) */}
        {search && (
          <button
            type="button"
            onClick={search.onToggle}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              search.query
                ? "text-[#C7F33C] bg-[#3A3B3C]"
                : "text-slate-400 hover:text-slate-200 hover:bg-[#3A3B3C]"
            }`}
            title="Search"
            aria-label="Search"
          >
            <Search className="w-4 h-4" />
          </button>
        )}

        {/* Custom Action Slot (e.g. for specialized popovers if needed) */}
        {customActionSlot}

        {/* 2. Actions Dropdown Button */}
        {actions && actions.length > 0 && (
          <div className="relative" ref={actionMenuRef}>
            <button
              type="button"
              onClick={() => setShowActionMenu((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors border cursor-pointer ${
                showActionMenu
                  ? "bg-[#4E4F50] text-white border-slate-400"
                  : "bg-[#3A3B3C] text-slate-200 hover:text-white border-[#4E4F50] hover:border-slate-400"
              }`}
              title="Tab actions"
            >
              {actions.some((a) => a.loading) && (
                <Loader2 className="w-3 h-3 animate-spin text-[#C7F33C]" />
              )}
              <span>Actions</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showActionMenu && (
              <div className="absolute right-0 top-full mt-1.5 min-w-[170px] bg-[#252728] border border-[#3A3B3C] rounded-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                {actions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      disabled={action.disabled || action.loading}
                      onClick={() => {
                        setShowActionMenu(false);
                        action.onClick();
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-colors text-left cursor-pointer disabled:opacity-50 ${
                        action.variant === "danger"
                          ? "text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                          : action.variant === "success"
                          ? "text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                          : "text-slate-200 hover:bg-[#3A3B3C] hover:text-white"
                      }`}
                    >
                      {action.loading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-[#C7F33C]" />
                      ) : Icon ? (
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                      ) : null}
                      <span className="truncate">{action.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
