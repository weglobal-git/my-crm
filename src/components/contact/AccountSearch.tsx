"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search } from "lucide-react";

interface AccountSearchProps {
  value: string;
  onChange: (term: string) => void;
  placeholder?: string;
  className?: string;
}

export const AccountSearch = React.memo(function AccountSearch({
  value,
  onChange,
  placeholder = "Search accounts...",
  className = "",
}: AccountSearchProps) {
  const [isExpanded, setIsExpanded] = useState(Boolean(value.trim()));
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // If value is set externally and non-empty, expand
  useEffect(() => {
    if (value.trim()) {
      setIsExpanded(true);
    }
  }, [value]);

  // Focus and select input on expand
  useEffect(() => {
    if (isExpanded) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isExpanded]);

  const isExpandedRef = useRef(isExpanded);
  const valueRef = useRef(value);

  useEffect(() => {
    isExpandedRef.current = isExpanded;
    valueRef.current = value;
  }, [isExpanded, value]);

  const handleClearAndClose = useCallback(() => {
    onChange("");
    setIsExpanded(false);
    if (document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      (document.activeElement as HTMLElement).blur();
    }
  }, [onChange]);

  // Keyboard shortcut: Press 'S' to open/focus, 'ESC' to clear & close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if modifier keys are pressed (Cmd+S, Ctrl+S, Alt+S)
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      // Ignore if EditDealPanel or similar slide-overs are open
      if (
        document.body.dataset.dealPanelOpen === "true" ||
        document.querySelector('[data-deal-panel-open="true"]')
      ) {
        return;
      }

      // ESCAPE key on window: if search is expanded or has a term, clear and close it!
      if (e.key === "Escape") {
        if (isExpandedRef.current || valueRef.current.trim() !== "") {
          e.preventDefault();
          handleClearAndClose();
          return;
        }
      }

      // Ignore if user is already focused in an input, textarea, select, or editable element
      const target = e.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName || "")
      ) {
        return;
      }

      const isSearchKey =
        e.key === "s" ||
        e.key === "S" ||
        e.key === "ห" ||
        e.key === "ฆ" ||
        e.code === "KeyS";

      if (isSearchKey) {
        e.preventDefault();
        setIsExpanded(true);
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 50);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClearAndClose]);

  // Click outside listener: collapse if input is empty
  useEffect(() => {
    if (!isExpanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (!value.trim()) {
          setIsExpanded(false);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isExpanded, value]);

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className={`flex items-center justify-center w-8 h-8 rounded-full transition-all shrink-0 cursor-pointer ${
          value.trim()
            ? "bg-[#252728] border border-[#C7F33C] text-[#C7F33C] shadow-sm"
            : "bg-[#3A3B3C] hover:bg-[#4E4F50] text-slate-300 hover:text-white"
        } ${className}`}
        title="Search accounts (S)"
      >
        <Search className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex items-center bg-[#252728] border border-[#C7F33C] rounded-full py-1 pl-3 pr-1.5 gap-1.5 w-48 xl:w-56 shrink-0 transition-all duration-300 ease-out shadow-lg animate-in fade-in zoom-in-95 ${className}`}
    >
      <Search className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />
      <input
        ref={inputRef}
        type="text"
        className="flex-1 bg-transparent border-none outline-none text-xs text-slate-100 placeholder:text-slate-400 min-w-0"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            handleClearAndClose();
          } else if (e.key === "ArrowDown" || e.key === "Enter") {
            inputRef.current?.blur();
          }
        }}
      />
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          handleClearAndClose();
        }}
        onClick={handleClearAndClose}
        className="text-xs font-medium text-slate-400 hover:text-slate-100 active:text-white px-2 py-0.5 rounded-full hover:bg-[#3A3B3C] transition-colors shrink-0 cursor-pointer"
        title="Clear search"
      >
        Clear
      </button>
    </div>
  );
});

