import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateYoY,
  calculateSharePercent,
  parseDashboardPeriod,
  buildSalesOverviewSnapshot,
  type SalesOverviewDeal,
  type SaleTargetInput,
} from './sales-overview';

test('dashboard calculations maintain exact mathematical parity across edge cases', () => {
  // 1. YoY calculations
  assert.deepEqual(calculateYoY(150, 100), { type: 'percent', deltaPercent: 50 });
  assert.deepEqual(calculateYoY(80, 100), { type: 'percent', deltaPercent: -20 });
  assert.deepEqual(calculateYoY(100, 0, false), { type: 'new' });
  assert.equal(calculateYoY(100, 0, true), null);
  assert.equal(calculateYoY(0, 0), null);

  // 2. Share percent calculations
  assert.equal(calculateSharePercent(25, 100), 25);
  assert.equal(calculateSharePercent(0, 100), 0);
  assert.equal(calculateSharePercent(50, 0), null);

  // 3. Bangkok period boundary parsing
  const p = parseDashboardPeriod('9', '2026', new Date('2026-09-15T00:00:00.000Z'));
  assert.equal(p.month, 9);
  assert.equal(p.year, 2026);
  assert.equal(p.annualYears.length, 5);
  assert.deepEqual(p.annualYears, [2026, 2025, 2024, 2023, 2022]);
});

test('buildSalesOverviewSnapshot maintains consistent data structure without data loss', () => {
  const period = parseDashboardPeriod('9', '2026', new Date('2026-09-15T00:00:00.000Z'));
  const testDeals: SalesOverviewDeal[] = [
    {
      id: 'd1',
      topic: 'Deal 1',
      status: 'WON',
      value: 100000,
      currency: 'THB',
      goodsLoadingDate: '2026-09-10T00:00:00.000Z',
      companyId: 'c1',
      company: {
        name: 'Company 1',
        displayName: 'Company One',
        country: 'TH',
      },
    },
    {
      id: 'd2',
      topic: 'Deal 2',
      status: 'OPEN',
      value: 50000,
      currency: 'USD',
      goodsLoadingDate: '2026-09-12T00:00:00.000Z',
      companyId: 'c2',
      company: {
        name: 'Company 2',
        displayName: null,
        country: 'US',
      },
    },
  ];

  const targets: SaleTargetInput[] = [
    {
      companyId: 'c1',
      accountName: 'Company One',
      year: 2026,
      amount: '200000',
      currency: 'THB',
    },
  ];

  const snapshot = buildSalesOverviewSnapshot({
    deals: testDeals,
    allTimeDeals: testDeals,
    targets,
    period,
    scopeLabel: 'All accessible deals',
  });

  // Verify monthly parity
  assert.equal(snapshot.monthly.won.count, 1);
  assert.equal(snapshot.monthly.won.totals[0].amount, 100000);
  assert.equal(snapshot.monthly.won.totals[0].currency, 'THB');
  assert.equal(snapshot.monthly.waiting.count, 1);
  assert.equal(snapshot.monthly.waiting.totals[0].amount, 50000);
  assert.equal(snapshot.monthly.waiting.totals[0].currency, 'USD');

  // Verify tracking parity
  assert.equal(snapshot.tracking.length, 1);
  assert.equal(snapshot.tracking[0].actual, 100000);
  assert.equal(snapshot.tracking[0].target, 200000);
  assert.equal(snapshot.tracking[0].percentage, 50);

  // Verify annual parity
  assert.equal(snapshot.annual.accounts.length, 1);
  assert.equal(snapshot.annual.accounts[0].accountName, 'Company One');
  assert.equal(snapshot.annual.accounts[0].countryCode, 'TH');

  // Verify world map parity
  assert.equal(snapshot.worldMap.allTime.countries.length, 2);
  const th = snapshot.worldMap.allTime.countries.find((c) => c.countryCode === 'TH');
  assert.ok(th);
  assert.equal(th.dealCount, 1);
  assert.equal(th.totalAmount, 100000);
});
