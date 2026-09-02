CREATE TYPE "DealAIEventStatus" AS ENUM ('PENDING', 'READY', 'NEEDS_REVIEW', 'RETRACTED', 'FAILED');
CREATE TYPE "DealAIEventAuthorType" AS ENUM ('AI', 'USER', 'SYSTEM');

CREATE TABLE "DealAIEvent" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "domainEventId" TEXT NOT NULL,
    "agentKey" "AgentKey" NOT NULL DEFAULT 'EVENT_SUMMARIZER',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "localEventDate" DATE NOT NULL,
    "status" "DealAIEventStatus" NOT NULL DEFAULT 'PENDING',
    "currentRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DealAIEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DealAIEventRevision" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "authorType" "DealAIEventAuthorType" NOT NULL,
    "summary" TEXT NOT NULL,
    "structuredData" JSONB NOT NULL,
    "eventType" TEXT NOT NULL,
    "importance" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION,
    "needsContext" BOOLEAN NOT NULL DEFAULT false,
    "providerKey" TEXT,
    "modelId" TEXT,
    "promptVersion" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "sourceContentHash" TEXT NOT NULL,
    "createdById" TEXT,
    "supersedesRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DealAIEventRevision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DealAIEventRevision_importance_check" CHECK ("importance" BETWEEN 1 AND 5),
    CONSTRAINT "DealAIEventRevision_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" BETWEEN 0 AND 1))
);

CREATE UNIQUE INDEX "DealAIEvent_domainEventId_agentKey_key" ON "DealAIEvent"("domainEventId", "agentKey");
CREATE UNIQUE INDEX "DealAIEvent_currentRevisionId_key" ON "DealAIEvent"("currentRevisionId");
CREATE INDEX "DealAIEvent_dealId_localEventDate_occurredAt_idx" ON "DealAIEvent"("dealId", "localEventDate", "occurredAt");
CREATE INDEX "DealAIEvent_dealId_status_occurredAt_idx" ON "DealAIEvent"("dealId", "status", "occurredAt");
CREATE UNIQUE INDEX "DealAIEventRevision_eventId_revision_key" ON "DealAIEventRevision"("eventId", "revision");
CREATE INDEX "DealAIEventRevision_eventId_createdAt_idx" ON "DealAIEventRevision"("eventId", "createdAt");
CREATE INDEX "DealAIEventRevision_sourceContentHash_idx" ON "DealAIEventRevision"("sourceContentHash");

ALTER TABLE "DealAIEvent" ADD CONSTRAINT "DealAIEvent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealAIEvent" ADD CONSTRAINT "DealAIEvent_domainEventId_fkey" FOREIGN KEY ("domainEventId") REFERENCES "DealDomainEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DealAIEventRevision" ADD CONSTRAINT "DealAIEventRevision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "DealAIEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealAIEventRevision" ADD CONSTRAINT "DealAIEventRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DealAIEvent" ADD CONSTRAINT "DealAIEvent_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "DealAIEventRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "AIUsageRecord_agentRunId_attempt_key" ON "AIUsageRecord"("agentRunId", "attempt");
CREATE UNIQUE INDEX "AIBudgetReservation_runId_key" ON "AIBudgetReservation"("runId");
