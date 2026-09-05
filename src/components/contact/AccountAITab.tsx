"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Bot, 
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
  Zap,
  Globe,
  ExternalLink,
  X,
  Plus,
  Trash2,
  Search
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
  getCachedWebIntelligence,
  researchCompanyWebIntelligence,
  saveCompanyWebIntelligence,
  AccountBehaviorAnalysis,
  WebIntelligenceData
} from "@/lib/actions/account-ai";

interface AccountAITabProps {
  companyId: string | null;
  companyName?: string;
  companyType?: string;
  country?: string | null;
  onAnalysisUpdated?: (analysis: AccountBehaviorAnalysis) => void;
  onBusinessSummaryUpdated?: (summary: string) => void;
}

export function AccountAITab({
  companyId,
  companyName = "Account",
  companyType = "CUSTOMER",
  country,
  onAnalysisUpdated,
  onBusinessSummaryUpdated,
}: AccountAITabProps) {
  const { data: session } = useSession();
  const { toast } = useDialog();
  const isAdmin = session?.user?.role === "ADMIN";

  const [activeTab, setActiveTab] = useState<"summary" | "research" | "prompt">("summary");

  // Analysis state
  const [analysis, setAnalysis] = useState<AccountBehaviorAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUpToDate, setIsUpToDate] = useState(true);
  const [isCopied, setIsCopied] = useState(false);

  // Web Intelligence state
  const [webIntel, setWebIntel] = useState<WebIntelligenceData | null>(null);
  const [searchQuery, setSearchQuery] = useState(`${companyName} ${country || ""}`.trim());
  const [isSearching, setIsSearching] = useState(false);
  const [isWebCopied, setIsWebCopied] = useState(false);
  const [newProductInput, setNewProductInput] = useState("");

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

  const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    if (activeTab === 'prompt') {
      const timer = setTimeout(() => {
        autoResizeTextarea(systemRef.current);
        autoResizeTextarea(taskRef.current);
        autoResizeTextarea(schemaRef.current);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeTab, systemInstruction, taskInstruction, jsonSchema]);

  // Load cached analysis & web intelligence when mounted or company changes
  useEffect(() => {
    if (!companyId) return;

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

    getCachedWebIntelligence(companyId)
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data) {
          setWebIntel(res.data);
          if (res.data.searchQuery) {
            setSearchQuery(res.data.searchQuery);
          }
        } else {
          setWebIntel(null);
          setSearchQuery(`${companyName} ${country || ""}`.trim());
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Error loading web intel:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [companyId, companyName, country]);

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
        const newSummary = res.data.companyProfile?.businessSummary || "";
        setEditedSummary(newSummary);
        onAnalysisUpdated?.(res.data);
        onBusinessSummaryUpdated?.(newSummary);
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
        onBusinessSummaryUpdated?.(editedSummary.trim());
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

  // Trigger Web Research
  const handleRunResearch = async () => {
    if (!companyId) return;

    setIsSearching(true);
    try {
      const res = await researchCompanyWebIntelligence(companyId, searchQuery);
      if (res.success && res.data) {
        setWebIntel(res.data);
        toast({
          title: "Research Complete",
          description: `Gathered web intelligence for ${companyName}.`,
          type: "success",
        });
      } else {
        throw new Error(res.error || "Failed to research company on web");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error researching company";
      toast({ title: "Research Failed", description: msg, type: "error" });
    } finally {
      setIsSearching(false);
    }
  };

  // Copy Web Intelligence to clipboard
  const handleCopyWebIntel = () => {
    if (!webIntel) return;

    const lines = [
      `# Web Intelligence: ${companyName}`,
      `Search Query: ${webIntel.searchQuery || "-"}`,
      `Website: ${webIntel.websiteUrl || "-"}`,
      ...(webIntel.socialLinks?.length ? [`Channels: ${webIntel.socialLinks.join(", ")}`] : []),
      "",
      `## Business Summary`,
      webIntel.businessSummary || "-",
      "",
      `## Products & Brands`,
      ...(webIntel.productsAndBrands?.map((p) => `• ${p}`) || ["• -"]),
      "",
      `## Sources`,
      ...(webIntel.sources?.map((s) => `• [${s.title}](${s.url})`) || ["• -"]),
    ];

    navigator.clipboard.writeText(lines.join("\n"));
    setIsWebCopied(true);
    toast({
      title: "Copied to Clipboard",
      description: "Web intelligence copied to clipboard.",
      type: "success",
    });
    setTimeout(() => setIsWebCopied(false), 2000);
  };

  // Update a single field in web intelligence and save to database
  const updateWebIntelField = (field: keyof WebIntelligenceData, value: WebIntelligenceData[keyof WebIntelligenceData]) => {
    if (!webIntel) return;
    const updated = { ...webIntel, [field]: value, isUserEdited: true };
    setWebIntel(updated);
    if (companyId) {
      saveCompanyWebIntelligence(companyId, { [field]: value });
    }
  };

  // Delete a product tag
  const handleDeleteProduct = (index: number) => {
    if (!webIntel) return;
    const filtered = webIntel.productsAndBrands.filter((_, i) => i !== index);
    updateWebIntelField("productsAndBrands", filtered);
  };

  // Add a product tag
  const handleAddProduct = () => {
    if (!webIntel || !newProductInput.trim()) return;
    const updated = [...webIntel.productsAndBrands, newProductInput.trim()];
    setNewProductInput("");
    updateWebIntelField("productsAndBrands", updated);
  };

  // Delete a source link
  const handleDeleteSource = (index: number) => {
    if (!webIntel) return;
    const filtered = webIntel.sources.filter((_, i) => i !== index);
    updateWebIntelField("sources", filtered);
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

  return (
    <div className="flex flex-col gap-4">
      {/* Top Header Row with Sub-Tabs */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Bot className="w-5 h-5 text-[#C7F33C]" />
          <h3 className="text-lg font-bold text-slate-100">
            Account AI Analysis
          </h3>
        </div>

        {/* Mode Selector Tabs: Summary / Web Research / Prompt Settings */}
        <div className="flex items-center gap-1.5 p-1 bg-[#1C1C1D] rounded-full border border-[#3A3B3C]">
          <button
            type="button"
            onClick={() => setActiveTab("summary")}
            className={`px-3.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "summary"
                ? "bg-[#C7F33C] text-black font-bold"
                : "text-slate-300 hover:text-white"
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Summary</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("research")}
            className={`px-3.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "research"
                ? "bg-[#C7F33C] text-black font-bold"
                : "text-slate-300 hover:text-white"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Web Research</span>
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
                  ? "bg-[#C7F33C] text-black font-bold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Prompt Settings</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-header status bar */}
      {activeTab === "summary" && (
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#3A3B3C]/50 flex-wrap">
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

      {/* Body Content */}
      <div className="space-y-4">
        {activeTab === "summary" && (
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

            {/* 4. Ready State: Full Intelligence Model */}
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

                {/* CARD 2: 📊 Purchasing Behavior & Timeline */}
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
        )}

        {/* 2. Web Research Tab */}
        {activeTab === "research" && (
          <div className="space-y-4">
            {/* Search query bar */}
            <div className="p-3 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && searchQuery.trim() && !isSearching) {
                      handleRunResearch();
                    }
                  }}
                  placeholder="Company name, brand, or keywords to search..."
                  className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-400 focus:border-[#C7F33C] focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleRunResearch}
                disabled={isSearching || !searchQuery.trim()}
                className="px-4 py-2 rounded-xl bg-[#C7F33C] hover:bg-[#b0d635] text-black font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                <span>{isSearching ? "Searching..." : "Search"}</span>
              </button>
            </div>

            {/* In Progress */}
            {isSearching && (
              <div className="flex flex-col items-center justify-center p-8 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] text-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#C7F33C]/10 border border-[#C7F33C]/30 flex items-center justify-center text-[#C7F33C] animate-pulse">
                  <Globe className="w-6 h-6 animate-spin" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-100">
                    Searching Google for {companyName}...
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm">
                    Discovering official company website, commercial products, brands, and business profile.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#C7F33C]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Grounding search results via Gemini</span>
                </div>
              </div>
            )}

            {/* Empty State */}
            {!isSearching && !webIntel && (
              <div className="flex flex-col items-center justify-center p-8 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] text-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#C7F33C]/10 border border-[#C7F33C]/30 flex items-center justify-center text-[#C7F33C]">
                  <Globe className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <h4 className="text-base font-bold text-slate-100">
                    No Web Research Yet
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Search the web to discover {companyName}&apos;s website, product lines, and business overview before running Account AI Analysis.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRunResearch}
                  disabled={!searchQuery.trim()}
                  className="px-5 py-2 rounded-full bg-[#C7F33C] hover:bg-[#b0d635] text-black font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                  <span>Search Google Now</span>
                </button>
              </div>
            )}

            {/* Minimal Discovered Intel View */}
            {!isSearching && webIntel && (
              <div className="space-y-3">
                {/* 1. Website & Channels */}
                <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5 text-[#C7F33C]" />
                      Official Website & Channels
                    </span>
                    {webIntel.websiteUrl && (
                      <a
                        href={webIntel.websiteUrl.startsWith("http") ? webIntel.websiteUrl : `https://${webIntel.websiteUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#C7F33C] hover:underline flex items-center gap-1"
                      >
                        <span>Visit site</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={webIntel.websiteUrl}
                      onChange={(e) => updateWebIntelField("websiteUrl", e.target.value)}
                      placeholder="e.g. https://www.company.com"
                      className="flex-1 bg-[#252728] border border-[#4E4F50] rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-[#C7F33C] focus:outline-none"
                    />
                  </div>
                  {webIntel.socialLinks && webIntel.socialLinks.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Channels:</span>
                      {webIntel.socialLinks.map((link, idx) => (
                        <a
                          key={idx}
                          href={link.startsWith("http") ? link : `https://${link}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-[#252728] hover:bg-[#1C1C1D] text-[11px] text-slate-300 hover:text-white border border-[#4E4F50] flex items-center gap-1 transition-colors"
                        >
                          <span className="truncate max-w-[200px]">{link.replace(/^https?:\/\/(www\.)?/, "")}</span>
                          <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Products & Brands */}
                <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-[#C7F33C]" />
                      Products & Commercial Brands
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {webIntel.productsAndBrands.length} items
                    </span>
                  </div>

                  {/* Badges list */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {webIntel.productsAndBrands.map((prod, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#252728] text-xs text-slate-200 border border-[#4E4F50]"
                      >
                        <span>{prod}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(idx)}
                          className="text-slate-400 hover:text-rose-400 p-0.5 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
                          title="Remove product"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>

                  {/* Inline Add Product Input */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={newProductInput}
                      onChange={(e) => setNewProductInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddProduct();
                        }
                      }}
                      placeholder="+ Add product or brand (press Enter)..."
                      className="flex-1 bg-[#252728] border border-[#4E4F50] rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:border-[#C7F33C] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddProduct}
                      disabled={!newProductInput.trim()}
                      className="px-3 py-1.5 bg-[#4E4F50] hover:bg-[#606264] text-white text-xs font-medium rounded-xl transition-colors disabled:opacity-40 cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>

                {/* 3. Business Overview & Nature */}
                <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-[#C7F33C]" />
                      Business Nature & Overview
                    </span>
                    {webIntel.financialHighlights && webIntel.financialHighlights !== "ไม่ระบุ" && (
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#252728] text-slate-300 border border-[#4E4F50]">
                        {webIntel.financialHighlights}
                      </span>
                    )}
                  </div>
                  <textarea
                    rows={3}
                    value={webIntel.businessSummary}
                    onChange={(e) => updateWebIntelField("businessSummary", e.target.value)}
                    placeholder="Brief description of what this company does, products they sell, target market..."
                    className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl p-3 text-xs text-slate-100 leading-relaxed focus:border-[#C7F33C] focus:outline-none resize-y"
                  />
                </div>

                {/* 4. Sources Discovered */}
                {webIntel.sources && webIntel.sources.length > 0 && (
                  <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] space-y-2">
                    <span className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                      <ExternalLink className="w-3.5 h-3.5 text-[#C7F33C]" />
                      Discovered Sources ({webIntel.sources.length})
                    </span>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {webIntel.sources.map((src, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[#252728] border border-[#4E4F50]/60 text-xs text-slate-300"
                        >
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 truncate hover:text-[#C7F33C] transition-colors flex items-center gap-1.5"
                          >
                            <span className="truncate">{src.title || src.url}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDeleteSource(idx)}
                            className="text-slate-500 hover:text-rose-400 p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer shrink-0"
                            title="Remove source"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 3. Prompt Settings Tab (Admin only) */}
        {activeTab === "prompt" && (
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
                    onChange={(e) => {
                      setSystemInstruction(e.target.value);
                      autoResizeTextarea(e.target);
                    }}
                    className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl p-3.5 text-xs text-slate-100 font-mono leading-relaxed focus:border-[#C7F33C] focus:outline-none transition-colors resize-none overflow-hidden"
                    placeholder="Enter system prompt instruction..."
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
                    onChange={(e) => {
                      setTaskInstruction(e.target.value);
                      autoResizeTextarea(e.target);
                    }}
                    className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl p-3.5 text-xs text-slate-100 font-mono leading-relaxed focus:border-[#C7F33C] focus:outline-none transition-colors resize-none overflow-hidden"
                    placeholder="Enter task instructions..."
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
                    onChange={(e) => {
                      setJsonSchema(e.target.value);
                      autoResizeTextarea(e.target);
                    }}
                    className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl p-3.5 text-xs text-slate-100 font-mono leading-relaxed focus:border-[#C7F33C] focus:outline-none transition-colors resize-none overflow-hidden"
                    placeholder="Enter JSON schema..."
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

      {/* Footer Actions (Summary Tab) */}
      {activeTab === "summary" && (
        <div className="flex items-center justify-between pt-4 mt-2 border-t border-[#3A3B3C]">
          {analysis?.usage ? (
            <div
              className="text-xs px-2.5 py-1.5 rounded-xl bg-[#1C1C1D] text-slate-300 flex items-center gap-1.5 font-mono border border-[#3A3B3C]"
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
              className="px-4 py-2 rounded-xl bg-[#3A3B3C] hover:bg-[#4E4F50] text-xs font-medium text-slate-200 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer border border-[#4E4F50] disabled:opacity-40 disabled:cursor-not-allowed"
              title="Copy summary to clipboard"
            >
              {isCopied ? (
                <Check className="w-3.5 h-3.5 text-[#C7F33C]" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>{isCopied ? "Copied" : "Copy"}</span>
            </button>

            <button
              type="button"
              disabled={isAnalyzing}
              onClick={handleRunAnalysis}
              className="px-5 py-2 rounded-xl bg-[#C7F33C] hover:bg-[#b0d635] text-black font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Re-analyze and update summary"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? "animate-spin" : ""}`} />
              <span>{isAnalyzing ? "Analyzing..." : "Re-Analyse"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Footer Actions (Web Research Tab) */}
      {activeTab === "research" && (
        <div className="flex items-center justify-between pt-4 mt-2 border-t border-[#3A3B3C]">
          {webIntel?.usage ? (
            <div
              className="text-xs px-2.5 py-1.5 rounded-xl bg-[#1C1C1D] text-slate-300 flex items-center gap-1.5 font-mono border border-[#3A3B3C]"
              title={`Tokens: ${webIntel.usage.inputTokens.toLocaleString()} input, ${webIntel.usage.outputTokens.toLocaleString()} output`}
            >
              <Zap className="w-3.5 h-3.5 text-[#C7F33C]" />
              <span>{webIntel.usage.totalTokens.toLocaleString()} tokens</span>
              <span className="text-[#4E4F50]">•</span>
              <span className="text-[#C7F33C] font-semibold">
                ≈ {webIntel.usage.costThb < 0.01 ? "<0.01" : webIntel.usage.costThb.toFixed(2)} THB
              </span>
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyWebIntel}
              disabled={!webIntel}
              className="px-4 py-2 rounded-xl bg-[#3A3B3C] hover:bg-[#4E4F50] text-xs font-medium text-slate-200 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer border border-[#4E4F50] disabled:opacity-40 disabled:cursor-not-allowed"
              title="Copy web research to clipboard"
            >
              {isWebCopied ? (
                <Check className="w-3.5 h-3.5 text-[#C7F33C]" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>{isWebCopied ? "Copied" : "Copy"}</span>
            </button>

            <button
              type="button"
              disabled={isSearching}
              onClick={handleRunResearch}
              className="px-5 py-2 rounded-xl bg-[#C7F33C] hover:bg-[#b0d635] text-black font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Search and gather web intelligence"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSearching ? "animate-spin" : ""}`} />
              <span>{isSearching ? "Researching..." : (webIntel ? "Re-Research" : "Research Web")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
