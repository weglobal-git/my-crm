ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CALENDAR_REMINDER';

ALTER TABLE "CalendarReminderDelivery" ADD COLUMN "notificationId" TEXT;

CREATE UNIQUE INDEX "CalendarReminderDelivery_notificationId_key"
ON "CalendarReminderDelivery"("notificationId");

ALTER TABLE "CalendarReminderDelivery"
ADD CONSTRAINT "CalendarReminderDelivery_notificationId_fkey"
FOREIGN KEY ("notificationId") REFERENCES "Notification"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
