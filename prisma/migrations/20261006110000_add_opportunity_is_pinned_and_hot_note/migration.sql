-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Opportunity" ADD COLUMN "hotNote" TEXT;
