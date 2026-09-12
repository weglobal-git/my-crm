-- Persist client request identity so retries remain idempotent across serverless instances.
ALTER TABLE "CalendarEvent" ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "CalendarEvent_ownerId_clientRequestId_key"
ON "CalendarEvent"("ownerId", "clientRequestId");
