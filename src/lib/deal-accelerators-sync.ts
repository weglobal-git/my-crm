export interface PendingAcceleratorBadgeInfo {
  count: number;
  earliestPendingAt: string | null;
}

export type PendingAcceleratorsMap = Record<string, PendingAcceleratorBadgeInfo>;

/**
 * Returns true if the SWR cache key corresponds to pending accelerators.
 * Matches both string 'pending-accelerators' and array tuples ['pending-accelerators', ...].
 */
export function isPendingAcceleratorsKey(key: unknown): boolean {
  return key === 'pending-accelerators' || (Array.isArray(key) && key[0] === 'pending-accelerators');
}

/**
 * Optimistically decrements the pending badge count for a deal.
 * If the resulting count is 0 or less, the deal key is deleted from the map to clean up memory and instantly hide the badge.
 */
export function decrementPendingBadge(
  prevMap: PendingAcceleratorsMap | undefined,
  dealId: string
): PendingAcceleratorsMap {
  if (!prevMap) return {};
  const current = prevMap[dealId];
  const currentCount = typeof current === 'number' ? (current as unknown as number) : (current?.count || 0);
  const nextCount = Math.max(0, currentCount - 1);
  if (nextCount === 0) {
    if (!(dealId in prevMap)) return prevMap;
    const next = { ...prevMap };
    delete next[dealId];
    return next;
  }
  return {
    ...prevMap,
    [dealId]: {
      count: nextCount,
      earliestPendingAt: current?.earliestPendingAt || null,
    },
  };
}

/**
 * Optimistically increments the pending badge count for a deal (e.g. when a Manager Call is posted).
 */
export function incrementPendingBadge(
  prevMap: PendingAcceleratorsMap | undefined,
  dealId: string,
  timestamp?: string
): PendingAcceleratorsMap {
  const current = prevMap?.[dealId];
  const currentCount = typeof current === 'number' ? (current as unknown as number) : (current?.count || 0);
  const nextCount = currentCount + 1;
  return {
    ...(prevMap || {}),
    [dealId]: {
      count: nextCount,
      earliestPendingAt: current?.earliestPendingAt || timestamp || new Date().toISOString(),
    },
  };
}

/**
 * Sets or updates the pending badge count for a deal (e.g. from Pusher DEAL_ACCELERATORS_UPDATED or AI generation).
 * Deletes key if nextCount is 0.
 */
export function setPendingBadgeCount(
  prevMap: PendingAcceleratorsMap | undefined,
  dealId: string,
  count: number,
  timestamp?: string
): PendingAcceleratorsMap {
  if (!prevMap) {
    if (count <= 0) return {};
    return { [dealId]: { count, earliestPendingAt: timestamp || new Date().toISOString() } };
  }
  if (count <= 0) {
    if (!(dealId in prevMap)) return prevMap;
    const next = { ...prevMap };
    delete next[dealId];
    return next;
  }
  const current = prevMap[dealId];
  return {
    ...prevMap,
    [dealId]: {
      count,
      earliestPendingAt: current?.earliestPendingAt || timestamp || new Date().toISOString(),
    },
  };
}

/**
 * Merges newly fetched pending accelerator entries into the existing map without wiping existing entries.
 */
export function mergePendingAccelerators(
  prevMap: PendingAcceleratorsMap | undefined,
  incomingMap: Record<string, { count: number; earliestPendingAt?: string | null } | number>
): PendingAcceleratorsMap {
  const result: PendingAcceleratorsMap = { ...(prevMap || {}) };
  for (const [dealId, val] of Object.entries(incomingMap)) {
    if (typeof val === 'number') {
      if (val <= 0) {
        delete result[dealId];
      } else {
        result[dealId] = {
          count: val,
          earliestPendingAt: result[dealId]?.earliestPendingAt || null,
        };
      }
    } else if (val && typeof val === 'object') {
      if (val.count <= 0) {
        delete result[dealId];
      } else {
        result[dealId] = {
          count: val.count,
          earliestPendingAt: val.earliestPendingAt || result[dealId]?.earliestPendingAt || null,
        };
      }
    }
  }
  return result;
}
