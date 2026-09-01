"use client";

import { useState, useEffect } from "react";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { PipelineSearch } from "@/components/pipeline/PipelineSearch";
import { CreateDealButton } from "@/components/pipeline/CreateDealButton";
import { useSearchParams } from "next/navigation";
import { PipelineStage } from "@prisma/client";
import { OpportunityWithRelations } from "./KanbanCard";

interface PipelineViewProps {
  userId: string;
  role: string;
  stages: PipelineStage[];
  companies: { id: string; name: string }[];
  initialOpportunities?: OpportunityWithRelations[];
  initialTab?: string;
}

export function PipelineView({ userId, role, stages, companies, initialOpportunities, initialTab = 'workspace' }: PipelineViewProps) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || initialTab);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  
  useEffect(() => {
    const timer = setTimeout(() => {
      const urlTab = searchParams.get('tab') || initialTab;
      if (urlTab !== tab) setTab(urlTab);
      const urlSearch = searchParams.get('search') || '';
      if (urlSearch !== searchQuery) setSearchQuery(urlSearch);
    }, 0);
    return () => clearTimeout(timer);
  }, [searchParams, initialTab, tab, searchQuery]);

  const updateUrl = (newTab: string, newSearch: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", newTab);
    if (newSearch) {
      params.set("search", newSearch);
    } else {
      params.delete("search");
    }
    window.history.pushState(null, '', `/pipeline?${params.toString()}`);
  };

  const handleTabChange = (newTab: string) => {
    setTab(newTab);
    updateUrl(newTab, searchQuery);
  };

  const handleSearchChange = (newSearch: string) => {
    setSearchQuery(newSearch);
    updateUrl(tab, newSearch);
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#252728]">
      <main className={`flex-1 ${tab === 'completed' ? 'overflow-y-auto' : 'overflow-hidden'} hide-scrollbar p-6 flex flex-col`}>
        <div className="max-w-[1400px] mx-auto w-full flex flex-col h-full gap-4 min-h-0">
          
          <div className="flex justify-between items-center mb-4">
            <div className="flex gap-2 bg-[#252728] p-1 rounded-full">
              <button 
                onClick={() => handleTabChange('workspace')}
                className={`px-5 py-2 text-sm font-semibold flex items-center gap-2 rounded-full transition-all ${tab === 'workspace' ? 'bg-[#3A3B3C] text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                My Workspace
              </button>
              <button 
                onClick={() => handleTabChange('completed')}
                className={`px-5 py-2 text-sm font-semibold flex items-center gap-2 rounded-full transition-all ${tab === 'completed' ? 'bg-[#3A3B3C] text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Completed Projects
              </button>
            </div>
            <div className="flex items-center gap-3">
              <PipelineSearch initialSearch={searchQuery} onSearch={handleSearchChange} />
              {tab === 'workspace' && (
                <CreateDealButton 
                  stages={stages} 
                  companies={companies} 
                />
              )}
            </div>
          </div>

          <KanbanBoard 
            currentUserId={userId} 
            currentUserRole={role}
            initialStages={stages} 
            initialOpportunities={initialOpportunities}
            initialTab={initialTab}
            isCompletedTab={tab === 'completed'}
            activeTab={tab}
            activeSearch={searchQuery}
          />
        </div>
      </main>
    </div>
  );
}
