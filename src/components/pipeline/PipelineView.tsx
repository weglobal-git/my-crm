"use client";

import { useState, useEffect, useCallback } from "react";
import { SlidersHorizontal } from "lucide-react";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { PipelineSearch } from "@/components/pipeline/PipelineSearch";
import { CreateDealButton } from "@/components/pipeline/CreateDealButton";
import { CardTypeFilterValue } from "@/components/pipeline/CardTypeFilter";
import { PipelineFiltersDrawer, PipelineFilterContent } from "@/components/pipeline/PipelineFiltersDrawer";
import { LtcPillButton, LtcDrawer } from "@/components/pipeline/ltc";
import { useSearchParams } from "next/navigation";
import { PipelineStage } from "@prisma/client";
import { OpportunityWithRelations } from "./KanbanCard";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { useSidebar } from "@/components/layout/SidebarContext";
import { getAllUsers } from "@/lib/actions/users";
import { preload } from "swr";
import { usePermissions } from "@/providers/PermissionProvider";
import type { PendingAcceleratorInfo } from "@/lib/actions/ai-accelerator";
import type { PipelineDepartmentOption, PipelineStageTitlesByDepartment } from "@/lib/pipeline-stage-titles";

interface PipelineViewProps {
  userId: string;
  role: string;
  stages: PipelineStage[];
  companies?: { id: string; name: string; displayName?: string | null; contacts?: { id: string; name: string }[] }[];
  initialOpportunities?: OpportunityWithRelations[];
  initialPendingAccelerators?: Record<string, PendingAcceleratorInfo>;
  stageTitleDepartments?: PipelineDepartmentOption[];
  initialStageTitlesByDepartment?: PipelineStageTitlesByDepartment;
  canEditStageTitles?: boolean;
  initialTab?: string;
}

function formatBoardRevenue(val: number): string {
  try {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      maximumFractionDigits: 0,
    }).format(val || 0);
  } catch {
    return `฿${(val || 0).toLocaleString()}`;
  }
}

