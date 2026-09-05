CREATE TABLE "AIManagerToolCallAudit" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "traceId" TEXT NOT NULL,
  "dealId" TEXT,
  "toolName" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "allowed" BOOLEAN NOT NULL,
  "denialCode" TEXT,
  "grantedCapabilities" TEXT[] NOT NULL,
  "resultCount" INTEGER NOT NULL DEFAULT 0,
  "durationMs" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AIManagerToolCallAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AIManagerToolCallAudit_actorId_createdAt_idx" ON "AIManagerToolCallAudit"("actorId", "createdAt");
CREATE INDEX "AIManagerToolCallAudit_traceId_idx" ON "AIManagerToolCallAudit"("traceId");
CREATE INDEX "AIManagerToolCallAudit_dealId_createdAt_idx" ON "AIManagerToolCallAudit"("dealId", "createdAt");
CREATE INDEX "AIManagerToolCallAudit_toolName_allowed_createdAt_idx" ON "AIManagerToolCallAudit"("toolName", "allowed", "createdAt");

ALTER TABLE "AIManagerToolCallAudit" ADD CONSTRAINT "AIManagerToolCallAudit_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
