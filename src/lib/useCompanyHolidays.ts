'use client';

import useSWR from 'swr';
import { useMemo } from 'react';
import { getCompanyHolidaysAction, getUserLeavesAction, type UserLeaveDTO } from '@/lib/actions/holiday';

export function useCompanyHolidays() {
  const { data: holidaysList, mutate } = useSWR(
    'company-holidays',
    getCompanyHolidaysAction,
    { revalidateOnFocus: true, dedupingInterval: 10_000 }
  );

  const holidaysSet = useMemo(() => new Set(holidaysList || []), [holidaysList]);

  return {
    holidaysList: holidaysList || [],
    holidaysSet,
    mutate,
  };
}

export function useUserLeaves(currentUserId?: string) {
  const { data: leavesList, mutate } = useSWR(
    'user-leaves',
    getUserLeavesAction,
    { revalidateOnFocus: true, dedupingInterval: 10_000 }
  );

  const leavesByDate = useMemo(() => {
    const map = new Map<string, UserLeaveDTO[]>();
    for (const item of leavesList || []) {
      const existing = map.get(item.dateStr) || [];
      existing.push(item);
      map.set(item.dateStr, existing);
    }
    return map;
  }, [leavesList]);

  const currentUserLeavesSet = useMemo(() => {
    if (!currentUserId) return new Set<string>();
    const set = new Set<string>();
    for (const item of leavesList || []) {
      if (item.userId === currentUserId) {
        set.add(item.dateStr);
      }
    }
    return set;
  }, [leavesList, currentUserId]);

  const leavesByUser = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const item of leavesList || []) {
      let set = map.get(item.userId);
      if (!set) {
        set = new Set<string>();
        map.set(item.userId, set);
      }
      set.add(item.dateStr);
    }
    return map;
  }, [leavesList]);

  return {
    leavesList: leavesList || [],
    leavesByDate,
    currentUserLeavesSet,
    leavesByUser,
    mutate,
  };
}
