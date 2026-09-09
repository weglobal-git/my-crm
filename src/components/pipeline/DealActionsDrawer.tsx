"use client";

import { useState, useEffect, useRef } from "react";
import { 
  X, 
  Trophy, 
  XCircle, 
  Briefcase, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2,
  SlidersHorizontal,
  ArrowRight,
  Check
} from "lucide-react";
import { OpportunityWithRelations } from "./KanbanCard";
import { updateOpportunity, moveOpportunity, deleteOpportunity, addSystemLog } from "@/lib/actions/opportunity";
import { useDialog } from "@/providers/DialogProvider";
import { mutate } from "swr";

export interface DealActionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  deal: OpportunityWithRelations;
  canCloseDeal: boolean;
  canConvert: boolean;
  canDelete: boolean;
  onNavigateToInformation?: () => void;
  onDealClosed?: (dealId: string, status: "WON" | "LOST") => void;
  onDealConverted?: () => void;
  onDealDeleted?: (dealId: string) => void;
}

export function DealActionsDrawer({
  isOpen,
  onClose,
  deal,
  canCloseDeal,
  canConvert,
  canDelete,
  onNavigateToInformation,
  onDealClosed,
  onDealConverted,
  onDealDeleted,
}: DealActionsDrawerProps) {
  const { toast } = useDialog();
  const drawerRef = useRef<HTMLDivElement>(null);

  const isSalesDeal = deal.type === "SALES_DEAL";

  // Active sub-mode for closing deal: "WON" | "LOST"
  const [closeMode, setCloseMode] = useState<"WON" | "LOST">("WON");



  // Lost fields
  const [lossReason, setLossReason] = useState<string>(deal.lossReason || "");

  // Delete confirmation state
  const [confirmDeleteChecked, setConfirmDeleteChecked] = useState(false);

  // Submitting states
  const [isSubmittingClose, setIsSubmittingClose] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset form states when drawer opens (render-time synchronization)
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setLossReason(deal.lossReason || "");
      setConfirmDeleteChecked(false);
    }
  }

  // Click outside and Escape key handling
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (isSubmittingClose || isConverting || isDeleting) return;
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmittingClose && !isConverting && !isDeleting) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isSubmittingClose, isConverting, isDeleting, onClose]);

  // Validation for Won
  const hasValue = deal.value !== null && deal.value !== undefined && Number(deal.value) > 0;
  const hasGoodsLoadingDate = Boolean(deal.goodsLoadingDate);
  const hasInvoiceId = Boolean(deal.invoiceId && deal.invoiceId.trim());

  const missingWonFields: string[] = [];
  if (isSalesDeal) {
    if (!hasValue) missingWonFields.push("Total Value");
    if (!hasGoodsLoadingDate) missingWonFields.push("Goods Loading Date");
    if (!hasInvoiceId) missingWonFields.push("Invoice Number");
  }
  const isWonValid = !isSalesDeal || missingWonFields.length === 0;

  // Handle Mark as Won
  const handleConfirmWon = async () => {
    if (isSubmittingClose || !isWonValid) return;
    setIsSubmittingClose(true);

    try {
      await moveOpportunity(deal.id, null, "WON");

      toast({
        title: "Deal Marked as Won",
        description: `"${deal.topic}" has been completed and moved to Completed.`,
        type: "success",
      });

      // Optimistic callback & SWR cache update
      onDealClosed?.(deal.id, "WON");
      void mutate(
        (key) => (Array.isArray(key) && key[0] === "pipeline-deals") || (typeof key === "string" && key.startsWith("pipeline")),
        undefined,
        { revalidate: true }
      );
      void mutate(["opportunity", deal.id]);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to mark deal as Won";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsSubmittingClose(false);
    }
  };

  // Handle Mark as Lost
  const handleConfirmLost = async () => {
    if (isSubmittingClose || !lossReason.trim()) return;
    setIsSubmittingClose(true);

    try {
      await updateOpportunity(deal.id, { lossReason: lossReason.trim() });
      await moveOpportunity(deal.id, null, "LOST");

      toast({
        title: "Deal Marked as Lost",
        description: `"${deal.topic}" has been marked as Lost and archived.`,
        type: "success",
      });

      // Optimistic callback & SWR cache update
      onDealClosed?.(deal.id, "LOST");
      void mutate(
        (key) => (Array.isArray(key) && key[0] === "pipeline-deals") || (typeof key === "string" && key.startsWith("pipeline")),
        undefined,
        { revalidate: true }
      );
      void mutate(["opportunity", deal.id]);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to mark deal as Lost";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsSubmittingClose(false);
    }
  };

  // Handle Convert to Sales Deal
  const handleConvert = async () => {
    if (isConverting) return;
    setIsConverting(true);

    try {
      await updateOpportunity(deal.id, { type: "SALES_DEAL" });
      await addSystemLog(deal.id, "Converted opportunity type from Internal Task to Sales Deal.");

      toast({
        title: "Converted to Sales Deal",
        description: `"${deal.topic}" is now a Sales Deal.`,
        type: "success",
      });

      onDealConverted?.();
      void mutate(
        (key) => (Array.isArray(key) && key[0] === "pipeline-deals") || (typeof key === "string" && key.startsWith("pipeline")),
        undefined,
        { revalidate: true }
      );
      void mutate(["opportunity", deal.id]);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to convert deal";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsConverting(false);
    }
  };

  // Handle Delete Deal
  const handleDelete = async () => {
    if (isDeleting || !confirmDeleteChecked) return;
    setIsDeleting(true);

    try {
      await deleteOpportunity(deal.id);
      toast({
        title: "Deal Deleted",
        description: `"${deal.topic}" was deleted permanently.`,
        type: "success",
      });

      onDealDeleted?.(deal.id);
      void mutate(
        (key) => (Array.isArray(key) && key[0] === "pipeline-deals") || (typeof key === "string" && key.startsWith("pipeline")),
        undefined,
        { revalidate: true }
      );
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to delete deal";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsDeleting(false);
    }
  };

  const hasAnyActions = canCloseDeal || canConvert || canDelete;

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-[120] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`} 
        onClick={() => {
          if (!isSubmittingClose && !isConverting && !isDeleting) {
            onClose();
          }
        }}
      />

      {/* Floating Card Modal */}
      <div className={`fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[450px] md:max-w-[calc(100vw-32px)] z-[121] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right ${
        isOpen ? "opacity-100 translate-y-0 md:translate-x-0 scale-100" : "opacity-0 translate-y-4 md:translate-x-8 scale-[0.97] pointer-events-none"
      }`}>
        <div 
          ref={drawerRef} 
          className="w-full bg-[#252728] border-0 md:border border-[#3A3B3C] flex flex-col h-full rounded-none md:rounded-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 sm:p-6 border-b border-[#1C1C1D] shrink-0 bg-[#252728]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#3A3B3C] border border-[#4E4F50] flex items-center justify-center shrink-0">
                <SlidersHorizontal className="w-4 h-4 text-slate-300" />
              </div>
              <div className="flex flex-col min-w-0">
                <h2 className="text-base font-bold text-slate-100 truncate">
                  Card Actions
                </h2>
                <p className="text-xs text-slate-400 truncate">
                  {deal.topic}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmittingClose || isConverting || isDeleting}
              className="p-2 hover:bg-[#3A3B3C] rounded-full transition-colors text-slate-400 hover:text-slate-200 shrink-0 cursor-pointer"
              aria-label="Close card actions"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Actions Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {!hasAnyActions ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No actions available for your current permission role.
              </div>
            ) : (
              <>
                {/* 1. Close Deal Section */}
                {canCloseDeal && (
                  <div className="space-y-3">
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-1">
                      Close Deal Status
                    </label>

                    {/* Won / Lost Segmented Selector */}
                    <div className="grid grid-cols-2 gap-1.5 bg-[#1C1C1D] p-1 rounded-xl border border-[#3A3B3C]">
                      <button
                        type="button"
                        onClick={() => setCloseMode("WON")}
                        className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          closeMode === "WON"
                            ? "bg-[#2E3032] text-slate-100 border border-[#4E4F50]"
                            : "text-slate-400 hover:text-slate-200 hover:bg-[#252728]"
                        }`}
                      >
                        <Trophy className={`w-3.5 h-3.5 ${closeMode === "WON" ? "text-[#C7F33C]" : "text-slate-500"}`} />
                        <span>Close as Won</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCloseMode("LOST")}
                        className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          closeMode === "LOST"
                            ? "bg-[#2E3032] text-slate-100 border border-[#4E4F50]"
                            : "text-slate-400 hover:text-slate-200 hover:bg-[#252728]"
                        }`}
                      >
                        <XCircle className={`w-3.5 h-3.5 ${closeMode === "LOST" ? "text-rose-400" : "text-slate-500"}`} />
                        <span>Close as Lost</span>
                      </button>
                    </div>

                        {/* Mode WON Details */}
                    {closeMode === "WON" && (
                      <div className="bg-[#1E1F20] border border-[#3A3B3C] rounded-xl p-4 space-y-4 animate-in fade-in duration-150">
                        {isSalesDeal ? (
                          <>
                            {/* Validation Status Banner */}
                            {missingWonFields.length > 0 ? (
                              <div className="p-3.5 bg-[#2A2B2D] border border-[#4E4F50] rounded-xl flex flex-col gap-3 text-xs text-amber-300/90">
                                <div className="flex items-start gap-2.5">
                                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-amber-300">Missing required fields:</p>
                                    <p className="text-[11px] text-slate-300 mt-0.5">
                                      {missingWonFields.join(", ")}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    onNavigateToInformation?.();
                                  }}
                                  className="w-full py-2 px-3 bg-[#1C1C1D] hover:bg-[#252728] border border-[#4E4F50] text-[#C7F33C] text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                >
                                  <Briefcase className="w-3.5 h-3.5" />
                                  <span>Go to Sale Deal to Complete Fields</span>
                                  <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="p-3 bg-[#2A2B2D] border border-[#4E4F50] rounded-xl flex items-center gap-2 text-xs text-slate-200">
                                <CheckCircle2 className="w-4 h-4 shrink-0 text-[#C7F33C]" />
                                <span>All required sales fields are complete</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-slate-400 leading-relaxed">
                            Complete this internal task successfully and archive it into Completed Projects.
                          </p>
                        )}

                        <button
                          type="button"
                          onClick={handleConfirmWon}
                          disabled={isSubmittingClose || !isWonValid}
                          className="w-full py-2.5 rounded-xl bg-[#C7F33C] hover:bg-[#b0d635] text-black font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isSubmittingClose ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-black" />
                              <span>Closing as Won...</span>
                            </>
                          ) : (
                            <>
                              <Trophy className="w-4 h-4" />
                              <span>Confirm Close as Won</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Mode LOST Details */}
                    {closeMode === "LOST" && (
                      <div className="bg-[#1E1F20] border border-[#3A3B3C] rounded-xl p-4 space-y-4 animate-in fade-in duration-150">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                            Reason for losing this deal <span className="text-rose-400">*</span>
                          </label>
                          <textarea
                            rows={3}
                            value={lossReason}
                            onChange={(e) => setLossReason(e.target.value)}
                            placeholder="Explain why this deal was lost..."
                            className="w-full bg-[#252728] border border-[#3A3B3C] rounded-lg p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#4E4F50] resize-none transition-colors"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleConfirmLost}
                          disabled={isSubmittingClose || !lossReason.trim()}
                          className="w-full py-2.5 rounded-xl bg-[#2A2B2D] hover:bg-[#3A3B3C] text-slate-200 hover:text-white border border-[#4E4F50] font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isSubmittingClose ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                              <span>Closing as Lost...</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 text-rose-400" />
                              <span>Confirm Close as Lost</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Convert to Sales Deal Section */}
                {canConvert && (
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-1">
                      Convert Deal Type
                    </label>
                    <div className="bg-[#1E1F20] border border-[#3A3B3C] rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-semibold text-slate-200">
                          Convert to Sales Deal
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Upgrade this task to an active Sales Deal to link customer accounts, track quotation stages, and record revenue. Once converted, it cannot be reverted back.
                      </p>
                      <button
                        type="button"
                        onClick={handleConvert}
                        disabled={isConverting}
                        className="w-full py-2.5 rounded-xl bg-[#2A2B2D] hover:bg-[#3A3B3C] text-slate-200 hover:text-white border border-[#4E4F50] font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isConverting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                            <span>Converting...</span>
                          </>
                        ) : (
                          <>
                            <Briefcase className="w-4 h-4 text-slate-400" />
                            <span>Confirm Convert to Sales Deal</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. Delete Deal Section */}
                {canDelete && (
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider pl-1">
                      Danger Zone
                    </label>
                    <div className="bg-[#1E1F20] border border-[#3A3B3C] rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Trash2 className="w-4 h-4 text-red-400/80" />
                        <span className="text-xs font-semibold text-slate-300">
                          Delete Deal Permanently
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Permanently delete this deal and its entire history (comments, files, logs). This action cannot be reversed.
                      </p>

                      <label 
                        onClick={() => setConfirmDeleteChecked(!confirmDeleteChecked)}
                        className="flex items-center gap-2.5 cursor-pointer select-none text-xs text-slate-300 hover:text-slate-100 transition-colors group"
                      >
                        <div
                          role="checkbox"
                          aria-checked={confirmDeleteChecked}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === " " || e.key === "Enter") {
                              e.preventDefault();
                              setConfirmDeleteChecked(!confirmDeleteChecked);
                            }
                          }}
                          className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all shrink-0 ${
                            confirmDeleteChecked
                              ? "bg-red-500 border-red-500 text-white"
                              : "border-[#4E4F50] bg-[#252728] group-hover:border-[#6E6F70]"
                          }`}
                        >
                          {confirmDeleteChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                        <span>I understand this cannot be undone</span>
                      </label>

                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isDeleting || !confirmDeleteChecked}
                        className="w-full py-2.5 rounded-xl bg-red-950/30 hover:bg-red-900/40 text-red-400 hover:text-red-300 border border-red-900/40 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {isDeleting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                            <span>Deleting...</span>
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4" />
                            <span>Delete Deal</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
