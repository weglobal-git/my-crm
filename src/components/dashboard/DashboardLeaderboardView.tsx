"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Trophy, AlertCircle } from "lucide-react";
import type { SalesOverviewSnapshot } from "@/lib/dashboard/sales-overview";
import type { LeaderboardItem } from "@/lib/dashboard/leaderboard-types";
import {
  createScopeToken,
  dashboardLeaderboardKey,
  type ScopeActorInfo,
} from "@/lib/dashboard/dashboard-keys";
import {
  DASHBOARD_CHANNEL_EVENT,
  isDashboardInvalidationEvent,
  isDashboardEventRelevant,
} from "@/lib/dashboard/dashboard-realtime";
import { acquireChannelWhenConnected } from "@/lib/pusher-subscription-manager";
import { getDashboardLeaderboardAction } from "@/lib/actions/dashboard";
import { DepartmentSelector } from "./DepartmentSelector";
import { DashboardPodium } from "./DashboardPodium";
import { DashboardCategoryColumns } from "./DashboardCategoryColumns";
import { ScoringRulesModal } from "./ScoringRulesModal";
import { ScoreBreakdownModal } from "./ScoreBreakdownModal";
import { DailyCardHealthDrawer } from "./DailyCardHealthDrawer";
import { DailyLtcDrawer } from "./DailyLtcDrawer";

