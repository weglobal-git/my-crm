"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { ContactType, ContactStatus } from "@prisma/client";
import useSWR, { preload } from "swr";
import { Plus, SlidersHorizontal, Rows3, Rows2 } from "lucide-react";
import { acquireChannelWhenConnected } from "@/lib/pusher-subscription-manager";
import { CONTACT_RECOVERY_EVENT } from "@/lib/pusher-connection-manager";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { useSidebar } from "@/components/layout/SidebarContext";

import type { AccountCardDTO } from "@/lib/contact/account-card-dto";
import { accountMatchesFilters } from "@/lib/contact/account-card-dto";
import {
  getAccountCardDensityStorageKey,
  getStoredAccountCardDensityClient,
  parseAccountCardDensity,
  saveStoredAccountCardDensityClient,
  type AccountCardDensity,
} from "@/lib/contact/account-card-density-client";
import { getAccountFilterKey, getAccountOverviewKey } from "@/lib/contact/account-cache-keys";
import { getReadableActionError, unwrapActionResult } from "@/lib/contact/action-result";
import { useDialog } from "@/providers/DialogProvider";
import {
  getCompaniesWithContacts,
  getCompanyCountries,
  getCompanyTypes,
  updateCompanyStarRatingSafe,
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
  initialCardDensity?: AccountCardDensity;
  actorId?: string;
}

