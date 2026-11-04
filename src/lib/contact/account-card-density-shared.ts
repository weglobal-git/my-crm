export type AccountCardDensity = "compact" | "standard";

export const DEFAULT_ACCOUNT_CARD_DENSITY: AccountCardDensity = "compact";
export const ACCOUNT_CARD_DENSITY_COOKIE_PREFIX = "crm_contact_card_density_";
export const ACCOUNT_CARD_DENSITY_MAX_AGE = 31536000; // 1 year in seconds

export function getAccountCardDensityStorageKey(userId: string): string {
  return `${ACCOUNT_CARD_DENSITY_COOKIE_PREFIX}${userId || "default"}`;
}

export function parseExplicitAccountCardDensity(
  raw: string | null | undefined
): AccountCardDensity | null {
  if (!raw) return null;
  try {
    const decoded = raw.includes("%") ? decodeURIComponent(raw) : raw;
    const normalized = decoded.trim().replace(/^"|"$/g, "").toLowerCase();
    if (normalized === "standard") return "standard";
    if (normalized === "compact") return "compact";
  } catch {
    const normalized = raw.trim().replace(/^"|"$/g, "").toLowerCase();
    if (normalized === "standard") return "standard";
    if (normalized === "compact") return "compact";
  }
  return null;
}

export function parseAccountCardDensity(
  raw: string | null | undefined
): AccountCardDensity {
  return parseExplicitAccountCardDensity(raw) ?? DEFAULT_ACCOUNT_CARD_DENSITY;
}

