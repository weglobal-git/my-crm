"use client";

import { Search } from "lucide-react";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";

export default function PipelinePage() {
  return (
    <div className="w-full h-full flex flex-col max-w-[1600px] mx-auto">
      {/* Header section mimicking ux-3.png */}
      <div className="flex flex-col gap-8 mb-10">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">
          Works Space
        </h1>
        
        {/* Large Pill Search Bar */}
        <div className="flex items-center w-full max-w-2xl bg-white rounded-full p-2 pl-6 shadow-sm border border-slate-100 focus-within:shadow-md focus-within:border-[#007aff] transition-all">
          <input 
            type="text" 
            placeholder="Search and Filter....." 
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-slate-400"
          />
          <button className="w-12 h-12 flex items-center justify-center bg-black text-white rounded-full hover:bg-slate-800 transition-colors shrink-0">
            <Search className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Kanban Board Area */}
      <div className="flex-1 min-h-0">
        <KanbanBoard />
      </div>
    </div>
  );
}
