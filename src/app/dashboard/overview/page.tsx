"use client";

import {
  Settings2, 
  Calendar, 
  Plus, 
  ArrowUpRight,
  MoreHorizontal
} from "lucide-react";
import { useSession } from "next-auth/react";
import { WelcomeLogin } from "@/components/layout/WelcomeLogin";

export default function Page() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  if (!session) {
    return <WelcomeLogin />;
  }

  return (
    <div className="flex flex-col w-full h-full bg-[#252728]">
      {/* 2. WORK SPACE */}
      <main className="flex-1 overflow-y-auto hide-scrollbar p-6">
        <div className="max-w-[1400px] mx-auto w-full flex flex-col h-full">
          
          {/* Page Toolbar */}
          <div className="flex justify-between items-center mb-6 animate-fade-in-up">
            <h1 className="text-2xl font-bold text-slate-100">CRM Overview</h1>
            <div className="flex items-center gap-3">
              <button className="w-10 h-10 flex items-center justify-center bg-[#3A3B3C] rounded-full border border-[#4E4F50] transition-all text-slate-300 hover:text-white shadow-sm">
                <Settings2 className="w-4 h-4" />
              </button>
              
              <button className="px-4 h-10 flex items-center gap-2 bg-[#C7F33C] text-black rounded-full hover:bg-[#b5dc35] transition-all text-xs font-semibold shadow-sm">
                <Calendar className="w-3.5 h-3.5 text-black/70" />
                <span>22 Jun 2026 - 26 Jun 2026</span>
              </button>

              <button className="hidden sm:flex px-4 h-10 items-center gap-2 bg-[#3A3B3C] rounded-full border border-[#4E4F50] transition-all text-xs font-semibold text-slate-300 hover:text-white shadow-sm">
                <Plus className="w-3.5 h-3.5" />
                Add widget
              </button>
            </div>
          </div>

          {/* Grid Layout */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-fade-in-up">
        
        {/* Large Feature Card (Left) */}
        <div className="col-span-1 md:col-span-1 lg:col-span-1 bg-[#3A3B3C] rounded-[2rem] p-6 flex flex-col h-[400px] relative overflow-hidden group border border-[#4E4F50]">
          <div className="absolute top-0 right-0 p-4">
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#252728] text-slate-400 hover:text-[#C7F33C] transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
          <h3 className="font-semibold text-lg text-slate-100 mb-2">Pipeline Value</h3>
          <div className="flex-1"></div>
          
          <div className="relative z-10 grid grid-cols-2 gap-4 mt-auto">
            <div className="bg-[#C7F33C] rounded-2xl p-4">
              <div className="text-2xl font-bold text-black">45</div>
              <div className="text-xs font-medium text-black/70 mt-1">Active Deals</div>
              <div className="text-xs font-bold text-black mt-2">+12% Growth</div>
            </div>
            <div className="bg-[#E1F2AE] rounded-2xl p-4 text-black">
              <div className="text-2xl font-bold">12</div>
              <div className="text-xs font-medium text-black/70 mt-1">Won this week</div>
              <div className="text-xs font-bold text-black mt-2">+5% Growth</div>
            </div>
          </div>
        </div>

        {/* Activity & Stats (Middle) */}
        <div className="col-span-1 md:col-span-2 lg:col-span-2 flex flex-col gap-6">
          <div className="bg-[#3A3B3C] border border-[#4E4F50] rounded-[2rem] p-6 h-[190px] flex flex-col relative">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-semibold text-lg text-slate-100">Total Revenue expected</h3>
                <p className="text-sm text-slate-400 mt-1">From active deals</p>
              </div>
              <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#252728] text-slate-400 hover:text-[#C7F33C] hover:bg-[#4E4F50] transition-colors">
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-end gap-4 mt-auto">
              <span className="text-5xl font-bold tracking-tighter text-slate-100">$2.4M</span>
              <span className="bg-[#C7F33C] text-black text-xs font-bold px-2 py-1 rounded-md mb-2">
                +14.5%
              </span>
            </div>
          </div>

          <div className="bg-[#3A3B3C] border border-[#4E4F50] rounded-[2rem] p-6 h-[186px] relative overflow-hidden flex flex-col">
            <div className="flex justify-between items-start z-10 relative">
              <h3 className="font-semibold text-lg text-slate-100">Sales Performance</h3>
              <div className="flex gap-2">
                <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#C7F33C] text-black hover:scale-105 transition-transform">
                  <Settings2 className="w-4 h-4" />
                </button>
                <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#252728] text-slate-400 hover:text-[#C7F33C] transition-colors">
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Placeholder for chart */}
            <div className="absolute inset-0 top-16 px-6 pb-4 flex items-end">
              <div className="w-full h-full border-b-2 border-dashed border-[#4E4F50] relative">
                <div className="absolute bottom-0 left-0 w-full h-[60%] bg-gradient-to-t from-[#3A3B3C] to-transparent"></div>
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                  <path d="M0,80 L20,60 L40,70 L60,30 L80,40 L100,10" fill="none" stroke="#C7F33C" strokeWidth="3" />
                  <circle cx="100" cy="10" r="3" fill="#C7F33C" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar Cards */}
        <div className="col-span-1 md:col-span-3 lg:col-span-1 flex flex-col gap-6">
          <div className="bg-[#3A3B3C] border border-[#4E4F50] rounded-[2rem] p-6 flex-1 flex flex-col">
            <div className="flex justify-between items-start mb-6">
              <h3 className="font-semibold text-lg text-slate-100">Recent Quotations</h3>
              <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#252728] text-slate-400 hover:text-[#C7F33C] transition-colors">
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#252728] flex items-center justify-center shrink-0">
                    <FileTextIcon className="w-5 h-5 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-slate-100 truncate">QT-2026-{240+i}</div>
                    <div className="text-xs text-slate-400">To: TechCorp Inc.</div>
                  </div>
                  <div className="text-sm font-semibold text-slate-100">${(i * 3.5).toFixed(1)}k</div>
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

// Simple icon placeholder
function FileTextIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
    </svg>
  );
}
