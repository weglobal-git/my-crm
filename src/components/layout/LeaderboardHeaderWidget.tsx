"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { Trophy } from "lucide-react";
import {
  createScopeToken,
  dashboardLeaderboardKey,
  type ScopeActorInfo,
} from "@/lib/dashboard/dashboard-keys";
import { getDashboardLeaderboardAction } from "@/lib/actions/dashboard";
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

  const month = getBangkokMonth();
  const year = getBangkokYear();

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

  const leaderboardKey = useMemo(
    () =>
      dashboardLeaderboardKey(scope, {
        departmentId: selectedDeptId,
        month,
        year,
      }),
    [scope, selectedDeptId, month, year]
  );

  const { data, error, isLoading } = useSWR(
    session?.user?.id ? leaderboardKey : null,
    async () => {
      return await getDashboardLeaderboardAction({
        departmentId: selectedDeptId,
        month,
        year,
      });
    },
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
      dedupingInterval: 10000,
    }
  );

  if (!session?.user) return null;

  // Winner (Rank 1) from overall ranking
  const podium = data?.overallPodium;
  const rank1 = podium?.rank1 || data?.overallXpItems?.[0] || null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsDrawerOpen(true)}
        className="group flex items-center p-1 rounded-full hover:bg-[#3A3B3C]/50 transition-colors cursor-pointer select-none text-left"
        title="Leaderboard: Click to view full standings"
        aria-label="Open leaderboard"
      >
        {isLoading && !data ? (
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
        data={data}
        isLoading={isLoading}
        error={error}
        selectedDeptId={selectedDeptId ?? data?.departmentId ?? null}
        onSelectDepartment={(id) => setSelectedDeptId(id)}
        currentMonth={month}
        currentYear={year}
      />
    </>
  );
}
