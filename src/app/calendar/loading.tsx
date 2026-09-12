import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";

export default function CalendarLoading() {
  return (
    <WorkspaceLayout scrollMode="hidden">
      <div className="flex-1 flex flex-col min-h-0 gap-3 animate-pulse">
        {/* Toolbar skeleton */}
        <div className="flex items-center justify-between py-1 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-16 h-8 rounded-xl bg-[#3A3B3C] border border-[#4E4F50]/50" />
            <div className="w-16 h-8 rounded-xl bg-[#3A3B3C] border border-[#4E4F50]/50" />
            <div className="w-36 h-7 rounded-lg bg-[#3A3B3C]" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-20 h-8 rounded-xl bg-[#3A3B3C] border border-[#4E4F50]/50" />
            <div className="w-24 h-8 rounded-xl bg-[#4E4F50]" />
          </div>
        </div>

        {/* Grid skeleton */}
        <div className="flex-1 min-h-0 flex flex-col border border-[#3A3B3C] rounded-2xl overflow-hidden bg-[#252728]">
          <div className="grid grid-cols-7 border-b border-[#3A3B3C] bg-[#2E3031]/80 h-9 shrink-0" />
          <div className="flex-1 min-h-0 grid grid-cols-7 grid-rows-6">
            {Array.from({ length: 42 }).map((_, i) => (
              <div
                key={i}
                className="border-r border-b border-[#3A3B3C]/50 p-2 flex flex-col gap-1 bg-[#2A2C2D]/30"
              >
                <div className="w-5 h-5 rounded-full bg-[#3A3B3C]" />
                {i % 4 === 0 && (
                  <div className="w-full h-5 rounded bg-[#3A3B3C]/60 mt-1" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
