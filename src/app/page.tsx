"use client";

import { 
  Search, 
  Settings2, 
  Calendar, 
  Plus, 
  ArrowUpRight,
  TrendingUp,
  MoreHorizontal
} from "lucide-react";

export default function Dashboard() {
  return (
    <div className="w-full h-full flex flex-col max-w-[1600px] mx-auto animate-fade-in-up">
      
      {/* Header Actions */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
          CRM Overview
        </h1>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white rounded-full px-4 h-12 shadow-sm border border-slate-100 hidden md:flex">
            <Search className="w-4 h-4 text-slate-400 mr-2" />
            <input 
              type="text" 
              placeholder="Search..." 
              className="bg-transparent border-none outline-none text-sm w-32 focus:w-48 transition-all duration-300"
            />
          </div>
          
          <button className="w-12 h-12 flex items-center justify-center bg-white rounded-full shadow-sm border border-slate-100 hover:shadow-md transition-all text-slate-600 hover:text-black">
            <Settings2 className="w-5 h-5" />
          </button>
          
          <button className="px-5 h-12 flex items-center gap-3 bg-black text-white rounded-full shadow-sm hover:bg-slate-800 transition-all text-sm font-semibold">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>22 Jun 2026 - 26 Jun 2026</span>
          </button>

          <button className="hidden sm:flex px-5 h-12 items-center gap-2 bg-white rounded-full shadow-sm border border-slate-100 hover:shadow-md transition-all text-sm font-semibold">
            <Plus className="w-4 h-4" />
            Add widget
          </button>

          <button className="hidden sm:flex px-5 h-12 items-center justify-center bg-white rounded-full shadow-sm border border-slate-100 hover:shadow-md transition-all text-sm font-semibold">
            Create a report
          </button>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        
        {/* Large Feature Card (Left) */}
        <div className="col-span-1 md:col-span-1 lg:col-span-1 bg-white rounded-[2rem] p-6 shadow-sm flex flex-col h-[400px] relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4">
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-black transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
          <h3 className="font-semibold text-lg text-slate-900 mb-2">Pipeline Value</h3>
          <div className="flex-1"></div>
          
          <div className="relative z-10 grid grid-cols-2 gap-4 mt-auto">
            <div className="bg-[#C7F33C] rounded-2xl p-4">
              <div className="text-2xl font-bold">45</div>
              <div className="text-xs font-medium text-black/70 mt-1">Active Deals</div>
              <div className="text-xs font-bold text-black mt-2">+12% Growth</div>
            </div>
            <div className="bg-[#E1F2AE] rounded-2xl p-4">
              <div className="text-2xl font-bold">12</div>
              <div className="text-xs font-medium text-black/70 mt-1">Won this week</div>
              <div className="text-xs font-bold text-black mt-2">+5% Growth</div>
            </div>
          </div>
        </div>

        {/* Activity & Stats (Middle) */}
        <div className="col-span-1 md:col-span-2 lg:col-span-2 flex flex-col gap-6">
          <div className="bg-white rounded-[2rem] p-6 shadow-sm h-[190px] flex flex-col relative">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-semibold text-lg text-slate-900">Total Revenue expected</h3>
                <p className="text-sm text-slate-500 mt-1">From active deals</p>
              </div>
              <button className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-black hover:bg-slate-100 transition-colors">
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-end gap-4 mt-auto">
              <span className="text-5xl font-bold tracking-tighter text-slate-900">$2.4M</span>
              <span className="bg-[#C7F33C] text-black text-xs font-bold px-2 py-1 rounded-md mb-2">
                +14.5%
              </span>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] p-6 shadow-sm h-[186px] relative overflow-hidden flex flex-col">
            <div className="flex justify-between items-start z-10 relative">
              <h3 className="font-semibold text-lg text-slate-900">Sales Performance</h3>
              <div className="flex gap-2">
                <button className="w-8 h-8 flex items-center justify-center rounded-full bg-black text-white hover:scale-105 transition-transform">
                  <Settings2 className="w-4 h-4" />
                </button>
                <button className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-black transition-colors">
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Placeholder for chart */}
            <div className="absolute inset-0 top-16 px-6 pb-4 flex items-end">
              <div className="w-full h-full border-b-2 border-dashed border-slate-200 relative">
                <div className="absolute bottom-0 left-0 w-full h-[60%] bg-gradient-to-t from-slate-100 to-transparent"></div>
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                  <path d="M0,80 L20,60 L40,70 L60,30 L80,40 L100,10" fill="none" stroke="#C7F33C" strokeWidth="3" />
                  <circle cx="100" cy="10" r="3" fill="#111" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar Cards */}
        <div className="col-span-1 md:col-span-3 lg:col-span-1 flex flex-col gap-6">
          <div className="bg-white rounded-[2rem] p-6 shadow-sm flex-1 flex flex-col">
            <div className="flex justify-between items-start mb-6">
              <h3 className="font-semibold text-lg text-slate-900">Recent Quotations</h3>
              <button className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-black transition-colors">
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                    <FileTextIcon className="w-5 h-5 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-slate-900 truncate">QT-2026-{240+i}</div>
                    <div className="text-xs text-slate-500">To: TechCorp Inc.</div>
                  </div>
                  <div className="text-sm font-semibold">${(Math.random() * 10 + 1).toFixed(1)}k</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}

// Simple icon placeholder
function FileTextIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
    </svg>
  );
}
