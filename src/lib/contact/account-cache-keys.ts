import { ContactStatus, ContactType } from "@prisma/client";

export interface AccountListFilters {
  status: ContactStatus | "ALL";
  type: ContactType | "ALL";
  country: string;
  search: string;
}

/**
 * Generates an actor-scoped, deterministic SWR cache key for an Account cards page.
 * Scoping by actorId prevents permission leakage across sessions/users.
 */
export function getAccountListKey(
  actorId: string,
  filters: AccountListFilters,
  page: number
) {
  return [
    "account-cards-list",
    actorId,
    filters.status,
    filters.type,
    filters.country || "ALL",
    filters.search || "",
    page,
  ] as const;
}

/**
 * Filter key for page 1 / initial stats synchronization
 */
export function getAccountFilterKey(
  actorId: string,
  filters: AccountListFilters
) {
  return [
    "account-cards-filter",
    actorId,
    filters.status,
    filters.type,
    filters.country || "ALL",
    filters.search || "",
  ] as const;
}

/**
 * Canonical SWR key for full account overview detail
 */
export function getAccountOverviewKey(companyId: string | null) {
  if (!companyId) return null;
  return ["account-overview", companyId] as const;
}
