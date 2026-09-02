-- CreateEnum
CREATE TYPE "DealAIFactStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'RETRACTED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "FactRelationType" AS ENUM ('UPDATED_BY', 'CONTRADICTED_BY', 'CORRECTED_BY', 'SOURCE_DELETED');

-- CreateEnum
CREATE TYPE "DealAIFactMode" AS ENUM ('STATE', 'OCCURRENCE');

-- CreateTable
CREATE TABLE "DealAIFact" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "aiEventId" TEXT NOT NULL,
    "sourceRevisionId" TEXT NOT NULL,
    "sourceDomainEventId" TEXT NOT NULL,
    "sourceOccurredAt" TIMESTAMP(3) NOT NULL,
    "sourceSummaryRevision" INTEGER NOT NULL,
    "factType" TEXT NOT NULL,
    "factMode" "DealAIFactMode" NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "normalizedValue" JSONB,
    "normalizedValueHash" TEXT NOT NULL,
    "sourceFactKey" TEXT NOT NULL,
    "importance" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION,
    "status" "DealAIFactStatus" NOT NULL DEFAULT 'ACTIVE',
    "supersededById" TEXT,
    "supersessionReason" "FactRelationType",
    "observedAt" TIMESTAMP(3) NOT NULL,
    "localEventDate" DATE NOT NULL,
    "createdById" TEXT,
    "retractedAt" TIMESTAMP(3),
    "retractedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealAIFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealAIFact_dealId_status_factType_idx" ON "DealAIFact"("dealId", "status", "factType");

-- CreateIndex
CREATE INDEX "DealAIFact_dealId_observedAt_idx" ON "DealAIFact"("dealId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DealAIFact_sourceRevisionId_sourceFactKey_key" ON "DealAIFact"("sourceRevisionId", "sourceFactKey");

-- AddForeignKey
ALTER TABLE "DealAIFact" ADD CONSTRAINT "DealAIFact_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealAIFact" ADD CONSTRAINT "DealAIFact_aiEventId_fkey" FOREIGN KEY ("aiEventId") REFERENCES "DealAIEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealAIFact" ADD CONSTRAINT "DealAIFact_sourceRevisionId_fkey" FOREIGN KEY ("sourceRevisionId") REFERENCES "DealAIEventRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealAIFact" ADD CONSTRAINT "DealAIFact_sourceDomainEventId_fkey" FOREIGN KEY ("sourceDomainEventId") REFERENCES "DealDomainEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealAIFact" ADD CONSTRAINT "DealAIFact_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "DealAIFact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealAIFact" ADD CONSTRAINT "DealAIFact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealAIFact" ADD CONSTRAINT "DealAIFact_retractedById_fkey" FOREIGN KEY ("retractedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add Check Constraints for importance and confidence
ALTER TABLE "DealAIFact" ADD CONSTRAINT "DealAIFact_importance_check" CHECK (importance >= 4 AND importance <= 5);
ALTER TABLE "DealAIFact" ADD CONSTRAINT "DealAIFact_confidence_check" CHECK (confidence >= 0.0 AND confidence <= 1.0);

-- Enforce at most one ACTIVE state fact per dealId + factType + subject
CREATE UNIQUE INDEX "DealAIFact_active_state_key" ON "DealAIFact"("dealId", "factType", "subject") WHERE status = 'ACTIVE' AND "factMode" = 'STATE';

