import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_COMPANY_COST_OVERHEAD,
  getTotalOverheadPercent,
  calculateEffectiveCost,
  getCostBreakdown,
  CompanyCostOverhead,
} from "./company-cost-overhead";

test("Company Cost Overhead - Defaults & Calculations", async (t) => {
  await t.test("default percentages sum up to 10%", () => {
    assert.equal(DEFAULT_COMPANY_COST_OVERHEAD.supportPercent, 2);
    assert.equal(DEFAULT_COMPANY_COST_OVERHEAD.operationPercent, 3);
    assert.equal(DEFAULT_COMPANY_COST_OVERHEAD.marketingPercent, 2);
    assert.equal(DEFAULT_COMPANY_COST_OVERHEAD.salesPercent, 3);
    assert.equal(getTotalOverheadPercent(DEFAULT_COMPANY_COST_OVERHEAD), 10);
  });

  await t.test("calculates effective cost correctly for 57 THB with default 10%", () => {
    const baseCost = 57;
    const effectiveCost = calculateEffectiveCost(baseCost, DEFAULT_COMPANY_COST_OVERHEAD);
    // 57 * 1.10 = 62.70
    assert.equal(effectiveCost, 62.7);

    const breakdown = getCostBreakdown(baseCost, DEFAULT_COMPANY_COST_OVERHEAD);
    assert.equal(breakdown.baseCost, 57);
    assert.equal(breakdown.supportAmount, 1.14); // 2% of 57
    assert.equal(breakdown.operationAmount, 1.71); // 3% of 57
    assert.equal(breakdown.marketingAmount, 1.14); // 2% of 57
    assert.equal(breakdown.salesAmount, 1.71); // 3% of 57
    assert.equal(breakdown.totalOverheadAmount, 5.7);
    assert.equal(breakdown.effectiveCost, 62.7);
    assert.equal(breakdown.totalPercent, 10);
  });

  await t.test("calculates effective cost with custom overhead percentages", () => {
    const customOverhead: CompanyCostOverhead = {
      supportPercent: 2.5,
      operationPercent: 4.5,
      marketingPercent: 3,
      salesPercent: 5,
    };
    // Total = 15%
    assert.equal(getTotalOverheadPercent(customOverhead), 15);
    const effectiveCost = calculateEffectiveCost(100, customOverhead);
    assert.equal(effectiveCost, 115);
  });

  await t.test("handles 0, null, undefined, or negative cost safely", () => {
    assert.equal(calculateEffectiveCost(0, DEFAULT_COMPANY_COST_OVERHEAD), 0);
    assert.equal(calculateEffectiveCost(null, DEFAULT_COMPANY_COST_OVERHEAD), 0);
    assert.equal(calculateEffectiveCost(undefined, DEFAULT_COMPANY_COST_OVERHEAD), 0);
    assert.equal(calculateEffectiveCost(-10, DEFAULT_COMPANY_COST_OVERHEAD), 0);
  });
});
