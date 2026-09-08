"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { X, Search, Check, Minus, UserPlus, ArrowRightLeft, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import useSWR from "swr";
import { getAllUsers } from "@/lib/actions/users";

export interface UserItem {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string | null;
  departments?: { name: string }[] | null;
}

export interface MemberSelectDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  mode: "multiple" | "single";
  dealId?: string;
  currentOwnerId?: string;
  excludeUserIds?: string[];
  initialSelectedUserIds?: string[];
  confirmButtonLabel?: string;
  onConfirmMultiple?: (selectedUserIds: string[]) => Promise<void> | void;
  onConfirmSingle?: (selectedUserId: string) => Promise<void> | void;
  isSubmitting?: boolean;
}

export function MemberSelectDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  mode,
  currentOwnerId,
  excludeUserIds = [],
  initialSelectedUserIds,
  confirmButtonLabel,
  onConfirmMultiple,
  onConfirmSingle,
  isSubmitting = false,
}: MemberSelectDrawerProps) {
  const [search, setSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(initialSelectedUserIds || []);
  const [collapsedDepts, setCollapsedDepts] = useState<Record<string, boolean>>({});
  const drawerRef = useRef<HTMLDivElement>(null);

  // Reset state when opening (render-time synchronization, avoiding cascading renders)
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setSearch("");
      setSelectedUserIds(initialSelectedUserIds || []);
      setCollapsedDepts({});
    }
  }

  // 1. SWR Fetch with 2-minute deduplication and global cache for 0ms instant display
  const { data: allUsers = [], isLoading } = useSWR<UserItem[]>(
    isOpen ? "all-users" : null,
    getAllUsers,
    { revalidateOnFocus: false, dedupingInterval: 120_000 }
  );

  // Click outside and Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (isSubmitting) return;
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isSubmitting, onClose]);

  // Group users by department
  const { departmentGroups, totalEligibleCount } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const groups: Record<string, { users: UserItem[]; eligibleUsers: UserItem[] }> = {};
    let eligibleCount = 0;

    for (const u of allUsers) {
      if (u.role === "ADMIN") continue; // Admins already have global access

      const matchesSearch =
        !q ||
        (u.name?.toLowerCase().includes(q) ?? false) ||
        (u.email?.toLowerCase().includes(q) ?? false) ||
        (u.departments?.some(d => d.name.toLowerCase().includes(q)) ?? false);

      if (!matchesSearch) continue;

      const isExcluded = excludeUserIds.includes(u.id);
      const isOwner = currentOwnerId === u.id;
      const isEligible = !isExcluded && !isOwner;

      const deptName =
        u.departments && u.departments.length > 0
          ? u.departments.map(d => d.name).join(", ")
          : "Unassigned";

      if (!groups[deptName]) {
        groups[deptName] = { users: [], eligibleUsers: [] };
      }
      groups[deptName].users.push(u);
      if (isEligible) {
        groups[deptName].eligibleUsers.push(u);
        eligibleCount++;
      }
    }

    // Sort departments alphabetically with 'Unassigned' at the end
    const sortedDeptKeys = Object.keys(groups).sort((a, b) => {
      if (a === "Unassigned") return 1;
      if (b === "Unassigned") return -1;
      return a.localeCompare(b);
    });

    const sortedGroups = sortedDeptKeys.map(key => ({
      name: key,
      users: groups[key].users,
      eligibleUsers: groups[key].eligibleUsers,
    }));

    return { departmentGroups: sortedGroups, totalEligibleCount: eligibleCount };
  }, [allUsers, excludeUserIds, currentOwnerId, search]);

  // Toggle user selection
  const handleToggleUser = (userId: string) => {
    if (mode === "single") {
      setSelectedUserIds([userId]);
      return;
    }

    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  // Toggle entire department selection
  const handleToggleDepartment = (deptEligibleUsers: UserItem[]) => {
    if (mode !== "multiple" || deptEligibleUsers.length === 0) return;

    const deptEligibleIds = deptEligibleUsers.map(u => u.id);
    const allSelected = deptEligibleIds.every(id => selectedUserIds.includes(id));

    if (allSelected) {
      // Uncheck all in this department
      setSelectedUserIds(prev => prev.filter(id => !deptEligibleIds.includes(id)));
    } else {
      // Check all in this department
      setSelectedUserIds(prev => {
        const set = new Set([...prev, ...deptEligibleIds]);
        return Array.from(set);
      });
    }
  };

  const handleSelectAll = () => {
    const allEligibleIds = departmentGroups.flatMap(g => g.eligibleUsers.map(u => u.id));
    setSelectedUserIds(allEligibleIds);
  };

  const handleDeselectAll = () => {
    setSelectedUserIds([]);
  };

  const handleConfirm = async () => {
    if (isSubmitting) return;

    if (mode === "multiple" && onConfirmMultiple) {
      if (selectedUserIds.length === 0 && !confirmButtonLabel) return;
      await onConfirmMultiple(selectedUserIds);
      onClose();
    } else if (mode === "single" && onConfirmSingle) {
      if (selectedUserIds.length === 0) return;
      await onConfirmSingle(selectedUserIds[0]);
      onClose();
    }
  };

  const selectedUserName = useMemo(() => {
    if (mode !== "single" || selectedUserIds.length === 0) return "";
    const user = allUsers.find(u => u.id === selectedUserIds[0]);
    return user?.name || "Selected User";
  }, [mode, selectedUserIds, allUsers]);

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[120] transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`} 
        onClick={() => isSubmitting ? null : onClose()}
      />

      {/* Floating Drawer Card (Anchored to Right Edge with margins on desktop) */}
      <div className={`fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[450px] md:max-w-[calc(100vw-32px)] z-[121] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right ${isOpen ? "opacity-100 translate-y-0 md:translate-x-0 scale-100" : "opacity-0 translate-y-4 md:translate-x-8 scale-[0.97] pointer-events-none"}`}>
        <div ref={drawerRef} className="w-full bg-[#252728] border-0 md:border border-[#3A3B3C] flex flex-col h-full rounded-none md:rounded-2xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-5 sm:p-6 border-b border-[#1C1C1D] shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#3A3B3C] border border-[#4E4F50] flex items-center justify-center shrink-0">
                {mode === "multiple" ? (
                  <UserPlus className="w-4 h-4 text-[#C7F33C]" />
                ) : (
                  <ArrowRightLeft className="w-4 h-4 text-[#C7F33C]" />
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <h2 className="text-xl font-bold text-slate-100 truncate">
                  {title || (mode === "multiple" ? "Add Team Members" : "Transfer Deal")}
                </h2>
                {subtitle && (
                  <p className="text-xs text-slate-400 truncate">{subtitle}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="p-2 hover:bg-[#3A3B3C] rounded-full transition-colors text-slate-400 hover:text-slate-200 shrink-0 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-[#3A3B3C] bg-[#252728] shrink-0">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search member or department..."
              className="w-full bg-[#3A3B3C] border border-[#4E4F50] rounded-xl py-2 pl-9 pr-8 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-[#C7F33C] transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Action bar for multi-select */}
          {mode === "multiple" && !isLoading && totalEligibleCount > 0 && (
            <div className="flex items-center justify-between mt-2.5 px-1 text-xs">
              <span className="text-slate-400">
                Selected: <strong className="text-[#C7F33C] font-semibold">{selectedUserIds.length}</strong> / {totalEligibleCount}
              </span>
              <div className="flex items-center gap-2">
                {selectedUserIds.length < totalEligibleCount ? (
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-xs text-slate-300 hover:text-[#C7F33C] transition-colors cursor-pointer font-medium"
                  >
                    Select All
                  </button>
                ) : null}
                {selectedUserIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="text-xs text-slate-400 hover:text-rose-400 transition-colors cursor-pointer font-medium"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Body: Department > User Hierarchy */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
          {isLoading ? (
            <div className="space-y-3 py-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse space-y-2">
                  <div className="h-6 bg-[#3A3B3C] rounded-lg w-1/3" />
                  <div className="h-12 bg-[#3A3B3C] rounded-xl w-full" />
                  <div className="h-12 bg-[#3A3B3C] rounded-xl w-full" />
                </div>
              ))}
            </div>
          ) : departmentGroups.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center justify-center gap-2 text-slate-400">
              <Search className="w-8 h-8 text-slate-600 mb-1" />
              <p className="text-xs font-semibold text-slate-300">No members found</p>
              <p className="text-xs text-slate-500">
                {search ? `No results for "${search}"` : "All members are already in the team"}
              </p>
            </div>
          ) : (
            departmentGroups.map(group => {
              const isCollapsed = collapsedDepts[group.name];
              const eligibleIds = group.eligibleUsers.map(u => u.id);
              const selectedCount = eligibleIds.filter(id => selectedUserIds.includes(id)).length;
              const isAllSelected = eligibleIds.length > 0 && selectedCount === eligibleIds.length;
              const isPartialSelected = selectedCount > 0 && selectedCount < eligibleIds.length;

              return (
                <div key={group.name} className="border border-[#3A3B3C] rounded-xl overflow-hidden bg-[#2A2B2D]">
                  {/* Department Level Header */}
                  <div
                    className="flex items-center justify-between p-2.5 bg-[#313335] border-b border-[#3A3B3C] cursor-pointer select-none"
                    onClick={() => {
                      // Toggle collapse
                      setCollapsedDepts(prev => ({ ...prev, [group.name]: !prev[group.name] }));
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {mode === "multiple" && (
                        <div
                          onClick={e => {
                            e.stopPropagation();
                            handleToggleDepartment(group.eligibleUsers);
                          }}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                            isAllSelected
                              ? "bg-[#C7F33C] border-[#C7F33C] text-black"
                              : isPartialSelected
                              ? "bg-[#C7F33C]/20 border-[#C7F33C] text-[#C7F33C]"
                              : "border-slate-500 hover:border-slate-300 bg-transparent"
                          }`}
                        >
                          {isAllSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          {isPartialSelected && <Minus className="w-3 h-3 stroke-[3]" />}
                        </div>
                      )}
                      <span className="text-xs font-bold text-slate-200 uppercase tracking-wider truncate">
                        {group.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-400 font-medium px-2 py-0.5 rounded-full bg-[#252728] border border-[#3A3B3C]">
                        {mode === "multiple" && selectedCount > 0
                          ? `${selectedCount}/${group.eligibleUsers.length}`
                          : `${group.users.length}`}
                      </span>
                      {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Users in Department */}
                  {!isCollapsed && (
                    <div className="divide-y divide-[#3A3B3C]/50">
                      {group.users.map(user => {
                        const isExcluded = excludeUserIds.includes(user.id);
                        const isOwner = currentOwnerId === user.id;
                        const isSelected = selectedUserIds.includes(user.id);
                        const isDisabled = isExcluded || isOwner;

                        return (
                          <div
                            key={user.id}
                            onClick={() => !isDisabled && handleToggleUser(user.id)}
                            className={`flex items-center justify-between p-2.5 transition-colors ${
                              isDisabled
                                ? "opacity-50 cursor-not-allowed bg-[#252728]/50"
                                : isSelected
                                ? "bg-[#3A3B3C] cursor-pointer"
                                : "hover:bg-[#323436] cursor-pointer"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                              {/* Round Checkbox (Multi) or Radio (Single) */}
                              {mode === "multiple" ? (
                                <div
                                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
                                    isDisabled
                                      ? "border-slate-400 bg-slate-300"
                                      : isSelected
                                      ? "bg-[#C7F33C] border-[#C7F33C] text-black"
                                      : "border-slate-500 bg-transparent"
                                  }`}
                                >
                                  {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                </div>
                              ) : (
                                <div
                                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
                                    isDisabled
                                      ? "border-slate-600 bg-transparent"
                                      : isSelected
                                      ? "border-[#C7F33C] bg-[#C7F33C]/20"
                                      : "border-slate-500 bg-transparent"
                                  }`}
                                >
                                  {isSelected && <div className="w-2 h-2 rounded-full bg-[#C7F33C]" />}
                                </div>
                              )}

                              {/* Avatar */}
                              <div className="w-7 h-7 rounded-full bg-[#4E4F50] overflow-hidden shrink-0">
                                <img
                                  src={
                                    user.image ||
                                    `https://api.dicebear.com/7.x/notionists/svg?seed=${user.name || user.id}`
                                  }
                                  alt="Avatar"
                                  className="w-full h-full object-cover"
                                />
                              </div>

                              {/* Info */}
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-xs font-medium text-slate-200 truncate">
                                  {user.name || "Unknown"}
                                </span>
                                {user.email && (
                                  <span className="text-xs text-slate-400 truncate">{user.email}</span>
                                )}
                              </div>
                            </div>

                            {/* Status badge if already member / owner */}
                            {isDisabled && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-[#3A3B3C] text-slate-400 border border-[#4E4F50] shrink-0">
                                {isOwner ? "Owner" : "In Team"}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Sticky Footer */}
        <div className="p-4 border-t border-[#3A3B3C] shrink-0 bg-[#252728] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-[#3A3B3C] rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={(selectedUserIds.length === 0 && !confirmButtonLabel) || isSubmitting}
            className="px-5 py-2.5 text-xs font-bold bg-[#C7F33C] text-black rounded-xl hover:bg-[#b0d635] transition-colors disabled:opacity-40 disabled:pointer-events-none flex items-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : confirmButtonLabel ? (
              <>
                <Check className="w-4 h-4" />
                <span>{confirmButtonLabel} {selectedUserIds.length > 0 ? `(${selectedUserIds.length})` : ""}</span>
              </>
            ) : mode === "multiple" ? (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Add {selectedUserIds.length > 0 ? `${selectedUserIds.length} ` : ""}Members</span>
              </>
            ) : (
              <>
                <ArrowRightLeft className="w-4 h-4" />
                <span>Transfer {selectedUserName ? `to ${selectedUserName}` : ""}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  </>
);
}
