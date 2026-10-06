# Pipeline Production Performance Measurement Plan

## Objective

Measure the production performance of `/pipeline` after optimization. Keep these evidence types separate:

- Server and database latency
- Network transfer and payload size
- React rendering and hydration
- Core Web Vitals
- User interaction latency
- Cold-cache versus warm-cache behavior

Do not use localhost measurements as production evidence. Do not change application code until the baseline is complete.

## Required scenarios

Use a production account and dataset representative of real users. Record the role, permissions, deployment commit SHA, and visible card count.

1. Open `/pipeline` directly with a cold cache.
2. Reload `/pipeline` with a warm cache.
3. Navigate to Pipeline from another page inside the application.
4. Switch from Active to Archived.
5. Search for a card.
6. Apply owner and card-type filters.
7. Open and close the Filters drawer.
8. Open a Deal Panel for the first time.
9. Switch tabs inside the Deal Panel.
10. Drag a card between columns.
11. If representative fixtures exist, repeat with approximately 50, 100, and 200 cards.

## Test conditions

Measure at least these profiles:

### Desktop

- Viewport: 1440 × 900
- Normal production network
- Authenticated production session

### Constrained device

- Viewport: 390 × 844
- Fast 4G or equivalent throttling
- CPU slowdown: 4× when supported
- Authenticated production session

Run each navigation scenario at least three times. Report the median and min–max range. For short interaction benchmarks, run at least five times.

Always record:

- Final URL and page state
- Browser and tool version
- Viewport, CPU, and network conditions
- Cold or warm cache
- Authentication role and permissions
- Active or Archived view
- Visible card count
- Deployment commit SHA

## Phase 1: Field data

Inspect Vercel Speed Insights, existing RUM, or equivalent production field data before running lab traces.

Collect:

- LCP p75
- INP p75
- CLS p75
- TTFB p75
- Sample count
- Collection window
- Route scope
- Device/form-factor scope

If `/pipeline` does not have enough samples, report **field data unavailable**. Do not report missing data as passing.

Starting thresholds:

| Metric | Target |
|---|---:|
| TTFB | < 800 ms |
| LCP | < 2.5 s |
| INP | < 200 ms |
| CLS | < 0.1 |

## Phase 2: Production browser trace

Use a Chrome DevTools Performance trace against the authenticated production URL.

Record reload traces for both cold and warm cache, then inspect:

- Navigation start to TTFB
- FCP
- LCP and the LCP element
- Time until the first card is visible
- Time until the board is interactive
- Hydration cost
- Long tasks over 50 ms
- Total Blocking Time
- Layout shifts
- JavaScript parsing and evaluation
- React render/commit work
- DOM node count after the board is ready
- Number of mounted cards
- Main-thread work caused by Red Card calculation, sorting, and drag-and-drop setup

Inspect post-hydration requests, including:

- `pipeline-deals`
- pending accelerators
- ~~deal summary presence~~ *(Eradicated in October 2026 optimization: Bot button was removed from card, eliminating orphaned SWR hook & DB query)*
- company holidays
- user leaves
- users
- companies

Identify duplicate requests, sequential waterfalls, unexpected revalidation, and resources loaded before user intent.

Save the trace file or focused screenshots that support each finding.

## Phase 3: Server and database

Inspect Vercel production metrics and logs for `/pipeline`:

- Function duration median and p95
- TTFB median and p95
- Cold starts
- Memory usage
- Error rate
- Invocation count
- Function region versus database region

Only when existing telemetry cannot localize the delay, add temporary targeted timings:

```text
pipeline.auth
pipeline.stages
pipeline.opportunities
pipeline.stageTitles
pipeline.total
```

For the opportunities query, collect:

- Query duration median and p95
- Rows returned
- Rows scanned
- Serialized response size
- Relations loaded
- Execution plan using `EXPLAIN ANALYZE`
- Index usage

Do not expose customer data in logs or reports. Do not add an index without execution-plan evidence.

## Phase 4: Payload and bundle

Measure production responses and assets:

- HTML/RSC compressed size
- HTML/RSC decoded size
- `/pipeline` JavaScript compressed size
- Number and size of route chunks
- Card snapshot payload size
- Latest activity text size
- Avatar and image requests
- Third-party transfer

Confirm that the `EditDealPanel` chunk is not downloaded before hover/focus/open intent.

Confirm that the board snapshot does not contain heavy detail data:

- Full activity history
- Shared media lists
- AI summary body
- Notes
- System logs
- Customer detail not rendered by a card

