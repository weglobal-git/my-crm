"use client";

import { Search } from "lucide-react";
import React, { useState, useEffect, useRef, useCallback } from "react";

interface PipelineSearchProps {
  initialSearch?: string;
  onSearch: (term: string) => void;
  debounceMs?: number;
}

export const PipelineSearch = React.memo(function PipelineSearch({
  initialSearch = "",
  onSearch,
  debounceMs = 280,
}: PipelineSearchProps) {
  const [term, setTerm] = useState(initialSearch);
  const [isExpanded, setIsExpanded] = useState(Boolean(initialSearch.trim()));
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastEmittedRef = useRef(initialSearch);
  const termRef = useRef(term);
  const isExpandedRef = useRef(isExpanded);
  const isFocusedRef = useRef(false);
  const isComposingRef = useRef(false);

  // Sync refs
  useEffect(() => {
    termRef.current = term;
  }, [term]);

  useEffect(() => {
    isExpandedRef.current = isExpanded;
  }, [isExpanded]);

  // Sync genuine EXTERNAL search changes (e.g. quick filter clicks or reset), ignore echoes of our own emissions
  useEffect(() => {
    // If the user is currently focused and typing in this search input, NEVER wipe their text!
    if (isFocusedRef.current) {
      return;
    }
    if (initialSearch === lastEmittedRef.current || initialSearch === termRef.current) {
      return;
    }
    setTerm(initialSearch);
    lastEmittedRef.current = initialSearch;
    if (initialSearch.trim()) {
      setIsExpanded(true);
    }
  }, [initialSearch]);

  // Debounced search emitter (280ms)
  useEffect(() => {
    if (term === lastEmittedRef.current) {
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      if (isComposingRef.current) {
        return;
      }
      lastEmittedRef.current = term;
      onSearch(term);
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [term, debounceMs, onSearch]);

  // Focus input on expand
  useEffect(() => {
    if (isExpanded) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isExpanded]);

  // Instant clear and close
  const handleClearAndClose = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setTerm("");
    lastEmittedRef.current = "";
    onSearch("");
    setIsExpanded(false);
    if (document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      (document.activeElement as HTMLElement).blur();
    }
  }, [onSearch]);

  // Keyboard shortcut: Press 'S' or 'ห' on desktop to open search, and 'Escape' to clear and close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if modifier keys are pressed (Cmd+S, Ctrl+S, Alt+S)
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      // Ignore if user is already focused in an input, textarea, select, or editable element
      const target = e.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName || "")
      ) {
        return;
      }

      // Ignore if EditDealPanel is open
      if (
        document.body.dataset.dealPanelOpen === "true" ||
        document.querySelector('[data-deal-panel-open="true"]')
      ) {
        return;
      }

      // ESCAPE key on window: if search is expanded or has a term, clear and close it!
      if (e.key === "Escape") {
        if (isExpandedRef.current || termRef.current.trim() !== "") {
          e.preventDefault();
          handleClearAndClose();
          return;
        }
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
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
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
        if (!termRef.current.trim()) {
          setIsExpanded(false);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isExpanded]);

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className={`hidden md:flex items-center justify-center w-8 h-8 rounded-full transition-all shrink-0 cursor-pointer ${
          term.trim()
            ? "bg-[#252728] border border-[#C7F33C] text-[#C7F33C] shadow-sm"
            : "bg-[#3A3B3C] hover:bg-[#4E4F50] text-slate-300 hover:text-white"
        }`}
        title="Search cards (S)"
      >
        <Search className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      className="hidden md:flex items-center bg-[#252728] border border-[#C7F33C] rounded-full py-1 pl-3 pr-1.5 gap-1.5 w-48 xl:w-56 shrink-0 transition-all duration-300 ease-out shadow-lg animate-in fade-in zoom-in-95"
    >
      <Search className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />
      <input
        ref={inputRef}
        type="text"
        className="flex-1 bg-transparent border-none outline-none text-[16px] text-slate-100 placeholder:text-slate-400 min-w-0"
        placeholder="Search..."
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onFocus={() => {
          isFocusedRef.current = true;
        }}
        onBlur={() => {
          isFocusedRef.current = false;
        }}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={(e) => {
          isComposingRef.current = false;
          setTerm(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            handleClearAndClose();
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current);
            }
            if (term !== lastEmittedRef.current) {
              lastEmittedRef.current = term;
              onSearch(term);
            }
            inputRef.current?.blur();
          } else if (e.key === "ArrowDown") {
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
