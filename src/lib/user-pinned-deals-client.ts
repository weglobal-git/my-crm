import { PINNED_DEALS_COOKIE_PREFIX, PINNED_DEALS_MAX_AGE, getPinnedDealsStorageKey, parsePinnedDealIds } from "./user-pinned-deals-shared";

export { PINNED_DEALS_COOKIE_PREFIX, PINNED_DEALS_MAX_AGE, getPinnedDealsStorageKey, parsePinnedDealIds };

/**
 * Synchronous client helper to read user's pinned deal IDs from localStorage or document.cookie.
 */
export function getStoredPinnedDealIdsClient(userId: string): Set<string> {
  if (typeof window === "undefined" || !userId) return new Set();

  const key = getPinnedDealsStorageKey(userId);

  // 1. Try reading from localStorage (fastest)
  try {
    const rawLocal = localStorage.getItem(key);
    if (rawLocal) {
      const ids = parsePinnedDealIds(rawLocal);
      if (ids.length > 0) return new Set(ids);
    }
  } catch {
    // Ignore localStorage access errors
  }

  // 2. Fallback to document.cookie
  try {
    const cookies = document.cookie ? document.cookie.split("; ") : [];
    const prefix = `${key}=`;
    const cookieMatch = cookies.find(row => row.startsWith(prefix));
    if (cookieMatch) {
      const rawCookie = cookieMatch.substring(prefix.length);
      const ids = parsePinnedDealIds(rawCookie);
      if (ids.length > 0) return new Set(ids);
    }
  } catch {
    // Ignore cookie access errors
  }

  return new Set();
}

/**
 * Synchronous client helper to save user's pinned deal IDs to localStorage and document.cookie.
 */
export function saveStoredPinnedDealIdsClient(userId: string, dealIds: string[]): void {
  if (typeof window === "undefined" || !userId) return;

  const key = getPinnedDealsStorageKey(userId);
  const sanitized = Array.from(new Set(dealIds.filter(id => typeof id === "string" && id.trim().length > 0)));
  const json = JSON.stringify(sanitized);

  // 1. Write to localStorage
  try {
    localStorage.setItem(key, json);
  } catch {
    // Ignore localStorage write errors
  }

  // 2. Write to document.cookie (accessible to SSR for instant initial render)
  try {
    document.cookie = `${key}=${encodeURIComponent(json)}; path=/; max-age=${PINNED_DEALS_MAX_AGE}; SameSite=Lax`;
  } catch {
    // Ignore cookie write errors
  }
}
