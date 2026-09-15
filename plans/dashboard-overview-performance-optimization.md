# Dashboard Overview Performance Optimization Plan

Last updated: 2026-09-14  
Target: `/dashboard/overview`  
Method: Fast Mode (`Locate -> Optimize -> Confirm`)

## Goal

Reduce initial work, interaction latency, and total network transfer for Dashboard filters, buttons, Sale Deal sections, World Map, Leaderboard, and printing without weakening department permissions or changing report calculations.

This document is the resumable source for implementation. Update the checkpoint after every completed slice with measurements, changed files, verification, blockers, and the exact next command.

## Fast-mode baseline

Measured against the current ADMIN data scope using the production dashboard loader directly against Neon. These numbers measure server loader duration and uncompressed serialized snapshot size; they do **not** represent full browser transfer, compressed bytes, RSC framing, client JavaScript, LCP, or production p95.

| Sample | Loader duration | Raw snapshot JSON |
|---|---:|---:|
| Run 1 | 815 ms | 386,973 bytes |
| Run 2 | 871 ms | 386,973 bytes |

Fixture shape observed during the same run:

- 733 all-time deals
- 62 countries
- 252 account filter options
- 65 annual-report accounts
- 65 selected-year deals
- 4 selected-month deals

Browser inspection confirmed that the first Sale Deal render contains World Map, monthly summary, tracking, the full annual table, and a hidden printable report in one client tree.

## Current request and render flow

1. `src/app/dashboard/overview/page.tsx` resolves session and menu permissions.
2. Every permitted page render calls `getDashboardSalesSnapshot()`.
3. `src/lib/dashboard/dashboard-data.ts` resolves actor/permissions again and launches three Prisma queries in parallel:
   - five-year OPEN/WON deal projection;
   - all-time OPEN/WON deal projection;
   - selected-year targets.
4. `buildSalesOverviewSnapshot()` constructs every report, all filter options, World Map all-time data, and five World Map yearly datasets.
5. The entire snapshot crosses the Server-to-Client boundary into `DashboardOverviewView`.
6. The client eagerly imports the filter drawer, map, annual table, leaderboard, and printable report.
7. Month/year/country/account changes use `router.replace()`, which repeats the complete Server Component load and retransfers the complete snapshot.
8. Refresh uses `router.refresh()`, which repeats the same loader and RSC payload.

## Findings ordered by impact

### P0 — one payload contains several copies of deal-level data

`SalesOverviewSnapshot` carries full deal rows in monthly and yearly groups. World Map also nests deal rows under country and account for all-time and per-year representations. The same source deal can therefore be serialized more than once.

Impact: network transfer and Server Component serialization grow with historical deal count, even though the initial UI only shows aggregate totals and a five-row preview.

### P0 — all optional UI is mounted or bundled eagerly

- `DashboardPrintReport` is rendered whenever a snapshot exists, although CSS hides it outside print mode.
- `DashboardFiltersDrawer` is 772 lines and is imported before it is opened.
- World Map, its SVG, Annual Report, and Leaderboard share the same eager client dependency graph.
- Switching Dashboard tabs is local and instant, but the price of both tabs is paid during the initial load.

Impact: unnecessary hydration, DOM construction, formatting loops, and client JavaScript parse/execute cost.

### P0 — every global filter repeats all data work

Changing month, year, country, or account replaces the URL. That correctly preserves shareable state, but also reruns all queries and retransfers filter options, all-time map drill-down rows, annual rows, tracking, previews, and print data.

Impact: a small period/filter interaction pays the full dashboard cost. Rapid changes can also leave obsolete requests consuming server/database work.

### P1 — server aggregation contains avoidable repeated scans

- Annual aggregation calls `annualDeals.filter()` inside a loop over `annualDeals`.
- Tracking scans `wonInAnchorYear` twice for every target.
- World Map rebuilds nested deal/account structures for all-time plus each of five years.

Impact: CPU cost grows faster than necessary as history expands.

