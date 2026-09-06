import React from "react";

export default function ContactLoading() {
  return (
    <div className="flex flex-col w-full h-full bg-[#252728] p-6 overflow-hidden gap-4">
      {/* Top Bar Skeleton: Tabs & Search & Add Button */}
      <div className="flex flex-wrap items-center justify-between gap-4 shrink-0">
        {/* Qualification Tabs Skeleton */}
        <div className="flex items-center gap-1.5 bg-[#1C1C1D] p-1.5 rounded-full">
          <div className="h-7 w-28 bg-[#3A3B3C]/70 rounded-full animate-pulse" />
          <div className="h-7 w-32 bg-[#252728] rounded-full animate-pulse" />
        </div>

        {/* Search Box & Add Account Button Skeleton */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-64 md:w-80 bg-[#3A3B3C]/50 rounded-full animate-pulse" />
          <div className="h-8 w-28 bg-[#C7F33C]/30 rounded-full animate-pulse" />
        </div>
      </div>

      {/* Type Filter Pills Skeleton */}
      <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar shrink-0 pl-2 py-1">
        <div className="h-6 w-20 bg-[#C7F33C]/30 rounded-full animate-pulse" />
        <div className="h-6 w-18 bg-[#3A3B3C]/50 rounded-full animate-pulse" />
        <div className="h-6 w-20 bg-[#3A3B3C]/50 rounded-full animate-pulse" />
        <div className="h-6 w-22 bg-[#3A3B3C]/50 rounded-full animate-pulse" />
      </div>

      {/* 2-Column Master-Detail Layout Skeleton */}
      <div className="flex-1 min-h-0 flex gap-4">
        {/* Left Column: Account Master List Skeleton */}
        <div className="w-80 md:w-96 shrink-0 flex flex-col h-full bg-[#252728] rounded-3xl overflow-hidden border border-[#3A3B3C]/30">
          {/* Header */}
          <div className="h-14 px-4 flex items-center justify-between shrink-0 bg-[#252728] border-b border-[#3A3B3C]/30">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-[#C7F33C]/40 animate-pulse" />
              <div className="h-4 w-28 bg-[#3A3B3C]/70 rounded animate-pulse" />
            </div>
            <div className="h-6 w-24 bg-[#3A3B3C]/50 rounded-full animate-pulse" />
          </div>

          {/* Cards List Skeleton */}
          <div className="flex-1 p-3 space-y-3 overflow-hidden">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="p-3.5 rounded-2xl bg-[#3A3B3C]/30 border border-[#3A3B3C]/40 flex flex-col gap-2.5 animate-pulse"
              >
                <div className="flex items-start justify-between">
                  <div className="h-4 w-36 bg-[#4E4F50]/60 rounded" />
                  <div className="h-4 w-12 bg-[#4E4F50]/40 rounded-full" />
                </div>
                <div className="h-3 w-48 bg-[#4E4F50]/40 rounded" />
                <div className="flex items-center justify-between pt-1">
                  <div className="h-3 w-20 bg-[#4E4F50]/30 rounded" />
                  <div className="h-3 w-16 bg-[#4E4F50]/30 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Account Detail & Tabs Skeleton */}
        <div className="flex-1 min-w-0 flex flex-col h-full gap-4 overflow-hidden">
          {/* Top Detail Card Skeleton */}
          <div className="p-5 rounded-3xl bg-[#3A3B3C]/20 border border-[#3A3B3C]/40 flex flex-col gap-4 animate-pulse">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-6 w-56 bg-[#4E4F50]/70 rounded-lg" />
                <div className="h-4 w-72 bg-[#4E4F50]/40 rounded" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-24 bg-[#3A3B3C]/60 rounded-xl" />
                <div className="h-8 w-8 bg-[#3A3B3C]/60 rounded-xl" />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="p-3 rounded-xl bg-[#252728]/60 flex flex-col gap-1.5">
                  <div className="h-3 w-16 bg-[#4E4F50]/40 rounded" />
                  <div className="h-4 w-24 bg-[#4E4F50]/60 rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Sub-tabs & Content Skeleton */}
          <div className="flex-1 min-h-0 bg-[#3A3B3C]/20 border border-[#3A3B3C]/40 rounded-3xl p-5 flex flex-col gap-4 animate-pulse">
            <div className="flex items-center gap-3 border-b border-[#3A3B3C]/40 pb-3">
              <div className="h-7 w-24 bg-[#3A3B3C]/80 rounded-full" />
              <div className="h-7 w-24 bg-[#3A3B3C]/40 rounded-full" />
              <div className="h-7 w-24 bg-[#3A3B3C]/40 rounded-full" />
              <div className="h-7 w-24 bg-[#3A3B3C]/40 rounded-full" />
            </div>

            <div className="space-y-3 flex-1 pt-2">
              {[1, 2, 3, 4].map((row) => (
                <div key={row} className="h-12 w-full bg-[#252728]/60 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
