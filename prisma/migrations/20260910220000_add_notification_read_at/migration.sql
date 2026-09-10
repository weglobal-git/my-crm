-- Additive only: track notification read state independently from workflow status
ALTER TABLE "Notification" ADD COLUMN "readAt" TIMESTAMP(3);
