import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatLtcDealTopic,
  determineLtcTier,
  calculateDaysSinceContact,
  calculateDailyLtcForMonth,
  DailyLtcCompanyDTO,
} from '../ltc-utils';

test('formatLtcDealTopic formats correctly as LTC-DDMMYY in Bangkok timezone', () => {
  // Test 6 October 2026
  const date1 = new Date('2026-10-06T10:00:00+07:00');
  assert.equal(formatLtcDealTopic(date1), 'LTC-061026');

  // Test 1 January 2027
  const date2 = new Date('2027-01-01T08:30:00+07:00');
  assert.equal(formatLtcDealTopic(date2), 'LTC-010127');

  // Test 25 December 2025
  const date3 = new Date('2025-12-25T15:00:00+07:00');
  assert.equal(formatLtcDealTopic(date3), 'LTC-251225');
});

test('determineLtcTier correctly evaluates VIP, Regular, and Occasional tiers', () => {
  // Tier 1: Total Won >= 500k
  const tier1ByAmount = determineLtcTier(600_000, 1);
  assert.equal(tier1ByAmount.tier, 'TIER_1');
  assert.equal(tier1ByAmount.thresholdDays, 30);

  // Tier 1: Purchase Count >= 3 even with low amount
  const tier1ByCount = determineLtcTier(50_000, 3);
  assert.equal(tier1ByCount.tier, 'TIER_1');
  assert.equal(tier1ByCount.thresholdDays, 30);

  // Tier 2: 100k - 500k
  const tier2ByAmount = determineLtcTier(250_000, 0);
  assert.equal(tier2ByAmount.tier, 'TIER_2');
  assert.equal(tier2ByAmount.thresholdDays, 60);

  // Tier 2: 1-2 purchases
  const tier2ByCount = determineLtcTier(40_000, 2);
  assert.equal(tier2ByCount.tier, 'TIER_2');
  assert.equal(tier2ByCount.thresholdDays, 60);

  // Tier 3: Occasional / New Qualified
  const tier3Low = determineLtcTier(30_000, 0);
  assert.equal(tier3Low.tier, 'TIER_3');
  assert.equal(tier3Low.thresholdDays, 90);
});

test('calculateDaysSinceContact uses calendar day boundaries without off-hours surprises', () => {
  // Scenario: Contact was on Sept 6, 2026 at 20:30 (evening)
  const contactEvening = new Date('2026-09-06T20:30:00+07:00');

  // 1. Same calendar day returns 0
  const sameDay = new Date('2026-09-06T23:55:00+07:00');
  assert.equal(calculateDaysSinceContact(contactEvening, sameDay), 0);

  // 2. Next calendar day returns 1
  const nextDay = new Date('2026-09-07T08:00:00+07:00');
  assert.equal(calculateDaysSinceContact(contactEvening, nextDay), 1);

  // 3. Exactly 30 calendar days later (Oct 6, 2026):
  // At 17:00 (end of workday)
  const oct6At17 = new Date('2026-10-06T17:00:00+07:00');
  assert.equal(calculateDaysSinceContact(contactEvening, oct6At17), 30);

  // At 21:00 (after working hours): stays 30, does not flip unexpectedly
  const oct6At21 = new Date('2026-10-06T21:00:00+07:00');
  assert.equal(calculateDaysSinceContact(contactEvening, oct6At21), 30);

  // Scenario 2: Contact was on Sept 7, 2026 at 20:30 (29 calendar days before Oct 6)
  const contactSept7 = new Date('2026-09-07T20:30:00+07:00');
  // At 17:00 on Oct 6: 29 days
  assert.equal(calculateDaysSinceContact(contactSept7, oct6At17), 29);
  // At 21:00 on Oct 6: STILL 29 days (does NOT flip to 30 in the evening!)
  assert.equal(calculateDaysSinceContact(contactSept7, oct6At21), 29);
});

test('calculateDailyLtcForMonth awards 1 XP per day when 0 LTC, with auto-pause on holidays and 20 XP cap', () => {
  // October 2026
  const month = 10;
  const year = 2026;
  const companyHolidays = new Set<string>(['2026-10-14']); // 1 holiday
  const asOfDate = new Date('2026-10-31T23:59:59+07:00'); // Full month

  // Case A: No LTC accounts (all clean)
  const emptyCompanies: DailyLtcCompanyDTO[] = [];
  const cleanSummary = calculateDailyLtcForMonth({
    companies: emptyCompanies,
    month,
    year,
    companyHolidays,
    asOfDate,
  });

  // Working days in Oct 2026 (31 days - 4 Sundays - 1 holiday = 26 working days)
  assert.equal(cleanSummary.totalWorkingDays, 26);
  assert.equal(cleanSummary.cleanLtcDaysCount, 26);
  // Capped at 20 XP
  assert.equal(cleanSummary.teamLtcXp, 20);

  // Case B: Company has an open opportunity in pipeline -> Excluded from LTC (team keeps clean score)
  const companyWithOpenDeal: DailyLtcCompanyDTO[] = [
    {
      id: 'comp-1',
      createdAt: new Date('2025-01-01T00:00:00+07:00'),
      opportunities: [
        {
          id: 'deal-open-1',
          value: 100_000,
          status: 'OPEN',
          closedAt: null,
          goodsLoadingDate: null,
          createdAt: new Date('2026-10-01T10:00:00+07:00'),
        },
      ],
    },
  ];
  const summaryWithOpenDeal = calculateDailyLtcForMonth({
    companies: companyWithOpenDeal,
    month,
    year,
    companyHolidays,
    asOfDate,
  });
  assert.equal(summaryWithOpenDeal.cleanLtcDaysCount, 26);
  assert.equal(summaryWithOpenDeal.teamLtcXp, 20);

  // Case C: 1 company meets LTC threshold starting on Oct 10 and was NOT contacted
  // VIP Customer: 600,000 won -> Tier 1 (30 days threshold)
  // Last contacted: Sept 10, 2026.
  // Oct 1 to Oct 9: < 30 days -> Clean (+9 clean days)
  // Oct 10 to Oct 31: >= 30 days -> Dirty (0 XP for those days)
  const staleCompany: DailyLtcCompanyDTO[] = [
    {
      id: 'comp-stale',
      createdAt: new Date('2025-01-01T00:00:00+07:00'),
      opportunities: [
        {
          id: 'deal-won-1',
          value: 600_000,
          status: 'WON',
          closedAt: new Date('2026-09-10T10:00:00+07:00'),
          goodsLoadingDate: null,
          createdAt: new Date('2026-09-01T10:00:00+07:00'),
        },
      ],
    },
  ];
  const summaryWithStale = calculateDailyLtcForMonth({
    companies: staleCompany,
    month,
    year,
    companyHolidays,
    asOfDate,
  });

  // Working days before Oct 10 (Oct 1 to 9): Oct 4 was Sunday, so 8 working days clean
  assert.equal(summaryWithStale.cleanLtcDaysCount, 8);
  assert.equal(summaryWithStale.teamLtcXp, 8);
});
