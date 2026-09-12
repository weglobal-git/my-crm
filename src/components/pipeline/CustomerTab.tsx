"use client";

import { useState, useMemo, useCallback, forwardRef, useImperativeHandle } from "react";
import { useSWRConfig } from "swr";
import { OpportunityWithRelations } from "./KanbanCard";
import { updateOpportunity } from "@/lib/actions/opportunity";
import { useDialog } from "@/providers/DialogProvider";
import { DollarSign, Package, Calendar, FileText } from "lucide-react";
import { CalendarDatePicker } from "@/components/ui/CalendarDatePicker";

export interface CustomerTabRef {
  save: () => Promise<void>;
  isSaving: boolean;
}

export interface CustomerTabProps {
  deal: OpportunityWithRelations;
  onClose?: () => void;
  canEditDealDates?: boolean;
}

export const CustomerTab = forwardRef<CustomerTabRef, CustomerTabProps>(function CustomerTab(
  { deal, canEditDealDates = false },
  ref
) {
  const { mutate } = useSWRConfig();
  const { toast } = useDialog();
  const [isSaving, setIsSaving] = useState(false);

  const dealKey = `${deal.id}-${deal.value}-${deal.currency}-${deal.goodsReadyDate}-${deal.goodsLoadingDate}-${deal.reserveId}-${deal.invoiceId}`;

  const initialFormData = useMemo(
    () => ({
      value: deal.value !== null && deal.value !== undefined ? deal.value : "",
      currency: deal.currency || "THB",
      goodsReadyDate: deal.goodsReadyDate
        ? new Date(deal.goodsReadyDate).toISOString().split("T")[0]
        : "",
      goodsLoadingDate: deal.goodsLoadingDate
        ? new Date(deal.goodsLoadingDate).toISOString().split("T")[0]
        : "",
      reserveId: deal.reserveId || "",
      invoiceId: deal.invoiceId || "",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dealKey]
  );

  const [formData, setFormData] = useState(initialFormData);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = useCallback(async () => {
    const previousFormData = { ...formData };
    const updatedPayload = {
      value: formData.value !== "" ? parseFloat(formData.value.toString()) : null,
      currency: formData.currency,
      ...(formData.goodsReadyDate !== initialFormData.goodsReadyDate ? {
        goodsReadyDate: formData.goodsReadyDate ? new Date(formData.goodsReadyDate) : null,
      } : {}),
      ...(formData.goodsLoadingDate !== initialFormData.goodsLoadingDate ? {
        goodsLoadingDate: formData.goodsLoadingDate ? new Date(formData.goodsLoadingDate) : null,
      } : {}),
      reserveId: formData.reserveId || null,
      invoiceId: formData.invoiceId || null,
    };

    // 1. Optimistically patch SWR cache across pipeline deals immediately (< 50ms)
    void mutate(
      (key) => Array.isArray(key) && key[0] === "pipeline-deals",
      (currentDeals: OpportunityWithRelations[] | undefined) => {
        if (!currentDeals) return currentDeals;
        return currentDeals.map((d) =>
          d.id === deal.id ? { ...d, ...updatedPayload } : d
        );
      },
      false
    );

    // 2. Instant feedback toast
    toast({
      title: "Saved",
      description: "Sale deal information updated.",
      type: "success",
    });

    // 3. Fire server action in background
    setIsSaving(true);
    try {
      await updateOpportunity(deal.id, updatedPayload);
      void mutate((key) => Array.isArray(key) && key[0] === "pipeline-deals");
    } catch (error: unknown) {
      setFormData(previousFormData);
      void mutate((key) => Array.isArray(key) && key[0] === "pipeline-deals");
      const message = error instanceof Error ? error.message : "Failed to save information.";
      toast({ title: "Error", description: message, type: "error" });
    } finally {
      setIsSaving(false);
    }
  }, [deal.id, formData, initialFormData, mutate, toast]);

  useImperativeHandle(
    ref,
    () => ({
      save: handleSave,
      isSaving,
    }),
    [handleSave, isSaving]
  );

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Financials Section */}
      <div className="bg-[#3A3B3C] border border-[#4E4F50] rounded-2xl p-5 flex flex-col gap-5">
        <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-slate-400" />
          Financials
        </h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
              Total Value <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              name="value"
              value={formData.value}
              onChange={handleChange}
              placeholder="0.00"
              className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl px-3 py-2.5 text-slate-100 text-xs focus:outline-none focus:border-[#C7F33C] transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
              Currency <span className="text-rose-500">*</span>
            </label>
            <select
              name="currency"
              value={formData.currency}
              onChange={handleChange}
              className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl px-3 py-2.5 text-slate-100 text-xs focus:outline-none focus:border-[#C7F33C] transition-colors cursor-pointer"
            >
              <option value="THB">THB (฿)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="CNY">CNY (¥)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Shipment & Operations Section */}
      <div className="bg-[#3A3B3C] border border-[#4E4F50] rounded-2xl p-5 flex flex-col gap-5">
        <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-400" />
          Shipment & Operations
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
              Goods Ready Date
            </label>
            <CalendarDatePicker
              ariaLabel="Goods Ready Date"
              value={formData.goodsReadyDate}
              onChange={(date) =>
                setFormData((prev) => ({
                  ...prev,
                  goodsReadyDate: date,
                }))
              }
              disabled={!canEditDealDates}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
              Goods Loading Date <span className="text-rose-500">*</span>
            </label>
            <CalendarDatePicker
              ariaLabel="Goods Loading Date"
              value={formData.goodsLoadingDate}
              onChange={(date) =>
                setFormData((prev) => ({
                  ...prev,
                  goodsLoadingDate: date,
                }))
              }
              disabled={!canEditDealDates}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
              Reserve ID
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                name="reserveId"
                value={formData.reserveId}
                onChange={handleChange}
                placeholder="e.g. RS-2026-001"
                className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl pl-9 pr-3 py-2.5 text-slate-100 text-xs focus:outline-none focus:border-[#C7F33C] transition-colors"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
              Invoice Number <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <FileText className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                name="invoiceId"
                value={formData.invoiceId}
                onChange={handleChange}
                placeholder="e.g. INV-2026-001"
                className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl pl-9 pr-3 py-2.5 text-slate-100 text-xs focus:outline-none focus:border-[#C7F33C] transition-colors"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
