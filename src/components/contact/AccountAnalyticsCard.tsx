"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { 
  Building2, 
  Loader2, 
  Users, 
  User 
} from "lucide-react";
import { AccountOverviewResult } from "@/lib/actions/contact";
import { updateCompanyBusinessProfile } from "@/lib/actions/account-ai";

interface AccountAnalyticsCardProps {
  overview: AccountOverviewResult | null;
  isLoading?: boolean;
  companyId?: string | null;
  companyType?: string;
  country?: string | null;
  onOpenAIAnalysis?: () => void;
  onBusinessSummaryUpdated?: (summary: string) => void;
}

const SKELETON_PRODUCTS = [
  { name: "product A", share: "65.92%" },
  { name: "product B", share: "12.23%" },
  { name: "product C", share: "5.52%" },
  { name: "product D", share: "2.34%" },
  { name: "product E", share: "1.12%" },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function AccountAnalyticsCard({ 
  overview, 
  isLoading,
  companyId,
  companyType: _companyType = "CUSTOMER",
  onBusinessSummaryUpdated,
}: AccountAnalyticsCardProps) {
  void _companyType;
  const metrics = overview?.metrics;
  const rawContributors = overview?.topContributors || [];
  const topThreeContributors = rawContributors.slice(0, 3);

  // Business Context State with auto-saving
  const serverSummary = overview?.businessSummary || "";
  const [businessSummary, setBusinessSummary] = useState(serverSummary);
  const [prevCompanyId, setPrevCompanyId] = useState(companyId);
  const [prevServerSummary, setPrevServerSummary] = useState(serverSummary);
  const [lastSaved, setLastSaved] = useState(serverSummary);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  if (companyId !== prevCompanyId || serverSummary !== prevServerSummary) {
    setPrevCompanyId(companyId);
    setPrevServerSummary(serverSummary);
    setBusinessSummary(serverSummary);
    setLastSaved(serverSummary);
  }

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const saveContent = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (trimmed === lastSaved) return;
    const targetCompanyId = companyId || overview?.company?.id;
    if (!targetCompanyId) return;

    setIsSaving(true);
    try {
      await updateCompanyBusinessProfile(targetCompanyId, trimmed);
      setLastSaved(trimmed);
      onBusinessSummaryUpdated?.(trimmed);
    } catch (err: unknown) {
      console.error("Failed to auto-save business context:", err);
    } finally {
      setIsSaving(false);
    }
  }, [companyId, overview?.company?.id, onBusinessSummaryUpdated, lastSaved]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setBusinessSummary(newVal);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      void saveContent(newVal);
    }, 800);
  };

  const handleBlur = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    void saveContent(businessSummary);
  };

  const isDataReady = !isLoading && !!overview && (!companyId || overview.company?.id === companyId);

  const winRate = isDataReady ? (metrics?.winRate ?? 0) : 0;
  const wonCount = isDataReady ? (metrics?.wonDealsCount ?? 0) : 0;
  const lostCount = isDataReady ? (metrics?.lostDealsCount ?? 0) : 0;
  const totalCompleted = wonCount + lostCount;
  const totalDeals = isDataReady ? (overview?.deals?.length ?? totalCompleted) : 0;
  const totalWonValue = isDataReady ? (metrics?.totalWonValue ?? 0) : 0;

  // SVG Donut metrics - Enlarged to 80px radius for prominence
  const radius = 80;
  const circumference = 2 * Math.PI * radius; // ~502.65
  const strokeDashoffset = isDataReady
    ? circumference - (circumference * Math.min(Math.max(winRate, 0), 100)) / 100
    : circumference;

  return (
    <div className="mb-4 shrink-0 transition-all border-0">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* COLUMN 1: Enlarged Project Success Rate Donut (4 cols) */}
        <div className="lg:col-span-4 flex items-center justify-center py-2">
          <div className="relative w-60 h-60 sm:w-56 sm:h-56 max-w-full aspect-square flex items-center justify-center">
            <svg className="w-full h-full" viewBox="0 0 200 200">
              {/* Background Track */}
              <circle
                cx="100"
                cy="100"
                r={radius}
                stroke="#2E3033"
                strokeWidth="16"
                fill="transparent"
              />
              {/* Animated Lime Progress */}
              <circle
                cx="100"
                cy="100"
                r={radius}
                stroke="#C7F33C"
                strokeWidth="16"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-700 ease-out"
                transform="rotate(-90 100 100)"
              />
            </svg>

            {/* Inside Donut Center Values */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none pointer-events-none px-3">
              {isDataReady ? (
                <>
                  <span className="text-3xl sm:text-4xl font-extrabold text-slate-100 tracking-tight leading-none">
                    {winRate}%
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-slate-200 mt-1.5">
                    {wonCount}/{totalDeals > 0 ? totalDeals : totalCompleted}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">
                    success rate
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-[#C7F33C] mt-1.5 truncate max-w-full">
                    {totalWonValue.toLocaleString()} THB
                  </span>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center animate-pulse gap-1.5">
                  <div className="h-8 w-16 bg-[#2E3033] rounded-lg" />
                  <div className="h-3.5 w-12 bg-[#2E3033] rounded mt-0.5" />
                  <span className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">
                    success rate
                  </span>
                  <div className="h-3.5 w-20 bg-[#2E3033] rounded mt-0.5" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* COLUMN 2: Top 5 Products + Horizontal Top Contributors Underneath (4 cols) */}
        <div className="lg:col-span-4 flex flex-col justify-between">
          {/* Top 5 Products */}
          <div className="space-y-2 py-0.5">
            {SKELETON_PRODUCTS.map((prod) => (
              <div key={prod.name} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-lg shrink-0 shadow-none transition-colors ${isDataReady ? "bg-[#C7F33C]" : "bg-[#2E3033] animate-pulse"}`} />
                <div className="flex flex-col min-w-0 flex-1">
                  {isDataReady ? (
                    <>
                      <span className="text-sm font-medium text-slate-200 truncate">
                        {prod.name}
                      </span>
                      <span className="text-[11px] font-bold text-slate-100">
                        {prod.share}
                      </span>
                    </>
                  ) : (
                    <div className="space-y-1 animate-pulse">
                      <div className="h-3.5 w-24 bg-[#2E3033] rounded" />
                      <div className="h-2.5 w-12 bg-[#2E3033] rounded" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Underneath Top 5 Products: Horizontal Top Contributors (Max 3) */}
          <div className="w-full pt-2.5 mt-2 border-t border-[#3A3B3C]/50">
            <div className="flex items-center justify-between mb-1.5 px-0.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                <Users className="w-3 h-3 text-[#C7F33C]" />
                <span>Top Contributors</span>
              </span>
              {isDataReady && topThreeContributors.length > 0 && (
                <span className="text-[10px] text-slate-500 font-medium">
                  {topThreeContributors.length} active
                </span>
              )}
            </div>

            {!isDataReady ? (
              <div className="grid grid-cols-3 gap-1.5 min-h-10 w-full animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-1 px-1.5 rounded-xl flex items-center gap-1.5 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-[#2E3033] shrink-0" />
                    <div className="space-y-1 flex-1">
                      <div className="h-2.5 w-10 bg-[#2E3033] rounded" />
                      <div className="h-2 w-6 bg-[#2E3033] rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : topThreeContributors.length > 0 ? (
              <div className="grid grid-cols-3 gap-1.5 min-h-10 w-full">
                {topThreeContributors.map((c) => (
                  <div
                    key={c.userId || c.name}
                    className="p-1 px-1.5 rounded-xl flex items-center gap-1.5 min-w-0 shadow-none"
                    title={`${c.name} (${c.share})`}
                  >
                    <div className="w-6 h-6 rounded-full bg-[#252728] border border-[#4E4F50] shrink-0 overflow-hidden flex items-center justify-center">
                      {c.image ? (
                        <img src={c.image} alt={c.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[9px] font-bold text-[#C7F33C]">
                          {getInitials(c.name)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1 leading-tight">
                      <span className="text-[11px] font-medium text-slate-200 truncate">
                        {c.name}
                      </span>
                      <span className="text-[10px] font-bold text-[#C7F33C]">
                        {c.share}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-1 flex min-h-10 items-center justify-center gap-1.5 text-slate-500 text-[11px]">
                <User className="w-3.5 h-3.5 text-slate-600" />
                <span>No team activity recorded yet</span>
              </div>
            )}
          </div>
        </div>

        {/* COLUMN 3: Company Profile & Business Context (Minimalist, transparent background, auto-save) (4 cols) */}
        <div className="lg:col-span-4 flex flex-col justify-start p-1">
          {/* Minimalist Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#C7F33C]" />
              <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                Company Profile & Context
              </span>
            </div>
            {isSaving && (
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin text-[#C7F33C]" />
                <span>Saving...</span>
              </span>
            )}
          </div>

          {/* Minimal Inline Textarea (Directly editable without edit/save buttons) */}
          <div className="flex-1 flex flex-col">
            <textarea
              value={isDataReady ? businessSummary : ""}
              onChange={handleChange}
              onBlur={handleBlur}
              rows={7}
              placeholder={
                !isDataReady
                  ? "กำลังโหลดข้อมูล..."
                  : "พิมพ์ข้อมูลลักษณะธุรกิจ สินค้า หรือบริบทสำคัญของลูกค้ารายนี้ได้ทันที..."
              }
              disabled={!isDataReady}
              className={`w-full flex-1 bg-transparent border-0 p-0 text-sm text-slate-300 placeholder:text-slate-600 leading-relaxed resize-none focus:outline-none focus:text-slate-100 transition-colors font-sans selection:bg-[#C7F33C]/20 ${!isDataReady ? "opacity-40 cursor-wait" : ""}`}
            />
          </div>
        </div>

      </div>
    </div>
  );
}

