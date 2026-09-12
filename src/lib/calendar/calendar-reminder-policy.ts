export const CALENDAR_REMINDER_MAX_ATTEMPTS = 5;
export const CALENDAR_REMINDER_LOOKAHEAD_MS = 8 * 24 * 60 * 60 * 1000;
export const CALENDAR_REMINDER_CLAIM_TIMEOUT_MS = 10 * 60 * 1000;
export const CALENDAR_REMINDER_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export function getCalendarReminderScheduledFor(occurrenceStartAt: Date, offsetMins: number): Date {
  return new Date(occurrenceStartAt.getTime() - offsetMins * 60_000);
}

export function isCalendarReminderDue(scheduledFor: Date, now: Date): boolean {
  return scheduledFor.getTime() <= now.getTime();
}

export function shouldRetryCalendarReminder(status: string, attempts: number): boolean {
  return status === 'PENDING' && attempts < CALENDAR_REMINDER_MAX_ATTEMPTS;
}

export function isCalendarReminderCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  return Boolean(secret && authorization === `Bearer ${secret}`);
}

export function formatCalendarReminderMessage(startAt: Date, allDay: boolean, timezone: string): string {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    day: '2-digit', month: 'short', year: 'numeric',
    ...(allDay ? {} : { hour: '2-digit', minute: '2-digit', hour12: false }),
  }).format(startAt);
  return allDay ? `All-day event on ${formatted}` : `Event starts at ${formatted}`;
}
