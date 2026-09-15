# CRM Overall Speed Improvement Plan

## Document status

- Status: Proposed implementation plan
- Scope: Dashboard, Pipeline, Account/Contact, Calendar, and shared navigation/cache boundaries
- Analysis mode: Fast Mode static audit
- Implementation status: Not started
- Last updated: 2026-09-16
- Primary objective: Improve initial page load, in-app navigation, and interaction responsiveness without combining all CRM modules into one oversized client page.

## Executive decision

Dashboard, Pipeline, Account, and Calendar must remain separate Next.js App Router routes. The application should continue to use a persistent shared shell while each route loads only the code and data needed for the active workspace.

The target architecture is:

```text
Persistent CRM Shell
├── Sidebar / Header / Session / Permissions / shared realtime manager
│
├── /dashboard/overview
│   ├── Critical: visible summary and lightweight filter metadata
│   └── Deferred: map, tracking, annual report, expanded deal rows
│
├── /pipeline
│   ├── Critical: stages and Kanban card DTOs
│   └── Deferred: accelerator badges, summary-presence map, drawer tabs
│
├── /contact
│   ├── Critical: first page of lightweight account cards
│   └── Deferred: account overview, logs, AI, addresses, and media
│
└── /calendar
    ├── Critical: visible 42-day month snapshot
    └── Deferred: event detail, financial detail, and adjacent months
```

Combining all modules into one client page is explicitly rejected because it would couple their JavaScript, DOM, state, queries, permissions, and realtime subscriptions. It would likely increase cold-load and hydration costs, especially on mobile devices. Shared data must instead be reused through scoped cache keys and stable providers.

## Guiding constraints

1. Preserve server-side authorization, department permissions, and contact masking.
2. Do not move data from SSR to CSR merely to reduce HTML size. Compare total workflow transfer and first usable content before selecting the boundary.
3. Keep inactive views unmounted and avoid loading their data, subscriptions, or optional JavaScript.
4. Use lightweight list/card DTOs. Detail, history, AI content, and media remain on-demand.
5. Cache keys must include the relevant actor/tenant scope and resource dimensions.
6. Realtime and mutation recovery must target affected resources rather than globally revalidating the application.
7. Pusher is a delivery accelerator, not the source of truth. Neon remains authoritative.
8. Do not add database indexes without query-plan or timing evidence.
9. Do not claim performance improvements without before/after measurements in equivalent production scenarios.
10. Pipeline changes must preserve its existing tab isolation, draft retention, operation-based mutations, and on-demand detail loading.
11. Every implementation slice must be independently verifiable and reversible.

## Current observed architecture

### Shared shell

`src/app/layout.tsx` mounts `SessionProvider`, `DialogProvider`, and `ClientShell` around route content. `ClientShell` owns the persistent Sidebar, Header, permission provider, sidebar context, and Pusher connection hygiene. This already supplies the correct foundation for fast client-side transitions without merging feature routes.

### Navigation

The Sidebar uses Next.js `Link`, but primary and system menu links currently set `prefetch={false}`. Keyboard/search navigation uses `router.push`. This prevents normal route prefetching and can make transitions wait until after the user clicks.

### Dashboard

The Dashboard Server Component waits for `getDashboardSalesSnapshot()` before returning its view. The snapshot includes multiple resource families. Client SWR hooks then expose summary, tracking, annual, map, and filter resources separately. Several actions currently call the full snapshot function even when only one resource is requested.

### Pipeline

The Pipeline Server Component loads stages, card DTOs, and stage-title context concurrently. After the opportunity list resolves, it also waits for pending-accelerator and deal-summary maps. Both `PipelineView` and `KanbanBoard` subscribe to the same deals SWR key. SWR may deduplicate transport, but ownership and derived computation are duplicated.

### Account/Contact

The Contact route loads a bounded first page of 20 account cards plus stats, types, and countries. Optional edit/create panels are dynamically imported. The initial SWR list uses server fallback data but does not explicitly suppress mount revalidation for the initial key.

### Calendar

The Calendar route loads an authoritative 42-day month snapshot and dynamically imports detail/filter/search panels. The initial SWR month uses server fallback data but does not explicitly suppress mount revalidation for the initial key. Its query already uses bounded date ranges and lean `select` projections.

