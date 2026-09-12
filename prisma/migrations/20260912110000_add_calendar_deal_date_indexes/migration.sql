-- Additive indexes for the Calendar 42-day Opportunity projection.
CREATE INDEX IF NOT EXISTS "Opportunity_goodsReadyDate_idx" ON "Opportunity"("goodsReadyDate");
CREATE INDEX IF NOT EXISTS "Opportunity_goodsLoadingDate_idx" ON "Opportunity"("goodsLoadingDate");
