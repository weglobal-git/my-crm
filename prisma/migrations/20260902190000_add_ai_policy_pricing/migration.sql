ALTER TABLE "AIModelPolicy"
ADD COLUMN "inputCostMicrosPerMillionTokens" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "outputCostMicrosPerMillionTokens" BIGINT NOT NULL DEFAULT 0;
