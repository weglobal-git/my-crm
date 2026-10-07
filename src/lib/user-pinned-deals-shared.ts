export const PINNED_DEALS_COOKIE_PREFIX = "crm_pinned_deals_";
export const PINNED_DEALS_MAX_AGE = 31536000; // 1 year in seconds

export function getPinnedDealsStorageKey(userId: string): string {
  return `${PINNED_DEALS_COOKIE_PREFIX}${userId || "default"}`;
}

export function parsePinnedDealIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const decoded = raw.includes("%") ? decodeURIComponent(raw) : raw;
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
  } catch {
    // If parsing fails, try direct JSON.parse in case it wasn't URI encoded
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
      }
    } catch {
      // Ignore
    }
  }
  return [];
}
