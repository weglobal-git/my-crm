import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CALENDAR_REMINDER_MAX_ATTEMPTS,
  formatCalendarReminderMessage,
  getCalendarReminderScheduledFor,
  isCalendarReminderCronAuthorized,
  isCalendarReminderDue,
  shouldRetryCalendarReminder,
} from './calendar-reminder-policy';

describe('calendar reminder policy', () => {
  it('subtracts the recipient offset without changing the occurrence', () => {
    const occurrence = new Date('2026-09-12T10:00:00.000Z');
    assert.equal(getCalendarReminderScheduledFor(occurrence, 15).toISOString(), '2026-09-12T09:45:00.000Z');
    assert.equal(occurrence.toISOString(), '2026-09-12T10:00:00.000Z');
  });

  it('treats an exact scheduler boundary as due', () => {
    const now = new Date('2026-09-12T10:00:00.000Z');
    assert.equal(isCalendarReminderDue(now, now), true);
    assert.equal(isCalendarReminderDue(new Date(now.getTime() + 1), now), false);
  });

  it('bounds retries and rejects poison deliveries', () => {
    assert.equal(shouldRetryCalendarReminder('PENDING', CALENDAR_REMINDER_MAX_ATTEMPTS - 1), true);
    assert.equal(shouldRetryCalendarReminder('PENDING', CALENDAR_REMINDER_MAX_ATTEMPTS), false);
    assert.equal(shouldRetryCalendarReminder('FAILED', 0), false);
  });

  it('requires a configured exact bearer secret without exposing it', () => {
    assert.equal(isCalendarReminderCronAuthorized('Bearer secret', 'secret'), true);
    assert.equal(isCalendarReminderCronAuthorized('Bearer wrong', 'secret'), false);
    assert.equal(isCalendarReminderCronAuthorized(null, 'secret'), false);
    assert.equal(isCalendarReminderCronAuthorized('Bearer undefined', undefined), false);
  });

  it('formats timed and all-day reminder messages in the event timezone', () => {
    const start = new Date('2026-09-12T03:00:00.000Z');
    assert.match(formatCalendarReminderMessage(start, false, 'Asia/Bangkok'), /10:00/);
    assert.match(formatCalendarReminderMessage(start, true, 'Asia/Bangkok'), /^All-day event on/);
  });
});
