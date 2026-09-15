'use client';

import { useEffect, useMemo, useRef } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import type { DashboardSectionAccess, SalesOverviewSnapshot } from '@/lib/dashboard/sales-overview';
import {
  createScopeToken,
  dashboardSummaryKey,
  dashboardTrackingKey,
  dashboardAnnualKey,
  dashboardMapSummaryKey,
  dashboardFilterOptionsKey,
  type ScopeActorInfo,
} from '@/lib/dashboard/dashboard-keys';
import {
  DASHBOARD_CHANNEL_EVENT,
  decideDashboardEvent,
  isDashboardEventRelevant,
  isDashboardInvalidationEvent,
  type DashboardResource,
} from '@/lib/dashboard/dashboard-realtime';
import { acquireChannelWhenConnected } from '@/lib/pusher-subscription-manager';
import {
  getDashboardSummaryAction,
  getDashboardTrackingAction,
  getDashboardAnnualAction,
  getDashboardMapSummaryAction,
  getDashboardFilterOptionsAction,
} from '@/lib/actions/dashboard';

export interface DashboardFilterState {
  month: number;
  year: number;
  country: string | null;
  account: string | null;
}

interface UseDashboardDataProps {
  initialSnapshot: SalesOverviewSnapshot | null;
  sections: DashboardSectionAccess;
  actor: ScopeActorInfo;
  filters: DashboardFilterState;
  initialFilters: DashboardFilterState;
}