## Performance measurement contract

No architectural phase beyond low-risk navigation or duplicate-fetch fixes should be declared successful without a reproducible measurement.

### Standard scenarios

Use the same authenticated actor and permission set for every comparison:

1. `/dashboard/overview` with the same month, year, country, and account filters.
2. `/pipeline?tab=workspace` with no search query.
3. `/contact` with `QUALIFIED`, all types, all countries, and no search.
4. `/calendar` for the current Bangkok-local month.

Test each scenario in two conditions:

- Cold: empty browser cache and no prefetched route/data.
- Warm: application shell already mounted and normal route/cache prefetching allowed.

### Metrics

Record at minimum:

- Document and React Server Component transferred bytes.
- Decoded JSON or Server Action response size.
- Route JavaScript transferred and parsed size.
- Request count from navigation start through settled initial UI.
- Duplicate requests after hydration.
- TTFB, FCP, and LCP.
- Time from menu activation to visible route feedback.
- Time from menu activation to usable primary content.
- Relevant Server Action durations.
- Prisma query count, returned row count, and duration.
- Long tasks and interaction latency for Kanban drag, search, filter changes, and calendar drag.

### Evidence classification

- Observed: captured directly from the current production build or query instrumentation.
- Inferred: supported by source flow but not yet measured at runtime.
- Assumed: input required to prepare a test; must not be presented as a result.

## Phase 0 — Establish the baseline and locate the dominant layer

### Objective

Determine whether each slow route is primarily blocked by database work, server rendering, payload transfer, hydration, JavaScript evaluation, DOM rendering, or missing navigation prefetch.

### Work

1. Produce a local production build using the repository's actual build command.
2. Run each standard scenario once cold and once warm.
3. Capture browser Network and Performance evidence.
4. Capture server-action and existing query timing output.
5. Record route-specific findings in this document under `Implementation checkpoints`.
6. Identify the first bottleneck whose removal is expected to change the next implementation decision.

### Decision gates

- If a suspected duplicate hydration request does not occur, remove that fix from scope.
- If database time dominates, optimize the query before changing rendering boundaries.
- If transfer/serialization dominates, reduce the DTO or defer the resource.
- If JavaScript/DOM dominates, use code splitting or bounded rendering rather than database changes.
- If route feedback is the main complaint and data work is acceptable, prioritize navigation prefetch and loading UI.

### Check

A baseline table exists for all four routes, and every proposed optimization names the observed metric it is intended to improve.

## Phase 1 — Restore bounded route prefetch and instant navigation feedback

### Files likely to change

- `src/components/layout/Sidebar.tsx`
- Existing route loading files:
  - `src/app/dashboard/overview/loading.tsx`
  - `src/app/pipeline/loading.tsx`
  - `src/app/contact/loading.tsx`
  - `src/app/calendar/loading.tsx`
- Optional new helper only if multiple navigation surfaces need the same policy:
  - `src/lib/navigation/crm-prefetch-policy.ts`

### Responsibilities

1. Remove unconditional `prefetch={false}` from eligible menu links, or replace it with an explicit bounded policy.
2. For expensive dynamic routes, allow route prefetch on pointer intent or keyboard focus.
3. Ensure search-modal navigation can call `router.prefetch(href)` on selection intent when useful.
4. Do not prefetch business datasets for every visible navigation item.
5. Keep loading shells dimensionally close to their final views to minimize CLS.
6. Preserve the root shell and client-side navigation. Do not introduce full-page anchors for internal CRM routes.

### Proposed policy

| Route | Route shell prefetch | Business-data prefetch |
|---|---|---|
| Dashboard | Viewport or intent, subject to measured server cost | No full aggregation prefetch |
| Pipeline | Intent-based if automatic prefetch is too costly | No opportunity-list prefetch |
| Contact | Intent-based | No account-list prefetch |
| Calendar | Intent-based | No month-snapshot prefetch |

### Risks

- Dynamic route prefetch can increase server work when many permitted menu links are visible.
- Loading UI that does not reserve realistic dimensions can worsen CLS.
- Manual `router.push` paths may bypass the intent behavior supplied by `Link` unless explicitly handled.