export function ContactView({
  initialCompanies,
  initialStats,
  initialTotal,
  initialTypes,
  initialCountries,
  initialCardDensity,
  actorId = "default-actor",
}: ContactViewProps) {
  const { setPageSearchConfig, setPageManageContent, setHasActiveFilters } = useSidebar();
  const { toast } = useDialog();

  // State: Tab & Filters matching the profile layout
  const [activeTab, setActiveTab] = useState<"QUALIFIED" | "UNQUALIFIED">("QUALIFIED");
  const [activeType, setActiveType] = useState<ContactType | "ALL">("ALL");
  const [activeCountry, setActiveCountry] = useState<string>("ALL");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [cardDensity, setCardDensity] = useState<AccountCardDensity>(
    () => initialCardDensity ?? getStoredAccountCardDensityClient(actorId)
  );

  useEffect(() => {
    const storageKey = getAccountCardDensityStorageKey(actorId);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === storageKey) {
        setCardDensity(parseAccountCardDensity(e.newValue));
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [actorId]);

  const handleCardDensityChange = useCallback(
    (nextDensity: AccountCardDensity) => {
      setCardDensity(nextDensity);
      saveStoredAccountCardDensityClient(actorId, nextDensity);
    },
    [actorId]
  );

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
  const [editAccountInitialTab, setEditAccountInitialTab] = useState<string>("account");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    initialCompanies[0]?.id || null
  );

  // Active filter count for Filters badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activeTab === "UNQUALIFIED") count++;
    if (selectedTypes.length > 0) count++;
    else if (activeType !== "ALL") count++;
    if (selectedCountries.length > 0) count++;
    else if (activeCountry !== "ALL") count++;
    return count;
  }, [activeTab, activeType, activeCountry, selectedTypes, selectedCountries]);

  // Reset all filters to default
  const handleResetFilters = useCallback(() => {
    setActiveTab("QUALIFIED");
    setActiveType("ALL");
    setActiveCountry("ALL");
    setSelectedTypes([]);
    setSelectedCountries([]);
  }, []);

  // Sequence & Mutation tracking for instant race-safe ratings
  const starSequenceRef = useRef<Map<string, number>>(new Map());
  const activeMutationsRef = useRef<Set<string>>(new Set());

  // Persistent registry of all known accounts across filters & pages for 0ms optimistic filtering
  const knownAccountsMapRef = useRef<Map<string, AccountCardDTO>>(new Map());
  const [knownAccounts, setKnownAccounts] = useState<Map<string, AccountCardDTO>>(() => {
    const map = new Map<string, AccountCardDTO>();
    for (const c of initialCompanies) {
      map.set(c.id, c as AccountCardDTO);
    }
    return map;
  });

  useEffect(() => {
    knownAccountsMapRef.current = knownAccounts;
  }, [knownAccounts]);

  const [prevInitialCompanies, setPrevInitialCompanies] = useState(initialCompanies);
  if (prevInitialCompanies !== initialCompanies) {
    setPrevInitialCompanies(initialCompanies);
    setKnownAccounts((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const c of initialCompanies) {
        if (!next.has(c.id)) {
          next.set(c.id, c as AccountCardDTO);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }

  // Idle Background Preload: Pre-warm EditAccountPanel code chunk and first company overview
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    let idleId: number | null = null;

    const primePanels = () => {
      void loadEditAccountPanel();
      if (initialCompanies[0]?.id) {
        const key = getAccountOverviewKey(initialCompanies[0].id);
        if (key) {
          void preload(key, fetchAccountOverview);
        }
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(primePanels, { timeout: 1200 });
    } else {
      timer = setTimeout(primePanels, 300);
    }

    return () => {
      if (idleId !== null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      }
      if (timer) clearTimeout(timer);
    };
  }, [initialCompanies]);

  // Stable filter callbacks for 0ms interaction
  const handleTypeChange = useCallback((type: ContactType | "ALL") => {
    setActiveType(type);
  }, []);

  const handleCountryChange = useCallback((country: string) => {
    setActiveCountry(country);
  }, []);

  const handleSelectTypes = useCallback((types: string[]) => {
    setSelectedTypes(types);
  }, []);

  const handleSelectCountries = useCallback((countries: string[]) => {
    setSelectedCountries(countries);
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
  const selectedTypesRef = useRef(selectedTypes);
  const selectedCountriesRef = useRef(selectedCountries);
  const debouncedSearchRef = useRef(debouncedSearch);

  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { isLoadingMoreRef.current = isLoadingMore; }, [isLoadingMore]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { activeTypeRef.current = activeType; }, [activeType]);
  useEffect(() => { activeCountryRef.current = activeCountry; }, [activeCountry]);
  useEffect(() => { selectedTypesRef.current = selectedTypes; }, [selectedTypes]);
  useEffect(() => { selectedCountriesRef.current = selectedCountries; }, [selectedCountries]);
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
        types: selectedTypes,
        countries: selectedCountries,
        search: debouncedSearch,
      }),
    [actorId, activeTab, activeType, activeCountry, selectedTypes, selectedCountries, debouncedSearch]
  );

  const fetcher = useCallback(async () => {
    const res = await getCompaniesWithContacts({
      status: activeTab,
      type: activeType,
      country: activeCountry === "ALL" ? "" : activeCountry,
      types: selectedTypes,
      countries: selectedCountries,
      search: debouncedSearch,
      page: 1,
      pageSize: 20,
    });
    return res;
  }, [activeTab, activeType, activeCountry, selectedTypes, selectedCountries, debouncedSearch]);

  const isInitialState =
    activeTab === "QUALIFIED" &&
    activeType === "ALL" &&
    activeCountry === "ALL" &&
    selectedTypes.length === 0 &&
    selectedCountries.length === 0 &&
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
  const currentKeyString = `${activeTab}|${activeType}|${activeCountry}|${selectedTypes.join(",")}|${selectedCountries.join(",")}|${debouncedSearch}`;
  const [lastAppliedKey, setLastAppliedKey] = useState("QUALIFIED|ALL|ALL|||");

  if (lastAppliedKey !== currentKeyString && serverFilterData) {
    setLastAppliedKey(currentKeyString);
    const items = serverFilterData.companies as AccountCardDTO[];
    setAccounts(items);
    setPage(1);
    setHasMore(serverFilterData.hasMore);
    setStats(serverFilterData.stats);
    setTotalAccounts(serverFilterData.total);
    setKnownAccounts((prev) => {
      const next = new Map(prev);
      for (const item of items) {
        next.set(item.id, item);
      }
      return next;
    });
  }

  // 0ms Optimistic Filtered Accounts:
  // Immediately filters candidate accounts in-memory (0.19ms) without waiting for server round-trip.
  const isCurrentFilterDataReady = Boolean(serverFilterData && lastAppliedKey === currentKeyString);

  const displayAccounts = useMemo(() => {
    const candidateList = isCurrentFilterDataReady
      ? accounts
      : Array.from(knownAccounts.values());

    return candidateList.filter((acc) =>
      accountMatchesFilters(acc, {
        status: activeTab,
        type: activeType,
        country: activeCountry,
        types: selectedTypes,
        countries: selectedCountries,
        search: searchQuery,
      })
    );
  }, [
    isCurrentFilterDataReady,
    accounts,
    knownAccounts,
    activeTab,
    activeType,
    activeCountry,
    selectedTypes,
    selectedCountries,
    searchQuery,
  ]);

  // Derived effective selection: keep open drawer pinned to selectedAccountId even if filter status/type changes
  const effectiveSelectedAccountId = useMemo(() => {
    if (selectedAccountId) {
      if (isEditAccountOpen || displayAccounts.some((c) => c.id === selectedAccountId)) {
        return selectedAccountId;
      }
    }
    return displayAccounts[0]?.id || null;
  }, [displayAccounts, isEditAccountOpen, selectedAccountId]);

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
        types: selectedTypesRef.current,
        countries: selectedCountriesRef.current,
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
    setEditAccountInitialTab("account");
    setIsEditAccountOpen(true);
    void loadEditAccountPanel();
  }, []);

  // Robot icon click -> lights up in lime + opens EditAccountPanel directly to AI Summary tab
  const handleOpenAISummary = useCallback((companyId: string) => {
    setSelectedAccountId(companyId);
    setEditAccountInitialTab("ai_analysis");
    setIsEditAccountOpen(true);
    void loadEditAccountPanel();
  }, []);

  // Selected account for instant slide-over preview (0ms direct object passing)
  const selectedAccount = useMemo(() => {
    if (!effectiveSelectedAccountId) return null;
    return (
      accounts.find((c) => c.id === effectiveSelectedAccountId) ||
      knownAccounts.get(effectiveSelectedAccountId) ||
      null
    );
  }, [accounts, knownAccounts, effectiveSelectedAccountId]);

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
      maskedOpportunityCount: 0,
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

  const refreshFacetMetadata = useCallback(() => {
    void getCompanyTypes()
      .then((list) => setAvailableTypes(list))
      .catch(() => {});
    void getCompanyCountries()
      .then((list) => setAvailableCountries(list))
      .catch(() => {});
  }, []);

  const registerOwnMutationId = useCallback((mutationId?: string) => {
    if (!mutationId) return;
    activeMutationsRef.current.add(mutationId);
    setTimeout(() => {
      activeMutationsRef.current.delete(mutationId);
    }, 8000);
  }, []);

  // Star Rating Mutation with optimistic paint & per-company sequence guard
  const handleRatingChange = useCallback(async (companyId: string, newRating: number) => {
    const currentSeq = (starSequenceRef.current.get(companyId) || 0) + 1;
    starSequenceRef.current.set(companyId, currentSeq);

    const currentCard =
      accounts.find((c) => c.id === companyId) || knownAccountsMapRef.current.get(companyId);
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
      const nextCard = { ...oldKnown, starRating: newRating };
      knownAccountsMapRef.current.set(companyId, nextCard);
      setKnownAccounts((prev) => {
        const next = new Map(prev);
        next.set(companyId, nextCard);
        return next;
      });
    }

    const mutationId = `mut_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    registerOwnMutationId(mutationId);

    try {
      const res = unwrapActionResult(
        await updateCompanyStarRatingSafe(companyId, newRating, mutationId)
      );
      if (res?.revision) {
        setAccounts((prev) =>
          prev.map((c) => (c.id === companyId ? { ...c, revision: res.revision } : c))
        );
        const curKnown = knownAccountsMapRef.current.get(companyId);
        if (curKnown) {
          const nextCard = { ...curKnown, revision: res.revision };
          knownAccountsMapRef.current.set(companyId, nextCard);
          setKnownAccounts((prev) => {
            const next = new Map(prev);
            next.set(companyId, nextCard);
            return next;
          });
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
          const revertedCard = { ...revKnown, starRating: previousRating };
          knownAccountsMapRef.current.set(companyId, revertedCard);
          setKnownAccounts((prev) => {
            const next = new Map(prev);
            next.set(companyId, revertedCard);
            return next;
          });
        }
      }
      toast({
        title: "Error",
        description: getReadableActionError(err, "Failed to update star rating"),
        type: "error",
      });
    }
  }, [accounts, registerOwnMutationId, toast]);

  // Edit Account Save: Optimistically update card & counts
  const handleAccountUpdated = useCallback(
    (
      updatedCompany?: Partial<CompanyMasterItem> & { revision?: string },
      mutationId?: string
    ) => {
      registerOwnMutationId(mutationId);
      if (!updatedCompany || !effectiveSelectedAccountId) return;

      const existing =
        knownAccountsMapRef.current.get(effectiveSelectedAccountId) ||
        accounts.find((c) => c.id === effectiveSelectedAccountId);

      const previousStatus = existing?.status;
      const previousCountry = existing?.country;
      const previousType = existing?.type;

      setAccounts((prev) =>
        prev.map((c) => {
          if (c.id !== effectiveSelectedAccountId) return c;
          return {
            ...c,
            ...updatedCompany,
            displayName:
              updatedCompany.displayName !== undefined ? updatedCompany.displayName : c.displayName,
            name: updatedCompany.name !== undefined ? updatedCompany.name : c.name,
            country: updatedCompany.country !== undefined ? updatedCompany.country : c.country,
            type: updatedCompany.type !== undefined ? updatedCompany.type : c.type,
            status: updatedCompany.status !== undefined ? updatedCompany.status : c.status,
            starRating:
              updatedCompany.starRating !== undefined ? updatedCompany.starRating : c.starRating,
            revision: updatedCompany.revision || c.revision,
          };
        })
      );

      if (existing) {
        const merged: AccountCardDTO = {
          ...existing,
          ...updatedCompany,
          displayName:
            updatedCompany.displayName !== undefined
              ? updatedCompany.displayName
              : existing.displayName,
          name: updatedCompany.name !== undefined ? updatedCompany.name : existing.name,
          country: updatedCompany.country !== undefined ? updatedCompany.country : existing.country,
          type: updatedCompany.type !== undefined ? updatedCompany.type : existing.type,
          status: updatedCompany.status !== undefined ? updatedCompany.status : existing.status,
          starRating:
            updatedCompany.starRating !== undefined
              ? updatedCompany.starRating
              : existing.starRating,
          revision: updatedCompany.revision || existing.revision,
        };
        knownAccountsMapRef.current.set(effectiveSelectedAccountId, merged);
        setKnownAccounts((prev) => {
          const next = new Map(prev);
          next.set(effectiveSelectedAccountId, merged);
          return next;
        });
      }

      if (updatedCompany.status && previousStatus && updatedCompany.status !== previousStatus) {
        setStats((prev) => ({
          ...prev,
          qualifiedCount:
            updatedCompany.status === "QUALIFIED"
              ? prev.qualifiedCount + 1
              : Math.max(0, prev.qualifiedCount - 1),
          unqualifiedCount:
            updatedCompany.status === "UNQUALIFIED"
              ? prev.unqualifiedCount + 1
              : Math.max(0, prev.unqualifiedCount - 1),
        }));
      }

      if (
        (updatedCompany.country !== undefined && updatedCompany.country !== previousCountry) ||
        (updatedCompany.type !== undefined && updatedCompany.type !== previousType)
      ) {
        refreshFacetMetadata();
      }
    },
    [accounts, effectiveSelectedAccountId, refreshFacetMetadata, registerOwnMutationId]
  );

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

      if (
        searchQuery ||
        activeType !== "ALL" ||
        activeCountry !== "ALL" ||
        selectedTypes.length > 0 ||
        selectedCountries.length > 0
      ) {
        e.preventDefault();
        setSearchQuery("");
        setActiveType("ALL");
        setActiveCountry("ALL");
        setSelectedTypes([]);
        setSelectedCountries([]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isEditAccountOpen,
    isCreateAccountOpen,
    searchQuery,
    activeType,
    activeCountry,
    selectedTypes,
    selectedCountries,
  ]);

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
      company?: Partial<AccountCardDTO> & { id?: string; name?: string };
    };

    const handleAccountUpdate = (data?: AccountPusherEvent) => {
      if (!data?.companyId) return;

      // Ignore actor's own Pusher echo
      if (data.mutationId && activeMutationsRef.current.has(data.mutationId)) {
        return;
      }

      if (data.action === "COMPANY_CREATED" && data.company) {
        if (knownAccountsMapRef.current.has(data.companyId)) return;

        const dto: AccountCardDTO = {
          id: data.companyId,
          displayName: data.company.displayName || data.company.name || "New Account",
          name: data.company.name || data.company.displayName || "New Account",
          status: data.company.status || "QUALIFIED",
          type: data.company.type || "CUSTOMER",
          country: data.company.country ?? null,
          starRating: data.company.starRating ?? 0,
          successRate: 0,
          wonDealsCount: 0,
          totalDealsCount: 0,
          revision: data.revision || data.company.revision || new Date().toISOString(),
        };

        knownAccountsMapRef.current.set(dto.id, dto);
        setKnownAccounts((prev) => {
          const next = new Map(prev);
          next.set(dto.id, dto);
          return next;
        });

        setAccounts((prev) =>
          prev.some((c) => c.id === dto.id) ? prev : [dto, ...prev]
        );
        setStats((prev) => ({
          ...prev,
          qualifiedCount:
            dto.status === "QUALIFIED" ? prev.qualifiedCount + 1 : prev.qualifiedCount,
          unqualifiedCount:
            dto.status === "UNQUALIFIED" ? prev.unqualifiedCount + 1 : prev.unqualifiedCount,
          totalCount: prev.totalCount + 1,
        }));
        if (
          accountMatchesFilters(dto, {
            status: activeTabRef.current,
            type: activeTypeRef.current,
            country: activeCountryRef.current,
            types: selectedTypesRef.current,
            countries: selectedCountriesRef.current,
            search: debouncedSearchRef.current,
          })
        ) {
          setTotalAccounts((prev) => prev + 1);
        }
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
        const existing = knownAccountsMapRef.current.get(data.companyId);
        if (existing) {
          const merged = {
            ...existing,
            starRating: data.starRating,
            revision: data.revision || existing.revision,
          };
          knownAccountsMapRef.current.set(data.companyId, merged);
          setKnownAccounts((prev) => {
            const next = new Map(prev);
            next.set(data.companyId, merged);
            return next;
          });
        }
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
        const existing = knownAccountsMapRef.current.get(data.companyId);
        if (existing) {
          const merged = {
            ...existing,
            ...data.company,
            revision: data.revision || existing.revision,
          };
          knownAccountsMapRef.current.set(data.companyId, merged);
          setKnownAccounts((prev) => {
            const next = new Map(prev);
            next.set(data.companyId, merged);
            return next;
          });
        }
      } else if (data.action === "STATUS_CHANGE" && data.status) {
        const prevStatus = knownAccountsMapRef.current.get(data.companyId)?.status;
        setAccounts((prev) =>
          prev.map((c) =>
            c.id === data.companyId
              ? { ...c, status: data.status!, revision: data.revision || c.revision }
              : c
          )
        );
        const existing = knownAccountsMapRef.current.get(data.companyId);
        if (existing) {
          const merged = {
            ...existing,
            status: data.status,
            revision: data.revision || existing.revision,
          };
          knownAccountsMapRef.current.set(data.companyId, merged);
          setKnownAccounts((prev) => {
            const next = new Map(prev);
            next.set(data.companyId, merged);
            return next;
          });
        }
        if (!prevStatus || prevStatus !== data.status) {
          setStats((prev) => ({
            ...prev,
            qualifiedCount:
              data.status === "QUALIFIED"
                ? prev.qualifiedCount + 1
                : Math.max(0, prev.qualifiedCount - 1),
            unqualifiedCount:
              data.status === "UNQUALIFIED"
                ? prev.unqualifiedCount + 1
                : Math.max(0, prev.unqualifiedCount - 1),
          }));
        }
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
          types: selectedTypesRef.current,
          countries: selectedCountriesRef.current,
          search: debouncedSearchRef.current,
          page: 1,
          pageSize: Math.max(20, pageRef.current * 20),
        });
        const items = fresh.companies as AccountCardDTO[];
        setAccounts(items);
        setHasMore(fresh.hasMore);
        hasMoreRef.current = fresh.hasMore;
        setStats(fresh.stats);
        setTotalAccounts(fresh.total);
        setKnownAccounts((prev) => {
          const next = new Map(prev);
          for (const item of items) {
            next.set(item.id, item);
          }
          return next;
        });
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
    selectedTypes.length > 0 ||
    activeType !== "ALL" ||
    selectedCountries.length > 0 ||
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
        cardDensity={cardDensity}
        onCardDensityChange={handleCardDensityChange}
        selectedTypes={selectedTypes}
        onSelectTypes={handleSelectTypes}
        availableTypes={availableTypes}
        selectedCountries={selectedCountries}
        onSelectCountries={handleSelectCountries}
        availableCountries={availableCountries}
        activeType={activeType}
        onTypeChange={handleTypeChange}
        activeCountry={activeCountry}
        onCountryChange={handleCountryChange}
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
    cardDensity,
    handleCardDensityChange,
    selectedTypes,
    handleSelectTypes,
    activeType,
    handleTypeChange,
    availableTypes,
    selectedCountries,
    handleSelectCountries,
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
            selectedTypes={selectedTypes}
            onSelectTypes={handleSelectTypes}
            availableTypes={availableTypes}
            selectedCountries={selectedCountries}
            onSelectCountries={handleSelectCountries}
            availableCountries={availableCountries}
            activeType={activeType}
            onTypeChange={handleTypeChange}
            activeCountry={activeCountry}
            onCountryChange={handleCountryChange}
          />

          {/* RIGHT: Main Account List Area */}
          <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden w-full">
            <AccountCardList
              accounts={displayAccounts}
              cardDensity={cardDensity}
              isLoading={isFilterLoading && displayAccounts.length === 0}
              isLoadingMore={isLoadingMore}
              hasMore={hasMore}
              totalAccounts={searchQuery.trim() ? displayAccounts.length : totalAccounts}
              selectedAccountId={effectiveSelectedAccountId}
              onSelectAccount={handleSelectAccount}
              onOpenAISummary={handleOpenAISummary}
              onRatingChange={handleRatingChange}
              onLoadMore={handleLoadMore}
              onRowIntent={handleCardIntent}
              headerAction={
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
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

                  {/* Card Density Switcher (Compact <-> Standard, icon-only matching PipelineView) */}
                  <div
                    role="group"
                    aria-label="Account display density"
                    className="hidden md:flex h-8 p-0.5 rounded-full bg-[#252728] border border-[#3A3B3C] items-center gap-0.5 shrink-0"
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

                  {/* Centralized Filters Button (Desktop Only, matches PipelineView style) */}
                  <button
                    type="button"
                    onClick={() => setIsFiltersOpen(true)}
                    className={`hidden md:flex h-8 px-3.5 rounded-full text-xs font-semibold items-center gap-2 border transition-all cursor-pointer ${
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
                    className="h-8 px-3.5 rounded-full text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
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
        cardDensity={cardDensity}
        onCardDensityChange={handleCardDensityChange}
        selectedTypes={selectedTypes}
        onSelectTypes={handleSelectTypes}
        availableTypes={availableTypes}
        selectedCountries={selectedCountries}
        onSelectCountries={handleSelectCountries}
        availableCountries={availableCountries}
        activeType={activeType}
        onTypeChange={handleTypeChange}
        activeCountry={activeCountry}
        onCountryChange={handleCountryChange}
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
          onAccountCreated={(newCompany, mutationId) => {
            registerOwnMutationId(mutationId);
            setIsCreateAccountOpen(false);
            if (newCompany) {
              const dto: AccountCardDTO = {
                id: newCompany.id,
                displayName: newCompany.displayName || newCompany.name,
                name: newCompany.name,
                status: newCompany.status || "QUALIFIED",
                type: newCompany.type || "CUSTOMER",
                country: newCompany.country || null,
                starRating: newCompany.starRating || 0,
                successRate: 0,
                wonDealsCount: 0,
                totalDealsCount: 0,
                revision: newCompany.revision || new Date().toISOString(),
              };
              knownAccountsMapRef.current.set(dto.id, dto);
              setKnownAccounts((prev) => {
                const next = new Map(prev);
                next.set(dto.id, dto);
                return next;
              });
              setAccounts((prev) =>
                prev.some((c) => c.id === dto.id) ? prev : [dto, ...prev]
              );
              setSelectedAccountId(dto.id);
              setStats((prev) => ({
                ...prev,
                qualifiedCount: dto.status === "QUALIFIED" ? prev.qualifiedCount + 1 : prev.qualifiedCount,
                unqualifiedCount: dto.status === "UNQUALIFIED" ? prev.unqualifiedCount + 1 : prev.unqualifiedCount,
                totalCount: prev.totalCount + 1,
              }));
              if (
                accountMatchesFilters(dto, {
                  status: activeTab,
                  type: activeType,
                  country: activeCountry,
                  types: selectedTypes,
                  countries: selectedCountries,
                  search: debouncedSearch,
                })
              ) {
                setTotalAccounts((prev) => prev + 1);
              }
              refreshFacetMetadata();
            }
          }}
        />
      )}

      {/* Edit Account Slide-over Panel */}
      {isEditAccountOpen && effectiveSelectedAccountId && (
        <EditAccountPanel
          key={`${effectiveSelectedAccountId}-${editAccountInitialTab}`}
          isOpen={isEditAccountOpen}
          companyId={effectiveSelectedAccountId}
          initialOverview={initialOverviewForSelected}
          onClose={() => {
            setIsEditAccountOpen(false);
          }}
          onAccountUpdated={handleAccountUpdated}
          onBusinessSummaryUpdated={(summary) => {
            setAccounts((prev) =>
              prev.map((c) =>
                c.id === effectiveSelectedAccountId
                  ? { ...c, hasAiSummary: Boolean(summary?.trim()) }
                  : c
              )
            );
          }}
          initialTab={editAccountInitialTab}
        />
      )}
    </WorkspaceLayout>
  );
}
