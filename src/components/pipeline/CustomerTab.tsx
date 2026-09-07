"use client";

import { useState, useMemo, forwardRef, useImperativeHandle } from "react";
import { OpportunityWithRelations } from "./KanbanCard";
import { updateOpportunity } from "@/lib/actions/opportunity";
import { useDialog } from "@/providers/DialogProvider";
import { DollarSign, Package, Calendar, FileText } from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";

export interface CustomerTabRef {
  save: () => Promise<void>;
  isSaving: boolean;
}

export interface CustomerTabProps {
  deal: OpportunityWithRelations;
  onClose?: () => void;
}

export const CustomerTab = forwardRef<CustomerTabRef, CustomerTabProps>(function CustomerTab(
  { deal },
  ref
) {
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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateOpportunity(deal.id, {
        value: formData.value !== "" ? parseFloat(formData.value.toString()) : null,
        currency: formData.currency,
        goodsReadyDate: formData.goodsReadyDate ? new Date(formData.goodsReadyDate) : null,
        goodsLoadingDate: formData.goodsLoadingDate ? new Date(formData.goodsLoadingDate) : null,
        reserveId: formData.reserveId || null,
        invoiceId: formData.invoiceId || null,
      });
      toast({
        title: "Success",
        description: "Sale deal information saved successfully.",
        type: "success",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to save information.";
      toast({ title: "Error", description: message, type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

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
            <DatePicker
              value={formData.goodsReadyDate}
              onChange={(date) =>
                setFormData((prev) => ({
                  ...prev,
                  goodsReadyDate: date,
                }))
              }
              placeholder="Select ready date"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
              Goods Loading Date <span className="text-rose-500">*</span>
            </label>
            <DatePicker
              value={formData.goodsLoadingDate}
              onChange={(date) =>
                setFormData((prev) => ({
                  ...prev,
                  goodsLoadingDate: date,
                }))
              }
              placeholder="Select loading date"
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
