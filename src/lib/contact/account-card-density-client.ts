import {
  DEFAULT_ACCOUNT_CARD_DENSITY,
  ACCOUNT_CARD_DENSITY_COOKIE_PREFIX,
  ACCOUNT_CARD_DENSITY_MAX_AGE,
  getAccountCardDensityStorageKey,
  parseExplicitAccountCardDensity,
  parseAccountCardDensity,
  type AccountCardDensity,
} from "./account-card-density-shared";

export {
  DEFAULT_ACCOUNT_CARD_DENSITY,
  ACCOUNT_CARD_DENSITY_COOKIE_PREFIX,
  ACCOUNT_CARD_DENSITY_MAX_AGE,
  getAccountCardDensityStorageKey,
  parseExplicitAccountCardDensity,
  parseAccountCardDensity,
  type AccountCardDensity,
};

/**
 * Synchronous client helper to read user's contact/account row density preference
 * from localStorage or document.cookie, defaulting to "compact".
 */
export function getStoredAccountCardDensityClient(userId: string): AccountCardDensity {
  if (typeof window === "undefined" || !userId) return DEFAULT_ACCOUNT_CARD_DENSITY;

  const key = getAccountCardDensityStorageKey(userId);

  // 1. Try reading from localStorage (fastest)
  try {
    const rawLocal = localStorage.getItem(key);
    const parsedLocal = parseExplicitAccountCardDensity(rawLocal);
    if (parsedLocal) return parsedLocal;
  } catch {
    // Ignore localStorage access errors
  }

  // 2. Fallback to document.cookie
  try {
    const cookies = document.cookie ? document.cookie.split("; ") : [];
    const prefix = `${key}=`;
    const cookieMatch = cookies.find((row) => row.startsWith(prefix));
    if (cookieMatch) {
      const rawCookie = cookieMatch.substring(prefix.length);
      const parsedCookie = parseExplicitAccountCardDensity(rawCookie);
      if (parsedCookie) return parsedCookie;
    }
  } catch {
    // Ignore cookie access errors
  }

  return DEFAULT_ACCOUNT_CARD_DENSITY;
}

/**
 * Synchronous client helper to persist user's contact/account row density preference
 * in both localStorage and document.cookie (for 0ms SSR hydration).
 */
export function saveStoredAccountCardDensityClient(
  userId: string,
  density: AccountCardDensity
): void {
  if (typeof window === "undefined" || !userId) return;

  const key = getAccountCardDensityStorageKey(userId);
  const sanitized: AccountCardDensity = density === "standard" ? "standard" : "compact";

  try {
    localStorage.setItem(key, sanitized);
  } catch {
    // Ignore localStorage write errors
  }

  try {
    document.cookie = `${key}=${encodeURIComponent(sanitized)}; path=/; max-age=${ACCOUNT_CARD_DENSITY_MAX_AGE}; SameSite=Lax`;
  } catch {
    // Ignore cookie write errors
  }
}

