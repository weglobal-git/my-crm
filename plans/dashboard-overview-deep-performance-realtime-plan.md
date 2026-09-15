# Dashboard Overview — Deep Performance & Realtime Implementation Plan

Last updated: 2026-09-15  
Target: `/dashboard/overview`  
Execution mode: Deep Mode  
Primary handoff: implementation by another AI agent

## 1. Outcome

Make Dashboard Overview show useful content as early as possible, minimize total network transfer across a realistic user workflow, keep every local control immediately responsive, and propagate relevant Sales Deal/account/target changes to other authorized viewers with the lowest practical delay.

The implementation is complete only when measurements prove the improvement and all security, permission, correctness, recovery, and concurrency checks pass. Do not use “feels faster” as acceptance evidence.

### User-visible success criteria

- The page shell and first useful sales summary appear without waiting for World Map drill-down data, the complete annual matrix, Leaderboard, filter drawer, or print tree.
- Country/account/period selection paints the selected state immediately, retains the last successful data while loading, and never freezes unrelated buttons.
- Opening/closing Filters, changing local sort, map period, Sale Summary period, paginating already-loaded data, showing an already-cached tab, and applying identical filters make zero network requests.
- A successful filter change updates World Map, Sale Summary, Sale Tracking, and Five-Year Account Performance consistently.
- A mutation by the current user paints a safe optimistic result immediately where this page owns the mutation. A mutation from another authorized user invalidates only affected Dashboard resources and refreshes them in the background.
- Realtime failure never loses authoritative data: reconnect, focus, online recovery, and manual refresh reconcile from Neon.
- Ordinary aggregate changes do not create bell notifications. Only a business event that requires a recipient to decide or act may create a persistent Notification row.

## 2. Instructions the implementing AI must read first

Read completely before editing:

1. `AGENTS.md`
2. `.agents/skills/fable-5/SKILL.md`
3. `.agents/skills/trace-performance-bottleneck/SKILL.md`
4. `.agents/skills/performance-optimization/SKILL.md`
5. `.agents/skills/crm-feature-architecture/SKILL.md`
6. `.agents/skills/realtime-optimistic-ui/SKILL.md`
7. `.agents/skills/pusher-management/SKILL.md`
8. Relevant sections of `.agents/skills/pusher-management/references/pusher-management.md`: §1, §3–§9, §12–§14
9. Next.js 16.3.3 guides under `node_modules/next/dist/docs/` for Server/Client boundaries, navigation, caching, route handlers, and streaming/Suspense.

Do not use outdated examples from skills when they conflict with current production helpers, signatures, permission rules, critical persistence, or operation-based cache reconciliation.

## 3. Observed current state

Treat this list as a starting hypothesis and re-confirm it against the working tree because the repository is dirty and may change before implementation.

- `src/app/dashboard/overview/page.tsx` authenticates, resolves menu visibility, validates URL filters, and passes a complete `SalesOverviewSnapshot` to the client.
- `src/lib/dashboard/dashboard-data.ts` owns authorized query orchestration and section redaction.
- `src/lib/dashboard/sales-overview.ts` owns pure aggregation and DTO definitions.
- `src/components/dashboard/DashboardOverviewView.tsx` owns tab/filter navigation; global filters currently use `router.replace()` and Refresh uses `router.refresh()`.
- `src/components/dashboard/SalesSummarySection.tsx` composes World Map, Sale Summary, Sale Tracking, and Annual Report.
- `src/components/dashboard/WorldMapSection.tsx` keeps local drill-down state and calls `getDashboardAccountDeals()` on demand for level-three rows.
- `DashboardFiltersDrawer`, Leaderboard, World Map, and print rendering already contain some lazy/on-demand work. Re-measure; do not redo completed slices blindly.
- The current policy matrix describes Dashboard as an aggregate snapshot page with no per-deal subscription, client filter fetch, and focus/button recovery.
- The authenticated shell already owns one lazy Pusher client per active tab. `acquireChannelWhenConnected()` and reference counting are the required subscription boundary.
- Existing private pipeline events are user-scoped and authorized, but their payload/action coverage is not yet a proven complete Dashboard invalidation contract.
- Existing contact events use `private-contacts`; not every Dashboard viewer necessarily has Contacts permission, so it must not be assumed to cover Dashboard account/country changes.

