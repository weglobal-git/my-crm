"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { ContactType, ContactStatus } from "@prisma/client";
import { 
  Search, 
  Plus, 
  Building2, 
  ShieldCheck, 
  ShieldAlert, 
  Loader2,
  SlidersHorizontal,
  Star,
  Bot,
  Globe,
  ChevronDown,
  Check,
  X
} from "lucide-react";
import useSWR, { preload } from "swr";
import { pusherClient } from "@/lib/pusher";
import { usePermissions } from "@/providers/PermissionProvider";
import { 
  getCompaniesWithContacts, 
  CompanyMasterItem,
  getAccountOverview,
  AccountOverviewResult,
  toggleCompanyStatus,
  updateCompanyStarRating,
  getCompanyCountries
} from "@/lib/actions/contact";
import { CompanyCard } from "./CompanyCard";
import { AccountAnalyticsCard } from "./AccountAnalyticsCard";
import { PersonTable } from "./PersonTable";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";

const loadEditAccountPanel = () =>
  import("./EditAccountPanel").then((mod) => mod.EditAccountPanel);
const EditAccountPanel = dynamic(loadEditAccountPanel, { ssr: false });

const loadCreateAccountPanel = () =>
  import("./CreateAccountPanel").then((mod) => mod.CreateAccountPanel);
const CreateAccountPanel = dynamic(loadCreateAccountPanel, { ssr: false });

// Canonical fetcher shared across SWR hooks and hover preload
const fetchAccountOverview = ([, compId]: [string, string]) => getAccountOverview(compId);

const ACCOUNT_TYPES: { label: string; value: ContactType }[] = [
  { label: "Customer", value: "CUSTOMER" },
  { label: "Trader", value: "TRADER" },
  { label: "Shipping", value: "SHIPPING" },
  { label: "My Office", value: "MY_OFFICE" },
];

