"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { ContactType, ContactStatus } from "@prisma/client";
import useSWR, { preload } from "swr";
import { Plus, SlidersHorizontal } from "lucide-react";
import { acquireChannelWhenConnected } from "@/lib/pusher-subscription-manager";
import { CONTACT_RECOVERY_EVENT } from "@/lib/pusher-connection-manager";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { useSidebar } from "@/components/layout/SidebarContext";

import type { AccountCardDTO } from "@/lib/contact/account-card-dto";
import { accountMatchesFilters } from "@/lib/contact/account-card-dto";
import { getAccountFilterKey, getAccountOverviewKey } from "@/lib/contact/account-cache-keys";
import {
  getCompaniesWithContacts,
  getCompanyCountries,
  getCompanyTypes,
  updateCompanyStarRating,
  getAccountOverview,
  CompanyMasterItem,
  AccountOverviewResult,
} from "@/lib/actions/contact";

import { AccountFilterSidebar } from "./AccountFilterSidebar";
import { AccountCardList } from "./AccountCardList";
import { AccountSearch } from "./AccountSearch";
import { AccountFiltersDrawer, AccountFilterContent } from "./AccountFiltersDrawer";

const loadEditAccountPanel = () =>
  import("./EditAccountPanel").then((mod) => mod.EditAccountPanel);
const EditAccountPanel = dynamic(loadEditAccountPanel, { ssr: false });

const loadCreateAccountPanel = () =>
  import("./CreateAccountPanel").then((mod) => mod.CreateAccountPanel);
const CreateAccountPanel = dynamic(loadCreateAccountPanel, { ssr: false });

// Canonical fetcher for account overview
const fetchAccountOverview = ([, compId]: readonly [string, string] | [string, string]) =>
  getAccountOverview(compId, { includeAddresses: true, includeLogs: false });

interface ContactViewProps {
  initialCompanies: CompanyMasterItem[];
  initialStats: { qualifiedCount: number; unqualifiedCount: number; totalCount: number };
  initialTotal: number;
  initialTypes?: { type: ContactType; count: number }[];
  initialCountries?: { country: string; count: number }[];
  actorId?: string;
}