### Check

- Menu activation produces immediate visual route feedback.
- Navigation does not reload the document.
- Sidebar and Header remain mounted.
- No route business-data request occurs for a page the user never intends to open.
- Warm navigation metrics improve without an unacceptable rise in background requests.

## Phase 2 — Eliminate initial SWR revalidation duplicates

### 2.1 Dashboard

Files:

- `src/components/dashboard/useDashboardData.ts`
- Existing dashboard cache-key tests and data tests

Implementation:

1. Determine freshness independently for summary, tracking, annual, map, and filter options.
2. Set `revalidateOnMount: false` only when the current SWR key exactly matches provided initial data.
3. Leave revalidation enabled when filters produce a new key with no fallback.
4. Preserve explicit refresh and realtime-triggered revalidation.
5. Prefer a pure helper for initial-key matching if it provides a meaningful regression-test boundary.

Check:

- Initial route hydration does not call a matching Server Action again.
- Changing month, year, country, or account fetches the new key once.
- Manual refresh and relevant realtime invalidation still fetch authoritative data.

### 2.2 Account/Contact

Files:

- `src/components/contact/ContactView.tsx`
- `src/lib/contact/account-cache-keys.ts`
- `src/lib/contact/account-cards.test.ts`

Implementation:

1. Suppress mount revalidation only for the initial `QUALIFIED / ALL / ALL / empty search` key when fallback data is present.
2. Fetch normally for every new filter/search key.
3. Preserve pagination and deduplication of appended records.
4. Preserve contact recovery events and targeted realtime updates.

Check:

- The first-page list is requested once during initial navigation.
- Changing a filter requests the new list.
- Page 2 still loads and appends without duplicates.
- Reconnect and relevant realtime events can still recover the active resource.

### 2.3 Calendar

Files:

- `src/components/calendar/CalendarView.tsx`
- `src/lib/calendar/calendar-cache.ts`
- Relevant calendar cache/realtime/month tests

Implementation:

1. Suppress mount revalidation only for the initial year/month key when the server snapshot is present.
2. Fetch any uncached month normally.
3. Preserve revision-aware merging so a stale response cannot overwrite a newer optimistic move.
4. Preserve targeted recovery for active calendar keys.

Check:

- The initial month snapshot is requested once.
- An uncached adjacent month is requested once.
- Realtime and reconnect recovery remain functional.
- A stale month response cannot regress a locally newer revision.

### Phase verification

- `npx tsc --noEmit`
- `npm run test:contact`
- `npm run test:calendar`
- Dashboard data, key, realtime, and parity tests relevant to the touched logic
- Browser Network comparison for all affected routes

## Phase 3 — Split Dashboard data into real resource-specific queries

### Objective

Stop calculating and transferring a complete Dashboard snapshot when the caller needs only one resource.

### Files likely to change

- `src/app/dashboard/overview/page.tsx`
- `src/lib/actions/dashboard.ts`
- `src/lib/dashboard/dashboard-data.ts`
- `src/lib/dashboard/sales-overview.ts`
- `src/lib/dashboard/dashboard-keys.ts`
- `src/components/dashboard/useDashboardData.ts`
- `src/components/dashboard/DashboardOverviewView.tsx`
- Relevant files under `src/lib/dashboard/*.test.ts`
- Optional new modules:
  - `src/lib/dashboard/dashboard-queries.ts`
  - `src/lib/dashboard/dashboard-dto.ts`

### Target query boundaries

#### `getDashboardSummary`

- Read only the selected month/year range required by the visible summary.
- Return monetary totals, counts, and a bounded preview.
- Do not include every deal in the initial summary payload.
- Full deal rows remain available through the existing on-demand account/deal action.

#### `getDashboardTracking`

- Read target data for the selected year and authorized account scope.
- Return only the fields rendered by the tracking grid.
- Avoid reconstructing map and annual-report data.

#### `getDashboardAnnual`

- Read only the year window displayed by the annual report.
- Aggregate by company/year/currency on the server or database as supported by correctness requirements.
- Do not fetch all-time opportunities merely to render five years.

#### `getDashboardMapSummary`

- Produce country-level aggregates for the requested period.
- Do not return raw opportunities to the browser.
- Keep country normalization behavior identical to the existing snapshot.