export function ContactView({
  initialCompanies,
  initialStats,
  initialTotal,
  initialOverview,
}: {
  initialCompanies: CompanyMasterItem[];
  initialStats: { qualifiedCount: number; unqualifiedCount: number; totalCount: number };
  initialTotal: number;
  initialOverview?: AccountOverviewResult | null;
}) {
  const { canSee, isAdmin } = usePermissions();

  // State: Default strictly to QUALIFIED and CUSTOMER per requirements
  const [activeTab, setActiveTab] = useState<"QUALIFIED" | "UNQUALIFIED">("QUALIFIED");
  const [activeType, setActiveType] = useState<ContactType>("CUSTOMER");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Star Rating Hover & Status Toggle States
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  // Infinite Scroll State
  const [companies, setCompanies] = useState<CompanyMasterItem[]>(initialCompanies);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialTotal > initialCompanies.length);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [stats, setStats] = useState(initialStats);
  const [totalCompanies, setTotalCompanies] = useState(initialTotal);

  // Country Filter State
  const [selectedCountry, setSelectedCountry] = useState<string>("ALL");
  const [availableCountries, setAvailableCountries] = useState<{ country: string; count: number }[]>([]);
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [countrySearchInput, setCountrySearchInput] = useState("");
  const countryDropdownRef = useRef<HTMLDivElement | null>(null);

  // Fetch available countries
  useEffect(() => {
    let isMounted = true;
    getCompanyCountries().then((list) => {
      if (isMounted) setAvailableCountries(list);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(e.target as Node)) {
        setIsCountryDropdownOpen(false);
      }
    };
    if (isCountryDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isCountryDropdownOpen]);

  // Sync refs to avoid stale closures in listeners
  const isLoadingMoreRef = useRef(false);
  const hasMoreRef = useRef(initialTotal > initialCompanies.length);
  const pageRef = useRef(1);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    isLoadingMoreRef.current = isLoadingMore;
  }, [isLoadingMore]);

  // Selected Company & Contact
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    initialCompanies[0]?.id || null
  );
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // SWR-Managed Account Overview Cache with Canonical Shared Fetcher
  const {
    data: accountOverview,
    isLoading: isOverviewLoading,
    isValidating: isOverviewValidating,
    mutate: mutateOverview,
  } = useSWR<AccountOverviewResult | null>(
    selectedCompanyId ? ["account-overview", selectedCompanyId] : null,
    fetchAccountOverview,
    {
      fallbackData: (selectedCompanyId && initialOverview?.company?.id === selectedCompanyId) ? initialOverview : undefined,
      dedupingInterval: 10_000,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      keepPreviousData: true,
    }
  );

  const isCurrentAccountLoaded = Boolean(accountOverview && accountOverview.company?.id === selectedCompanyId);
  const isOverviewTransitioning = isOverviewLoading || isOverviewValidating || !isCurrentAccountLoaded;

  // Modals state
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [isEditAccountModalOpen, setIsEditAccountModalOpen] = useState(false);
  const [editAccountInitialTab, setEditAccountInitialTab] = useState<string>("account");
  const [editAccountContactId, setEditAccountContactId] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const isInitialMount = useRef(true);

  // Fetch initial batch whenever filters or search change
  const fetchFilteredCompanies = useCallback(async () => {
    setIsSearching(true);
    pageRef.current = 1;
    setPage(1);

    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }

    try {
      const res = await getCompaniesWithContacts({
        status: activeTab,
        type: activeType,
        country: selectedCountry === "ALL" ? "" : selectedCountry,
        search: debouncedSearch,
        page: 1,
        pageSize: 20,
      });

      setCompanies(res.companies);
      setPage(1);
      pageRef.current = 1;
      setHasMore(res.hasMore);
      hasMoreRef.current = res.hasMore;
      setStats(res.stats);
      setTotalCompanies(res.total);

      // Auto-select first company if previous selection is not in list
      if (res.companies.length > 0) {
        setSelectedCompanyId((prev) => {
          if (prev && res.companies.some((c: CompanyMasterItem) => c.id === prev)) {
            return prev;
          }
          return res.companies[0].id;
        });
      } else {
        setSelectedCompanyId(null);
      }
    } catch (err) {
      console.error("Failed to fetch companies:", err);
    } finally {
      setIsSearching(false);
    }
  }, [activeTab, activeType, selectedCountry, debouncedSearch]);

  // Trigger re-fetch when filter changes (skip initial mount to avoid duplicate fetch of SSR data)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    void fetchFilteredCompanies();
  }, [fetchFilteredCompanies]);

  // Load more function for Infinite Scroll
  const loadMoreCompanies = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    const nextPage = pageRef.current + 1;
    try {
      const res = await getCompaniesWithContacts({
        status: activeTab,
        type: activeType,
        country: selectedCountry === "ALL" ? "" : selectedCountry,
        search: debouncedSearch,
        page: nextPage,
        pageSize: 20,
      });

      if (res.companies.length > 0) {
        setCompanies((prev) => {
          const existingIds = new Set(prev.map((c) => c.id));
          const newItems = res.companies.filter((c) => !existingIds.has(c.id));
          return [...prev, ...newItems];
        });
        setPage(nextPage);
        pageRef.current = nextPage;
      }
      setHasMore(res.hasMore);
      hasMoreRef.current = res.hasMore;
    } catch (err) {
      console.error("Failed to load more companies:", err);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [activeTab, activeType, selectedCountry, debouncedSearch]);

  // Scroll event handler: guaranteed fail-safe for infinite scrolling
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop - clientHeight < 350) {
      if (hasMoreRef.current && !isLoadingMoreRef.current) {
        void loadMoreCompanies();
      }
    }
  }, [loadMoreCompanies]);

  // IntersectionObserver Sentinel targeting the scroll container as root
  useEffect(() => {
    const container = scrollContainerRef.current;
    const sentinel = sentinelRef.current;
    if (!container || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current && !isLoadingMoreRef.current) {
          void loadMoreCompanies();
        }
      },
      { root: container, rootMargin: "300px", threshold: 0 }
    );

    observer.observe(sentinel);

    return () => {
      observer.unobserve(sentinel);
    };
  }, [loadMoreCompanies]);

  // Real-time synchronization via Pusher
  useEffect(() => {
    const channel = pusherClient.subscribe("contact");

    type ContactPusherEvent = {
      action: string;
      companyId: string;
      status?: ContactStatus;
      starRating?: number;
      company?: Partial<CompanyMasterItem>;
    };

    channel.bind("account-updated", (data?: ContactPusherEvent) => {
      if (!data?.companyId) return;

      if (data.action === "STATUS_CHANGE" && data.status) {
        setCompanies((prev) =>
          prev.map((c) => (c.id === data.companyId ? { ...c, status: data.status! } : c))
        );
      } else if (data.action === "RATING_CHANGE" && data.starRating !== undefined) {
        setCompanies((prev) => {
          const updated = prev.map((c) =>
            c.id === data.companyId ? { ...c, starRating: data.starRating! } : c
          );
          return [...updated].sort(
            (a, b) => (b.starRating || 0) - (a.starRating || 0)
          );
        });
      } else if (data.action === "DETAILS_CHANGE" && data.company) {
        setCompanies((prev) =>
          prev.map((c) => (c.id === data.companyId ? { ...c, ...data.company } : c))
        );
      }

      // If the currently selected company was changed, revalidate overview
      if (data.companyId === selectedCompanyId) {
        void mutateOverview();
      }
    });

    return () => {
      pusherClient.unsubscribe("contact");
    };
  }, [selectedCompanyId, mutateOverview]);

  // Find currently selected company
  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) || null;

  // Intent preloading handlers
  const handleEditPanelIntent = useCallback(() => {
    void loadEditAccountPanel();
  }, []);

  const handleCreatePanelIntent = useCallback(() => {
    void loadCreateAccountPanel();
  }, []);

  // Idle preload EditAccountPanel chunk after initial mount
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadEditAccountPanel();
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleOpenEditModal = (tab = "account", contactId: string | null = null) => {
    void loadEditAccountPanel();
    setEditAccountInitialTab(tab);
    setEditAccountContactId(contactId);
    setIsEditAccountModalOpen(true);
  };

  const handleOpenCreatePanel = async () => {
    await loadCreateAccountPanel();
    setIsCreateAccountOpen(true);
  };

  const handleContactUpdated = () => {
    void mutateOverview();
  };

  const handleAccountUpdated = () => {
    void fetchFilteredCompanies();
    void mutateOverview();
  };

  // Toggle Account Qualification with Instant Optimistic UI
  const handleToggleQualification = async () => {
    if (!selectedCompany || isTogglingStatus) return;
    const compId = selectedCompany.id;
    const prevStatus = selectedCompany.status;
    const nextStatus: ContactStatus =
      prevStatus === "QUALIFIED" ? "UNQUALIFIED" : "QUALIFIED";

    setIsTogglingStatus(true);

    // 1. Instant optimistic update (<10ms)
    setCompanies((prev) =>
      prev.map((c) => (c.id === compId ? { ...c, status: nextStatus } : c))
    );

    setStats((prev) => ({
      ...prev,
      qualifiedCount:
        nextStatus === "QUALIFIED"
          ? prev.qualifiedCount + 1
          : Math.max(0, prev.qualifiedCount - 1),
      unqualifiedCount:
        nextStatus === "UNQUALIFIED"
          ? prev.unqualifiedCount + 1
          : Math.max(0, prev.unqualifiedCount - 1),
    }));

    void mutateOverview(
      (curr) => (curr ? { ...curr, company: { ...curr.company, status: nextStatus } } : curr),
      { revalidate: false }
    );

    // 2. Fire Server Action in background
    try {
      await toggleCompanyStatus(compId, nextStatus);
    } catch (err) {
      console.error("Failed to toggle company status:", err);
      // Revert on failure
      setCompanies((prev) =>
        prev.map((c) => (c.id === compId ? { ...c, status: prevStatus } : c))
      );
      setStats((prev) => ({
        ...prev,
        qualifiedCount:
          prevStatus === "QUALIFIED"
            ? prev.qualifiedCount + 1
            : Math.max(0, prev.qualifiedCount - 1),
        unqualifiedCount:
          prevStatus === "UNQUALIFIED"
            ? prev.unqualifiedCount + 1
            : Math.max(0, prev.unqualifiedCount - 1),
      }));
      void mutateOverview(
        (curr) => (curr ? { ...curr, company: { ...curr.company, status: prevStatus } } : curr),
        { revalidate: false }
      );
    } finally {
      setIsTogglingStatus(false);
    }
  };

  // Change Account Star Rating with Instant Optimistic UI
  const handleSetStarRating = async (stars: number) => {
    if (!selectedCompany) return;
    const compId = selectedCompany.id;
    const previousStars = selectedCompany.starRating || 0;

    // 1. Optimistic update and sort descending by starRating (<5ms)
    setCompanies((prev) => {
      const updated = prev.map((c) =>
        c.id === compId ? { ...c, starRating: stars } : c
      );
      return [...updated].sort(
        (a, b) => (b.starRating || 0) - (a.starRating || 0)
      );
    });

    void mutateOverview(
      (curr) => (curr ? { ...curr, company: { ...curr.company, starRating: stars } } : curr),
      { revalidate: false }
    );

    // 2. Fire Server Action in background
    try {
      await updateCompanyStarRating(compId, stars);
    } catch (err) {
      console.error("Failed to update star rating:", err);
      // Revert on failure
      setCompanies((prev) => {
        const updated = prev.map((c) =>
          c.id === compId ? { ...c, starRating: previousStars } : c
        );
        return [...updated].sort(
          (a, b) => (b.starRating || 0) - (a.starRating || 0)
        );
      });
      void mutateOverview(
        (curr) => (curr ? { ...curr, company: { ...curr.company, starRating: previousStars } } : curr),
        { revalidate: false }
      );
    }
  };

  return (
    <WorkspaceLayout scrollMode="hidden">
      {/* Top Bar: Tabs & Search & Add Button */}
      <div className="flex flex-wrap items-center justify-between gap-4 shrink-0">
        {/* Qualification Tabs: Qualified & Unqualified only */}
        <div className="flex items-center gap-1.5 bg-[#1C1C1D] p-1.5 rounded-full">
          <button
            type="button"
            onClick={() => setActiveTab("QUALIFIED")}
            className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "QUALIFIED"
                ? "bg-[#C7F33C] text-black"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Qualified</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                activeTab === "QUALIFIED"
                  ? "bg-black/20 text-black"
                  : "bg-[#252728] text-slate-400"
              }`}
            >
              {stats.qualifiedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("UNQUALIFIED")}
            className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "UNQUALIFIED"
                ? "bg-[#C7F33C] text-black"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Unqualified</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                activeTab === "UNQUALIFIED"
                  ? "bg-black/20 text-black"
                  : "bg-[#252728] text-slate-400"
              }`}
            >
              {stats.unqualifiedCount}
            </span>
          </button>
        </div>

        {/* Search Box & Add Account Button */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search account, person, country..."
              className="bg-[#3A3B3C] rounded-full pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] w-64 md:w-80 transition-all border-0"
            />
          </div>

          <button
            type="button"
            onClick={handleOpenCreatePanel}
            onPointerEnter={handleCreatePanelIntent}
            className="px-4 py-1.5 rounded-full text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-black" />
            <span>Add Account</span>
          </button>
        </div>
      </div>

      {/* Type Filter Pills: Customer, Trader, Shipping, My Office */}
      <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar shrink-0 pl-2 py-1">

        {ACCOUNT_TYPES.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setActiveType(item.value)}
            className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-colors shrink-0 cursor-pointer ${
              activeType === item.value
                ? "bg-[#C7F33C] text-black font-bold"
                : "bg-[#3A3B3C] text-slate-400 hover:text-slate-200"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 2-Column Master-Detail Layout */}
      <div className="flex-1 min-h-0 flex gap-4">
        {/* Left Column: Account Master List (Infinite Scroll) */}
        <div className="w-80 md:w-96 shrink-0 flex flex-col h-full bg-[#252728] rounded-3xl overflow-hidden">
          {/* Column Header: Symmetrical to Pipeline Column */}
          <div className="h-14 px-4 flex items-center justify-between shrink-0 bg-[#252728]">
            <div className="flex items-center gap-2.5">
              <Building2 className="w-4 h-4 text-[#C7F33C]" />
              <h3 className="font-semibold text-base text-slate-100">Accounts</h3>
              <span className="h-6 px-2.5 flex items-center justify-center rounded-full bg-[#3A3B3C] text-xs font-semibold text-slate-300">
                {totalCompanies}
              </span>
            </div>
            {/* Country Dropdown with Search */}
            <div className="relative" ref={countryDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setIsCountryDropdownOpen((prev) => !prev);
                  setCountrySearchInput("");
                }}
                className={`h-7 px-2.5 rounded-full flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer border-0 ${
                  selectedCountry !== "ALL"
                    ? "bg-[#C7F33C] text-black"
                    : "bg-[#3A3B3C] text-slate-300 hover:text-white"
                }`}
              >
                <Globe className="w-3 h-3 shrink-0" />
                <span className="max-w-[85px] truncate">
                  {selectedCountry === "ALL" ? "Country" : selectedCountry}
                </span>
                <ChevronDown
                  className={`w-3 h-3 shrink-0 transition-transform ${
                    isCountryDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Dropdown Menu */}
              {isCountryDropdownOpen && (
                <div className="absolute right-0 top-9 w-52 bg-[#1C1C1D] border border-white/10 rounded-2xl shadow-none z-50 p-2 flex flex-col gap-1.5">
                  {/* Search inside dropdown */}
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={countrySearchInput}
                      onChange={(e) => setCountrySearchInput(e.target.value)}
                      placeholder="Search country..."
                      autoFocus
                      className="w-full bg-[#2A2B2D] rounded-xl pl-7 pr-7 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                    />
                    {countrySearchInput && (
                      <button
                        type="button"
                        onClick={() => setCountrySearchInput("")}
                        className="absolute right-2 text-slate-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Country Options List */}
                  <div className="max-h-48 overflow-y-auto hide-scrollbar flex flex-col gap-0.5">
                    {/* All Countries Option */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCountry("ALL");
                        setIsCountryDropdownOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs flex items-center justify-between transition-colors cursor-pointer ${
                        selectedCountry === "ALL"
                          ? "bg-[#C7F33C] text-black font-bold"
                          : "text-slate-300 hover:bg-[#2A2B2D]"
                      }`}
                    >
                      <span>All Countries</span>
                      {selectedCountry === "ALL" && (
                        <Check className="w-3.5 h-3.5 text-black" />
                      )}
                    </button>

                    {/* Filtered Country List */}
                    {availableCountries
                      .filter((c) =>
                        c.country
                          .toLowerCase()
                          .includes(countrySearchInput.toLowerCase().trim())
                      )
                      .map((c) => (
                        <button
                          key={c.country}
                          type="button"
                          onClick={() => {
                            setSelectedCountry(c.country);
                            setIsCountryDropdownOpen(false);
                          }}
                          className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs flex items-center justify-between transition-colors cursor-pointer ${
                            selectedCountry === c.country
                              ? "bg-[#C7F33C] text-black font-bold"
                              : "text-slate-300 hover:bg-[#2A2B2D]"
                          }`}
                        >
                          <span className="truncate pr-2">{c.country}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                                selectedCountry === c.country
                                  ? "bg-black/20 text-black"
                                  : "bg-[#3A3B3C] text-slate-400"
                              }`}
                            >
                              {c.count}
                            </span>
                            {selectedCountry === c.country && (
                              <Check className="w-3.5 h-3.5 text-black" />
                            )}
                          </div>
                        </button>
                      ))}

                    {availableCountries.filter((c) =>
                      c.country
                        .toLowerCase()
                        .includes(countrySearchInput.toLowerCase().trim())
                    ).length === 0 && (
                      <div className="text-[11px] text-slate-500 text-center py-3">
                        No countries found
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Scrollable Account Cards List */}
          <div 
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto hide-scrollbar p-3 space-y-2.5"
          >
            {isSearching ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="w-6 h-6 text-[#C7F33C] animate-spin" />
              </div>
            ) : companies.length === 0 ? (
              <div className="text-center p-8 text-slate-500 text-xs">
                No accounts found matching filters.
              </div>
            ) : (
              <>
                {companies.map((company) => (
                  <CompanyCard
                    key={company.id}
                    company={company}
                    isSelected={selectedCompanyId === company.id}
                    onClick={() => {
                      if (selectedCompanyId !== company.id) {
                        setSelectedCompanyId(company.id);
                      }
                    }}
                    onPointerEnter={() => {
                      void preload(["account-overview", company.id], fetchAccountOverview);
                    }}
                  />
                ))}

                {/* Infinite Scroll Sentinel */}
                <div 
                  ref={sentinelRef} 
                  className="min-h-[50px] w-full py-3 flex items-center justify-center"
                >
                  {isLoadingMore && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Loader2 className="w-4 h-4 text-[#C7F33C] animate-spin" />
                      <span>Loading more accounts...</span>
                    </div>
                  )}
                  {!hasMore && companies.length > 0 && (
                    <span className="text-[10px] text-slate-500 font-medium">
                      All {totalCompanies} accounts loaded
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Column: Detail for Selected Account */}
        <div className="flex-1 flex flex-col h-full bg-[#252728] rounded-3xl overflow-hidden min-w-0 border-0">
          {selectedCompany ? (
            <>
              {/* Selected Account Header */}
              <div className="h-14 px-4 flex items-center justify-between shrink-0 bg-[#252728] gap-4 border-0">
                {/* Account Name & Star Rating Selector */}
                <div className="flex flex-col justify-center min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base md:text-lg text-slate-100 truncate leading-tight">
                      {selectedCompany.displayName || selectedCompany.name}
                    </h3>
                    {selectedCompany.country && (
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#3A3B3C] text-slate-200 font-bold shrink-0 tracking-wide">
                        {selectedCompany.country}
                      </span>
                    )}
                  </div>
                  {/* Official Account Name */}
                  {selectedCompany.name && (
                    <p className="text-xs text-slate-400 font-medium truncate mt-0.5" title={`Account Name: ${selectedCompany.name}`}>
                      {selectedCompany.name}
                    </p>
                  )}

                  {/* Direct-Click Star Rating (0 to 5 stars) */}
                  <div
                    className="flex items-center gap-1.5 mt-0.5"
                    onMouseLeave={() => setHoverRating(null)}
                  >
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => {
                        const currentStars = selectedCompany.starRating || 0;
                        const displayRating =
                          hoverRating !== null ? hoverRating : currentStars;
                        const isFilled = s <= displayRating;

                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => {
                              const nextStars = currentStars === s ? 0 : s;
                              handleSetStarRating(nextStars);
                            }}
                            onMouseEnter={() => setHoverRating(s)}
                            className="p-0.5 rounded transition-transform hover:scale-125 focus:outline-none cursor-pointer"
                            title={`Rate ${s} star${s > 1 ? "s" : ""}`}
                          >
                            <Star
                              className={`w-3.5 h-3.5 transition-colors ${
                                isFilled
                                  ? "fill-amber-400 text-amber-400"
                                  : "text-slate-600/70 fill-transparent"
                              }`}
                            />
                          </button>
                        );
                      })}
                      <span className="text-[10px] text-amber-400 font-bold ml-1 min-w-[12px] text-center">
                        {hoverRating !== null
                          ? hoverRating
                          : selectedCompany.starRating || 0}
                      </span>
                    </div>

                    {(selectedCompany.starRating || 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => handleSetStarRating(0)}
                        className="text-[10px] text-slate-500 hover:text-slate-300 px-1.5 py-0.5 rounded bg-[#1C1C1D]/60 hover:bg-[#3A3B3C] transition-colors cursor-pointer"
                        title="Clear star rating (0 stars)"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* Right Header Actions: AI Bot, Green Qualification Toggle, Country & Edit Account */}
                <div className="flex items-center gap-2.5 shrink-0">
                  {/* AI Bot Button (Left of Qualify toggle - opens Account AI in Edit Panel) */}
                  {(isAdmin || canSee("contact.ai_analysis")) && (
                    <button
                      type="button"
                      onClick={() => {
                        void handleOpenEditModal("ai_analysis");
                      }}
                      onPointerEnter={handleEditPanelIntent}
                      className="w-8 h-8 rounded-full bg-[#1C1C1D] text-[#C7F33C] hover:bg-[#2A2B2C] border border-[#3A3B3C] flex items-center justify-center transition-all cursor-pointer shrink-0"
                      title="Open Account AI Analysis"
                    >
                      <Bot className="w-4 h-4" />
                    </button>
                  )}

                  {/* Qualification Green Toggle Switch */}
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1C1C1D]">
                    <span
                      className={`text-xs font-bold transition-colors ${
                        selectedCompany.status === "QUALIFIED"
                          ? "text-[#C7F33C]"
                          : "text-slate-400"
                      }`}
                    >
                      {selectedCompany.status === "QUALIFIED"
                        ? "Qualified"
                        : "Unqualified"}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={selectedCompany.status === "QUALIFIED"}
                      onClick={handleToggleQualification}
                      disabled={isTogglingStatus}
                      className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 cursor-pointer focus:outline-none ${
                        selectedCompany.status === "QUALIFIED"
                          ? "bg-[#C7F33C]"
                          : "bg-[#3A3B3C]"
                      } ${
                        isTogglingStatus ? "opacity-60 cursor-not-allowed" : ""
                      }`}
                      title={
                        selectedCompany.status === "QUALIFIED"
                          ? "Click to mark as Unqualified"
                          : "Click to mark as Qualified"
                      }
                    >
                      <div
                        className={`w-4 h-4 rounded-full transition-transform ${
                          selectedCompany.status === "QUALIFIED"
                            ? "translate-x-4 bg-black"
                            : "translate-x-0 bg-slate-400"
                        }`}
                      />
                    </button>
                  </div>


                  {/* Edit Account Trigger */}
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal("account", null)}
                    onPointerEnter={handleEditPanelIntent}
                    className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-black" />
                    <span>Edit Account</span>
                  </button>
                </div>
              </div>

              {/* Right Column Content: Upper Analytics + Lower Person Table */}
              <div className="flex-1 overflow-y-auto hide-scrollbar p-3 flex flex-col gap-2">
                {/* Upper Section: Account Analytics Dashboard */}
                <AccountAnalyticsCard
                  overview={accountOverview || null}
                  isLoading={!accountOverview && isOverviewLoading}
                  isTransitioning={isOverviewTransitioning}
                  companyId={selectedCompany.id}
                  companyType={selectedCompany.type}
                  country={selectedCompany.country}
                  onOpenAIAnalysis={(isAdmin || canSee("contact.ai_analysis")) ? () => {
                    void handleOpenEditModal("ai_analysis");
                  } : undefined}
                  onBusinessSummaryUpdated={(newSummary) => {
                    mutateOverview(
                      (prev) => (prev ? { ...prev, businessSummary: newSummary } : prev),
                      false
                    );
                  }}
                />

                {/* Lower Section: Person Table */}
                <PersonTable
                  contacts={accountOverview?.contacts || []}
                  companyName={selectedCompany.name}
                  selectedContactId={selectedContactId}
                  isLoading={isOverviewTransitioning}
                  onSelectContact={(contactId) => {
                    setSelectedContactId(contactId);
                    handleOpenEditModal("contact", contactId);
                  }}
                  onContactUpdated={handleContactUpdated}
                  onRowIntent={handleEditPanelIntent}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center text-slate-400 border-0">
              <Building2 className="w-12 h-12 text-slate-600 mb-2" />
              <span className="font-semibold text-slate-200">
                Select an Account
              </span>
              <span className="text-xs text-slate-400 mt-1 max-w-xs">
                Choose an account from the left column to view its conversion analytics and manage its persons.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Create Account Slide-over Panel */}
      <CreateAccountPanel
        isOpen={isCreateAccountOpen}
        onClose={() => setIsCreateAccountOpen(false)}
        onAccountCreated={(newAcc) => {
          fetchFilteredCompanies();
          setSelectedCompanyId(newAcc.id);
        }}
      />

      {/* Edit Account Slide-over Panel (Unified with 5 tabs: Account, Contact, Projects, Email, Account AI) */}
      <EditAccountPanel
        companyId={selectedCompanyId}
        initialOverview={accountOverview || null}
        isOpen={isEditAccountModalOpen}
        onClose={() => {
          setIsEditAccountModalOpen(false);
          setEditAccountContactId(null);
        }}
        onAccountUpdated={handleAccountUpdated}
        onBusinessSummaryUpdated={(newSummary) => {
          mutateOverview(
            (prev) => (prev ? { ...prev, businessSummary: newSummary } : prev),
            false
          );
        }}
        initialTab={editAccountInitialTab}
        selectedContactId={editAccountContactId}
      />
    </WorkspaceLayout>
  );
}
