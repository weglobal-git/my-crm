import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./sales-target.ts', import.meta.url), 'utf8');

test('sale target actions retain permission-only account policy and both menu gates', () => {
  assert.match(source, /'contact', 'contact\.sale_target'/);
  assert.match(source, /permission-only account scope/);
  assert.match(source, /getUserVisibleMenuKeys\(actor\.id\)/);
});

test('target writes keep target and CompanyLog audit in the same transaction', () => {
  assert.match(source, /prisma\.\$transaction\(async \(tx\)/);
  assert.match(source, /tx\.companySaleTarget\.upsert/);
  assert.match(source, /tx\.companySaleTarget\.delete/);
  assert.match(source, /tx\.companyLog\.create/g);
  assert.match(source, /Amount must fit Decimal\(18,2\)/);
  assert.match(source, /Future sale target years are not allowed/);
});
