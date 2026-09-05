# Phase 5: Post-Fix Benchmark & Telemetry Cleanup

## Objective
Verify that the fix actually made the system faster under identical benchmark conditions, confirm no regressions, and remove all temporary instrumentation.

## Post-Fix Benchmark Protocol

1. **Re-run on Local Production Build:**
   - Ensure the server is running the newly built code:
     ```bash
     npm run build && PORT=3003 npm run start
     ```
2. **Warm-up:**
   - Execute 1–2 warm-up runs.
3. **Measure 5 Consecutive Runs:**
   - Record the exact same metric as Phase 2.
   - Record post-fix numbers via CLI:
     ```bash
     node .agents/skills/trace-performance-bottleneck/scripts/perf-chain.mjs record postfix \
       --runs <run1,run2,run3,run4,run5> \
       --bytes <totalTransferBytes> \
       --requests <totalRequestCount>
     ```

## Telemetry Cleanup (Mandatory)

1. Search for all temporary instrumentation across the project:
   ```bash
   git grep "\[PERF-TRACE\]"
   ```
2. Remove every probe, timing variable, and temporary log added during Phase 1.
3. Confirm with `git diff` that only the intentional optimization remains.

## Exit Gate 5 (Final Completion)
Pass the final exit gate:

```bash
node .agents/skills/trace-performance-bottleneck/scripts/perf-chain.mjs pass-gate 5 \
  "Post-fix benchmark confirmed improvement; all [PERF-TRACE] probes removed"
```

## Mandatory Final Report Format
Present the results to the user following this exact structure:

```markdown
# Performance Optimization Report: [<Target Action>]

### 1. Executive Summary
- Action: <Action ID & Name>
- Observable Completion Signal: <Signal>
- Latency p50: <Baseline p50> ms ➔ <PostFix p50> ms (Δ <delta> ms / -<pct>%)
- Latency p95: <Baseline p95> ms ➔ <PostFix p95> ms (Δ <delta> ms / -<pct>%)
- Network Requests: <Baseline Req> ➔ <PostFix Req>
- Transfer Bytes: <Baseline Bytes> B ➔ <PostFix Bytes> B (-<pct>%)

### 2. Causal Root Cause
<Brief explanation of the measured bottleneck span verified in Phase 3>

### 3. Code Modifications Applied
<Summary of file diffs: selective query, parallelization, or optimistic state>

### 4. Correctness & Security Verification
- [x] Authorization & Department permissions preserved
- [x] Database consistency & rollback verified
- [x] All temporary [PERF-TRACE] probes removed
```
