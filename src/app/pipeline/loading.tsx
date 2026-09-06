import React from "react";

export default function PipelineLoading() {
  return (
    <div className="flex flex-col w-full h-full bg-[#252728]">
      <main className="flex-1 overflow-hidden hide-scrollbar p-6 flex flex-col">
        <div className="max-w-[1400px] mx-auto w-full flex flex-col h-full gap-4 min-h-0">
          
          {/* Top Control Bar Skeleton (Symmetrical with PipelineView header) */}
          <div className="flex justify-between items-center mb-4 gap-3 flex-wrap shrink-0">
            {/* Left Tabs (My Workspace / Completed Projects) */}
            <div className="flex gap-2 bg-[#252728] p-1 rounded-full shrink-0 animate-pulse">
              <div className="h-9 w-32 bg-[#3A3B3C] rounded-full shadow-sm" />
              <div className="h-9 w-40 bg-transparent rounded-full" />
            </div>

            {/* Right Action Controls */}
            <div className="flex items-center gap-2.5 shrink-0 ml-auto flex-wrap">
              {/* Quick Filters Pill */}
              <div className="h-9 w-20 bg-[#3A3B3C]/50 rounded-full animate-pulse" />
              {/* Search Box Pill */}
              <div className="h-9 w-52 bg-[#3A3B3C]/50 rounded-full animate-pulse" />
              {/* Card Type Filter Pill */}
              <div className="h-9 w-28 bg-[#3A3B3C]/50 rounded-full animate-pulse" />
              {/* + New Button */}
              <div className="h-9 w-20 bg-[#C7F33C]/40 rounded-full animate-pulse" />
            </div>
          </div>

          {/* Kanban Board 4-Column Skeleton (Symmetrical with 4 Kanban Stages) */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="flex gap-2 overflow-x-auto pb-8 hide-scrollbar mx-auto w-fit h-[calc(100vh-140px)]">
              {[1, 2, 3, 4].map((col) => (
                <div key={col} className="w-[320px] shrink-0 flex flex-col gap-4 h-full max-h-full">
                  {/* Column Header */}
                  <div className="flex items-center justify-between px-2 py-2 sticky top-0 z-10 bg-[#252728]">
                    <div className="h-6 w-28 bg-[#3A3B3C]/70 rounded-lg animate-pulse" />
                    <div className="w-8 h-8 rounded-full bg-[#3A3B3C]/70 animate-pulse" />
                  </div>
                  
                  {/* Column Cards Container */}
                  <div className="flex flex-col gap-4 flex-1 p-2 rounded-3xl hide-scrollbar overflow-y-auto min-h-0">
                    {[1, 2, 3].map((card) => (
                      <div 
                        key={card} 
                        className="w-full min-h-[160px] bg-[#3A3B3C]/30 border border-[#3A3B3C]/50 rounded-[24px] p-4 flex flex-col gap-3 animate-pulse select-none"
                      >
                        {/* Card Top Row: Deal title & badges */}
                        <div className="flex justify-between items-center">
                          <div className="h-5 w-36 bg-[#4E4F50]/60 rounded-full" />
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 bg-[#4E4F50]/40 rounded-full" />
                            <div className="w-5 h-5 bg-[#4E4F50]/40 rounded-full" />
                          </div>
                        </div>

                        {/* Card Middle: Latest activity preview */}
                        <div className="flex flex-col gap-2 mt-1 flex-1">
                          <div className="h-2.5 w-24 bg-[#4E4F50]/30 rounded pl-2" />
                          <div className="flex items-start gap-2 px-1">
                            <div className="w-5 h-5 rounded-full bg-[#4E4F50]/60 shrink-0" />
                            <div className="flex-1 flex flex-col gap-1.5">
                              <div className="h-3 w-full bg-[#4E4F50]/50 rounded" />
                              <div className="h-3 w-4/5 bg-[#4E4F50]/30 rounded" />
                            </div>
                          </div>
                        </div>

                        {/* Card Bottom Row: Customer Name Pill & Timer Badge */}
                        <div className="mt-auto flex justify-between items-center pt-2">
                          <div className="h-6 w-28 bg-[#4E4F50]/50 rounded-full" />
                          <div className="h-4 w-16 bg-[#4E4F50]/30 rounded-md" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
