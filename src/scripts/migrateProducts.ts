import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import prisma from '../lib/prisma';
import { ProductStatus } from '@prisma/client';

function parseAmount(val?: string | null): number | null {
  if (!val) return null;
  const clean = val.replace(/,/g, '').replace(/฿/g, '').replace(/\$/g, '').trim();
  if (!clean || clean === '-') return null;
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function parseInteger(val?: string | null): number | null {
  if (!val) return null;
  const clean = val.replace(/,/g, '').trim();
  if (!clean || clean === '-') return null;
  const n = parseInt(clean, 10);
  return isNaN(n) ? null : n;
}

function cleanString(val?: string | null): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  return trimmed && trimmed !== '-' ? trimmed : null;
}

interface RawCsvRow {
  [key: string]: string;
}

const CUSTOMER_COLUMNS = [
  'Thuong Tin',
  'Anna Trading',
  'Namwhan',
  'Humphrey',
  'Memi',
  'Auday',
  'GMG',
  'Ilyas',
  'May Export',
  'Noor',
  'Bopha',
  'Adam&Aud',
  'Muhiadin Ali',
  'Sabaya',
  'Joseph Blasko',
  'Wichai (China)',
  'John Larsen',
  'Gena',
];

export async function migrateProducts() {
  console.log('--- Starting Products Migration ---');

  const csvPath = path.join(process.cwd(), 'backup_old_code/csv/ Products.csv');
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found at ${csvPath}`);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const records = parse(csvContent, {
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as string[][];

  if (records.length < 2) {
    throw new Error('CSV is empty or has only headers');
  }

  const headers = records[0];
  const rows = records.slice(1);

  // Map header column indices
  const customerColIndices: { [name: string]: number } = {};
  for (const cName of CUSTOMER_COLUMNS) {
    const idx = headers.indexOf(cName);
    if (idx !== -1) {
      customerColIndices[cName] = idx;
    }
  }

  // Pre-load all companies to map customer names
  console.log('Mapping customer companies...');
  const allCompanies = await prisma.company.findMany({
    select: { id: true, name: true, displayName: true },
  });

  const companyMap: { [cName: string]: string } = {};
  for (const cName of CUSTOMER_COLUMNS) {
    let match = allCompanies.find(
      (c) =>
        c.name.toLowerCase().includes(cName.toLowerCase()) ||
        (c.displayName && c.displayName.toLowerCase().includes(cName.toLowerCase()))
    );

    if (!match) {
      // Create company if it doesn't exist
      const created = await prisma.company.create({
        data: {
          name: cName,
          displayName: cName,
          type: 'CUSTOMER',
          status: 'QUALIFIED',
        },
      });
      companyMap[cName] = created.id;
      console.log(`Created missing company: ${cName} -> ${created.id}`);
    } else {
      companyMap[cName] = match.id;
      console.log(`Matched existing company: ${cName} -> ${match.name} (${match.id})`);
    }
  }

  // Filter valid product rows
  // In headers:
  // 0: Available, 1: SKU, 2: Full-Product-Name, 3: Brand, 4: Category, 5: Product, 6: Formula
  const validRows = rows.filter((r) => r.length > 6 && r[5] && r[5].trim() && r[5].trim() !== '-');
  console.log(`Found ${validRows.length} valid product rows.`);

  // Group by Parent Product Name
  const groupedProducts: { [parentName: string]: string[][] } = {};
  for (const row of validRows) {
    const parentName = row[5].trim();
    if (!groupedProducts[parentName]) {
      groupedProducts[parentName] = [];
    }
    groupedProducts[parentName].push(row);
  }

  const parentCount = Object.keys(groupedProducts).length;
  console.log(`Grouped into ${parentCount} parent products.`);

  // Clear existing product data
  console.log('Cleaning old product and variant records...');
  await prisma.companyPrice.deleteMany();
  await prisma.quotationItem.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();

  let createdProductCount = 0;
  let createdVariantCount = 0;
  const allCompanyPrices: { variantId: string; companyId: string; price: number }[] = [];

  const parentEntries = Object.entries(groupedProducts);
  for (let pIdx = 0; pIdx < parentEntries.length; pIdx++) {
    const [parentName, variantRows] = parentEntries[pIdx];
    const firstRow = variantRows[0];

    const hasAvailableVariant = variantRows.some((r) => r[0]?.trim().toLowerCase() === 'yes');
    const status: ProductStatus = hasAvailableVariant
      ? ProductStatus.AVAILABLE
      : ProductStatus.UNAVAILABLE;

    const brand = cleanString(firstRow[3]);
    const category = cleanString(firstRow[4]);
    const websiteUrl = cleanString(firstRow[32]);
    const hsCode = cleanString(firstRow[17]);
    const thaiDesc = cleanString(firstRow[18]);
    const cartonDimension = cleanString(firstRow[21]);
    const cartonWidth = parseAmount(firstRow[22]);
    const cartonLength = parseAmount(firstRow[23]);
    const cartonHeight = parseAmount(firstRow[24]);
    const cbm = parseAmount(firstRow[25]);
    const cartonQuantity = parseInteger(firstRow[26]);
    const remarks = [
      cleanString(firstRow[29]),
      cleanString(firstRow[30]),
      cleanString(firstRow[31]),
    ]
      .filter(Boolean)
      .join('\n');
    const remark = remarks.length > 0 ? remarks : null;

    const variantsData = variantRows.map((vRow, i) => {
      const rawSku = cleanString(vRow[1]);
      const fullName = cleanString(vRow[2]) || `${parentName} - ${vRow[6] || i + 1}`;
      const formula = cleanString(vRow[6]);
      const vThaiName = cleanString(vRow[18]);
      const imageUrl = cleanString(vRow[33]);

      const cost = parseAmount(vRow[7]);
      const exportPrice = parseAmount(vRow[10]);
      const thaiMarketPrice = parseAmount(vRow[13]);
      const priceCondition = cleanString(vRow[15]);

      const netWeight = parseAmount(vRow[19]);
      const cartonGrossWeight = parseAmount(vRow[20]);

      const price = exportPrice ?? thaiMarketPrice ?? cost ?? 0;

      return {
        sku: rawSku,
        fullName,
        thaiName: vThaiName,
        formula: formula || (variantRows.length > 1 ? `Formula ${i + 1}` : 'Standard'),
        imageUrl,
        price,
        productCost: cost,
        priceCondition,
        netWeight,
        cartonGrossWeight,
        isDefault: i === 0,
        _rawRow: vRow,
      };
    });

    const createdProduct = await prisma.product.create({
      data: {
        name: parentName,
        brand,
        category,
        description: thaiDesc,
        websiteUrl,
        status,
        hsCode,
        cartonDimension,
        cartonWidth,
        cartonLength,
        cartonHeight,
        cbm,
        cartonQuantity,
        remark,
        variants: {
          create: variantsData.map(({ _rawRow, ...v }) => v),
        },
      },
      include: {
        variants: true,
      },
    });

    createdProductCount++;
    createdVariantCount += createdProduct.variants.length;

    // Match created variants with customer prices
    for (let i = 0; i < createdProduct.variants.length; i++) {
      const variant = createdProduct.variants[i];
      const rawRow = variantsData[i]._rawRow;

      for (const [cName, colIdx] of Object.entries(customerColIndices)) {
        if (rawRow[colIdx]) {
          const custPrice = parseAmount(rawRow[colIdx]);
          const companyId = companyMap[cName];
          if (custPrice && custPrice > 0 && companyId) {
            allCompanyPrices.push({
              variantId: variant.id,
              companyId,
              price: custPrice,
            });
          }
        }
      }
    }

    if ((pIdx + 1) % 50 === 0 || pIdx + 1 === parentEntries.length) {
      console.log(`Progress: created ${pIdx + 1}/${parentEntries.length} products...`);
    }
  }

  console.log(`Inserting ${allCompanyPrices.length} company prices in bulk...`);
  const createdPriceResult = await prisma.companyPrice.createMany({
    data: allCompanyPrices,
    skipDuplicates: true,
  });

  console.log('--- Migration Summary ---');
  console.log(`Parent Products created: ${createdProductCount}`);
  console.log(`Variants created: ${createdVariantCount}`);
  console.log(`Company Prices created: ${createdPriceResult.count}`);
  console.log('Products migration completed successfully!');
}

if (require.main === module) {
  migrateProducts()
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
