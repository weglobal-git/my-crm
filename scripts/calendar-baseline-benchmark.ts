import prisma from '../src/lib/prisma';
import { getCalendarMonthSnapshot } from '../src/lib/calendar/calendar-queries';
import type { CalendarActor } from '../src/lib/calendar/calendar-access';

const benchmarkActor: CalendarActor = {
  id: 'benchmark-admin-id',
  name: 'Benchmark Admin',
  role: 'ADMIN',
  departments: ['Sales', 'Management'],
  hasInformationPerm: true,
};

async function runCalendarBenchmark() {
  console.log('=== CALENDAR MONTH SNAPSHOT BENCHMARK ===');

  // Cold run
  const coldStart = performance.now();
  const coldSnapshot = await getCalendarMonthSnapshot(2026, 9, benchmarkActor);
  const coldDuration = performance.now() - coldStart;

  // Warm run
  const warmStart = performance.now();
  const warmSnapshot = await getCalendarMonthSnapshot(2026, 9, benchmarkActor);
  const warmDuration = performance.now() - warmStart;

  const jsonBytes = Buffer.byteLength(JSON.stringify(warmSnapshot), 'utf8');

  // Cardinality breakdown
  const dealGoodsReady = warmSnapshot.items.filter((i) => i.sourceType === 'DEAL_GOODS_READY').length;
  const dealGoodsLoading = warmSnapshot.items.filter((i) => i.sourceType === 'DEAL_GOODS_LOADING').length;
  const events = warmSnapshot.items.filter((i) => i.sourceType === 'EVENT').length;

  console.log(
    JSON.stringify(
      {
        month: '2026-09',
        coldDurationMs: Number(coldDuration.toFixed(2)),
        warmDurationMs: Number(warmDuration.toFixed(2)),
        totalItems: warmSnapshot.items.length,
        cardinality: {
          dealGoodsReady,
          dealGoodsLoading,
          events,
        },
        snapshotBytes: jsonBytes,
        snapshotKb: Number((jsonBytes / 1024).toFixed(2)),
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

runCalendarBenchmark().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
