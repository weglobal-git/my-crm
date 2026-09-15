import os from 'node:os';
import prisma from '../src/lib/prisma';
import { getDashboardSalesSnapshot, resolveDashboardSectionAccess } from '../src/lib/dashboard/dashboard-data';
import type { PipelineActor } from '../src/lib/pipeline-security';

interface BenchmarkResult {
  environment: {
    platform: string;
    cpus: number;
    totalMemoryMb: number;
    nodeVersion: string;
    timestamp: string;
  };
  scenarios: Record<string, {
    cold: { durationMs: number; totalBytes: number; counts: Record<string, number> };
    warm: { durationMs: number; totalBytes: number; counts: Record<string, number> };
  }>;
}

async function measureScope(actor: PipelineActor, visibleKeys?: string[]) {
  const runOnce = async () => {
    const start = performance.now();
    const snapshot = await getDashboardSalesSnapshot({ actor, visibleKeys });
    const durationMs = Number((performance.now() - start).toFixed(1));
    const totalBytes = Buffer.byteLength(JSON.stringify(snapshot));
    const counts = {
      monthlyDealsCount: snapshot.monthly.total.count,
      yearlyDealsCount: snapshot.yearly.total.count,
      trackingRowsCount: snapshot.tracking.length,
      annualAccountsCount: snapshot.annual.accounts.length,
      worldMapAllTimeCountriesCount: snapshot.worldMap.allTime.countries.length,
      filterCountriesCount: snapshot.filterOptions?.countries.length ?? 0,
      filterAccountsCount: snapshot.filterOptions?.accounts.length ?? 0,
    };
    return { durationMs, totalBytes, counts };
  };

  const cold = await runOnce();
  const warm = await runOnce();
  return { cold, warm };
}

async function main() {
  try {
    const env = {
      platform: `${os.platform()} ${os.arch()} (${os.release()})`,
      cpus: os.cpus().length,
      totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    };

    const adminActor: PipelineActor = {
      id: 'benchmark-admin',
      name: 'Benchmark Admin',
      role: 'ADMIN',
      departments: [],
    };

    const managementActor: PipelineActor = {
      id: 'benchmark-mgmt',
      name: 'Benchmark Management',
      role: 'MANAGEMENT',
      departments: ['Sales'],
    };

    const generalActor: PipelineActor = {
      id: 'benchmark-general',
      name: 'Benchmark General',
      role: 'GENERAL',
      departments: ['Sales'],
    };

    const results: BenchmarkResult = {
      environment: env,
      scenarios: {},
    };

    results.scenarios['ADMIN'] = await measureScope(adminActor);
    results.scenarios['MANAGEMENT'] = await measureScope(managementActor, ['crm_overview', 'dashboard.sale_summary', 'dashboard.sale_tracking', 'dashboard.annual_sale_report']);
    results.scenarios['GENERAL'] = await measureScope(generalActor, ['crm_overview', 'dashboard.sale_summary', 'dashboard.sale_tracking', 'dashboard.annual_sale_report']);

    // Check assertions
    const adminWarm = results.scenarios['ADMIN'].warm;
    if (adminWarm.totalBytes <= 0 || adminWarm.durationMs <= 0) {
      throw new Error('Benchmark assertion failed: invalid ADMIN warm measurement');
    }

    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('Benchmark scenario failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
