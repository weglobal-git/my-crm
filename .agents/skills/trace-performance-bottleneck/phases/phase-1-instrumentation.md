# Phase 1: Correlated Instrumentation & Telemetry

## Objective
Inject temporary, non-blocking telemetry probes tagged with `[PERF-TRACE]` across all architectural boundaries for the **single selected Golden Action**. Connect all spans using a single unique `traceId`.

## Boundary Layers & Rules

1. **Monotonic Clocks Only:**
   - Use `performance.now()` in browser and Node.js.
   - Durations are valid **only** when start and end use the same local clock. Never subtract server timestamp from browser timestamp.
   - Correlate layers by passing a string `traceId` (e.g. `trace_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`).

2. **Browser Layer Probe (if UI Interaction):**
   - Measure: `input_start` ➔ `optimistic_paint` ➔ `request_dispatched` ➔ `response_received` ➔ `react_commit` ➔ `completion_signal_paint`.

3. **Server Action / API Layer Probe:**
   - Measure: `action_start` ➔ `auth_verification` ➔ `data_fetching` ➔ `serialization` ➔ `action_end`.
   - Log format:
     ```typescript
     console.log(`[PERF-TRACE] [${traceId}] server_action:${actionName} duration=${durationMs.toFixed(2)}ms`);
     ```

4. **Database Layer (Prisma vs Neon PostgreSQL):**
   - **Crucial Separation:** Distinguish Prisma wall time from Neon SQL query execution.
   - Measure query execution time around Prisma calls:
     ```typescript
     const t0 = performance.now();
     const result = await prisma.company.findMany(...);
     const dbDuration = performance.now() - t0;
     console.log(`[PERF-TRACE] [${traceId}] db:company_findMany duration=${dbDuration.toFixed(2)}ms rows=${result.length}`);
     ```

5. **Pusher / Realtime Layer Probe:**
   - Measure time taken by `pusherServer.trigger(...)`.
   - Log duration, channel, and event name.

6. **Trace Coverage Rule:**
   - Sum of accounted sub-spans must be $\ge 90\%$ of total wall time.
   - If coverage $< 90\%$, output `INCOMPLETE TRACE` and instrument the missing gap before proceeding.

## Exit Gate 1 (Must Pass to Unlock Phase 2)
Trigger the action once (e.g. via curl or test click):
1. Confirm logs print `[PERF-TRACE] [<traceId>]` across Browser, Server, and DB.
2. Confirm no syntax errors or unhandled promise rejections.
3. Pass the gate:
   ```bash
   node .agents/skills/trace-performance-bottleneck/scripts/perf-chain.mjs pass-gate 1 "Probes active and verified with >=90% trace coverage"
   ```

## Stop Condition
Do not optimize any queries or code. Proceed to `phases/phase-2-baseline.md`.
