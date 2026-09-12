import { useState, useCallback } from 'react';

export interface CalendarEventDraft {
  name: string;
  detail: string;
  departmentId: string;
  allDay: boolean;
  startAt: string;
  endAt: string;
  repeatFrequency: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  repeatUntil: string | null;
  tagIds: string[];
  reminderEnabled: boolean;
  reminderOffsetMins: number;
  recipients: Array<{
    userId: string;
    reminderEnabled: boolean;
    reminderOffsetMins: number;
  }>;
  lastUpdated?: number;
}

// Global in-memory storage keyed by userId -> eventKey ('new' | eventId) -> Draft
const draftStorage = new Map<string, Map<string, CalendarEventDraft>>();

/**
 * Get draft for a user and eventKey
 */
export function getCalendarDraft(userId: string, eventKey: string = 'new'): CalendarEventDraft | undefined {
  if (!userId) return undefined;
  const userMap = draftStorage.get(userId);
  if (!userMap) return undefined;
  return userMap.get(eventKey);
}

/**
 * Set or update draft for a user and eventKey
 */
export function setCalendarDraft(userId: string, eventKey: string = 'new', draft: CalendarEventDraft): void {
  if (!userId) return;
  let userMap = draftStorage.get(userId);
  if (!userMap) {
    userMap = new Map<string, CalendarEventDraft>();
    draftStorage.set(userId, userMap);
  }
  userMap.set(eventKey, draft);
}

/**
 * Clear draft for a specific user and eventKey (e.g. after successful save)
 */
export function clearCalendarDraft(userId: string, eventKey: string = 'new'): void {
  if (!userId) return;
  const userMap = draftStorage.get(userId);
  if (userMap) {
    userMap.delete(eventKey);
    if (userMap.size === 0) {
      draftStorage.delete(userId);
    }
  }
}

/**
 * Clear all drafts for a user (e.g. on logout)
 */
export function clearAllCalendarDraftsForUser(userId: string): void {
  if (!userId) return;
  draftStorage.delete(userId);
}

/**
 * Reset entire store (useful for testing or full cleanup)
 */
export function resetAllCalendarDrafts(): void {
  draftStorage.clear();
}

/**
 * React hook to bind draft state with memory preservation across panel toggling
 */
export function useCalendarDraft(
  userId: string | undefined,
  eventKey: string,
  initialDraftFallback: CalendarEventDraft
) {
  const effectiveUserId = userId || 'anonymous';
  const compositeKey = `${effectiveUserId}:${eventKey}`;
  const [prevCompositeKey, setPrevCompositeKey] = useState(compositeKey);
  const [draft, setDraftState] = useState<CalendarEventDraft>(() => {
    return getCalendarDraft(effectiveUserId, eventKey) || initialDraftFallback;
  });

  if (compositeKey !== prevCompositeKey) {
    setPrevCompositeKey(compositeKey);
    const existing = getCalendarDraft(effectiveUserId, eventKey);
    setDraftState(existing || initialDraftFallback);
  }

  const updateDraft = useCallback(
    (patch: Partial<CalendarEventDraft> | ((prev: CalendarEventDraft) => Partial<CalendarEventDraft>)) => {
      setDraftState((prev) => {
        const resolvedPatch = typeof patch === 'function' ? patch(prev) : patch;
        const next: CalendarEventDraft = {
          ...prev,
          ...resolvedPatch,
          lastUpdated: Date.now(),
        };
        setCalendarDraft(effectiveUserId, eventKey, next);
        return next;
      });
    },
    [effectiveUserId, eventKey]
  );

  const clearCurrentDraft = useCallback(() => {
    clearCalendarDraft(effectiveUserId, eventKey);
    setDraftState(initialDraftFallback);
  }, [effectiveUserId, eventKey, initialDraftFallback]);

  return {
    draft,
    updateDraft,
    clearCurrentDraft,
  };
}
