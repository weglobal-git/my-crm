# Phase 2: Baseline Benchmark (Cold & Warm)

## Objective
Establish an indisputable numeric baseline before making any code modifications. Measure the current state using local production build conditions.

## Required Environment & Rules

1. **Local Production Build Only:**
   - Dev mode (`next dev`) adds significant compilation, HMR, and un-optimized bundle overhead.
   - Run:
     ```bash
     npm run build && npm run start
     # or NEXT on port 3003
     PORT=3003 npm run start
     ```

2. **Warm-up Protocol:**
   - Execute 1–2 unmeasured warm-up runs to populate connection pools, JIT compiler caches, and server route modules.
   - Keep cold-start samples separate if cold-start latency is explicitly under evaluation.

3. **Sample Count Requirement:**
   - **Minimum 5 consecutive measured runs.**
   - Never present 1 single run as representative.
   - Record the raw latency array in milliseconds.

4. **Metrics to Capture:**
   - Total Wall Time (ms)
   - p50 (Median) & p95
   - Network Request Count
   - Encoded Transfer Bytes (HTML + payload data)
   - Dominant sub-span breakdown (e.g. Neon SQL time vs Prisma overhead vs Network)

## Exit Gate 2 (Must Pass to Unlock Phase 3)
Record the baseline metrics into the session state machine:

```bash
node .agents/skills/trace-performance-bottleneck/scripts/perf-chain.mjs record baseline \
  --runs <run1,run2,run3,run4,run5> \
  --bytes <totalTransferBytes> \
  --requests <totalRequestCount>

node .agents/skills/trace-performance-bottleneck/scripts/perf-chain.mjs pass-gate 2 \
  "Baseline measured across 5 runs (p50=<val>ms, p95=<val>ms)"
```

**Check:** Run `node .agents/skills/trace-performance-bottleneck/scripts/perf-chain.mjs status` to ensure baseline metrics are saved.

## Stop Condition
DO NOT jump to editing code or applying optimizations. Proceed to `phases/phase-3-causality.md` to prove the bottleneck causally.