#### `getDashboardFilterOptions`

- Return lightweight authorized country/account options.
- Cache independently from month/year data when permission scope permits.
- Do not generate all other Dashboard resources as a side effect.

### Initial rendering boundary

1. Server validates session, menu permissions, and Dashboard section access.
2. Server loads only above-the-fold summary plus genuinely lightweight filter metadata.
3. The shell and summary render first.
4. Tracking, Annual, and World Map fetch concurrently through independent SWR resources.
5. A non-active tab must not trigger its optional resource unless its visible UI requires it.
6. Expanded deal rows load on interaction, not in the summary DTO.

### Authorization contract

- Every server query must derive the actor from the authenticated session or a trusted server-only override used within the same request.
- Client-provided actor IDs, roles, departments, or scope tokens are never authorization evidence.
- Cache keys may encode scope for separation, but server checks remain authoritative.

### Cache and realtime contract

- Keys include actor scope and all query-shaping filters.
- Summary, tracking, annual, map, and filter-option caches remain separate.
- Dashboard realtime events invalidate only affected visible resources.
- A mutation response should patch a safe resource directly when possible; otherwise target only the affected keys.
- Do not globally clear SWR caches.

### Migration sequence

1. Add resource-specific query functions with parity tests against the current pure aggregation behavior.
2. Move one action at a time to its specific query.
3. Confirm the action no longer calls `getDashboardSalesSnapshot()`.
4. Change the initial page contract to summary-first rendering.
5. Remove dead full-snapshot paths only after all callers are swept.
6. Keep the current implementation available until parity and permission tests pass, making rollback straightforward.

### Risks

- Splitting one shared query into several unbounded queries could increase database work.
- Currency grouping and country normalization can produce silent aggregation drift.
- Filtering by country/account must match all existing views.
- Deferred sections require stable skeleton dimensions.

### Check

- No resource-specific Dashboard action calls the full snapshot function.
- Parity tests cover monthly, yearly, annual, tracking, map, filters, currency groups, and empty states.
- Admin, Management, and General scopes return the same authorized values as before.
- Initial route rendering does not wait for deferred sections.
- Query count, query duration, RSC bytes, and Server Action bytes are lower than or justified against the baseline.

## Phase 4 — Remove secondary Pipeline data from the blocking path

### Files likely to change

- `src/app/pipeline/page.tsx`
- `src/components/pipeline/KanbanBoard.tsx`
- `src/components/pipeline/PipelineView.tsx`
- `src/lib/actions/ai-accelerator.ts`
- `src/lib/actions/deal-summary.ts`
- Pipeline cache/synchronization tests

### Critical resource definition

The board may block only on:

- Authenticated Pipeline actor and permissions.
- Ordered stages.
- Stage-title context required to label columns.
- Lightweight Kanban card DTOs required to render visible cards.

The following should be treated as secondary unless measurement proves they are required for first usable content:

- Pending accelerator badge map.
- Deal-summary presence map.
- Drawer/tab details.

### Implementation

1. Remove pending-accelerator and summary-presence queries from the page's post-card blocking chain.
2. Render the board with empty/unknown secondary maps.
3. Let the existing SWR resources fetch these maps after the board becomes usable.
4. Reserve badge/icon space so late data does not shift card layout.
5. Fetch only missing deal IDs when the board grows or pages append.
6. Preserve operation-based cache merging and zero-count key cleanup.
7. Do not preload AI summaries, activity logs, notes, or media.

### SSR-versus-CSR decision gate for the card list

Do not remove the SSR card snapshot by default. Measure payload growth at representative active-card counts.

- Keep SSR if the DTO is bounded, query time is acceptable, and it materially improves first usable board time.
- Prefer a lightweight shell plus client fetch, cursor pagination, or per-column pagination if the payload grows without a safe bound.
- Consider virtualization only when profiling proves DOM/render cost is material.
- Any pagination or virtualization must preserve global search, counts, keyboard access, and drag-and-drop semantics.

### Check

