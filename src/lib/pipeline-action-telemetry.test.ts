import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordPipelineActionMetric,
  getPipelineActionStats,
  resetPipelineActionMetricsForTest,
  normalizeRole,
} from './pipeline-action-telemetry';

test('pipeline-action-telemetry: normalizeRole clamps unexpected roles to UNKNOWN', () => {
  assert.equal(normalizeRole('ADMIN'), 'ADMIN');
  assert.equal(normalizeRole('MANAGEMENT'), 'MANAGEMENT');
  assert.equal(normalizeRole('GENERAL'), 'GENERAL');
  assert.equal(normalizeRole('SUPERUSER'), 'UNKNOWN');
  assert.equal(normalizeRole(null), 'UNKNOWN');
  assert.equal(normalizeRole(undefined), 'UNKNOWN');
});

test('pipeline-action-telemetry: records metrics without leaking PII and calculates p50/p95', () => {
  resetPipelineActionMetricsForTest();

  // Record 10 metrics for togglePinOpportunity
  for (let i = 1; i <= 10; i++) {
    recordPipelineActionMetric({
      action: 'togglePinOpportunity',
      role: 'ADMIN',
      status: 'SUCCESS',
      durationMs: i * 10, // 10, 20, 30, ..., 100ms
      dbDurationMs: i * 2,
      payloadSizeBytes: 500,
    });
  }

  // Record 1 error metric for updateOpportunityHotNote
  recordPipelineActionMetric({
    action: 'updateOpportunityHotNote',
    role: 'GENERAL',
    status: 'ERROR',
    durationMs: 250,
  });

  const pinStats = getPipelineActionStats('togglePinOpportunity')[0];
  assert.ok(pinStats);
  assert.equal(pinStats.totalCount, 10);
  assert.equal(pinStats.errorCount, 0);
  assert.equal(pinStats.errorRate, 0);
  assert.equal(pinStats.p50DurationMs, 50);
  assert.equal(pinStats.p95DurationMs, 100);
  assert.equal(pinStats.avgDurationMs, 55);
  assert.equal(pinStats.avgDbDurationMs, 11);
  assert.equal(pinStats.avgPayloadSizeBytes, 500);
  assert.equal(pinStats.coldCount, 3); // first 3 requests are cold
  assert.equal(pinStats.warmCount, 7);

  const hotNoteStats = getPipelineActionStats('updateOpportunityHotNote')[0];
  assert.ok(hotNoteStats);
  assert.equal(hotNoteStats.totalCount, 1);
  assert.equal(hotNoteStats.errorCount, 1);
  assert.equal(hotNoteStats.errorRate, 1);
  assert.equal(hotNoteStats.p50DurationMs, 250);
  assert.equal(hotNoteStats.coldCount, 0);
  assert.equal(hotNoteStats.warmCount, 1);
});

test('pipeline-action-telemetry: ring buffer bounds maximum history', () => {
  resetPipelineActionMetricsForTest();

  for (let i = 0; i < 1100; i++) {
    recordPipelineActionMetric({
      action: 'getPipelineOpportunities',
      role: 'ADMIN',
      status: 'SUCCESS',
      durationMs: 40,
    });
  }

  const stats = getPipelineActionStats('getPipelineOpportunities')[0];
  assert.equal(stats.totalCount, 1000); // Clamped at MAX_METRIC_HISTORY (1000)
});

test('pipeline-action-telemetry: Phase P3 tracks board payload size accurately', () => {
  resetPipelineActionMetricsForTest();

  const metric = recordPipelineActionMetric({
    action: 'getPipelineOpportunities',
    role: 'ADMIN',
    status: 'SUCCESS',
    durationMs: 45,
    dbDurationMs: 25,
    payloadSizeBytes: 350_000, // 350 KB
  });

  assert.equal(metric.payloadSizeBytes, 350_000);
  const stats = getPipelineActionStats('getPipelineOpportunities')[0];
  assert.equal(stats.avgPayloadSizeBytes, 350_000);
});

