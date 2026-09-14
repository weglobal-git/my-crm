import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./dashboard-data.ts', import.meta.url), 'utf8');

test('dashboard data keeps the route gate and all three server-side section gates', () => {
  assert.match(source, /'crm_overview'/);
  assert.match(source, /'dashboard\.sale_summary'/);
  assert.match(source, /'dashboard\.sale_tracking'/);
  assert.match(source, /'dashboard\.annual_sale_report'/);
  assert.match(source, /getUserVisibleMenuKeys\(actor\.id\)/);
  assert.match(source, /getOpportunityAccessWhere\(actor\)/);
  assert.doesNotMatch(source, /requirePipelineActor/);
});

test('denied section payloads are redacted server-side', () => {
  assert.match(source, /if \(!sections\.saleSummary\)/);
  assert.match(source, /if \(!sections\.saleTracking\)/);
  assert.match(source, /if \(!sections\.annualSaleReport\)/);
  assert.match(source, /company: \{ opportunities: \{ some: accessWhere \} \}/);
});

test('dashboard query is bounded and does not request heavy deal relations', () => {
  assert.match(source, /goodsLoadingDate:\s*\{ gte: period\.annualStart, lt: period\.annualEnd \}/);
  for (const forbiddenRelation of ['activityLogs:', 'attachments:', 'notes:', 'quotations:']) {
    assert.equal(source.includes(forbiddenRelation), false, `unexpected heavy projection: ${forbiddenRelation}`);
  }
});
