"use client";

import { useState, useMemo, useEffect } from "react";
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

export function LeaderboardHeaderWidget() {
  const { data: session } = useSession();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);

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

  // Lightweight Widget Key for navbar trophy winner display
  const winnerKey = useMemo(
    () =>
      `leaderboard:winner:${scope}:${selectedDeptId || "default"}:${currentMonth}:${currentYear}`,
    [scope, selectedDeptId, currentMonth, currentYear]
  );

  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    // Schedule fetch during true browser idle periods so it never competes with
    // initial paint, hydration, or Kanban card loading.
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const handle = (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(
        () => setIsReady(true),
        { timeout: 3500 }
      );
      return () => {
        if ("cancelIdleCallback" in window) {
          (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(handle);
        }
      };
    } else {
      const timer = setTimeout(() => setIsReady(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const { data: winnerSummary, isLoading: isWinnerLoading } = useSWR(
    session?.user?.id && isReady ? winnerKey : null,
    async () => {
      return await getLeaderboardWinnerSummaryAction({
        departmentId: selectedDeptId,
        month: currentMonth,
        year: currentYear,
      });
    },
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
      dedupingInterval: 30000,
    }
  );

  // Drawer Key (only fetched when drawer is open or prewarmed on hover)
  const drawerKey = useMemo(
    () =>
      dashboardLeaderboardKey(scope, {
        departmentId: selectedDeptId,
        month: drawerMonth,
        year: drawerYear,
      }),
    [scope, selectedDeptId, drawerMonth, drawerYear]
  );

  const { data: drawerData, error, isLoading } = useSWR(
    session?.user?.id && isDrawerOpen ? drawerKey : null,
    async () => {
      return await getDashboardLeaderboardAction({
        departmentId: selectedDeptId,
        month: drawerMonth,
        year: drawerYear,
      });
    },
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
      dedupingInterval: 10000,
    }
  );

  const activeDrawerData = drawerData || null;

  if (!session?.user) return null;

  const rank1 = winnerSummary?.rank1 || null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsDrawerOpen(true)}
        onMouseEnter={() => {
          void preload(drawerKey, () =>
            getDashboardLeaderboardAction({
              departmentId: selectedDeptId,
              month: drawerMonth,
              year: drawerYear,
            })
          );
        }}
        className="group flex items-center p-1 rounded-full hover:bg-[#3A3B3C]/50 transition-colors cursor-pointer select-none text-left"
        title="Leaderboard: Click to view full standings"
        aria-label="Open leaderboard"
      >
        {!rank1 && isWinnerLoading ? (
          <div className="w-9 h-9 rounded-full bg-[#3A3B3C]/50 border border-[#4E4F50]/40 flex items-center justify-center animate-pulse">
            <Trophy className="w-4 h-4 text-[#C7F33C]" />
          </div>
        ) : rank1 ? (
          <div className="flex items-center gap-2 pr-1.5">
            {/* Winner Avatar (w-9) */}
            <div className="w-9 h-9 rounded-full border-2 border-[#C7F33C] bg-[#252728] overflow-hidden flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105">
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
                {rank1.score.toLocaleString()} XP
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
        data={activeDrawerData}
        isLoading={isLoading}
        error={error}
        selectedDeptId={selectedDeptId ?? activeDrawerData?.departmentId ?? null}
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
