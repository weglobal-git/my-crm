export interface UserLeaveDTO {
  userId: string;
  userName: string;
  userImage?: string | null;
  dateStr: string;
}

export function parseHolidayDates(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((date): date is string => typeof date === 'string') : [];
  } catch {
    return [];
  }
}

export function toggleHolidayDate(holidays: string[], dateStr: string): string[] {
  const next = new Set(holidays);
  if (next.has(dateStr)) next.delete(dateStr);
  else next.add(dateStr);
  return [...next].sort();
}

export function parseUserLeaves(value: string | null | undefined): UserLeaveDTO[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is UserLeaveDTO => Boolean(item && typeof item === 'object' && 'userId' in item && 'dateStr' in item))
      : [];
  } catch {
    return [];
  }
}

export function toggleUserLeave(
  leaves: UserLeaveDTO[],
  leave: UserLeaveDTO,
): UserLeaveDTO[] {
  const exists = leaves.some((item) => item.userId === leave.userId && item.dateStr === leave.dateStr);
  return exists
    ? leaves.filter((item) => item.userId !== leave.userId || item.dateStr !== leave.dateStr)
    : [...leaves, leave];
}
