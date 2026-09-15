"use client";

import React, { useEffect, useRef } from "react";
import { Loader2, Building2 } from "lucide-react";
import type { AccountCardDTO } from "@/lib/contact/account-card-dto";
import { AccountCardRow } from "./AccountCardRow";

interface AccountCardListProps {
  accounts: AccountCardDTO[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  totalAccounts: number;
  selectedAccountId: string | null;
  onSelectAccount: (id: string) => void;
  onRatingChange: (id: string, newRating: number) => void;
  onLoadMore: () => void;
  onRowIntent?: (id: string) => void;
  headerAction?: React.ReactNode;
}

function AccountRowSkeleton() {
  return (
    <div className="w-full bg-[#1E1F21] rounded-2xl px-5 py-3 mb-2.5 flex flex-col md:grid md:grid-cols-[72px_minmax(0,1fr)_170px_120px_100px] items-center gap-4 animate-pulse select-none border border-transparent">
      {/* Col 1: Win Rate % */}
      <div className="flex items-center gap-2 w-full md:w-auto">
        <div className="h-7 w-14 rounded-lg bg-[#2A2B2D]" />
      </div>

      {/* Col 2: Name & Legal Subtitle */}
      <div className="flex flex-col gap-1.5 min-w-0 w-full">
        <div className="h-4 w-36 rounded bg-[#2A2B2D]" />
        <div className="h-3 w-24 rounded bg-[#2A2B2D]/70" />
      </div>

      {/* Col 3: 5 Stars (Desktop only) */}
      <div className="hidden md:flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className="w-4 h-4 rounded-sm bg-[#2A2B2D]" />
        ))}
      </div>

      {/* Col 4: Type (Desktop only) */}
      <div className="hidden md:flex items-center">
        <div className="h-4 w-16 rounded bg-[#2A2B2D]" />
      </div>

      {/* Col 5: Country (Desktop only) */}
      <div className="hidden md:flex items-center justify-end">
        <div className="h-4 w-16 rounded bg-[#2A2B2D]" />
      </div>
    </div>
  );
}

export function AccountCardList({
  accounts,
  isLoading,
  isLoadingMore,
  hasMore,
  totalAccounts,
  selectedAccountId,
  onSelectAccount,
  onRatingChange,
  onLoadMore,
  onRowIntent,
  headerAction,
}: AccountCardListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef(onLoadMore);
  loadMoreRef.current = onLoadMore;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoading) {
          loadMoreRef.current();
        }
      },
      {
        root: containerRef.current,
        rootMargin: "300px",
        threshold: 0,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, isLoading]);

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 overflow-y-auto pb-8 hide-scrollbar select-none pr-1"
    >
      {/* Header matching the image: "ACCOUNT" (Desktop only - hidden on mobile) */}
      <div className="hidden md:flex h-10 items-center justify-between mb-2 px-1 sticky top-0 bg-[#252728] z-10">
        <span className="font-black text-xs uppercase text-slate-100 tracking-wider">
          ACCOUNT
        </span>
        {headerAction && <div>{headerAction}</div>}
      </div>

      {/* Main Content */}
      {isLoading && accounts.length === 0 ? (
        <div className="space-y-2.5">
          <AccountRowSkeleton />
          <AccountRowSkeleton />
          <AccountRowSkeleton />
          <AccountRowSkeleton />
          <AccountRowSkeleton />
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Building2 className="w-12 h-12 text-slate-600 mb-3" />
          <p className="text-sm font-bold text-slate-300">No accounts found</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            Try adjusting your search query, or selecting different type or country filters.
          </p>
        </div>
      ) : (
        <div>
          {accounts.map((account) => (
            <AccountCardRow
              key={account.id}
              account={account}
              isSelected={selectedAccountId === account.id}
              onSelect={onSelectAccount}
              onRatingChange={onRatingChange}
              onIntent={onRowIntent}
            />
          ))}

          {/* Infinite Scroll Sentinel */}
          <div ref={sentinelRef} className="py-4 flex items-center justify-center">
            {isLoadingMore && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 text-[#C7F33C] animate-spin" />
                <span>Loading more accounts...</span>
              </div>
            )}
            {!hasMore && accounts.length > 0 && (
              <span className="text-xs text-slate-500 font-medium">
                All {totalAccounts} accounts loaded
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
