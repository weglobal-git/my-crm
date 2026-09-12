import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  isLeapYear,
  getDaysInMonth,
} from 'date-fns';

export type CalendarRepeatFrequency = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface CalendarEventExceptionDTO {
  id?: string;
  eventId: string;
  occurrenceStartAt: Date;
  overrideStartAt?: Date | null;
  overrideEndAt?: Date | null;
  isCancelled: boolean;
}

export interface CalendarEventMaster {
  id: string;
  name: string;
  allDay: boolean;
  startAt: Date;
  endAt: Date;
  timezone?: string;
  repeatFrequency: CalendarRepeatFrequency;
  repeatUntil?: Date | null;
  exceptions?: CalendarEventExceptionDTO[];
}

export interface RecurrenceExpansionOptions {
  rangeStart: Date;
  rangeEnd: Date;
  timezone?: string;
  maxOccurrences?: number;
}

export interface CalendarOccurrence {
  occurrenceId: string;
  eventId: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  isException: boolean;
  isCancelled?: boolean;
}

export function getOccurrenceStartFromItemId(itemId: string, eventId: string): string | null {
  const prefix = `event:${eventId}:`;
  if (!itemId.startsWith(prefix)) return null;
  const encoded = itemId.slice(prefix.length).replace(/:override$/, '');
  return Number.isFinite(Date.parse(encoded)) ? new Date(encoded).toISOString() : null;
}

export function hasRecurrenceShapeChanged(
  current: Pick<CalendarEventMaster, 'startAt' | 'endAt' | 'allDay' | 'timezone' | 'repeatFrequency' | 'repeatUntil'>,
  next: Pick<CalendarEventMaster, 'startAt' | 'endAt' | 'allDay' | 'timezone' | 'repeatFrequency' | 'repeatUntil'>,
): boolean {
  return current.startAt.getTime() !== next.startAt.getTime() ||
    current.endAt.getTime() !== next.endAt.getTime() ||
    current.allDay !== next.allDay ||
    current.timezone !== next.timezone ||
    current.repeatFrequency !== next.repeatFrequency ||
    (current.repeatUntil?.getTime() ?? null) !== (next.repeatUntil?.getTime() ?? null);
}

/**
 * Calculates the standard 42-day (or 35-day) month grid boundaries.
 * In a standard calendar grid starting on Sunday (weekStartsOn: 0),
 * the range spans from startOfWeek(monthStart) to endOfWeek(monthEnd).
 */
export function getGridRangeForMonth(
  dateOrYear: Date | number,
  monthIndex?: number,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0
): { rangeStart: Date; rangeEnd: Date } {
  let targetDate: Date;
  if (typeof dateOrYear === 'number') {
    targetDate = new Date(dateOrYear, monthIndex ?? 0, 1);
  } else {
    targetDate = dateOrYear;
  }

  const monthStart = startOfMonth(targetDate);
  const monthEnd = endOfMonth(targetDate);

  const rangeStart = startOfWeek(monthStart, { weekStartsOn });
  const rangeEnd = endOfWeek(monthEnd, { weekStartsOn });

  return { rangeStart, rangeEnd };
}

/**
 * Expands a single event (master + exceptions) into bounded occurrences within [rangeStart, rangeEnd].
 * Pure function: Does not query DB or mutate state.
 */
