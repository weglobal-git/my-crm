import { useState, useCallback, useRef } from 'react';

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
    name?: string | null;
    email?: string | null;
    image?: string | null;
    reminderEnabled: boolean;
    reminderOffsetMins: number;
  }>;
  lastUpdated?: number;
}

/**
 * Generates a date-scoped draft key for new events so clicking different days
 * on the calendar does not reuse a stale date from a previously clicked day.
 */
export function buildNewEventDraftKey(defaultDate?: Date | null): string {
  if (!defaultDate || !Number.isFinite(defaultDate.getTime())) return 'new';
  const yyyy = defaultDate.getFullYear();
  const mm = String(defaultDate.getMonth() + 1).padStart(2, '0');
  const dd = String(defaultDate.getDate()).padStart(2, '0');
  return `new:${yyyy}-${mm}-${dd}`;
}

// Global in-memory storage keyed by userId -> eventKey ('new' | 'new:YYYY-MM-DD' | eventId) -> Draft
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
 * Merge server-hydrated draft fields with a user's in-progress draft,
 * preserving any fields the user has explicitly modified.
 */
export function mergeHydratedDraftWithDirtyFields(
  currentDraft: CalendarEventDraft,
  hydratedPatch: Partial<CalendarEventDraft>,
  dirtyFields: ReadonlySet<keyof CalendarEventDraft>
): CalendarEventDraft {
  const next: CalendarEventDraft = { ...currentDraft };
  for (const key of Object.keys(hydratedPatch) as Array<keyof CalendarEventDraft>) {
    if (key === 'lastUpdated') continue;
    if (dirtyFields.has(key)) continue;
    const value = hydratedPatch[key];
    if (value !== undefined) {
      (next as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

/**
 * React hook to bind draft state with memory preservation across panel toggling.
 * Separates user edits (`updateDraft`) from server hydration (`hydrateDraft`)
 * so background detail fetches never overwrite fields the user already typed.
 */
export function useCalendarDraft(
  userId: string | undefined,
  eventKey: string,
  initialDraftFallback: CalendarEventDraft
) {
  const effectiveUserId = userId || 'anonymous';
  const compositeKey = `${effectiveUserId}:${eventKey}`;
  const [prevCompositeKey, setPrevCompositeKey] = useState(compositeKey);
  const dirtyFieldsRef = useRef<Set<keyof CalendarEventDraft>>(new Set());

  const [draft, setDraftState] = useState<CalendarEventDraft>(() => {
    const existing = getCalendarDraft(effectiveUserId, eventKey);
    return existing || initialDraftFallback;
  });

  if (compositeKey !== prevCompositeKey) {
    setPrevCompositeKey(compositeKey);
    dirtyFieldsRef.current = new Set();
    const existing = getCalendarDraft(effectiveUserId, eventKey);
    setDraftState(existing || initialDraftFallback);
  }

  /**
   * Called when the user explicitly modifies one or more form fields.
   * Marks those fields as dirty and persists the draft in memory.
   */
  const updateDraft = useCallback(
    (patch: Partial<CalendarEventDraft> | ((prev: CalendarEventDraft) => Partial<CalendarEventDraft>)) => {
      setDraftState((prev) => {
        const resolvedPatch = typeof patch === 'function' ? patch(prev) : patch;
        for (const key of Object.keys(resolvedPatch) as Array<keyof CalendarEventDraft>) {
          if (key !== 'lastUpdated') {
            dirtyFieldsRef.current.add(key);
          }
        }
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

  /**
   * Called when authoritative data arrives from the server (e.g. `getCalendarEventDetailAction`
   * or default department resolution). Never overwrites fields the user has already modified,
   * and does not pollute `draftStorage` unless the user has unsaved edits.
   */
  const hydrateDraft = useCallback(
    (serverPatch: Partial<CalendarEventDraft>) => {
      setDraftState((prev) => {
        const stored = getCalendarDraft(effectiveUserId, eventKey);
        if (stored && dirtyFieldsRef.current.size === 0) {
          // User had a stored unsaved draft from earlier in this session; keep their stored edits
          return stored;
        }
        const merged = mergeHydratedDraftWithDirtyFields(prev, serverPatch, dirtyFieldsRef.current);
        if (dirtyFieldsRef.current.size > 0) {
          setCalendarDraft(effectiveUserId, eventKey, {
            ...merged,
            lastUpdated: Date.now(),
          });
        }
        return merged;
      });
    },
    [effectiveUserId, eventKey]
  );

  const clearCurrentDraft = useCallback((resetState: boolean = true) => {
    dirtyFieldsRef.current.clear();
    clearCalendarDraft(effectiveUserId, eventKey);
    if (resetState) {
      setDraftState(initialDraftFallback);
    }
  }, [effectiveUserId, eventKey, initialDraftFallback]);

  return {
    draft,
    updateDraft,
    hydrateDraft,
    clearCurrentDraft,
    dirtyFieldsRef,
  };
}
