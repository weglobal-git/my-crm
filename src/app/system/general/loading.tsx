import React from 'react';

export default function SystemGeneralLoading() {
  return (
    <div className="flex-1 overflow-y-auto hide-scrollbar p-6 bg-[#252728]">
      <div className="max-w-[1400px] mx-auto w-full flex flex-col h-full animate-pulse">
        <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto">
          <div className="flex gap-8 w-full">
            {/* Left Sidebar Skeleton */}
            <div className="w-64 shrink-0 flex flex-col gap-4">
              <div className="h-8 w-36 bg-[#3A3B3C] rounded-lg mb-4" />
              <div className="h-4 w-28 bg-[#3A3B3C]/60 rounded mb-1" />
              <div className="h-12 w-full bg-[#3A3B3C] rounded-xl" />
              <div className="h-12 w-full bg-[#3A3B3C]/50 rounded-xl" />
              <div className="h-12 w-full bg-[#3A3B3C]/50 rounded-xl" />
              <div className="h-12 w-full bg-[#3A3B3C]/50 rounded-xl" />
            </div>

            {/* Right Content Skeleton */}
            <div className="flex-1 flex flex-col gap-6">
              <div className="h-8 w-32 bg-[#3A3B3C] rounded-lg" />
              <div className="p-6 rounded-2xl bg-[#1C1C1D] border border-[#3A3B3C] flex flex-col gap-4">
                <div className="h-4 w-40 bg-[#3A3B3C] rounded" />
                <div className="h-6 w-full bg-[#3A3B3C]/60 rounded-full" />
                <div className="h-3 w-64 bg-[#3A3B3C]/40 rounded" />
              </div>
              <div className="p-6 rounded-2xl bg-[#1C1C1D] border border-[#3A3B3C] flex flex-col gap-4">
                <div className="h-4 w-40 bg-[#3A3B3C] rounded" />
                <div className="h-6 w-full bg-[#3A3B3C]/60 rounded-full" />
                <div className="h-3 w-64 bg-[#3A3B3C]/40 rounded" />
              </div>
              <div className="p-6 rounded-2xl bg-[#1C1C1D] border border-[#3A3B3C] flex flex-col gap-4">
                <div className="h-4 w-40 bg-[#3A3B3C] rounded" />
                <div className="h-6 w-full bg-[#3A3B3C]/60 rounded-full" />
                <div className="h-3 w-64 bg-[#3A3B3C]/40 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
