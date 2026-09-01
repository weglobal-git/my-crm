# Instrumentation patterns

Use `[PERF-TRACE]` and structured JSON. Prefer a reusable span helper over manual log pairs.

## Browser

```ts
const traceId = crypto.randomUUID();
performance.mark(`${traceId}:input`);
setMembers(current => [...current, optimisticMember]);
requestAnimationFrame(() => {
  performance.mark(`${traceId}:optimistic-paint`);
  performance.measure(`${traceId}:optimistic`, `${traceId}:input`, `${traceId}:optimistic-paint`);
});
const started = performance.now();
await inviteMember(dealId, userId, { traceId });
record({ traceId, name: 'Request', durationMs: performance.now() - started });
```

Use `<Profiler onRender={...}>` around the smallest relevant subtree. Confirm final timings in a production build. For bandwidth use encoded response bytes, request count, cache status, and initiator; `decodedBodySize` is not Vercel Network Transfer.

## Server

```ts
import { performance } from 'node:perf_hooks';

async function span<T>(traceId: string, name: string, run: () => Promise<T>) {
  const start = performance.now();
  try { return await run(); }
  finally {
    console.info(JSON.stringify({ tag: '[PERF-TRACE]', traceId, name,
      durationMs: performance.now() - start }));
  }
}
```

Instrument the action with nested calls:

```ts
const actor = await span(traceId, 'Auth', () => requireOpportunityAccess(dealId));
const deal = await span(traceId, 'Prisma read', () => prisma.opportunity.findUnique(options));
const result = await span(traceId, 'Prisma write', () => prisma.opportunity.update(update));
await span(traceId, 'Pusher', () => notifyPrivatePipelineUpdate(dealId, event));
```

Never log action arguments blindly. Log safe IDs/counts/sizes/status/duration. Prisma query events may expose SQL and parameters; prefer a client extension or domain-call wrapper unless a redacted query plan is required.

## Neon/PostgreSQL

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id FROM "Opportunity" WHERE "ownerId" = $1;
```

Record planning/execution time, actual rows/loops, buffer hits/reads, and scan type. Compare database execution to Prisma wall time.

## Pusher/external API

```ts
const payloadBytes = Buffer.byteLength(JSON.stringify(payload));
const started = performance.now();
try {
  await pusher.trigger(channels, eventName, payload);
  record({ traceId, name: 'Pusher', durationMs: performance.now() - started,
    payloadBytes, channels: channels.length, status: 'ok' });
} catch (error) {
  record({ traceId, name: 'Pusher', durationMs: performance.now() - started,
    payloadBytes, channels: channels.length, status: 'error' });
  throw error;
}
```

Prefer OpenTelemetry if the project already has an exporter. Use bounded names/attributes, sampling, and no user text or secrets in metric labels.

