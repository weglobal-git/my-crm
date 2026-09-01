#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const path = process.argv[2];
if (!path) throw new Error('Usage: node render-trace.mjs <trace.json>');
const trace = JSON.parse(await readFile(path, 'utf8'));
for (const key of ['action', 'totalMs', 'clientOptimisticMs', 'networkMs', 'reactMs', 'server']) {
  if (trace[key] === undefined) throw new Error(`Missing required field: ${key}`);
}
if (!Array.isArray(trace.server.spans)) throw new Error('server.spans must be an array');

const duration = value => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid duration: ${value}`);
  return value;
};
const total = duration(trace.totalMs);
const serverTotal = duration(trace.server.totalMs);
const spans = trace.server.spans.map(span => ({ ...span, durationMs: duration(span.durationMs) }));
const childTotal = spans.reduce((sum, span) => sum + span.durationMs, 0);
if (!trace.server.parallel && childTotal > serverTotal + 1) {
  throw new Error(`Server child spans (${childTotal} ms) exceed server total (${serverTotal} ms)`);
}

const covered = duration(trace.clientOptimisticMs) + duration(trace.networkMs) + serverTotal + duration(trace.reactMs);
const uninstrumented = Math.max(0, total - covered);
const coverage = total ? Math.min(100, covered / total * 100) : 100;
const other = trace.server.parallel ? null : Math.max(0, serverTotal - childTotal);
const candidates = [...spans, ...(other === null ? [] : [{ name: 'Other', durationMs: other }])];
const candidate = candidates.sort((a, b) => b.durationMs - a.durationMs)[0];
const verified = trace.verifiedBottleneck === candidate?.name;
const ms = value => `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ms`;

if (coverage < 90) console.log('INCOMPLETE TRACE');
console.log(`Action: ${trace.action}`);
console.log(`Trace coverage: ${coverage.toFixed(1)}%`);
console.log(`Total                         ${ms(total)}`);
console.log(`├─ Client optimistic paint   ${ms(duration(trace.clientOptimisticMs))}`);
console.log(`├─ Request/network           ${ms(duration(trace.networkMs))}`);
console.log(`├─ Server Action             ${ms(serverTotal)}`);
spans.forEach((span, index) => {
  const last = index === spans.length - 1 && other === null;
  const marker = verified && span.name === candidate?.name ? '  ← BOTTLENECK' : '';
  console.log(`│  ${last ? '└' : '├'}─ ${span.name.padEnd(24)} ${ms(span.durationMs)}${marker}`);
});
if (other !== null) {
  const marker = verified && candidate?.name === 'Other' ? '  ← BOTTLENECK' : '';
  console.log(`│  └─ ${'Other'.padEnd(24)} ${ms(other)}${marker}`);
}
console.log(`├─ React reconciliation      ${ms(duration(trace.reactMs))}`);
console.log(`└─ Uninstrumented            ${ms(uninstrumented)}`);
if (!verified && candidate) console.log(`\nCandidate only: ${candidate.name}. Verify causality before labeling it BOTTLENECK.`);
