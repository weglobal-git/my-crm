import React from "react";

export default function PipelineLoading() {
  return (
    <div className="flex flex-col w-full h-full bg-[#252728]">
      <main className="flex-1 overflow-hidden hide-scrollbar p-6 flex flex-col">
        <div className="max-w-[1400px] mx-auto w-full flex flex-col h-full gap-4 min-h-0">
          
          {/* Header Skeleton */}
          <div className="flex items-center justify-between pb-4 border-b border-[#3A3B3C]/50">
            <div className="flex items-center gap-6">
              <div className="h-10 w-64 bg-[#3A3B3C]/50 rounded-[14px] animate-pulse" />
            </div>
            <div className="flex items-center gap-4">
              <div className="h-11 w-[220px] bg-[#3A3B3C]/50 rounded-full animate-pulse" />
              <div className="h-11 w-11 bg-[#C7F33C]/30 rounded-full animate-pulse" />
            </div>
          </div>

          {/* Kanban Board Skeleton */}
          <div className="flex-1 min-h-0 overflow-x-hidden pt-4">
            <div className="flex h-full gap-6 w-max">
              {[1, 2, 3, 4, 5].map((col) => (
                <div key={col} className="w-[320px] flex-shrink-0 flex flex-col gap-4">
                  {/* Column Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-5 w-24 bg-[#3A3B3C]/50 rounded-md animate-pulse" />
                    <div className="h-6 w-8 bg-[#3A3B3C]/50 rounded-full animate-pulse" />
                  </div>
                  
                  {/* Column Cards */}
                  <div className="flex flex-col gap-4">
                    {[1, 2, 3].map((card) => (
                      <div 
                        key={card} 
                        className="w-full h-36 bg-[#3A3B3C]/30 border border-[#3A3B3C]/50 rounded-[24px] p-4 flex flex-col gap-3 animate-pulse"
                      >
                        <div className="flex justify-between items-start">
                          <div className="h-4 w-20 bg-[#4E4F50]/50 rounded-full" />
                          <div className="h-6 w-6 bg-[#4E4F50]/50 rounded-full" />
                        </div>
                        <div className="h-5 w-3/4 bg-[#4E4F50]/50 rounded-md mt-2" />
                        <div className="h-4 w-1/2 bg-[#4E4F50]/50 rounded-md" />
                        <div className="mt-auto flex justify-between items-center pt-2">
                          <div className="h-4 w-16 bg-[#4E4F50]/50 rounded-md" />
                          <div className="h-6 w-6 bg-[#4E4F50]/50 rounded-full" />
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
