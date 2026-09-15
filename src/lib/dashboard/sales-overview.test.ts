import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSalesOverviewSnapshot,
  buildWorldMapReport,
  calculateSharePercent,
  calculateYoY,
  parseDashboardPeriod,
  resolveCountryFromDeal,
  type SalesOverviewDeal,
} from "./sales-overview";

const company = { name: "Alpha Legal", displayName: "Alpha" };
const deal = (input: Partial<SalesOverviewDeal> & Pick<SalesOverviewDeal, "id" | "status" | "goodsLoadingDate" | "value">): SalesOverviewDeal => ({
  topic: input.id,
  currency: "THB",
  companyId: "company-1",
  company,
  ...input,
});

test("parseDashboardPeriod uses Bangkok boundaries and rejects future years", () => {
  const now = new Date("2026-09-14T03:00:00.000Z");
  const period = parseDashboardPeriod("9", "2026", now);
  assert.equal(period.monthStart.toISOString(), "2026-08-31T17:00:00.000Z");
  assert.equal(period.nextMonthStart.toISOString(), "2026-09-30T17:00:00.000Z");
  assert.deepEqual(period.annualYears, [2026, 2025, 2024, 2023, 2022]);
  assert.equal(parseDashboardPeriod("13", "2027", now).year, 2026);
});

test("parseDashboardPeriod handles December boundary correctly", () => {
  const now = new Date("2026-12-15T03:00:00.000Z");
  const period = parseDashboardPeriod("12", "2026", now);
  assert.equal(period.monthStart.toISOString(), "2026-11-30T17:00:00.000Z");
  assert.equal(period.nextMonthStart.toISOString(), "2026-12-31T17:00:00.000Z");
});

test("monthly groups are mutually exclusive and currencies stay separate", () => {
  const period = parseDashboardPeriod("9", "2026", new Date("2026-09-14T03:00:00Z"));
  const snapshot = buildSalesOverviewSnapshot({
    period,
    scopeLabel: "Your deals",
    generatedAt: new Date("2026-09-14T04:00:00Z"),
    targets: [],
    deals: [
      deal({ id: "open", status: "OPEN", goodsLoadingDate: "2026-09-05T00:00:00+07:00", value: 100 }),
      deal({ id: "won", status: "WON", goodsLoadingDate: "2026-09-10T00:00:00+07:00", value: 200 }),
      deal({ id: "lost", status: "LOST", goodsLoadingDate: "2026-09-12T00:00:00+07:00", value: 300 }),
      deal({ id: "next", status: "WON", goodsLoadingDate: "2026-10-01T00:00:00+07:00", value: 400 }),
      deal({ id: "missing", status: "OPEN", goodsLoadingDate: null, value: 500 }),
      deal({ id: "usd", status: "WON", goodsLoadingDate: "2026-09-15T00:00:00+07:00", value: 10, currency: "USD" }),
    ],
  });
  assert.equal(snapshot.monthly.waiting.count, 1);
  assert.deepEqual(snapshot.monthly.waiting.totals, [{ currency: "THB", amount: 100 }]);
  assert.equal(snapshot.monthly.won.count, 2);
  assert.deepEqual(snapshot.monthly.won.totals, [{ currency: "THB", amount: 200 }, { currency: "USD", amount: 10 }]);
  assert.equal(snapshot.monthly.total.count, 3);
});

test("yearly groups aggregate full anchor year deals across months", () => {
  const period = parseDashboardPeriod("9", "2026", new Date("2026-09-14T03:00:00Z"));
  const snapshot = buildSalesOverviewSnapshot({
    period,
    scopeLabel: "Your deals",
    generatedAt: new Date("2026-09-14T04:00:00Z"),
    targets: [],
    deals: [
      deal({ id: "jan-won", status: "WON", goodsLoadingDate: "2026-01-10T00:00:00+07:00", value: 100 }),
      deal({ id: "sep-won", status: "WON", goodsLoadingDate: "2026-09-10T00:00:00+07:00", value: 200 }),
      deal({ id: "sep-open", status: "OPEN", goodsLoadingDate: "2026-09-12T00:00:00+07:00", value: 50 }),
      deal({ id: "prev-year", status: "WON", goodsLoadingDate: "2025-09-10T00:00:00+07:00", value: 300 }),
    ],
  });
  assert.equal(snapshot.monthly.won.count, 1);
  assert.equal(snapshot.monthly.waiting.count, 1);
  assert.equal(snapshot.yearly.won.count, 2);
  assert.deepEqual(snapshot.yearly.won.totals, [{ currency: "THB", amount: 300 }]);
  assert.equal(snapshot.yearly.waiting.count, 1);
  assert.equal(snapshot.yearly.total.count, 3);
});

