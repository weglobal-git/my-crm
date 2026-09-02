-- CreateEnum
CREATE TYPE "AIProviderStatus" AS ENUM ('ENABLED', 'DISABLED', 'DEGRADED');

-- CreateEnum
CREATE TYPE "AIModelPolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'STARTED', 'COMPLETED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "AIUsageSource" AS ENUM ('PROVIDER_REPORTED', 'ESTIMATED', 'UNMETERED');

-- CreateEnum
CREATE TYPE "AIBudgetReservationStatus" AS ENUM ('HELD', 'RECONCILED', 'RELEASED', 'EXPIRED');

-- CreateTable
CREATE TABLE "AIProviderConfig" (
    "providerKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "AIProviderStatus" NOT NULL DEFAULT 'ENABLED',
    "secretRef" TEXT,
    "baseUrl" TEXT,
    "timeoutMs" INTEGER NOT NULL DEFAULT 15000,
    "maxConcurrentRequests" INTEGER NOT NULL DEFAULT 5,
    "lastHealthCheckAt" TIMESTAMP(3),
    "lastHealthStatus" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIProviderConfig_pkey" PRIMARY KEY ("providerKey")
);

-- CreateTable
CREATE TABLE "AIModelPolicy" (
    "id" TEXT NOT NULL,
    "agentKey" "AgentKey" NOT NULL DEFAULT 'EVENT_SUMMARIZER',
    "version" INTEGER NOT NULL,
    "status" "AIModelPolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "providerKey" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "fallbackProviderKey" TEXT,
    "fallbackModelId" TEXT,
    "structuredJson" BOOLEAN NOT NULL DEFAULT true,
    "supportedInputTypes" TEXT[],
    "maximumContext" INTEGER NOT NULL,
    "maxInputTokens" INTEGER NOT NULL,
    "maxOutputTokens" INTEGER NOT NULL,
    "timeoutMs" INTEGER NOT NULL DEFAULT 15000,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "temperature" DOUBLE PRECISION,
    "dailyTokenLimit" INTEGER NOT NULL,
    "monthlyTokenLimit" INTEGER NOT NULL,
    "dailyCostLimitMicros" BIGINT NOT NULL,
    "monthlyCostLimitMicros" BIGINT NOT NULL,
    "perRunCostLimitMicros" BIGINT NOT NULL,
    "maxConcurrentRuns" INTEGER NOT NULL DEFAULT 5,
    "promptVersion" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIModelPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "agentKey" "AgentKey" NOT NULL,
    "outboxId" TEXT NOT NULL,
    "domainEventId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "policyId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "providerLatencyMs" INTEGER,
    "completedAt" TIMESTAMP(3),
    "normalizedErrorCode" TEXT,
    "errorCategory" TEXT,
    "redactedErrorMsg" TEXT,
    "inputContentHash" TEXT,
    "outputContentHash" TEXT,
    "totalTokens" INTEGER,
    "estimatedCostMicros" BIGINT,
    "outputRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsageRecord" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "providerRequestId" TEXT,
    "providerKey" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "priceVersion" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "latencyMs" INTEGER,
    "httpStatus" INTEGER,
    "outcome" TEXT,
    "usageSource" "AIUsageSource" NOT NULL DEFAULT 'PROVIDER_REPORTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIBudgetReservation" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "reservedTokens" INTEGER NOT NULL,
    "reservedCostMicros" BIGINT NOT NULL,
    "status" "AIBudgetReservationStatus" NOT NULL DEFAULT 'HELD',
    "runId" TEXT,
    "expiryAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIBudgetReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAlert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIConfigAuditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIConfigAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AIModelPolicy_agentKey_version_key" ON "AIModelPolicy"("agentKey", "version");

-- CreateIndex
CREATE INDEX "AgentRun_dealId_idx" ON "AgentRun"("dealId");

-- CreateIndex
CREATE INDEX "AgentRun_outboxId_idx" ON "AgentRun"("outboxId");

-- CreateIndex
CREATE INDEX "AgentRun_domainEventId_idx" ON "AgentRun"("domainEventId");

-- CreateIndex
CREATE INDEX "AgentRun_traceId_idx" ON "AgentRun"("traceId");

-- CreateIndex
CREATE INDEX "AgentRun_status_createdAt_idx" ON "AgentRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AIUsageRecord_agentRunId_idx" ON "AIUsageRecord"("agentRunId");

-- CreateIndex
CREATE INDEX "AIUsageRecord_providerKey_createdAt_idx" ON "AIUsageRecord"("providerKey", "createdAt");

-- CreateIndex
CREATE INDEX "AIBudgetReservation_scope_periodKey_idx" ON "AIBudgetReservation"("scope", "periodKey");

-- CreateIndex
CREATE INDEX "AIBudgetReservation_status_expiryAt_idx" ON "AIBudgetReservation"("status", "expiryAt");

-- CreateIndex
CREATE INDEX "AIAlert_isResolved_createdAt_idx" ON "AIAlert"("isResolved", "createdAt");

-- CreateIndex
CREATE INDEX "AIConfigAuditLog_entityType_entityId_idx" ON "AIConfigAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AIConfigAuditLog_createdAt_idx" ON "AIConfigAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AIProviderConfig" ADD CONSTRAINT "AIProviderConfig_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIProviderConfig" ADD CONSTRAINT "AIProviderConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIModelPolicy" ADD CONSTRAINT "AIModelPolicy_providerKey_fkey" FOREIGN KEY ("providerKey") REFERENCES "AIProviderConfig"("providerKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIModelPolicy" ADD CONSTRAINT "AIModelPolicy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "AIModelPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageRecord" ADD CONSTRAINT "AIUsageRecord_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAlert" ADD CONSTRAINT "AIAlert_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConfigAuditLog" ADD CONSTRAINT "AIConfigAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
