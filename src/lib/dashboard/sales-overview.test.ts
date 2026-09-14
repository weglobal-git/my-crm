import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSalesOverviewSnapshot,
  calculateSharePercent,
  calculateYoY,
  parseDashboardPeriod,
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
