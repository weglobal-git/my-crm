/**
 * Pure realtime invalidation types, schemas, and event filters for Dashboard Overview.
 * Adheres strictly to the lightweight envelope contract (< 5 KB UTF-8).
 */

export const DASHBOARD_CHANNEL_EVENT = 'dashboard-invalidated';

export const VALID_DASHBOARD_RESOURCES = [
  'filter-options',
  'summary',
  'tracking',
  'annual',
  'map-summary',
  'map-accounts',
  'map-deals',
  'leaderboard',
] as const;

export type DashboardResource = (typeof VALID_DASHBOARD_RESOURCES)[number];

export interface DashboardInvalidationEvent {
  schemaVersion: 1;
  eventId: string;
  mutationId?: string;
  revision?: number;
  occurredAt: string;
  resources: DashboardResource[];
  affectedYears?: number[];
  countryCodes?: string[];
  companyIds?: string[];
}

export function isDashboardInvalidationEvent(value: unknown): value is DashboardInvalidationEvent {
  if (!value || typeof value !== 'object') return false;
  const ev = value as Partial<DashboardInvalidationEvent>;
  if (ev.schemaVersion !== 1) return false;
  if (typeof ev.eventId !== 'string' || !ev.eventId) return false;
  if (typeof ev.occurredAt !== 'string') return false;
  if (!Array.isArray(ev.resources) || ev.resources.length === 0) return false;
  for (const r of ev.resources) {
    if (!VALID_DASHBOARD_RESOURCES.includes(r as DashboardResource)) return false;
  }
  return true;
}

export interface ActiveDashboardFilters {
  year: number;
  month?: number;
  country?: string | null;
  account?: string | null;
}

export function isDashboardEventRelevant(
  event: DashboardInvalidationEvent,
  filters: ActiveDashboardFilters
): boolean {
  // If annual resource is in the event, it affects the 5-year window
  const hasAnnual = event.resources.includes('annual');
  if (event.affectedYears && event.affectedYears.length > 0) {
    const minAnnualYear = filters.year - 4;
    const maxAnnualYear = filters.year;
    const matchesYear = event.affectedYears.some((y) => {
      if (y === filters.year) return true;
      if (hasAnnual && y >= minAnnualYear && y <= maxAnnualYear) return true;
      return false;
    });
    if (!matchesYear) return false;
  }

  // Check country relevance if active filter has a specific country
  if (filters.country && event.countryCodes && event.countryCodes.length > 0) {
    const normCountry = filters.country.trim().toUpperCase();
    const hasCountry = event.countryCodes.some((c) => c.trim().toUpperCase() === normCountry);
    if (!hasCountry) return false;
  }

  // Check company relevance if active filter has a specific account
  if (filters.account && event.companyIds && event.companyIds.length > 0) {
    const normAccount = filters.account.trim().toLowerCase();
    const hasCompany = event.companyIds.some(
      (id) => id.trim().toLowerCase() === normAccount
    );
    if (!hasCompany) return false;
  }

  return true;
}

export type DashboardEventDecision = 'IGNORE' | 'REVALIDATE';

export function decideDashboardEvent(
  event: DashboardInvalidationEvent,
  seenEventIds: Set<string>,
  ownMutationIds: Set<string>
): DashboardEventDecision {
  if (seenEventIds.has(event.eventId)) return 'IGNORE';
  seenEventIds.add(event.eventId);
  if (seenEventIds.size > 500) {
    const oldest = seenEventIds.values().next().value;
    if (oldest) seenEventIds.delete(oldest);
  }

  // Reconcile acting-user echo: if we triggered this mutation, ignore the push to prevent double-fetch
  if (event.mutationId && ownMutationIds.delete(event.mutationId)) {
    return 'IGNORE';
  }

  return 'REVALIDATE';
}
