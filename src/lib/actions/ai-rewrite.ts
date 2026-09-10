"use server";

import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireOpportunityAccess } from "@/lib/pipeline-security";
import { aiGateway } from "@/lib/ai/gateway";
import { GoogleGeminiAdapter } from "@/lib/ai/adapters/gemini";

// Ensure Gemini adapter is registered
aiGateway.registerAdapter("GOOGLE_GEMINI", new GoogleGeminiAdapter());

import {
  DEFAULT_REWRITE_SYSTEM_INSTRUCTION,
  DEFAULT_REWRITE_TASK_INSTRUCTION,
  DEFAULT_REWRITE_JSON_SCHEMA,
  type RewriteCommentResponse,
  type RewritePromptConfig,
} from "@/lib/constants/ai-rewrite";

export type { RewriteCommentResponse, RewritePromptConfig };

function calculateGeminiCost(inputTokens: number, outputTokens: number) {
  const USD_TO_THB = 35.5;
  const inputCostUsd = (inputTokens / 1_000_000) * 0.075;
  const outputCostUsd = (outputTokens / 1_000_000) * 0.30;
  const costUsd = inputCostUsd + outputCostUsd;
  const costThb = costUsd * USD_TO_THB;
  return { costUsd, costThb };
}

async function checkAiBudget(): Promise<{ allowed: boolean; monthlyCostUsd: number; budgetLimitUsd: number }> {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
  const configId = `ai_monthly_usage_${yearMonth}`;

  let budgetLimitUsd = 1.00;
  try {
    const globalCfg = await prisma.systemConfig.findUnique({ where: { id: "ai_budget_limit" } });
    if (globalCfg?.googleRefreshToken) {
      const parsed = JSON.parse(globalCfg.googleRefreshToken);
      if (typeof parsed.limitUsd === "number") budgetLimitUsd = parsed.limitUsd;
    }
  } catch {}

  try {
    const existing = await prisma.systemConfig.findUnique({ where: { id: configId } });
    if (existing?.googleRefreshToken) {
      const data = JSON.parse(existing.googleRefreshToken);
      const monthlyCostUsd = data.costUsd || 0;
      const effectiveLimit = budgetLimitUsd || data.budgetLimitUsd || 1.00;
      if (monthlyCostUsd >= effectiveLimit) {
        return { allowed: false, monthlyCostUsd, budgetLimitUsd: effectiveLimit };
      }
      return { allowed: true, monthlyCostUsd, budgetLimitUsd: effectiveLimit };
    }
  } catch {}

  return { allowed: true, monthlyCostUsd: 0, budgetLimitUsd };
}

async function recordMonthlyAiUsage(inputTokens: number, outputTokens: number, totalTokens: number, costUsd: number, costThb: number) {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
  const configId = `ai_monthly_usage_${yearMonth}`;

  try {
    const existing = await prisma.systemConfig.findUnique({ where: { id: configId } });
    let data = {
      yearMonth,
      totalCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      costThb: 0,
      budgetLimitUsd: 1.00,
      updatedAt: now.toISOString(),
    };

    if (existing?.googleRefreshToken) {
      try {
        data = { ...data, ...JSON.parse(existing.googleRefreshToken) };
      } catch {}
    }

    data.totalCalls += 1;
    data.inputTokens += inputTokens;
    data.outputTokens += outputTokens;
    data.totalTokens += totalTokens;
    data.costUsd += costUsd;
    data.costThb += costThb;
    data.updatedAt = now.toISOString();

    await prisma.systemConfig.upsert({
      where: { id: configId },
      update: { googleRefreshToken: JSON.stringify(data) },
      create: { id: configId, googleRefreshToken: JSON.stringify(data) },
    });
  } catch (err) {
    console.error("[AI Usage] Failed to record monthly usage:", err);
  }
}

/**
 * Fetch the current Prompt configuration for AI Rewriter
 */
