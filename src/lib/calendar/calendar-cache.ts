/**
 * Generates user-scoped cache keys for the Calendar feature.
 * All keys MUST include userId to prevent cross-account cache leakage.
 */

export function calendarMonthKey(
  userId: string,
  year: number,
  month: number,
  filterSignature: string = 'default'
): [string, string, number, number, string] {
  return ['calendar-month', userId, year, month, filterSignature];
}

export function calendarEventDetailKey(
  userId: string,
  eventId: string
): [string, string, string] {
  return ['calendar-event-detail', userId, eventId];
}

export function calendarDayKey(
  userId: string,
  localDate: string,
  filterSignature: string = 'default'
): [string, string, string, string] {
  return ['calendar-day', userId, localDate, filterSignature];
}

export function calendarTagsKey(
  userId: string,
  departmentId: string
): [string, string, string] {
  return ['calendar-tags', userId, departmentId];
}

export function calendarRecipientsKey(
  userId: string,
  departmentId: string
): [string, string, string] {
  return ['calendar-recipients', userId, departmentId];
}

export function calendarDepartmentsKey(
  userId: string
): [string, string] {
  return ['calendar-departments', userId];
}

export function calendarFinancialInfoKey(
  userId: string,
  opportunityId: string
): [string, string, string] {
  return ['calendar-financial-info', userId, opportunityId];
}
