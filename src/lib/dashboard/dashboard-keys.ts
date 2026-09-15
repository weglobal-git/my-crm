/**
 * Pure cache key factories for Dashboard resources.
 * Ensures strict scope isolation across actors, roles, and departments.
 */

export interface ScopeActorInfo {
  id: string;
  role: string;
  departments?: string[];
}

export function createScopeToken(actor: ScopeActorInfo): string {
  const role = actor.role || 'USER';
  const depts = (actor.departments || []).slice().sort().join(',');
  return `${role}:${depts}:${actor.id}`;
}

export interface SummaryKeyParams {
  month: number;
  year: number;
  country?: string | null;
  account?: string | null;
}

export function dashboardSummaryKey(scope: string, params: SummaryKeyParams): string {
  const country = params.country?.trim().toUpperCase() || 'ALL';
  const account = params.account?.trim() || 'ALL';
  return `dashboard:summary:${scope}:${params.year}:${params.month}:${country}:${account}`;
}

export interface TrackingKeyParams {
  year: number;
  country?: string | null;
  account?: string | null;
}

export function dashboardTrackingKey(scope: string, params: TrackingKeyParams): string {
  const country = params.country?.trim().toUpperCase() || 'ALL';
  const account = params.account?.trim() || 'ALL';
  return `dashboard:tracking:${scope}:${params.year}:${country}:${account}`;
}

export interface AnnualKeyParams {
  anchorYear: number;
  country?: string | null;
  account?: string | null;
}

export function dashboardAnnualKey(scope: string, params: AnnualKeyParams): string {
  const country = params.country?.trim().toUpperCase() || 'ALL';
  const account = params.account?.trim() || 'ALL';
  return `dashboard:annual:${scope}:${params.anchorYear}:${country}:${account}`;
}

export interface MapSummaryKeyParams {
  year: number;
  month?: number;
}

export function dashboardMapSummaryKey(scope: string, params: MapSummaryKeyParams): string {
  const month = params.month ?? 'ALL';
  return `dashboard:map-summary:${scope}:${params.year}:${month}`;
}

export function dashboardFilterOptionsKey(scope: string): string {
  return `dashboard:filter-options:${scope}`;
}

export function dashboardLeaderboardKey(scope: string, params: { year: number }): string {
  return `dashboard:leaderboard:${scope}:${params.year}`;
}
