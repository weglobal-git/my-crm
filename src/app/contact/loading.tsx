import React from "react";
import {
  Building2,
  Search,
  Plus,
  ShieldCheck,
  ShieldAlert,
  Globe,
  ChevronDown,
  Bot,
  SlidersHorizontal,
  Users,
} from "lucide-react";

const ACCOUNT_TYPES = [
  { label: "Customer", value: "CUSTOMER" },
  { label: "Trader", value: "TRADER" },
  { label: "Shipping", value: "SHIPPING" },
  { label: "My Office", value: "MY_OFFICE" },
];

export default function ContactLoading() {
  return (
    <div className="flex flex-col w-full h-full bg-[#252728]">
      <main className="flex-1 overflow-hidden hide-scrollbar p-6 flex flex-col">
        <div className="max-w-[1400px] mx-auto w-full flex flex-col h-full gap-4 min-h-0">
          {/* Top Bar: Qualification Tabs & Search & Add Button */}
          <div className="flex flex-wrap items-center justify-between gap-4 shrink-0">
            {/* Qualification Tabs: Qualified & Unqualified */}
            <div className="flex items-center gap-1.5 bg-[#1C1C1D] p-1.5 rounded-full">
              <div className="px-4 py-1.5 text-xs font-bold rounded-full flex items-center gap-2 bg-[#C7F33C] text-black">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Qualified</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-black/20 text-black">
                  ...
                </span>
              </div>

              <div className="px-4 py-1.5 text-xs font-bold rounded-full flex items-center gap-2 text-slate-400">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Unqualified</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[#252728] text-slate-400">
                  ...
                </span>
              </div>
            </div>

            {/* Search Box & Add Account Button */}
            <div className="flex items-center gap-3">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search account, person, country..."
                  disabled
                  className="bg-[#3A3B3C] rounded-full pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-400 w-64 md:w-80 border-0 focus:outline-none"
                />
              </div>

              <div className="px-4 py-1.5 rounded-full text-xs font-bold bg-[#C7F33C] text-black flex items-center gap-1.5 shrink-0">
                <Plus className="w-4 h-4 text-black" />
                <span>Add Account</span>
              </div>
            </div>
          </div>

          {/* Type Filter Pills: Customer, Trader, Shipping, My Office */}
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar shrink-0 pl-2 py-1">
            {ACCOUNT_TYPES.map((item, idx) => (
              <div
                key={item.value}
                className={`px-3.5 py-1 rounded-full text-xs font-semibold shrink-0 select-none ${
                  idx === 0
                    ? "bg-[#C7F33C] text-black font-bold"
                    : "bg-[#3A3B3C] text-slate-400"
                }`}
              >
                {item.label}
              </div>
            ))}
          </div>

          {/* 2-Column Master-Detail Layout */}
          <div className="flex-1 min-h-0 flex gap-4">
            {/* Left Column: Account Master List */}
            <div className="w-80 md:w-96 shrink-0 flex flex-col h-full bg-[#252728] rounded-3xl overflow-hidden border-0">
              {/* Header: Symmetrical to Pipeline Column */}
              <div className="h-14 px-4 flex items-center justify-between shrink-0 bg-[#252728]">
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-4 h-4 text-[#C7F33C]" />
                  <h3 className="font-semibold text-base text-slate-100">Accounts</h3>
                  <div className="h-6 w-8 rounded-full bg-[#3A3B3C] animate-pulse" />
                </div>
                <div className="h-7 px-2.5 rounded-full flex items-center gap-1.5 text-xs font-semibold bg-[#3A3B3C] text-slate-300">
                  <Globe className="w-3 h-3 shrink-0" />
                  <span>Country</span>
                  <ChevronDown className="w-3 h-3 shrink-0" />
                </div>
              </div>

              {/* Account Cards List */}
              <div className="flex-1 overflow-y-auto hide-scrollbar p-3 space-y-2.5">
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <div
                    key={i}
                    className={`p-2.5 px-3 rounded-2xl select-none transition-all ${
                      i === 1 ? "bg-[#C7F33C]" : "bg-[#2E3033]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2.5">
                      {/* Left: Building Icon + Name + Star Rating */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            i === 1 ? "bg-black/15 text-black" : "bg-[#252728] text-slate-300"
                          }`}
                        >
                          <Building2 className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex flex-col min-w-0 flex-1 gap-1.5">
                          <div
                            className={`h-3.5 rounded animate-pulse ${
                              i === 1 ? "w-28 bg-black/25" : "w-32 bg-[#3A3B3C]"
                            }`}
                          />
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <div
                                key={s}
                                className={`w-2.5 h-2.5 rounded-sm ${
                                  i === 1 ? "bg-black/20" : "bg-[#3A3B3C]"
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Right: Country pill + compact counts */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div
                          className={`h-4 w-12 rounded-full animate-pulse ${
                            i === 1 ? "bg-black/15" : "bg-[#252728]"
                          }`}
                        />
                        <div className="flex items-center gap-2 pr-0.5">
                          <div
                            className={`h-3 w-6 rounded animate-pulse ${
                              i === 1 ? "bg-black/20" : "bg-[#3A3B3C]"
                            }`}
                          />
                          <div
                            className={`h-3 w-6 rounded animate-pulse ${
                              i === 1 ? "bg-black/20" : "bg-[#3A3B3C]"
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Account Detail */}
            <div className="flex-1 flex flex-col h-full bg-[#252728] rounded-3xl overflow-hidden min-w-0 border-0">
              {/* Header */}
              <div className="h-14 px-4 flex items-center justify-between shrink-0 bg-[#252728] gap-4 border-0">
                {/* Left: Account Name & Stars */}
                <div className="flex flex-col justify-center min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-44 bg-[#3A3B3C] rounded-lg animate-pulse" />
                    <div className="h-4 w-14 bg-[#3A3B3C] rounded-full animate-pulse" />
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <div key={s} className="w-3.5 h-3.5 rounded-sm bg-[#3A3B3C] animate-pulse" />
                    ))}
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="w-8 h-8 rounded-full bg-[#1C1C1D] text-[#C7F33C] border border-[#3A3B3C] flex items-center justify-center">
                    <Bot className="w-4 h-4" />
                  </div>

                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1C1C1D]">
                    <span className="text-xs font-bold text-[#C7F33C]">Qualified</span>
                    <div className="w-9 h-5 rounded-full bg-[#C7F33C] relative flex items-center p-0.5">
                      <div className="w-4 h-4 rounded-full translate-x-4 bg-black" />
                    </div>
                  </div>

                  <div className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#C7F33C] text-black flex items-center gap-1.5 shrink-0">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-black" />
                    <span>Edit Account</span>
                  </div>
                </div>
              </div>

              {/* Right Column Content */}
              <div className="flex-1 overflow-y-auto hide-scrollbar p-3 flex flex-col gap-2">
                {/* Upper Section: Account Analytics Dashboard */}
                <div className="mb-4 shrink-0 border-0">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                    {/* Col 1: Donut Chart */}
                    <div className="lg:col-span-4 flex items-center justify-center py-2">
                      <div className="relative w-60 h-60 sm:w-56 sm:h-56 max-w-full aspect-square flex items-center justify-center">
                        <svg className="w-full h-full" viewBox="0 0 200 200">
                          <circle
                            cx="100"
                            cy="100"
                            r="80"
                            stroke="#2E3033"
                            strokeWidth="16"
                            fill="transparent"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none pointer-events-none px-3 gap-1.5 animate-pulse">
                          <div className="h-8 w-16 bg-[#2E3033] rounded-lg" />
                          <div className="h-3.5 w-12 bg-[#2E3033] rounded mt-0.5" />
                          <span className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">
                            success rate
                          </span>
                          <div className="h-3.5 w-20 bg-[#2E3033] rounded mt-0.5" />
                        </div>
                      </div>
                    </div>

                    {/* Col 2: Top 5 Products + Top Contributors */}
                    <div className="lg:col-span-4 flex flex-col justify-between">
                      <div className="space-y-2 py-0.5">
                        {[1, 2, 3, 4, 5].map((prod) => (
                          <div key={prod} className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg shrink-0 bg-[#2E3033] animate-pulse" />
                            <div className="flex flex-col min-w-0 flex-1 space-y-1 animate-pulse">
                              <div className="h-3.5 w-24 bg-[#2E3033] rounded" />
                              <div className="h-2.5 w-12 bg-[#2E3033] rounded" />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="w-full pt-2.5 mt-2 border-t border-[#3A3B3C]/50">
                        <div className="flex items-center justify-between mb-1.5 px-0.5">
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                            <Users className="w-3 h-3 text-[#C7F33C]" />
                            <span>Top Contributors</span>
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 min-h-10 w-full animate-pulse">
                          {[1, 2, 3].map((c) => (
                            <div key={c} className="p-1 px-1.5 rounded-xl flex items-center gap-1.5 min-w-0">
                              <div className="w-6 h-6 rounded-full bg-[#2E3033] shrink-0" />
                              <div className="space-y-1 flex-1">
                                <div className="h-2.5 w-10 bg-[#2E3033] rounded" />
                                <div className="h-2 w-6 bg-[#2E3033] rounded" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Col 3: Company Profile & Context */}
                    <div className="lg:col-span-4 flex flex-col justify-start p-1">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-[#C7F33C]" />
                          <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                            Company Profile & Context
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 flex flex-col space-y-2.5 animate-pulse">
                        <div className="h-3 w-full bg-[#2E3033] rounded" />
                        <div className="h-3 w-5/6 bg-[#2E3033] rounded" />
                        <div className="h-3 w-4/6 bg-[#2E3033] rounded" />
                        <div className="h-3 w-full bg-[#2E3033] rounded" />
                        <div className="h-3 w-3/4 bg-[#2E3033] rounded" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lower Section: Person Table */}
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden border-0">
                  <div className="flex-1 overflow-auto hide-scrollbar">
                    <table className="w-full min-w-[650px] text-left border-collapse table-fixed">
                      <colgroup>
                        <col className="w-[25%]" />
                        <col className="w-[18%]" />
                        <col className="w-[18%]" />
                        <col className="w-[22%]" />
                        <col className="w-[17%]" />
                      </colgroup>
                      <thead>
                        <tr className="bg-[#252728]/90 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-0 sticky top-0 z-10 backdrop-blur-md">
                          <th className="py-3 pl-5 pr-3 w-[25%]">Person</th>
                          <th className="py-3 px-3 w-[18%]">Position</th>
                          <th className="py-3 px-3 w-[18%]">Department</th>
                          <th className="py-3 px-3 w-[22%]">Email</th>
                          <th className="py-3 pl-3 pr-5 w-[17%]">Phone Number</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#28292A]">
                        {[1, 2, 3, 4].map((i) => (
                          <tr key={i} className="animate-pulse">
                            <td className="py-3.5 pl-5 pr-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#2E3033] shrink-0" />
                                <div className="h-3.5 w-28 bg-[#2E3033] rounded" />
                              </div>
                            </td>
                            <td className="py-3.5 px-3">
                              <div className="h-3 w-20 bg-[#2E3033] rounded" />
                            </td>
                            <td className="py-3.5 px-3">
                              <div className="h-3 w-20 bg-[#2E3033] rounded" />
                            </td>
                            <td className="py-3.5 px-3">
                              <div className="h-3 w-32 bg-[#2E3033] rounded" />
                            </td>
                            <td className="py-3.5 pl-3 pr-5">
                              <div className="h-3 w-24 bg-[#2E3033] rounded" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
