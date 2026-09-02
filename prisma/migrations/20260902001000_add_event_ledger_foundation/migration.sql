-- CreateEnum
CREATE TYPE "ActivityRevisionChangeType" AS ENUM ('CREATED', 'EDITED', 'DELETED');

-- CreateEnum
CREATE TYPE "DealDomainEventClass" AS ENUM ('AI_SUMMARY', 'AUDIT_ONLY');

-- CreateEnum
CREATE TYPE "DealDomainEventType" AS ENUM ('DEAL_CREATED', 'DEAL_STAGE_CHANGED', 'DEAL_STATUS_CHANGED', 'DEAL_WON', 'DEAL_LOST', 'DEAL_TOPIC_CHANGED', 'DEAL_TYPE_CHANGED', 'DEAL_VALUE_CHANGED', 'DEAL_FIELDS_UPDATED', 'DEAL_LOGISTICS_DATES_CHANGED', 'DEAL_REFERENCE_CHANGED', 'DEAL_DUE_DATE_CHANGED', 'DEAL_DELETED', 'ACTIVITY_CREATED', 'ACTIVITY_EDITED', 'ACTIVITY_DELETED', 'REPLY_CREATED', 'REPLY_EDITED', 'REPLY_DELETED', 'SYSTEM_ACTIVITY_CREATED', 'OWNERSHIP_TRANSFER_REQUESTED', 'OWNERSHIP_TRANSFER_REJECTED', 'DEAL_OWNER_CHANGED', 'TEAM_INVITE_REQUESTED', 'TEAM_INVITE_REJECTED', 'DEAL_MEMBER_ADDED', 'DEAL_MEMBER_REMOVED', 'NOTE_CREATED', 'NOTE_DELETED', 'NOTE_PIN_CHANGED', 'ATTACHMENT_ADDED', 'ATTACHMENT_DELETED', 'ATTACHMENT_ARCHIVED');

-- CreateEnum
CREATE TYPE "DealDomainSourceType" AS ENUM ('OPPORTUNITY', 'ACTIVITY', 'NOTE', 'ATTACHMENT', 'NOTIFICATION');

-- CreateEnum
CREATE TYPE "AgentKey" AS ENUM ('EVENT_SUMMARIZER');

-- CreateEnum
CREATE TYPE "AgentOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD', 'CANCELLED');

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "sourceDomainEventId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ActivityRevision" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changeType" "ActivityRevisionChangeType" NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "activityType" "ActivityLogType" NOT NULL,
    "parentId" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealDomainEvent" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "eventType" "DealDomainEventType" NOT NULL,
    "processingClass" "DealDomainEventClass" NOT NULL,
    "sourceType" "DealDomainSourceType" NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "activityRevisionId" TEXT,
    "actorId" TEXT,
    "commandId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "resultRef" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "localEventDate" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealDomainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentOutbox" (
    "id" TEXT NOT NULL,
    "domainEventId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "agentKey" "AgentKey" NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" "AgentOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "lockedBy" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 2,
    "lastErrorCode" TEXT,
    "traceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityRevision_activityId_createdAt_idx" ON "ActivityRevision"("activityId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityRevision_contentHash_idx" ON "ActivityRevision"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityRevision_activityId_version_key" ON "ActivityRevision"("activityId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DealDomainEvent_activityRevisionId_key" ON "DealDomainEvent"("activityRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "DealDomainEvent_commandId_key" ON "DealDomainEvent"("commandId");

-- CreateIndex
CREATE INDEX "DealDomainEvent_dealId_occurredAt_idx" ON "DealDomainEvent"("dealId", "occurredAt");

-- CreateIndex
CREATE INDEX "DealDomainEvent_dealId_localEventDate_occurredAt_idx" ON "DealDomainEvent"("dealId", "localEventDate", "occurredAt");

-- CreateIndex
CREATE INDEX "DealDomainEvent_sourceType_sourceEntityId_sourceVersion_idx" ON "DealDomainEvent"("sourceType", "sourceEntityId", "sourceVersion");

-- CreateIndex
CREATE INDEX "DealDomainEvent_correlationId_idx" ON "DealDomainEvent"("correlationId");

-- CreateIndex
CREATE INDEX "DealDomainEvent_traceId_idx" ON "DealDomainEvent"("traceId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentOutbox_dedupeKey_key" ON "AgentOutbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "AgentOutbox_status_availableAt_priority_idx" ON "AgentOutbox"("status", "availableAt", "priority");

-- CreateIndex
CREATE INDEX "AgentOutbox_leaseUntil_idx" ON "AgentOutbox"("leaseUntil");

-- CreateIndex
CREATE INDEX "AgentOutbox_dealId_createdAt_idx" ON "AgentOutbox"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentOutbox_traceId_idx" ON "AgentOutbox"("traceId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentOutbox_domainEventId_agentKey_promptVersion_schemaVers_key" ON "AgentOutbox"("domainEventId", "agentKey", "promptVersion", "schemaVersion");

-- CreateIndex
CREATE INDEX "Opportunity_deletedAt_status_updatedAt_idx" ON "Opportunity"("deletedAt", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ActivityLog_opportunityId_deletedAt_parentId_createdAt_idx" ON "ActivityLog"("opportunityId", "deletedAt", "parentId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_sourceDomainEventId_idx" ON "ActivityLog"("sourceDomainEventId");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_sourceDomainEventId_fkey" FOREIGN KEY ("sourceDomainEventId") REFERENCES "DealDomainEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRevision" ADD CONSTRAINT "ActivityRevision_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ActivityLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRevision" ADD CONSTRAINT "ActivityRevision_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealDomainEvent" ADD CONSTRAINT "DealDomainEvent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealDomainEvent" ADD CONSTRAINT "DealDomainEvent_activityRevisionId_fkey" FOREIGN KEY ("activityRevisionId") REFERENCES "ActivityRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealDomainEvent" ADD CONSTRAINT "DealDomainEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentOutbox" ADD CONSTRAINT "AgentOutbox_domainEventId_fkey" FOREIGN KEY ("domainEventId") REFERENCES "DealDomainEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
