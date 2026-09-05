"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Bot, 
  X, 
  Settings, 
  RefreshCw, 
  Sparkles, 
  Check, 
  Loader2, 
  Edit3, 
  Building2, 
  TrendingUp, 
  ShieldCheck, 
  Target, 
  MessageSquareQuote,
  Copy,
  Zap
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useDialog } from "@/providers/DialogProvider";
import { 
  getCachedAccountAnalysis, 
  getAccountBehaviorAnalysis, 
  getAccountAIPromptConfig, 
  saveAccountAIPromptConfig, 
  resetAccountAIPromptConfig,
  updateCompanyBusinessProfile,
  AccountBehaviorAnalysis 
} from "@/lib/actions/account-ai";

interface AccountAISummaryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string | null;
  companyName?: string;
  companyType?: string;
  country?: string | null;
  onAnalysisUpdated?: (analysis: AccountBehaviorAnalysis) => void;
}

export function AccountAISummaryPanel({
  isOpen,
  onClose,
  companyId,
  companyName = "Account",
  companyType = "CUSTOMER",
  country,
  onAnalysisUpdated,
}: AccountAISummaryPanelProps) {
  const { data: session } = useSession();
  const { toast } = useDialog();
  const isAdmin = session?.user?.role === "ADMIN";

  const [activeTab, setActiveTab] = useState<"summary" | "prompt">("summary");
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Analysis state
  const [analysis, setAnalysis] = useState<AccountBehaviorAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUpToDate, setIsUpToDate] = useState(true);
  const [isCopied, setIsCopied] = useState(false);

  // Inline Profile Edit state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editedSummary, setEditedSummary] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Prompt settings state
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [systemInstruction, setSystemInstruction] = useState("");
  const [taskInstruction, setTaskInstruction] = useState("");
  const [jsonSchema, setJsonSchema] = useState("");

  const systemRef = useRef<HTMLTextAreaElement | null>(null);
  const taskRef = useRef<HTMLTextAreaElement | null>(null);
  const schemaRef = useRef<HTMLTextAreaElement | null>(null);

  // Animation lifecycle
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setMounted(true);
        setInternalIsOpen(true);
      }, 10);
      return () => clearTimeout(timer);
    } else {
      const closeTimer = setTimeout(() => setInternalIsOpen(false), 0);
      const unmountTimer = setTimeout(() => setMounted(false), 300);
      return () => {
        clearTimeout(closeTimer);
        clearTimeout(unmountTimer);
      };
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Load cached analysis when opened
  useEffect(() => {
    if (!isOpen || !companyId) return;

    let isMounted = true;
    queueMicrotask(() => {
      if (isMounted) setIsLoading(true);
    });

    getCachedAccountAnalysis(companyId)
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data) {
          setAnalysis(res.data);
          setIsUpToDate(res.isUpToDate !== false);
          setEditedSummary(res.data.companyProfile?.businessSummary || "");
        } else {
          setAnalysis(null);
          setIsUpToDate(false);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Error loading account analysis:", err);
        setAnalysis(null);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, companyId]);

  // Load prompt config when switching to prompt tab
  const handleLoadPromptConfig = async () => {
    setIsLoadingPrompt(true);
    try {
      const cfg = await getAccountAIPromptConfig();
      setSystemInstruction(cfg.systemInstruction);
      setTaskInstruction(cfg.taskInstruction);
      setJsonSchema(cfg.jsonSchema);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load prompt configuration";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsLoadingPrompt(false);
    }
  };

  // Trigger analysis
  const handleRunAnalysis = async () => {
    if (!companyId) return;

    setIsAnalyzing(true);
    try {
      const res = await getAccountBehaviorAnalysis(companyId);
      if (res.success && res.data) {
        setAnalysis(res.data);
        setIsUpToDate(true);
        setEditedSummary(res.data.companyProfile?.businessSummary || "");
        onAnalysisUpdated?.(res.data);
        toast({
          title: "Analysis Ready",
          description: `Account intelligence updated for ${companyName}.`,
          type: "success",
        });
      } else {
        throw new Error(res.error || "Failed to analyze account");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error analyzing account";
      toast({ title: "Analysis Failed", description: msg, type: "error" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Save user-edited business profile
  const handleSaveProfile = async () => {
    if (!companyId || !editedSummary.trim()) return;

    setIsSavingProfile(true);
    try {
      const res = await updateCompanyBusinessProfile(companyId, editedSummary);
      if (res.success && res.data) {
        setAnalysis(res.data);
        setIsEditingProfile(false);
        onAnalysisUpdated?.(res.data);
        toast({
          title: "Profile Saved",
          description: "Company business background updated and saved.",
          type: "success",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update profile";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleCopyAnalysis = () => {
    if (!analysis) return;

    const lines = [
      `# Account AI Analysis: ${companyName}`,
      `Account Type: ${companyType} | Country: ${country || "N/A"}`,
      `Generated: ${new Date(analysis.generatedAt).toLocaleString("en-GB")}`,
      "",
      `## Persona`,
      `${analysis.persona} (Engagement: ${analysis.engagementScore}/100)`,
      "",
      `## Company Profile & Business Context`,
      analysis.companyProfile?.businessSummary || "-",
      "",
      `## Purchasing Behavior & Timeline`,
      `- Order Frequency: ${analysis.purchasingPattern?.orderFrequency || "-"}`,
      `- Decision Cycle: ${analysis.purchasingPattern?.cycleTime || "-"}`,
      `- Price Sensitivity: ${analysis.purchasingPattern?.priceSensitivity || "-"}`,
      `- Avg Deal Size: ${analysis.purchasingPattern?.avgDealSize || "-"}`,
      "",
      `## Relationship SWOT Insights`,
      `Strengths:`,
      ...(analysis.swot?.strengths?.map((s) => `• ${s}`) || ["• -"]),
      `Weaknesses:`,
      ...(analysis.swot?.weaknesses?.map((w) => `• ${w}`) || ["• -"]),
      `Risks:`,
      ...(analysis.swot?.risks?.map((r) => `• ${r}`) || ["• -"]),
      "",
      `## Negotiation Playbook & Strategy`,
      `Strategy: ${analysis.negotiationPlaybook?.strategy || "-"}`,
      `Talking Points:`,
      ...(analysis.negotiationPlaybook?.talkingPoints?.map((tp) => `• "${tp}"`) || ["• -"]),
      "",
      `## Growth Opportunities & Target Goals`,
      `Target Goal: ${analysis.growthOpportunities?.targetGoal || "-"}`,
      `Expansion Vectors:`,
      ...(analysis.growthOpportunities?.expansionAreas?.map((a) => `• ${a}`) || ["• -"]),
    ];

    navigator.clipboard.writeText(lines.join("\n"));
    setIsCopied(true);
    toast({
      title: "Copied to Clipboard",
      description: "Account AI analysis markdown copied.",
      type: "success",
    });
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Save prompt config
  const handleSavePrompt = async () => {
    setIsSavingPrompt(true);
    try {
      await saveAccountAIPromptConfig({
        systemInstruction,
        taskInstruction,
        jsonSchema,
      });
      toast({
        title: "Prompt Saved",
        description: "Account AI prompt configuration updated successfully.",
        type: "success",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save prompt configuration";
      toast({ title: "Save Failed", description: msg, type: "error" });
    } finally {
      setIsSavingPrompt(false);
    }
  };

  // Reset prompt config
  const handleResetPrompt = async () => {
    setIsSavingPrompt(true);
    try {
      const res = await resetAccountAIPromptConfig();
      if (res.success && res.data) {
        setSystemInstruction(res.data.systemInstruction);
        setTaskInstruction(res.data.taskInstruction);
        setJsonSchema(res.data.jsonSchema);
        toast({
          title: "Reset Successful",
          description: "Prompts have been reset to system defaults.",
          type: "success",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reset prompts";
      toast({ title: "Reset Failed", description: msg, type: "error" });
    } finally {
      setIsSavingPrompt(false);
    }
  };

  if (!isOpen && !mounted) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] transition-opacity duration-300 ${
          internalIsOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Slide-over Container */}
      <div
        className={`fixed inset-y-4 right-4 z-[101] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] origin-right ${
          internalIsOpen
            ? "opacity-100 translate-x-0 scale-100"
            : "opacity-0 translate-x-8 scale-[0.97] pointer-events-none"
        }`}
      >
        <div className="w-[620px] max-w-[95vw] bg-[#252728] border border-[#3A3B3C] flex flex-col h-full rounded-2xl overflow-hidden">
          
          {/* Header */}
          <div className="px-6 py-5 border-b border-[#1C1C1D] shrink-0 bg-[#252728]">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[#1C1C1D] border border-[#3A3B3C] flex items-center justify-center shrink-0 text-[#C7F33C]">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <h3 className="text-lg font-bold text-slate-100 truncate">
                    Account AI Analysis
                  </h3>
                  <span className="text-xs text-slate-400 truncate">
                    {companyName}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Mode Selector Tabs */}
                <div className="flex items-center gap-1.5 p-1 bg-[#1C1C1D] rounded-full border border-[#3A3B3C]">
                  <button
                    type="button"
                    onClick={() => setActiveTab("summary")}
                    className={`px-3.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      activeTab === "summary"
                        ? "bg-[#C7F33C] text-black"
                        : "text-slate-300 hover:text-white"
                    }`}
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span>Summary</span>
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("prompt");
                        handleLoadPromptConfig();
                      }}
                      className={`px-3.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        activeTab === "prompt"
                          ? "bg-[#C7F33C] text-black"
                          : "text-slate-300 hover:text-white"
                      }`}
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Prompt Settings</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 hover:bg-[#3A3B3C] rounded-full transition-colors text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Sub-header status bar */}
            {activeTab === "summary" && (
              <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-[#1C1C1D] flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">
                    {analysis?.generatedAt
                      ? `Last analyzed: ${new Date(analysis.generatedAt).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : "No analysis generated yet"}
                  </span>

                  {analysis?.generatedAt && (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5 ${
                        isUpToDate
                          ? "bg-[#3A3B3C] text-slate-300 border border-[#4E4F50]"
                          : "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isUpToDate ? "bg-[#C7F33C]" : "bg-amber-400 animate-pulse"
                        }`}
                      />
                      <span>{isUpToDate ? "Up to date" : "New updates available"}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
            {activeTab === "summary" ? (
              <>
                {/* 1. Loading State */}
                {isLoading && (
                  <div className="space-y-4 animate-pulse">
                    <div className="h-32 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]" />
                    <div className="h-28 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]" />
                    <div className="h-36 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]" />
                  </div>
                )}

                {/* 2. Generating in Progress */}
                {!isLoading && isAnalyzing && (
                  <div className="flex flex-col items-center justify-center p-8 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] text-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#C7F33C]/10 border border-[#C7F33C]/30 flex items-center justify-center text-[#C7F33C] animate-pulse">
                      <Sparkles className="w-6 h-6 animate-spin" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-slate-100">
                        Analyzing Account Context & Deal History...
                      </h4>
                      <p className="text-xs text-slate-400 max-w-sm">
                        Synthesizing company business model, deal velocity, negotiation style, and expansion strategy.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#C7F33C]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Takes around 3–5 seconds</span>
                    </div>
                  </div>
                )}

                {/* 3. Empty State */}
                {!isLoading && !isAnalyzing && !analysis && (
                  <div className="flex flex-col items-center justify-center p-8 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] text-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#C7F33C]/10 border border-[#C7F33C]/30 flex items-center justify-center text-[#C7F33C]">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div className="space-y-1 max-w-sm">
                      <h4 className="text-base font-bold text-slate-100">
                        No Analysis Generated Yet
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Generate comprehensive B2B customer behavior intelligence, SWOT insights, and tailored negotiation strategy for {companyName}.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRunAnalysis}
                      className="px-5 py-2 rounded-full bg-[#C7F33C] hover:bg-[#b0d635] text-black font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>✨ Generate Account Analysis</span>
                    </button>
                  </div>
                )}

                {/* 4. Ready State: 5-Card Intelligence Model */}
                {!isLoading && !isAnalyzing && analysis && (
                  <div className="space-y-4">
                    
                    {/* Persona Header Tag */}
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[#3A3B3C] border border-[#4E4F50]">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-medium">Persona:</span>
                        <span className="text-xs font-bold text-[#C7F33C]">{analysis.persona}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>Engagement:</span>
                        <span className="font-bold text-slate-200">{analysis.engagementScore}/100</span>
                      </div>
                    </div>

                    {/* CARD 1: 🏢 Company Profile & Business Nature (Editable) */}
                    <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-[#C7F33C]" />
                          <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                            Company Profile & Business Context
                          </span>
                        </div>
                        
                        {!isEditingProfile && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditedSummary(analysis.companyProfile?.businessSummary || "");
                              setIsEditingProfile(true);
                            }}
                            className="text-xs text-slate-400 hover:text-[#C7F33C] flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit Profile</span>
                          </button>
                        )}
                      </div>

                      {/* Badges row: Account Type & Country */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-full bg-[#252728] text-xs font-bold text-slate-200 border border-[#4E4F50]">
                          Type: {companyType}
                        </span>
                        {country && (
                          <span className="px-2.5 py-0.5 rounded-full bg-[#252728] text-xs font-bold text-slate-200 border border-[#4E4F50]">
                            Country: {country}
                          </span>
                        )}
                        {analysis.companyProfile?.isUserEdited && (
                          <span className="px-2 py-0.5 rounded-full bg-[#C7F33C]/10 text-[#C7F33C] text-[10px] font-semibold border border-[#C7F33C]/30">
                            User Verified
                          </span>
                        )}
                      </div>

                      {/* Description / Edit mode */}
                      {isEditingProfile ? (
                        <div className="space-y-2 pt-1">
                          <textarea
                            value={editedSummary}
                            onChange={(e) => setEditedSummary(e.target.value)}
                            rows={3}
                            placeholder="Describe what this company does, their primary market, or key operational details..."
                            className="w-full bg-[#252728] border border-[#C7F33C] rounded-xl p-3 text-xs text-slate-100 leading-relaxed focus:outline-none"
                            autoFocus
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setIsEditingProfile(false)}
                              className="px-3 py-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={isSavingProfile}
                              onClick={handleSaveProfile}
                              className="px-4 py-1 rounded-full bg-[#C7F33C] text-black text-xs font-bold hover:bg-[#b0d635] transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                            >
                              {isSavingProfile ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              <span>Save</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-200 leading-relaxed font-normal">
                          {analysis.companyProfile?.businessSummary || "No detailed business summary recorded yet."}
                        </p>
                      )}
                    </div>

                    {/* CARD 2: 📊 Purchasing Behavior & Negotiation Characteristics */}
                    <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] space-y-3">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-[#C7F33C]" />
                        <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                          Purchasing Behavior & Timeline
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="p-3 bg-[#252728] rounded-xl border border-[#4E4F50]/60 space-y-1">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Order Frequency</span>
                          <span className="text-xs font-semibold text-slate-100 block">
                            {analysis.purchasingPattern?.orderFrequency || "-"}
                          </span>
                        </div>

                        <div className="p-3 bg-[#252728] rounded-xl border border-[#4E4F50]/60 space-y-1">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Decision Cycle</span>
                          <span className="text-xs font-semibold text-slate-100 block">
                            {analysis.purchasingPattern?.cycleTime || "-"}
                          </span>
                        </div>

                        <div className="p-3 bg-[#252728] rounded-xl border border-[#4E4F50]/60 space-y-1">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Price Sensitivity</span>
                          <span className="text-xs font-semibold text-slate-100 block">
                            {analysis.purchasingPattern?.priceSensitivity || "-"}
                          </span>
                        </div>

                        <div className="p-3 bg-[#252728] rounded-xl border border-[#4E4F50]/60 space-y-1">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Avg Deal Size</span>
                          <span className="text-xs font-semibold text-slate-100 block text-[#C7F33C]">
                            {analysis.purchasingPattern?.avgDealSize || "-"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* CARD 3: ⚖️ SWOT Analysis */}
                    <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] space-y-3">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-[#C7F33C]" />
                        <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                          Relationship SWOT Insights
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {/* Strengths */}
                        <div>
                          <span className="text-[11px] font-bold text-[#C7F33C] block mb-1">
                            Strengths & Partnership Leverage
                          </span>
                          <ul className="space-y-1.5">
                            {analysis.swot?.strengths?.map((s, idx) => (
                              <li key={idx} className="text-xs text-slate-200 flex items-start gap-2 leading-relaxed">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#C7F33C] mt-1.5 shrink-0" />
                                <span>{s}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Weaknesses */}
                        <div>
                          <span className="text-[11px] font-bold text-amber-400 block mb-1">
                            Weaknesses & Account Constraints
                          </span>
                          <ul className="space-y-1.5">
                            {analysis.swot?.weaknesses?.map((w, idx) => (
                              <li key={idx} className="text-xs text-slate-200 flex items-start gap-2 leading-relaxed">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                                <span>{w}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Risks */}
                        <div>
                          <span className="text-[11px] font-bold text-rose-400 block mb-1">
                            Risks & Market Threats
                          </span>
                          <ul className="space-y-1.5">
                            {analysis.swot?.risks?.map((r, idx) => (
                              <li key={idx} className="text-xs text-slate-200 flex items-start gap-2 leading-relaxed">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                                <span>{r}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* CARD 4: 🎯 Tactical Negotiation Playbook & Talking Points */}
                    <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] space-y-3">
                      <div className="flex items-center gap-2">
                        <MessageSquareQuote className="w-4 h-4 text-[#C7F33C]" />
                        <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                          Negotiation Strategy & Talking Points
                        </span>
                      </div>

                      <div className="p-3 bg-[#252728] rounded-xl border border-[#4E4F50]/60 space-y-1.5">
                        <span className="text-[10px] font-bold text-[#C7F33C] uppercase tracking-wider block">Recommended Stance</span>
                        <p className="text-xs text-slate-200 leading-relaxed">
                          {analysis.negotiationPlaybook?.strategy || "-"}
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-300 block">Key Talking Points for Next Meeting</span>
                        <ul className="space-y-1.5">
                          {analysis.negotiationPlaybook?.talkingPoints?.map((tp, idx) => (
                            <li key={idx} className="text-xs text-slate-200 flex items-start gap-2 leading-relaxed">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#C7F33C] mt-1.5 shrink-0" />
                              <span className="italic font-medium text-slate-100">&quot;{tp}&quot;</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* CARD 5: 📈 Revenue Expansion & Cross-Sell Opportunities */}
                    <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] space-y-3">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-[#C7F33C]" />
                        <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                          Growth Opportunities & Revenue Expansion
                        </span>
                      </div>

                      <div className="p-3 bg-[#252728] rounded-xl border border-[#4E4F50]/60 space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Account Revenue Goal</span>
                        <p className="text-xs font-bold text-[#C7F33C] leading-relaxed">
                          {analysis.growthOpportunities?.targetGoal || "-"}
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-300 block">Expansion & Cross-Sell Vectors</span>
                        <ul className="space-y-1.5">
                          {analysis.growthOpportunities?.expansionAreas?.map((area, idx) => (
                            <li key={idx} className="text-xs text-slate-200 flex items-start gap-2 leading-relaxed">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#C7F33C] mt-1.5 shrink-0" />
                              <span>{area}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                  </div>
                )}
              </>
            ) : (
              /* Prompt Settings Tab (Admin only) */
              <div className="space-y-4">
                {isLoadingPrompt ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <Loader2 className="w-8 h-8 text-[#C7F33C] animate-spin" />
                    <p className="text-xs text-slate-400">Loading prompt configuration...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* 1. System Instruction */}
                    <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] space-y-2">
                      <span className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                        1. System Instruction (Core Persona & Context Rules)
                      </span>
                      <textarea
                        ref={systemRef}
                        value={systemInstruction}
                        onChange={(e) => setSystemInstruction(e.target.value)}
                        rows={6}
                        className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl p-3 text-xs text-slate-100 font-mono leading-relaxed focus:border-[#C7F33C] focus:outline-none resize-y"
                      />
                    </div>

                    {/* 2. Task Instruction */}
                    <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] space-y-2">
                      <span className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                        2. Task Instructions (Analysis Dimensions)
                      </span>
                      <textarea
                        ref={taskRef}
                        value={taskInstruction}
                        onChange={(e) => setTaskInstruction(e.target.value)}
                        rows={6}
                        className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl p-3 text-xs text-slate-100 font-mono leading-relaxed focus:border-[#C7F33C] focus:outline-none resize-y"
                      />
                    </div>

                    {/* 3. JSON Schema */}
                    <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] space-y-2">
                      <span className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                        3. JSON Schema (Structured Output Definition)
                      </span>
                      <textarea
                        ref={schemaRef}
                        value={jsonSchema}
                        onChange={(e) => setJsonSchema(e.target.value)}
                        rows={8}
                        className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl p-3 text-xs text-slate-100 font-mono leading-relaxed focus:border-[#C7F33C] focus:outline-none resize-y"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-3 border-t border-[#4E4F50]">
                      <button
                        type="button"
                        onClick={handleResetPrompt}
                        disabled={isSavingPrompt || isLoadingPrompt}
                        className="px-4 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        Reset to Default
                      </button>

                      <button
                        type="button"
                        onClick={handleSavePrompt}
                        disabled={isSavingPrompt || isLoadingPrompt}
                        className="px-5 py-2 text-xs font-bold bg-[#C7F33C] hover:bg-[#b0d635] text-black rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        {isSavingPrompt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        <span>Save Prompt</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions matching EditDealPanel (Only on Summary Tab) */}
          {activeTab === "summary" && (
            <div className="flex items-center justify-between p-4 px-6 border-t border-[#3A3B3C] bg-[#252728] shrink-0">
              <div className="flex items-center justify-between w-full">
                {analysis?.usage ? (
                  <div
                    className="text-xs px-2.5 py-2 rounded-xl bg-[#1C1C1D] text-slate-300 flex items-center gap-1.5 font-mono border border-[#3A3B3C]"
                    title={`Tokens: ${analysis.usage.inputTokens.toLocaleString()} input, ${analysis.usage.outputTokens.toLocaleString()} output`}
                  >
                    <Zap className="w-3.5 h-3.5 text-[#C7F33C]" />
                    <span>{analysis.usage.totalTokens.toLocaleString()} tokens</span>
                    <span className="text-[#4E4F50]">•</span>
                    <span className="text-[#C7F33C] font-semibold">
                      ≈ {analysis.usage.costThb < 0.01 ? "<0.01" : analysis.usage.costThb.toFixed(2)} THB
                    </span>
                  </div>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyAnalysis}
                    disabled={!analysis}
                    className="px-4 py-2 rounded-xl bg-[#3A3B3C] hover:bg-[#4E4F50] text-sm font-medium text-slate-200 hover:text-white flex items-center gap-2 transition-colors cursor-pointer border border-[#4E4F50] disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Copy summary to clipboard"
                  >
                    {isCopied ? (
                      <Check className="w-4 h-4 text-[#C7F33C]" />
                    ) : (
                      <Copy className="w-4 h-4 text-slate-400" />
                    )}
                    <span>{isCopied ? "Copied" : "Copy"}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onClick={handleRunAnalysis}
                    className="px-5 py-2 rounded-xl bg-[#C7F33C] hover:bg-[#b0d635] text-black font-bold text-sm flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                    title="Re-analyze and update summary"
                  >
                    <RefreshCw className={`w-4 h-4 ${isAnalyzing ? "animate-spin" : ""}`} />
                    <span>{isAnalyzing ? "Analyzing..." : "Re-Analyse"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
