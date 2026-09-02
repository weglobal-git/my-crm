"use server";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getSystemEncryption } from "@/lib/encryption";
import { aiGateway } from "@/lib/ai/gateway";
import { GoogleGeminiAdapter } from "@/lib/ai/adapters/gemini";
import prisma from "@/lib/prisma";
import { AIProviderStatus } from "@prisma/client";

const FEATURE_FLAG_AI_ADMIN = process.env.FEATURE_FLAG_AI_ADMIN === "true";

// Ensure Gemini Adapter is registered
aiGateway.registerAdapter("GOOGLE_GEMINI", new GoogleGeminiAdapter());

async function checkAdminAuth() {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user || !session.user.email) {
    throw new Error("Unauthorized: Please log in.");
  }
  
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (user?.role !== "ADMIN") throw new Error("Unauthorized: Admins only.");
  
  return user;
}

export async function testProviderConnection(providerKey: string, secretKey: string) {
  if (!FEATURE_FLAG_AI_ADMIN) throw new Error("AI features are currently disabled.");
  const user = await checkAdminAuth();
  
  if (!providerKey || !secretKey) {
    throw new Error("Provider Key and Secret Key are required.");
  }
  
  try {
    const adapter = aiGateway.getAdapter(providerKey);
    const health = await adapter.healthCheck({ secretKey });
    
    await prisma.aIConfigAuditLog.create({
      data: {
        entityType: 'AIProviderConfig',
        entityId: providerKey,
        action: 'TESTED',
        actorId: user.id,
        reason: health.isHealthy ? 'Connection test succeeded' : 'Connection test failed',
        newValue: { latencyMs: health.latencyMs, statusMessage: health.statusMessage }
      }
    });
    
    return {
      success: health.isHealthy,
      message: health.statusMessage,
      latencyMs: health.latencyMs
    };
  } catch (error: any) {
    console.error(`[AI Admin] testProviderConnection error:`, error.message);
    return { success: false, message: error.message || "Unknown error" };
  }
}

export async function saveProviderConfig(providerKey: string, secretKey: string) {
  if (!FEATURE_FLAG_AI_ADMIN) throw new Error("AI features are currently disabled.");
  const user = await checkAdminAuth();
  
  if (!providerKey || !secretKey) {
    throw new Error("Provider Key and Secret Key are required.");
  }
  
  const encryption = getSystemEncryption();
  const encryptedSecret = encryption.encrypt(secretKey);
  
  await prisma.aIProviderConfig.upsert({
    where: { providerKey },
    update: { secretRef: encryptedSecret, updatedById: user.id },
    create: { providerKey, secretRef: encryptedSecret, createdById: user.id }
  });
  
  await prisma.aIConfigAuditLog.create({
    data: {
      entityType: 'AIProviderConfig',
      entityId: providerKey,
      action: 'UPDATED',
      actorId: user.id,
      reason: 'Admin updated provider config secret'
    }
  });
  
  return { success: true, message: "Provider configuration saved securely." };
}

export async function setSystemAiStatus(paused: boolean) {
  if (!FEATURE_FLAG_AI_ADMIN) throw new Error("AI features are currently disabled.");
  const user = await checkAdminAuth();
  
  // Pause or Resume all AI Provider configs
  const status = paused ? AIProviderStatus.DISABLED : AIProviderStatus.ENABLED;
  
  await prisma.aIProviderConfig.updateMany({
    data: { status }
  });
  
  await prisma.aIConfigAuditLog.create({
    data: {
      entityType: 'SYSTEM_STATUS',
      entityId: 'global',
      action: paused ? 'PAUSED' : 'RESUMED',
      actorId: user.id,
      reason: 'Admin toggled global AI status'
    }
  });
  
  return { success: true, message: paused ? "AI System paused globally." : "AI System resumed." };
}

export async function getSystemAiStats() {
  if (!FEATURE_FLAG_AI_ADMIN) {
    return { enabled: false, degraded: false, disabled: true, monthlyCost: 0, budgetLimit: 1.00 };
  }
  await checkAdminAuth();
  
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const monthlyUsage = await prisma.aIUsageRecord.aggregate({
    where: { createdAt: { gte: monthStart } },
    _sum: { costMicros: true }
  });
  
  const currentMonthlyCost = monthlyUsage._sum.costMicros ?? BigInt(0);
  const costUsd = Number(currentMonthlyCost) / 1000000;
  
  const provider = await prisma.aIProviderConfig.findUnique({
    where: { providerKey: "GOOGLE_GEMINI" }
  });
  
  return { 
    enabled: provider?.status === 'ENABLED',
    degraded: provider?.status === 'DEGRADED',
    disabled: provider?.status === 'DISABLED',
    monthlyCost: costUsd, 
    budgetLimit: 1.00 
  };
}