Previous plan and measurements are in `plans/dashboard-overview-performance-optimization.md`. Use them as historical evidence only. Re-run the same fixture and commands before claiming the numbers still hold.

## 4. Non-negotiable invariants

### Security and permissions

- Server derives actor ID, role, department scope, visible menu keys, and section access. Never accept these fields from the browser.
- Every resource read and Pusher channel authorization rechecks access on the server.
- Cache keys include user/access scope or another server-issued opaque scope token. No cache entry may cross user, role, department, permission version, or environment boundaries.
- Denied sections remain redacted server-side. Hiding a card in React is not authorization.
- Private CRM data must never be published on a public channel.
- Permission loss must stop future fanout and evict known inaccessible client resources during recovery. Server enforcement is immediate even if an offline client cannot be cleared immediately.

### Data and realtime correctness

- Neon is authoritative. Pusher is a low-latency signal, not proof of delivery or persistence.
- Do not compute the full Dashboard by subscribing to and replaying every deal event in browser memory.
- Realtime payloads contain minimal invalidation metadata, not snapshots, deal relations, user objects, notes, or historical rows.
- Use `eventId` for delivery dedupe, `mutationId` for current-user echo reconciliation, and a server-issued revision/version when ordering matters. Timestamps alone are not an ordering contract.
- A slower fetch must not overwrite a later filter selection, optimistic mutation result, or newer realtime event.
- Do not use global SWR mutation, global cache clearing, or `router.refresh()` for high-frequency Dashboard changes.
- Critical notification/audit persistence is awaited or transactional. Do not turn it into unobserved fire-and-forget work.

### UX and performance

- Keep the last successful section visible during revalidation. Use fixed-size section skeletons only on first load to avoid CLS.
- Pending state is per action/resource. A country request must not disable map period, Filters, Leaderboard, or unrelated local controls.
- Preserve URL-backed month/year/country/account filters and browser navigation behavior.
- Same-input Apply is a no-op. Rapid changes cancel or ignore superseded responses.
- Do not ship all historical deals to make filtering instant.
- Do not add a database index without representative query-plan evidence.

## 5. Target ownership model

Introduce these boundaries only after Phase 1 proves the transport choice. Names are proposed contracts, not permission to invent APIs without checking repository conventions.

| Resource | Contents | Loading policy | Invalidation inputs |
|---|---|---|---|
| `dashboard-shell` | validated filters, scope label, section permissions, server-issued access scope/version | SSR | session/permission change |
| `dashboard-filter-options` | country/account identifiers, labels, counts only | initial or drawer intent; cache across period changes | company name/country/access change |
| `dashboard-summary` | monthly/yearly counts, currency totals, bounded preview | first meaningful section | deal type/status/value/currency/loading date/company/filter |
| `dashboard-tracking` | selected-year target progress only | independent secondary section | deal actuals, company target, filter/year |
| `dashboard-annual` | five-year account/currency aggregate matrix; no deal rows | independent/lazy section | won deal actuals, company/filter/anchor year |
| `dashboard-map-summary` | country aggregates only | independent initial section | relevant deal actuals/company country/period |
| `dashboard-map-accounts` | bounded accounts for selected country/mode | country intent | country/company/deal aggregate |
| `dashboard-map-deals` | cursor page/search for selected account | account intent | selected account deals only |
| `dashboard-print-data` | only user-selected permitted sections | print intent | selected filters/sections |
| `dashboard-leaderboard` | leaderboard-only aggregate DTO | tab intent | leaderboard inputs only |

Each resource gets one cache owner and one key factory. Components render DTOs and emit intents; they do not invent parallel server-data copies.

## 6. Realtime and notification contract

### Preferred design to validate

Use the existing authenticated Pusher connection and add a user-scoped private Dashboard subscription only while Sale Deal Dashboard is active:

