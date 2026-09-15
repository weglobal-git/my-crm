"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
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

interface DashboardOverviewViewProps {
  snapshot: SalesOverviewSnapshot | null;
  sections: DashboardSectionAccess;
  initialTab?: DashboardTab;
}

export function DashboardOverviewView({
  snapshot,
  sections,
  initialTab,
}: DashboardOverviewViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const currentMonth = getBangkokMonth();
  const currentYear = getBangkokYear();
  const canSeeSales = Object.values(sections).some(Boolean);

  const month = snapshot?.period.month ?? currentMonth;
  const year = snapshot?.period.year ?? currentYear;

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

  const currentCountry = snapshot?.filters?.country || null;
  const currentAccount = snapshot?.filters?.account || null;
  const availableCountries = snapshot?.filterOptions?.countries || [];
  const availableAccounts = snapshot?.filterOptions?.accounts || [];

  const changeFilters = (next: {
    month: number;
    year: number;
    country?: string | null;
    account?: string | null;
  }) => {
    const params = new URLSearchParams();
    params.set("month", String(next.month));
    params.set("year", String(next.year));
    if (next.country) params.set("country", next.country);
    if (next.account) params.set("account", next.account);
    if (activeTab === "leaderboard") params.set("tab", "leaderboard");

    startTransition(() => {
      router.replace(`/dashboard/overview?${params.toString()}`, { scroll: false });
    });
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
    startTransition(() => {
      router.refresh();
    });
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
          isPending={isPending}
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
          <DashboardLeaderboardView snapshot={snapshot} year={year} />
        ) : !snapshot ? (
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
            snapshot={snapshot}
            sections={sections}
            onCountryFilterChange={handleCountryFilter}
          />
        )}
      </div>

      {/* Mount the large print-only tree only while preparing a print job. */}
      {snapshot && isPrinting && (
        <DashboardPrintReport
          snapshot={snapshot}
          sections={printSections}
          onReady={() => setIsPrintReportReady(true)}
        />
      )}
    </WorkspaceLayout>
  );
}
