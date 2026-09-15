import React from "react";
import { Building2, Globe, Search, Plus, SlidersHorizontal } from "lucide-react";

export default function ContactLoading() {
  return (
    <div className="flex flex-col w-full h-full bg-[#252728]">
      <main className="flex-1 overflow-hidden hide-scrollbar p-2 flex flex-col">
        <div className="max-w-[1400px] mx-auto w-full flex-1 flex flex-col min-h-0">
          <div className="flex flex-col h-full bg-[#252728] overflow-hidden select-none p-2">
            <div className="max-w-[1400px] mx-auto w-full h-full flex flex-col md:flex-row gap-8 items-stretch overflow-hidden">
              {/* LEFT: 2 Groups Filter Sidebar Skeleton (Type & Country - Desktop Only) */}
              <div className="hidden md:flex w-full md:w-64 lg:w-72 shrink-0 h-full flex-col select-none">
                {/* GROUP 1: TYPE */}
                <div className="shrink-0">
                  <div className="h-10 flex items-center px-2 mb-2">
                    <span className="font-black text-xs uppercase text-slate-100 tracking-wider">
                      TYPE
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 px-2">
                    {/* ALL TYPE (active state) */}
                    <div className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#C7F33C] text-black">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="p-1.5 rounded-lg shrink-0 bg-black text-white flex items-center justify-center">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-xs tracking-wide">ALL TYPE</span>
                      </div>
                      <div className="h-4 w-7 rounded-full bg-black/15 animate-pulse" />
                    </div>

                    {/* Database Type item skeletons */}
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-transparent"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="p-1.5 rounded-lg shrink-0 bg-[#3A3B3C] text-slate-400 flex items-center justify-center">
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div className="h-3.5 w-20 rounded bg-[#3A3B3C] animate-pulse" />
                        </div>
                        <div className="h-4 w-6 rounded-full bg-[#2A2B2D] animate-pulse" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* GROUP 2: COUNTRY */}
                <div className="flex-1 min-h-0 flex flex-col gap-1 px-2 mt-5">
                  <div className="h-8 flex items-center shrink-0">
                    <span className="font-black text-xs uppercase text-slate-100 tracking-wider">
                      COUNTRY
                    </span>
                  </div>

                  {/* Static Search Input */}
                  <div className="relative mb-2 mt-1 shrink-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <div className="w-full bg-[#3A3B3C] rounded-xl pl-9 pr-8 py-2 h-8 text-xs text-slate-500 flex items-center select-none">
                      Search country...
                    </div>
                  </div>

                  {/* ALL COUNTRY */}
                  <div className="shrink-0 mb-1">
                    <div className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-transparent">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="p-1.5 rounded-lg shrink-0 bg-[#3A3B3C] text-slate-400 flex items-center justify-center">
                          <Globe className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-xs tracking-wide text-slate-300">
                          ALL COUNTRY
                        </span>
                      </div>
                      <div className="h-4 w-7 rounded-full bg-[#2A2B2D] animate-pulse" />
                    </div>
                  </div>

                  {/* Country List skeletons */}
                  <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar flex flex-col gap-1 pb-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div
                        key={i}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-transparent"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="p-1.5 rounded-lg shrink-0 bg-[#3A3B3C] text-slate-400 flex items-center justify-center">
                            <Globe className="w-5 h-5" />
                          </div>
                          <div className="h-3.5 w-16 rounded bg-[#3A3B3C] animate-pulse" />
                        </div>
                        <div className="h-4 w-5 rounded-full bg-[#2A2B2D] animate-pulse" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT: Main Account List Area */}
              <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden w-full">
                {/* Header matching design (Desktop only) */}
                <div className="hidden md:flex h-10 items-center justify-between mb-2 px-1 sticky top-0 bg-[#252728] z-10">
                  <span className="font-black text-xs uppercase text-slate-100 tracking-wider">
                    ACCOUNT
                  </span>

                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    {/* Qualification Status Tabs */}
                    <div className="hidden md:flex gap-1 bg-[#1E1F21] p-1 rounded-full shrink-0">
                      <div className="px-3 py-1 text-xs font-bold rounded-full bg-[#3A3B3C] text-white flex items-center gap-1.5">
                        <span>QUALIFIED</span>
                        <div className="h-3 w-5 rounded bg-white/20 animate-pulse" />
                      </div>
                      <div className="px-3 py-1 text-xs font-bold rounded-full text-slate-400 flex items-center gap-1.5">
                        <span>UNQUALIFIED</span>
                        <div className="h-3 w-4 rounded bg-[#3A3B3C] animate-pulse" />
                      </div>
                    </div>

                    {/* Search button skeleton */}
                    <div className="w-8 h-8 rounded-full bg-[#2E3033] flex items-center justify-center text-slate-400">
                      <Search className="w-4 h-4" />
                    </div>

                    {/* Centralized Filters Button skeleton */}
                    <div className="hidden md:flex px-3.5 py-1.5 rounded-full text-xs font-semibold items-center gap-2 border bg-[#252728] border-[#3A3B3C] text-slate-300">
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Filters</span>
                    </div>

                    {/* Add Account Button skeleton */}
                    <div className="h-8 px-3.5 rounded-full text-xs font-bold bg-[#C7F33C] text-black flex items-center gap-1.5 shrink-0">
                      <Plus className="w-3.5 h-3.5 text-black" />
                      <span>Add</span>
                    </div>
                  </div>
                </div>

                {/* Account Cards List Skeletons */}
                <div className="flex-1 min-h-0 overflow-y-auto pb-8 hide-scrollbar select-none pr-1 space-y-2.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div
                      key={i}
                      className="w-full bg-[#1E1F21] rounded-2xl px-5 py-3 flex flex-col md:grid md:grid-cols-[72px_minmax(0,1fr)_170px_120px_100px] items-center gap-4 animate-pulse select-none border border-transparent"
                    >
                      {/* Col 1: Win Rate % */}
                      <div className="flex items-center gap-2 w-full md:w-auto">
                        <div className="h-7 w-14 rounded-lg bg-[#2A2B2D]" />
                      </div>

                      {/* Col 2: Name & Legal Subtitle */}
                      <div className="flex flex-col gap-1.5 min-w-0 w-full">
                        <div className="h-4 w-36 rounded bg-[#2A2B2D]" />
                        <div className="h-3 w-24 rounded bg-[#2A2B2D]/70" />
                      </div>

                      {/* Col 3: 5 Stars (Desktop only) */}
                      <div className="hidden md:flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <div key={s} className="w-4 h-4 rounded-sm bg-[#2A2B2D]" />
                        ))}
                      </div>

                      {/* Col 4: Type (Desktop only) */}
                      <div className="hidden md:flex items-center">
                        <div className="h-4 w-16 rounded bg-[#2A2B2D]" />
                      </div>

                      {/* Col 5: Country (Desktop only) */}
                      <div className="hidden md:flex items-center justify-end">
                        <div className="h-4 w-16 rounded bg-[#2A2B2D]" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