export async function getRewritePromptConfig(): Promise<RewritePromptConfig> {
  const configRow = await prisma.systemConfig.findUnique({
    where: { id: "ai_rewrite_prompt" },
  });

  if (configRow?.googleRefreshToken) {
    try {
      const val = JSON.parse(configRow.googleRefreshToken);
      if (val && typeof val === "object" && !val.isReset) {
        return {
          systemInstruction: val.systemInstruction || DEFAULT_REWRITE_SYSTEM_INSTRUCTION,
          taskInstruction: val.taskInstruction || DEFAULT_REWRITE_TASK_INSTRUCTION,
          jsonSchema: val.jsonSchema || JSON.stringify(DEFAULT_REWRITE_JSON_SCHEMA, null, 2),
          isCustom: true,
        };
      }
    } catch {
      // fallback to default
    }
  }

  return {
    systemInstruction: DEFAULT_REWRITE_SYSTEM_INSTRUCTION,
    taskInstruction: DEFAULT_REWRITE_TASK_INSTRUCTION,
    jsonSchema: JSON.stringify(DEFAULT_REWRITE_JSON_SCHEMA, null, 2),
    isCustom: false,
  };
}

/**
 * Save Prompt configuration for AI Rewriter (ADMIN only)
 */
export async function saveRewritePromptConfig(data: {
  systemInstruction: string;
  taskInstruction?: string;
  jsonSchema?: string;
}) {
  const session = await getServerSession(authOptions);
  const isAuthorized = session?.user?.role === "ADMIN" || session?.user?.email === "jakkaphan.jindarug@gmail.com" || session?.user?.email === "weglobal.server@gmail.com";
  if (!session?.user?.email || !isAuthorized) {
    throw new Error("Unauthorized: Only ADMIN can configure AI prompts.");
  }

  let validatedJsonSchema = JSON.stringify(DEFAULT_REWRITE_JSON_SCHEMA, null, 2);
  if (data.jsonSchema?.trim()) {
    try {
      const parsed = JSON.parse(data.jsonSchema);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("JSON Schema must be a valid JSON Object.");
      }
      validatedJsonSchema = JSON.stringify(parsed, null, 2);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid JSON format";
      throw new Error(`Invalid JSON Schema: ${msg}`);
    }
  }

  const payload = {
    systemInstruction: data.systemInstruction.trim(),
    taskInstruction: (data.taskInstruction || DEFAULT_REWRITE_TASK_INSTRUCTION).trim(),
    jsonSchema: validatedJsonSchema,
    isReset: false,
  };

  await prisma.systemConfig.upsert({
    where: { id: "ai_rewrite_prompt" },
    update: { googleRefreshToken: JSON.stringify(payload) },
    create: { id: "ai_rewrite_prompt", googleRefreshToken: JSON.stringify(payload) },
  });

  return { success: true, message: "Prompt configuration saved successfully." };
}

/**
 * Reset AI Rewriter prompt to system default (ADMIN only)
 */
export async function resetRewritePromptConfig() {
  const session = await getServerSession(authOptions);
  const isAuthorized = session?.user?.role === "ADMIN" || session?.user?.email === "jakkaphan.jindarug@gmail.com" || session?.user?.email === "weglobal.server@gmail.com";
  if (!session?.user?.email || !isAuthorized) {
    throw new Error("Unauthorized: Only ADMIN can reset AI prompts.");
  }

  await prisma.systemConfig.deleteMany({
    where: { id: "ai_rewrite_prompt" },
  });

  return {
    success: true,
    message: "Prompt reset to default successfully.",
    data: {
      systemInstruction: DEFAULT_REWRITE_SYSTEM_INSTRUCTION,
      taskInstruction: DEFAULT_REWRITE_TASK_INSTRUCTION,
      jsonSchema: JSON.stringify(DEFAULT_REWRITE_JSON_SCHEMA, null, 2),
      isCustom: false,
    },
  };
}

/**
 * Ultra-lean, token-efficient context extractor for a deal.
 * Fetches Target Goal, Summary Overview, and 2-3 recent comments in a single Promise.all.
 * Distills everything into < 120 tokens to minimize latency and token cost.
 */