- The board becomes usable without waiting for badge and summary maps.
- Secondary indicators arrive correctly without incorrect flashes or layout shift.
- Moving, editing, creating, deleting, and realtime reconciliation remain correct.
- No high-frequency Pipeline action introduces `revalidatePath('/pipeline')`.
- `npm run verify:pipeline` passes.

## Phase 5 — Consolidate Pipeline deals ownership if profiling justifies it

### Problem

`PipelineView` and `KanbanBoard` currently subscribe to the same SWR deal key. Transport may be deduplicated, but data ownership and derived work are split across two components.

### Files likely to change

- `src/components/pipeline/PipelineView.tsx`
- `src/components/pipeline/KanbanBoard.tsx`
- Optional production hook: `src/lib/hooks/usePipelineDeals.ts`
- All callers and tests that depend on Pipeline mutation/cache behavior

### Decision gate

Only proceed if React profiling or render counts show material duplicated work, unstable props, or synchronization complexity. Do not perform this refactor solely for code aesthetics.

### Proposed ownership

- A single `usePipelineDeals` owner exposes:
  - `deals`
  - `isLoading`
  - `mutateDeals`
  - pagination state for completed deals
  - derived counts needed by the toolbar
- The Kanban board receives this resource interface rather than creating a second SWR subscription.
- Mutations and Pusher events update the same cache owner.
- Do not copy deals into independent local authoritative arrays.

### Check

- Only one production owner creates the Pipeline deals SWR subscription.
- Every existing caller of the shared fetching and mutation functions is swept.
- Render profiling demonstrates improvement or at least no regression.
- Optimistic moves and rollback remain operation-scoped.
- `npm run verify:pipeline` passes.

## Phase 6 — Tighten Account list and detail boundaries

### Files likely to change

- `src/app/contact/page.tsx`
- `src/components/contact/ContactView.tsx`
- `src/components/contact/EditAccountPanel.tsx`
- `src/lib/actions/contact.ts`
- `src/lib/contact/account-cache-keys.ts`
- `src/lib/contact/account-card-dto.ts`
- Account tests

### Implementation

1. Keep the first list page bounded at 20 records unless measurement supports a different size.
2. Ensure list queries return only `AccountCardDTO` fields required for rendering, filtering, counts, and interactions.
3. Keep account overview, addresses, logs, AI content, prices, and media behind active panel/tab keys.
4. Preserve intent preloading for the single account card the user hovers or focuses.
5. Avoid preloading overview data for all visible cards.
6. Review whether SWR and local `accounts` state both hold authoritative copies. Consolidate only if profiling or race tests identify a real cost or correctness risk.
7. Maintain per-company optimistic mutation sequence guards.
8. Separate cache lifetimes for stable filter options and volatile account lists.

### Targeted invalidation policy

- Card-only update: patch matching cards in affected list keys.
- Membership-changing update: revalidate only filter lists whose membership may change.
- Detail update: patch the matching account overview key.
- Account deletion: remove from relevant lists and detail keys without clearing unrelated caches.
- Permission/access loss: evict affected account detail and list data when detected.

### Query investigation

Measure the existing `count + findMany + opportunity groupBy` sequence. Check query plans before adding indexes. Search using case-insensitive `contains` should be treated as a separate database-search project if it proves slow at scale.

### Check

- First page fetches once and contains no detail-only fields.
- Infinite loading adds unique cards and preserves totals/has-more semantics.
- Rapid filter changes cannot apply results from an obsolete key.
- Optimistic rating rollback cannot overwrite a later rating operation.
- Contact masking and department permissions remain unchanged.
- `npm run test:contact` and `npx tsc --noEmit` pass.

## Phase 7 — Add a bounded adjacent-month Calendar strategy

### Files likely to change

- `src/app/calendar/page.tsx`
- `src/components/calendar/CalendarView.tsx`
- `src/lib/calendar/calendar-cache.ts`
- `src/lib/calendar/calendar-queries.ts`
- Calendar month, recurrence, realtime, move, and cache tests

### Implementation

1. Keep the initial visible 42-day snapshot as the primary month DTO.
2. After the active month is usable, prefetch at most the previous and next month when justified by idle time or explicit pointer/keyboard intent.
3. Prefer intent prefetch if automatic adjacent prefetch materially raises server load.
4. Bound retained month keys so long sessions do not accumulate an unlimited calendar cache.
5. Continue loading event details and financial information on demand.
6. Expand recurring events only within the requested grid range.
7. Match realtime events to intersecting month keys rather than revalidating every month.
8. Preserve server revisions and local optimistic revision guards.

