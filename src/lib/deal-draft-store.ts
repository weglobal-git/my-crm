import { useState, useCallback, useEffect } from 'react';

export interface ActivityDraft {
  text: string;
  pendingDueDate?: Date | 'REMOVE' | null;
  pendingAttachments?: File[];
  isManagerCallMode?: boolean;
  replies?: Record<string, string>;
  lastUpdated?: number;
}

// Global in-memory storage keyed by dealId -> tabId -> Draft
const draftStorage = new Map<string, Map<string, unknown>>();

/**
 * Get draft for a specific deal and tab
 */
export function getDealDraft<T = ActivityDraft>(dealId: string, tabId: string = 'activity'): T | undefined {
  if (!dealId) return undefined;
  const dealMap = draftStorage.get(dealId);
  if (!dealMap) return undefined;
  return dealMap.get(tabId) as T | undefined;
}

/**
 * Set or update draft for a specific deal and tab
 */
export function setDealDraft<T = ActivityDraft>(dealId: string, tabId: string = 'activity', draft: T): void {
  if (!dealId) return;
  let dealMap = draftStorage.get(dealId);
  if (!dealMap) {
    dealMap = new Map<string, unknown>();
    draftStorage.set(dealId, dealMap);
  }
  dealMap.set(tabId, draft);
}

/**
 * Clear draft for a specific deal and tab (e.g. after successful post)
 */
export function clearDealDraft(dealId: string, tabId: string = 'activity'): void {
  if (!dealId) return;
  const dealMap = draftStorage.get(dealId);
  if (dealMap) {
    dealMap.delete(tabId);
    if (dealMap.size === 0) {
      draftStorage.delete(dealId);
    }
  }
}

/**
 * Clear all drafts for a deal (e.g. when closing the deal panel)
 */
export function clearAllDraftsForDeal(dealId: string): void {
  if (!dealId) return;
  draftStorage.delete(dealId);
}

/**
 * Reset entire store (useful for testing or logout)
 */
export function resetAllDrafts(): void {
  draftStorage.clear();
}

/**
 * React hook to bind draft state with memory preservation across tab unmounting
 */
export function useDealDraft(dealId: string, tabId: string = 'activity') {
  const [draft, setDraftState] = useState<ActivityDraft>(() => {
    return (
      getDealDraft<ActivityDraft>(dealId, tabId) || {
        text: '',
        pendingDueDate: null,
        pendingAttachments: [],
        isManagerCallMode: false,
        replies: {},
      }
    );
  });

  // Re-sync if dealId or tabId changes
  useEffect(() => {
    const existing = getDealDraft<ActivityDraft>(dealId, tabId);
    if (existing) {
      setDraftState(existing);
    } else {
      setDraftState({
        text: '',
        pendingDueDate: null,
        pendingAttachments: [],
        isManagerCallMode: false,
        replies: {},
      });
    }
  }, [dealId, tabId]);

  const updateDraft = useCallback(
    (patch: Partial<ActivityDraft> | ((prev: ActivityDraft) => Partial<ActivityDraft>)) => {
      setDraftState((prev) => {
        const resolvedPatch = typeof patch === 'function' ? patch(prev) : patch;
        const next: ActivityDraft = {
          ...prev,
          ...resolvedPatch,
          lastUpdated: Date.now(),
        };
        setDealDraft(dealId, tabId, next);
        return next;
      });
    },
    [dealId, tabId]
  );

  const clearCurrentDraft = useCallback(() => {
    clearDealDraft(dealId, tabId);
    setDraftState({
      text: '',
      pendingDueDate: null,
      pendingAttachments: [],
      isManagerCallMode: false,
      replies: {},
    });
  }, [dealId, tabId]);

  return {
    draft,
    updateDraft,
    clearCurrentDraft,
  };
}
