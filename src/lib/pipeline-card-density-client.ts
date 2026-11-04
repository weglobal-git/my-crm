import {
  DEFAULT_PIPELINE_CARD_DENSITY,
  PIPELINE_CARD_DENSITY_COOKIE_PREFIX,
  PIPELINE_CARD_DENSITY_MAX_AGE,
  getPipelineCardDensityStorageKey,
  parseExplicitPipelineCardDensity,
  parsePipelineCardDensity,
  type PipelineCardDensity,
} from "./pipeline-card-density-shared";

export {
  DEFAULT_PIPELINE_CARD_DENSITY,
  PIPELINE_CARD_DENSITY_COOKIE_PREFIX,
  PIPELINE_CARD_DENSITY_MAX_AGE,
  getPipelineCardDensityStorageKey,
  parseExplicitPipelineCardDensity,
  parsePipelineCardDensity,
  type PipelineCardDensity,
};

/**
 * Synchronous client helper to read user's pipeline card density preference
 * from localStorage or document.cookie, defaulting to "compact".
 */
export function getStoredPipelineCardDensityClient(userId: string): PipelineCardDensity {
  if (typeof window === "undefined" || !userId) return DEFAULT_PIPELINE_CARD_DENSITY;

  const key = getPipelineCardDensityStorageKey(userId);

  // 1. Try reading from localStorage (fastest)
  try {
    const rawLocal = localStorage.getItem(key);
    const parsedLocal = parseExplicitPipelineCardDensity(rawLocal);
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
      const parsedCookie = parseExplicitPipelineCardDensity(rawCookie);
      if (parsedCookie) return parsedCookie;
    }
  } catch {
    // Ignore cookie access errors
  }

  return DEFAULT_PIPELINE_CARD_DENSITY;
}

/**
 * Synchronous client helper to persist user's pipeline card density preference
 * in both localStorage and document.cookie (for 0ms SSR hydration).
 */
export function saveStoredPipelineCardDensityClient(
  userId: string,
  density: PipelineCardDensity
): void {
  if (typeof window === "undefined" || !userId) return;

  const key = getPipelineCardDensityStorageKey(userId);
  const sanitized: PipelineCardDensity = density === "standard" ? "standard" : "compact";

  try {
    localStorage.setItem(key, sanitized);
  } catch {
    // Ignore localStorage write errors
  }

  try {
    document.cookie = `${key}=${encodeURIComponent(sanitized)}; path=/; max-age=${PIPELINE_CARD_DENSITY_MAX_AGE}; SameSite=Lax`;
  } catch {
    // Ignore cookie write errors
  }
}

