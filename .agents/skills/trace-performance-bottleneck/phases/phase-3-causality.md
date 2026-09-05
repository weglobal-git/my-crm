# Phase 3: Bottleneck Identification & Causal Proof

## Objective
Prove with evidence that the identified slow span is the **true causal bottleneck**, not merely a correlated artifact or harmless parallel task.

## The Causality Trap
A span taking 300ms is NOT automatically the bottleneck if:
- It runs concurrently in the background and does not block the observable completion signal.
- The UI is blocked by an un-profiled client-side React re-render cascade.
- Optimizing it does not reduce total wall time because another sequential bottleneck dominates.

## Falsifiable Experiment Protocol

1. **State the Primary Hypothesis:**
   - *"The 450ms latency of Initial Page Load is caused by 10 sequential Prisma queries in `src/app/contact/page.tsx` running waterfall requests to Neon DB."*

2. **Controlled Experiment (Change 1 Variable Only):**
   - Temporarily bypass or mock ONLY the suspect span:
     - Example: Replace the heavy nested query with a static dummy payload or cached in-memory response.
     - Example: Run independent queries in `Promise.all` instead of sequential `await`.
   - Measure the exact same action:
     - **Verification Criteria:** Did the total wall time decrease by approximately the predicted duration of that span?
     - If **YES** ➔ Causal bottleneck is **CONFIRMED**.
     - If **NO** ➔ Correlation only. Reject hypothesis and profile the remaining unaccounted wall time.

3. **Prisma vs Neon Execution Diagnosis:**
   - If Prisma wall time is high (e.g. 200ms) but database execution is low (e.g. 15ms):
     - Cause is connection acquisition pool wait, query compilation, or massive serialization over-fetching.
     - Solution is column pruning (`select:` instead of `include:`) or connection pool reuse.

## Exit Gate 3 (Must Pass to Unlock Phase 4)
Pass the gate with verified causal evidence:

```bash
node .agents/skills/trace-performance-bottleneck/scripts/perf-chain.mjs pass-gate 3 \
  "Causally confirmed: eliminating <Span_Name> reduces wall time by ~<X>ms"
```

## Stop Condition
Revert the temporary mock/stub. You now have scientific proof of the root cause. Proceed to `phases/phase-4-optimization.md`.
