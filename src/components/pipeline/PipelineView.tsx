"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { SlidersHorizontal } from "lucide-react";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { PipelineSearch } from "@/components/pipeline/PipelineSearch";
import { CreateDealButton } from "@/components/pipeline/CreateDealButton";
import { CardTypeFilterValue } from "@/components/pipeline/CardTypeFilter";
import { PipelineFiltersDrawer, PipelineFilterContent } from "@/components/pipeline/PipelineFiltersDrawer";
import { useSearchParams } from "next/navigation";
import { PipelineStage } from "@prisma/client";
import { OpportunityWithRelations, checkIsRedCard } from "./KanbanCard";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { useSidebar } from "@/components/layout/SidebarContext";
import useSWR from "swr";
import { getPipelineOpportunities } from "@/lib/actions/opportunity";
import type { PendingAcceleratorInfo } from "@/lib/actions/ai-accelerator";

interface PipelineViewProps {
  userId: string;
  role: string;
  stages: PipelineStage[];
  companies?: { id: string; name: string; displayName?: string | null; contacts?: { id: string; name: string }[] }[];
  initialOpportunities?: OpportunityWithRelations[];
  initialPendingAccelerators?: Record<string, PendingAcceleratorInfo>;
  initialTab?: string;
}

export function PipelineView({ 
  userId, 
  role, 
  stages, 
  companies, 
  initialOpportunities, 
  initialPendingAccelerators,
  initialTab = 'workspace' 
}: PipelineViewProps) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || initialTab);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [cardType, setCardType] = useState<CardTypeFilterValue>('ALL');
  const [ownerFilter, setOwnerFilter] = useState<string>('ALL');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const { setPageManageContent, setHasActiveFilters, setPageSearchConfig } = useSidebar();

  const { data: rawOpportunities } = useSWR<OpportunityWithRelations[]>(
    ['pipeline-deals', tab, searchQuery],
    async () => {
      const res = await getPipelineOpportunities(tab, searchQuery);
      return (typeof res === 'string' ? JSON.parse(res) : res) as OpportunityWithRelations[];
    },
    {
      fallbackData: tab === initialTab ? initialOpportunities : undefined,
      revalidateOnMount: !(tab === initialTab && initialOpportunities !== undefined),
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      focusThrottleInterval: 15_000,
      dedupingInterval: 5_000,
    }
  );

  const visibleDeals = useMemo(() => {
    const fallback = tab === initialTab ? (initialOpportunities || []) : [];
    let list = rawOpportunities || fallback;
    if (tab === 'workspace') {
      const stageIds = new Set(stages.map(s => s.id));
      list = list.filter(o => Boolean(o.pipelineStageId && stageIds.has(o.pipelineStageId)));
    }
    if (cardType && cardType !== 'ALL') {
      list = list.filter(o => o.type === cardType);
    }
    if (ownerFilter && ownerFilter !== 'ALL') {
      list = list.filter(o => o.ownerId === ownerFilter || o.owner?.id === ownerFilter);
    }
    return list;
  }, [rawOpportunities, initialOpportunities, tab, initialTab, stages, cardType, ownerFilter]);

  const totalCards = visibleDeals.length;
  const redCardsCount = useMemo(() => visibleDeals.filter(checkIsRedCard).length, [visibleDeals]);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      const urlTab = searchParams.get('tab') || initialTab;
      if (urlTab !== tab) setTab(urlTab);
      const urlSearch = searchParams.get('search') || '';
      if (urlSearch !== searchQuery) setSearchQuery(urlSearch);
    }, 0);
    return () => clearTimeout(timer);
  }, [searchParams, initialTab, tab, searchQuery]);

  const updateUrl = useCallback((newTab: string, newSearch: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", newTab);
    if (newSearch) {
      params.set("search", newSearch);
    } else {
      params.delete("search");
    }
    window.history.pushState(null, '', `/pipeline?${params.toString()}`);
  }, [searchParams]);

  const handleTabChange = useCallback((newTab: string) => {
    setTab(newTab);
    updateUrl(newTab, searchQuery);
  }, [searchQuery, updateUrl]);

  const handleSearchChange = useCallback((newSearch: string) => {
    setSearchQuery(newSearch);
    updateUrl(tab, newSearch);
  }, [tab, updateUrl]);

  const handleResetFilters = useCallback(() => {
    setCardType('ALL');
    setOwnerFilter('ALL');
    handleSearchChange('');
    handleTabChange('workspace');
  }, [handleSearchChange, handleTabChange]);

  const activeFilterCount = 
    (cardType !== 'ALL' ? 1 : 0) + 
    (ownerFilter !== 'ALL' ? 1 : 0);

  const hasFilters = activeFilterCount > 0;
  useEffect(() => {
    setHasActiveFilters(hasFilters);
  }, [hasFilters, setHasActiveFilters]);

  // Connect Card Search to Mobile/Global Search (Find button)
  useEffect(() => {
    setPageSearchConfig({
      query: searchQuery,
      onSearch: handleSearchChange,
      placeholder: "Search",
    });
    return () => setPageSearchConfig(null);
  }, [handleSearchChange, searchQuery, setPageSearchConfig]);

  // Register mobile Manage modal content (100% shared component with Desktop)
  useEffect(() => {
    setPageManageContent(
      <PipelineFilterContent
        tab={tab}
        onTabChange={handleTabChange}
        cardType={cardType}
        onCardTypeChange={setCardType}
        ownerFilter={ownerFilter}
        onOwnerFilterChange={setOwnerFilter}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        userId={userId}
        stages={stages}
        companies={companies}
        activeFilterCount={activeFilterCount}
        onResetFilters={handleResetFilters}
      />
    );
    return () => setPageManageContent(null);
  }, [
    tab, 
    searchQuery, 
    cardType, 
    ownerFilter, 
    stages, 
    companies, 
    userId, 
    activeFilterCount, 
    handleSearchChange, 
    handleTabChange, 
    handleResetFilters, 
    setPageManageContent
  ]);

  return (
    <WorkspaceLayout scrollMode={tab === "completed" ? "auto" : "hidden"}>
      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden md:flex justify-between items-center mb-4 gap-3 flex-wrap">
        <div className="flex gap-2 bg-[#252728] p-1 rounded-full shrink-0">
          <button 
            type="button"
            onClick={() => handleTabChange('workspace')}
            className={`px-5 py-2 text-xs font-semibold flex items-center gap-2 rounded-full transition-all cursor-pointer ${tab === 'workspace' ? 'bg-[#3A3B3C] text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
          >
            ACTIVE
          </button>
          <button 
            type="button"
            onClick={() => handleTabChange('completed')}
            className={`px-5 py-2 text-xs font-semibold flex items-center gap-2 rounded-full transition-all cursor-pointer ${tab === 'completed' ? 'bg-[#3A3B3C] text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
          >
            ARCHIVED
          </button>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 ml-auto flex-wrap">
          {/* Expanding Search Component */}
          <PipelineSearch initialSearch={searchQuery} onSearch={handleSearchChange} />

          {/* Board Red / Total Cards Count Badge */}
          <span 
            className="h-8 px-3 rounded-full bg-[#252728] border border-[#3A3B3C] flex items-center justify-center text-xs font-semibold shrink-0 tabular-nums select-none"
            title={`Red Cards: ${redCardsCount} / ทั้งหมด: ${totalCards}`}
          >
            <span className={redCardsCount > 0 ? "text-[#C7F33C] font-bold" : "text-slate-400"}>
              {redCardsCount}
            </span>
            <span className="text-slate-500 font-normal mx-0.5">/</span>
            <span className="text-slate-300">
              {totalCards}
            </span>
          </span>

          {/* Centralized Filters Button */}
          <button
            type="button"
            onClick={() => setIsFiltersOpen(true)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer ${
              activeFilterCount > 0
                ? "bg-[#C7F33C]/10 border-[#C7F33C] text-[#C7F33C]"
                : "bg-[#252728] border-[#3A3B3C] text-slate-300 hover:text-white hover:bg-[#3A3B3C]"
            }`}
            title="Filters & Manage"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#C7F33C] text-black text-[10px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* New Card Button (Always rendered, disabled in Completed view to prevent layout shift) */}
          <CreateDealButton 
            stages={stages} 
            companies={companies} 
            disabled={tab === 'completed'}
          />
        </div>
      </div>

      {/* Centralized Pipeline Filters Drawer (matches CreateDealButton floating modal design) */}
      <PipelineFiltersDrawer
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        tab={tab}
        onTabChange={handleTabChange}
        cardType={cardType}
        onCardTypeChange={setCardType}
        ownerFilter={ownerFilter}
        onOwnerFilterChange={setOwnerFilter}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        userId={userId}
        stages={stages}
        companies={companies}
        activeFilterCount={activeFilterCount}
        onResetFilters={handleResetFilters}
      />

      <KanbanBoard 
        currentUserId={userId} 
        currentUserRole={role}
        initialStages={stages} 
        initialOpportunities={initialOpportunities}
        initialPendingAccelerators={initialPendingAccelerators}
        initialTab={initialTab}
        isCompletedTab={tab === 'completed'}
        activeTab={tab}
        activeSearch={searchQuery}
        cardTypeFilter={cardType}
        ownerFilter={ownerFilter}
      />
    </WorkspaceLayout>
  );
}
