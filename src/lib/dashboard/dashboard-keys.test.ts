import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dashboardSummaryKey,
  dashboardTrackingKey,
  dashboardAnnualKey,
  dashboardMapSummaryKey,
  dashboardFilterOptionsKey,
  dashboardLeaderboardKey,
  createScopeToken,
} from './dashboard-keys';

test('createScopeToken isolates by role, departments, and user id', () => {
  const adminScope = createScopeToken({ id: 'u1', role: 'ADMIN', departments: [] });
  const salesScope1 = createScopeToken({ id: 'u2', role: 'GENERAL', departments: ['Sales'] });
  const salesScope2 = createScopeToken({ id: 'u3', role: 'GENERAL', departments: ['Sales'] });
  const mktScope = createScopeToken({ id: 'u2', role: 'GENERAL', departments: ['Marketing'] });

  assert.equal(adminScope, 'ADMIN::u1');
  assert.equal(salesScope1, 'GENERAL:Sales:u2');
  assert.notEqual(salesScope1, salesScope2);
  assert.notEqual(salesScope1, mktScope);
});

test('dashboard keys are deterministic and include scope and normalized params', () => {
  const scope = 'ADMIN::u1';

  const key1 = dashboardSummaryKey(scope, { month: 9, year: 2026, country: 'TH', account: 'Acme' });
  const key2 = dashboardSummaryKey(scope, { month: 9, year: 2026, country: 'th', account: 'Acme' });
  const key3 = dashboardSummaryKey(scope, { month: 8, year: 2026, country: 'TH', account: 'Acme' });

  // Normalization: country uppercase
  assert.equal(key1, key2);
  assert.notEqual(key1, key3);

  // Different scope cannot match
  const keyOtherScope = dashboardSummaryKey('ADMIN::u2', { month: 9, year: 2026, country: 'TH', account: 'Acme' });
  assert.notEqual(key1, keyOtherScope);

  // Filter options key is independent of month and year
  const foKey = dashboardFilterOptionsKey(scope);
  assert.equal(foKey, 'dashboard:filter-options:ADMIN::u1');
});