export function useDashboardData({
  initialSnapshot,
  sections,
  actor,
  filters,
  initialFilters,
}: UseDashboardDataProps) {
  const { mutate } = useSWRConfig();
  const scope = useMemo(() => createScopeToken(actor), [actor]);
  const canSeeSales = Object.values(sections).some(Boolean);

  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const ownMutationIdsRef = useRef<Set<string>>(new Set());
  const debounceTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const isInitialPeriod =
    filters.month === initialFilters.month &&
    filters.year === initialFilters.year &&
    filters.country === initialFilters.country &&
    filters.account === initialFilters.account;

  // 1. Summary Resource (Monthly + Yearly totals & previews)
  const summaryKey = canSeeSales
    ? dashboardSummaryKey(scope, {
        month: filters.month,
        year: filters.year,
        country: filters.country,
        account: filters.account,
      })
    : null;

  const {
    data: summaryData,
    isLoading: isSummaryLoading,
    isValidating: isSummaryValidating,
  } = useSWR(
    summaryKey,
    async () => {
      return await getDashboardSummaryAction({
        month: filters.month,
        year: filters.year,
        country: filters.country,
        account: filters.account,
      });
    },
    {
      fallbackData: isInitialPeriod && initialSnapshot
        ? {
            monthly: initialSnapshot.monthly,
            yearly: initialSnapshot.yearly,
            period: initialSnapshot.period,
          }
        : undefined,
      revalidateOnMount: !(isInitialPeriod && Boolean(initialSnapshot)),
      revalidateOnFocus: false,
      dedupingInterval: 15_000,
      keepPreviousData: true,
    }
  );

  // 2. Tracking Resource (Selected-year targets only)
  const trackingKey = sections.saleTracking
    ? dashboardTrackingKey(scope, {
        year: filters.year,
        country: filters.country,
        account: filters.account,
      })
    : null;

  const {
    data: trackingData,
    isLoading: isTrackingLoading,
    isValidating: isTrackingValidating,
  } = useSWR(
    trackingKey,
    async () => {
      return await getDashboardTrackingAction({
        year: filters.year,
        country: filters.country,
        account: filters.account,
      });
    },
    {
      fallbackData: isInitialPeriod ? initialSnapshot?.tracking : undefined,
      revalidateOnMount: !(isInitialPeriod && Boolean(initialSnapshot?.tracking)),
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
      keepPreviousData: true,
    }
  );

  // 3. Annual Resource (5-year account matrix)
  const annualKey = sections.annualSaleReport
    ? dashboardAnnualKey(scope, {
        anchorYear: filters.year,
        country: filters.country,
        account: filters.account,
      })
    : null;

  const {
    data: annualData,
    isLoading: isAnnualLoading,
    isValidating: isAnnualValidating,
  } = useSWR(
    annualKey,
    async () => {
      return await getDashboardAnnualAction({
        anchorYear: filters.year,
        country: filters.country,
        account: filters.account,
      });
    },
    {
      fallbackData: isInitialPeriod ? initialSnapshot?.annual : undefined,
      revalidateOnMount: !(isInitialPeriod && Boolean(initialSnapshot?.annual)),
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
      keepPreviousData: true,
    }
  );

  // 4. World Map Summary Resource
  const mapSummaryKey = canSeeSales
    ? dashboardMapSummaryKey(scope, {
        year: filters.year,
        month: filters.month,
      })
    : null;

  const {
    data: mapData,
    isLoading: isMapLoading,
    isValidating: isMapValidating,
  } = useSWR(
    mapSummaryKey,
    async () => {
      return await getDashboardMapSummaryAction({
        year: filters.year,
        month: filters.month,
      });
    },
    {
      fallbackData: isInitialPeriod ? initialSnapshot?.worldMap : undefined,
      revalidateOnMount: !(isInitialPeriod && Boolean(initialSnapshot?.worldMap)),
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
      keepPreviousData: true,
    }
  );

  // 5. Filter Options Resource (Independent of period)
  const filterOptionsKey = canSeeSales ? dashboardFilterOptionsKey(scope) : null;
  const { data: filterOptionsData } = useSWR(
    filterOptionsKey,
    async () => {
      return await getDashboardFilterOptionsAction();
    },
    {
      fallbackData: initialSnapshot?.filterOptions,
      revalidateOnMount: !initialSnapshot?.filterOptions,
      revalidateOnFocus: false,
      revalidateIfStale: false,
      dedupingInterval: 60_000,
    }
  );

  // Re-compose unified snapshot for presentation components
  const snapshot = useMemo<SalesOverviewSnapshot | null>(() => {
    if (!initialSnapshot && !summaryData) return null;

    const basePeriod = summaryData?.period ?? initialSnapshot?.period ?? {
      month: filters.month,
      year: filters.year,
      timezone: 'Asia/Bangkok' as const,
    };

    const emptyGroup = { count: 0, totals: [], preview: [], deals: [] };
    const emptyAnnual = { years: [], totals: {}, accounts: [] };
    const emptyMap = {
      allTime: { totalCountries: 0, totalDeals: 0, totalAmount: 0, countries: [] },
      byYear: {},
      selectedMonth: { totalCountries: 0, totalDeals: 0, totalAmount: 0, countries: [] },
    };

    return {
      period: basePeriod,
      scopeLabel: initialSnapshot?.scopeLabel ?? 'Accessible deals',
      generatedAt: initialSnapshot?.generatedAt ?? new Date().toISOString(),
      filters: {
        country: filters.country,
        account: filters.account,
      },
      filterOptions: filterOptionsData ?? initialSnapshot?.filterOptions ?? { countries: [], accounts: [] },
      monthly: summaryData?.monthly ?? initialSnapshot?.monthly ?? {
        waiting: emptyGroup,
        won: emptyGroup,
        total: emptyGroup,
      },
      yearly: summaryData?.yearly ?? initialSnapshot?.yearly ?? {
        waiting: emptyGroup,
        won: emptyGroup,
        total: emptyGroup,
      },
      tracking: trackingData ?? initialSnapshot?.tracking ?? [],
      annual: annualData ?? initialSnapshot?.annual ?? emptyAnnual,
      worldMap: mapData ?? initialSnapshot?.worldMap ?? emptyMap,
    };
  }, [
    initialSnapshot,
    summaryData,
    trackingData,
    annualData,
    mapData,
    filterOptionsData,
    filters.month,
    filters.year,
    filters.country,
    filters.account,
  ]);

  const isPending =
    isSummaryLoading ||
    isTrackingLoading ||
    isAnnualLoading ||
    isMapLoading ||
    isSummaryValidating ||
    isTrackingValidating ||
    isAnnualValidating ||
    isMapValidating;

  const revalidateVisibleKeys = async () => {
    const promises: Promise<unknown>[] = [];
    if (summaryKey) promises.push(mutate(summaryKey));
    if (trackingKey) promises.push(mutate(trackingKey));
    if (annualKey) promises.push(mutate(annualKey));
    if (mapSummaryKey) promises.push(mutate(mapSummaryKey));
    await Promise.all(promises);
  };

  const revalidateResource = async (resource: DashboardResource) => {
    switch (resource) {
      case 'summary':
        if (summaryKey) await mutate(summaryKey);
        break;
      case 'tracking':
        if (trackingKey) await mutate(trackingKey);
        break;
      case 'annual':
        if (annualKey) await mutate(annualKey);
        break;
      case 'map-summary':
        if (mapSummaryKey) await mutate(mapSummaryKey);
        break;
      case 'filter-options':
        if (filterOptionsKey) await mutate(filterOptionsKey);
        break;
      default:
        break;
    }
  };

  // Debounced coalescing for burst events
  const scheduleResourceRevalidate = (resource: DashboardResource) => {
    const existing = debounceTimersRef.current.get(resource);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      debounceTimersRef.current.delete(resource);
      void revalidateResource(resource);
    }, 250);

    debounceTimersRef.current.set(resource, timer);
  };

  // Pusher Realtime Subscription (private-dashboard-{userId})
  useEffect(() => {
    if (!actor.id) return;
    const channelName = `private-dashboard-${actor.id}`;

    const release = acquireChannelWhenConnected(channelName, (channel) => {
      const onInvalidated = (data: unknown) => {
        if (!isDashboardInvalidationEvent(data)) return;
        if (!isDashboardEventRelevant(data, filters)) return;

        const decision = decideDashboardEvent(
          data,
          seenEventIdsRef.current,
          ownMutationIdsRef.current
        );

        if (decision === 'REVALIDATE') {
          data.resources.forEach(scheduleResourceRevalidate);
        }
      };

      channel.bind(DASHBOARD_CHANNEL_EVENT, onInvalidated);

      return () => {
        channel.unbind(DASHBOARD_CHANNEL_EVENT, onInvalidated);
      };
    });

    // Offline / Visibility Recovery
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void revalidateVisibleKeys();
      }
    };

    const handleOnline = () => {
      void revalidateVisibleKeys();
    };

    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('online', handleOnline);
    }

    return () => {
      release();
      if (typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('online', handleOnline);
      }
      // Clear any pending debounce timers
      debounceTimersRef.current.forEach((t) => clearTimeout(t));
      debounceTimersRef.current.clear();
    };
  }, [actor.id, filters, summaryKey, trackingKey, annualKey, mapSummaryKey, filterOptionsKey]);

  return {
    snapshot,
    isPending,
    isSummaryLoading,
    isTrackingLoading,
    isAnnualLoading,
    isMapLoading,
    revalidateVisibleKeys,
    revalidateResource,
    trackOwnMutation: (mutationId: string) => {
      ownMutationIdsRef.current.add(mutationId);
    },
    keys: {
      summaryKey,
      trackingKey,
      annualKey,
      mapSummaryKey,
      filterOptionsKey,
    },
  };
}
