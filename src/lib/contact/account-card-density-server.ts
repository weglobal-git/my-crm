import "server-only";
import { cookies } from "next/headers";
import {
  DEFAULT_ACCOUNT_CARD_DENSITY,
  getAccountCardDensityStorageKey,
  parseAccountCardDensity,
  type AccountCardDensity,
} from "./account-card-density-shared";

/**
 * Server-side helper to read user's contact/account row density preference from cookies.
 * Defaults to "compact" when unset.
 */
export async function getStoredAccountCardDensityServer(
  userId: string
): Promise<AccountCardDensity> {
  if (!userId) return DEFAULT_ACCOUNT_CARD_DENSITY;
  try {
    const cookieStore = await cookies();
    const cookieKey = getAccountCardDensityStorageKey(userId);
    const raw = cookieStore.get(cookieKey)?.value;
    return parseAccountCardDensity(raw);
  } catch {
    return DEFAULT_ACCOUNT_CARD_DENSITY;
  }
}