test("tracking handles zero and over-target without Infinity", () => {
  const period = parseDashboardPeriod("9", "2026", new Date("2026-09-14T03:00:00Z"));
  const deals = [deal({ id: "won", status: "WON", goodsLoadingDate: "2026-01-10T00:00:00+07:00", value: 125 })];
  const snapshot = buildSalesOverviewSnapshot({
    period,
    scopeLabel: "Your deals",
    deals,
    targets: [
      { companyId: "company-1", accountName: "Alpha", year: 2026, amount: "100", currency: "THB" },
      { companyId: "company-2", accountName: "Zero", year: 2026, amount: "0", currency: "THB" },
    ],
  });
  assert.equal(snapshot.tracking.find((item) => item.companyId === "company-1")?.percentage, 125);
  assert.equal(snapshot.tracking.find((item) => item.companyId === "company-2")?.percentage, null);
});

test("calculateYoY produces percent, new, or null without division by zero errors", () => {
  assert.deepEqual(calculateYoY(150, 100), { type: "percent", deltaPercent: 50 });
  assert.deepEqual(calculateYoY(50, 100), { type: "percent", deltaPercent: -50 });
  // First time customer in current year with no prior orders:
  assert.deepEqual(calculateYoY(200, 0, false), { type: "new" });
  // Returning customer who ordered in an earlier year (e.g. 2024 first order, gap in 2025, reordered in 2026):
  assert.equal(calculateYoY(200, 0, true), null);
  assert.equal(calculateYoY(0, 0), null);
});

test("calculateSharePercent calculates share correctly or returns null on zero total", () => {
  assert.equal(calculateSharePercent(25, 100), 25);
  assert.equal(calculateSharePercent(50, 0), null);
});

test("resolveCountryFromDeal resolves English, Thai, or addresses correctly", () => {
  assert.equal(resolveCountryFromDeal(deal({ id: "th", status: "WON", goodsLoadingDate: null, value: 100, company: { name: "A", displayName: null, country: "Thailand" } })).code, "TH");
  assert.equal(resolveCountryFromDeal(deal({ id: "us", status: "WON", goodsLoadingDate: null, value: 100, company: { name: "B", displayName: null, country: "United States" } })).code, "US");
  assert.equal(resolveCountryFromDeal(deal({ id: "cn-thai", status: "WON", goodsLoadingDate: null, value: 100, company: { name: "C", displayName: null, country: "จีน" } })).code, "CN");
  assert.equal(resolveCountryFromDeal(deal({ id: "sg-addr", status: "WON", goodsLoadingDate: null, value: 100, company: { name: "D", displayName: null, country: null, addresses: [{ country: "Singapore" }] } })).code, "SG");
  // Vietnam variations and Thuong Tin
  assert.equal(resolveCountryFromDeal(deal({ id: "vn-space", status: "WON", goodsLoadingDate: null, value: 100, company: { name: "Thuong Tin", displayName: null, country: "Viet Nam" } })).code, "VN");
  assert.equal(resolveCountryFromDeal(deal({ id: "vn-nospace", status: "WON", goodsLoadingDate: null, value: 100, company: { name: "Duong", displayName: null, country: "Vietnam" } })).code, "VN");
  assert.equal(resolveCountryFromDeal(deal({ id: "vn-thai", status: "WON", goodsLoadingDate: null, value: 100, company: { name: "VN Co", displayName: null, country: "เวียดนาม" } })).code, "VN");
  assert.equal(resolveCountryFromDeal(deal({ id: "vn-addr", status: "WON", goodsLoadingDate: null, value: 100, company: { name: "Thuong Tin", displayName: null, country: null, addresses: [{ country: "Viet Nam" }] } })).code, "VN");
});

test("buildWorldMapReport aggregates all-time and annual country sales with correct ranking and currencies", () => {
  const deals = [
    deal({ id: "d1", companyId: "company-1", status: "WON", goodsLoadingDate: "2026-03-01T00:00:00+07:00", value: 500000, company: { name: "Thai Co", displayName: null, country: "Thailand" } }),
    deal({ id: "d2", companyId: "company-2", status: "WON", goodsLoadingDate: "2026-04-01T00:00:00+07:00", value: 200000, company: { name: "Thai Co 2", displayName: null, country: "Thailand" } }),
    deal({ id: "d3", status: "WON", goodsLoadingDate: "2025-06-01T00:00:00+07:00", value: 900000, company: { name: "US Co", displayName: null, country: "United States" } }),
    deal({ id: "d4", status: "WON", goodsLoadingDate: "2026-05-01T00:00:00+07:00", value: 300000, company: { name: "SG Co", displayName: null, country: "Singapore" } }),
  ];

  const report = buildWorldMapReport(deals, [2026, 2025], {
    start: new Date("2026-03-01T00:00:00+07:00"),
    end: new Date("2026-04-01T00:00:00+07:00"),
  });

  // All time checks
  assert.equal(report.allTime.totalCountries, 3);
  assert.equal(report.allTime.totalDeals, 4);
  assert.equal(report.allTime.totalAmount, 1900000);
  assert.equal(report.allTime.countries[0].countryCode, "US"); // 900k
  assert.equal(report.allTime.countries[1].countryCode, "TH"); // 700k
  assert.equal(report.allTime.countries[2].countryCode, "SG"); // 300k

  // 2026 checks (US was in 2025, so only TH and SG in 2026)
  assert.equal(report.byYear[2026].totalCountries, 2);
  assert.equal(report.byYear[2026].totalDeals, 3);
  assert.equal(report.byYear[2026].totalAmount, 1000000);
  assert.equal(report.selectedMonth.totalDeals, 1);
  assert.equal(report.selectedMonth.totalAmount, 500000);
  assert.equal(report.selectedMonth.countries[0].countryCode, "TH");
  // Account breakdown check for Thailand (Thai Co = 500k, Thai Co 2 = 200k)
  const thSummary = report.allTime.countries[1];
  assert.equal(thSummary.accounts.length, 2);
  assert.equal(thSummary.accounts[0].accountName, "Thai Co");
  assert.equal(thSummary.accounts[0].totalAmount, 500000);
  assert.equal(thSummary.accounts[1].accountName, "Thai Co 2");
  assert.equal(thSummary.accounts[1].totalAmount, 200000);
});