### Check

- Navigating to a prefetched adjacent month can use its cache immediately.
- The app does not fetch an unbounded series of months.
- Cross-month and recurring occurrences retain correct IDs and times.
- Asia/Bangkok timezone behavior remains correct.
- Stale responses cannot overwrite a newer optimistic drag result.
- `npm run test:calendar` and `npx tsc --noEmit` pass.

## Phase 8 — Share only genuinely common resources

### Eligible shared resources

- Current authenticated actor.
- Menu permissions.
- Authorized user directory.
- Department directory.
- Lightweight company/account lookup.
- Entity detail keyed by authorized entity ID and actor scope.

### Ineligible combined resources

- All Pipeline cards.
- Full Dashboard aggregations.
- All Account details.
- Multiple unbounded Calendar months.
- Activity logs, shared media, notes, or AI summaries.

### Cache-key contract

Use keys shaped like:

```text
[resource, actor-or-tenant-scope, query dimensions]

["account-list", actorScope, filters, page]
["account-overview", actorScope, companyId]
["calendar-month", actorScope, year, month]
["pipeline-deals", actorScope, tab, search]
["dashboard-summary", actorScope, period, filters]
```

Requirements:

- Key shape must match the response shape.
- A paginated list key must never be overwritten with a single entity.
- Logout, session invalidation, or detected access loss must evict affected protected caches.
- Do not introduce a global CRM data store merely to avoid individual route fetches.
- Shared cache does not replace server authorization.

### Check

- Two users or permission scopes cannot collide on protected cache data.
- Returning to a route can reuse still-valid data.
- Realtime patches preserve filter membership, ordering, counts, pagination, and deduplication.
- No inactive route starts a subscription only to keep its cache warm.

## Phase 9 — Bundle and render optimization based on profiler evidence

This phase is conditional. Perform it only after query, payload, and duplicate-request work has been measured.

### Candidate work

- Dynamically import optional modals, drawers, reports, maps, AI panels, and media tooling not already split.
- Remove unused imports and orphaned client logic.
- Move large libraries behind the interaction that requires them.
- Memoize expensive derived lists only where profiling shows repeated meaningful work.
- Add bounded virtualization or pagination for large lists/boards only after confirming DOM cost.
- Reserve image and skeleton dimensions to control CLS.

### Check

- Route-specific JavaScript size is smaller or unchanged with a documented reason.
- Optional chunks do not download before the triggering interaction.
- INP and long-task evidence improves in the target interaction.
- Keyboard, focus, scroll, drag, and draft behavior remain intact.

## Rollout sequence

Implement and review as separate, reversible slices:

1. Baseline measurements.
2. Navigation prefetch policy.
3. Initial SWR duplicate suppression.
4. Dashboard resource-specific queries and summary-first rendering.
5. Pipeline secondary-resource deferral.
6. Pipeline deals-owner consolidation, only if profiling justifies it.
7. Account list/detail tightening.
8. Calendar adjacent-month caching.
9. Conditional bundle/DOM optimizations.

Do not combine Dashboard, Pipeline, Account, and Calendar refactors in one large change. A failure in one route must be independently revertible.

## Verification matrix

| Area | Required checks |
|---|---|
| Shared navigation | Production cold/warm navigation capture, no full reload, route feedback, background request count |
| Dashboard | TypeScript, dashboard data/key/realtime/parity tests, permission cases, payload/query comparison |
| Pipeline | `npm run verify:pipeline`, browser board scenario, realtime/mutation checks, payload/query comparison |
| Account | `npm run test:contact`, TypeScript, pagination/filter race scenarios, masking and permission checks |
| Calendar | `npm run test:calendar`, TypeScript, timezone/recurrence/move/recovery scenarios |
| Shared cache | Actor-scope separation, logout/access-loss eviction, sibling-caller sweep |
| Bundle/render | Production route chunks, long tasks, LCP/INP/CLS comparison |

## Project exit criteria

