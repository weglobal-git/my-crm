import { useState, useMemo } from "react";
import { OpportunityWithRelations } from "./KanbanCard";
import { updateOpportunity } from "@/lib/actions/opportunity";
import { useDialog } from "@/providers/DialogProvider";
import { DollarSign, Package, Calendar, Tag, FileText, Loader2, Save } from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";

export function CustomerTab({ deal }: { deal: OpportunityWithRelations }) {
  const { toast } = useDialog();
  const [isSaving, setIsSaving] = useState(false);
  
  const dealKey = `${deal.id}-${deal.value}-${deal.currency}-${deal.goodsReadyDate}-${deal.goodsLoadingDate}-${deal.reserveId}-${deal.invoiceId}`;

  const initialFormData = useMemo(() => ({
    value: deal.value || "",
    currency: deal.currency || "THB",
    goodsReadyDate: deal.goodsReadyDate ? new Date(deal.goodsReadyDate).toISOString().split('T')[0] : "",
    goodsLoadingDate: deal.goodsLoadingDate ? new Date(deal.goodsLoadingDate).toISOString().split('T')[0] : "",
    reserveId: deal.reserveId || "",
    invoiceId: deal.invoiceId || ""
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [dealKey]);

  const [formData, setFormData] = useState(initialFormData);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateOpportunity(deal.id, {
        value: formData.value ? parseFloat(formData.value.toString()) : null,
        currency: formData.currency,
        goodsReadyDate: formData.goodsReadyDate ? new Date(formData.goodsReadyDate) : null,
        goodsLoadingDate: formData.goodsLoadingDate ? new Date(formData.goodsLoadingDate) : null,
        reserveId: formData.reserveId || null,
        invoiceId: formData.invoiceId || null
      });
      toast({ title: "Success", description: "Customer information saved successfully.", type: "success" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to save information.";
      toast({ title: "Error", description: message, type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Tag className="w-5 h-5 text-[#C7F33C]" />
            Customer Information
          </h3>
        </div>
      </div>

      {/* Financials Section */}
      <div className="bg-[#3A3B3C] border border-[#4E4F50] rounded-2xl p-5 flex flex-col gap-5">
        <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-slate-400" />
          Financials
        </h4>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Total Value</label>
            <input 
              type="number"
              name="value"
              value={formData.value}
              onChange={handleChange}
              placeholder="0.00"
              className="bg-[#252728] border border-[#4E4F50] rounded-xl px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-[#C7F33C] transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Currency</label>
            <select
              name="currency"
              value={formData.currency}
              onChange={handleChange}
              className="bg-[#252728] border border-[#4E4F50] rounded-xl px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-[#C7F33C] transition-colors appearance-none"
            >
              <option value="THB">THB (฿)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logistics & Dates Section */}
      <div className="bg-[#3A3B3C] border border-[#4E4F50] rounded-2xl p-5 flex flex-col gap-5">
        <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          Logistics & Dates
        </h4>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Goods Ready Date</label>
            <DatePicker
              value={formData.goodsReadyDate}
              onChange={(date) => setFormData(prev => ({ ...prev, goodsReadyDate: date }))}
              allowPastDates={true}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Goods Loading Date</label>
            <DatePicker
              value={formData.goodsLoadingDate}
              onChange={(date) => setFormData(prev => ({ ...prev, goodsLoadingDate: date }))}
              allowPastDates={true}
            />
          </div>
        </div>
      </div>

      {/* References Section */}
      <div className="bg-[#3A3B3C] border border-[#4E4F50] rounded-2xl p-5 flex flex-col gap-5">
        <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400" />
          Reference Numbers
        </h4>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Reserve Number</label>
            <div className="relative">
              <Package className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                name="reserveId"
                value={formData.reserveId}
                onChange={handleChange}
                placeholder="e.g. RS-2026-001"
                className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl pl-9 pr-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-[#C7F33C] transition-colors"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Invoice Number</label>
            <div className="relative">
              <FileText className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                name="invoiceId"
                value={formData.invoiceId}
                onChange={handleChange}
                placeholder="e.g. INV-2026-001"
                className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl pl-9 pr-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-[#C7F33C] transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end mt-4">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-[#C7F33C] text-black font-bold py-3 px-6 rounded-full flex items-center gap-2 hover:bg-[#b5e032] transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