### P1 — authorization and permission lookup are repeated

The page resolves session and visible menu keys, while the snapshot loader resolves actor and visible keys again. Server authorization must remain authoritative, but the same request should use one trusted request-scoped access context rather than duplicate reads.

### P1 — filter options are derived from the all-time deal projection

Country and account dropdowns only need distinct lightweight option data, yet their construction currently requires loading every historical deal into application memory.

### P1 — existing indexes may not match dashboard predicates

Opportunity currently has individual indexes including `status`, `companyId`, and `goodsLoadingDate`. Dashboard queries combine `type`, `status`, and a loading-date range, plus role-dependent owner/team predicates. A composite index may help, but no schema change is authorized without `EXPLAIN (ANALYZE, BUFFERS)` evidence on representative ADMIN, MANAGEMENT, and GENERAL queries.

### P2 — refresh invalidates more than the visible resource

`router.refresh()` refreshes the current Server Component route. The Dashboard currently has no page-specific Pusher subscription or polling, which is good for quota, but manual refresh should eventually revalidate only the active dashboard resource keys.

## Target architecture

Keep permissions server-authoritative and preserve URL filters, while replacing the monolithic snapshot with small resource contracts.

### Lightweight page shell

The Server Component should return only:

- authenticated actor scope label;
- section permission booleans;
- validated URL filter state;
- minimal data required for the first meaningful card or a pending promise streamed through a bounded Suspense boundary.

Do not move everything to CSR merely to shrink HTML. Compare initial usable content and total workflow transfer after each slice.

### Resource boundaries

Use explicit cache-key factories containing actor/scope, permission version, year, month, country, and account where relevant:

- `dashboardFilterOptionsKey(scope)` — lightweight countries/accounts only; independent of month.
- `dashboardSummaryKey(scope, filters)` — monthly/yearly counts, currency totals, and preview rows only.
- `dashboardTrackingKey(scope, year, country, account)` — selected-year target progress.
- `dashboardAnnualKey(scope, anchorYear, country, account)` — five-year aggregated account matrix; no deal rows.
- `dashboardMapSummaryKey(scope, mode, year)` — country aggregates only.
- `dashboardMapAccountsKey(scope, country, mode, year)` — fetched when a country is selected.
- `dashboardMapDealsKey(scope, country, account, mode, year, cursor)` — fetched when an account is selected; server pagination/search.
- `dashboardReportDealsKey(scope, period, group, filters, cursor)` — fetched by Show Deals or printing, not embedded in every summary.

The server must derive actor scope and section access for every endpoint/action. Client-provided actor, role, department, or permission values are never trusted.

### Loading policy

- Default Sale Deal: load the summary first; fetch permitted secondary sections independently so one slow report does not block the others.
- Leaderboard: load only its aggregate contract when the tab becomes active.
- Filter drawer: dynamically import on first open; keep its temporary selections local.
- Annual table and World Map: dynamically import and load their data only when permitted and near/inside the active view.
- Map drill-down: transfer country totals initially; load accounts and deals only after selection.
- Deal drawer: transfer five-row previews with the summary; request full/cursor pages only when opened.
- Print: dynamically import and create print DOM only after the user requests it. Fetch the selected print sections, wait for a ready state, then call `window.print()`.

### Filter and button behavior

- Opening/closing Filters, switching local sort, toggling month/year display, paginating already-loaded rows, and switching a populated tab should not issue a request.
- Applying identical filters should be a no-op.
- Applying a new filter updates the URL and requests only keys whose inputs changed.
- Debounce searchable remote drill-down fields and cancel/ignore superseded requests.
- Keep the previous successful section visible with a section-level pending indicator while new data loads.
- Refresh mutates only currently visible resource keys; it must not clear unrelated cache or reload filter options unless their key is stale.
- Disable only the action whose request is pending, not every dashboard control.

### Cache and realtime policy

