"use client";

import { Search } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";

interface PipelineSearchProps {
  initialSearch?: string;
  onSearch: (term: string) => void;
}

export function PipelineSearch({ initialSearch = "", onSearch }: PipelineSearchProps) {
  const [term, setTerm] = useState(initialSearch);
  const [prevInitialSearch, setPrevInitialSearch] = useState(initialSearch);
  const [lastEmitted, setLastEmitted] = useState(initialSearch);
  const [isExpanded, setIsExpanded] = useState(Boolean(initialSearch.trim()));
  const initialMount = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external search changes (e.g. from quick filter clicks or URL changes)
  if (initialSearch !== prevInitialSearch) {
    setPrevInitialSearch(initialSearch);
    setTerm(initialSearch);
    setLastEmitted(initialSearch);
    if (initialSearch.trim()) {
      setIsExpanded(true);
    }
  }

  // Debounce search emit
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }

    if (term === lastEmitted) return;

    const delayDebounceFn = setTimeout(() => {
      setLastEmitted(term);
      onSearch(term);
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [term, lastEmitted, onSearch]);

  // Focus input on expand
  useEffect(() => {
    if (isExpanded) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isExpanded]);

  // Keyboard shortcut: Press 'S' or 'ห' on desktop to open search and focus input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is already focused in an input, textarea, select, or editable element
      const target = e.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName || "")
      ) {
        return;
      }

      // Ignore if modifier keys are pressed (Cmd+S, Ctrl+S, Alt+S)
      if (e.metaKey || e.ctrlKey || e.altKey) {
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
  }, []);

  const handleClearAndClose = useCallback(() => {
    setTerm("");
    setLastEmitted("");
    onSearch("");
    setIsExpanded(false);
  }, [onSearch]);

  // Click outside listener: collapse if input is empty
  useEffect(() => {
    if (!isExpanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (!term.trim()) {
          setIsExpanded(false);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isExpanded, term]);

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
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            handleClearAndClose();
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
}
