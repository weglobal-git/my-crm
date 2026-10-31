"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import useSWR, { preload } from "swr";
import { useSession } from "next-auth/react";
import { Trophy } from "lucide-react";
import {
  createScopeToken,
  dashboardLeaderboardKey,
  type ScopeActorInfo,
} from "@/lib/dashboard/dashboard-keys";
import {
  getDashboardLeaderboardAction,
  getLeaderboardWinnerSummaryAction,
} from "@/lib/actions/dashboard";
import { getBangkokMonth, getBangkokYear } from "@/lib/dashboard/sales-overview";
import { LeaderboardDrawer } from "./LeaderboardDrawer";

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatNavbarXp(score: number): string {
  const rounded = Math.round(score * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toLocaleString() : rounded.toFixed(1);
}

export function LeaderboardHeaderWidget() {
  const { data: session } = useSession();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentMonth = getBangkokMonth();
  const currentYear = getBangkokYear();
  const [drawerMonth, setDrawerMonth] = useState<number>(currentMonth);
  const [drawerYear, setDrawerYear] = useState<number>(currentYear);

  const actor: ScopeActorInfo = useMemo(() => {
    if (!session?.user) {
      return { id: "anon", role: "USER", departments: [] };
    }
    return {
      id: session.user.id,
      role: session.user.role || "USER",
      departments: Array.isArray(session.user.departments)
        ? session.user.departments.filter((d): d is string => typeof d === "string")
        : [],
    };
  }, [session]);

  const scope = useMemo(() => createScopeToken(actor), [actor]);

  // Lightweight Winner Key (< 200B payload for closed navbar trophy indicator)
  const winnerKey = useMemo(
    () =>
      `dashboard:leaderboard:winner:${scope}:${selectedDeptId || "DEFAULT"}:${currentYear}:${currentMonth}`,
    [scope, selectedDeptId, currentMonth, currentYear]
  );

  const { data: winnerData, isLoading: isWidgetLoading, mutate: mutateWinner } = useSWR(
    session?.user?.id ? winnerKey : null,
    async () => {
      return await getLeaderboardWinnerSummaryAction({
        departmentId: selectedDeptId,
        month: currentMonth,
        year: currentYear,
      });
    },
    {
      revalidateOnFocus: true,
      focusThrottleInterval: 60_000,
      keepPreviousData: true,
      dedupingInterval: 30_000,
    }
  );

  // Full Drawer Key (only fetched on demand when drawer opens or hover-preloaded)
  const drawerKey = useMemo(
    () =>
      dashboardLeaderboardKey(scope, {
        departmentId: selectedDeptId,
        month: drawerMonth,
        year: drawerYear,
      }),
    [scope, selectedDeptId, drawerMonth, drawerYear]
  );

  const { data: drawerData, error, isLoading, mutate: mutateDrawer } = useSWR(
    session?.user?.id && isDrawerOpen ? drawerKey : null,
    async () => {
      return await getDashboardLeaderboardAction({
        departmentId: selectedDeptId,
        month: drawerMonth,
        year: drawerYear,
      });
    },
    {
      revalidateOnFocus: true,
      focusThrottleInterval: 30_000,
      keepPreviousData: true,
      dedupingInterval: 15_000,
    }
  );

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isDrawerOpen || !session?.user?.id) return;
    void mutateWinner();
    void mutateDrawer();
  }, [isDrawerOpen, mutateWinner, mutateDrawer, session?.user?.id]);

  if (!session?.user) return null;

  const isCurrentPeriod = drawerMonth === currentMonth && drawerYear === currentYear;
  const drawerRank1 =
    isCurrentPeriod && drawerData
      ? drawerData.overallPodium?.rank1 || drawerData.overallXpItems?.[0] || null
      : null;
  const rank1 = drawerRank1 || winnerData?.rank1 || null;

  const handleHoverStart = () => {
    if (!session?.user?.id || isDrawerOpen) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      void preload(drawerKey, () =>
        getDashboardLeaderboardAction({
          departmentId: selectedDeptId,
          month: drawerMonth,
          year: drawerYear,
        })
      );
    }, 120);
  };

  const handleHoverEnd = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsDrawerOpen(true)}
        onMouseEnter={handleHoverStart}
        onMouseLeave={handleHoverEnd}
        className="group flex items-center p-1 rounded-full hover:bg-[#3A3B3C]/50 transition-colors cursor-pointer select-none text-left"
        title="Leaderboard: Click to view full standings"
        aria-label="Open leaderboard"
      >
        {!rank1 && isWidgetLoading ? (
          <div className="w-9 h-9 rounded-full bg-[#3A3B3C]/50 border border-[#4E4F50]/40 flex items-center justify-center animate-pulse">
            <Trophy className="w-4 h-4 text-[#C7F33C]" />
          </div>
        ) : rank1 ? (
          <div className="flex items-center gap-2 pr-1.5">
            {/* Winner Avatar (w-9, flat border per design system) */}
            <div className="w-9 h-9 rounded-full border-2 border-[#C7F33C] bg-[#252728] overflow-hidden flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
              {rank1.image ? (
                <img
                  src={rank1.image}
                  alt={rank1.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs font-black text-[#C7F33C]">
                  {getInitials(rank1.name)}
                </span>
              )}
            </div>

            {/* Leader Badge & XP */}
            <div className="flex flex-col items-start gap-0.5">
              <span className="inline-flex items-center text-xs font-mono font-bold text-[#C7F33C] leading-none">
                Leader
              </span>
              <span className="text-xs font-mono font-bold text-[#C7F33C] leading-none">
                {formatNavbarXp(rank1.score)} XP
              </span>
            </div>
          </div>
        ) : (
          <div className="w-9 h-9 rounded-full bg-[#3A3B3C]/50 hover:bg-[#3A3B3C] border border-[#4E4F50]/40 flex items-center justify-center transition-colors">
            <Trophy className="w-4 h-4 text-[#C7F33C]" />
          </div>
        )}
      </button>

      {/* Slide-over Leaderboard Drawer */}
      <LeaderboardDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        data={drawerData}
        isLoading={isLoading}
        error={error}
        selectedDeptId={selectedDeptId ?? drawerData?.departmentId ?? null}
        onSelectDepartment={(id) => setSelectedDeptId(id)}
        currentMonth={currentMonth}
        currentYear={currentYear}
        selectedMonth={drawerMonth}
        selectedYear={drawerYear}
        onChangePeriod={(m, y) => {
          setDrawerMonth(m);
          setDrawerYear(y);
        }}
      />
    </>
  );
}