The overall performance project is complete only when all applicable statements below are supported by current verification evidence:

1. Initial resources do not re-fetch immediately after hydration unless freshness policy requires it.
2. Internal navigation displays immediate feedback and does not reload the document.
3. Inactive routes do not load feature data or own realtime subscriptions.
4. Dashboard resource actions do not compute unrelated full-snapshot resources.
5. Dashboard initial rendering does not wait for non-critical sections.
6. Pipeline's board does not wait for secondary badge/summary resources.
7. Pipeline detail tabs remain unmounted and load data only when active.
8. Account lists remain paginated and exclude detail-only data.
9. Calendar cache is bounded and recovery targets affected months.
10. Cache keys are actor/tenant scoped where authorization differs.
11. Permissions, contact masking, and server business rules are unchanged.
12. Targeted test suites and TypeScript pass.
13. Every Pipeline-touching slice passes `npm run verify:pipeline`.
14. Cold and warm measurements demonstrate improvement against the Phase 0 baseline.
15. Any metric that did not improve has a recorded explanation and no hidden regression.

## Rejected alternatives

### One giant page containing every CRM module

Rejected because it couples route bundles, data, DOM, state, permissions, and realtime work. It increases the chance that users pay for inactive features and makes ownership and recovery harder to verify. Reversibility is also poor once feature state becomes globally coupled.

### Fetch all CRM data once at login

Rejected because much of the data may never be viewed, can become stale immediately, and may cross authorization boundaries. It also makes the first authenticated screen pay the maximum possible network and serialization cost.

### Add indexes before measuring queries

Rejected because the current schema already contains several relevant indexes. Additional indexes impose write/storage costs and may not address the actual query plan.

### Globally disable SWR revalidation

Rejected because it can leave stale data after reconnect or missed events. Initial duplicate suppression must be conditional on a matching fresh fallback key.

### Replace existing realtime recovery with global cache clearing

Rejected because it increases network load, causes UI churn, and can overwrite newer optimistic state. Recovery must remain resource-scoped.

## Implementation checkpoints

Update this section after every implementation slice. Do not mark a phase complete without its named checks and measured result.

### Current checkpoint

- Completed: Fast Mode static audit and implementation-plan design.
- Incomplete: All code changes and runtime baseline measurements.
- Changed files: `.agents/plans/improve-overall-speed.md` only.
- Verification: Document existence, content inspection, and `git diff --check` completed successfully.
- Known blockers: None for planning. Runtime performance decisions require Phase 0 measurements.
- Exact next action: Run Phase 0 production cold/warm baseline for the four standard routes and record results below.

### Baseline results

| Route | Condition | TTFB | RSC/data bytes | Initial requests | LCP | Primary server/query time | Notes |
|---|---|---:|---:|---:|---:|---:|---|
| Dashboard | Cold | Pending | Pending | Pending | Pending | Pending | Pending |
| Dashboard | Warm | Pending | Pending | Pending | Pending | Pending | Pending |
| Pipeline | Cold | Pending | Pending | Pending | Pending | Pending | Pending |
| Pipeline | Warm | Pending | Pending | Pending | Pending | Pending | Pending |
| Contact | Cold | Pending | Pending | Pending | Pending | Pending | Pending |
| Contact | Warm | Pending | Pending | Pending | Pending | Pending | Pending |
| Calendar | Cold | Pending | Pending | Pending | Pending | Pending | Pending |
| Calendar | Warm | Pending | Pending | Pending | Pending | Pending | Pending |

### Slice history

| Date | Slice | Status | Files changed | Checks run | Measured result | Next action |
|---|---|---|---|---|---|---|
| 2026-09-16 | Plan creation | Complete | `.agents/plans/improve-overall-speed.md` | Markdown content inspection | No runtime measurement | Phase 0 baseline |

## Definition of done for every future turn

Before ending any implementation turn working from this plan, update `Implementation checkpoints` with:

- Work completed.
- Work still incomplete.
- Files changed.
- Exact checks run and their outcomes.
- Before/after measurements when performance is claimed.
- Blockers or unresolved decision gates.
- The exact next command or action.

Do not mark a phase complete unless its exit check has run in that turn or the result is explicitly referenced from a recorded, reproducible prior run.
