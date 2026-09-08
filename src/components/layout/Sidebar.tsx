"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  Search, 
  Menu as MenuIcon, 
  X as XIcon,
  ChevronLeft,
  ChevronRight, 
  ChevronsUpDown, 
  Headphones, 
  Settings, 
  LayoutDashboard,
  SlidersHorizontal
} from "lucide-react";
import { usePermissions } from "@/providers/PermissionProvider";
import { IconMap } from "@/lib/menu-registry";
import { useSidebar } from "./SidebarContext";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";

interface FlattenedMenuItem {
  key: string;
  label: string;
  href: string;
  iconName?: string;
  parentLabel?: string;
  parentKey?: string;
  isSubItem?: boolean;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { visibleMainMenus, visibleSubMenus, canSee, isLoading } = usePermissions();
  const { 
    isTabletSidebarOpen, 
    setIsTabletSidebarOpen, 
    isSearchModalOpen, 
    setIsSearchModalOpen, 
    isMobileMenuOpen, 
    setIsMobileMenuOpen,
    pageManageContent,
    isManageModalOpen,
    setIsManageModalOpen,
    hasActiveFilters,
    pageSearchConfig,
    columnNavConfig,
  } = useSidebar();

  const [desktopFilterQuery, setDesktopFilterQuery] = useState("");
  const [modalSearchQuery, setModalSearchQuery] = useState("");
  const [searchSelectedIndex, setSearchSelectedIndex] = useState(0);

  const [isMobileSearchExpanded, setIsMobileSearchExpanded] = useState(false);
  const [mobileSearchTerm, setMobileSearchTerm] = useState(pageSearchConfig?.query || "");
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchContainerRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync mobile search input when pageSearchConfig query changes (without cascading render)
  const currentSearchQuery = pageSearchConfig?.query || "";
  const [prevPageSearchQuery, setPrevPageSearchQuery] = useState(currentSearchQuery);
  if (currentSearchQuery !== prevPageSearchQuery) {
    setPrevPageSearchQuery(currentSearchQuery);
    setMobileSearchTerm(currentSearchQuery);
  }

  // Focus input when search expands
  useEffect(() => {
    if (isMobileSearchExpanded) {
      setTimeout(() => {
        mobileSearchInputRef.current?.focus();
      }, 50);
    }
  }, [isMobileSearchExpanded]);

  // Handle click outside of mobile search input to collapse
  useEffect(() => {
    if (!isMobileSearchExpanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (mobileSearchContainerRef.current && !mobileSearchContainerRef.current.contains(e.target as Node)) {
        setIsMobileSearchExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMobileSearchExpanded]);

  const handleMobileSearchChange = (val: string) => {
    setMobileSearchTerm(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      if (pageSearchConfig?.onSearch) {
        pageSearchConfig.onSearch(val);
      }
    }, 250);
  };

  const handleMobileClearAndClose = () => {
    setMobileSearchTerm("");
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (pageSearchConfig?.onSearch) {
      pageSearchConfig.onSearch("");
    }
    setIsMobileSearchExpanded(false);
  };

  const desktopSearchInputRef = useRef<HTMLInputElement>(null);
  const modalSearchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: Press 'F' or '/' on desktop to focus sidebar search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === "f" || e.key === "F" || e.key === "/") &&
        !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        desktopSearchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Collect all accessible menu items strictly verified by permissions
  const { directMenuItems, systemMenuItems, allSearchableItems } = useMemo(() => {
    const direct: FlattenedMenuItem[] = [];
    const system: FlattenedMenuItem[] = [];
    const searchable: FlattenedMenuItem[] = [];

    visibleMainMenus.forEach((main) => {
      const subs = visibleSubMenus(main.key);

      if (main.key === "system") {
        // System submenus
        subs.forEach((sub) => {
          if (sub.href && canSee(sub.key)) {
            const item: FlattenedMenuItem = {
              key: sub.key,
              label: sub.label,
              href: sub.href,
              iconName: sub.iconName || "Settings",
              parentLabel: main.label,
              parentKey: main.key,
              isSubItem: true,
            };
            system.push(item);
            searchable.push(item);
          }
        });
      } else {
        // Direct tools from other categories (Dashboard, Sales, Marketing, Service, etc.)
        if (subs.length > 0) {
          subs.forEach((sub) => {
            if (sub.href && canSee(sub.key)) {
              const item: FlattenedMenuItem = {
                key: sub.key,
                label: sub.label,
                href: sub.href,
                iconName: sub.iconName || main.iconName || "LayoutDashboard",
                parentLabel: main.label,
                parentKey: main.key,
                isSubItem: false,
              };
              direct.push(item);
              searchable.push(item);
            }
          });
        } else if (main.href && canSee(main.key)) {
          const item: FlattenedMenuItem = {
            key: main.key,
            label: main.label,
            href: main.href,
            iconName: main.iconName || "LayoutDashboard",
            parentLabel: main.label,
            parentKey: main.key,
            isSubItem: false,
          };
          direct.push(item);
          searchable.push(item);
        }
      }
    });

    return {
      directMenuItems: direct,
      systemMenuItems: system,
      allSearchableItems: searchable,
    };
  }, [visibleMainMenus, visibleSubMenus, canSee]);

