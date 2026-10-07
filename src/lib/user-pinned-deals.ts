"use server";

import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PINNED_DEALS_MAX_AGE, getPinnedDealsStorageKey, parsePinnedDealIds } from "./user-pinned-deals-shared";

export { getPinnedDealsStorageKey, parsePinnedDealIds };

/**
 * Server-side helper to read user's pinned deal IDs from cookies.
 */
export async function getStoredPinnedDealIdsServer(userId: string): Promise<Set<string>> {
  if (!userId) return new Set();
  try {
    const cookieStore = await cookies();
    const cookieKey = getPinnedDealsStorageKey(userId);
    const raw = cookieStore.get(cookieKey)?.value;
    return new Set(parsePinnedDealIds(raw));
  } catch {
    return new Set();
  }
}

/**
 * Server Action to persist user's pinned deal IDs in cookie for SSR hydration.
 */
export async function saveUserPinnedDealsAction(dealIds: string[]): Promise<{ success: boolean }> {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return { success: false };

    const sanitized = Array.from(new Set(dealIds.filter(id => typeof id === "string" && id.trim().length > 0)));
    const cookieStore = await cookies();
    const cookieKey = getPinnedDealsStorageKey(userId);

    cookieStore.set(cookieKey, encodeURIComponent(JSON.stringify(sanitized)), {
      maxAge: PINNED_DEALS_MAX_AGE,
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });

    return { success: true };
  } catch {
    return { success: false };
  }
}