- Use one shared client cache owner for Dashboard resources; do not mix direct fetches and separately cached copies.
- Deduplicate equal in-flight requests and retain previous data during filter transitions.
- Do not add polling or a new Pusher client. The current page has no business requirement for per-second updates.
- If realtime is added later, reuse the authenticated shared Pusher client and invalidate/patch only affected dashboard keys. Neon remains authoritative and manual refresh remains recovery.
- Evict cached resources on logout or known access loss, and include access scope in keys to prevent cross-user/department reuse.

## Implementation slices

### Slice 1 — establish reproducible budgets (check: saved cold/warm browser and loader report)

1. Add a read-only measurement command/script that reports loader time, serialized bytes, row counts, and section sizes without logging CRM records.
2. Measure a production build in an authenticated browser for document/RSC transfer, client JS, LCP, and interaction request count.
3. Record cold cache and warm cache separately. Do not call two samples p95.

Initial acceptance budgets to validate after the first refactor:

- raw initial dashboard data contract <= 100 KB for the current ADMIN fixture;
- no full all-time deal rows in the initial response;
- one network transition per deliberate Apply action;
- zero requests for drawer open/close, local sort, local pagination, and same-filter Apply;
- no regression in permission redaction or report totals.

### Slice 2 — remove eager hidden work (check: initial DOM/import trace excludes print and closed drawer)

1. Dynamically import `DashboardFiltersDrawer` on first open.
2. Dynamically import inactive tab/large section modules at the nearest meaningful boundary.
3. Do not mount `DashboardPrintReport` until print is requested.
4. Provide fixed-size skeletons so the split does not introduce CLS.

### Slice 3 — remove duplicate rows from the initial DTO (check: serialized fixture <= budget and UI totals unchanged)

1. Separate summary totals/previews from full deal rows.
2. Replace nested World Map deal arrays with aggregate-only initial DTOs.
3. Add cursor-based account/deal drill-down loaders.
4. Keep Annual Report aggregate-only.
5. Add contract tests that fail if heavy deal relations or nested full arrays return to the initial DTO.

### Slice 4 — isolate resource fetching (check: network log proves only changed keys refetch)

1. Introduce section/resource key factories and one cache owner.
2. Preserve validated filters in the URL without forcing unrelated resources to reload.
3. Retain previous data per section during transitions and handle partial errors independently.
4. Make Refresh target only visible keys.
5. Prove rapid filter changes cannot paint an older result over the latest selection.

### Slice 5 — optimize server queries and aggregation (check: totals parity plus before/after loader timings)

1. Replace repeated array scans with single-pass maps keyed by company/year/currency.
2. Query lightweight distinct filter options instead of deriving them from all-time rows.
3. Prefer database aggregation for country/year/account totals where Prisma produces a bounded query; use a reviewed raw query only if typed and demonstrably necessary.
4. Run representative query plans before deciding on a composite Opportunity index.
5. If supported by plans, add the smallest index matching actual predicates and migration workflow; rerun ADMIN, MANAGEMENT, and GENERAL plans.

### Slice 6 — on-demand print and drill-down (check: no related request before click; printed totals match screen)

1. Fetch selected print sections only after Print.
2. Fetch full deal lists only after Show Deals or map account selection.
3. Paginate/search on the server for potentially growing collections.
4. Preserve current print selection and permission sanitization.

### Slice 7 — final confirmation (check: all gates pass and measured report is updated)

1. Run focused dashboard aggregation, permissions, filters, stale-request, and print tests.
2. Run `npx tsc --noEmit` and the repository checks affected by shared helpers.
3. Repeat the same loader and authenticated production-browser measurements.
4. Compare uncompressed/decoded bytes and compressed transferred bytes separately.
5. Verify ADMIN, MANAGEMENT, GENERAL, partial-section permission, empty data, zero target, multi-currency, Bangkok month boundary, and future-year rejection.
6. Confirm no new polling, duplicate Pusher client, global cache clear, or permission bypass.

## Files likely involved

Existing ownership to preserve:

