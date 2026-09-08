"use client";

import { useEffect, useRef } from "react";
import { X, SlidersHorizontal, RotateCcw, Check } from "lucide-react";
import { PipelineStage } from "@prisma/client";
import { CardTypeFilter, CardTypeFilterValue } from "@/components/pipeline/CardTypeFilter";
import { PipelineQuickFilters } from "@/components/pipeline/PipelineQuickFilters";
import { CreateDealButton } from "@/components/pipeline/CreateDealButton";
import useSWR from "swr";
import { getAllUsers } from "@/lib/actions/users";
import { getOptimizedCloudinaryUrl } from "@/lib/utils";

export interface UserItem {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string | null;
  departments?: { name: string }[] | null;
}

export interface PipelineFilterContentProps {
  // Tab / View
  tab: string;
  onTabChange: (tab: string) => void;
  // Card Type Filter
  cardType: CardTypeFilterValue;
  onCardTypeChange: (type: CardTypeFilterValue) => void;
  // Card Owner Filter
  ownerFilter: string;
  onOwnerFilterChange: (ownerId: string) => void;
  // Search Query / Quick Filter
  searchQuery: string;
  onSearchChange: (search: string) => void;
  // Pipeline metadata
  userId: string;
  stages: PipelineStage[];
  companies?: { id: string; name: string; displayName?: string | null; contacts?: { id: string; name: string }[] }[];
  // Active Filter Summary & Reset
  activeFilterCount: number;
  onResetFilters: () => void;
  onClose?: () => void;
}

