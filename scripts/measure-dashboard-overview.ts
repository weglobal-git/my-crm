import prisma from '../src/lib/prisma';
import { getDashboardSalesSnapshot } from '../src/lib/dashboard/dashboard-data';
import type { PipelineActor } from '../src/lib/pipeline-security';

const adminActor: PipelineActor = {
  id: 'benchmark-admin',
  name: 'Benchmark Admin',
  role: 'ADMIN',
  departments: [],
};

async function measureRun() {
  const start = performance.now();
  const snapshot = await getDashboardSalesSnapshot({ actor: adminActor });
  const durationMs = Number((performance.now() - start).toFixed(1));

  const totalBytes = Buffer.byteLength(JSON.stringify(snapshot));
  const breakdownBytes = {
    monthly: Buffer.byteLength(JSON.stringify(snapshot.monthly)),
    yearly: Buffer.byteLength(JSON.stringify(snapshot.yearly)),
    tracking: Buffer.byteLength(JSON.stringify(snapshot.tracking)),
    annual: Buffer.byteLength(JSON.stringify(snapshot.annual)),
    worldMap: Buffer.byteLength(JSON.stringify(snapshot.worldMap)),
    filterOptions: Buffer.byteLength(JSON.stringify(snapshot.filterOptions)),
    filters: Buffer.byteLength(JSON.stringify(snapshot.filters)),
  };

  const counts = {
    monthlyDealsCount: snapshot.monthly.total.count,
    yearlyDealsCount: snapshot.yearly.total.count,
    trackingRowsCount: snapshot.tracking.length,
    annualAccountsCount: snapshot.annual.accounts.length,
    worldMapAllTimeCountriesCount: snapshot.worldMap.allTime.countries.length,
    filterCountriesCount: snapshot.filterOptions?.countries.length ?? 0,
    filterAccountsCount: snapshot.filterOptions?.accounts.length ?? 0,
  };

  return {
    durationMs,
    totalBytes,
    breakdownBytes,
    counts,
  };
}

async function main() {
  try {
    const cold = await measureRun();
    const warm = await measureRun();

    console.log(
      JSON.stringify(
        {
          measuredAt: new Date().toISOString(),
          target: '/dashboard/overview (ADMIN)',
          cold,
          warm,
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error('Measurement failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
