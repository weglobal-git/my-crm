import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isDashboardInvalidationEvent,
  isDashboardEventRelevant,
  decideDashboardEvent,
  type DashboardInvalidationEvent,
} from './dashboard-realtime';

test('isDashboardInvalidationEvent validates valid schema and rejects malformed', () => {
  const valid: DashboardInvalidationEvent = {
    schemaVersion: 1,
    eventId: 'evt-123',
    occurredAt: new Date().toISOString(),
    resources: ['summary', 'tracking'],
    affectedYears: [2026],
    countryCodes: ['TH'],
  };

  assert.equal(isDashboardInvalidationEvent(valid), true);
  assert.equal(isDashboardInvalidationEvent(null), false);
  assert.equal(isDashboardInvalidationEvent({}), false);
  assert.equal(isDashboardInvalidationEvent({ ...valid, schemaVersion: 2 }), false);
  assert.equal(isDashboardInvalidationEvent({ ...valid, resources: ['invalid-res'] }), false);
});

test('isDashboardEventRelevant accurately filters by year and country/company', () => {
  const event: DashboardInvalidationEvent = {
    schemaVersion: 1,
    eventId: 'evt-1',
    occurredAt: new Date().toISOString(),
    resources: ['summary'],
    affectedYears: [2026],
    countryCodes: ['TH'],
    companyIds: ['comp-1'],
  };

  // Same year and matching country
  assert.equal(isDashboardEventRelevant(event, { year: 2026, country: 'TH' }), true);
  // Same year with ALL countries (no country filter selected)
  assert.equal(isDashboardEventRelevant(event, { year: 2026, country: null }), true);
  // Different year and not annual
  assert.equal(isDashboardEventRelevant(event, { year: 2024, country: 'TH' }), false);
  // Different country filter selected
  assert.equal(isDashboardEventRelevant(event, { year: 2026, country: 'US' }), false);
});

test('decideDashboardEvent deduplicates eventId and acting user mutation echo', () => {
  const seenEventIds = new Set<string>();
  const ownMutationIds = new Set<string>(['mut-456']);

  const ownEvent: DashboardInvalidationEvent = {
    schemaVersion: 1,
    eventId: 'evt-own',
    mutationId: 'mut-456',
    occurredAt: new Date().toISOString(),
    resources: ['summary'],
  };

  // Own mutation should be ignored to prevent double-fetching
  assert.equal(decideDashboardEvent(ownEvent, seenEventIds, ownMutationIds), 'IGNORE');
  assert.equal(ownMutationIds.has('mut-456'), false, 'mutationId should be cleaned up');

  // External event should revalidate
  const externalEvent: DashboardInvalidationEvent = {
    schemaVersion: 1,
    eventId: 'evt-ext',
    occurredAt: new Date().toISOString(),
    resources: ['summary'],
  };
  assert.equal(decideDashboardEvent(externalEvent, seenEventIds, ownMutationIds), 'REVALIDATE');

  // Duplicate eventId should be ignored
  assert.equal(decideDashboardEvent(externalEvent, seenEventIds, ownMutationIds), 'IGNORE');
});