  // Filtered direct items for desktop sidebar
  const filteredDirectItems = useMemo(() => {
    if (!desktopFilterQuery.trim()) return directMenuItems;
    const q = desktopFilterQuery.toLowerCase();
    return directMenuItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.parentLabel?.toLowerCase().includes(q)
    );
  }, [directMenuItems, desktopFilterQuery]);

  // Filtered system items for desktop sidebar
  const filteredSystemItems = useMemo(() => {
    if (!desktopFilterQuery.trim()) return systemMenuItems;
    const q = desktopFilterQuery.toLowerCase();
    return systemMenuItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.parentLabel?.toLowerCase().includes(q)
    );
  }, [systemMenuItems, desktopFilterQuery]);

  // Filtered search modal results
  const filteredSearchResults = useMemo(() => {
    if (!modalSearchQuery.trim()) return allSearchableItems;
    const q = modalSearchQuery.toLowerCase();
    return allSearchableItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.parentLabel?.toLowerCase().includes(q)
    );
  }, [allSearchableItems, modalSearchQuery]);

  // Reset selected index when search query changes (without cascading render)
  const [prevModalSearchQuery, setPrevModalSearchQuery] = useState(modalSearchQuery);
  if (modalSearchQuery !== prevModalSearchQuery) {
    setPrevModalSearchQuery(modalSearchQuery);
    setSearchSelectedIndex(0);
  }

  const handleNavigate = useCallback((href: string) => {
    setIsTabletSidebarOpen(false);
    setIsMobileMenuOpen(false);
    setIsSearchModalOpen(false);
    setDesktopFilterQuery("");
    setModalSearchQuery("");
    router.push(href);
  }, [router, setIsTabletSidebarOpen, setIsMobileMenuOpen, setIsSearchModalOpen]);

  // Keyboard navigation for Search Modal
  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSearchSelectedIndex((prev) =>
        prev < filteredSearchResults.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSearchSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredSearchResults[searchSelectedIndex]) {
        handleNavigate(filteredSearchResults[searchSelectedIndex].href);
      }
    } else if (e.key === "Escape") {
      setIsSearchModalOpen(false);
    }
  };

  if (isLoading) {
    return (
      <aside className="hidden lg:flex h-screen w-48 flex-col bg-[#252728] p-4 shrink-0 z-30 border-r border-[#1C1C1D] animate-pulse">
        <div className="h-9 w-full rounded-lg bg-[#3A3B3C] mb-4" />
        <div className="h-8 w-full rounded-lg bg-[#3A3B3C] mb-6" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-7 w-full rounded-lg bg-[#3A3B3C]/50" />
          ))}
        </div>
      </aside>
    );
  }

  // Sidebar content (Shared between Desktop permanent sidebar and Tablet drawer)
  const renderSidebarContent = (isDrawer = false) => {
    return (
      <div className="flex flex-col h-full justify-between select-none">
        {/* Top Section */}
        <div className="flex flex-col">
          {/* Workspace Switcher Header */}
          <div className="p-3 border-b border-[#1C1C1D]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shrink-0 font-bold text-xs">
                  SB
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-100 truncate">
                      SB Interlab
                    </span>
                    <span className="text-xs font-mono px-1.5 py-0.2 rounded bg-[#3A3B3C] text-slate-300 font-medium">
                      CRM
                    </span>
                  </div>
                </div>
              </div>
              
              {isDrawer ? (
                <button
                  onClick={() => setIsTabletSidebarOpen(false)}
                  className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#3A3B3C] transition-colors"
                  title="Close sidebar"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              ) : (
                <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
            </div>
          </div>

          {/* Quick Find Input */}
          <div className="px-3 pt-3 pb-2">
            <div className="flex items-center bg-[#3A3B3C] border border-transparent focus-within:border-[#C7F33C] rounded-lg px-2.5 py-1.5 transition-colors gap-2 text-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                ref={desktopSearchInputRef}
                type="text"
                value={desktopFilterQuery}
                onChange={(e) => setDesktopFilterQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredDirectItems.length > 0) {
                    handleNavigate(filteredDirectItems[0].href);
                  } else if (e.key === "Escape") {
                    setDesktopFilterQuery("");
                    desktopSearchInputRef.current?.blur();
                  }
                }}
                placeholder="Find"
                className="flex-1 bg-transparent border-none outline-none text-xs text-slate-100 placeholder-slate-400 min-w-0"
              />
              {!desktopFilterQuery && (
                <span className="text-xs font-mono px-1 py-0.2 rounded bg-[#4E4F50] text-slate-300">
                  F
                </span>
              )}
              {desktopFilterQuery && (
                <button 
                  onClick={() => setDesktopFilterQuery("")}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5 max-h-[calc(100vh-200px)] hide-scrollbar">
            {/* Direct Tools */}
            {filteredDirectItems.map((item) => {
              const Icon = item.iconName ? IconMap[item.iconName] || LayoutDashboard : LayoutDashboard;
              const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  prefetch={false}
                  onClick={() => {
                    if (isDrawer) setIsTabletSidebarOpen(false);
                    setDesktopFilterQuery("");
                  }}
                  className={`
                    group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors
                    ${isActive 
                      ? "bg-[#3A3B3C] text-slate-100" 
                      : "text-slate-400 hover:text-slate-200 hover:bg-[#3A3B3C]/50"}
                  `}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? "text-[#C7F33C]" : "text-slate-400 group-hover:text-slate-200"}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C7F33C] shrink-0" />
                  )}
                </Link>
              );
            })}

            {/* Admin / System Settings Section (Direct, No expand/collapse) */}
            {filteredSystemItems.length > 0 && (
              <div className="pt-2">
                <div className="my-1 border-t border-[#1C1C1D]" />
                <div className="space-y-0.5">
                  {filteredSystemItems.map((sub) => {
                    const SubIcon = sub.iconName ? IconMap[sub.iconName] || Settings : Settings;
                    const isSubActive = pathname === sub.href || (sub.href !== "/" && pathname.startsWith(`${sub.href}/`));

                    return (
                      <Link
                        key={sub.key}
                        href={sub.href}
                        prefetch={false}
                        onClick={() => {
                          if (isDrawer) setIsTabletSidebarOpen(false);
                          setDesktopFilterQuery("");
                        }}
                        className={`
                          group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors
                          ${isSubActive 
                            ? "bg-[#3A3B3C] text-slate-100" 
                            : "text-slate-400 hover:text-slate-200 hover:bg-[#3A3B3C]/50"}
                        `}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <SubIcon className={`w-4 h-4 shrink-0 transition-colors ${isSubActive ? "text-[#C7F33C]" : "text-slate-400 group-hover:text-slate-200"}`} />
                          <span className="truncate">{sub.label}</span>
                        </div>
                        {isSubActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#C7F33C] shrink-0" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Section: Support & User Profile */}
        <div className="p-2 border-t border-[#1C1C1D] flex flex-col gap-1">
          {/* Support Link */}
          <button
            onClick={() => {
              // Quick action or route
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-[#3A3B3C]/50 transition-colors"
          >
            <Headphones className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Support</span>
          </button>

          {/* User Profile Snippet (Logout removed) */}
          <div className="flex items-center px-2.5 py-2 rounded-lg bg-[#3A3B3C]/40 border border-[#1C1C1D] mt-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-[#3A3B3C] border border-[#4E4F50] flex items-center justify-center overflow-hidden shrink-0">
                {session?.user?.image ? (
                  <Image 
                    src={session.user.image} 
                    alt={session.user.name || "User"} 
                    width={28} 
                    height={28} 
                    className="w-full h-full object-cover" 
                    unoptimized 
                  />
                ) : (
                  <span className="text-xs font-bold text-slate-200">
                    {session?.user?.name?.charAt(0).toUpperCase() || "U"}
                  </span>
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-slate-100 truncate">
                  {session?.user?.name || "User"}
                </span>
                <span className="text-xs text-slate-400 truncate">
                  {session?.user?.email || "Admin"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* ============================================================ */}
      {/* 1. DESKTOP PERMANENT SIDEBAR (>= 1024px)                     */}
      {/* ============================================================ */}
      <aside className="hidden lg:flex h-screen w-54 flex-col bg-[#252728] shrink-0 z-30 border-r border-[#1C1C1D]">
        {renderSidebarContent(false)}
      </aside>

      {/* ============================================================ */}
      {/* 2. TABLET SLIDE-OUT DRAWER (768px - 1023px, or lg:hidden)   */}
      {/* ============================================================ */}
      {isTabletSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop Overlay */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsTabletSidebarOpen(false)}
          />
          {/* Slide-out Drawer */}
          <aside className="fixed top-0 left-0 h-screen w-64 bg-[#252728] border-r border-[#1C1C1D] z-50 transition-transform flex flex-col">
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. FLOATING BOTTOM PILL & COLUMN NAVIGATION (< 1280px - xl:hidden) */}
      {/* ============================================================ */}
      <div className={`xl:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-40 max-w-[98vw] flex items-center gap-2 select-none ${
        !columnNavConfig ? "md:hidden" : ""
      }`}>
        {/* Left Floating Button: Previous Column */}
        {columnNavConfig && (
          <button
            type="button"
            disabled={!columnNavConfig.hasPrev}
            onClick={columnNavConfig.onPrev}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 select-none ${
              columnNavConfig.hasPrev
                ? "bg-[#3A3B3C] border border-[#4E4F50] text-slate-200 hover:text-white active:scale-95 cursor-pointer shadow-none"
                : "bg-[#252728] border border-[#3A3B3C] text-slate-600 opacity-40 cursor-not-allowed"
            }`}
            title="Previous Column"
            aria-label="Previous Column"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {/* Mobile Central Pill (md:hidden) */}
        <div 
          ref={mobileSearchContainerRef}
          className="md:hidden flex items-center bg-[#3A3B3C] border border-[#4E4F50] rounded-full px-4 py-2 gap-3.5 select-none shadow-md transition-all duration-300"
        >
          {/* Left: Find button / Animated Search Input */}
          {isMobileSearchExpanded && pageSearchConfig ? (
            <div className="flex items-center bg-[#252728] border border-[#C7F33C] rounded-full py-1 pl-2.5 pr-1.5 gap-1.5 w-44 sm:w-52 transition-all duration-300 ease-out animate-in fade-in zoom-in-95">
              <Search className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />
              <input
                ref={mobileSearchInputRef}
                type="text"
                value={mobileSearchTerm}
                onChange={(e) => handleMobileSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    handleMobileClearAndClose();
                  }
                }}
                placeholder={pageSearchConfig.placeholder || "Search"}
                className="flex-1 bg-transparent border-none outline-none text-xs text-slate-100 placeholder:text-slate-400 min-w-0"
              />
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleMobileClearAndClose();
                }}
                onClick={handleMobileClearAndClose}
                className="text-xs font-medium text-slate-400 hover:text-slate-100 active:text-white px-2 py-0.5 rounded-full hover:bg-[#3A3B3C] transition-colors shrink-0 cursor-pointer"
                title="Clear search"
              >
                Clear
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (isManageModalOpen) setIsManageModalOpen(false);
                if (isMobileMenuOpen) setIsMobileMenuOpen(false);
                if (pageSearchConfig) {
                  setIsMobileSearchExpanded(true);
                } else {
                  setIsSearchModalOpen(true);
                }
              }}
              className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                pageSearchConfig?.query ? "text-[#C7F33C]" : "text-slate-200 hover:text-white"
              }`}
            >
              <Search className={`w-3.5 h-3.5 ${pageSearchConfig?.query ? "text-[#C7F33C]" : "text-slate-300"}`} />
              <span className="max-w-[80px] truncate">
                {pageSearchConfig?.query ? pageSearchConfig.query : "Find"}
              </span>
              {pageSearchConfig?.query && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#C7F33C]" />
              )}
            </button>
          )}

          {/* Middle: Manage button (if page has manage content) */}
          {pageManageContent && (
            <>
              <div className="h-3.5 w-px bg-[#4E4F50]" />
              <button
                id="mobile-manage-filter-btn"
                onClick={() => {
                  if (!isManageModalOpen) {
                    setIsMobileMenuOpen(false);
                    setIsMobileSearchExpanded(false);
                  }
                  setIsManageModalOpen(!isManageModalOpen);
                }}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-200 hover:text-white transition-colors relative cursor-pointer"
                aria-label={isManageModalOpen ? "Close Manage and Filters" : "Manage and Filters"}
                title={isManageModalOpen ? "Close Manage" : "Manage and Filters"}
              >
                {isManageModalOpen ? (
                  <XIcon className="w-4 h-4 text-slate-100" />
                ) : (
                  <>
                    <SlidersHorizontal className="w-4 h-4 text-[#C7F33C]" />
                    {hasActiveFilters && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C7F33C] absolute -top-0.5 -right-1" />
                    )}
                  </>
                )}
              </button>
            </>
          )}

          {/* Divider */}
          <div className="h-3.5 w-px bg-[#4E4F50]" />

          {/* Right: Menu / Close toggle */}
          <button
            onClick={() => {
              if (!isMobileMenuOpen) {
                setIsManageModalOpen(false);
              }
              setIsMobileMenuOpen(!isMobileMenuOpen);
            }}
            className="flex items-center justify-center text-slate-200 hover:text-white transition-colors"
            title={isMobileMenuOpen ? "Close Menu" : "Open Menu"}
          >
            {isMobileMenuOpen ? (
              <XIcon className="w-4 h-4 text-slate-100" />
            ) : (
              <MenuIcon className="w-4 h-4 text-slate-100" />
            )}
          </button>
        </div>

        {/* Tablet Central Pill: Active Column Indicator (hidden md:flex xl:hidden) */}
        {columnNavConfig && (
          <div className="hidden md:flex items-center bg-[#3A3B3C] border border-[#4E4F50] rounded-full px-4 py-2 gap-2 text-xs font-semibold text-slate-200 transition-all duration-200">
            <span className="text-[#C7F33C]">{columnNavConfig.currentTitle}</span>
            <span className="text-slate-400 font-normal">
              ({(columnNavConfig.currentIndex ?? 0) + 1}/{columnNavConfig.totalColumns})
            </span>
          </div>
        )}

        {/* Right Floating Button: Next Column */}
        {columnNavConfig && (
          <button
            type="button"
            disabled={!columnNavConfig.hasNext}
            onClick={columnNavConfig.onNext}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 select-none ${
              columnNavConfig.hasNext
                ? "bg-[#3A3B3C] border border-[#4E4F50] text-slate-200 hover:text-white active:scale-95 cursor-pointer shadow-none"
                : "bg-[#252728] border border-[#3A3B3C] text-slate-600 opacity-40 cursor-not-allowed"
            }`}
            title="Next Column"
            aria-label="Next Column"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* ============================================================ */}
      {/* 4. MOBILE MENU DRAWER SHEET (< 768px - md:hidden)           */}
      {/* ============================================================ */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-[#252728] flex flex-col pb-24 px-4 overflow-y-auto">
          {/* Workspace Title & Close (Sticky on top) */}
          <div className="sticky top-0 z-10 bg-[#252728] flex items-center justify-between pt-4 pb-4 border-b border-[#1C1C1D] mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white font-bold text-xs">
                SB
              </div>
              <span className="font-semibold text-slate-100 text-base">
                SB Interlab CRM
              </span>
            </div>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#3A3B3C]"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Menu Items List */}
          <div className="flex flex-col space-y-1">
            {allSearchableItems.map((item) => {
              const Icon = item.iconName ? IconMap[item.iconName] || LayoutDashboard : LayoutDashboard;
              const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  prefetch={false}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`
                    flex items-center justify-between px-3.5 py-3 rounded-xl transition-colors
                    ${isActive 
                      ? "bg-[#3A3B3C] text-slate-100" 
                      : "text-slate-300 hover:bg-[#3A3B3C]/50"}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-5 h-5 ${isActive ? "text-[#C7F33C]" : "text-slate-400"}`} />
                    <div className="flex flex-col">
                      <span className="font-medium text-xs text-slate-100">{item.label}</span>
                      {item.parentLabel && (
                        <span className="text-xs text-slate-400">{item.parentLabel}</span>
                      )}
                    </div>
                  </div>
                  {isActive && (
                    <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. DEDICATED FIND SEARCH MODAL (All Viewports)              */}
      {/* ============================================================ */}
      {isSearchModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#252728]/95 backdrop-blur-md flex flex-col items-center pt-8 px-4">
          <div className="w-full max-w-md flex flex-col gap-4">
            {/* Top Search Input */}
            <div className="w-full flex items-center bg-[#3A3B3C] border border-[#4E4F50] focus-within:border-[#C7F33C] rounded-xl px-4 py-3 gap-3 transition-colors">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                ref={modalSearchInputRef}
                autoFocus
                type="text"
                value={modalSearchQuery}
                onChange={(e) => setModalSearchQuery(e.target.value)}
                onKeyDown={handleModalKeyDown}
                placeholder="Find"
                className="flex-1 bg-transparent border-none outline-none text-xs text-slate-100 placeholder-slate-400"
              />
              <button
                onClick={() => setIsSearchModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#4E4F50] transition-colors"
                title="Close"
                aria-label="Close"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Results List */}
            <div className="w-full bg-[#3A3B3C]/50 border border-[#1C1C1D] rounded-2xl p-2 max-h-[70vh] overflow-y-auto hide-scrollbar space-y-1">
              {filteredSearchResults.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No menus found matching &ldquo;{modalSearchQuery}&rdquo;
                </div>
              ) : (
                filteredSearchResults.map((item, idx) => {
                  const Icon = item.iconName ? IconMap[item.iconName] || LayoutDashboard : LayoutDashboard;
                  const isSelected = idx === searchSelectedIndex;

                  return (
                    <button
                      key={item.key}
                      onClick={() => handleNavigate(item.href)}
                      onMouseEnter={() => setSearchSelectedIndex(idx)}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors
                        ${isSelected 
                          ? "bg-[#3A3B3C] text-slate-100" 
                          : "text-slate-300 hover:bg-[#3A3B3C]/40"}
                      `}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isSelected ? "text-[#C7F33C]" : "text-slate-400"}`} />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-medium text-slate-100 truncate">
                          {item.label}
                        </span>
                        {item.parentLabel && (
                          <span className="text-xs text-slate-400 truncate">
                            {item.parentLabel}
                          </span>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. STANDARDIZED MANAGE MODAL (< 768px - md:hidden)          */}
      {/* ============================================================ */}
      {isManageModalOpen && pageManageContent && (
        <div className="md:hidden fixed inset-0 z-30 bg-[#252728] flex flex-col pb-24 px-4 overflow-y-auto animate-in fade-in duration-150">
          {/* Modal Header (Sticky on top) */}
          <div className="sticky top-0 z-10 bg-[#252728] flex items-center justify-between pt-4 pb-4 border-b border-[#1C1C1D] mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-[#C7F33C]" />
              <span className="font-semibold text-slate-100 text-base">
                Manage & Filters
              </span>
            </div>
            <button
              onClick={() => setIsManageModalOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#4E4F50] transition-colors"
              aria-label="Close Manage"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex flex-col gap-4 flex-1">
            {pageManageContent}
          </div>
        </div>
      )}
    </>
  );
}
