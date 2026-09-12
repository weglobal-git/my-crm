-- CreateEnum
CREATE TYPE "CalendarRepeatFrequency" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "detail" TEXT,
    "departmentId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    "repeatFrequency" "CalendarRepeatFrequency" NOT NULL DEFAULT 'NONE',
    "repeatUntil" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEventRecipient" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderOffsetMins" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CalendarEventRecipient_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateTable
CREATE TABLE "CalendarTag" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEventTag" (
    "eventId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventTag_pkey" PRIMARY KEY ("eventId","tagId")
);

-- CreateTable
CREATE TABLE "CalendarEventException" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "occurrenceStartAt" TIMESTAMP(3) NOT NULL,
    "overrideStartAt" TIMESTAMP(3),
    "overrideEndAt" TIMESTAMP(3),
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEventException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarReminderDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "occurrenceStartAt" TIMESTAMP(3) NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarReminderDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEvent_departmentId_startAt_idx" ON "CalendarEvent"("departmentId", "startAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_ownerId_startAt_idx" ON "CalendarEvent"("ownerId", "startAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_repeatFrequency_startAt_repeatUntil_idx" ON "CalendarEvent"("repeatFrequency", "startAt", "repeatUntil");

-- CreateIndex
CREATE INDEX "CalendarEventRecipient_userId_eventId_idx" ON "CalendarEventRecipient"("userId", "eventId");

-- CreateIndex
CREATE INDEX "CalendarTag_departmentId_idx" ON "CalendarTag"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarTag_departmentId_normalizedName_key" ON "CalendarTag"("departmentId", "normalizedName");

-- CreateIndex
CREATE INDEX "CalendarEventTag_tagId_idx" ON "CalendarEventTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventException_eventId_occurrenceStartAt_key" ON "CalendarEventException"("eventId", "occurrenceStartAt");

-- CreateIndex
CREATE INDEX "CalendarReminderDelivery_status_scheduledFor_idx" ON "CalendarReminderDelivery"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarReminderDelivery_eventId_recipientId_occurrenceStartAt_scheduledFor_key" ON "CalendarReminderDelivery"("eventId", "recipientId", "occurrenceStartAt", "scheduledFor");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventRecipient" ADD CONSTRAINT "CalendarEventRecipient_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventRecipient" ADD CONSTRAINT "CalendarEventRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarTag" ADD CONSTRAINT "CalendarTag_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventTag" ADD CONSTRAINT "CalendarEventTag_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventTag" ADD CONSTRAINT "CalendarEventTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "CalendarTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventException" ADD CONSTRAINT "CalendarEventException_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarReminderDelivery" ADD CONSTRAINT "CalendarReminderDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
