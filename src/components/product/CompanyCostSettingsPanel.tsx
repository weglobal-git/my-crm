"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Settings,
  Building2,
  Megaphone,
  Briefcase,
  Users,
  Check,
  RotateCcw,
  Loader2,
  Info,
  Save,
} from "lucide-react";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { SlideOverSubBar } from "@/components/ui/SlideOverSubBar";
import {
  CompanyCostOverhead,
  DEFAULT_COMPANY_COST_OVERHEAD,
  getTotalOverheadPercent,
  getLocalCompanyCostOverhead,
  setLocalCompanyCostOverhead,
} from "@/lib/product/company-cost-overhead";
import {
  getCompanyCostOverheadAction,
  saveCompanyCostOverheadAction,
} from "@/lib/actions/company-cost";

export interface CompanyCostSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (newOverhead: CompanyCostOverhead) => void;
}

export function CompanyCostSettingsPanel({
  isOpen,
  onClose,
  onSaved,
}: CompanyCostSettingsPanelProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form states
  const [supportPercent, setSupportPercent] = useState<string>("2");
  const [operationPercent, setOperationPercent] = useState<string>("3");
  const [marketingPercent, setMarketingPercent] = useState<string>("2");
  const [salesPercent, setSalesPercent] = useState<string>("3");

  // Load latest settings on open
  useEffect(() => {
    if (!isOpen) return;

    let isCancelled = false;
    setIsLoading(true);
    setSaveSuccess(false);

    // 1. Initial fast sync from localStorage
    const local = getLocalCompanyCostOverhead();
    setSupportPercent(String(local.supportPercent));
    setOperationPercent(String(local.operationPercent));
    setMarketingPercent(String(local.marketingPercent));
    setSalesPercent(String(local.salesPercent));

    // 2. Fetch authoritative from database
    void getCompanyCostOverheadAction().then((dbData) => {
      if (!isCancelled && dbData) {
        setSupportPercent(String(dbData.supportPercent));
        setOperationPercent(String(dbData.operationPercent));
        setMarketingPercent(String(dbData.marketingPercent));
        setSalesPercent(String(dbData.salesPercent));
        setLocalCompanyCostOverhead(dbData);
        setIsLoading(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [isOpen]);

  // Calculate live values
  const currentOverhead: CompanyCostOverhead = useMemo(
    () => ({
      supportPercent: Math.max(0, parseFloat(supportPercent) || 0),
      operationPercent: Math.max(0, parseFloat(operationPercent) || 0),
      marketingPercent: Math.max(0, parseFloat(marketingPercent) || 0),
      salesPercent: Math.max(0, parseFloat(salesPercent) || 0),
    }),
    [supportPercent, operationPercent, marketingPercent, salesPercent]
  );

  const totalPercent = useMemo(
    () => getTotalOverheadPercent(currentOverhead),
    [currentOverhead]
  );

  const handleResetDefaults = () => {
    setSupportPercent(String(DEFAULT_COMPANY_COST_OVERHEAD.supportPercent));
    setOperationPercent(String(DEFAULT_COMPANY_COST_OVERHEAD.operationPercent));
    setMarketingPercent(String(DEFAULT_COMPANY_COST_OVERHEAD.marketingPercent));
    setSalesPercent(String(DEFAULT_COMPANY_COST_OVERHEAD.salesPercent));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Immediate optimistic update in localStorage & broadcast event
      setLocalCompanyCostOverhead(currentOverhead);

      // 2. Persist to server
      const res = await saveCompanyCostOverheadAction(currentOverhead);
      if (res.success && res.data) {
        setLocalCompanyCostOverhead(res.data);
      }

      setSaveSuccess(true);
      if (onSaved) onSaved(currentOverhead);

      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err) {
      console.error("Error saving cost overhead settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SlideOverPanel
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#C7F33C]/10 border border-[#C7F33C]/30 flex items-center justify-center text-[#C7F33C] shrink-0">
            <Settings className="w-4 h-4" />
          </div>
          <span className="text-base font-bold text-slate-100 truncate">
            Company Standard Cost
          </span>
        </div>
      }
      subtitle="Configure 4 standard overhead categories to calculate effective product cost"
      headerRight={
        <div className="flex items-center gap-2 mr-1">
          <span className="hidden sm:inline-flex text-[11px] font-semibold text-slate-400">
            Total Overhead:
          </span>
          <span className="text-xs font-black text-black bg-[#C7F33C] px-2.5 py-0.5 rounded-full">
            +{totalPercent}%
          </span>
        </div>
      }
      subBar={
        <SlideOverSubBar
          leftContent={
            <button
              type="button"
              onClick={handleResetDefaults}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white rounded-lg bg-[#252728] border border-[#4E4F50] hover:bg-[#4E4F50] transition-colors cursor-pointer"
              title="Reset to default: 10% (Support 2%, Operation 3%, Marketing 2%, Sales 3%)"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset Default (10%)</span>
            </button>
          }
          customActionSlot={
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-black bg-[#C7F33C] hover:bg-[#b0d635] disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          }
        />
      }
      widthClass="w-[580px]"
    >
      <div className="flex flex-col gap-5 select-none pb-6">
        {/* Information Banner (Monochrome + Lime Accent) */}
        <div className="p-4 bg-[#3A3B3C] border border-[#4E4F50] rounded-2xl flex items-start gap-3 text-xs text-slate-300">
          <Info className="w-4 h-4 text-[#C7F33C] shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold text-slate-100">
              Standard Cost Overhead:{" "}
            </span>
            The configured{" "}
            <strong className="text-[#C7F33C]">+{totalPercent}%</strong>{" "}
            overhead is automatically applied to the{" "}
            <strong className="text-white">Base Cost (THB)</strong> of all
            product variants to evaluate minimum export profit margins.
          </div>
        </div>

        {/* 4 Cost Category Cards */}
        <div className="bg-[#3A3B3C] border border-[#4E4F50] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#4E4F50] pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-100">
              Standard Overhead Breakdown (4 Categories)
            </span>
            <span className="text-xs font-semibold text-slate-400">
              Total:{" "}
              <span className="text-[#C7F33C] font-mono font-bold">
                +{totalPercent}%
              </span>
            </span>
          </div>

          <div className="space-y-3">
            {/* 1. Support Expenses */}
            <div className="flex items-center justify-between gap-3 p-3.5 bg-[#252728] rounded-xl border border-[#4E4F50]/60 hover:border-[#4E4F50] transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#3A3B3C] text-[#C7F33C] flex items-center justify-center shrink-0 border border-[#4E4F50]">
                  <Briefcase className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-slate-100 block truncate">
                    Support Expenses
                  </span>
                  <span className="text-[11px] text-slate-400 block truncate mt-0.5">
                    Back-office, procurement, accounting, warehouse, admin
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={supportPercent}
                  onChange={(e) => setSupportPercent(e.target.value)}
                  className="w-16 h-8 rounded-lg bg-[#18191A] border border-[#4E4F50] text-center text-xs font-bold text-[#C7F33C] focus:border-[#C7F33C] outline-none transition-colors"
                />
                <span className="text-xs font-bold text-slate-400">%</span>
              </div>
            </div>

            {/* 2. Operation Expenses */}
            <div className="flex items-center justify-between gap-3 p-3.5 bg-[#252728] rounded-xl border border-[#4E4F50]/60 hover:border-[#4E4F50] transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#3A3B3C] text-[#C7F33C] flex items-center justify-center shrink-0 border border-[#4E4F50]">
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-slate-100 block truncate">
                    Operation Expenses
                  </span>
                  <span className="text-[11px] text-slate-400 block truncate mt-0.5">
                    Salaries, utilities, logistics, rent, general operations
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={operationPercent}
                  onChange={(e) => setOperationPercent(e.target.value)}
                  className="w-16 h-8 rounded-lg bg-[#18191A] border border-[#4E4F50] text-center text-xs font-bold text-[#C7F33C] focus:border-[#C7F33C] outline-none transition-colors"
                />
                <span className="text-xs font-bold text-slate-400">%</span>
              </div>
            </div>

            {/* 3. Marketing Expenses */}
            <div className="flex items-center justify-between gap-3 p-3.5 bg-[#252728] rounded-xl border border-[#4E4F50]/60 hover:border-[#4E4F50] transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#3A3B3C] text-[#C7F33C] flex items-center justify-center shrink-0 border border-[#4E4F50]">
                  <Megaphone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-slate-100 block truncate">
                    Marketing Expenses
                  </span>
                  <span className="text-[11px] text-slate-400 block truncate mt-0.5">
                    POP materials, promotional media, advertising, campaigns
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={marketingPercent}
                  onChange={(e) => setMarketingPercent(e.target.value)}
                  className="w-16 h-8 rounded-lg bg-[#18191A] border border-[#4E4F50] text-center text-xs font-bold text-[#C7F33C] focus:border-[#C7F33C] outline-none transition-colors"
                />
                <span className="text-xs font-bold text-slate-400">%</span>
              </div>
            </div>

            {/* 4. Sales Expenses */}
            <div className="flex items-center justify-between gap-3 p-3.5 bg-[#252728] rounded-xl border border-[#4E4F50]/60 hover:border-[#4E4F50] transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#3A3B3C] text-[#C7F33C] flex items-center justify-center shrink-0 border border-[#4E4F50]">
                  <Users className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-slate-100 block truncate">
                    Sales Expenses
                  </span>
                  <span className="text-[11px] text-slate-400 block truncate mt-0.5">
                    Sales team commission and sales administration
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={salesPercent}
                  onChange={(e) => setSalesPercent(e.target.value)}
                  className="w-16 h-8 rounded-lg bg-[#18191A] border border-[#4E4F50] text-center text-xs font-bold text-[#C7F33C] focus:border-[#C7F33C] outline-none transition-colors"
                />
                <span className="text-xs font-bold text-slate-400">%</span>
              </div>
            </div>
          </div>

          {/* Visual Proportion Bar (Green / White / Gray / Black Theme) */}
          {totalPercent > 0 && (
            <div className="pt-2">
              <div className="h-2 w-full rounded-full bg-[#18191A] overflow-hidden flex gap-0.5">
                {currentOverhead.supportPercent > 0 && (
                  <div
                    style={{
                      width: `${
                        (currentOverhead.supportPercent / totalPercent) * 100
                      }%`,
                    }}
                    className="bg-[#C7F33C] h-full transition-all"
                    title={`Support: ${currentOverhead.supportPercent}%`}
                  />
                )}
                {currentOverhead.operationPercent > 0 && (
                  <div
                    style={{
                      width: `${
                        (currentOverhead.operationPercent / totalPercent) * 100
                      }%`,
                    }}
                    className="bg-[#8FB324] h-full transition-all"
                    title={`Operation: ${currentOverhead.operationPercent}%`}
                  />
                )}
                {currentOverhead.marketingPercent > 0 && (
                  <div
                    style={{
                      width: `${
                        (currentOverhead.marketingPercent / totalPercent) * 100
                      }%`,
                    }}
                    className="bg-slate-200 h-full transition-all"
                    title={`Marketing: ${currentOverhead.marketingPercent}%`}
                  />
                )}
                {currentOverhead.salesPercent > 0 && (
                  <div
                    style={{
                      width: `${
                        (currentOverhead.salesPercent / totalPercent) * 100
                      }%`,
                    }}
                    className="bg-slate-500 h-full transition-all"
                    title={`Sales: ${currentOverhead.salesPercent}%`}
                  />
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 mt-2.5 px-0.5 gap-2">
                {currentOverhead.supportPercent > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                    Support {currentOverhead.supportPercent}%
                  </span>
                )}
                {currentOverhead.operationPercent > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#8FB324]" />
                    Operation {currentOverhead.operationPercent}%
                  </span>
                )}
                {currentOverhead.marketingPercent > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-200" />
                    Marketing {currentOverhead.marketingPercent}%
                  </span>
                )}
                {currentOverhead.salesPercent > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-500" />
                    Sales {currentOverhead.salesPercent}%
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-[#4E4F50]">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 rounded-xl hover:bg-[#3A3B3C] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Default (10%)</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-[#3A3B3C] hover:bg-[#4E4F50] border border-[#4E4F50] rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-black bg-[#C7F33C] hover:bg-[#b0d635] disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </SlideOverPanel>
  );
}
