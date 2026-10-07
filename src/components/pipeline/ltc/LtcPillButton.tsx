"use client";

import useSWR, { preload } from "swr";
import { getLtcAccountsAction } from "@/lib/actions/ltc";
import { LtcSummaryResult } from "./ltc-types";
import { Clock } from "lucide-react";

interface LtcPillButtonProps {
  onClick: () => void;
  countOverride?: number;
  className?: string;
}

export function LtcCountBadge({
  countOverride,
  className = "",
}: {
  countOverride?: number;
  className?: string;
}) {
  const { data: ltcData } = useSWR<LtcSummaryResult>(
    countOverride !== undefined ? null : "ltc-accounts-data",
    getLtcAccountsAction,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
    }
  );

  const displayCount = countOverride !== undefined ? countOverride : (ltcData?.totalCount ?? 0);

  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono border tabular-nums select-none ${
        displayCount > 0
          ? "bg-[#C7F33C]/15 border-[#C7F33C]/30 text-[#C7F33C]"
          : "bg-[#252728] border-[#3A3B3C] text-slate-400"
      } ${className}`}
    >
      {displayCount} LTC
    </span>
  );
}

export function LtcPillButton({
  onClick,
  countOverride,
  className = "",
}: LtcPillButtonProps) {
  const { data: ltcData } = useSWR<LtcSummaryResult>(
    countOverride !== undefined ? null : "ltc-accounts-data",
    getLtcAccountsAction,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
    }
  );

  const displayCount = countOverride !== undefined ? countOverride : (ltcData?.totalCount ?? 0);

  const handlePrefetch = () => {
    void preload("ltc-accounts-data", getLtcAccountsAction);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={handlePrefetch}
      onFocus={handlePrefetch}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer select-none tabular-nums ${
        displayCount > 0
          ? "bg-[#C7F33C]/10 border-[#C7F33C]/40 text-[#C7F33C] hover:bg-[#C7F33C]/20 hover:border-[#C7F33C] shadow-sm"
          : "bg-[#252728] border-[#3A3B3C] text-slate-400 hover:text-slate-200 hover:bg-[#3A3B3C]"
      } ${className}`}
      title={`Long-Time Contacts: ${displayCount} accounts pending`}
    >
      <Clock className={`w-3.5 h-3.5 ${displayCount > 0 ? "text-[#C7F33C]" : "text-slate-400"}`} />
      <span>{displayCount} LTC</span>
    </button>
  );
}