export function PipelineView({ 
  userId, 
  role, 
  stages, 
  companies, 
  initialOpportunities, 
  initialPendingAccelerators,
  stageTitleDepartments = [],
  initialStageTitlesByDepartment = {},
  canEditStageTitles = false,
  initialTab = 'workspace' 
}: PipelineViewProps) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || initialTab);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [cardType, setCardType] = useState<CardTypeFilterValue>('ALL');
  const [ownerFilter, setOwnerFilter] = useState<string>('ALL');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isLtcOpen, setIsLtcOpen] = useState(false);
  const [boardStats, setBoardStats] = useState(() => ({ 
    total: initialOpportunities?.length || 0, 
    red: 0,
    revenue: initialOpportunities?.reduce((sum, d) => sum + (d.value != null && Number(d.value) > 0 ? Number(d.value) : 0), 0) || 0,
  }));

  const handleStatsChange = useCallback((newStats: { total: number; red: number; revenue?: number }) => {
    setBoardStats((prev) => {
      const newRev = newStats.revenue !== undefined ? newStats.revenue : prev.revenue;
      if (prev.total === newStats.total && prev.red === newStats.red && prev.revenue === newRev) {
        return prev;
      }
      return { total: newStats.total, red: newStats.red, revenue: newRev };
    });
  }, []);
  const [activeStageTitleDepartmentId, setActiveStageTitleDepartmentId] = useState(
    () => stageTitleDepartments[0]?.id || ''
  );
  const [stageTitlesByDepartment, setStageTitlesByDepartment] = useState(initialStageTitlesByDepartment);
  const { setPageManageContent, setHasActiveFilters, setPageSearchConfig, isManageModalOpen } = useSidebar();

  const handleStageTitleChanged = useCallback((stageId: string, title: string | null) => {
    if (!activeStageTitleDepartmentId) return;
    setStageTitlesByDepartment((current) => {
      const departmentTitles = { ...(current[activeStageTitleDepartmentId] || {}) };
      if (title) departmentTitles[stageId] = title;
      else delete departmentTitles[stageId];
      return { ...current, [activeStageTitleDepartmentId]: departmentTitles };
    });
  }, [activeStageTitleDepartmentId]);
  
  // Listen for browser Back/Forward (popstate) navigation
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const urlTab = params.get('tab') || initialTab;
      const urlSearch = params.get('search') || '';
      setTab(urlTab);
      setSearchQuery(urlSearch);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [initialTab]);

  const updateUrl = useCallback((newTab: string, newSearch: string) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (newTab) {
      params.set("tab", newTab);
    } else {
      params.delete("tab");
    }
    if (newSearch && newSearch.trim()) {
      params.set("search", newSearch.trim());
    } else {
      params.delete("search");
    }
    const query = params.toString();
    const newUrl = `/pipeline${query ? `?${query}` : ''}`;
    window.history.replaceState(null, '', newUrl);
  }, []);

  const handleTabChange = useCallback((newTab: string) => {
    setTab(newTab);
    updateUrl(newTab, searchQuery);
  }, [searchQuery, updateUrl]);

  const handleSearchChange = useCallback((newSearch: string) => {
    setSearchQuery(newSearch);
    updateUrl(tab, newSearch);
  }, [tab, updateUrl]);

  const { canSee, isAdmin } = usePermissions();
  const [hasValueFilter, setHasValueFilter] = useState(false);
  const [hasRedFilter, setHasRedFilter] = useState(false);

  // Determine active department based on activeStageTitleDepartmentId
  const activeDept = stageTitleDepartments?.find(
    (d) => d.id === activeStageTitleDepartmentId
  ) || stageTitleDepartments?.[0];

  const canShowRevenuePill = activeDept
    ? (isAdmin ? Boolean(activeDept.hasSalesAccess) : (Boolean(activeDept.hasSalesAccess) && canSee("pipeline.information")))
    : canSee("pipeline.information");

  // Esc to clear value filter or red card filter
  useEffect(() => {
    if (!hasValueFilter && !hasRedFilter) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setHasValueFilter(false);
        setHasRedFilter(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasValueFilter, hasRedFilter]);

  const handleResetFilters = useCallback(() => {
    setCardType('ALL');
    setOwnerFilter('ALL');
    setHasValueFilter(false);
    setHasRedFilter(false);
    handleSearchChange('');
    handleTabChange('workspace');
  }, [handleSearchChange, handleTabChange]);

  const activeFilterCount = 
    (cardType !== 'ALL' ? 1 : 0) + 
    (ownerFilter !== 'ALL' ? 1 : 0) +
    (hasValueFilter ? 1 : 0) +
    (hasRedFilter ? 1 : 0);

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

  // Register mobile Manage modal content (only mounts subtree when modal is open to avoid premature fetches)
  useEffect(() => {
    if (!isManageModalOpen) {
      setPageManageContent(<span className="hidden" aria-hidden="true" />);
      return;
    }

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
        stageTitleDepartments={stageTitleDepartments}
        activeStageTitleDepartmentId={activeStageTitleDepartmentId}
        onActiveStageTitleDepartmentChange={setActiveStageTitleDepartmentId}
        activeFilterCount={activeFilterCount}
        onResetFilters={handleResetFilters}
        onOpenLtc={() => setIsLtcOpen(true)}
      />
    );
    return () => setPageManageContent(null);
  }, [
    isManageModalOpen,
    tab, 
    searchQuery, 
    cardType, 
    ownerFilter, 
    stages, 
    companies, 
    stageTitleDepartments,
    activeStageTitleDepartmentId,
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

        <div className="flex items-center gap-1.5 shrink-0 ml-auto flex-wrap">
          {/* Expanding Search Component */}
          <PipelineSearch initialSearch={searchQuery} onSearch={handleSearchChange} />

          {/* Board Total Revenue Pill Badge / Filter Button */}
          {canShowRevenuePill && (
            <button 
              type="button"
              onClick={() => setHasValueFilter((prev) => !prev)}
              className={`h-8 px-3 rounded-full border flex items-center justify-center text-xs font-semibold shrink-0 tabular-nums select-none gap-1.5 transition-all cursor-pointer ${
                hasValueFilter
                  ? "bg-[#C7F33C]/20 border-[#C7F33C] text-[#C7F33C] shadow-[0_0_12px_rgba(199,243,60,0.25)]"
                  : "bg-[#252728] border-[#3A3B3C] hover:border-[#4E4F50] text-[#C7F33C]"
              }`}
              title={
                hasValueFilter
                  ? `Filtering: Deals with revenue (${formatBoardRevenue(boardStats.revenue || 0)}) - Click or press Esc to clear`
                  : `Total Revenue: ${formatBoardRevenue(boardStats.revenue || 0)} (Click to filter deals with value)`
              }
              aria-pressed={hasValueFilter}
            >
              <span className="text-[#C7F33C] font-bold">
                {formatBoardRevenue(boardStats.revenue || 0)}
              </span>
            </button>
          )}

          {/* Board Red / Total Cards Count Badge (Clickable Toggle Filter) */}
          <button 
            type="button"
            onClick={() => setHasRedFilter((prev) => !prev)}
            className={`h-8 px-3 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 tabular-nums select-none transition-all cursor-pointer ${
              hasRedFilter
                ? "bg-rose-500/20 border-2 border-rose-500 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.35)]"
                : "bg-[#252728] border border-[#3A3B3C] hover:border-[#4E4F50] text-slate-300"
            }`}
            title={
              hasRedFilter
                ? `Filtering: Showing only Red Cards (${boardStats.red}) - Click or press Esc to clear`
                : `Red Cards: ${boardStats.red} / ทั้งหมด: ${boardStats.total} (Click to filter only Red Cards)`
            }
            aria-pressed={hasRedFilter}
          >
            <span className={hasRedFilter ? "text-rose-400 font-bold" : boardStats.red > 0 ? "text-[#C7F33C] font-bold" : "text-slate-400"}>
              {boardStats.red}
            </span>
            <span className="text-slate-500 font-normal mx-0.5">/</span>
            <span className={hasRedFilter ? "text-rose-200" : "text-slate-300"}>
              {boardStats.total} RED
            </span>
          </button>

          {/* LTC (Long-Time Contact) Pill Button (Desktop) */}
          <LtcPillButton 
            onClick={() => setIsLtcOpen(true)}
            className="hidden sm:inline-flex"
          />

          {/* Centralized Filters Button */}
          <button
            type="button"
            onClick={() => setIsFiltersOpen(true)}
            onMouseEnter={() => void preload("all-users", getAllUsers)}
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
        stageTitleDepartments={stageTitleDepartments}
        activeStageTitleDepartmentId={activeStageTitleDepartmentId}
        onActiveStageTitleDepartmentChange={setActiveStageTitleDepartmentId}
        activeFilterCount={activeFilterCount}
        onResetFilters={handleResetFilters}
        onOpenLtc={() => setIsLtcOpen(true)}
      />

      {/* LTC (Long-Time Contact) Drawer */}
      <LtcDrawer
        isOpen={isLtcOpen}
        onClose={() => setIsLtcOpen(false)}
        stages={stages}
      />

      <KanbanBoard 
        currentUserId={userId} 
        currentUserRole={role}
        initialStages={stages} 
        initialOpportunities={initialOpportunities}
        initialPendingAccelerators={initialPendingAccelerators}
        activeStageTitleDepartmentId={activeStageTitleDepartmentId}
        stageTitlesByDepartment={stageTitlesByDepartment}
        canEditStageTitles={canEditStageTitles}
        onStageTitleChanged={handleStageTitleChanged}
        initialTab={initialTab}
        isCompletedTab={tab === 'completed'}
        activeTab={tab}
        activeSearch={searchQuery}
        cardTypeFilter={cardType}
        ownerFilter={ownerFilter}
        hasValueFilter={hasValueFilter}
        hasRedFilter={hasRedFilter}
        onOwnerFilterChange={setOwnerFilter}
        onSearchChange={handleSearchChange}
        onStatsChange={handleStatsChange}
      />
    </WorkspaceLayout>
  );
}