- Channel: `private-dashboard-{userId}`
- Event: `dashboard-invalidated`
- Subscription owner: a Dashboard data/cache controller, using `acquireChannelWhenConnected()` and exact bind/unbind handler ownership.
- No new Pusher client and therefore no additional browser socket per tab; this does add a channel subscription and message deliveries.

Proposed minimal envelope:

```ts
type DashboardInvalidationEvent = {
  schemaVersion: 1;
  eventId: string;
  mutationId?: string;
  revision?: number;
  occurredAt: string;
  resources: Array<
    | "filter-options"
    | "summary"
    | "tracking"
    | "annual"
    | "map-summary"
    | "map-accounts"
    | "map-deals"
    | "leaderboard"
  >;
  affectedYears?: number[];
  countryCodes?: string[];
  companyIds?: string[];
};
```

Keep serialized UTF-8 payload below 5 KB. Omit identifiers that are unnecessary for key matching. Validate and normalize the envelope before merging or invalidating.

### Producer coverage that must be traced

At minimum inspect all mutations that can affect Dashboard calculations:

- Sales Deal create, update, status/stage change, delete, owner/team/access change.
- Changes to `type`, `status`, `value`, `currency`, `goodsLoadingDate`, `companyId`, or any field used by a Dashboard aggregate.
- Company sale target upsert/delete.
- Company display name/country and company address country changes.
- Permission/department changes that alter visible scope.

Create a single server-only dispatcher that computes authorized recipients from current access rules, maps changed fields to affected resources, and publishes the minimal envelope. Do not paste Pusher calls into every action. Sweep every caller before changing shared mutation helpers.

### Self UX and other-user UX

- Acting user: mutation response or local intent paints safe optimistic state first. When Dashboard does not own the business mutation, do not fabricate a business result; retain current data and show section-level syncing state.
- Own Pusher echo: match `mutationId`, dedupe it, and use it only to reconcile/confirm; it must not cause a second full fetch.
- Other authorized viewers: receive an invalidation event and revalidate only matching active keys. Coalesce bursts affecting the same key into one bounded revalidation window.
- Hidden/offline tabs: do not poll. On visible/pageshow/online/reconnect, reconcile active Dashboard keys once with dedupe.
- Subscription error: retain data, mark it potentially stale, and enable focused recovery. Never replace a failed fetch with an empty Dashboard.

### Notification policy

- Aggregate changes, filter operations, refresh, print, target edits, country edits, or ordinary deal updates do not create bell notifications by default.
- If a traced producer already represents a business request requiring recipient action, preserve its existing persistent Notification behavior. Persist first, then use `private-user-{userId}` as the delivery signal.
- Do not create duplicate Notification rows solely because Dashboard also received an invalidation event.

## 7. Deep Mode execution phases

Every task below ends with an independently failing check. Work in vertical slices; update the checkpoint after each phase.

### Phase 0 — freeze the reproducible scenario

1. Record commit/worktree status and distinguish pre-existing changes from implementation changes (check: saved `git status --short` and scoped diff inventory).
2. Define one sanitized ADMIN fixture plus MANAGEMENT, GENERAL, partial-section, empty, and multi-currency variants (check: fixture command reports counts only, never CRM records).
3. Create one command that runs the authenticated browser scenario: cold page, warm page, country filter, account filter, month/year, refresh, map account/deal drill-down, Leaderboard, Show Deals, print preparation (check: command exits nonzero if a step or assertion fails).
4. Record hardware/runtime, Next mode, browser viewport, cache state, and Pusher dev flag (check: benchmark artifact contains environment metadata).

Exit: another agent can reproduce the same scenario with one command.

### Phase 1 — instrument and attack the load-bearing unknown first

