-- AlterTable
ALTER TABLE "AIProviderConfig" ADD COLUMN     "circuitOpenedAt" TIMESTAMP(3),
ADD COLUMN     "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "probeLockedUntil" TIMESTAMP(3);
