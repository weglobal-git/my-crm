"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, MapPin, Loader2, X, Globe2 } from "lucide-react";
import { searchPlacesAutocomplete, getPlaceDetails, PlacePrediction, ParsedAddressResult } from "@/lib/actions/places";

interface AddressAutocompleteProps {
  onAddressSelected: (address: ParsedAddressResult) => void;
  placeholder?: string;
  className?: string;
}

export function AddressAutocomplete({
  onAddressSelected,
  placeholder = "Search business name, landmark, or address worldwide...",
  className = "",
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isResolvingDetails, setIsResolvingDetails] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    setSelectedIndex(-1);
    if (val.trim().length < 2) {
      setPredictions([]);
      setIsOpen(false);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
  };

  // Debounced autocomplete search
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchPlacesAutocomplete(trimmed);
        setPredictions(results);
        setIsOpen(results.length > 0);
      } catch (err) {
        console.error("Autocomplete search error:", err);
        setPredictions([]);
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query]);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectPrediction = async (pred: PlacePrediction) => {
    setIsOpen(false);
    setQuery(pred.mainText);
    setIsResolvingDetails(true);

    try {
      const details = await getPlaceDetails(pred.placeId);
      if (details) {
        onAddressSelected(details);
      }
    } catch (err) {
      console.error("Failed to resolve place details:", err);
    } finally {
      setIsResolvingDetails(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || predictions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < predictions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : predictions.length - 1));
    } else if (e.key === "Enter" && selectedIndex >= 0 && selectedIndex < predictions.length) {
      e.preventDefault();
      handleSelectPrediction(predictions[selectedIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="relative flex items-center">
        <div className="absolute left-3.5 text-slate-400 pointer-events-none flex items-center gap-1.5">
          {isResolvingDetails ? (
            <Loader2 className="w-4 h-4 text-[#C7F33C] animate-spin" />
          ) : (
            <Search className="w-4 h-4 text-slate-400" />
          )}
        </div>

        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => {
            if (predictions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-[#1C1C1D] text-slate-100 placeholder-slate-500 rounded-xl pl-10 pr-24 py-2.5 text-xs border border-[#3A3B3C] focus:outline-none focus:border-[#C7F33C] focus:ring-1 focus:ring-[#C7F33C] transition-all shadow-inner"
        />

        <div className="absolute right-3 flex items-center gap-1.5">
          {isLoading && <Loader2 className="w-3.5 h-3.5 text-[#C7F33C] animate-spin" />}
          {query && (
            <button
              type="button"
              onClick={() => handleQueryChange("")}
              className="p-1 text-slate-400 hover:text-slate-200 rounded-full transition-colors cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-xs uppercase font-bold text-slate-400 px-1.5 py-0.5 rounded bg-[#2E3033] flex items-center gap-1 border border-[#3A3B3C]">
            <Globe2 className="w-3 h-3 text-[#C7F33C]" />
            <span>Global</span>
          </span>
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      {isOpen && predictions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#1C1C1D] border border-[#3A3B3C] rounded-2xl shadow-2xl z-50 overflow-hidden max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="p-1.5 space-y-0.5">
            {predictions.map((pred, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={pred.placeId}
                  onClick={() => handleSelectPrediction(pred)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`px-3 py-2.5 rounded-xl cursor-pointer transition-colors flex items-start gap-2.5 ${
                    isSelected ? "bg-[#2E3033] text-white" : "text-slate-300 hover:bg-[#252728]"
                  }`}
                >
                  <MapPin className={`w-4 h-4 shrink-0 mt-0.5 ${isSelected ? "text-[#C7F33C]" : "text-slate-500"}`} />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-semibold text-slate-100 truncate">
                      {pred.mainText}
                    </span>
                    {pred.secondaryText && (
                      <span className="text-xs text-slate-400 truncate">
                        {pred.secondaryText}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-3 py-1.5 bg-[#141415] border-t border-[#252728] flex items-center justify-between text-xs text-slate-400">
            <span>Powered by Google Places</span>
            <span>Press Enter to select</span>
          </div>
        </div>
      )}
    </div>
  );
}
