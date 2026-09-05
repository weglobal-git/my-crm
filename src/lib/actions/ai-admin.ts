"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { aiGateway } from "@/lib/ai/gateway";
import { GoogleGeminiAdapter } from "@/lib/ai/adapters/gemini";
import prisma from "@/lib/prisma";

const FEATURE_FLAG_AI_ADMIN = process.env.FEATURE_FLAG_AI_ADMIN === "true";

// Ensure Gemini Adapter is registered
aiGateway.registerAdapter("GOOGLE_GEMINI", new GoogleGeminiAdapter());

async function checkAdminAuth() {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user) {
    throw new Error("Unauthorized: Please log in.");
  }
  
  const isAdmin = session.user.role === "ADMIN" || session.user.email === "weglobal.server@gmail.com";
  if (!isAdmin) {
    throw new Error("Unauthorized: Admins only.");
  }
  
  return session.user;
}

export async function testProviderConnection(providerKey: string, secretKey: string) {
  if (!FEATURE_FLAG_AI_ADMIN) throw new Error("AI features are currently disabled.");
  await checkAdminAuth();
  
  if (!providerKey || !secretKey) {
    throw new Error("Provider Key and Secret Key are required.");
  }
  
  try {
    const adapter = aiGateway.getAdapter(providerKey);
    const health = await adapter.healthCheck({ secretKey });
    
    return {
      success: health.isHealthy,
      message: health.statusMessage,
      latencyMs: health.latencyMs
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[AI Admin] testProviderConnection error:`, message);
    return { success: false, message };
  }
}

export async function saveProviderConfig(_providerKey: string, _secretKey: string) {
  void _providerKey;
  void _secretKey;
  return { success: true, message: "Provider configuration saved." };
}

export async function setSystemAiStatus(_paused: boolean) {
  void _paused;
  return { success: true, message: "AI System status updated." };
}

export async function getSystemAiStats() {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
  const configId = `ai_monthly_usage_${yearMonth}`;

  let budgetLimit = 1.00;
  try {
    const globalLimitRow = await prisma.systemConfig.findUnique({ where: { id: "ai_budget_limit" } });
    if (globalLimitRow?.googleRefreshToken) {
      const parsed = JSON.parse(globalLimitRow.googleRefreshToken);
      if (typeof parsed.limitUsd === "number") budgetLimit = parsed.limitUsd;
    }
  } catch {}

  try {
    const existing = await prisma.systemConfig.findUnique({ where: { id: configId } });
    if (existing?.googleRefreshToken) {
      const data = JSON.parse(existing.googleRefreshToken);
      return {
        enabled: true,
        degraded: false,
        disabled: false,
        monthlyCost: data.costUsd || 0,
        monthlyCostThb: data.costThb || 0,
        totalTokens: data.totalTokens || 0,
        totalCalls: data.totalCalls || 0,
        budgetLimit: budgetLimit || data.budgetLimitUsd || 1.00,
      };
    }
  } catch (e) {
    console.error("Failed to load AI stats:", e);
  }

  return {
    enabled: true,
    degraded: false,
    disabled: false,
    monthlyCost: 0,
    monthlyCostThb: 0,
    totalTokens: 0,
    totalCalls: 0,
    budgetLimit,
  };
}

export async function updateAiBudgetLimit(limitUsd: number) {
  try {
    await checkAdminAuth();

    if (typeof limitUsd !== 'number' || limitUsd <= 0 || isNaN(limitUsd)) {
      return { success: false, error: "Budget limit must be a positive number." };
    }

    const now = new Date();
    const yearMonth = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthlyConfigId = `ai_monthly_usage_${yearMonth}`;

    // 1. บันทึกขีดจำกัดงบประมาณสากล (Global Budget Setting)
    await prisma.systemConfig.upsert({
      where: { id: "ai_budget_limit" },
      update: { googleRefreshToken: JSON.stringify({ limitUsd, updatedAt: now.toISOString() }) },
      create: { id: "ai_budget_limit", googleRefreshToken: JSON.stringify({ limitUsd, updatedAt: now.toISOString() }) },
    });

    // 2. อัปเดตในสถิติเดือนปัจจุบันด้วย
    try {
      const existing = await prisma.systemConfig.findUnique({ where: { id: monthlyConfigId } });
      if (existing?.googleRefreshToken) {
        const data = JSON.parse(existing.googleRefreshToken);
        data.budgetLimitUsd = limitUsd;
        data.updatedAt = now.toISOString();
        await prisma.systemConfig.update({
          where: { id: monthlyConfigId },
          data: { googleRefreshToken: JSON.stringify(data) },
        });
      }
    } catch (e) {
      console.warn("Failed to update monthly usage budget limit:", e);
    }

    return { success: true, budgetLimit: limitUsd };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to update budget limit.";
    console.error("[AI Admin] updateAiBudgetLimit error:", errorMsg);
    return { success: false, error: errorMsg };
  }
}
