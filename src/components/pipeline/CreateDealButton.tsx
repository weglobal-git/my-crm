"use client";

import { useState } from "react";
import { Plus, X, AlignLeft, Briefcase, Wrench } from "lucide-react";
import { OpportunityType, PipelineStage } from "@prisma/client";
import { createOpportunity } from "@/lib/actions/opportunity";
import { useDialog } from "@/providers/DialogProvider";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "../ui/SearchableSelect";

interface CreateDealButtonProps {
  stages: PipelineStage[];
  companies: { id: string; name: string }[];
  currentUserId: string;
}

export function CreateDealButton({ stages, companies, currentUserId }: CreateDealButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [topic, setTopic] = useState("");
  const [type, setType] = useState<OpportunityType>("SALES_DEAL");
  const [companyId, setCompanyId] = useState("");
  
  const { toast } = useDialog();
  const router = useRouter();

  const handleCreate = async () => {
    if (!topic.trim()) {
      toast({ title: "Topic is required", type: "error" });
      return;
    }

    if (type === "SALES_DEAL" && !companyId) {
      toast({ title: "Customer is required for Sales Deals", type: "error" });
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
        ownerId: currentUserId,
        pipelineStageId: firstStage.id,
      });
      toast({ title: "Created successfully", type: "success" });
      setIsOpen(false);
      setTopic("");
      setType("SALES_DEAL");
      setCompanyId("");
      router.refresh();
    } catch (e: any) {
      toast({ title: "Failed to create", description: e.message, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 bg-[#C7F33C] text-black px-4 py-2 rounded-full font-semibold hover:bg-[#b0d932] transition-colors text-sm"
      >
        <Plus className="w-4 h-4" />
        New Card
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
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setType("SALES_DEAL")}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-sm transition-all font-semibold ${
                      type === "SALES_DEAL" 
                        ? "border-[#C7F33C] bg-[#C7F33C]/10 text-[#C7F33C]" 
                        : "border-[#3A3B3C] bg-[#1E1F20] text-slate-300 hover:border-[#4E4F50]"
                    }`}
                  >
                    <Briefcase className="w-4 h-4" />
                    Sales Deal
                  </button>
                  <button
                    onClick={() => setType("INTERNAL_TASK")}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-sm transition-all font-semibold ${
                      type === "INTERNAL_TASK" 
                        ? "border-slate-300 bg-slate-800 text-slate-100" 
                        : "border-[#3A3B3C] bg-[#1E1F20] text-slate-300 hover:border-[#4E4F50]"
                    }`}
                  >
                    <Wrench className="w-4 h-4" />
                    Internal Task
                  </button>
                </div>
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

              {/* Customer Linking - Only required/shown for Sales Deal */}
              {type === "SALES_DEAL" && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider pl-1">
                    Link Customer <span className="text-rose-500">*</span>
                  </label>
                  <SearchableSelect
                    options={companies.map(c => ({ label: c.name, value: c.id }))}
                    value={companyId}
                    onChange={setCompanyId}
                    placeholder="Select a customer..."
                  />
                </div>
              )}
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
