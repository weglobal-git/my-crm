"use client";

import { Search } from "lucide-react";
import { useState, useEffect, useRef } from "react";

interface PipelineSearchProps {
  initialSearch?: string;
  onSearch: (term: string) => void;
}

export function PipelineSearch({ initialSearch = "", onSearch }: PipelineSearchProps) {
  const [term, setTerm] = useState(initialSearch);
  const initialMount = useRef(true);
  
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      onSearch(term);
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [term, onSearch]);

  return (
    <div className="relative hidden lg:block w-64 xl:w-80">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="h-4 w-4 text-slate-400" />
      </div>
      <input
        type="text"
        className="block w-full bg-[#3A3B3C] text-slate-200 placeholder-slate-500 hover:bg-[#4E4F50] rounded-full py-1.5 pl-10 pr-4 border border-transparent focus:outline-none focus:border-[#C7F33C] focus:bg-[#3A3B3C] transition-all text-sm"
        placeholder="Search projects or customers..."
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
    </div>
  );
}