interface DashboardLeaderboardViewProps {
  month: number;
  year: number;
  country?: string | null;
  account?: string | null;
  actor?: ScopeActorInfo;
  snapshot?: SalesOverviewSnapshot | null;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function DashboardLeaderboardView({
  month,
  year,
  country,
  account,
  actor,
}: DashboardLeaderboardViewProps) {
  const resolvedActor: ScopeActorInfo = useMemo(
    () => actor || { id: "anon", role: "ADMIN", departments: [] },
    [actor]
  );

  const scope = useMemo(() => createScopeToken(resolvedActor), [resolvedActor]);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [rulesCategory, setRulesCategory] = useState<string>("card_health");
  const [breakdownItem, setBreakdownItem] = useState<LeaderboardItem | null>(null);
  const [healthDrawerItem, setHealthDrawerItem] = useState<LeaderboardItem | null>(null);
  const [ltcDrawerItem, setLtcDrawerItem] = useState<LeaderboardItem | null>(null);

  const leaderboardKey = useMemo(
    () =>
      dashboardLeaderboardKey(scope, {
        departmentId: selectedDeptId,
        month,
        year,
        country,
        account,
      }),
    [scope, selectedDeptId, month, year, country, account]
  );

  const { data, error, isLoading, mutate } = useSWR(
    leaderboardKey,
    async () => {
      return await getDashboardLeaderboardAction({
        departmentId: selectedDeptId,
        month,
        year,
        country,
        account,
      });
    },
    {
      revalidateOnFocus: true,
      focusThrottleInterval: 10_000,
      keepPreviousData: true,
    }
  );

  // Pusher Realtime Subscription (private-dashboard-{userId})
  useEffect(() => {
    if (!resolvedActor.id || resolvedActor.id === 'anon') return;
    const channelName = `private-dashboard-${resolvedActor.id}`;

    const release = acquireChannelWhenConnected(channelName, (channel) => {
      const onInvalidated = (event: unknown) => {
        if (!isDashboardInvalidationEvent(event)) return;
        if (!isDashboardEventRelevant(event, { year, month, country, account })) return;

        if (event.resources.includes('leaderboard')) {
          void mutate();
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
        void mutate();
      }
    };

    const handleOnline = () => {
      void mutate();
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
    };
  }, [resolvedActor.id, mutate, year, month, country, account]);

  if (error) {
    return (
      <section className="rounded-[2rem] border border-[#4E4F50] bg-[#3A3B3C] p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-[#252728] border border-[#4E4F50] flex items-center justify-center mx-auto text-red-400">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold text-slate-100">
          Unable to load leaderboard
        </h2>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          {error?.message || "An error occurred while fetching department ranking data."}
        </p>
      </section>
    );
  }

  const currentMonthName = MONTH_NAMES[month - 1] || "";
  const isFetchingInitial = isLoading && !data;

  return (
    <div className="space-y-6">
      {/* Leaderboard Header with Department Switcher & Rules Button */}
      <div className="p-1 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C7F33C]">
            Gamification Leaderboard
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <h2 className="text-xl font-bold text-slate-100">
              {data?.departmentName ? `${data.departmentName} Leaderboard` : "Department Leaderboard"}
            </h2>
            <span className="text-xs text-slate-400 font-medium">
              ({currentMonthName} {year})
            </span>
          </div>
        </div>

        {/* Right Header: Department Switcher */}
        <div className="flex items-center gap-2.5">
          {data?.availableDepartments && (
            <DepartmentSelector
              departments={data.availableDepartments}
              selectedDepartmentId={selectedDeptId || data.departmentId}
              onSelectDepartment={(id) => setSelectedDeptId(id)}
              disabled={isFetchingInitial}
            />
          )}
        </div>
      </div>

      {/* Loading Skeleton */}
      {isFetchingInitial ? (
        <div className="space-y-6">
          <div className="h-[260px] rounded-[2rem] bg-[#3A3B3C] border border-[#4E4F50] animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[340px] rounded-[1.5rem] bg-[#3A3B3C] border border-[#4E4F50] animate-pulse"
              />
            ))}
          </div>
        </div>
      ) : data && data.availableDepartments.length > 0 ? (
        <>
          {/* Top 3 Champion Podium (Image 3 Style) */}
          <DashboardPodium
            overallItems={data.overallXpItems || []}
            categories={data.categories}
            onSelectUser={(item) => setBreakdownItem(item)}
          />

          {/* 4 Multi-Category Columns (Image 2 Style) */}
          <DashboardCategoryColumns 
            categories={data.categories} 
            onSelectUser={(item) => setBreakdownItem(item)}
            onSelectHealthUser={(item) => setHealthDrawerItem(item)}
            onSelectLtcUser={(item) => {
              const ltcCat = data?.categories?.find((c) => c.id === "ltc");
              const fallbackSummary =
                ltcCat?.items?.find((i) => i.dailyLtcSummary)?.dailyLtcSummary;
              const itemWithSummary = item.dailyLtcSummary
                ? item
                : fallbackSummary
                ? { ...item, dailyLtcSummary: fallbackSummary }
                : item;
              setLtcDrawerItem(itemWithSummary);
            }}
            onOpenCategoryRules={(categoryId) => {
              setRulesCategory(categoryId);
              setIsRulesModalOpen(true);
            }}
          />
        </>
      ) : (
        <section className="rounded-[2rem] border border-[#4E4F50] bg-[#3A3B3C] p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-[#252728] border border-[#4E4F50] flex items-center justify-center mx-auto text-[#C7F33C]">
            <Trophy className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-slate-100">
            No Department Assigned
          </h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            You are not currently assigned to any department. Contact your administrator
            to be added to a department to view the leaderboard.
          </p>
        </section>
      )}

      {/* Scoring Rules Explanation Modal */}
      <ScoringRulesModal 
        isOpen={isRulesModalOpen} 
        initialCategory={rulesCategory}
        onClose={() => setIsRulesModalOpen(false)} 
      />

      {/* Score Breakdown Modal */}
      <ScoreBreakdownModal 
        item={breakdownItem} 
        onClose={() => setBreakdownItem(null)} 
      />

      {/* Daily Card Health Drawer */}
      <DailyCardHealthDrawer
        item={healthDrawerItem}
        period={{ month, year }}
        onClose={() => setHealthDrawerItem(null)}
      />

      {/* Daily LTC Drawer */}
      <DailyLtcDrawer
        item={ltcDrawerItem}
        period={{ month, year }}
        onClose={() => setLtcDrawerItem(null)}
      />
    </div>
  );
}