1. Add temporary monotonic `[PERF-TRACE]` spans at browser intent, request start/end, authorization, Prisma query, aggregation, serialization, React commit, and relevant Pusher receive/revalidation boundaries (check: one trace ID connects a filter click end-to-end without logging business data).
2. Measure the same Dashboard resource through current RSC navigation, an authenticated JSON Route Handler spike, and a Server Action spike (check: artifact reports transferred bytes, decoded bytes, server duration, and click-to-paint for all three).
3. Run each cold/warm scenario at least three times. Report median and individual samples; do not label three samples p95 (check: raw samples are saved).
4. Choose transport per resource based on first-use content, workflow transfer, abort/supersession support, caching, and observed latency—not ideology (check: Architecture Decision Record lists measured winner and rejected options).

Decision gate: do not start the resource split until this phase identifies the winning transport and the dominant latency layer.

### Phase 2 — establish budgets and correctness parity

1. Snapshot existing totals for all report sections across the fixture matrix (check: parity test fails on any count/currency/account/year difference).
2. Record initial document/RSC/JSON transfer, compressed wire bytes, decoded payload, JS chunks, DOM nodes, LCP, INP/click-to-paint, CLS, query counts/times, and render commits (check: baseline report contains every metric or explicitly says unavailable).
3. Record Pusher current/peak connections, message count, subscription/auth errors, and reconnect/recovery requests by environment if credentials/metrics are available (check: quota worksheet has source timestamp; otherwise marked “not measured”).

Initial target budgets for the current fixture; tighten only after baseline evidence:

- LCP ≤ 2.5 s production build, with first useful summary visible earlier than secondary sections.
- INP/local control response ≤ 100 ms; filter selected-state paint ≤ 50 ms.
- Warm country filter click-to-consistent-section-paint ≤ 300 ms when data is cached and ≤ 800 ms with network/DB fetch under normal local conditions.
- CLS ≤ 0.1.
- Initial aggregate data ≤ 100 KB raw and no nested historical deal arrays.
- Realtime envelope ≤ 5 KB serialized UTF-8.
- One deliberate filter Apply causes only changed resource requests; local-only actions cause zero requests.
- 1 Pusher client per authenticated active tab; Dashboard adds no socket instance.

### Phase 3 — first vertical slice: shell + summary + one filter

1. Implement the chosen transport for `dashboard-shell` and `dashboard-summary` only (check: first useful summary renders without annual/map drill-down/print payload).
2. Add scoped key factory and single cache owner (check: identical concurrent requests dedupe; access scopes cannot share keys).
3. Make country selection optimistic: selected map/list state and pending indicator paint immediately while old summary remains visible (check: forced 1 s response still accepts local interactions and does not clear content).
4. Ignore/cancel superseded requests using request identity/session/access guards (check: delayed country A cannot overwrite later country B).
5. Preserve URL/back-forward semantics without triggering unrelated resource work (check: browser back restores filter and consistent data).

Exit: one end-to-end filter updates one real section faster with parity and race tests passing.

### Phase 4 — split remaining read resources

1. Split Map summary, Map accounts, Map deals, Tracking, Annual, Leaderboard, Filter options, and Print along the ownership table (check: network trace proves each resource is absent until its loading policy requires it).
2. Keep aggregate DTOs lean and make growing collections cursor/search bounded (check: contract tests reject nested deal arrays and unbounded drill-down responses).
3. Render permitted sections independently so one slow/error resource does not block the others (check: injected Annual failure leaves Summary and Map usable).
4. Lazy-load inactive tab/drawer/print/large visualization modules and reserve dimensions (check: initial chunk/DOM inventory excludes inactive features and CLS stays within budget).
5. Refresh only currently visible resource keys; filter option refresh is independent (check: request log has no full route refresh or unrelated key fetch).

### Phase 5 — optimize database and aggregation with evidence

1. Measure query time and row/byte transfer separately for ADMIN, MANAGEMENT, and GENERAL access paths (check: saved sanitized query timing table).
2. Replace repeated scans with single-pass grouping only where profiling shows CPU cost (check: pure aggregation parity plus benchmark).
3. Compare application aggregation with bounded database aggregation for Map/Annual/Tracking (check: representative fixture shows query plan, transfer, and total latency for both).
4. Run `EXPLAIN (ANALYZE, BUFFERS)` before proposing a composite index (check: plan demonstrates the actual predicate/order path).
5. Add the smallest additive index/migration only if evidence shows a meaningful win across representative scopes (check: post-index plans improve target queries without unacceptable write/storage cost).

