/**
 * Low-cardinality, privacy-safe telemetry for Pipeline server actions and read paths.
 * Strictly forbids recording deal topics, customer names, emails, search queries, or tokens.
 */

export type PipelineActionName =
  | 'getPipelineOpportunities'
  | 'getCompletedOpportunitiesCursor'
  | 'togglePinOpportunity'
  | 'updateOpportunityHotNote'
  | 'moveOpportunity'
  | 'addActivityLog'
  | 'getLeaderboardWinnerSummary'
  | 'getDashboardLeaderboard';

export type PipelineActorRole = 'ADMIN' | 'MANAGEMENT' | 'GENERAL' | 'UNKNOWN';

export interface PipelineActionMetricInput {
  action: PipelineActionName;
  role?: string | null;
  status: 'SUCCESS' | 'ERROR';
  durationMs: number;
  dbDurationMs?: number;
  payloadSizeBytes?: number;
}

export interface PipelineActionMetric {
  action: PipelineActionName;
  role: PipelineActorRole;
  status: 'SUCCESS' | 'ERROR';
  durationMs: number;
  dbDurationMs?: number;
  payloadSizeBytes?: number;
  isCold: boolean;
  timestamp: number;
}

export interface ActionSummaryStats {
  action: PipelineActionName;
  totalCount: number;
  errorCount: number;
  errorRate: number;
  p50DurationMs: number;
  p95DurationMs: number;
  avgDurationMs: number;
  avgDbDurationMs?: number;
  avgPayloadSizeBytes?: number;
  coldCount: number;
  warmCount: number;
}

// Track module-level warm-up state
let requestCount = 0;
const MAX_METRIC_HISTORY = 1000;
const metricBuffer: PipelineActionMetric[] = [];

/**
 * Normalizes role to low-cardinality enum values to prevent cardinality explosion.
 */
export function normalizeRole(role?: string | null): PipelineActorRole {
  if (role === 'ADMIN' || role === 'MANAGEMENT' || role === 'GENERAL') {
    return role;
  }
  return 'UNKNOWN';
}

/**
 * Records a pipeline action metric in a bounded ring buffer.
 * Rejects high-cardinality payloads and logs slow actions safely.
 */
export function recordPipelineActionMetric(input: PipelineActionMetricInput): PipelineActionMetric {
  requestCount += 1;
  const isCold = requestCount <= 3;

  const metric: PipelineActionMetric = {
    action: input.action,
    role: normalizeRole(input.role),
    status: input.status,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    dbDurationMs: input.dbDurationMs !== undefined ? Math.max(0, Math.round(input.dbDurationMs)) : undefined,
    payloadSizeBytes: input.payloadSizeBytes !== undefined ? Math.max(0, Math.round(input.payloadSizeBytes)) : undefined,
    isCold,
    timestamp: Date.now(),
  };

  metricBuffer.push(metric);
  if (metricBuffer.length > MAX_METRIC_HISTORY) {
    metricBuffer.shift();
  }

  // Structured alert for slow actions (p95 budget violation threshold: 1000ms)
  if (metric.durationMs > 1000) {
    console.warn('[PIPELINE-PERF] Slow action detected', {
      action: metric.action,
      role: metric.role,
      status: metric.status,
      durationMs: metric.durationMs,
      dbDurationMs: metric.dbDurationMs,
      isCold: metric.isCold,
    });
  }

  // Structured alert for oversized payload (Phase P3 budget threshold: 1.5MB)
  if (metric.payloadSizeBytes && metric.payloadSizeBytes > 1_500_000) {
    console.warn('[PIPELINE-PERF] Oversized payload detected', {
      action: metric.action,
      role: metric.role,
      payloadSizeBytes: metric.payloadSizeBytes,
      thresholdBytes: 1_500_000,
    });
  }

  return metric;
}

/**
 * Calculates percentile from a sorted array of numbers.
 */
function calculatePercentile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

/**
 * Generates aggregated summary statistics grouped by action.
 */
export function getPipelineActionStats(actionFilter?: PipelineActionName): ActionSummaryStats[] {
  const filtered = actionFilter
    ? metricBuffer.filter((m) => m.action === actionFilter)
    : metricBuffer;

  const grouped = new Map<PipelineActionName, PipelineActionMetric[]>();
  for (const m of filtered) {
    const list = grouped.get(m.action) || [];
    list.push(m);
    grouped.set(m.action, list);
  }

  const results: ActionSummaryStats[] = [];

  for (const [action, metrics] of grouped.entries()) {
    const totalCount = metrics.length;
    const errorCount = metrics.filter((m) => m.status === 'ERROR').length;
    const coldCount = metrics.filter((m) => m.isCold).length;
    const warmCount = totalCount - coldCount;

    const durations = metrics.map((m) => m.durationMs).sort((a, b) => a - b);
    const sumDuration = durations.reduce((acc, d) => acc + d, 0);

    const dbDurations = metrics
      .map((m) => m.dbDurationMs)
      .filter((d): d is number => d !== undefined)
      .sort((a, b) => a - b);
    const sumDbDuration = dbDurations.reduce((acc, d) => acc + d, 0);

    const payloads = metrics
      .map((m) => m.payloadSizeBytes)
      .filter((p): p is number => p !== undefined);
    const sumPayload = payloads.reduce((acc, p) => acc + p, 0);

    results.push({
      action,
      totalCount,
      errorCount,
      errorRate: totalCount > 0 ? Number((errorCount / totalCount).toFixed(4)) : 0,
      p50DurationMs: calculatePercentile(durations, 50),
      p95DurationMs: calculatePercentile(durations, 95),
      avgDurationMs: totalCount > 0 ? Math.round(sumDuration / totalCount) : 0,
      avgDbDurationMs: dbDurations.length > 0 ? Math.round(sumDbDuration / dbDurations.length) : undefined,
      avgPayloadSizeBytes: payloads.length > 0 ? Math.round(sumPayload / payloads.length) : undefined,
      coldCount,
      warmCount,
    });
  }

  return results;
}

/**
 * Clears in-memory buffer (primarily for unit tests).
 */
export function resetPipelineActionMetricsForTest(): void {
  metricBuffer.length = 0;
  requestCount = 0;
}
