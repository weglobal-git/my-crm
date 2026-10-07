import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";

export default function DashboardOverviewLoading() {
  return (
    <WorkspaceLayout scrollMode="auto">
      <div className="flex min-h-full flex-col gap-6 print:hidden" aria-label="Loading dashboard">
        {/* 0. Sticky Top Toolbar Skeleton */}
        <header className="sticky -top-2 z-20 bg-[#252728] -mt-2 pt-2.5 pb-2 px-1 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-6 w-24 rounded-full bg-[#3A3B3C] animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-36 rounded-full bg-[#3A3B3C] border border-[#4E4F50] animate-pulse" />
            <div className="h-8 w-8 rounded-full bg-[#3A3B3C] border border-[#4E4F50] animate-pulse" />
          </div>
        </header>

        <div className="space-y-8">
          {/* 1. World Map Section Skeleton */}
          <section className="space-y-4 p-2">
            <div className="space-y-1.5">
              <div className="h-3 w-20 rounded bg-[#3A3B3C] animate-pulse" />
              <div className="h-6 w-56 rounded bg-[#3A3B3C] animate-pulse" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left: World Map SVG Area */}
              <div className="lg:col-span-7 xl:col-span-8 flex flex-col justify-center min-h-[440px] rounded-[1.5rem] border border-[#4E4F50]/40 bg-[#3A3B3C]/20 p-6 animate-pulse">
                <div className="h-full w-full rounded-2xl bg-[#3A3B3C]/40 min-h-[380px]" />
              </div>

              {/* Right: Sliding 3-Level Container Card */}
              <div className="lg:col-span-5 xl:col-span-4">
                <div className="rounded-[1.5rem] border border-[#4E4F50] bg-[#3A3B3C] p-5 flex flex-col min-h-[540px] animate-pulse justify-between">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div className="h-6 w-32 rounded-full bg-[#252728]" />
                      <div className="h-7 w-28 rounded-lg bg-[#252728]" />
                    </div>
                    <div className="space-y-3 pt-2">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-14 rounded-xl bg-[#252728]/70" />
                      ))}
                    </div>
                  </div>
                  <div className="h-8 w-full rounded-xl bg-[#252728]" />
                </div>
              </div>
            </div>
          </section>

          {/* 2. Sale Summary Section Skeleton */}
          <section className="space-y-4 p-2">
            <div className="space-y-1.5">
              <div className="h-3 w-24 rounded bg-[#3A3B3C] animate-pulse" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="h-6 w-44 rounded bg-[#3A3B3C] animate-pulse" />
                <div className="flex items-center gap-3">
                  <div className="h-7 w-28 rounded-full bg-[#3A3B3C] animate-pulse" />
                  <div className="h-7 w-24 rounded-lg bg-[#3A3B3C] animate-pulse" />
                </div>
              </div>
            </div>

            {/* 3 Summary Cards */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Waiting to load */}
              <div className="rounded-[2rem] border border-[#4E4F50] bg-[#3A3B3C] p-5 space-y-4 animate-pulse">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="h-4 w-28 rounded bg-[#252728]" />
                    <div className="h-3 w-40 rounded bg-[#252728]/60" />
                  </div>
                  <div className="h-6 w-8 rounded-full bg-[#252728]" />
                </div>
                <div className="h-8 w-36 rounded bg-[#252728]" />
                <div className="h-10 w-full rounded-xl bg-[#252728]/40" />
              </div>

              {/* Won */}
              <div className="rounded-[2rem] border border-[#4E4F50] bg-[#3A3B3C] p-5 space-y-4 animate-pulse">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="h-4 w-16 rounded bg-[#252728]" />
                    <div className="h-3 w-36 rounded bg-[#252728]/60" />
                  </div>
                  <div className="h-6 w-8 rounded-full bg-[#252728]" />
                </div>
                <div className="h-8 w-36 rounded bg-[#252728]" />
                <div className="h-10 w-full rounded-xl bg-[#252728]/40" />
              </div>

              {/* Total (Accent) */}
              <div className="rounded-[2rem] border-0 bg-[#3A3B3C] p-5 space-y-4 animate-pulse">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="h-4 w-32 rounded bg-[#252728]" />
                    <div className="h-3 w-44 rounded bg-[#252728]/60" />
                  </div>
                  <div className="h-6 w-8 rounded-full bg-[#252728]" />
                </div>
                <div className="h-8 w-36 rounded bg-[#252728]" />
                <div className="h-10 w-full rounded-xl bg-[#252728]/40" />
              </div>
            </div>
          </section>

          {/* 3. Sale Tracking Section Skeleton */}
          <section className="space-y-4 p-2">
            <div className="space-y-1.5">
              <div className="h-3 w-24 rounded bg-[#3A3B3C] animate-pulse" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="h-6 w-48 rounded bg-[#3A3B3C] animate-pulse" />
                <div className="h-7 w-28 rounded-lg bg-[#3A3B3C] animate-pulse" />
              </div>
            </div>

            {/* 6 Tracking Progress Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="rounded-[1.5rem] border border-[#4E4F50] bg-[#3A3B3C] p-5 space-y-3 animate-pulse"
                >
                  <div className="flex justify-between items-center">
                    <div className="h-4 w-32 rounded bg-[#252728]" />
                    <div className="h-4 w-12 rounded bg-[#252728]" />
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#252728]" />
                  <div className="flex justify-between items-center text-xs">
                    <div className="h-3 w-20 rounded bg-[#252728]/60" />
                    <div className="h-3 w-20 rounded bg-[#252728]/60" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 4. Annual Sale Report Table Skeleton */}
          <section className="space-y-4 pb-6 p-2">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="h-3 w-28 rounded bg-[#3A3B3C] animate-pulse" />
                <div className="h-6 w-60 rounded bg-[#3A3B3C] animate-pulse" />
              </div>
              <div className="h-8 w-44 rounded-full bg-[#3A3B3C] animate-pulse" />
            </div>

            {/* 5-Year Table Shell */}
            <div className="overflow-hidden rounded-[2rem] border border-[#4E4F50] bg-[#3A3B3C] p-4 animate-pulse">
              <div className="h-10 w-full rounded-xl bg-[#252728] mb-3" />
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 w-full rounded-xl bg-[#252728]/60" />
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