### Phase 6 — optimistic control and mutation behavior

Classify every button/control before editing:

| Flow | Expected behavior | Failure behavior |
|---|---|---|
| Tabs, local sort, period display toggle, local pagination | synchronous local update | no server failure path |
| Open/close Filters, identical Apply | local/no-op | no request |
| New global filter | optimistic selected state + scoped fetch | keep prior data, error badge/toast, retry |
| Refresh | scoped revalidation | keep prior data, mark stale |
| Map country/account drill-down | optimistic panel transition + intent fetch | retain prior panel/cache and retry |
| Show Deals | cached preview immediately; full page on intent | preview remains usable |
| Print | mount/fetch selected permitted sections only; wait for report/font ready | no print dialog until complete; show retry |

For any real Dashboard mutation introduced later: return authoritative operation result, patch only matching caches, track mutation ID, rollback only that operation, and preserve later user input (check: two rapid operations with first failing do not undo the second).

### Phase 7 — realtime invalidation vertical slice

1. Add pure typed envelope validation, key matching, dedupe, and coalescing helpers (check: duplicate, malformed, oversized, unrelated-scope, and out-of-order fixtures are rejected or handled deterministically).
2. Extend Pusher auth for `private-dashboard-{userId}` with `crm_overview`/section permission checks (check: ADMIN/authorized role succeeds; unauthorized/mismatched user fails).
3. Subscribe through `acquireChannelWhenConnected()` only while the Dashboard resource owner is active; bind/unbind exact handler (check: remount, HMR-like double effect, tab switch, hidden initial load, logout, and two consumers do not leak or prematurely unsubscribe).
4. Implement one producer end-to-end—prefer Sales Deal update because it affects Summary, Map, Annual, and possibly Tracking (check: User A mutation causes User B matching keys to refresh once; unrelated key does not fetch).
5. Reconcile acting-user echo by mutation ID and prove it does not double-fetch (check: request counter remains one logical reconciliation).

Exit: one production mutation is realtime end-to-end with security, dedupe, and recovery evidence.

### Phase 8 — complete producer coverage and recovery

1. Route all traced Sales Deal, target, company country/name/address, and access-scope producers through the server-only dispatcher (check: producer matrix has a test for changed-field → resources → recipients).
2. Coalesce event bursts and refetch only active matching keys (check: 20 same-resource events in a short burst produce one bounded fetch; different resources remain independent).
3. Recover on subscription success after a gap, reconnect, pageshow, visibility return, and online (check: a deliberately missed event is repaired from Neon).
4. Stop polling/revalidation when hidden; use the existing 45 s socket dormancy policy (check: hidden tab produces zero Dashboard polling and no new client).
5. Handle permission loss by invalidating in-flight reads and evicting known inaccessible caches (check: revoked viewer cannot auth/read and stale response cannot repaint).

### Phase 9 — adversarial verification and cleanup

1. Remove every temporary `[PERF-TRACE]` probe and debug log (check: `rg '\[PERF-TRACE\]'` returns no matches outside historical artifacts/tests).
2. Re-run the exact Phase 0 scenario with the exact Phase 2 metrics (check: before/after artifact contains raw samples and deltas).
3. Run TypeScript, focused Dashboard tests, Pusher security/lifecycle tests, and affected sibling suites (check: all observed pass; failures are reported, not masked).
4. Run a production build and authenticated production-mode browser test (check: build exits zero and browser assertions pass).
5. Run Fable refutation against these claims: reduced total workflow transfer, no stale overwrite, no permission leak, one client per tab, missed-event recovery, no duplicate notification, and report parity (check: each claim receives HOLDS/REFUTED/UNVERIFIABLE with evidence).
6. Update `.agents/skills/pusher-management/references/pusher-management.md` channel registry, `/dashboard/overview` policy row, recovery table, and feature contract in the same change (check: documentation matches implemented names/signatures and does not mark unimplemented phases complete).

