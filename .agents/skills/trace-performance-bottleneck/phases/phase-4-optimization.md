# Phase 4: Targeted & Surgical Optimization

## Objective
Implement the minimal, evidence-backed code modification that resolves the proven bottleneck from Phase 3. **Never apply speculative optimizations or drive-by refactoring.**

## Non-Negotiable Correctness Rules

1. **Never Trade Security for Speed:**
   - Department permissions, NextAuth sessions, and row-level ownership checks MUST remain fully intact.
2. **Preserve Server-Authoritative State:**
   - Optimistic UI updates must always be paired with server validation and an automatic rollback mechanism on failure.
3. **No Drive-by Refactoring:**
   - Touch only the files identified in the causal trace.

## High-Leverage Optimization Patterns

1. **Selective Column Projection (Eliminate Over-fetching):**
   - Replace open `include: true` with strict `select: { id: true, name: true, ... }`.
   - Never load large JSON blobs or multi-relation arrays unless rendered in the immediate viewport.

2. **Waterfall Elimination (Parallelization):**
   - If queries A and B are independent, run them via `Promise.all([queryA, queryB])`.
   - In Server Components, avoid waiting for secondary detail data if it can be streamed via React Suspense or requested on demand.

3. **Query Consolidation:**
   - If multiple `prisma.count()` queries scan the same table with different filters, consolidate or compute from grouped indexes.

4. **Optimistic UI with Instant Monotonic Paint:**
   - For mutations (status toggles, star ratings, inline edits), commit local state in $<16\text{ms}$ before firing the Server Action in the background.

## Exit Gate 4 (Must Pass to Unlock Phase 5)
1. Verify the project builds cleanly in production mode:
   ```bash
   npm run build
   ```
2. Manually test the interaction to ensure functional correctness, data integrity, and error handling.
3. Pass the gate:
   ```bash
   node .agents/skills/trace-performance-bottleneck/scripts/perf-chain.mjs pass-gate 4 "Optimizations compiled cleanly and functional checks verified"
   ```

## Stop Condition
Proceed directly to `phases/phase-5-verification.md` to benchmark the fix under identical conditions.
