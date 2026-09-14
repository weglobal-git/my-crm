"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { DashboardSectionAccess, SalesOverviewSnapshot } from "@/lib/dashboard/sales-overview";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { DashboardToolbar, type DashboardTab } from "./DashboardToolbar";
import { SalesSummarySection } from "./SalesSummarySection";
import { DashboardLeaderboardView } from "./DashboardLeaderboardView";
import { DashboardPrintReport, type PrintSections } from "./DashboardPrintReport";
import { getBangkokMonth, getBangkokYear } from "@/lib/dashboard/sales-overview";

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
    saleSummary: sections.saleSummary,
    saleTracking: sections.saleTracking,
    annualReport: sections.annualSaleReport,
  });

  const sanitizePrintSections = (requested: PrintSections): PrintSections => ({
    saleSummary: requested.saleSummary && sections.saleSummary,
    saleTracking: requested.saleTracking && sections.saleTracking,
    annualReport: requested.annualReport && sections.annualSaleReport,
  });

  const changePeriod = (nextMonth: number, nextYear: number) => {
    startTransition(() => {
      router.replace(`/dashboard/overview?month=${nextMonth}&year=${nextYear}`, { scroll: false });
    });
  };

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  // Check if an auto-print was queued (e.g. user selected different period in print drawer)
  useEffect(() => {
    if (!snapshot) return;
    try {
      const pending = sessionStorage.getItem("crm_auto_print");
      if (pending) {
        sessionStorage.removeItem("crm_auto_print");
        const parsed = sanitizePrintSections(JSON.parse(pending) as PrintSections);
        setPrintSections(parsed);
        const timer = setTimeout(() => {
          window.print();
        }, 300);
        return () => clearTimeout(timer);
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
      // Current page data matches target period -> open print dialog directly
      setTimeout(() => {
        window.print();
      }, 150);
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
          isPending={isPending}
          onChangePeriod={changePeriod}
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
          <SalesSummarySection snapshot={snapshot} sections={sections} />
        )}
      </div>

      {/* Printable Report (Only visible during print / A4 layout) */}
      {snapshot && (
        <DashboardPrintReport snapshot={snapshot} sections={printSections} />
      )}
    </WorkspaceLayout>
  );
}
