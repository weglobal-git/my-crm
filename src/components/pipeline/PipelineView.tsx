"use client";

import { useState, useEffect, useCallback } from "react";
import { SlidersHorizontal, Rows3, Rows2 } from "lucide-react";
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
import type { UserLeaveDTO } from "@/lib/actions/holiday";
import {
  getPipelineCardDensityStorageKey,
  getStoredPipelineCardDensityClient,
  parsePipelineCardDensity,
  saveStoredPipelineCardDensityClient,
  type PipelineCardDensity,
} from "@/lib/pipeline-card-density-client";

interface PipelineViewProps {
  userId: string;
  role: string;
  stages: PipelineStage[];
  companies?: { id: string; name: string; displayName?: string | null; contacts?: { id: string; name: string }[] }[];
  initialOpportunities?: OpportunityWithRelations[];
  initialPendingAccelerators?: Record<string, PendingAcceleratorInfo>;
  initialPinnedDealIds?: string[];
  initialCardDensity?: PipelineCardDensity;
  initialHolidays?: string[];
  initialLeaves?: UserLeaveDTO[];
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
  initialPinnedDealIds,
  initialCardDensity,
  initialHolidays,
  initialLeaves,
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
  const [cardDensity, setCardDensity] = useState<PipelineCardDensity>(
    () => initialCardDensity ?? getStoredPipelineCardDensityClient(userId)
  );
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isLtcOpen, setIsLtcOpen] = useState(false);

  useEffect(() => {
    const storageKey = getPipelineCardDensityStorageKey(userId);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === storageKey) {
        setCardDensity(parsePipelineCardDensity(e.newValue));
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [userId]);

  const handleCardDensityChange = useCallback(
    (nextDensity: PipelineCardDensity) => {
      setCardDensity(nextDensity);
      saveStoredPipelineCardDensityClient(userId, nextDensity);
    },
    [userId]
  );
  const [boardStats, setBoardStats] = useState(() => ({ 
    total: initialOpportunities?.length || 0, 
    red: 0,
    yellow: 0,
    revenue: initialOpportunities?.reduce((sum, d) => sum + (d.value != null && Number(d.value) > 0 ? Number(d.value) : 0), 0) || 0,
  }));

  const handleStatsChange = useCallback((newStats: { total: number; red: number; yellow: number; revenue?: number }) => {
    setBoardStats((prev) => {
      const newRev = newStats.revenue !== undefined ? newStats.revenue : prev.revenue;
      if (
        prev.total === newStats.total &&
        prev.red === newStats.red &&
        prev.yellow === newStats.yellow &&
        prev.revenue === newRev
      ) {
        return prev;
      }
      return { total: newStats.total, red: newStats.red, yellow: newStats.yellow, revenue: newRev };
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
  const [hasYellowFilter, setHasYellowFilter] = useState(false);

  // Determine active department based on activeStageTitleDepartmentId
  const activeDept = stageTitleDepartments?.find(
    (d) => d.id === activeStageTitleDepartmentId
  ) || stageTitleDepartments?.[0];

  const canShowRevenuePill = activeDept
    ? (isAdmin ? Boolean(activeDept.hasSalesAccess) : (Boolean(activeDept.hasSalesAccess) && canSee("pipeline.information")))
    : canSee("pipeline.information");

  // Esc to clear active board filters (owner from ⌘+Click, card type, revenue, yellow, or red)
  useEffect(() => {
    const hasBoardFilter =
      ownerFilter !== "ALL" ||
      cardType !== "ALL" ||
      hasValueFilter ||
      hasRedFilter ||
      hasYellowFilter;
    if (!hasBoardFilter) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isFiltersOpen || isLtcOpen || isManageModalOpen) return;

      const target = e.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName || "")
      ) {
        return;
      }

      if (
        document.body.dataset.dealPanelOpen === "true" ||
        document.querySelector('[data-deal-panel-open="true"]')
      ) {
        return;
      }

      setOwnerFilter("ALL");
      setCardType("ALL");
      setHasValueFilter(false);
      setHasRedFilter(false);
      setHasYellowFilter(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [ownerFilter, cardType, hasValueFilter, hasRedFilter, hasYellowFilter, isFiltersOpen, isLtcOpen, isManageModalOpen]);

  const handleResetFilters = useCallback(() => {
    setCardType('ALL');
    setOwnerFilter('ALL');
    setHasValueFilter(false);
    setHasRedFilter(false);
    setHasYellowFilter(false);
    handleSearchChange('');
    handleTabChange('workspace');
  }, [handleSearchChange, handleTabChange]);

  const activeFilterCount = 
    (cardType !== 'ALL' ? 1 : 0) + 
    (ownerFilter !== 'ALL' ? 1 : 0) +
    (hasValueFilter ? 1 : 0) +
    (hasRedFilter ? 1 : 0) +
    (hasYellowFilter ? 1 : 0);

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
        cardDensity={cardDensity}
        onCardDensityChange={handleCardDensityChange}
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
    cardDensity,
    handleCardDensityChange,
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

          {/* Unified Board Counts Pill: Yellow | Red | Total (each segment clickable) */}
          <div
            role="group"
            aria-label="Board card status summary and filters"
            className={`h-8 px-1 rounded-full flex items-center text-xs font-semibold shrink-0 tabular-nums select-none transition-colors ${
              hasYellowFilter
                ? "bg-[#252728] border border-[#FACC15]"
                : hasRedFilter
                ? "bg-[#252728] border border-[#C7F33C]"
                : "bg-[#252728] border border-[#3A3B3C] hover:border-[#4E4F50]"
            }`}
          >
            <button
              type="button"
              onClick={() => setHasYellowFilter((prev) => !prev)}
              aria-pressed={hasYellowFilter}
              title={
                hasYellowFilter
                  ? `Filtering Yellow Cards (${boardStats.yellow}) — Click or press Esc to clear`
                  : `Yellow Cards (Clear Today): ${boardStats.yellow} — Click to filter`
              }
              className={`h-6 px-2 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                hasYellowFilter
                  ? "bg-[#FACC15]/20 text-[#FDE047] font-bold"
                  : boardStats.yellow > 0
                  ? "text-[#FACC15] font-bold hover:bg-[#3A3B3C]"
                  : "text-slate-400 hover:bg-[#3A3B3C] hover:text-slate-200"
              }`}
            >
              {boardStats.yellow}
            </button>

            <span className="text-slate-600 font-normal select-none" aria-hidden="true">
              |
            </span>

            <button
              type="button"
              onClick={() => setHasRedFilter((prev) => !prev)}
              aria-pressed={hasRedFilter}
              title={
                hasRedFilter
                  ? `Filtering Red Cards (${boardStats.red}) — Click or press Esc to clear`
                  : `Red Cards: ${boardStats.red} — Click to filter`
              }
              className={`h-6 px-2 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                hasRedFilter
                  ? "bg-[#C7F33C]/20 text-[#C7F33C] font-bold"
                  : boardStats.red > 0
                  ? "text-[#C7F33C] font-bold hover:bg-[#3A3B3C]"
                  : "text-slate-400 hover:bg-[#3A3B3C] hover:text-slate-200"
              }`}
            >
              {boardStats.red}
            </button>

            <span className="text-slate-600 font-normal select-none" aria-hidden="true">
              |
            </span>

            <button
              type="button"
              onClick={() => {
                if (hasYellowFilter || hasRedFilter) {
                  setHasYellowFilter(false);
                  setHasRedFilter(false);
                }
              }}
              title={
                hasYellowFilter || hasRedFilter
                  ? `Total Cards: ${boardStats.total} — Click or press Esc to show all`
                  : `Total Cards: ${boardStats.total}`
              }
              className={`h-6 px-2 rounded-full flex items-center justify-center transition-colors ${
                hasYellowFilter || hasRedFilter
                  ? "text-slate-300 hover:bg-[#3A3B3C] hover:text-white cursor-pointer"
                  : "text-slate-300 cursor-default"
              }`}
            >
              {boardStats.total}
            </button>
          </div>

          {/* LTC (Long-Time Contact) Pill Button (Desktop) */}
          <LtcPillButton 
            onClick={() => setIsLtcOpen(true)}
            className="hidden sm:inline-flex"
          />

          {/* Card Density Switcher (Compact <-> Standard, icon-only) */}
          <div
            role="group"
            aria-label="Card display density"
            className="h-8 p-0.5 rounded-full bg-[#252728] border border-[#3A3B3C] flex items-center gap-0.5 shrink-0"
          >
            <button
              type="button"
              onClick={() => handleCardDensityChange("compact")}
              aria-label="Compact view"
              aria-pressed={cardDensity === "compact"}
              title="Compact view"
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                cardDensity === "compact"
                  ? "bg-[#3A3B3C] text-[#C7F33C]"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Rows3 className="w-3.5 h-3.5 shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => handleCardDensityChange("standard")}
              aria-label="Standard view"
              aria-pressed={cardDensity === "standard"}
              title="Standard view"
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                cardDensity === "standard"
                  ? "bg-[#3A3B3C] text-[#C7F33C]"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Rows2 className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>

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
        cardDensity={cardDensity}
        onCardDensityChange={handleCardDensityChange}
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
        initialPinnedDealIds={initialPinnedDealIds}
        initialHolidays={initialHolidays}
        initialLeaves={initialLeaves}
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
        hasYellowFilter={hasYellowFilter}
        cardDensity={cardDensity}
        onOwnerFilterChange={setOwnerFilter}
        onSearchChange={handleSearchChange}
        onStatsChange={handleStatsChange}
      />
    </WorkspaceLayout>
  );
}
