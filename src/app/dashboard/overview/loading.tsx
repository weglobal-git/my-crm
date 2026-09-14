import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";

export default function DashboardOverviewLoading() {
  return <WorkspaceLayout scrollMode="auto"><div className="flex flex-col gap-6" aria-label="Loading dashboard">
    <div className="hidden h-12 rounded-2xl bg-[#3A3B3C] md:block" />
    <div className="h-8 w-52 rounded-xl bg-[#3A3B3C]" />
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-52 rounded-[2rem] border border-[#4E4F50] bg-[#3A3B3C]" />)}</div>
    <div className="h-64 rounded-[2rem] border border-[#4E4F50] bg-[#3A3B3C]" />
  </div></WorkspaceLayout>;
}