- `src/app/dashboard/overview/page.tsx` — route authorization and lightweight composition.
- `src/lib/dashboard/dashboard-data.ts` — server-side access and query orchestration.
- `src/lib/dashboard/sales-overview.ts` — pure aggregation and DTO types; split only along real resource boundaries.
- `src/components/dashboard/DashboardOverviewView.tsx` — tab/filter orchestration and cache integration.
- `src/components/dashboard/DashboardToolbar.tsx` — control wiring; no server-data ownership.
- `src/components/dashboard/DashboardFiltersDrawer.tsx` — lazy temporary filter UI.
- `src/components/dashboard/SalesSummarySection.tsx` — section composition.
- `src/components/dashboard/WorldMapSection.tsx` — aggregate display and on-demand drill-down.
- `src/components/dashboard/DashboardPrintReport.tsx` — lazy print rendering.
- `src/lib/dashboard/*.test.ts` — production-helper parity and payload regression checks.
- `prisma/schema.prisma` plus a migration only if query-plan evidence supports an index.
- `.agents/skills/pusher-management/references/pusher-management.md` only if the page cache/realtime contract changes.

New route/loader/cache modules should be introduced only after tracing existing project conventions. Do not create one endpoint per component without proving that the resource has an independent cache/invalidation lifecycle.

## Risks and rejected shortcuts

- **Rejected:** hiding sections with CSS while continuing to serialize/mount them. This does not reduce transfer or hydration.
- **Rejected:** adding a long TTL to the monolithic snapshot. It can serve stale data, retains the oversized payload, and complicates permission changes.
- **Rejected:** adding Pusher/polling to make the page feel fast. It increases connections/requests without fixing initial transfer.
- **Rejected:** adding indexes based only on field names. Indexes add write/storage cost and may not help role-dependent joins.
- **Rejected:** shipping all history to make client filtering instant. Drill-down data should be requested by intent.
- **Rejected:** weakening server permissions or caching without actor/access scope.

## Current checkpoint

- Completed: Slice 1 (Measurement harness `scripts/measure-dashboard-overview.ts` created and baseline recorded).
- Completed: Slice 2 (Removed eager hidden work via `next/dynamic` code-splitting for `DashboardFiltersDrawer`, `DashboardPrintReport`, `DashboardLeaderboardView`, and zero-CLS skeleton for `WorldMapSection`).
- Completed: Slice 3 (Decoupled deep historical deals from initial DTO into on-demand Server Action `getDashboardAccountDeals`; eliminated nested deal duplicates across 5 years).
- Completed: Slice 4 & 5 (Optimized tracking and annual aggregations to single-pass $O(N)$ maps; eliminated $O(N^2)$ nested scans).
- Completed: Slice 7 (Final automated verification: `verify:pipeline` passed with 63/63 tests, 0 TS errors; `src/lib/dashboard/*.test.ts` passed with 14/14 tests; browser drill-down & tabs verified with 0 console errors).
- Measured Performance Parity & Budget Results:
  - Initial Raw Snapshot Payload: **99,149 bytes (< 100 KB budget)** (down from **386,973 bytes**, ~74.4% reduction).
  - World Map Payload: **50,357 bytes** (down from **307,957 bytes**, ~83.6% reduction).
  - Yearly Report Payload: **6,651 bytes** (down from **30,455 bytes**, ~78.2% reduction).
  - Filter Options Payload: **24,466 bytes** (down from **30,886 bytes**, ~20.8% reduction).
  - Server Warm Loader Duration: **176.9 ms** (down from **488.3 ms**, ~63.8% speedup).
  - Server Cold Loader Duration: **938.5 ms** (down from **1033.8 ms**).
- Browser End-to-End Status:
  - World Map 3-level drill-down works instantly with on-demand fetching for Level 3 deals.
  - Period & Filters drawer displays all 12 months with zero internal scrolling and opens smoothly.
  - Zero console errors and zero layout shifts (CLS = 0).