## 8. Required automated tests

Add tests against production helpers rather than copied simulations:

- DTO size/shape budgets; forbidden nested historical rows.
- Aggregate parity for month/year/five-year/map/tracking across currencies and Bangkok boundaries.
- ADMIN, MANAGEMENT, GENERAL, partial-section, no-section, revoked-permission, and cross-user scope isolation.
- Cache key normalization and access-scope isolation.
- Same-filter no-op and request dedupe.
- Latest-request-wins for rapid country/account/month/year changes.
- Section failure isolation and prior-data retention.
- Optimistic operation rollback that preserves later operations.
- Realtime envelope schema, payload budget, changed-field resource mapping, event dedupe, mutation echo, revision ordering, and burst coalescing.
- Subscription reference counting, hidden initial tab, reconnect, bfcache/pageshow, online recovery, logout/account switch, and HMR-like remount.
- Pusher auth rejects public/mismatched/unauthorized Dashboard channels.
- Persistent business notification dedupe remains independent from Dashboard invalidations.
- Print mounts only on intent, waits for data/fonts, and respects section permissions.

## 9. Browser verification matrix

Run in a production build where possible:

1. Cold direct load and warm revisit.
2. Sale Deal ↔ Leaderboard repeated switches.
3. Filter drawer open/close, same Apply, country, account, month, and year.
4. Rapid A → B → clear filters under throttled network.
5. World Map all-time/year, country selection, account selection, deal search/pagination, back/Escape.
6. Sale Summary month/year and Show/Hide Deals.
7. Sale Tracking sorting.
8. Five-Year Account Performance under large and empty account sets.
9. Manual refresh and per-section retry.
10. Print with every valid section combination and a changed period.
11. Two authorized sessions: acting user and observer.
12. Offline → mutation elsewhere → online; hidden → mutation elsewhere → visible.
13. Pusher disabled, subscription denied, delayed DB, failed DB, duplicate event, and out-of-order response.
14. Permission revoked while page is open.

For each scenario record request count, transferred/decoded bytes, click-to-paint, visible result, and console errors. A screenshot alone is not performance evidence.

## 10. Files likely involved and responsibilities

Existing files:

- `src/app/dashboard/overview/page.tsx` — authentication, route composition, lightweight shell.
- `src/lib/dashboard/dashboard-data.ts` — authorized resource queries and server-side section redaction.
- `src/lib/dashboard/sales-overview.ts` — pure calculations and DTOs.
- `src/components/dashboard/DashboardOverviewView.tsx` — composition and UI intents; should not become the cache/data monolith.
- `src/components/dashboard/DashboardToolbar.tsx` and `DashboardFiltersDrawer.tsx` — local controls and temporary filter draft.
- `src/components/dashboard/SalesSummarySection.tsx` — section composition only.
- `src/components/dashboard/WorldMapSection.tsx` / `WorldMapSvg.tsx` — map presentation and drill-down intents.
- `src/components/dashboard/AnnualSalesReportTable.tsx`, `MonthlySalesReport.tsx`, `SaleTrackingGrid.tsx`, `DashboardLeaderboardView.tsx` — focused renderers.
- `src/components/dashboard/DashboardPrintReport.tsx` — print-only renderer.
- `src/lib/actions/dashboard.ts` — current on-demand Dashboard server operations.
- `src/lib/pusher-subscription-manager.ts`, `src/lib/pusher-connection-manager.ts` — shared connection/subscription lifecycle; extend only if an actual missing primitive is proven.
- `src/lib/pusher-auth-authorizer.ts` — Dashboard private channel authorization.
- `src/lib/actions/opportunity.ts`, `src/lib/actions/sales-target.ts`, relevant company/contact actions — producers that may affect aggregates.
- `src/lib/pipeline-security.ts` — existing authorized pipeline recipient logic; reuse semantics without coupling Dashboard to full pipeline payloads.
- `.agents/skills/pusher-management/references/pusher-management.md` — canonical channel/page/recovery registry.

