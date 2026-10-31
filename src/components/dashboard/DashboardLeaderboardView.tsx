"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Trophy, AlertCircle, Sparkles } from "lucide-react";
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
import {
  ScoreBreakdownModal,
  type DrilldownCategoryId,
} from "./ScoreBreakdownModal";
import { DailyCardHealthDrawer } from "./DailyCardHealthDrawer";
import {
  DailyLtcDrawer,
  type DisciplineDrawerTab,
} from "./DailyLtcDrawer";
import { CategoryDetailDrawer } from "./CategoryDetailDrawer";
import {
  LeaderboardAnalyseModal,
  type AnalyseViewMode,
} from "./LeaderboardAnalyseModal";
import { canUserInspectAnalyseTarget } from "@/lib/dashboard/leaderboard-score-analysis";

type SubDrawerEntry =
  | { kind: "breakdown"; item: LeaderboardItem }
  | { kind: "health"; item: LeaderboardItem }
  | { kind: "discipline"; item: LeaderboardItem; initialTab: DisciplineDrawerTab }
  | { kind: "velocity"; item: LeaderboardItem }
  | { kind: "outcome"; item: LeaderboardItem }
  | { kind: "analyse"; mode: AnalyseViewMode; userId: string | null };

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
  const [subDrawerStack, setSubDrawerStack] = useState<SubDrawerEntry[]>([]);

  const activeSubDrawer =
    subDrawerStack.length > 0 ? subDrawerStack[subDrawerStack.length - 1] : null;
  const pushSubDrawer = (entry: SubDrawerEntry) => {
    setSubDrawerStack((prev) => [...prev, entry]);
  };
  const popSubDrawer = () => {
    setSubDrawerStack((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
  };

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
  const overallItems = data?.overallXpItems || [];
  const canAnalyseAll = Boolean(
    data?.canAnalyseDepartment ??
      (resolvedActor.role === "ADMIN" || resolvedActor.role === "MANAGEMENT")
  );
  const selfItem = overallItems.find((i) => i.isCurrentUser) || null;
  const canShowTopAnalyseButton = canAnalyseAll
    ? overallItems.length > 0
    : Boolean(selfItem);

  const resolveFullItem = (target: LeaderboardItem): LeaderboardItem => {
    const overallMatch = overallItems.find((i) => i.userId === target.userId);
    const ltcCat = data?.categories?.find(
      (c) => c.id === "clean_ltc" || c.id === "ltc"
    );
    const fallbackLtcSummary =
      ltcCat?.items?.find((i) => i.dailyLtcSummary)?.dailyLtcSummary;

    return {
      ...overallMatch,
      ...target,
      breakdown: target.breakdown ?? overallMatch?.breakdown,
      dailyHealthSummary:
        target.dailyHealthSummary ?? overallMatch?.dailyHealthSummary,
      dailyLtcSummary:
        target.dailyLtcSummary ??
        overallMatch?.dailyLtcSummary ??
        fallbackLtcSummary,
      categoryDetails: target.categoryDetails ?? overallMatch?.categoryDetails,
    };
  };

  const handleOpenCategoryDetail = (
    categoryId: DrilldownCategoryId,
    target: LeaderboardItem,
    initialDisciplineTab: DisciplineDrawerTab = "discipline"
  ) => {
    const enriched = resolveFullItem(target);
    if (categoryId === "card_health") {
      pushSubDrawer({ kind: "health", item: enriched });
    } else if (categoryId === "clean_ltc") {
      pushSubDrawer({
        kind: "discipline",
        item: enriched,
        initialTab: initialDisciplineTab,
      });
    } else if (categoryId === "velocity") {
      pushSubDrawer({ kind: "velocity", item: enriched });
    } else {
      pushSubDrawer({ kind: "outcome", item: enriched });
    }
  };

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

        {/* Right Header: Analyse Button & Department Switcher */}
        <div className="flex items-center gap-2.5">
          {canShowTopAnalyseButton && (
            <button
              type="button"
              onClick={() =>
                pushSubDrawer(
                  canAnalyseAll
                    ? {
                        kind: "analyse",
                        mode: "team",
                        userId:
                          selfItem?.userId ?? overallItems[0]?.userId ?? null,
                      }
                    : {
                        kind: "analyse",
                        mode: "individual",
                        userId: selfItem?.userId ?? null,
                      }
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[#C7F33C]/15 border border-[#C7F33C]/45 text-[#C7F33C] hover:bg-[#C7F33C] hover:text-black transition-all cursor-pointer"
              title={
                canAnalyseAll
                  ? "Analyse department team summary & member scores in Thai"
                  : "Explain your score and formula in Thai"
              }
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Analyse</span>
            </button>
          )}
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
            onSelectUser={(item, metricId) => {
              if (
                metricId === "card_health" ||
                metricId === "clean_ltc" ||
                metricId === "velocity" ||
                metricId === "outcome"
              ) {
                handleOpenCategoryDetail(metricId, item);
              } else {
                pushSubDrawer({
                  kind: "breakdown",
                  item: resolveFullItem(item),
                });
              }
            }}
          />

          {/* 4 Multi-Category Columns (Image 2 Style) */}
          <DashboardCategoryColumns 
            categories={data.categories}
            canAnalyseAll={canAnalyseAll}
            onAnalyseUser={(item) =>
              pushSubDrawer({
                kind: "analyse",
                mode: "individual",
                userId: item.userId,
              })
            }
            onSelectUser={(item) =>
              pushSubDrawer({
                kind: "breakdown",
                item: resolveFullItem(item),
              })
            }
            onSelectHealthUser={(item) =>
              handleOpenCategoryDetail("card_health", item)
            }
            onSelectDisciplineUser={(item, tab) =>
              handleOpenCategoryDetail("clean_ltc", item, tab ?? "discipline")
            }
            onSelectVelocityUser={(item) =>
              handleOpenCategoryDetail("velocity", item)
            }
            onSelectOutcomeUser={(item) =>
              handleOpenCategoryDetail("outcome", item)
            }
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

      {/* Active Sub-Window (Only top of stack renders; "Back" returns to previous view) */}
      {activeSubDrawer?.kind === "breakdown" && (
        <ScoreBreakdownModal
          item={activeSubDrawer.item}
          onClose={popSubDrawer}
          onSelectCategory={(categoryId, target) =>
            handleOpenCategoryDetail(categoryId, target)
          }
          onOpenAnalyse={
            canUserInspectAnalyseTarget(activeSubDrawer.item, canAnalyseAll)
              ? (target) =>
                  pushSubDrawer({
                    kind: "analyse",
                    mode: "individual",
                    userId: target.userId,
                  })
              : undefined
          }
        />
      )}

      {activeSubDrawer?.kind === "health" && (
        <DailyCardHealthDrawer
          item={activeSubDrawer.item}
          period={{ month, year }}
          onClose={popSubDrawer}
          onOpenAnalyse={
            canUserInspectAnalyseTarget(activeSubDrawer.item, canAnalyseAll)
              ? (target) =>
                  pushSubDrawer({
                    kind: "analyse",
                    mode: "individual",
                    userId: target.userId,
                  })
              : undefined
          }
        />
      )}

      {activeSubDrawer?.kind === "discipline" && (
        <DailyLtcDrawer
          item={activeSubDrawer.item}
          period={{ month, year }}
          initialTab={activeSubDrawer.initialTab}
          onClose={popSubDrawer}
          onOpenAnalyse={
            canUserInspectAnalyseTarget(activeSubDrawer.item, canAnalyseAll)
              ? (target) =>
                  pushSubDrawer({
                    kind: "analyse",
                    mode: "individual",
                    userId: target.userId,
                  })
              : undefined
          }
        />
      )}

      {(activeSubDrawer?.kind === "velocity" ||
        activeSubDrawer?.kind === "outcome") && (
        <CategoryDetailDrawer
          item={activeSubDrawer.item}
          mode={activeSubDrawer.kind}
          period={{ month, year }}
          onClose={popSubDrawer}
          onOpenAnalyse={
            canUserInspectAnalyseTarget(activeSubDrawer.item, canAnalyseAll)
              ? (target) =>
                  pushSubDrawer({
                    kind: "analyse",
                    mode: "individual",
                    userId: target.userId,
                  })
              : undefined
          }
        />
      )}

      <LeaderboardAnalyseModal
        isOpen={activeSubDrawer?.kind === "analyse"}
        onClose={popSubDrawer}
        items={overallItems}
        initialUserId={
          activeSubDrawer?.kind === "analyse" ? activeSubDrawer.userId : null
        }
        initialMode={
          activeSubDrawer?.kind === "analyse"
            ? activeSubDrawer.mode
            : "individual"
        }
        canAnalyseAll={canAnalyseAll}
        hasSalesAccess={data?.hasSalesAccess}
        month={month}
        year={year}
        departmentName={data?.departmentName}
      />
    </div>
  );
}
