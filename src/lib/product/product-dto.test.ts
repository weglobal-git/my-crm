import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProductStatus } from '@prisma/client';
import {
  ProductListItemDTO,
  productMatchesFilters,
  getProductFilterKey,
  getProductOverviewKey,
  parsePriceConditions,
  serializePriceConditions,
  calculateTierPrice,
} from './product-dto';

const sampleProduct: ProductListItemDTO = {
  id: 'prod-1',
  name: 'Carebeau Milky Developer Cream (1000ml)',
  brand: 'Carebeau',
  category: 'Hair Bleaching',
  description: 'สูตรผสมสารสกัดจากน้ำนมธรรมชาติ',
  websiteUrl: 'https://example.com',
  status: ProductStatus.AVAILABLE,
  hsCode: '3305.90.00',
  cbm: 0.042,
  cartonDimension: '35x45x30 cm',
  cartonQuantity: 24,
  variantCount: 4,
  minPrice: 65.0,
  maxPrice: 75.0,
  primaryImageUrl: 'https://example.com/image.jpg',
  starRating: 4,
  formulas: ['3% Concentrate', '6% Concentrate', '9% Concentrate', '12% Concentrate'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  revision: new Date().toISOString(),
};

describe('Product DTO & Filter Matching', () => {
  it('matches when all criteria match', () => {
    const match = productMatchesFilters(sampleProduct, {
      status: ProductStatus.AVAILABLE,
      category: 'Hair Bleaching',
      brand: 'Carebeau',
      search: 'Milky',
    });
    assert.equal(match, true);
  });

  it('matches multi-brand filter when item brand is in list', () => {
    const match = productMatchesFilters(sampleProduct, {
      brands: ['Deya', 'Carebeau'],
    });
    assert.equal(match, true);
  });

  it('rejects multi-brand filter when item brand is not in list', () => {
    const match = productMatchesFilters(sampleProduct, {
      brands: ['Deya', 'Zeezi'],
    });
    assert.equal(match, false);
  });

  it('rejects when status does not match', () => {
    const match = productMatchesFilters(sampleProduct, {
      status: ProductStatus.UNAVAILABLE,
    });
    assert.equal(match, false);
  });

  it('rejects when category does not match', () => {
    const match = productMatchesFilters(sampleProduct, {
      category: 'Body Lotion',
    });
    assert.equal(match, false);
  });

  it('rejects when brand does not match', () => {
    const match = productMatchesFilters(sampleProduct, {
      brand: 'Deya',
    });
    assert.equal(match, false);
  });

  it('matches search across formula variants', () => {
    const match = productMatchesFilters(sampleProduct, {
      search: '12% Concentrate',
    });
    assert.equal(match, true);
  });

  it('matches search across HS-Code', () => {
    const match = productMatchesFilters(sampleProduct, {
      search: '3305.90',
    });
    assert.equal(match, true);
  });

  it('generates canonical cache keys', () => {
    const listKey = getProductFilterKey({
      status: ProductStatus.AVAILABLE,
      category: 'Hair Bleaching',
      brand: 'Carebeau',
      search: 'milky',
      page: 1,
      pageSize: 20,
    });
    assert.equal(listKey, 'products|AVAILABLE|c:Hair Bleaching|b:Carebeau|s:milky|p:1|ps:20');

    const multiBrandKey = getProductFilterKey({
      status: ProductStatus.AVAILABLE,
      category: 'Hair Bleaching',
      brands: ['Deya', 'Carebeau'],
      search: 'milky',
      page: 1,
      pageSize: 20,
    });
    assert.equal(multiBrandKey, 'products|AVAILABLE|c:Hair Bleaching|brands:Carebeau,Deya|s:milky|p:1|ps:20');

    const multiCategoryKey = getProductFilterKey({
      status: ProductStatus.AVAILABLE,
      categories: ['Shower Gel', 'Body Lotion'],
      search: 'milky',
      page: 1,
      pageSize: 20,
    });
    assert.equal(multiCategoryKey, 'products|AVAILABLE|cats:Body Lotion,Shower Gel|b:ALL|s:milky|p:1|ps:20');

    const overviewKey = getProductOverviewKey('prod-1');
    assert.deepEqual(overviewKey, ['product-overview', 'prod-1']);
  });

  it('executes in-memory filter matching across 500 products in sub-millisecond time', () => {
    const pool: ProductListItemDTO[] = Array.from({ length: 500 }, (_, i) => ({
      ...sampleProduct,
      id: `prod-${i}`,
      name: `Product ${i}`,
      brand: i % 2 === 0 ? 'Carebeau' : 'Deya',
      category: i % 3 === 0 ? 'Hair Bleaching' : 'Body Lotion',
    }));

    const start = performance.now();
    const filtered = pool.filter((p) =>
      productMatchesFilters(p, {
        status: ProductStatus.AVAILABLE,
        brand: 'Carebeau',
        category: 'Hair Bleaching',
        search: 'Product 12',
      })
    );
    const duration = performance.now() - start;

    assert.ok(filtered.length > 0);
    assert.ok(duration < 5, `Expected sub-5ms filtering across 500 items, got ${duration}ms`);
  });

  it('correctly handles volume tier step price parsing, dynamic ranges, and calculations', () => {
    const raw = JSON.stringify([
      { minQuantity: 1, maxQuantity: 20, discountPercent: 5 },
      { minQuantity: 21, maxQuantity: 100, discountPercent: 10 },
      { minQuantity: 101, maxQuantity: null, discountPercent: 15 },
    ]);
    const tiers = parsePriceConditions(raw);
    assert.equal(tiers.length, 3);
    assert.equal(tiers[0].minQuantity, 1);
    assert.equal(tiers[0].maxQuantity, 20);
    assert.equal(tiers[0].discountPercent, 5);

    assert.equal(tiers[1].minQuantity, 21);
    assert.equal(tiers[1].maxQuantity, 100);
    assert.equal(tiers[1].discountPercent, 10);

    assert.equal(tiers[2].minQuantity, 101);
    assert.equal(tiers[2].maxQuantity, null); // Last tier is "or more"
    assert.equal(tiers[2].discountPercent, 15);

    // 100 THB base price, 5% discount -> 95 THB
    const price5 = calculateTierPrice(100, 5);
    assert.equal(price5, 95);

    // 43 THB base price, 10% discount -> 38.70 THB
    const price10 = calculateTierPrice(43, 10);
    assert.equal(price10, 38.70);

    // 43 THB base price, 15% discount -> 36.55 THB
    const price15 = calculateTierPrice(43, 15);
    assert.equal(price15, 36.55);

    // Serialization
    const serialized = serializePriceConditions(tiers);
    assert.equal(serialized, raw);
  });
});

