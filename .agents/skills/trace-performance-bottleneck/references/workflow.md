# End-to-end workflow

## Define and reproduce

Write a one-line contract with separate milestones:

```text
Action: Invite Member
Start: pointer/click handler begins
Optimistic complete: invited avatar is painted
Durable complete: server confirms committed membership
Remote complete: another authorized client renders the member
```

Prefer an automated browser test, HTTP replay, integration harness, then a tightly scripted manual flow. Pin the record, role, database region, cache state, and payload size. Use disposable test data and clean it up.

Warm the application before measured runs. Keep cold starts in a separate series. Run at least 5 samples; use 20+ for noisy remote services. Report p50 and p95.

## Measure browser and split the stack

Capture input start, optimistic next paint, request/response, encoded transfer bytes, React commit, WebSocket receipt, and remote-client paint.

Use same-clock boundaries. Never derive server time by subtracting timestamps from different machines. Emit server duration as trace data or `Server-Timing` when supported.

## Trace Server Action and dependencies

Pass a safe `traceId`. Create spans for authorization, validation, Prisma calls, transactions, serialization, revalidation, and external APIs. For Next.js Server Actions where custom response headers are awkward, use structured JSONL keyed by `traceId`, or return profiling metadata only behind a development flag.

For Prisma/Neon distinguish pool acquisition, Prisma overhead, SQL execution, rows scanned/returned, and serialization. Compare Prisma wall time with `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`. Fast SQL plus slow Prisma points to pool/network/serialization. Never run `EXPLAIN ANALYZE` on a production mutation; use a rollback transaction or equivalent read.

Wrap Pusher/storage/email separately. Record duration, status, retry count, payload bytes, channel count, and region. Do not make correctness-critical persistence fire-and-forget to improve a timing number; commit first, publish second, and retain reconciliation/retry.

## Prove causality

Generate 3–5 ranked falsifiable hypotheses. Test one variable at a time. Examples: stub Pusher, replace a query with fixed data, or disable a render subtree. The total must fall by approximately the predicted span; otherwise it was correlation, not the bottleneck.

## Fix, benchmark, cleanup

Apply the smallest evidence-supported fix. Re-run the identical harness and report raw samples, p50, p95, absolute delta, and percentage. Verify DB state, rollback, targeted Pusher, and second-client reconciliation. Remove tagged probes, flags, proxy scripts, traces containing sensitive data, and disposable records.