async function fetchDealMicroContext(dealId: string): Promise<string> {
  try {
    const [configs, recentComments, deal] = await Promise.all([
      prisma.systemConfig.findMany({
        where: {
          id: { in: [`deal_accelerators_${dealId}`, `deal_summary_${dealId}`] },
        },
        select: { id: true, googleRefreshToken: true },
      }),
      prisma.activityLog.findMany({
        where: {
          opportunityId: dealId,
          type: "COMMENT",
          parentId: null,
        },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          content: true,
          user: { select: { name: true } },
        },
      }),
      prisma.opportunity.findUnique({
        where: { id: dealId },
        select: { topic: true },
      }),
    ]);

    let targetGoal = "";
    let summaryOverview = "";

    for (const row of configs) {
      if (!row.googleRefreshToken) continue;
      try {
        const parsed = JSON.parse(row.googleRefreshToken);
        if (row.id === `deal_accelerators_${dealId}` && parsed?.targetGoal) {
          targetGoal = String(parsed.targetGoal).trim();
        } else if (row.id === `deal_summary_${dealId}` && parsed?.summaryData?.overview) {
          summaryOverview = String(parsed.summaryData.overview).trim();
        }
      } catch {
        // Ignore JSON parse errors for corrupt configs
      }
    }

    // Fallback to deal topic if no manual target goal exists
    if (!targetGoal && deal?.topic) {
      targetGoal = deal.topic.trim();
    }

    const contextLines: string[] = [];

    // 1. Target Goal (capped at 120 chars)
    if (targetGoal) {
      const truncatedGoal = targetGoal.length > 120 ? `${targetGoal.substring(0, 117)}...` : targetGoal;
      contextLines.push(`🎯 Project Goal: ${truncatedGoal}`);
    }

    // 2. Summary Overview (capped at 160 chars)
    if (summaryOverview) {
      const singleLineOverview = summaryOverview.replace(/\s+/g, " ");
      const truncatedSummary = singleLineOverview.length > 160 ? `${singleLineOverview.substring(0, 157)}...` : singleLineOverview;
      contextLines.push(`📋 Current Status: ${truncatedSummary}`);
    }

    // 3. Recent 2-3 Comments (reversed to chronological order: older -> newer)
    if (recentComments.length > 0) {
      const sanitizedLogs: string[] = [];
      for (const log of [...recentComments].reverse()) {
        if (!log.content) continue;
        const cleanContent = log.content
          .replace(/\[ATTACHMENT:[^\]]*\]/g, "")
          .replace(/\[URGENT_CALL:[^\]]*\]/g, "")
          .replace(/https?:\/\/[^\s]+/g, "")
          .replace(/\s+/g, " ")
          .trim();
        if (!cleanContent) continue;
        const userName = log.user?.name?.trim() || "User";
        const truncatedContent = cleanContent.length > 80 ? `${cleanContent.substring(0, 77)}...` : cleanContent;
        sanitizedLogs.push(`- ${userName}: ${truncatedContent}`);
      }
      if (sanitizedLogs.length > 0) {
        contextLines.push(`💬 Recent Context:\n${sanitizedLogs.join("\n")}`);
      }
    }

    if (contextLines.length === 0) return "";

    return `[Deal Context - For Background Reference Only]\n${contextLines.join("\n")}`;
  } catch (err) {
    console.warn("[AI Rewrite] Failed to fetch deal micro-context:", err);
    return "";
  }
}

/**
 * Server action to rewrite raw notes/chat into professional CRM activity summary
 */
