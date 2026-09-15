"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { DashboardSectionAccess, SalesOverviewSnapshot } from "@/lib/dashboard/sales-overview";
import dynamic from "next/dynamic";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { DashboardToolbar, type DashboardTab } from "./DashboardToolbar";
import { SalesSummarySection } from "./SalesSummarySection";
import { DashboardPrintReport, type PrintSections } from "./DashboardPrintReport";
import { getBangkokMonth, getBangkokYear } from "@/lib/dashboard/sales-overview";

const DashboardLeaderboardView = dynamic(
  () => import("./DashboardLeaderboardView").then((mod) => mod.DashboardLeaderboardView),
  {
    loading: () => (
      <div className="rounded-[2rem] border border-[#4E4F50] bg-[#3A3B3C] p-8 animate-pulse h-[400px]" />
    ),
    ssr: false,
  }
);

import { useDashboardData, type DashboardFilterState } from "./useDashboardData";
import type { ScopeActorInfo } from "@/lib/dashboard/dashboard-keys";

interface DashboardOverviewViewProps {
  snapshot: SalesOverviewSnapshot | null;
  sections: DashboardSectionAccess;
  initialTab?: DashboardTab;
  actor?: ScopeActorInfo;
}

export function DashboardOverviewView({
  snapshot,
  sections,
  initialTab,
  actor,
}: DashboardOverviewViewProps) {
  const router = useRouter();

  const currentMonth = getBangkokMonth();
  const currentYear = getBangkokYear();
  const canSeeSales = Object.values(sections).some(Boolean);

  const initialFilters: DashboardFilterState = useMemo(
    () => ({
      month: snapshot?.period.month ?? currentMonth,
      year: snapshot?.period.year ?? currentYear,
      country: snapshot?.filters?.country || null,
      account: snapshot?.filters?.account || null,
    }),
    [
      snapshot?.period.month,
      snapshot?.period.year,
      snapshot?.filters?.country,
      snapshot?.filters?.account,
      currentMonth,
      currentYear,
    ]
  );

  const [filters, setFilters] = useState<DashboardFilterState>(initialFilters);

  const resolvedActor: ScopeActorInfo = useMemo(
    () => actor || { id: "anon", role: "ADMIN", departments: [] },
    [actor]
  );

  const {
    snapshot: activeSnapshot,
    isPending: isDataPending,
    revalidateVisibleKeys,
  } = useDashboardData({
    initialSnapshot: snapshot,
    sections,
    actor: resolvedActor,
    filters,
    initialFilters,
  });

  const month = filters.month;
  const year = filters.year;

  const [activeTab, setActiveTab] = useState<DashboardTab>(
    initialTab || (canSeeSales ? "sale_deal" : "leaderboard")
  );

  const [printSections, setPrintSections] = useState<PrintSections>({
    worldMap: canSeeSales,
    worldMapPeriod: "all_time",
    saleSummary: sections.saleSummary,
    saleSummaryPeriod: "month",
    saleTracking: sections.saleTracking,
    annualReport: sections.annualSaleReport,
  });
  const [isPrinting, setIsPrinting] = useState(false);
  const [isPrintReportReady, setIsPrintReportReady] = useState(false);

  const sanitizePrintSections = (requested: PrintSections): PrintSections => ({
    worldMap: Boolean(requested.worldMap) && canSeeSales,
    worldMapPeriod: ["all_time", "year", "month"].includes(requested.worldMapPeriod)
      ? requested.worldMapPeriod
      : "all_time",
    saleSummary: requested.saleSummary && sections.saleSummary,
    saleSummaryPeriod: ["year", "month"].includes(requested.saleSummaryPeriod)
      ? requested.saleSummaryPeriod
      : "month",
    saleTracking: requested.saleTracking && sections.saleTracking,
    annualReport: requested.annualReport && sections.annualSaleReport,
  });

  const currentCountry = filters.country;
  const currentAccount = filters.account;
  const availableCountries = activeSnapshot?.filterOptions?.countries || [];
  const availableAccounts = activeSnapshot?.filterOptions?.accounts || [];

  // Synchronize browser Back/Forward (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const m = parseInt(params.get("month") || String(currentMonth), 10);
      const y = parseInt(params.get("year") || String(currentYear), 10);
      const c = params.get("country") || null;
      const a = params.get("account") || null;
      setFilters({ month: m, year: y, country: c, account: a });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [currentMonth, currentYear]);

  const changeFilters = (next: {
    month: number;
    year: number;
    country?: string | null;
    account?: string | null;
  }) => {
    const normalizedNext: DashboardFilterState = {
      month: next.month,
      year: next.year,
      country: next.country?.trim().toUpperCase() || null,
      account: next.account?.trim() || null,
    };

    // No-op on identical filters
    if (
      normalizedNext.month === filters.month &&
      normalizedNext.year === filters.year &&
      normalizedNext.country === filters.country &&
      normalizedNext.account === filters.account
    ) {
      return;
    }

    setFilters(normalizedNext);

    const params = new URLSearchParams();
    params.set("month", String(normalizedNext.month));
    params.set("year", String(normalizedNext.year));
    if (normalizedNext.country) params.set("country", normalizedNext.country);
    if (normalizedNext.account) params.set("account", normalizedNext.account);
    if (activeTab === "leaderboard") params.set("tab", "leaderboard");

    const nextUrl = `/dashboard/overview?${params.toString()}`;
    if (typeof window !== "undefined" && window.location.search !== `?${params.toString()}`) {
      window.history.pushState(null, "", nextUrl);
    }
  };

  const changePeriod = (nextMonth: number, nextYear: number) => {
    changeFilters({
      month: nextMonth,
      year: nextYear,
      country: currentCountry,
      account: currentAccount,
    });
  };

  const handleCountryFilter = (countryCode: string | null) => {
    const normalizedNext = countryCode?.trim().toUpperCase() || null;
    const normalizedCurrent = currentCountry?.trim().toUpperCase() || null;
    if (normalizedNext === normalizedCurrent) return;
    changeFilters({
      month,
      year,
      country: normalizedNext,
      account: null,
    });
  };

  const handleClearCountry = () => {
    changeFilters({
      month,
      year,
      country: null,
      account: currentAccount,
    });
  };

  const handleClearAccount = () => {
    changeFilters({
      month,
      year,
      country: currentCountry,
      account: null,
    });
  };

  const handleRefresh = () => {
    void revalidateVisibleKeys();
  };

  const openPrintDialog = useCallback(async () => {
    if (!isPrintReportReady) return;
    try {
      await document.fonts?.ready;
    } finally {
      window.print();
      setIsPrinting(false);
      setIsPrintReportReady(false);
    }
  }, [isPrintReportReady]);

  useEffect(() => {
    if (isPrinting && isPrintReportReady) void openPrintDialog();
  }, [isPrinting, isPrintReportReady, openPrintDialog]);

  // Check if an auto-print was queued (e.g. user selected different period in print drawer)
  useEffect(() => {
    if (!snapshot) return;
    try {
      const pending = sessionStorage.getItem("crm_auto_print");
      if (pending) {
        sessionStorage.removeItem("crm_auto_print");
        const parsed = sanitizePrintSections(JSON.parse(pending) as PrintSections);
        setPrintSections(parsed);
        setIsPrintReportReady(false);
        setIsPrinting(true);
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, [snapshot, month, year]);

  const handlePrint = (sections: PrintSections, targetMonth: number, targetYear: number) => {
    const allowedPrintSections = sanitizePrintSections(sections);
    setPrintSections(allowedPrintSections);
    if (targetMonth !== month || targetYear !== year) {
      // Target period is different from current page data -> queue auto-print and navigate
      try {
        sessionStorage.setItem("crm_auto_print", JSON.stringify(allowedPrintSections));
      } catch {
        // Ignore
      }
      changePeriod(targetMonth, targetYear);
    } else {
      setIsPrintReportReady(false);
      setIsPrinting(true);
    }
  };

  return (
    <WorkspaceLayout scrollMode="auto">
      {/* Regular Interactive Dashboard (Hidden during print) */}
      <div className="flex min-h-full flex-col gap-6 print:hidden">
        {/* Unified Desktop + Mobile Toolbar */}
        <DashboardToolbar
          month={month}
          year={year}
          country={currentCountry}
          account={currentAccount}
          availableCountries={availableCountries}
          availableAccounts={availableAccounts}
          isPending={isDataPending}
          onChangePeriod={changePeriod}
          onApplyFilters={changeFilters}
          onClearCountry={handleClearCountry}
          onClearAccount={handleClearAccount}
          onRefresh={handleRefresh}
          onPrint={handlePrint}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          canSeeSales={canSeeSales}
          allowedSections={sections}
        />

        {/* Content Body */}
        {activeTab === "leaderboard" ? (
          <DashboardLeaderboardView snapshot={activeSnapshot} year={year} />
        ) : !activeSnapshot ? (
          <section className="rounded-[2rem] border border-[#4E4F50] bg-[#3A3B3C] p-8 text-center">
            <h2 className="text-base font-semibold text-slate-100">
              No report sections available
            </h2>
            <p className="mt-2 text-xs text-slate-400 max-w-md mx-auto">
              Your department does not currently have permission to access Sales Deal reporting.
              Contact an administrator if you need access to the Sale Summary dashboard.
            </p>
          </section>
        ) : (
          <SalesSummarySection
            snapshot={activeSnapshot}
            sections={sections}
            onCountryFilterChange={handleCountryFilter}
          />
        )}
      </div>

      {/* Mount the large print-only tree only while preparing a print job. */}
      {snapshot && isPrinting && (
        <DashboardPrintReport
          snapshot={activeSnapshot || snapshot}
          sections={printSections}
          onReady={() => setIsPrintReportReady(true)}
        />
      )}
    </WorkspaceLayout>
  );
}
