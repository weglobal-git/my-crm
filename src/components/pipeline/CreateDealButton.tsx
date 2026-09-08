"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Plus, X, AlignLeft, Info, UserPlus } from "lucide-react";
import { OpportunityType, PipelineStage } from "@prisma/client";
import { createOpportunity } from "@/lib/actions/opportunity";
import { getCompanies } from "@/lib/actions/company";
import { getAllUsers } from "@/lib/actions/users";
import { useDialog } from "@/providers/DialogProvider";
import { usePermissions } from "@/providers/PermissionProvider";
import { SearchableSelect } from "../ui/SearchableSelect";
import { DealTypeIcon } from "./DealTypeBadge";
import { MemberSelectDrawer, UserItem } from "./MemberSelectDrawer";
import useSWR, { preload } from "swr";
import { useSession } from "next-auth/react";

interface CompanyOptionItem {
  id: string;
  name: string;
  displayName?: string | null;
  contacts?: { id: string; name: string }[];
}

interface CreateDealButtonProps {
  stages: PipelineStage[];
  companies?: CompanyOptionItem[];
  disabled?: boolean;
}

export function CreateDealButton({ stages, companies, disabled = false }: CreateDealButtonProps) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  const { canSee } = usePermissions();
  const canUseSalesDeal = canSee("pipeline.information");

  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [topic, setTopic] = useState("");
  const [selectedType, setSelectedType] = useState<OpportunityType>("SALES_DEAL");
  const type: OpportunityType = canUseSalesDeal ? selectedType : "INTERNAL_TASK";
  const [companyId, setCompanyId] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isMemberDrawerOpen, setIsMemberDrawerOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (isSubmitting || isMemberDrawerOpen) return;
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting && !isMemberDrawerOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isSubmitting, isMemberDrawerOpen]);

  const { data: fetchedCompanies } = useSWR<CompanyOptionItem[]>(
    isOpen ? 'pipeline-companies' : null,
    getCompanies,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  const { data: allUsers = [] } = useSWR<UserItem[]>(
    isOpen ? 'all-users' : null,
    getAllUsers,
    { revalidateOnFocus: false, dedupingInterval: 120_000 }
  );
  const allUsersMap = useMemo(() => new Map(allUsers.map((u) => [u.id, u])), [allUsers]);

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
        teamMemberIds: selectedMemberIds.length > 0 ? selectedMemberIds : undefined,
      });
      toast({ title: "Created successfully", type: "success" });
      setIsOpen(false);
      setTopic("");
      setSelectedType("SALES_DEAL");
      setCompanyId("");
      setSelectedMemberIds([]);
    } catch (e: unknown) {
      toast({ title: "Failed to create", description: e instanceof Error ? e.message : "Unknown error", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(true)}
        onMouseEnter={() => {
          if (!disabled) {
            void preload('pipeline-companies', getCompanies);
            void preload('all-users', getAllUsers);
          }
        }}
        className={`flex items-center px-4 py-2 rounded-full font-semibold transition-all text-xs select-none ${
          disabled
            ? "bg-[#3A3B3C]/80 text-slate-500 cursor-not-allowed border border-[#4E4F50]/40 shadow-none opacity-60"
            : "bg-[#C7F33C] text-black hover:bg-[#b0d932] cursor-pointer shadow-sm"
        }`}
        title={disabled ? "Disabled in Completed view" : "Create New Card"}
      >
        <Plus className={`w-4 h-4 mr-0.5 ${disabled ? "text-slate-500" : "text-black"}`} />
        New
      </button>

      <div 
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`} 
        onClick={() => isSubmitting ? null : setIsOpen(false)}
      />
      
      <div className={`fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[450px] md:max-w-[calc(100vw-32px)] z-[101] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right ${isOpen ? "opacity-100 translate-y-0 md:translate-x-0 scale-100" : "opacity-0 translate-y-4 md:translate-x-8 scale-[0.97] pointer-events-none"}`}>
        <div ref={modalRef} className="w-full bg-[#252728] border-0 md:border border-[#3A3B3C] flex flex-col h-full rounded-none md:rounded-2xl overflow-hidden">
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
                        className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs transition-all font-semibold ${
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
                        className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs transition-all font-semibold ${
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
                      <div className="mt-2.5 flex items-start gap-2 text-xs text-slate-400 bg-[#1E1F20] border border-[#3A3B3C] rounded-lg px-3 py-2 leading-relaxed">
                        <Info className="w-3.5 h-3.5 text-[#C7F33C] shrink-0 mt-0.5" />
                        <span>
                          Note: Sales Deals require <strong>Total Value</strong>, <strong>Currency</strong>, <strong>Goods Loading Date</strong>, and <strong>Invoice Number</strong> to be marked as Won.
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-xl border border-slate-700 bg-[#1E1F20] text-slate-200 text-xs font-semibold">
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
                    className="w-full bg-[#1E1F20] border border-[#3A3B3C] rounded-lg py-2.5 pl-10 pr-4 text-slate-100 focus:outline-none focus:border-[#C7F33C] transition-colors text-xs"
                  />
                </div>
              </div>

              {/* Account Linking */}
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider pl-1">
                  Link Account {type === "SALES_DEAL" ? (
                    <span className="text-rose-500">*</span>
                  ) : (
                    <span className="text-slate-500 text-xs font-normal lowercase tracking-normal ml-1">(optional)</span>
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

              {/* Team Members */}
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider pl-1 flex items-center justify-between">
                  <span>Team Members</span>
                  {selectedMemberIds.length > 0 && (
                    <span className="text-slate-400 text-xs font-normal lowercase tracking-normal">
                      {selectedMemberIds.length} selected
                    </span>
                  )}
                </label>
                <div className="bg-[#1E1F20] border border-[#3A3B3C] rounded-xl p-3 min-h-[50px] flex flex-wrap items-center gap-2">
                  {selectedMemberIds.map((id) => {
                    const u = allUsersMap.get(id);
                    if (!u) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1.5 bg-[#252728] border border-[#4E4F50] pl-1 pr-2 py-1 rounded-full text-xs text-slate-200"
                      >
                        <div className="w-5 h-5 rounded-full overflow-hidden bg-[#4E4F50] shrink-0">
                          <img
                            src={u.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${u.name || u.email || id}`}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="font-medium max-w-[120px] truncate">{u.name || u.email}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMemberIds((prev) => prev.filter((mId) => mId !== id));
                          }}
                          className="text-slate-400 hover:text-rose-400 p-0.5 rounded-full transition-colors cursor-pointer"
                          title="Remove member"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setIsMemberDrawerOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed border-[#4E4F50] text-slate-400 hover:text-[#C7F33C] hover:border-[#C7F33C] hover:bg-[#C7F33C]/5 text-xs font-semibold transition-all cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{selectedMemberIds.length > 0 ? "Add more" : "Add team members"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-[#1C1C1D] shrink-0 bg-[#252728] flex justify-end gap-3">
            <button 
              onClick={() => setIsOpen(false)}
              className="px-5 py-2.5 text-xs font-semibold text-slate-300 hover:text-white transition-colors hover:bg-[#3A3B3C] rounded-lg"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button 
              onClick={handleCreate}
              disabled={isSubmitting}
              className="px-5 py-2.5 text-xs font-bold bg-[#C7F33C] text-black rounded-lg hover:bg-[#b0d932] transition-colors disabled:opacity-50 flex items-center gap-2"
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

      {/* Shared Member Select Drawer */}
      <MemberSelectDrawer
        isOpen={isMemberDrawerOpen}
        onClose={() => setIsMemberDrawerOpen(false)}
        title="Invite Team Members"
        subtitle="Select department or individual members to add to this card."
        mode="multiple"
        currentOwnerId={currentUserId}
        excludeUserIds={currentUserId ? [currentUserId] : []}
        initialSelectedUserIds={selectedMemberIds}
        confirmButtonLabel="Confirm Selection"
        onConfirmMultiple={(userIds) => {
          setSelectedMemberIds(userIds);
          setIsMemberDrawerOpen(false);
        }}
      />
    </>
  );
}
