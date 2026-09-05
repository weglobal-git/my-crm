---
name: trace-performance-bottleneck
description: Find the real end-to-end bottleneck of a slow web action by reproducing it, correlating browser, Server Action, Prisma/Neon, and external-service timings, fixing the measured cause, and benchmarking before/after. Use for slow interactions, performance regressions, unexplained latency, or requests for a timing breakdown.
---

# Trace Performance Bottleneck

Measure before changing code. The deliverable is a correlated trace and a before/after benchmark, not a list of plausible optimizations.

## Required workflow

1. Define one action and one observable completion signal.
2. Build a repeatable red-capable reproduction. Record environment, dataset, cache state, and concurrency.
3. Establish a baseline with warm-up runs followed by at least 5 measured runs. Report median and p95; never present one run as representative.
4. Assign one `traceId` at interaction start and propagate it through every layer.
5. Measure browser input-to-optimistic-paint, request/response, React commit, Server Action, database, and external calls.
6. Rank frontend versus backend from evidence, then drill into the dominant side only.
7. Instrument boundaries with monotonic clocks. Do not scatter uncorrelated `console.log` calls.
8. Identify the largest causal span by wall time and verify it with a falsifiable experiment.
9. Fix only the measured bottleneck. Preserve correctness, authorization, rollback, and server-authoritative state.
10. Repeat the same benchmark under the same conditions and report before/after, delta, p50, and p95.
11. Remove temporary instrumentation unless the user asks to retain production-safe telemetry.

For the detailed procedure and stopping conditions, read [references/workflow.md](references/workflow.md).

When profiling this CRM's Pipeline page, EditDealPanel, or a similar Next.js + Prisma/Neon + Pusher interaction, read [references/pipeline-case-study.md](references/pipeline-case-study.md). It records measured bottlenecks, failed hypotheses, cache pitfalls, and fixes from two completed investigations.

For real-world CRM performance problem logs and verified solutions collected across modules, consult the [problem-cases/](problem-cases/README.md) registry. Every agent encountering a newly solved bottleneck should document their case using [problem-cases/TEMPLATE.md](problem-cases/TEMPLATE.md).

## Measurement rules

- Use `performance.now()` in browser and Node; use database-reported execution time for SQL.
- A duration is valid only when start/end use the same clock. Never subtract browser time from server time.
- Correlate clocks with `traceId`, not timestamps.
- Separate wall time, CPU time, query execution, connection wait, serialization, and network transfer.
- Measure cold and warm paths separately.
- Do not label a span as the bottleneck solely because it is the largest child; confirm that reducing or bypassing it reduces total latency.
- If spans overlap, report the overlap. Do not sum parallel spans as though they were sequential.
- If trace coverage is below 90% of total wall time, report `INCOMPLETE TRACE` and instrument the missing interval before recommending a fix.
- Never log secrets, cookies, tokens, full request bodies, personal data, or connection strings. Use IDs only when safe; otherwise hash or redact them.

Read [references/instrumentation.md](references/instrumentation.md) before adding probes. It contains browser, Server Action, Prisma/Neon, and Pusher patterns.

## Mandatory report

Every completed investigation must include the action/completion signal, environment/cache/dataset/sample count/coverage, baseline and post-fix p50/p95, one representative timing tree, transferred bytes/request count, causal evidence, code change, correctness checks, regression test, and remaining uncertainty.

Use [references/report-format.md](references/report-format.md) exactly. Generate the timing tree with:

```bash
node .agents/skills/trace-performance-bottleneck/scripts/render-trace.mjs trace.json
```

The script rejects inconsistent totals instead of producing false precision.

## Completion gate

Do not call the work complete unless the original action was reproduced, trace coverage is sufficient or explicitly incomplete, the bottleneck was causally verified, the same benchmark improves after the fix, database/client state remains consistent, and temporary probes/test data are removed.
