"use client";

import { Search, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";

interface PipelineSearchProps {
  initialSearch?: string;
  onSearch: (term: string) => void;
}

export function PipelineSearch({ initialSearch = "", onSearch }: PipelineSearchProps) {
  const [term, setTerm] = useState(initialSearch);
  const [prevInitialSearch, setPrevInitialSearch] = useState(initialSearch);
  const [lastEmitted, setLastEmitted] = useState(initialSearch);
  const initialMount = useRef(true);

  // Sync external search changes (e.g. from quick filter clicks or URL changes)
  if (initialSearch !== prevInitialSearch) {
    setPrevInitialSearch(initialSearch);
    setTerm(initialSearch);
    setLastEmitted(initialSearch);
  }
  
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

  const handleClear = () => {
    setTerm("");
    setLastEmitted("");
    onSearch("");
  };

  return (
    <div className="relative hidden lg:block w-28 xl:w-36 shrink-0">
      <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
        <Search className="h-3.5 w-3.5 text-slate-400" />
      </div>
      <input
        type="text"
        className="block w-full bg-[#3A3B3C] text-slate-200 placeholder-slate-500 hover:bg-[#4E4F50] rounded-full py-1.5 pl-8 pr-6 border border-transparent focus:outline-none focus:border-[#C7F33C] focus:bg-[#3A3B3C] transition-all text-xs"
        placeholder="Search..."
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      {term && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-400 hover:text-slate-200"
          title="Clear search"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