test("buildSalesOverviewSnapshot supports global country/account filtering and attaches country to annual accounts", () => {
  const deals = [
    deal({ id: "d1", companyId: "c-th", status: "WON", goodsLoadingDate: "2026-09-10T00:00:00+07:00", value: 500000, company: { name: "Thai Co", displayName: null, country: "Thailand" } }),
    deal({ id: "d2", companyId: "c-vn", status: "WON", goodsLoadingDate: "2026-09-12T00:00:00+07:00", value: 300000, company: { name: "Thuong Tin", displayName: null, country: "Vietnam" } }),
    deal({ id: "d3", companyId: "c-ru", status: "OPEN", goodsLoadingDate: "2026-09-15T00:00:00+07:00", value: 400000, company: { name: "Namwhan", displayName: null, country: "Russia" } }),
  ];

  const targets = [
    { companyId: "c-th", accountName: "Thai Co", year: 2026, amount: "1000000", currency: "THB" },
    { companyId: "c-vn", accountName: "Thuong Tin", year: 2026, amount: "800000", currency: "THB" },
  ];

  const period = parseDashboardPeriod("9", "2026", new Date("2026-09-15T12:00:00+07:00"));

  // 1. Unfiltered snapshot
  const unfiltered = buildSalesOverviewSnapshot({
    deals,
    targets,
    period,
    scopeLabel: "All",
  });
  assert.equal(unfiltered.monthly.won.count, 2);
  assert.equal(unfiltered.monthly.waiting.count, 1);
  assert.equal(unfiltered.filterOptions?.countries.length, 3);
  assert.equal(unfiltered.annual.accounts.find((a) => a.companyId === "c-th")?.country, "Thailand");
  assert.equal(unfiltered.annual.accounts.find((a) => a.companyId === "c-vn")?.country, "Vietnam");

  // 2. Filtered by Country "Vietnam" (or "VN")
  const vnFiltered = buildSalesOverviewSnapshot({
    deals,
    targets,
    period,
    scopeLabel: "All",
    filterCountry: "VN",
  });
  assert.equal(vnFiltered.monthly.won.count, 1);
  assert.equal(vnFiltered.monthly.won.deals[0].id, "d2");
  assert.equal(vnFiltered.tracking.length, 1);
  assert.equal(vnFiltered.tracking[0].accountName, "Thuong Tin");
  assert.equal(vnFiltered.annual.accounts.length, 1);
  assert.equal(vnFiltered.annual.accounts[0].accountName, "Thuong Tin");
  assert.equal(vnFiltered.annual.accounts[0].country, "Vietnam");
  assert.equal(vnFiltered.worldMap.allTime.totalCountries, 1);
  assert.equal(vnFiltered.worldMap.allTime.countries[0].countryCode, "VN");

  // 3. Filtered by Account "Namwhan"
  const ruFiltered = buildSalesOverviewSnapshot({
    deals,
    targets,
    period,
    scopeLabel: "All",
    filterAccount: "Namwhan",
  });
  assert.equal(ruFiltered.monthly.won.count, 0);
  assert.equal(ruFiltered.monthly.waiting.count, 1);
  assert.equal(ruFiltered.monthly.waiting.deals[0].id, "d3");
  assert.equal(ruFiltered.worldMap.allTime.countries[0].countryCode, "RU");
});

test("initial snapshot payload contract prevents nested deal arrays in worldMap accounts", () => {
  const deals = [
    deal({ id: "d1", companyId: "c-th", status: "WON", goodsLoadingDate: "2026-09-10T00:00:00+07:00", value: 500000, company: { name: "Thai Co", displayName: null, country: "Thailand" } }),
  ];
  const period = parseDashboardPeriod("9", "2026", new Date("2026-09-15T12:00:00+07:00"));
  const snapshot = buildSalesOverviewSnapshot({
    deals,
    targets: [],
    period,
    scopeLabel: "All",
  });
  // Verify country accounts do not contain eager deals array
  const countryAccounts = snapshot.worldMap.allTime.countries[0]?.accounts || [];
  for (const account of countryAccounts) {
    assert.equal(account.deals, undefined, "worldMap account must not leak heavy deals array into initial DTO");
  }
});
