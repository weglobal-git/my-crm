"use client";

import { useState, useMemo } from "react";
import { Plus, X, AlignLeft, Info } from "lucide-react";
import { OpportunityType, PipelineStage } from "@prisma/client";
import { createOpportunity } from "@/lib/actions/opportunity";
import { getCompanies } from "@/lib/actions/company";
import { useDialog } from "@/providers/DialogProvider";
import { usePermissions } from "@/providers/PermissionProvider";
import { SearchableSelect } from "../ui/SearchableSelect";
import { DealTypeIcon } from "./DealTypeBadge";
import useSWR, { preload } from "swr";

interface CompanyOptionItem {
  id: string;
  name: string;
  displayName?: string | null;
  contacts?: { id: string; name: string }[];
}

interface CreateDealButtonProps {
  stages: PipelineStage[];
  companies?: CompanyOptionItem[];
}

export function CreateDealButton({ stages, companies }: CreateDealButtonProps) {
  const { canSee } = usePermissions();
  const canUseSalesDeal = canSee("pipeline.information");

  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [topic, setTopic] = useState("");
  const [selectedType, setSelectedType] = useState<OpportunityType>("SALES_DEAL");
  const type: OpportunityType = canUseSalesDeal ? selectedType : "INTERNAL_TASK";
  const [companyId, setCompanyId] = useState("");

  const { data: fetchedCompanies } = useSWR<CompanyOptionItem[]>(
    isOpen ? 'pipeline-companies' : null,
    getCompanies,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );
  const companyList = useMemo(
    () => companies || fetchedCompanies || [],
    [companies, fetchedCompanies]
  );

  const companyOptions = useMemo(() => {
    return companyList.map((c) => {
      const displayName = (c.displayName || c.name || "").trim();
      const contactNames = c.contacts?.map((contact) => contact.name).filter(Boolean).join(" ") || "";
      const searchTerms = `${displayName} ${c.name || ""} ${contactNames}`.trim();

      return {
        label: displayName,
        value: c.id,
        searchTerms,
      };
    });
  }, [companyList]);
  
  const { toast } = useDialog();

  const handleCreate = async () => {
    if (!topic.trim()) {
      toast({ title: "Topic is required", type: "error" });
      return;
    }

    if (type === "SALES_DEAL" && !companyId) {
      toast({ title: "Account is required for Sales Deals", type: "error" });
      return;
    }

    const firstStage = stages[0];
    if (!firstStage) {
      toast({ title: "No pipeline stages available", type: "error" });
      return;
    }

    setIsSubmitting(true);
    try {
      await createOpportunity({
        topic,
        type,
        companyId: companyId || undefined,
        pipelineStageId: firstStage.id,
      });
      toast({ title: "Created successfully", type: "success" });
      setIsOpen(false);
      setTopic("");
      setSelectedType("SALES_DEAL");
      setCompanyId("");
    } catch (e: unknown) {
      toast({ title: "Failed to create", description: e instanceof Error ? e.message : "Unknown error", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        onMouseEnter={() => preload('pipeline-companies', getCompanies)}
        className="flex items-center gap-2 bg-[#C7F33C] text-black px-4 py-2 rounded-full font-semibold hover:bg-[#b0d932] transition-colors text-sm"
      >
        <Plus className="w-4 h-4" />
        New
      </button>

      <div 
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`} 
        onClick={() => isSubmitting ? null : setIsOpen(false)}
      />
      
      <div className={`fixed inset-y-4 right-4 z-[101] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] origin-right ${isOpen ? "opacity-100 translate-x-0 scale-100" : "opacity-0 translate-x-8 scale-[0.97] pointer-events-none"}`}>
        <div className="w-[450px] max-w-[90vw] bg-[#252728] border border-[#3A3B3C] flex flex-col shadow-2xl h-full rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-[#1C1C1D] shrink-0">
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#C7F33C]" />
              Create New Card
            </h2>
            <button 
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-[#3A3B3C] rounded-full transition-colors text-slate-400 hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <div className="space-y-6">
              {/* Type Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider pl-1">Opportunity Type</label>
                {canUseSalesDeal ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedType("SALES_DEAL")}
                        className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm transition-all font-semibold ${
                          type === "SALES_DEAL" 
                            ? "border-[#C7F33C] bg-[#C7F33C]/10 text-[#C7F33C]" 
                            : "border-[#3A3B3C] bg-[#1E1F20] text-slate-300 hover:border-[#4E4F50]"
                        }`}
                      >
                        <DealTypeIcon type="SALES_DEAL" size="sm" />
                        <span>Sales Deal</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedType("INTERNAL_TASK")}
                        className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm transition-all font-semibold ${
                          type === "INTERNAL_TASK" 
                            ? "border-[#C7F33C] bg-[#C7F33C]/10 text-[#C7F33C]" 
                            : "border-[#3A3B3C] bg-[#1E1F20] text-slate-300 hover:border-[#4E4F50]"
                        }`}
                      >
                        <DealTypeIcon type="INTERNAL_TASK" size="sm" />
                        <span>Internal Task</span>
                      </button>
                    </div>
                    {type === "SALES_DEAL" && (
                      <div className="mt-2.5 flex items-start gap-2 text-[11px] text-slate-400 bg-[#1E1F20] border border-[#3A3B3C] rounded-lg px-3 py-2 leading-relaxed">
                        <Info className="w-3.5 h-3.5 text-[#C7F33C] shrink-0 mt-0.5" />
                        <span>
                          Note: Sales Deals require <strong>Total Value</strong>, <strong>Currency</strong>, <strong>Goods Loading Date</strong>, and <strong>Invoice Number</strong> to be marked as Won.
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-xl border border-slate-700 bg-[#1E1F20] text-slate-200 text-sm font-semibold">
                    <DealTypeIcon type="INTERNAL_TASK" size="sm" />
                    Internal Task
                  </div>
                )}
              </div>

              {/* Topic Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider pl-1">Topic / Title</label>
                <div className="relative">
                  <AlignLeft className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Website Redesign"
                    className="w-full bg-[#1E1F20] border border-[#3A3B3C] rounded-lg py-2.5 pl-10 pr-4 text-slate-100 focus:outline-none focus:border-[#C7F33C] transition-colors text-sm"
                  />
                </div>
              </div>

              {/* Account Linking */}
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider pl-1">
                  Link Account {type === "SALES_DEAL" ? (
                    <span className="text-rose-500">*</span>
                  ) : (
                    <span className="text-slate-500 text-[11px] font-normal lowercase tracking-normal ml-1">(optional)</span>
                  )}
                </label>
                <SearchableSelect
                  options={companyOptions}
                  value={companyId}
                  onChange={setCompanyId}
                  isClearable={true}
                  placeholder={
                    companyList.length === 0
                      ? "Loading accounts..."
                      : type === "SALES_DEAL"
                      ? "Select an account..."
                      : "Select an account (optional)..."
                  }
                />
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-[#1C1C1D] shrink-0 bg-[#252728] flex justify-end gap-3">
            <button 
              onClick={() => setIsOpen(false)}
              className="px-5 py-2.5 text-sm font-semibold text-slate-300 hover:text-white transition-colors hover:bg-[#3A3B3C] rounded-lg"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button 
              onClick={handleCreate}
              disabled={isSubmitting}
              className="px-5 py-2.5 text-sm font-bold bg-[#C7F33C] text-black rounded-lg hover:bg-[#b0d932] transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? "Creating..." : (
                <>
                  <Plus className="w-4 h-4" />
                  Create Card
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
