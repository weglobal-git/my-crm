"use client";

import { useState, useEffect } from "react";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { PipelineSearch } from "@/components/pipeline/PipelineSearch";
import { CreateDealButton } from "@/components/pipeline/CreateDealButton";
import { CardTypeFilter, CardTypeFilterValue } from "@/components/pipeline/CardTypeFilter";
import { PipelineQuickFilters } from "@/components/pipeline/PipelineQuickFilters";
import { useSearchParams } from "next/navigation";
import { PipelineStage } from "@prisma/client";
import { OpportunityWithRelations } from "./KanbanCard";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { useSidebar } from "@/components/layout/SidebarContext";

interface PipelineViewProps {
  userId: string;
  role: string;
  stages: PipelineStage[];
  companies?: { id: string; name: string; displayName?: string | null; contacts?: { id: string; name: string }[] }[];
  initialOpportunities?: OpportunityWithRelations[];
  initialTab?: string;
}

export function PipelineView({ userId, role, stages, companies, initialOpportunities, initialTab = 'workspace' }: PipelineViewProps) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || initialTab);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [cardType, setCardType] = useState<CardTypeFilterValue>('ALL');
  const { setPageManageContent, setHasActiveFilters, setPageSearchConfig } = useSidebar();
  
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

  const hasFilters = Boolean(searchQuery.trim() || (cardType && cardType !== 'ALL') || tab !== 'workspace');
  useEffect(() => {
    setHasActiveFilters(hasFilters);
  }, [hasFilters, setHasActiveFilters]);

  // Connect Card Search to Mobile/Global Search (Find button)
  useEffect(() => {
    setPageSearchConfig({
      query: searchQuery,
      onSearch: handleSearchChange,
      placeholder: "Search cards...",
    });
    return () => setPageSearchConfig(null);
  }, [searchQuery, setPageSearchConfig]);

  // Register mobile Manage modal content
  useEffect(() => {
    setPageManageContent(
      <div className="flex flex-col gap-4 select-none">
        {/* Top Primary Action: + New Deal */}
        {tab === 'workspace' && (
          <div className="w-full">
            <CreateDealButton 
              stages={stages} 
              companies={companies} 
            />
          </div>
        )}

        {/* Section: View / Tabs */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            View
          </label>
          <div className="grid grid-cols-2 gap-2 bg-[#1C1C1D] p-1 rounded-xl">
            <button 
              onClick={() => handleTabChange('workspace')}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${tab === 'workspace' ? 'bg-[#3A3B3C] text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
            >
              My Workspace
            </button>
            <button 
              onClick={() => handleTabChange('completed')}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${tab === 'completed' ? 'bg-[#3A3B3C] text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Completed
            </button>
          </div>
        </div>

        {/* Section: Card Type */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Card Type
          </label>
          <CardTypeFilter value={cardType} onChange={setCardType} variant="segmented" />
        </div>

        {/* Section: Quick Filters */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Quick Filters
          </label>
          <PipelineQuickFilters
            userId={userId}
            activeFilter={searchQuery}
            onSelectFilter={handleSearchChange}
          />
        </div>
      </div>
    );
    return () => setPageManageContent(null);
  }, [tab, searchQuery, cardType, stages, companies, userId, setPageManageContent]);

  return (
    <WorkspaceLayout scrollMode={tab === "completed" ? "auto" : "hidden"}>
          
          {/* Desktop Toolbar (Hidden on Mobile) */}
          <div className="hidden md:flex justify-between items-center mb-4 gap-3 flex-wrap">
            <div className="flex gap-2 bg-[#252728] p-1 rounded-full shrink-0">
              <button 
                onClick={() => handleTabChange('workspace')}
                className={`px-5 py-2 text-xs font-semibold flex items-center gap-2 rounded-full transition-all ${tab === 'workspace' ? 'bg-[#3A3B3C] text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
              >
                ACTIVE
              </button>
              <button 
                onClick={() => handleTabChange('completed')}
                className={`px-5 py-2 text-xs font-semibold flex items-center gap-2 rounded-full transition-all ${tab === 'completed' ? 'bg-[#3A3B3C] text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
              >
                ARCHIVED
              </button>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 ml-auto flex-wrap">
              {/* Quick Filters (Left of Search) */}
              <PipelineQuickFilters
                userId={userId}
                activeFilter={searchQuery}
                onSelectFilter={handleSearchChange}
              />

              {/* Search */}
              <PipelineSearch initialSearch={searchQuery} onSearch={handleSearchChange} />

              {/* Card Type Filter (Left of New Card) */}
              <CardTypeFilter value={cardType} onChange={setCardType} />

              {/* New Card Button */}
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
            cardTypeFilter={cardType}
          />
    </WorkspaceLayout>
  );
}
