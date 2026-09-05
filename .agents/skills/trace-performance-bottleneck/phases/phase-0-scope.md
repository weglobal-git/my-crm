# Phase 0: Scope Down & Golden Slice Selection

## Objective
Survey the target page to understand the architecture, then **strictly reduce the scope** to **1 primary load-bearing action** (and at most 1 secondary interaction). Never attempt to optimize an entire page with 50+ actions at once.

## Required Procedure

1. **Surface Inventory (Mental Map)**:
   - Identify all interactive elements on the target URL (page load, table rows, search inputs, filters, buttons, drawers).
   - Trace the component tree to identify Server Actions, Prisma queries, SWR hooks, and Pusher events.

2. **The 80/20 Golden Path Selection**:
   Filter down to the single action that causes 80–90% of user-perceived waiting time:
   - **First Impression (Page Load):** If initial visit / SSR feels sluggish, choose `Initial Page Load (SSR ➔ Interactive Ready)`.
   - **Daily Critical Interaction:** If the table/card clicks are slow, choose the most frequent master-detail row click.
   - **Mutation with Lag:** If a status change or save button takes noticeable time, choose that specific mutation.

3. **Define the Observable Completion Signal**:
   You must write a one-line contract specifying exactly when the action is finished:
   - Example (Page Load): `DOM element for company cards & table rows is painted and visible on screen.`
   - Example (Row Click): `Detail panel data updates and loading skeleton disappears.`
   - Example (Status Toggle): `Switch toggles to active color (<16ms optimistic) AND server confirmation returns.`

## Exit Gate 0 (Must Pass to Unlock Phase 1)
Run the state controller CLI to initialize the session:

```bash
node .agents/skills/trace-performance-bottleneck/scripts/perf-chain.mjs init \
  "<Target_URL>" \
  "<Action_ID>" \
  "<Action_Name>" \
  "<Observable_Completion_Signal>"
```

**Check:** Run `node .agents/skills/trace-performance-bottleneck/scripts/perf-chain.mjs status` to verify Phase 0 is marked PASSED and Phase 1 is ACTIVE.

## Stop Condition
Do not add instrumentation, do not modify production code, and do not benchmark yet. Proceed to read `phases/phase-1-instrumentation.md`.