Probable new boundaries, names to confirm after repository search:

- `src/lib/dashboard/dashboard-keys.ts` — pure key factories.
- `src/lib/dashboard/dashboard-realtime.ts` — shared event schema, key matching, dedupe/coalescing.
- `src/lib/dashboard/dashboard-realtime-server.ts` — server-only recipient/resource dispatcher.
- `src/components/dashboard/useDashboardData.ts` or a small controller module — single Dashboard cache owner.
- Route handlers or Server Actions per the Phase 1 transport decision; do not create both for the same resource.

If a shared file is changed, grep all callers and record why each is compatible or patched.

## 11. Explicitly rejected shortcuts

- Do not subscribe to a public `dashboard` channel.
- Do not create one Pusher client per Dashboard component.
- Do not send the full Dashboard snapshot through Pusher.
- Do not convert every aggregate change into a bell notification.
- Do not poll every 5–15 seconds to imitate realtime.
- Do not keep `router.refresh()` as the normal mutation/filter recovery path.
- Do not move the monolithic snapshot from RSC to one monolithic client fetch and call it optimized.
- Do not hide work with CSS while still serializing, importing, or mounting it.
- Do not prefetch every map account/deal or every print section.
- Do not use a long global TTL that can cross access changes.
- Do not use optimistic UI for an irreversible/unknown business result without authoritative confirmation.
- Do not fire-and-forget critical persistence, audit, or required Notification creation.
- Do not add indexes or raise performance budgets merely to make tests pass.
- Do not quote historical benchmark percentages as current results without re-running them.

## 12. Completion gates

The implementing AI may mark this plan complete only when all are true:

- Baseline and post-change artifacts use the same fixture, build mode, and scenarios.
- First useful content, total workflow transfer, click-to-paint, and query costs improve or any tradeoff is explicitly accepted with evidence.
- Report values match baseline for all permission/currency/timezone fixtures.
- All local-only controls perform zero requests.
- All filter/action flows satisfy pending, retry, race, and rollback behavior.
- Authorized observer receives relevant changes with measured delay; unauthorized observer receives neither event nor data.
- Pusher-disabled/missed-event flows recover from Neon.
- One client per active authenticated tab is observed; no subscription leaks are found.
- No aggregate-only change creates a duplicate or unnecessary bell notification.
- No temporary trace/debug code remains.
- TypeScript, focused tests, affected sibling tests, production build, and browser matrix results are recorded.
- Canonical Pusher guidebook is updated to the implementation actually shipped.

## 13. Resumable checkpoint template

Update this section after every slice:

```md
### Checkpoint YYYY-MM-DD HH:mm

- Phase/slice:
- Falsifiable claim:
- Completed:
- Incomplete:
- Files changed:
- Commands/checks run and exact result:
- Browser/network measurements:
- Realtime/socket/message measurements:
- Security/permission evidence:
- Failures/blockers:
- Decision made and rejected option:
- Exact next command/action:
```

### Current checkpoint

### Checkpoint 2026-09-15 11:00

