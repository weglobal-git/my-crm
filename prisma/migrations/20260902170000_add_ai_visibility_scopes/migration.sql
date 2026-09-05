-- Existing AI text is unclassified. Backfill it with the most restrictive
-- capability set; new revisions always write a deterministic source snapshot.
ALTER TABLE "DealAIEventRevision"
  ADD COLUMN "requiredCapabilities" TEXT[] NOT NULL
    DEFAULT ARRAY['ACTIVITY', 'CUSTOMER', 'PRODUCT', 'COMMERCIAL']::TEXT[],
  ADD COLUMN "visibilityPolicyVersion" TEXT NOT NULL DEFAULT 'ai-visibility-v1';

ALTER TABLE "DealAIFact"
  ADD COLUMN "requiredCapabilities" TEXT[] NOT NULL
    DEFAULT ARRAY['ACTIVITY', 'CUSTOMER', 'PRODUCT', 'COMMERCIAL']::TEXT[],
  ADD COLUMN "visibilityPolicyVersion" TEXT NOT NULL DEFAULT 'ai-visibility-v1';

CREATE INDEX "DealAIEventRevision_visibilityPolicyVersion_idx"
  ON "DealAIEventRevision"("visibilityPolicyVersion");

CREATE INDEX "DealAIFact_dealId_visibilityPolicyVersion_idx"
  ON "DealAIFact"("dealId", "visibilityPolicyVersion");
