import React from "react";
import { Check, Search, Plus, SlidersHorizontal, Rows3, Rows2 } from "lucide-react";

export default function ContactLoading() {
  return (
    <div className="flex flex-col w-full h-full bg-[#252728]">
      <main className="flex-1 overflow-hidden hide-scrollbar p-2 flex flex-col">
        <div className="max-w-[1400px] mx-auto w-full flex-1 flex flex-col min-h-0">
          <div className="flex flex-col h-full bg-[#252728] overflow-hidden select-none p-2">
            <div className="max-w-[1400px] mx-auto w-full h-full flex flex-col md:flex-row gap-8 items-stretch overflow-hidden">
              {/* LEFT: 2 Groups Filter Sidebar Skeleton (Matching ProductFilterSidebar / AccountFilterSidebar) */}
              <div className="hidden md:flex w-full md:w-64 lg:w-72 shrink-0 h-full flex-col select-none gap-2 pb-2">
                {/* GROUP 1: TYPE */}
                <div className="shrink-0 flex flex-col">
                  <div className="h-8 flex items-center justify-between px-2 shrink-0">
                    <span className="font-black text-xs uppercase text-slate-100 tracking-wider">
                      TYPE
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5 pr-1">
                    {/* ALL header row */}
                    <div className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border bg-[#2D2E30] border-[#4E5052] text-slate-100">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-4 h-4 rounded shrink-0 flex items-center justify-center border bg-[#2D2E30] border-[#4E5052] text-slate-200">
                          <Check className="w-3 h-3 stroke-[2.5]" />
                        </div>
                        <span className="text-xs font-bold uppercase tracking-wider truncate">
                          ALL
                        </span>
                      </div>
                      <div className="h-3.5 w-6 rounded bg-[#3A3B3C] animate-pulse" />
                    </div>

                    {/* Type checkbox item skeletons */}
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-1 rounded-md"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-4 h-4 rounded shrink-0 flex items-center justify-center border bg-[#2D2E30] border-[#4E5052] text-slate-200">
                            <Check className="w-3 h-3 stroke-[2.5]" />
                          </div>
                          <div className="h-3 w-20 rounded bg-[#3A3B3C] animate-pulse" />
                        </div>
                        <div className="h-3 w-5 rounded bg-[#3A3B3C]/70 animate-pulse" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* DIVIDER */}
                <div className="border-t border-[#3A3B3C]/60 my-0.5 shrink-0" />

                {/* GROUP 2: COUNTRY */}
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="h-8 flex items-center justify-between px-2 shrink-0">
                    <span className="font-black text-xs uppercase text-slate-100 tracking-wider">
                      COUNTRY
                    </span>
                  </div>

                  {/* Static Search Input */}
                  <div className="relative mb-2 mt-0.5 shrink-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    <div className="w-full bg-[#3A3B3C] rounded-full pl-8 pr-7 py-1 text-xs text-slate-500 flex items-center select-none">
                      Search country...
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-0.5 pr-1">
                    {/* ALL header row */}
                    <div className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border bg-[#2D2E30] border-[#4E5052] text-slate-100">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-4 h-4 rounded shrink-0 flex items-center justify-center border bg-[#2D2E30] border-[#4E5052] text-slate-200">
                          <Check className="w-3 h-3 stroke-[2.5]" />
                        </div>
                        <span className="text-xs font-bold uppercase tracking-wider truncate">
                          ALL
                        </span>
                      </div>
                      <div className="h-3.5 w-6 rounded bg-[#3A3B3C] animate-pulse" />
                    </div>

                    {/* Country checkbox item skeletons */}
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <div
                        key={i}
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-1 rounded-md"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-4 h-4 rounded shrink-0 flex items-center justify-center border bg-[#2D2E30] border-[#4E5052] text-slate-200">
                            <Check className="w-3 h-3 stroke-[2.5]" />
                          </div>
                          <div className="h-3 w-24 rounded bg-[#3A3B3C] animate-pulse" />
                        </div>
                        <div className="h-3 w-5 rounded bg-[#3A3B3C]/70 animate-pulse" />
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

                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
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
                    <div className="w-8 h-8 rounded-full bg-[#3A3B3C] flex items-center justify-center text-slate-400">
                      <Search className="w-3.5 h-3.5" />
                    </div>

                    {/* Card Density Switcher skeleton */}
                    <div className="hidden md:flex h-8 p-0.5 rounded-full bg-[#252728] border border-[#3A3B3C] items-center gap-0.5 shrink-0">
                      <div className="w-7 h-7 rounded-full bg-[#3A3B3C] text-[#C7F33C] flex items-center justify-center">
                        <Rows3 className="w-3.5 h-3.5 shrink-0" />
                      </div>
                      <div className="w-7 h-7 rounded-full text-slate-400 flex items-center justify-center">
                        <Rows2 className="w-3.5 h-3.5 shrink-0" />
                      </div>
                    </div>

                    {/* Centralized Filters Button skeleton */}
                    <div className="hidden md:flex h-8 px-3.5 rounded-full text-xs font-semibold items-center gap-2 border bg-[#252728] border-[#3A3B3C] text-slate-300">
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

                {/* Compact Flat Account Rows List Skeletons (Default Compact Mode) */}
                <div className="flex-1 min-h-0 overflow-hidden pb-8 hide-scrollbar select-none pr-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
                    <div
                      key={i}
                      className="w-full px-3 py-1.5 min-h-[36px] flex items-center border-b border-[#3A3B3C]/60 animate-pulse select-none"
                    >
                      <div className="hidden sm:grid grid-cols-[92px_minmax(0,1fr)_124px_104px_100px] gap-3 items-center w-full">
                        <div className="w-[92px] shrink-0 flex items-center gap-1.5">
                          <div className="h-3 w-8 rounded bg-[#3A3B3C]" />
                          <div className="h-2.5 w-6 rounded bg-[#3A3B3C]/70" />
                        </div>
                        <div className="min-w-0 pr-2 flex items-center">
                          <div className="h-3.5 w-44 rounded bg-[#3A3B3C]" />
                        </div>
                        <div className="w-[124px] shrink-0 flex items-center gap-1">
                          <div className="w-3 h-3 rounded-sm bg-[#3A3B3C]" />
                          <div className="h-3 w-3 rounded bg-[#3A3B3C]/70" />
                        </div>
                        <div className="w-[104px] shrink-0 flex items-center">
                          <div className="h-3 w-14 rounded bg-[#3A3B3C]/80" />
                        </div>
                        <div className="w-[100px] shrink-0 flex items-center justify-end">
                          <div className="h-3 w-14 rounded bg-[#3A3B3C]/80" />
                        </div>
                      </div>

                      <div className="flex sm:hidden items-center justify-between w-full">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="h-3 w-8 rounded bg-[#3A3B3C] shrink-0" />
                          <div className="h-3.5 w-32 rounded bg-[#3A3B3C]" />
                        </div>
                        <div className="h-3 w-12 rounded bg-[#3A3B3C]/70 shrink-0" />
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