export function expandEventOccurrences(
  event: CalendarEventMaster,
  options: RecurrenceExpansionOptions
): CalendarOccurrence[] {
  const { rangeStart, rangeEnd, maxOccurrences = 500 } = options;
  const occurrences: CalendarOccurrence[] = [];

  const masterDurationMs = event.endAt.getTime() - event.startAt.getTime();
  if (masterDurationMs < 0) {
    return [];
  }

  // Create exception lookup map by original occurrence timestamp (in ms)
  const exceptionMap = new Map<number, CalendarEventExceptionDTO>();
  if (event.exceptions) {
    for (const ex of event.exceptions) {
      exceptionMap.set(new Date(ex.occurrenceStartAt).getTime(), ex);
    }
  }

  // Non-recurring event
  if (!event.repeatFrequency || event.repeatFrequency === 'NONE') {
    // Intersects range if endAt >= rangeStart AND startAt <= rangeEnd
    if (event.endAt >= rangeStart && event.startAt <= rangeEnd) {
      occurrences.push({
        occurrenceId: `event:${event.id}:${event.startAt.toISOString()}`,
        eventId: event.id,
        startAt: event.startAt,
        endAt: event.endAt,
        allDay: event.allDay,
        isException: false,
      });
    }
    return occurrences;
  }

  // Recurring series
  const seriesStart = event.startAt;
  const seriesUntil = event.repeatUntil ? new Date(event.repeatUntil) : null;

  // If the series begins after the query range, nothing to expand
  if (seriesStart > rangeEnd) {
    return occurrences;
  }

  // If the series ended before the query range, nothing to expand
  if (seriesUntil && seriesUntil < rangeStart) {
    return occurrences;
  }

  let count = 0;

  switch (event.repeatFrequency) {
    case 'DAILY': {
      const dayMs = 86_400_000;
      const firstRelevant = rangeStart.getTime() - masterDurationMs;
      const skip = Math.max(0, Math.floor((firstRelevant - seriesStart.getTime()) / dayMs));
      let currentStart = addDays(seriesStart, skip);
      while (currentStart <= rangeEnd && count < maxOccurrences) {
        if (seriesUntil && currentStart > seriesUntil) break;

        const currentEnd = new Date(currentStart.getTime() + masterDurationMs);
        if (currentEnd >= rangeStart) {
          processOccurrence(currentStart, currentEnd);
        }

        currentStart = addDays(currentStart, 1);
        count++;
      }
      break;
    }

    case 'WEEKLY': {
      const weekMs = 7 * 86_400_000;
      const firstRelevant = rangeStart.getTime() - masterDurationMs;
      const skip = Math.max(0, Math.floor((firstRelevant - seriesStart.getTime()) / weekMs));
      let currentStart = addWeeks(seriesStart, skip);
      while (currentStart <= rangeEnd && count < maxOccurrences) {
        if (seriesUntil && currentStart > seriesUntil) break;

        const currentEnd = new Date(currentStart.getTime() + masterDurationMs);
        if (currentEnd >= rangeStart) {
          processOccurrence(currentStart, currentEnd);
        }

        currentStart = addWeeks(currentStart, 1);
        count++;
      }
      break;
    }

    case 'MONTHLY': {
      // Monthly on the same day-of-month (in UTC / calendar timezone representation)
      // Rule: If day does not exist in target month (e.g. 31st in a 30-day month), SKIP the occurrence.
      const targetDay = seriesStart.getUTCDate();
      const targetHours = seriesStart.getUTCHours();
      const targetMinutes = seriesStart.getUTCMinutes();
      const targetSeconds = seriesStart.getUTCSeconds();
      const targetMs = seriesStart.getUTCMilliseconds();

      const firstRelevant = new Date(rangeStart.getTime() - masterDurationMs);
      const firstRelevantMonth = firstRelevant.getUTCFullYear() * 12 + firstRelevant.getUTCMonth();
      const seriesMonth = seriesStart.getUTCFullYear() * 12 + seriesStart.getUTCMonth();
      const initialMonth = Math.max(seriesMonth, firstRelevantMonth);
      let currentYear = Math.floor(initialMonth / 12);
      let currentMonth = initialMonth % 12;

      while (count < maxOccurrences) {
        const daysInCurrentMonth = getDaysInMonth(new Date(Date.UTC(currentYear, currentMonth, 1)));

        if (targetDay <= daysInCurrentMonth) {
          const currentStart = new Date(
            Date.UTC(currentYear, currentMonth, targetDay, targetHours, targetMinutes, targetSeconds, targetMs)
          );

          if (currentStart > rangeEnd) break;
          if (seriesUntil && currentStart > seriesUntil) break;

          const currentEnd = new Date(currentStart.getTime() + masterDurationMs);
          if (currentEnd >= rangeStart) {
            processOccurrence(currentStart, currentEnd);
          }
        }

        // Advance one calendar month
        currentMonth++;
        if (currentMonth > 11) {
          currentMonth = 0;
          currentYear++;
        }

        count++;
        // Safety bound: if currentYear/month is way past rangeEnd, terminate
        const monthCheckDate = new Date(Date.UTC(currentYear, currentMonth, 1));
        if (monthCheckDate > rangeEnd) break;
      }
      break;
    }

    case 'YEARLY': {
      // Yearly on the same month & day-of-month
      // Rule: If Feb 29 and not leap year, SKIP occurrence.
      const targetMonth = seriesStart.getUTCMonth();
      const targetDay = seriesStart.getUTCDate();
      const targetHours = seriesStart.getUTCHours();
      const targetMinutes = seriesStart.getUTCMinutes();
      const targetSeconds = seriesStart.getUTCSeconds();
      const targetMs = seriesStart.getUTCMilliseconds();

      const firstRelevant = new Date(rangeStart.getTime() - masterDurationMs);
      let currentYear = Math.max(seriesStart.getUTCFullYear(), firstRelevant.getUTCFullYear());

      while (count < maxOccurrences) {
        let isValidDate = true;

        if (targetMonth === 1 && targetDay === 29) {
          // February 29th
          if (!isLeapYear(new Date(Date.UTC(currentYear, 0, 1)))) {
            isValidDate = false;
          }
        }

        if (isValidDate) {
          const currentStart = new Date(
            Date.UTC(currentYear, targetMonth, targetDay, targetHours, targetMinutes, targetSeconds, targetMs)
          );

          if (currentStart > rangeEnd) break;
          if (seriesUntil && currentStart > seriesUntil) break;

          const currentEnd = new Date(currentStart.getTime() + masterDurationMs);
          if (currentEnd >= rangeStart) {
            processOccurrence(currentStart, currentEnd);
          }
        }

        currentYear++;
        count++;

        const yearCheckDate = new Date(Date.UTC(currentYear, targetMonth, 1));
        if (yearCheckDate > rangeEnd) break;
      }
      break;
    }
  }

  return occurrences;

  function processOccurrence(start: Date, end: Date) {
    const timestampKey = start.getTime();
    const exception = exceptionMap.get(timestampKey);

    if (exception) {
      if (exception.isCancelled) {
        // Cancelled occurrence: skip output
        return;
      }

      const effectiveStart = exception.overrideStartAt ? new Date(exception.overrideStartAt) : start;
      const effectiveEnd = exception.overrideEndAt ? new Date(exception.overrideEndAt) : end;

      // Check if overridden occurrence intersects range
      if (effectiveEnd >= rangeStart && effectiveStart <= rangeEnd) {
        occurrences.push({
          occurrenceId: `event:${event.id}:${start.toISOString()}:override`,
          eventId: event.id,
          startAt: effectiveStart,
          endAt: effectiveEnd,
          allDay: event.allDay,
          isException: true,
        });
      }
      return;
    }

    occurrences.push({
      occurrenceId: `event:${event.id}:${start.toISOString()}`,
      eventId: event.id,
      startAt: start,
      endAt: end,
      allDay: event.allDay,
      isException: false,
    });
  }
}