export async function rewriteRawComment(dealId: string, rawText: string): Promise<RewriteCommentResponse> {
  const trimmed = (rawText || "").trim();
  if (!trimmed) {
    return { success: false, error: "EMPTY_TEXT", message: "Please provide text or chat to rewrite." };
  }

  // Cap length to prevent accidental prompt-bombing
  const boundedText = trimmed.length > 8000 ? trimmed.substring(0, 8000) : trimmed;

  try {
    await requireOpportunityAccess(dealId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return { success: false, error: "UNAUTHORIZED", message: msg };
  }

  const budgetCheck = await checkAiBudget();
  if (!budgetCheck.allowed) {
    return {
      success: false,
      error: "BUDGET_EXCEEDED",
      message: `Monthly AI budget limit exceeded ($${budgetCheck.budgetLimitUsd.toFixed(2)} USD). Please check General Settings.`,
    };
  }

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!apiKey.trim()) {
    return {
      success: false,
      error: "NO_API_KEY",
      message: "Gemini API Key is not configured. Please set GOOGLE_GEMINI_API_KEY in .env",
    };
  }

  // Load custom or default prompt configuration
  const promptConfig = await getRewritePromptConfig();
  const effectiveSystemInstruction = promptConfig.systemInstruction || DEFAULT_REWRITE_SYSTEM_INSTRUCTION;
  const effectiveTaskInstruction = promptConfig.taskInstruction || DEFAULT_REWRITE_TASK_INSTRUCTION;

  let effectiveSchema: Record<string, unknown> = DEFAULT_REWRITE_JSON_SCHEMA;
  if (promptConfig.jsonSchema?.trim()) {
    try {
      effectiveSchema = JSON.parse(promptConfig.jsonSchema);
    } catch (e) {
      console.warn("[AI Rewrite] Failed to parse custom jsonSchema, fallback to default", e);
    }
  }

  // Fetch ultra-lean deal micro-context in parallel with zero client overhead
  const microContext = await fetchDealMicroContext(dealId);

  const prompt = `${microContext ? `${microContext}\n\n` : ""}${effectiveTaskInstruction}

Raw Chat / Notes to summarize:
"""
${boundedText}
"""`;

  try {
    const adapter = aiGateway.getAdapter("GOOGLE_GEMINI");

    let aiResult;
    try {
      aiResult = await adapter.generateStructured<{ rewrittenText: string }>({
        providerKey: "GOOGLE_GEMINI",
        modelId: "gemini-2.5-flash",
        secretKey: apiKey,
        systemInstruction: effectiveSystemInstruction,
        prompt,
        schema: effectiveSchema,
        temperature: 0.2,
        timeoutMs: 20000,
        maxOutputTokens: 1024,
      });
    } catch (firstErr) {
      console.warn("[AI Rewrite] gemini-2.5-flash failed, falling back to gemini-1.5-flash:", firstErr);
      aiResult = await adapter.generateStructured<{ rewrittenText: string }>({
        providerKey: "GOOGLE_GEMINI",
        modelId: "gemini-1.5-flash",
        secretKey: apiKey,
        systemInstruction: effectiveSystemInstruction,
        prompt,
        schema: effectiveSchema,
        temperature: 0.2,
        timeoutMs: 20000,
        maxOutputTokens: 1024,
      });
    }

    const rewrittenText = aiResult.data?.rewrittenText?.trim() || "";
    if (!rewrittenText) {
      return {
        success: false,
        error: "EMPTY_AI_RESPONSE",
        message: "AI could not process this message. Please try again.",
      };
    }

    const inputTokens = aiResult.usage?.inputTokens || 0;
    const outputTokens = aiResult.usage?.outputTokens || 0;
    const totalTokens = aiResult.usage?.totalTokens || (inputTokens + outputTokens);
    const { costUsd, costThb } = calculateGeminiCost(inputTokens, outputTokens);

    await recordMonthlyAiUsage(inputTokens, outputTokens, totalTokens, costUsd, costThb);

    return {
      success: true,
      rewrittenText,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        costUsd,
        costThb,
      },
    };
  } catch (err: unknown) {
    console.error("[AI Rewrite] Error invoking AI:", err);
    const msg = err instanceof Error ? err.message : "Failed to execute AI request.";
    return {
      success: false,
      error: "AI_CALL_FAILED",
      message: msg,
    };
  }
}
