"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { 
  X, 
  Search, 
  Clock, 
  Loader2, 
  RotateCcw,
  CheckCircle2
} from "lucide-react";
import { 
  getLtcAccountsAction, 
  unqualifyAccountAction, 
  createLtcDealAction 
} from "@/lib/actions/ltc";
import { LtcSummaryResult } from "./ltc-types";
import { LtcAccountRow } from "./LtcAccountRow";
import { useDialog } from "@/providers/DialogProvider";
import { PipelineStage } from "@prisma/client";

interface LtcDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  stages: PipelineStage[];
  onCountUpdate?: (count: number) => void;
}

export function LtcDrawer({
  isOpen,
  onClose,
  stages,
  onCountUpdate,
}: LtcDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const { toast } = useDialog();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Leftmost stage in the pipeline
  const firstStage = useMemo(() => {
    if (!stages || stages.length === 0) return null;
    return [...stages].sort((a, b) => a.order - b.order)[0];
  }, [stages]);

  // Load LTC accounts with shared SWR cache (hydrated by toolbar badge for 0ms drawer open)
  const {
    data: ltcData,
    isLoading: isSwrLoading,
    error,
    mutate: mutateLtc,
  } = useSWR<LtcSummaryResult>(
    "ltc-accounts-data",
    getLtcAccountsAction,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
      onSuccess: (data) => {
        if (onCountUpdate) {
          onCountUpdate(data.totalCount);
        }
      },
    }
  );

  const isLoading = isSwrLoading && !ltcData;

  // Click outside and Escape key listeners
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Filter accounts by search query
  const filteredAccounts = useMemo(() => {
    if (!ltcData?.accounts) return [];
    if (!searchQuery.trim()) return ltcData.accounts;

    const q = searchQuery.toLowerCase().trim();
    return ltcData.accounts.filter((acc) => {
      const matchCompany =
        acc.name.toLowerCase().includes(q) ||
        (acc.displayName && acc.displayName.toLowerCase().includes(q));
      const matchContact = acc.contacts.some(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q))
      );
      return matchCompany || matchContact;
    });
  }, [ltcData?.accounts, searchQuery]);

  // Handle Unqualify Action
  const handleUnqualify = async (companyId: string) => {
    const targetAccount = ltcData?.accounts.find((a) => a.id === companyId);
    const targetName = targetAccount?.displayName || targetAccount?.name || "Account";

    // 1. Optimistic removal from LTC list
    await mutateLtc(
      (current) => {
        if (!current) return current;
        const nextAccounts = current.accounts.filter((a) => a.id !== companyId);
        const nextCount = nextAccounts.length;
        if (onCountUpdate) onCountUpdate(nextCount);
        return {
          totalCount: nextCount,
          accounts: nextAccounts,
        };
      },
      false
    );

    // 2. Server mutation
    try {
      await unqualifyAccountAction(companyId);
      toast({
        title: "Account Disqualified",
        description: `Removed ${targetName} from LTC list`,
        type: "success",
      });
      // Revalidate background count badge
      void globalMutate("ltc-count");
    } catch (err) {
      // Rollback on failure
      void mutateLtc();
      toast({
        title: "Action Failed",
        description: err instanceof Error ? err.message : "Could not disqualify account",
        type: "error",
      });
    }
  };

  // Handle Make a Card Action
  const handleMakeCard = async (companyId: string) => {
    const targetAccount = ltcData?.accounts.find((a) => a.id === companyId);
    const targetName = targetAccount?.displayName || targetAccount?.name || "Account";

    // 1. Optimistic removal from LTC list
    await mutateLtc(
      (current) => {
        if (!current) return current;
        const nextAccounts = current.accounts.filter((a) => a.id !== companyId);
        const nextCount = nextAccounts.length;
        if (onCountUpdate) onCountUpdate(nextCount);
        return {
          totalCount: nextCount,
          accounts: nextAccounts,
        };
      },
      false
    );

    // 2. Server mutation
    try {
      const res = await createLtcDealAction(companyId, firstStage?.id);
      const createdDeal = res.deal;

      // Optimistically inject deal into pipeline board cache
      if (createdDeal && typeof createdDeal === "object") {
        void globalMutate(
          (key) => Array.isArray(key) && key[0] === "pipeline-deals",
          (currentDeals: unknown) => {
            if (!Array.isArray(currentDeals)) return currentDeals;
            return [createdDeal, ...currentDeals];
          },
          true
        );
      }

      toast({
        title: "Deal Created",
        description: `Created follow-up card in ${firstStage?.name || "first column"} for ${targetName}`,
        type: "success",
      });

      // Revalidate background count badge
      void globalMutate("ltc-count");
    } catch (err) {
      // Rollback on failure
      void mutateLtc();
      toast({
        title: "Creation Failed",
        description: err instanceof Error ? err.message : "Could not create deal card",
        type: "error",
      });
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[104] transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Floating Drawer Card */}
      <div className="fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[500px] md:max-w-[calc(100vw-32px)] z-[105] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right">
        <div
          ref={drawerRef}
          className="w-full bg-[#252728] border-0 md:border border-[#3A3B3C] flex flex-col h-full rounded-none md:rounded-2xl overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1C1C1D] shrink-0 bg-[#252728]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-[#C7F33C]/10 border border-[#C7F33C]/30 flex items-center justify-center shrink-0">
                <Clock className="w-3.5 h-3.5 text-[#C7F33C]" />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100">
                  Long-Time Contacts (LTC)
                </h2>
                {ltcData && (
                  <span className="px-2 py-0.5 rounded-full bg-[#C7F33C]/15 text-[#C7F33C] border border-[#C7F33C]/30 text-[10px] font-bold font-mono tabular-nums">
                    {ltcData.totalCount} Pending
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-[#3A3B3C] rounded-full transition-colors text-slate-400 hover:text-slate-200 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Subheader: Clean Search & Minimal Refresh */}
          <div className="p-3 border-b border-[#1C1C1D] bg-[#222426]/60 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search accounts..."
                className="w-full h-8 pl-8 pr-7 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#C7F33C] transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => void mutateLtc()}
              className="h-8 w-8 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C] text-slate-400 hover:text-slate-200 hover:bg-[#3A3B3C] transition-colors flex items-center justify-center shrink-0 cursor-pointer"
              title="Refresh"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-[#C7F33C]" : ""}`} />
            </button>
          </div>

          {/* Scrollable Accounts List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1.5">
            {isLoading && !ltcData ? (
              <div className="py-20 flex flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin text-[#C7F33C]" />
                <span className="text-xs">Loading accounts...</span>
              </div>
            ) : error ? (
              <div className="py-16 text-center text-xs text-slate-400 space-y-2">
                <div>Failed to load accounts</div>
                <button
                  type="button"
                  onClick={() => void mutateLtc()}
                  className="px-3 py-1 rounded-md bg-[#3A3B3C] text-slate-200 hover:bg-[#4E4F50] transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-center gap-2.5 text-slate-400">
                <div className="w-10 h-10 rounded-full bg-[#C7F33C]/10 border border-[#C7F33C]/20 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-[#C7F33C]" />
                </div>
                <div className="space-y-0.5">
                  <div className="font-semibold text-slate-200 text-xs">
                    {searchQuery ? "No matching accounts" : "All caught up"}
                  </div>
                  <p className="text-[11px] text-slate-400 max-w-xs">
                    {searchQuery
                      ? "Try searching with a different term"
                      : "No qualified accounts require follow-up."}
                  </p>
                </div>
              </div>
            ) : (
              filteredAccounts.map((account) => (
                <LtcAccountRow
                  key={account.id}
                  item={account}
                  isExpanded={expandedIds.has(account.id)}
                  onToggleExpand={() => toggleExpand(account.id)}
                  onUnqualify={handleUnqualify}
                  onMakeCard={handleMakeCard}
                />
              ))
            )}
          </div>

          {/* Footer: Concise Follow-Up Criteria Legend */}
          <div className="p-3 border-t border-[#1C1C1D] bg-[#222426]/90 shrink-0 space-y-1.5 select-none">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-semibold text-slate-300">Follow-Up Criteria</span>
              <span className="text-[10px] text-slate-500">Sales value &amp; frequency</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
              <div className="p-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]/50 flex flex-col justify-between">
                <span className="text-[#C7F33C] font-bold">Tier 1 &gt; 30d</span>
                <span className="text-slate-400 text-[9px] mt-0.5">&ge; ฿500k or &ge; 3 orders</span>
              </div>
              <div className="p-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]/50 flex flex-col justify-between">
                <span className="text-slate-200 font-semibold">Tier 2 &gt; 60d</span>
                <span className="text-slate-400 text-[9px] mt-0.5">฿100k–500k / 1–2 orders</span>
              </div>
              <div className="p-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]/50 flex flex-col justify-between">
                <span className="text-slate-400 font-medium">Tier 3 &gt; 90d</span>
                <span className="text-slate-500 text-[9px] mt-0.5">&lt; ฿100k or 0 orders</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
