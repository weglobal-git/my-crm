import { useState, useMemo } from "react";
import { OpportunityWithRelations } from "./KanbanCard";
import { updateOpportunity, moveOpportunity } from "@/lib/actions/opportunity";
import { useDialog } from "@/providers/DialogProvider";
import { DollarSign, Package, Calendar, Briefcase, FileText, Loader2, Save, Trophy, AlertCircle, CheckCircle2 } from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";

interface CustomerTabProps {
  deal: OpportunityWithRelations;
  onClose?: () => void;
}

export function CustomerTab({ deal, onClose }: CustomerTabProps) {
  const { toast, confirm } = useDialog();
  const [isSaving, setIsSaving] = useState(false);
  
  const dealKey = `${deal.id}-${deal.value}-${deal.currency}-${deal.goodsReadyDate}-${deal.goodsLoadingDate}-${deal.reserveId}-${deal.invoiceId}`;

  const initialFormData = useMemo(() => ({
    value: deal.value !== null && deal.value !== undefined ? deal.value : "",
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

  const isReadyForWon = Boolean(
    formData.value !== "" && 
    formData.currency && 
    formData.goodsLoadingDate && 
    formData.invoiceId?.trim()
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateOpportunity(deal.id, {
        value: formData.value !== "" ? parseFloat(formData.value.toString()) : null,
        currency: formData.currency,
        goodsReadyDate: formData.goodsReadyDate ? new Date(formData.goodsReadyDate) : null,
        goodsLoadingDate: formData.goodsLoadingDate ? new Date(formData.goodsLoadingDate) : null,
        reserveId: formData.reserveId || null,
        invoiceId: formData.invoiceId || null
      });
      toast({ title: "Success", description: "Sale deal information saved successfully.", type: "success" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to save information.";
      toast({ title: "Error", description: message, type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkAsWon = async () => {
    if (!isReadyForWon) {
      toast({
        title: "Incomplete Sales Deal",
        description: "To mark as Won, please fill in Total Value, Currency, Goods Loading Date, and Invoice Number.",
        type: "error",
      });
      return;
    }

    const confirmed = await confirm({
      title: "Mark Deal as Won",
      description: `Are you sure you want to close this Sales Deal as WON? (Value: ${Number(formData.value).toLocaleString()} ${formData.currency}, Invoice: ${formData.invoiceId})`,
      confirmText: "Mark as Won",
      cancelText: "Cancel",
      variant: "primary"
    });

    if (!confirmed) return;

    setIsSaving(true);
    try {
      await updateOpportunity(deal.id, {
        value: parseFloat(formData.value.toString()),
        currency: formData.currency,
        goodsReadyDate: formData.goodsReadyDate ? new Date(formData.goodsReadyDate) : null,
        goodsLoadingDate: new Date(formData.goodsLoadingDate),
        reserveId: formData.reserveId || null,
        invoiceId: formData.invoiceId || null
      });
      await moveOpportunity(deal.id, null, "WON");
      toast({ title: "Success", description: "Sales Deal closed as WON!", type: "success" });
      onClose?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to mark as Won.";
      toast({ title: "Error", description: message, type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-[#C7F33C]" />
            Sale Deal Information
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Sales & shipment records. Fields marked with <span className="text-rose-500 font-semibold">*</span> are required to close as Won.
          </p>
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
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
              Total Value <span className="text-rose-500">*</span>
            </label>
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
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
              Currency <span className="text-rose-500">*</span>
            </label>
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
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
              Goods Loading Date <span className="text-rose-500">*</span>
            </label>
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
                className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl pl-9 pr-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-[#C7F33C] transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between mt-2 pt-4 border-t border-[#3A3B3C]">
        <div className="flex items-center gap-2 text-xs">
          {isReadyForWon ? (
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              All required fields completed for Won
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-400 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Fill 4 required fields (<span className="text-rose-500">*</span>) to enable Mark as Won
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-[#3A3B3C] hover:bg-[#4E4F50] text-slate-200 border border-[#4E4F50] font-semibold py-2.5 px-5 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 text-sm"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
          
          <button
            onClick={handleMarkAsWon}
            disabled={isSaving}
            className={`font-bold py-2.5 px-5 rounded-xl flex items-center gap-2 transition-all text-sm shadow-lg ${
              isReadyForWon 
                ? "bg-[#C7F33C] text-black hover:bg-[#b5e032] shadow-[#C7F33C]/20 cursor-pointer" 
                : "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-70"
            }`}
          >
            <Trophy className="w-4 h-4" />
            Mark as Won
          </button>
        </div>
      </div>
    </div>
  );
}