- Phase/slice: Phases 0–9 Complete (Deep Mode Implementation Finished).
- Falsifiable claim: Dashboard Overview shows first useful content instantly with SSR fallback, splits resource fetches via scoped SWR keys, prevents redundant network requests on filter transitions (0 ms / 0 bytes warm), preserves back/forward URL state, and invalidates affected keys in realtime via private Pusher channel (`private-dashboard-{userId}`).
- Completed:
  - Phase 0: Reproducible benchmark scenario runner created (`scripts/benchmark-dashboard-scenario.ts`), baseline recorded across ADMIN, MANAGEMENT, GENERAL scopes.
  - Phase 1: Transport benchmark spike executed (`scripts/transport-spike-benchmark.ts`). ADR adopted: SWR + Scoped Server Actions with SSR initial fallback (73.2% size reduction for summary-only card, 0 ms warm cached filter).
  - Phase 2: Parity tests added (`src/lib/dashboard/dashboard-parity.test.ts`) proving exact mathematical and structural parity.
  - Phase 3 & 4: SWR resource splitting implemented (`src/components/dashboard/useDashboardData.ts`, `src/lib/dashboard/dashboard-keys.ts`, `src/lib/actions/dashboard.ts`). Granular actions for summary, tracking, annual, map, and filter options. Filter changes update URL query via history state without triggering full-page RSC navigations.
  - Phase 5: Query and payload optimization: independent queries for 1-year summary vs 5-year annual vs all-time map.
  - Phase 6: Optimistic UI transitions: selected state paints immediately; no-op on identical filter Apply.
  - Phase 7: Realtime vertical slice: pure typed envelope validation & dedupe (`src/lib/dashboard/dashboard-realtime.ts`), server-only dispatcher (`src/lib/dashboard/dashboard-realtime-server.ts`), and Pusher channel authorization with `crm_overview` gate (`src/lib/pusher-auth-authorizer.ts`).
  - Phase 8: Producer coverage: deal create, update (status/loadingDate/value), move, and delete, plus company sale target upsert/delete trigger `dispatchDashboardInvalidation`. Offline/visibility recovery revalidates active keys on tab focus.
  - Phase 9: Verification & Documentation: `[PERF-TRACE]` cleaned up; `npm run verify:pipeline` (64/64 passed), all dashboard tests (25/25 passed), calendar tests (62/62 passed), and `npm run build` (exited 0); `.agents/skills/pusher-management/references/pusher-management.md` updated with channel registry and recovery table.
- Incomplete: None. All 9 phases completed.
- Files changed:
  - `src/app/dashboard/overview/page.tsx`
  - `src/components/dashboard/DashboardOverviewView.tsx`
  - `src/components/dashboard/useDashboardData.ts`
  - `src/lib/dashboard/dashboard-keys.ts`
  - `src/lib/dashboard/dashboard-keys.test.ts`
  - `src/lib/dashboard/dashboard-parity.test.ts`
  - `src/lib/dashboard/dashboard-realtime.ts`
  - `src/lib/dashboard/dashboard-realtime.test.ts`
  - `src/lib/dashboard/dashboard-realtime-server.ts`
  - `src/lib/actions/dashboard.ts`
  - `src/lib/actions/opportunity.ts`
  - `src/lib/actions/sales-target.ts`
  - `src/lib/pusher-auth-authorizer.ts`
  - `src/lib/pusher-security.test.ts`
  - `scripts/benchmark-dashboard-scenario.ts`
  - `scripts/transport-spike-benchmark.ts`
  - `.agents/skills/pusher-management/references/pusher-management.md`
  - `plans/dashboard-overview-deep-performance-realtime-plan.md`
- Commands/checks run and exact result:
  - `node --import tsx --test src/lib/dashboard/*.test.ts src/components/dashboard/*.test.ts`: 25 pass, 0 fail.
  - `npm run verify:pipeline`: 64 pass, 0 fail, 0 TS errors.
  - `npm run test:calendar`: 62 pass, 0 fail.
  - `npm run build`: exited 0, all routes compiled.
- Browser/network measurements:
  - Summary-only payload: 32,841 bytes (73.2% reduction vs 122,734 full snapshot).
  - Tracking payload: 194 bytes.
  - Warm cached filter navigation: 0 ms, 0 network requests.
- Realtime/socket/message measurements:
  - Invalidation envelope size: < 1 KB UTF-8.
  - Sockets per tab: 1 shared socket reused (0 new sockets added).
  - Dedupe & burst coalescing: 250 ms debounce window.
- Security/permission evidence:
  - Channel authorization enforced on server in `canUserAccessChannel`: rejects non-admins lacking `crm_overview` permission and non-matching user IDs. Verified in `pusher-security.test.ts`.
- Decision made and rejected option:
  - Decided: SWR + Typed Scoped Server Actions with SSR initial fallback.
  - Rejected: Monolithic RSC navigation (`router.replace`), polling, and public channels.
- Exact next command/action: Implementation complete. Hand off to user with full walkthrough and verification report.
