"use client";

import { useState } from "react";
import { X, Check } from "lucide-react";
import { OpportunityWithRelations } from "./KanbanCard";
import { updateOpportunity, moveOpportunity } from "@/lib/actions/opportunity";
import { useDialog } from "@/providers/DialogProvider";

interface WonLostModalProps {
  deal: OpportunityWithRelations;
  status: "WON" | "LOST";
  onClose: () => void;
  onSuccess: () => void;
}

export function WonLostModal({ deal, status, onClose, onSuccess }: WonLostModalProps) {
  const isSalesDeal = deal.type === "SALES_DEAL";
  const { toast } = useDialog();
  
  // States
  const [value, setValue] = useState<string>(deal.value?.toString() || "");
  const [currency, setCurrency] = useState<string>(deal.currency || "THB");
  const [goodsLoadingDate, setGoodsLoadingDate] = useState<string>(
    deal.goodsLoadingDate ? new Date(deal.goodsLoadingDate).toISOString().split('T')[0] : ""
  );
  const [invoiceId, setInvoiceId] = useState<string>(deal.invoiceId || "");
  const [lossReason, setLossReason] = useState<string>(deal.lossReason || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      if (status === "WON") {
        if (isSalesDeal) {
          if (!value || !currency || !goodsLoadingDate || !invoiceId) {
            throw new Error("Please fill in all required fields.");
          }
          await updateOpportunity(deal.id, {
            value: parseFloat(value),
            currency,
            goodsLoadingDate: new Date(goodsLoadingDate),
            invoiceId
          });
        }
        await moveOpportunity(deal.id, null, "WON");
      } else {
        if (!lossReason.trim()) {
          throw new Error("Please provide a reason for losing the deal.");
        }
        await updateOpportunity(deal.id, { lossReason });
        await moveOpportunity(deal.id, null, "LOST");
      }
      
      toast({ title: "Success", type: "success", description: `Deal marked as ${status}.` });
      onSuccess();
    } catch (e: any) {
      toast({ title: "Error", type: "error", description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isSubmitting && onClose()} />
      
      <div className="relative bg-[#252728] border border-[#3A3B3C] rounded-2xl w-[90%] max-w-md p-6 animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            {status === "WON" ? (
              <><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Mark as Won</>
            ) : (
              <><span className="w-2 h-2 rounded-full bg-rose-500"></span> Mark as Lost</>
            )}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-6">
          <p className="text-slate-300 text-sm mb-1">{deal.topic}</p>
          <p className="text-slate-500 text-xs">{deal.company?.name || "Internal Task"}</p>
        </div>

        <div className="space-y-4">
          {status === "WON" && isSalesDeal && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Total Value <span className="text-rose-500">*</span></label>
                  <input 
                    type="number" 
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="w-full bg-[#1E1F20] border border-[#3A3B3C] rounded-lg py-2.5 px-3 text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Currency <span className="text-rose-500">*</span></label>
                  <select 
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full bg-[#1E1F20] border border-[#3A3B3C] rounded-lg py-2.5 px-3 text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors text-sm appearance-none"
                  >
                    <option value="THB">THB</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="JPY">JPY</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Goods Loading Date <span className="text-rose-500">*</span></label>
                <input 
                  type="date" 
                  value={goodsLoadingDate}
                  onChange={(e) => setGoodsLoadingDate(e.target.value)}
                  className="w-full bg-[#1E1F20] border border-[#3A3B3C] rounded-lg py-2.5 px-3 text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors text-sm [color-scheme:dark]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Invoice Number <span className="text-rose-500">*</span></label>
                <input 
                  type="text" 
                  value={invoiceId}
                  onChange={(e) => setInvoiceId(e.target.value)}
                  placeholder="e.g. INV-2023-001"
                  className="w-full bg-[#1E1F20] border border-[#3A3B3C] rounded-lg py-2.5 px-3 text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors text-sm"
                />
              </div>
            </>
          )}

          {status === "WON" && !isSalesDeal && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-lg flex items-start gap-3">
              <Check className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-sm">
                <strong className="block mb-1">Confirm Completion</strong>
                Are you sure you want to mark this internal task as completed?
              </div>
            </div>
          )}

          {status === "LOST" && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Loss Reason <span className="text-rose-500">*</span></label>
              <textarea 
                value={lossReason}
                onChange={(e) => setLossReason(e.target.value)}
                placeholder="Why did we lose this deal?"
                rows={3}
                className="w-full bg-[#1E1F20] border border-[#3A3B3C] rounded-lg py-2.5 px-3 text-slate-100 focus:outline-none focus:border-rose-500 transition-colors text-sm resize-none"
              />
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button 
            onClick={onClose}
            disabled={isSubmitting}
            className="px-5 py-2.5 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`px-5 py-2.5 text-sm font-semibold text-black rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2
              ${status === "WON" ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-rose-500 hover:bg-rose-400 text-white'}
            `}
          >
            {isSubmitting ? "Saving..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
