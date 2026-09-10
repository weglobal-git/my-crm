/**
 * Deal Topic Sync & Concurrency Logic (Pillar 3 Ordering & Rollback)
 */

export interface TopicContainer {
  id: string;
  topic?: string | null;
}

/**
 * Optimistically patch a deal's topic in a collection.
 * Pure, immutable function.
 */
export function applyOptimisticTopicPatch<T extends TopicContainer>(
  deals: T[] | undefined,
  dealId: string,
  newTopic: string
): T[] | undefined {
  if (!deals) return deals;
  return deals.map((d) => (d.id === dealId ? { ...d, topic: newTopic } : d));
}

/**
 * Granular rollback of a deal's topic in a collection.
 * Pure, immutable function.
 */
export function rollbackTopicPatch<T extends TopicContainer>(
  deals: T[] | undefined,
  dealId: string,
  previousTopic: string
): T[] | undefined {
  if (!deals) return deals;
  return deals.map((d) => (d.id === dealId ? { ...d, topic: previousTopic } : d));
}

/**
 * Determines whether an incoming server revision should be accepted or rejected
 * based on the last known revision for a deal.
 * 
 * Rules:
 * - If incomingRev is 0 or NaN, accept only if lastKnownRev is 0.
 * - If incomingRev >= lastKnownRev, accept.
 * - If incomingRev < lastKnownRev, reject as stale/out-of-order network straggler.
 */
export function shouldAcceptRevision(
  lastKnownRev: number | undefined | null,
  incomingRev: number | undefined | null
): boolean {
  const last = typeof lastKnownRev === 'number' && !isNaN(lastKnownRev) ? lastKnownRev : 0;
  const incoming = typeof incomingRev === 'number' && !isNaN(incomingRev) ? incomingRev : 0;

  if (incoming === 0) {
    return last === 0;
  }
  return incoming >= last;
}

/**
 * Normalizes a revision value from either a numeric revision timestamp,
 * an ISO date string, or a Date object.
 */
export function normalizeRevision(
  revision: number | string | Date | undefined | null
): number {
  if (!revision) return 0;
  if (typeof revision === 'number') {
    return isNaN(revision) ? 0 : revision;
  }
  const parsed = new Date(revision).getTime();
  return isNaN(parsed) ? 0 : parsed;
}