export function ContactView({
  initialCompanies,
  initialStats,
  initialTotal,
  initialTypes,
  initialCountries,
  actorId = "default-actor",
}: ContactViewProps) {
  const { setPageSearchConfig, setPageManageContent, setHasActiveFilters } = useSidebar();

  // State: Tab & Filters matching the profile layout
  const [activeTab, setActiveTab] = useState<"QUALIFIED" | "UNQUALIFIED">("QUALIFIED");
  const [activeType, setActiveType] = useState<ContactType | "ALL">("ALL");
  const [activeCountry, setActiveCountry] = useState<string>("ALL");

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Accounts List State
  const [accounts, setAccounts] = useState<AccountCardDTO[]>(initialCompanies);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialTotal > initialCompanies.length);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [stats, setStats] = useState(initialStats);
  const [totalAccounts, setTotalAccounts] = useState(initialTotal);

  // Available Types & Countries
  const [availableTypes, setAvailableTypes] = useState<{ type: ContactType; count: number }[]>(
    initialTypes || []
  );
  const [availableCountries, setAvailableCountries] = useState<{ country: string; count: number }[]>(
    initialCountries || []
  );

  // Modals & Drawers state
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [isEditAccountOpen, setIsEditAccountOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    initialCompanies[0]?.id || null
  );

  // Active filter count for Filters badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activeTab === "UNQUALIFIED") count++;
    if (activeType !== "ALL") count++;
    if (activeCountry !== "ALL") count++;
    return count;
  }, [activeTab, activeType, activeCountry]);

  // Reset all filters to default
  const handleResetFilters = useCallback(() => {
    setActiveTab("QUALIFIED");
    setActiveType("ALL");
    setActiveCountry("ALL");
  }, []);

  // Sequence & Mutation tracking for instant race-safe ratings
  const starSequenceRef = useRef<Map<string, number>>(new Map());
  const activeMutationsRef = useRef<Set<string>>(new Set());

  // Persistent registry of all known accounts across filters & pages for 0ms optimistic filtering
  const knownAccountsMapRef = useRef<Map<string, AccountCardDTO>>(new Map());

  useEffect(() => {
    for (const c of initialCompanies) {
      if (!knownAccountsMapRef.current.has(c.id)) {
        knownAccountsMapRef.current.set(c.id, c as AccountCardDTO);
      }
    }
  }, [initialCompanies]);

  // Stable filter callbacks for 0ms interaction
  const handleTypeChange = useCallback((type: ContactType | "ALL") => {
    setActiveType(type);
  }, []);

  const handleCountryChange = useCallback((country: string) => {
    setActiveCountry(country);
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  // Refs for stable callbacks
  const isLoadingMoreRef = useRef(false);
  const hasMoreRef = useRef(initialTotal > initialCompanies.length);
  const pageRef = useRef(1);
  const activeTabRef = useRef(activeTab);
  const activeTypeRef = useRef(activeType);
  const activeCountryRef = useRef(activeCountry);
  const debouncedSearchRef = useRef(debouncedSearch);

  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { isLoadingMoreRef.current = isLoadingMore; }, [isLoadingMore]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { activeTypeRef.current = activeType; }, [activeType]);
  useEffect(() => { activeCountryRef.current = activeCountry; }, [activeCountry]);
  useEffect(() => { debouncedSearchRef.current = debouncedSearch; }, [debouncedSearch]);

  // Fetch available types & countries from DB if not passed
  useEffect(() => {
    let isMounted = true;
    if (!initialTypes || initialTypes.length === 0) {
      getCompanyTypes().then((list) => {
        if (isMounted) setAvailableTypes(list);
      });
    }
    if (!initialCountries || initialCountries.length === 0) {
      getCompanyCountries().then((list) => {
        if (isMounted) setAvailableCountries(list);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [initialTypes, initialCountries]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // SWR Filter Cache Key
  const filterKey = useMemo(
    () =>
      getAccountFilterKey(actorId, {
        status: activeTab,
        type: activeType,
        country: activeCountry,
        search: debouncedSearch,
      }),
    [actorId, activeTab, activeType, activeCountry, debouncedSearch]
  );

  const fetcher = useCallback(async () => {
    const res = await getCompaniesWithContacts({
      status: activeTab,
      type: activeType,
      country: activeCountry === "ALL" ? "" : activeCountry,
      search: debouncedSearch,
      page: 1,
      pageSize: 20,
    });
    return res;
  }, [activeTab, activeType, activeCountry, debouncedSearch]);

  const isInitialState =
    activeTab === "QUALIFIED" &&
    activeType === "ALL" &&
    activeCountry === "ALL" &&
    !debouncedSearch;

  const fallbackData = useMemo(
    () => ({
      companies: initialCompanies,
      total: initialTotal,
      page: 1,
      pageSize: 20,
      hasMore: initialTotal > initialCompanies.length,
      stats: initialStats,
    }),
    [initialCompanies, initialTotal, initialStats]
  );

  const { data: serverFilterData, isLoading: isFilterLoading } = useSWR(
    filterKey,
    fetcher,
    {
      fallbackData: isInitialState ? fallbackData : undefined,
      dedupingInterval: 15_000,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      revalidateOnMount: isInitialState ? false : undefined,
      revalidateIfStale: !isInitialState,
    }
  );

  // Sync SWR filter data to local accounts list
  const currentKeyString = `${activeTab}|${activeType}|${activeCountry}|${debouncedSearch}`;
  const [lastAppliedKey, setLastAppliedKey] = useState("QUALIFIED|ALL|ALL|");

  if (lastAppliedKey !== currentKeyString && serverFilterData) {
    setLastAppliedKey(currentKeyString);
    const items = serverFilterData.companies as AccountCardDTO[];
    for (const item of items) {
      knownAccountsMapRef.current.set(item.id, item);
    }
    setAccounts(items);
    setPage(1);
    setHasMore(serverFilterData.hasMore);
    setStats(serverFilterData.stats);
    setTotalAccounts(serverFilterData.total);
    // Keep first item selected or maintain selection
    if (items.length > 0 && !items.some((c) => c.id === selectedAccountId)) {
      setSelectedAccountId(items[0].id);
    }
  }

  // 0ms Optimistic Filtered Accounts:
  // Immediately filters candidate accounts in-memory (0.19ms) without waiting for server round-trip.
  const isCurrentFilterDataReady = Boolean(serverFilterData && lastAppliedKey === currentKeyString);

  const displayAccounts = useMemo(() => {
    const candidateList = isCurrentFilterDataReady
      ? accounts
      : Array.from(knownAccountsMapRef.current.values());

    return candidateList.filter((acc) =>
      accountMatchesFilters(acc, {
        status: activeTab,
        type: activeType,
        country: activeCountry,
        search: searchQuery,
      })
    );
  }, [
    isCurrentFilterDataReady,
    accounts,
    activeTab,
    activeType,
    activeCountry,
    searchQuery,
  ]);

  useEffect(() => {
    if (displayAccounts.length > 0 && !displayAccounts.some((c) => c.id === selectedAccountId)) {
      setSelectedAccountId(displayAccounts[0].id);
    }
  }, [displayAccounts, selectedAccountId]);

  // Infinite Scroll: Load more accounts
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    const nextPage = pageRef.current + 1;
    try {
      const res = await getCompaniesWithContacts({
        status: activeTabRef.current,
        type: activeTypeRef.current,
        country: activeCountryRef.current === "ALL" ? "" : activeCountryRef.current,
        search: debouncedSearchRef.current,
        page: nextPage,
        pageSize: 20,
      });

      if (res.companies.length > 0) {
        const newItems = res.companies as AccountCardDTO[];
        for (const item of newItems) {
          knownAccountsMapRef.current.set(item.id, item);
        }
        setAccounts((prev) => {
          const existingIds = new Set(prev.map((c) => c.id));
          const filtered = newItems.filter((c) => !existingIds.has(c.id));
          return [...prev, ...filtered];
        });
        setPage(nextPage);
        pageRef.current = nextPage;
      }
      setHasMore(res.hasMore);
      hasMoreRef.current = res.hasMore;
    } catch (err) {
      console.error("[ContactView] Failed to load more accounts:", err);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, []);

  // Intent preloading on hover/focus
  const handleCardIntent = useCallback((companyId: string) => {
    const key = getAccountOverviewKey(companyId);
    if (key) {
      void preload(key, fetchAccountOverview);
    }
    void loadEditAccountPanel();
  }, []);

  const handleCreatePanelIntent = useCallback(() => {
    void loadCreateAccountPanel();
  }, []);

  // Card select -> lights up in lime + opens EditAccountPanel
  const handleSelectAccount = useCallback((companyId: string) => {
    setSelectedAccountId(companyId);
    setIsEditAccountOpen(true);
    void loadEditAccountPanel();
  }, []);

  // Selected account for instant slide-over preview (0ms direct object passing)
  const selectedAccount = useMemo(() => {
    if (!selectedAccountId) return null;
    return accounts.find((c) => c.id === selectedAccountId) || null;
  }, [accounts, selectedAccountId]);

  const initialOverviewForSelected = useMemo<AccountOverviewResult | null>(() => {
    if (!selectedAccount) return null;
    const acc = selectedAccount as AccountCardDTO & {
      notes?: string | null;
      phone?: string | null;
      email?: string | null;
      emails?: string[];
      phones?: string[];
      contacts?: Array<{
        id: string;
        name: string;
        role: string | null;
        contactDepartment?: string | null;
        email: string | null;
        phone: string | null;
        emails?: string[];
        phones?: string[];
      }>;
    };

    return {
      company: {
        id: acc.id,
        name: acc.name,
        displayName: acc.displayName || null,
        phone: acc.phone || null,
        email: acc.email || null,
        emails: acc.emails || (acc.email ? [acc.email] : []),
        phones: acc.phones || (acc.phone ? [acc.phone] : []),
        type: acc.type,
        status: acc.status,
        starRating: acc.starRating || 0,
        country: acc.country || null,
        notes: acc.notes || null,
        address: null,
        createdAt: new Date(),
        logs: [],
      },
      addresses: [],
      contacts: (acc.contacts || []).map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role || null,
        contactDepartment: c.contactDepartment || null,
        email: c.email || null,
        phone: c.phone || null,
        emails: c.emails || (c.email ? [c.email] : []),
        phones: c.phones || (c.phone ? [c.phone] : []),
        isEmailVerified: false,
        isPhoneVerified: false,
        image: null,
        isActive: true,
        type: "CUSTOMER" as const,
        status: "QUALIFIED" as const,
        isMasked: false,
        departmentId: null,
        department: null,
        createdAt: new Date(),
        logs: [],
      })),
      deals: [],
      topContributors: [],
      businessSummary: null,
      metrics: {
        totalPipelineValue: 0,
        totalWonValue: 0,
        totalDeals: acc.totalDealsCount || 0,
        openDealsCount: Math.max(0, (acc.totalDealsCount || 0) - (acc.wonDealsCount || 0)),
        wonDealsCount: acc.wonDealsCount || 0,
        lostDealsCount: 0,
        avgWonValue: 0,
        winRate: acc.successRate || 0,
        activePersonsCount: (acc.contacts || []).length,
        inactivePersonsCount: 0,
        totalPersonsCount: (acc.contacts || []).length,
        funnelStages: [],
        radarMetrics: [],
      },
    };
  }, [selectedAccount]);

  // Star Rating Mutation with optimistic paint & per-company sequence guard
  const handleRatingChange = useCallback(async (companyId: string, newRating: number) => {
    const currentSeq = (starSequenceRef.current.get(companyId) || 0) + 1;
    starSequenceRef.current.set(companyId, currentSeq);

    const currentCard = accounts.find((c) => c.id === companyId);
    const previousRating = currentCard?.starRating ?? 0;

    // 1. Optimistic UI update
    setAccounts((prev) => {
      const updated = prev.map((c) =>
        c.id === companyId ? { ...c, starRating: newRating } : c
      );
      return [...updated].sort((a, b) => (b.starRating || 0) - (a.starRating || 0));
    });
    const oldKnown = knownAccountsMapRef.current.get(companyId);
    if (oldKnown) {
      knownAccountsMapRef.current.set(companyId, { ...oldKnown, starRating: newRating });
    }

    const mutationId = `mut_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    activeMutationsRef.current.add(mutationId);

    try {
      const res = await updateCompanyStarRating(companyId, newRating, mutationId);
      if (res?.revision) {
        setAccounts((prev) =>
          prev.map((c) => (c.id === companyId ? { ...c, revision: res.revision } : c))
        );
        const curKnown = knownAccountsMapRef.current.get(companyId);
        if (curKnown) {
          knownAccountsMapRef.current.set(companyId, { ...curKnown, revision: res.revision });
        }
      }
    } catch (err) {
      console.error("[ContactView] Rating mutation failed:", err);
      if (starSequenceRef.current.get(companyId) === currentSeq) {
        setAccounts((prev) => {
          const reverted = prev.map((c) =>
            c.id === companyId ? { ...c, starRating: previousRating } : c
          );
          return [...reverted].sort((a, b) => (b.starRating || 0) - (a.starRating || 0));
        });
        const revKnown = knownAccountsMapRef.current.get(companyId);
        if (revKnown) {
          knownAccountsMapRef.current.set(companyId, { ...revKnown, starRating: previousRating });
        }
      }
    } finally {
      setTimeout(() => {
        activeMutationsRef.current.delete(mutationId);
      }, 5000);
    }
  }, [accounts]);

  // Edit Account Save: Optimistically update card
  const handleAccountUpdated = useCallback((updatedCompany?: Partial<CompanyMasterItem>) => {
    if (!updatedCompany || !selectedAccountId) return;

    setAccounts((prev) =>
      prev.map((c) => {
        if (c.id !== selectedAccountId) return c;
        return {
          ...c,
          ...updatedCompany,
          displayName: updatedCompany.displayName !== undefined ? updatedCompany.displayName : c.displayName,
          name: updatedCompany.name !== undefined ? updatedCompany.name : c.name,
          country: updatedCompany.country !== undefined ? updatedCompany.country : c.country,
          type: updatedCompany.type !== undefined ? updatedCompany.type : c.type,
          status: updatedCompany.status !== undefined ? updatedCompany.status : c.status,
          starRating: updatedCompany.starRating !== undefined ? updatedCompany.starRating : c.starRating,
        };
      })
    );
    const existing = knownAccountsMapRef.current.get(selectedAccountId);
    if (existing) {
      knownAccountsMapRef.current.set(selectedAccountId, {
        ...existing,
        ...updatedCompany,
        displayName: updatedCompany.displayName !== undefined ? updatedCompany.displayName : existing.displayName,
        name: updatedCompany.name !== undefined ? updatedCompany.name : existing.name,
        country: updatedCompany.country !== undefined ? updatedCompany.country : existing.country,
        type: updatedCompany.type !== undefined ? updatedCompany.type : existing.type,
        status: updatedCompany.status !== undefined ? updatedCompany.status : existing.status,
        starRating: updatedCompany.starRating !== undefined ? updatedCompany.starRating : existing.starRating,
      });
    }
  }, [selectedAccountId]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      if (isEditAccountOpen) {
        e.preventDefault();
        setIsEditAccountOpen(false);
        return;
      }

      if (isCreateAccountOpen) {
        e.preventDefault();
        setIsCreateAccountOpen(false);
        return;
      }

      if (searchQuery || activeType !== "ALL" || activeCountry !== "ALL") {
        e.preventDefault();
        setSearchQuery("");
        setActiveType("ALL");
        setActiveCountry("ALL");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditAccountOpen, isCreateAccountOpen, searchQuery, activeType, activeCountry]);

  // Synchronize state with URL parameters (replaceState)
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeTab !== "QUALIFIED") params.set("tab", activeTab);
    if (activeType !== "ALL") params.set("type", activeType);
    if (activeCountry !== "ALL") params.set("country", activeCountry);
    if (searchQuery.trim()) params.set("q", searchQuery.trim());

    const queryString = params.toString();
    const newUrl = queryString ? `/contact?${queryString}` : "/contact";
    window.history.replaceState(null, "", newUrl);
  }, [activeTab, activeType, activeCountry, searchQuery]);

  // Realtime synchronization via Pusher private-contacts channel
  useEffect(() => {
    const channelName = "private-contacts";

    type AccountPusherEvent = {
      action: string;
      companyId: string;
      mutationId?: string;
      revision?: string;
      status?: ContactStatus;
      starRating?: number;
      company?: Partial<AccountCardDTO>;
    };

    const handleAccountUpdate = (data?: AccountPusherEvent) => {
      if (!data?.companyId) return;

      // Ignore actor's own Pusher echo
      if (data.mutationId && activeMutationsRef.current.has(data.mutationId)) {
        return;
      }

      if (data.action === "RATING_CHANGE" && data.starRating !== undefined) {
        setAccounts((prev) => {
          const updated = prev.map((c) =>
            c.id === data.companyId
              ? {
                  ...c,
                  starRating: data.starRating!,
                  revision: data.revision || c.revision,
                }
              : c
          );
          return [...updated].sort((a, b) => (b.starRating || 0) - (a.starRating || 0));
        });
      } else if (data.action === "DETAILS_CHANGE" && data.company) {
        setAccounts((prev) =>
          prev.map((c) =>
            c.id === data.companyId
              ? {
                  ...c,
                  ...data.company,
                  revision: data.revision || c.revision,
                }
              : c
          )
        );
      } else if (data.action === "STATUS_CHANGE" && data.status) {
        setAccounts((prev) =>
          prev.map((c) => (c.id === data.companyId ? { ...c, status: data.status! } : c))
        );
        setStats((prev) => ({
          ...prev,
          qualifiedCount:
            data.status === "QUALIFIED" ? prev.qualifiedCount + 1 : Math.max(0, prev.qualifiedCount - 1),
          unqualifiedCount:
            data.status === "UNQUALIFIED" ? prev.unqualifiedCount + 1 : Math.max(0, prev.unqualifiedCount - 1),
        }));
      }
    };

    return acquireChannelWhenConnected(channelName, (channel) => {
      channel.bind("account-updated", handleAccountUpdate);
      return () => {
        channel.unbind("account-updated", handleAccountUpdate);
      };
    });
  }, []);

  // Targeted recovery listener
  useEffect(() => {
    const handleContactRecovery = async () => {
      try {
        const fresh = await getCompaniesWithContacts({
          status: activeTabRef.current,
          type: activeTypeRef.current,
          country: activeCountryRef.current === "ALL" ? "" : activeCountryRef.current,
          search: debouncedSearchRef.current,
          page: 1,
          pageSize: Math.max(20, pageRef.current * 20),
        });
        setAccounts(fresh.companies as AccountCardDTO[]);
        setStats(fresh.stats);
        setTotalAccounts(fresh.total);
      } catch (err) {
        console.warn("[ContactView] Recovery fetch failed:", err);
      }
    };

    window.addEventListener(CONTACT_RECOVERY_EVENT, handleContactRecovery);
    return () => window.removeEventListener(CONTACT_RECOVERY_EVENT, handleContactRecovery);
  }, []);

  // Sidebar mobile integration
  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
    activeType !== "ALL" ||
    activeCountry !== "ALL"
  );

  useEffect(() => {
    setHasActiveFilters(hasActiveFilters);
  }, [hasActiveFilters, setHasActiveFilters]);

  useEffect(() => {
    setPageSearchConfig({
      query: searchQuery,
      onSearch: handleSearchChange,
      placeholder: "Search accounts...",
    });
    return () => setPageSearchConfig(null);
  }, [searchQuery, handleSearchChange, setPageSearchConfig]);

  useEffect(() => {
    setPageManageContent(
      <AccountFilterContent
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activeType={activeType}
        onTypeChange={handleTypeChange}
        availableTypes={availableTypes}
        activeCountry={activeCountry}
        onCountryChange={handleCountryChange}
        availableCountries={availableCountries}
        stats={stats}
        activeFilterCount={activeFilterCount}
        onResetFilters={handleResetFilters}
        onOpenCreateAccount={() => {
          void loadCreateAccountPanel();
          setIsCreateAccountOpen(true);
        }}
      />
    );
    return () => setPageManageContent(null);
  }, [
    activeTab,
    activeType,
    handleTypeChange,
    availableTypes,
    activeCountry,
    handleCountryChange,
    availableCountries,
    stats,
    activeFilterCount,
    handleResetFilters,
    setPageManageContent,
  ]);

  return (
    <WorkspaceLayout scrollMode="hidden">
      <div className="flex flex-col h-full bg-[#252728] overflow-hidden select-none p-2">
        <div className="max-w-[1400px] mx-auto w-full h-full flex flex-col md:flex-row gap-8 items-stretch overflow-hidden">
          {/* LEFT: 2 Groups Filter Sidebar (Type & Country - Desktop Only) */}
          <AccountFilterSidebar
            activeType={activeType}
            onTypeChange={handleTypeChange}
            availableTypes={availableTypes}
            activeCountry={activeCountry}
            onCountryChange={handleCountryChange}
            availableCountries={availableCountries}
          />

          {/* RIGHT: Main Account List Area */}
          <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden w-full">
            <AccountCardList
              accounts={displayAccounts}
              isLoading={isFilterLoading && displayAccounts.length === 0}
              isLoadingMore={isLoadingMore}
              hasMore={hasMore}
              totalAccounts={searchQuery.trim() ? displayAccounts.length : totalAccounts}
              selectedAccountId={selectedAccountId}
              onSelectAccount={handleSelectAccount}
              onRatingChange={handleRatingChange}
              onLoadMore={handleLoadMore}
              onRowIntent={handleCardIntent}
              headerAction={
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  {/* Qualification Status Tabs (Desktop Only) */}
                  <div className="hidden md:flex gap-1 bg-[#1E1F21] p-1 rounded-full shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveTab("QUALIFIED")}
                      className={`px-3 py-1 text-xs font-bold rounded-full transition-all cursor-pointer ${
                        activeTab === "QUALIFIED"
                          ? "bg-[#3A3B3C] text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <span>QUALIFIED</span>
                      <span className="ml-1 text-[11px] opacity-70">
                        {stats.qualifiedCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("UNQUALIFIED")}
                      className={`px-3 py-1 text-xs font-bold rounded-full transition-all cursor-pointer ${
                        activeTab === "UNQUALIFIED"
                          ? "bg-[#3A3B3C] text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <span>UNQUALIFIED</span>
                      <span className="ml-1 text-[11px] opacity-70">
                        {stats.unqualifiedCount}
                      </span>
                    </button>
                  </div>

                  {/* Account Search */}
                  <AccountSearch
                    value={searchQuery}
                    onChange={handleSearchChange}
                    placeholder="Search accounts..."
                  />

                  {/* Centralized Filters Button (Desktop Only, matches PipelineView style) */}
                  <button
                    type="button"
                    onClick={() => setIsFiltersOpen(true)}
                    className={`hidden md:flex px-3.5 py-1.5 rounded-full text-xs font-semibold items-center gap-2 border transition-all cursor-pointer ${
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

                  {/* Add Account Button */}
                  <button
                    type="button"
                    onClick={() => {
                      void loadCreateAccountPanel();
                      setIsCreateAccountOpen(true);
                    }}
                    onPointerEnter={handleCreatePanelIntent}
                    className="h-8 px-3.5 rounded-full text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-none"
                  >
                    <Plus className="w-3.5 h-3.5 text-black" />
                    <span>Add</span>
                  </button>
                </div>
              }
            />
          </div>
        </div>
      </div>

      {/* Centralized Account Filters Drawer (Desktop Modal) */}
      <AccountFiltersDrawer
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activeType={activeType}
        onTypeChange={handleTypeChange}
        availableTypes={availableTypes}
        activeCountry={activeCountry}
        onCountryChange={handleCountryChange}
        availableCountries={availableCountries}
        stats={stats}
        activeFilterCount={activeFilterCount}
        onResetFilters={handleResetFilters}
        onOpenCreateAccount={() => {
          void loadCreateAccountPanel();
          setIsCreateAccountOpen(true);
        }}
      />

      {/* Create Account Slide-over Panel */}
      {isCreateAccountOpen && (
        <CreateAccountPanel
          isOpen={isCreateAccountOpen}
          onClose={() => setIsCreateAccountOpen(false)}
          onAccountCreated={(newCompany) => {
            setIsCreateAccountOpen(false);
            if (newCompany) {
              const dto: AccountCardDTO = {
                id: newCompany.id,
                displayName: newCompany.displayName || newCompany.name,
                name: newCompany.name,
                status: newCompany.status || activeTab,
                type: newCompany.type || (activeType !== "ALL" ? activeType : "CUSTOMER"),
                country: newCompany.country || (activeCountry !== "ALL" ? activeCountry : null),
                starRating: newCompany.starRating || 0,
                successRate: 0,
                wonDealsCount: 0,
                totalDealsCount: 0,
                revision: new Date().toISOString(),
              };
              knownAccountsMapRef.current.set(dto.id, dto);
              setAccounts((prev) => [dto, ...prev]);
              setStats((prev) => ({
                ...prev,
                qualifiedCount: dto.status === "QUALIFIED" ? prev.qualifiedCount + 1 : prev.qualifiedCount,
                unqualifiedCount: dto.status === "UNQUALIFIED" ? prev.unqualifiedCount + 1 : prev.unqualifiedCount,
                totalCount: prev.totalCount + 1,
              }));
              setTotalAccounts((prev) => prev + 1);
            }
          }}
        />
      )}

      {/* Edit Account Slide-over Panel */}
      {isEditAccountOpen && selectedAccountId && (
        <EditAccountPanel
          key={selectedAccountId}
          isOpen={isEditAccountOpen}
          companyId={selectedAccountId}
          initialOverview={initialOverviewForSelected}
          onClose={() => {
            setIsEditAccountOpen(false);
          }}
          onAccountUpdated={handleAccountUpdated}
          initialTab="account"
        />
      )}
    </WorkspaceLayout>
  );
}