export function PipelineFilterContent({
  tab,
  onTabChange,
  cardType,
  onCardTypeChange,
  ownerFilter,
  onOwnerFilterChange,
  searchQuery,
  onSearchChange,
  userId,
  stages,
  companies,
  activeFilterCount,
  onResetFilters,
  onClose,
}: PipelineFilterContentProps) {
  // Load all users for Card Owner selector (deduped across app)
  const { data: allUsers = [] } = useSWR<UserItem[]>(
    "all-users",
    getAllUsers,
    { revalidateOnFocus: false, dedupingInterval: 120_000 }
  );

  // Filter out ADMIN if they don't own operational deals, or keep all users with names
  const eligibleOwners = allUsers.filter(u => u.name && u.role !== "ADMIN");

  return (
    <div className="flex flex-col gap-6 select-none">
      {/* Top Action: + New Card button */}
      <div className="w-full">
        <CreateDealButton 
          stages={stages} 
          companies={companies} 
          disabled={tab === "completed"}
        />
      </div>

      {/* Section 1: View (Active / Archived) */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider pl-1">
          View
        </label>
        <div className="grid grid-cols-2 gap-2 bg-[#1C1C1D] p-1 rounded-xl">
          <button 
            type="button"
            onClick={() => onTabChange("workspace")}
            className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              tab === "workspace" 
                ? "bg-[#3A3B3C] text-slate-100 shadow-sm" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            My Workspace
          </button>
          <button 
            type="button"
            onClick={() => onTabChange("completed")}
            className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              tab === "completed" 
                ? "bg-[#3A3B3C] text-slate-100 shadow-sm" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Completed
          </button>
        </div>
      </div>

      {/* Section 2: Card Type */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider pl-1">
          Card Type
        </label>
        <CardTypeFilter value={cardType} onChange={onCardTypeChange} variant="segmented" />
      </div>

      {/* Section 3: Card Owner Filter */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between pl-1">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Card Owner
          </label>
          {ownerFilter !== "ALL" && (
            <button
              type="button"
              onClick={() => onOwnerFilterChange("ALL")}
              className="text-[11px] text-[#C7F33C] hover:underline cursor-pointer font-medium"
            >
              Clear Owner
            </button>
          )}
        </div>

        {/* Owner Profile Avatar Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {/* Individual Owners */}
          {eligibleOwners.map((owner) => {
            const isSelected = ownerFilter === owner.id;
            const avatarUrl = owner.image 
              ? getOptimizedCloudinaryUrl(owner.image, 100) 
              : `https://api.dicebear.com/7.x/notionists/svg?seed=${owner.name || "Unknown"}`;
            
            return (
              <button
                key={owner.id}
                type="button"
                onClick={() => onOwnerFilterChange(isSelected ? "ALL" : owner.id)}
                className={`flex items-center gap-2 p-2 rounded-xl border text-xs transition-all cursor-pointer text-left ${
                  isSelected
                    ? "border-[#C7F33C] bg-[#C7F33C]/10 text-[#C7F33C] font-semibold shadow-sm ring-1 ring-[#C7F33C]"
                    : "border-[#3A3B3C] bg-[#1E1F20] text-slate-300 hover:border-[#4E4F50] hover:text-white"
                }`}
                title={owner.name || "Owner"}
              >
                <div className={`w-7 h-7 rounded-full overflow-hidden shrink-0 border ${
                  isSelected ? "border-[#C7F33C] ring-1 ring-[#C7F33C]" : "border-slate-700"
                } bg-[#3A3B3C]`}>
                  <img 
                    src={avatarUrl} 
                    alt={owner.name || "User"} 
                    className="w-full h-full object-cover" 
                  />
                </div>
                <span className="truncate flex-1">{owner.name}</span>
                {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-[#C7F33C]" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 4: Quick Filters */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider pl-1">
          Quick Filters
        </label>
        <PipelineQuickFilters
          userId={userId}
          activeFilter={searchQuery}
          onSelectFilter={onSearchChange}
        />
      </div>

      {/* Actions footer (Reset) */}
      <div className="pt-2 border-t border-[#3A3B3C] flex items-center justify-between gap-3">
        {activeFilterCount > 0 ? (
          <button
            type="button"
            onClick={onResetFilters}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-rose-400 transition-colors cursor-pointer px-3 py-2 rounded-xl hover:bg-[#3A3B3C]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset All Filters
          </button>
        ) : (
          <span className="text-xs text-slate-500 pl-1">No filters applied</span>
        )}
        
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-[#C7F33C] text-black font-semibold text-xs hover:bg-[#b0d932] transition-colors cursor-pointer ml-auto"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}

export interface PipelineFiltersDrawerProps extends PipelineFilterContentProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PipelineFiltersDrawer({
  isOpen,
  onClose,
  ...contentProps
}: PipelineFiltersDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Click outside and Escape key listeners
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`} 
        onClick={onClose}
      />
      
      {/* Floating Drawer Card */}
      <div className={`fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[450px] md:max-w-[calc(100vw-32px)] z-[101] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right ${isOpen ? "opacity-100 translate-y-0 md:translate-x-0 scale-100" : "opacity-0 translate-y-4 md:translate-x-8 scale-[0.97] pointer-events-none"}`}>
        <div ref={drawerRef} className="w-full bg-[#252728] border-0 md:border border-[#3A3B3C] flex flex-col h-full rounded-none md:rounded-2xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-5 sm:p-6 border-b border-[#1C1C1D] shrink-0 bg-[#252728]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#3A3B3C] border border-[#4E4F50] flex items-center justify-center shrink-0">
                <SlidersHorizontal className="w-4 h-4 text-[#C7F33C]" />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-100">
                  Manage & Filters
                </h2>
                {contentProps.activeFilterCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#C7F33C] text-black text-[11px] font-bold">
                    {contentProps.activeFilterCount} Active
                  </span>
                )}
              </div>
            </div>
            <button 
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-[#3A3B3C] rounded-full transition-colors text-slate-400 hover:text-slate-200 cursor-pointer"
              aria-label="Close filters"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Filters Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <PipelineFilterContent 
              {...contentProps} 
              onClose={onClose} 
            />
          </div>
        </div>
      </div>
    </>
  );
}
