import 'server-only';

import prisma from '@/lib/prisma';
import { dispatchNotificationWithResult } from '@/lib/notification-dispatcher';
import { expandEventOccurrences } from '@/lib/calendar/calendar-recurrence';
import { filterCalendarRecipientIds } from '@/lib/calendar/calendar-realtime-server';
import {
  CALENDAR_REMINDER_CLAIM_TIMEOUT_MS,
  CALENDAR_REMINDER_LOOKAHEAD_MS,
  CALENDAR_REMINDER_MAX_ATTEMPTS,
  CALENDAR_REMINDER_RETENTION_MS,
  formatCalendarReminderMessage,
  getCalendarReminderScheduledFor,
} from '@/lib/calendar/calendar-reminder-policy';

const MATERIALIZE_LIMIT = 500;
const DELIVERY_BATCH_SIZE = 100;

export interface CalendarReminderRunResult {
  materialized: number;
  delivered: number;
  retried: number;
  failed: number;
  cleaned: number;
}

export async function runCalendarReminderWorker(now = new Date()): Promise<CalendarReminderRunResult> {
  const rangeEnd = new Date(now.getTime() + CALENDAR_REMINDER_LOOKAHEAD_MS);
  const occurrenceRangeStart = new Date(now.getTime() - CALENDAR_REMINDER_CLAIM_TIMEOUT_MS);
  const events = await prisma.calendarEvent.findMany({
    where: {
      startAt: { lte: rangeEnd },
      OR: [
        { repeatFrequency: 'NONE', endAt: { gte: occurrenceRangeStart } },
        { repeatFrequency: { not: 'NONE' }, OR: [{ repeatUntil: null }, { repeatUntil: { gte: occurrenceRangeStart } }] },
      ],
      recipients: { some: { reminderEnabled: true } },
    },
    take: MATERIALIZE_LIMIT,
    orderBy: { startAt: 'asc' },
    include: {
      recipients: { where: { reminderEnabled: true } },
      exceptions: true,
    },
  });

  const rows = events.flatMap((event) => {
    const occurrences = expandEventOccurrences(event, { rangeStart: occurrenceRangeStart, rangeEnd, maxOccurrences: 500 });
    return occurrences.flatMap((occurrence) => event.recipients.map((recipient) => ({
      eventId: event.id,
      recipientId: recipient.userId,
      occurrenceStartAt: occurrence.startAt,
      scheduledFor: getCalendarReminderScheduledFor(occurrence.startAt, recipient.reminderOffsetMins),
    })));
  });

  let materialized = rows.length
    ? (await prisma.calendarReminderDelivery.createMany({ data: rows, skipDuplicates: true })).count
    : 0;

  // A recipient can be disabled and later re-enabled for the same occurrence.
  // Revive only keys that the current event definition still materializes.
  if (rows.length) {
    const desiredKeys = new Set(rows.map((row) => [
      row.eventId, row.recipientId, row.occurrenceStartAt.toISOString(), row.scheduledFor.toISOString(),
    ].join('|')));
    const cancelled = await prisma.calendarReminderDelivery.findMany({
      where: {
        eventId: { in: [...new Set(rows.map((row) => row.eventId))] },
        status: 'CANCELLED',
        scheduledFor: { gte: new Date(now.getTime() - CALENDAR_REMINDER_CLAIM_TIMEOUT_MS), lte: rangeEnd },
      },
      select: { id: true, eventId: true, recipientId: true, occurrenceStartAt: true, scheduledFor: true },
    });
    const reviveIds = cancelled.filter((row) => desiredKeys.has([
      row.eventId, row.recipientId, row.occurrenceStartAt.toISOString(), row.scheduledFor.toISOString(),
    ].join('|'))).map((row) => row.id);
    if (reviveIds.length) {
      const revived = await prisma.calendarReminderDelivery.updateMany({
        where: { id: { in: reviveIds }, status: 'CANCELLED' },
        data: { status: 'PENDING', attempts: 0, lastError: null },
      });
      materialized += revived.count;
    }
  }

  const staleClaimBefore = new Date(now.getTime() - CALENDAR_REMINDER_CLAIM_TIMEOUT_MS);
  await prisma.calendarReminderDelivery.updateMany({
    where: { status: 'PROCESSING', updatedAt: { lt: staleClaimBefore }, attempts: { lt: CALENDAR_REMINDER_MAX_ATTEMPTS } },
    data: { status: 'PENDING', lastError: 'STALE_CLAIM_RECOVERED' },
  });
  await prisma.calendarReminderDelivery.updateMany({
    where: { status: { in: ['PENDING', 'PROCESSING'] }, attempts: { gte: CALENDAR_REMINDER_MAX_ATTEMPTS } },
    data: { status: 'FAILED', lastError: 'MAX_ATTEMPTS_EXCEEDED' },
  });

  const due = await prisma.calendarReminderDelivery.findMany({
    where: { status: 'PENDING', scheduledFor: { lte: now }, attempts: { lt: CALENDAR_REMINDER_MAX_ATTEMPTS } },
    take: DELIVERY_BATCH_SIZE,
    orderBy: { scheduledFor: 'asc' },
    include: { event: true },
  });
  const eligibleRecipientIds = new Set(await filterCalendarRecipientIds(due.map((delivery) => delivery.recipientId)));

  let delivered = 0;
  let retried = 0;
  let failed = 0;
  for (const delivery of due) {
    if (!eligibleRecipientIds.has(delivery.recipientId)) {
      await prisma.calendarReminderDelivery.updateMany({
        where: { id: delivery.id, status: 'PENDING' },
        data: { status: 'CANCELLED', lastError: 'RECIPIENT_ACCESS_REVOKED' },
      });
      continue;
    }
    const claimed = await prisma.calendarReminderDelivery.updateMany({
      where: { id: delivery.id, status: 'PENDING', attempts: delivery.attempts },
      data: { status: 'PROCESSING', attempts: { increment: 1 }, lastError: null },
    });
    if (claimed.count !== 1) continue;

    try {
      const notification = await prisma.$transaction(async (tx) => {
        const completed = await tx.calendarReminderDelivery.updateMany({
          where: { id: delivery.id, status: 'PROCESSING', attempts: delivery.attempts + 1 },
          data: { status: 'DELIVERED', deliveredAt: now },
        });
        if (completed.count !== 1) throw new Error('DELIVERY_CANCELLED');
        const created = await tx.notification.create({
          data: {
            recipientId: delivery.recipientId,
            type: 'CALENDAR_REMINDER',
            title: delivery.event.name,
            message: formatCalendarReminderMessage(delivery.occurrenceStartAt, delivery.event.allDay, delivery.event.timezone),
            referenceId: `${delivery.eventId}|${delivery.occurrenceStartAt.toISOString()}`,
          },
          include: { sender: { select: { id: true, name: true, image: true, role: true } } },
        });
        await tx.calendarReminderDelivery.update({
          where: { id: delivery.id },
          data: { notificationId: created.id },
        });
        return created;
      });
      delivered += 1;
      await dispatchNotificationWithResult(delivery.recipientId, notification);
    } catch (error) {
      if (error instanceof Error && error.message === 'DELIVERY_CANCELLED') continue;
      const attempts = delivery.attempts + 1;
      const terminal = attempts >= CALENDAR_REMINDER_MAX_ATTEMPTS;
      await prisma.calendarReminderDelivery.updateMany({
        where: { id: delivery.id, status: 'PROCESSING' },
        data: {
          status: terminal ? 'FAILED' : 'PENDING',
          lastError: error instanceof Error ? error.message.slice(0, 500) : 'UNKNOWN_DELIVERY_ERROR',
        },
      });
      if (terminal) failed += 1;
      else retried += 1;
    }
  }

  const cleaned = (await prisma.calendarReminderDelivery.deleteMany({
    where: {
      status: { in: ['DELIVERED', 'FAILED', 'CANCELLED'] },
      updatedAt: { lt: new Date(now.getTime() - CALENDAR_REMINDER_RETENTION_MS) },
    },
  })).count;

  return { materialized, delivered, retried, failed, cleaned };
}
