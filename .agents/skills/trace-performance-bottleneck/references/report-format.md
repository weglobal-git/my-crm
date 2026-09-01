# Mandatory performance report

```text
Action: <name>
Completion signal: <optimistic | durable | remote paint>
Environment: <local production build | preview | production>, <region>
Cache: <cold | warm>
Dataset: <relevant counts/payload size>
Samples: <n> measured after <n> warm-ups
Trace coverage: <covered ms / total ms = percent>

Baseline total: p50 <ms> | p95 <ms>
After fix total: p50 <ms> | p95 <ms>
Improvement: <absolute ms> (<percent>)
Network transfer: <encoded bytes>, <request count> requests

Representative median trace
Total                         5,820 ms
├─ Client optimistic paint       4 ms
├─ Request/network              95 ms
├─ Server Action             5,610 ms
│  ├─ Auth                      82 ms
│  ├─ Prisma read              105 ms
│  ├─ Prisma write             143 ms
│  ├─ Pusher                 5,201 ms  ← BOTTLENECK
│  └─ Other                     79 ms
├─ React reconciliation         31 ms
└─ Uninstrumented               80 ms

Bottleneck: <span>
Evidence: <measurement>
Causal test: <predicted and observed result>
Fix: <smallest evidence-supported change>
Correctness checks: <DB, rollback, remote client>
Regression test: <command and result>
Remaining uncertainty: <explicit gaps>
```

Rules: report p50/p95 from raw samples; `Other` is measured server self-time; `Uninstrumented` uses the union of covered wall-time intervals; label parallel spans; mark `BOTTLENECK` only after causal verification; mark `INCOMPLETE TRACE` below 90% coverage.