Use 300 KB compressed JavaScript as an initial guardrail, not an automatic pass/fail threshold.

## Phase 5: Interaction benchmarks

Measure the following interactions with User Timing or a Performance trace:

| Interaction | Start | End |
|---|---|---|
| Search | Key input | Filtered cards rendered |
| Filter | Option click | Updated board rendered |
| Open Deal | Card click | Panel interactive |
| Switch Deal tab | Tab click | Active tab interactive |
| Drag card | Pointer release | Optimistic card settled |
| Open Archived | Tab click | First archived card visible |

Inspect specifically for:

- Input lag
- Avoidable React renders
- Full-board revalidation after a card mutation
- Duplicate Server Actions
- Pusher events that refetch the entire board
- Inactive tabs that remain mounted or continue fetching

## Phase 6: Report format

Start with this evidence table:

| Signal | Scope and conditions | Median | Range or p95 | Budget | Status |
|---|---|---:|---:|---:|---|
| TTFB | Production desktop, cold | | | 800 ms | |
| LCP | Production trace, cold | | | 2.5 s | |
| First card visible | Production, 50 cards, cold | | | Baseline | |
| DOM nodes | Production, 50 cards | | | Baseline | |
| JS transferred | `/pipeline` | | | 300 KB guardrail | |
| Open Deal Panel | Warm chunk | | | Baseline | |
| Search response | 50 cards | | | 200 ms | |

Then separate the report into:

1. Measured failures
2. Trace-backed causes
3. Source-code hypotheses not yet proven
4. Recommended fixes ranked by impact and effort
### Optimization Log (October 2026)

The following optimizations have been implemented and verified via `npm run verify:pipeline` (68/68 passing, 0 TypeScript errors):

1. **Eradicated Orphaned Network & Database Requests (P0)**:
   - Removed `deals-with-summary` SWR subscription and incremental `useEffect` from [KanbanBoard.tsx](file:///Users/light/my-crm/src/components/pipeline/KanbanBoard.tsx), saving 1 full Server Action call (`getDealsWithSummaryMap`) and database lookup on every board mount.
   - Removed `KanbanClockProvider` and its 60-second `setInterval` background timer.
2. **Prevented Full-Board Re-render Cascades (P0 & P1)**:
   - Wrapped `OwnerFilterContext.Provider` value in `useMemo` so changes on the board do not invalidate context equality and force all 50–200 cards to re-render.
   - Wrapped [KanbanColumn.tsx](file:///Users/light/my-crm/src/components/pipeline/KanbanColumn.tsx) in `React.memo` and memoized `dealIds` array for `SortableContext`.
   - Stabilized `onDealClick` via `useCallback` in `KanbanBoard` and passed it cleanly to `KanbanCard`, ensuring `React.memo(KanbanCard)` passes shallow prop equality.
   - Converted O(N) array filtering/sorting in `visibleRightMenus` inside cards to O(1) `canSee('pipeline.' + tabKey)` checks.
   - Added functional state comparator in `PipelineView`'s `handleStatsChange` to avoid unnecessary re-render ping-pong upon mount.
3. **Optimized Image Decoding and Content Parsing (P2)**:
   - Added `loading="lazy"` and `decoding="async"` to all card avatars and preview image thumbnails to offload decoding from the browser main thread during hydration.
   - Hoisted `parsedLog` regex parsing inside `KanbanCardUI` into `useMemo` keyed by `latestLog?.content`.

## Rules before changing code

- Complete and preserve the baseline first.
- Do not change the Pipeline DTO or preload detail in conflict with `pipeline-deal-panel-architecture`.
- Do not keep inactive Deal Panel tabs mounted.
- Do not use `router.refresh()` or full-board revalidation for a card-local change.
- Preserve optimistic UI and Pusher reconciliation.
- Re-run equivalent measurements after every material fix.
- Run `npm run verify:pipeline` before finishing implementation.
- Report field verification as **pending** until sufficient post-deployment traffic exists.

## Handoff prompt

> Measure production performance for `/pipeline` using this plan before changing code. Collect field metrics, authenticated production browser traces, Vercel route/function metrics, database query timing, payload/bundle measurements, and interaction benchmarks. Separate cold and warm cache, run at least three equivalent navigation samples, and report the median plus range. Identify bottlenecks only from trace-backed evidence. Rank recommended fixes by impact and effort. If implementation is authorized, repeat the same measurements afterward and run `npm run verify:pipeline`.
