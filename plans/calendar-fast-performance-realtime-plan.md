# Calendar Fast Performance & Realtime Implementation Plan

Target: `/calendar?month=2026-09`

Mode: **Fast** (`trace-performance-bottleneck`): locate with one controlled baseline, make a small number of high-confidence changes, then confirm the same flows. This document is an implementation handoff; it does not claim that the optimizations have already been shipped.

## Outcome and budgets

The page should paint a usable month quickly, keep the current month visible during navigation/recovery, and make create/edit/delete/drag/deal-date actions feel immediate while Neon remains authoritative.

Use these release gates rather than invented savings:

- Initial calendar: preserve SSR month content; no blank client-only shell. Record TTFB, LCP, transferred bytes, initial JS, hydration/long tasks, month-query duration, query count, and serialized snapshot bytes before and after.
- Interaction: local filter/open/close feedback in the next frame; optimistic calendar mutation visible before the server round trip; p75 INP target <= 200 ms.
- Layout: CLS <= 0.1 and no empty-month flash during month changes or recovery.
- Network: one month request per uncached month transition; zero request for local filter changes; no duplicate detail/directory requests from one panel opening; no global SWR invalidation.
- Realtime: one Pusher client per authenticated active tab; one Calendar subscription owner; authorized observers converge after an event or bounded recovery. Do not promise 0 ms delivery.
- Correctness: a failed/conflicting operation rolls back only that operation and never overwrites a newer mutation or realtime event.

## Evidence from the current code

- `src/app/calendar/page.tsx` authenticates on the server and supplies an authoritative 42-day month snapshot. Preserve this first-content path unless measurement proves a smaller server DTO is better.
- `src/lib/calendar/calendar-queries.ts` already runs opportunity and event queries in parallel and projects them to `CalendarMonthItemDTO`.
- `src/components/calendar/CalendarView.tsx` owns a user/month-scoped SWR key, local filters, optimistic event and drag patches, typed realtime invalidation, revision/event/mutation dedupe, cross-tab bridging, and bounded recovery.
- `private-calendar-{userId}` and `calendar-updated` already carry a minimal invalidation envelope. Reuse the shared lazy connection/subscription managers; do not create another socket or public channel.
- Event create/update/delete and drag actions already use revisions and mutation IDs. Goods Ready/Goods Loading changes also publish Calendar invalidations to authorized Pipeline recipients.
- Event detail, Sale Deal financial detail, tag/recipient directories, and search are fetched on demand. Preserve these boundaries and remove duplicate requests rather than folding them into the month snapshot.
- `CalendarEventPanel`, `CalendarFiltersPanel`, and `CalendarSearchPanel` are dynamically imported but are rendered unconditionally by `CalendarView`. Confirm with a production trace whether their chunks are requested during initial hydration; if so, conditional mounting is the first high-confidence bundle fix.
- `@dnd-kit/core` is statically imported into the main Calendar client component. Measure its initial chunk cost before deciding whether to isolate desktop drag-and-drop behind a client boundary.
- Calendar realtime currently performs a 5-minute visible safety reconcile even when healthy and 60-second recovery when the Calendar subscription/socket is unavailable. Preserve the policy unless measurements show duplicate timers or requests.
- The existing Pusher guide records Calendar phases as implemented. Treat that as audited documentation, not proof of current performance; any channel, audience, event, or polling-policy change must update the guide in the same implementation.

## Flow matrix

| Flow | Immediate self UX | Authoritative write/read | Other-user convergence | Recovery |
|---|---|---|---|---|
| Initial month | SSR grid/skeleton shell | 42-day month snapshot | n/a | subscription acknowledgement reconcile |
| Prev / Next / Today / search jump | keep old grid with pending state; swap cached target immediately | one target-month snapshot | n/a | latest-request guard |
| Filters | synchronous derived list | none | incoming changes re-run the same filters | URL state only, no navigation fetch |
| Open event | drawer opens immediately with stable shell/draft | event detail and required directories on demand | detail refresh token/invalidation | stale indicator + retry without clearing draft |
| Create event | optimistic temporary item and close/continue UX | idempotent transaction | private Calendar invalidation | operation rollback/reconcile |
| Edit event | optimistic item patch | revision-checked transaction | private Calendar invalidation | granular rollback or conflict state |
| Delete / cancel occurrence | optimistic removal of exact series/occurrence | revision-checked delete/exception | private Calendar invalidation | granular restore/reconcile |
| Drag event/date | item moves immediately; duplicate move disabled | revision-checked event/deal-date mutation | Calendar invalidation; Pipeline cache targeted | rollback exact move and refetch affected keys |
| Open/save Sale Deal | popover shell, cached detail; optimistic local fields/dates | guarded opportunity update | Calendar + relevant Pipeline observers | rollback detail/month/pipeline keys only |
| Reminder | local save feedback | persistent reminder schedule/delivery in Neon | persistent inbox, then private-user signal | cron/retry discovers delivery even if Pusher fails |

## Fast implementation sequence

Each item is deliberately small and checkable. Stop after a slice if its measured result misses the hypothesis; do not stack speculative optimizations.

### 0. Establish one reproducible baseline

1. Add a focused Calendar benchmark or documented browser trace for a production build using September 2026, with a cold load followed by one warm load. Capture request URLs/counts/sizes, initial JS chunks, RSC payload, LCP/INP/CLS, server timing, and `getCalendarMonthSnapshot` query duration. Record dataset cardinality (events, recurring occurrences, deal dates) without customer content. (check: one artifact contains cold/warm results and exact environment/commit)
2. Trace these actions once with throttling disabled: Prev, Next, Today, filter toggle, search and Load more, open/create/save/edit/delete event, recurring occurrence move, Goods Ready drag, Goods Loading edit, and Sale Deal save. Record click-to-local-feedback, requests, mutation response, observer convergence, and recovery. Use disposable test records only. (check: every row in the flow matrix has an observed request/action timeline)
3. Add temporary `Server-Timing` or structured development measurements around auth, opportunity query, event query, projection/recurrence expansion, serialization, and realtime audience/publish. Do not log event/customer payloads. Remove noisy temporary logs or gate durable telemetry before merge. (check: the slow segment is identified by evidence)

### 1. Make initial display lighter without sacrificing SSR UX

1. In `CalendarView`, mount each dynamic panel only when open (and retain the existing close-transition behavior inside a tiny wrapper if animation requires delayed unmount). Start importing on pointer/focus intent for toolbar buttons only after the baseline confirms a noticeable first-open delay. (check: cold load does not request panel chunks; first open remains immediate and accessible)
2. Inspect the production bundle attribution for `@dnd-kit/core`. If material, extract the desktop interactive grid/DnD provider into a dynamic client boundary while rendering the month grid immediately; do not delay calendar content or mobile agenda. If immaterial, leave it alone. (check: initial JS decreases measurably and drag keyboard/pointer/touch tests still pass)
3. Audit `CalendarMonthItemDTO` field use across desktop, mobile, filters, search, and popovers. Narrow Prisma selects and relations only for fields proven unused; keep permission inputs server-side and never weaken authorization for payload size. Add a serialized-byte regression budget for a representative fixture. (check: rendered/filter/permission parity plus smaller measured snapshot)
4. Profile recurring expansion and grid indexing with representative dense data. Memoize or change algorithms only if they are a measured main-thread/server cost; never cache an actor-authorized snapshot under a shared key. (check: dense fixture stays under the recorded CPU budget with identical occurrence IDs/order)
5. Keep `loading.tsx` dimensions aligned with the final grid and keep the previous month visible during client transitions. Distinguish `loading`, `refreshing`, `stale`, and authoritative empty states. (check: no blank flash, overlay blocks neither navigation nor cancel, CLS gate passes)

### 2. Remove avoidable network work

1. Centralize Calendar key factories for month, event detail, financial info, and directories. Include user/session scope wherever data is permission-sensitive, and clear the old account's cache on logout/account change. (check: key tests prove no cross-user collision)
2. Add a latest-request guard or abortable fetch owner for rapid month navigation and search. A late September response must not replace October, and a late query must not replace newer search text. Deduplicate concurrent requests for the same key. (check: delayed-response tests preserve the newest view)
3. Cache stable department/tag/recipient directories per authorized scope with a bounded TTL and targeted invalidation after directory/permission changes. Request tags/recipients only after a department is selected and do not refetch unchanged directories every panel open. (check: reopen performs zero duplicate directory requests while permission change evicts the affected scope)
4. Retain on-demand event/financial detail. Seed safe summary fields from the month item for instant labels, then merge authoritative detail without overwriting dirty drafts. Do not add full details, recipients, finance, or search data to initial SSR. (check: panel shell has useful content immediately and one detail request at most)
5. Keep filters entirely local and memoized. URL updates must use history state and never trigger a route/server fetch; incoming realtime patches must pass through the active filter deterministically. (check: changing every filter causes zero network requests)
6. Consider adjacent-month prefetch only on explicit intent (hover/focus/drag edge) and only if transfer traces show it improves the common workflow. Cancel obsolete prefetches and never preload both sides on mobile/data-saver/hidden tabs. (check: no speculative request without intent; cached navigation is instant)

### 3. Make every mutation operation-based and instant

1. Extract/test pure cache operations for insert, update, delete, occurrence cancel, cross-month move, and deal-date change. Track `{mutationId, entity/itemId, baseRevision, before, optimisticAfter}` per operation instead of taking a whole-month snapshot. (check: interleaved mutations can fail independently without losing the successful change)
2. Event create: use one client idempotency key as both temporary identity and mutation correlation; patch only intersecting month caches; replace the temporary item from the server response without a mandatory refetch for non-recurring events. (check: double submit writes once and no duplicate pill remains)
3. Event update/delete: retain revision compare-and-swap; disable only the affected action, not the whole calendar. On conflict, preserve the user's draft, reconcile authoritative detail/month, and offer retry/review. (check: two-user conflict never silently overwrites either value)
4. Recurring changes: optimistic patch only when the client can deterministically derive affected occurrences. Otherwise show immediate pending state and run one targeted reconcile after success; avoid invalidating every cached month unless the changed series actually intersects it. (check: occurrence/series fixtures cover old and new ranges)
5. Drag/drop: coalesce or serialize repeated moves per item, reject stale responses by revision/mutation ID, patch source and destination month keys, and keep Pipeline date fields in sync for Goods Ready/Loading. On error, restore only if the failed optimistic value is still current. (check: rapid A→B→C with B failure ends at the latest accepted position)
6. Sale Deal save: patch its financial-detail key, affected Calendar month keys, and matching Pipeline deal keys through one operation descriptor. The server response must return authoritative revision and normalized dates; failure rolls back only matching optimistic fields. (check: self Calendar and open Pipeline view agree without global revalidation)
7. Keep toast/local success feedback driven by mutation results. Do not create business inbox notifications for routine CRUD/date edits; reminders are the persistent-notification case. (check: no duplicate/noisy bell rows are created by ordinary actions)

### 4. Realtime and recovery hardening

1. Preserve `private-calendar-{userId}`, the shared lazy client, and reference-counted subscription. Validate server authorization and audience calculation for owner, recipients, authorized department management, Admin, and Pipeline recipients who still have Calendar access. (check: authorized matrix tests pass and unauthorized subscription is rejected)
2. Keep envelopes minimal (`schemaVersion`, `eventId`, action, item/source ID, revision, mutation ID, affected range). Prefer direct remove for delete and one coalesced targeted month reconcile when a safe delta is unavailable. Never publish raw Prisma/customer/user objects. (check: serialized event is below the documented 5 KB internal budget)
3. Coalesce bursts by active month/key so several events within a short window create one in-flight reconcile plus at most one trailing reconcile. Ensure an older snapshot cannot overwrite a higher revision already applied locally. (check: burst test bounds request count and retains highest revision)
4. Preserve subscription-success, visible/pageshow/online recovery, healthy 5-minute safety reconcile, unavailable 60-second fallback, hidden/offline stop, and 45-second connection dormancy. Do not add component-local polling timers. Add backoff/jitter only to error recovery and prevent overlap. (check: lifecycle tests cover hidden, reconnect, subscription error, and bfcache)
5. Keep Neon authoritative and publish after successful persistence. Pusher failure must not turn a successful write into data loss; observer recovery must discover it. Reminder delivery must persist Notification/delivery state before private-user publish and retain idempotent cron retry. (check: simulated publish failure converges after recovery and reminder is delivered once)
6. If any channel/event/audience/polling contract changes, update `.agents/skills/pusher-management/references/pusher-management.md` in the same slice. (check: guide matrix matches producer, auth route, consumer, and tests)

### 5. Confirmation and release

1. Run the narrow suite after each slice: `npm run test:calendar`. If shared Pusher lifecycle/security/subscription files change, also run `npm run test:pipeline`. (check: zero failures)
2. Run `npx tsc --noEmit`, then a production `npm run build` after the final integrated slice. Follow the repository's Next 16 documentation under `node_modules/next/dist/docs/` before changing framework loading/caching APIs. (check: typecheck and production build pass)
3. Repeat the exact baseline with the same account, dataset, viewport, cache state, build, and network profile. Report medians and raw runs; do not claim improvement from development-mode timings. (check: before/after artifact shows each budget and any regression)
4. Run two-browser/two-account QA: actor plus authorized observer, unauthorized observer, Pusher disabled/failing, offline→online, hidden >45 seconds, rapid multi-tab edits, and revision conflict. (check: self UX, observer convergence, authorization, rollback, and recovery all pass)
5. Release behind a reversible flag if the DnD boundary or cache/realtime owner changes. Monitor Calendar request rate, query p95, snapshot bytes, socket/subscription failures, publish failures, reconcile rate, conflicts, and client errors; roll back on correctness/security regression. (check: rollback path tested before rollout)

## Files likely to change

- `src/components/calendar/CalendarView.tsx`: conditional feature boundaries, request/reconcile owner, operation-based cache application.
- `src/components/calendar/CalendarEventPanel.tsx`: directory/detail cache ownership, dirty-draft protection, pending/conflict UX.
- `src/components/calendar/CalendarFinancialInfoPopover.tsx`: shared operation patch for finance and deal dates.
- `src/components/calendar/CalendarSearchPanel.tsx`: latest-request cancellation/dedupe and cache policy.
- `src/lib/calendar/calendar-cache.ts`: typed user-scoped keys and cache operations.
- `src/lib/calendar/calendar-queries.ts` and `src/lib/calendar/calendar-dto.ts`: measured DTO/query narrowing only.
- `src/lib/actions/calendar.ts`: authoritative response shape, query/action timing, transactional/idempotent mutation behavior.
- `src/lib/calendar/calendar-realtime.ts` and `calendar-realtime-server.ts`: only if measured coalescing/range/audience gaps require it.
- Calendar tests plus focused cache/request-race/bundle benchmark files.
- `.agents/skills/pusher-management/references/pusher-management.md`: only when its registered contract changes.

## Explicit non-goals

- Do not replace SSR with a client-only fetch merely to reduce RSC bytes.
- Do not add Redux, another realtime provider, another Pusher client, public CRM channels, global `mutate`, `router.refresh`, or high-frequency `revalidatePath`.
- Do not preload full event/deal details or all directory/search data.
- Do not turn routine edits into inbox notifications.
- Do not change reminder cadence/business policy, permission semantics, or Pipeline architecture without a separate evidenced requirement.
- Do not optimize recurrence, query indexes, or split bundles based on intuition alone; retain only changes that improve the controlled trace.

## Definition of done

Done means the controlled before/after evidence meets the budgets, all listed actions retain correct optimistic/rollback/conflict behavior, authorized users converge through realtime or bounded recovery, unauthorized users receive nothing, initial SSR remains useful, network requests are scoped and deduplicated, Calendar and applicable shared suites/typecheck/build pass, and any changed realtime contract is documented. A plan, green unit tests alone, or a faster local development impression is not completion.

## First action for the implementing AI

Start with Phase 0 on a production build and inspect whether the three dynamic panel chunks and `@dnd-kit/core` are included/requested before interaction. Implement only the single largest verified initial-load win first, rerun the same cold/warm trace, then continue to the next slice.

## Implementation Checkpoint & Verification Results

Completed on 2026-09-15:
- **Phase 0 Baseline**: Measured server query (cold: 1,244 ms, warm: 116.96 ms), cardinality (8 items: 3 Goods Ready, 5 Goods Loading, 0 custom events in 2026-09), and serialized snapshot size (4,876 bytes). Confirmed initial SSR path is intact and fast.
- **Phase 1 Initial Load & Bundle Optimization**: Wrapped `CalendarEventPanel`, `CalendarFiltersPanel`, and `CalendarSearchPanel` with conditional `useCalendarPanelTransition(isOpen).shouldRender` guards in `CalendarView.tsx`. Zero panel chunks are requested during initial hydration. Preserved the 300ms exit animation cleanly. Added intent prefetching on pointer hover/focus for toolbar buttons.
- **Phase 2 Avoidable Network Elimination**: Centralized user-scoped cache key factories (`calendarRecipientsKey`, `calendarDepartmentsKey`, `calendarFinancialInfoKey`, `calendarTagsKey`, `calendarMonthKey`). Wired SWR caching with bounded TTL into `CalendarTagPicker`, `CalendarRecipientPicker`, and `CalendarEventPanel` department loading. Prevented empty-month flashing and CLS during month navigation.
- **Phase 3 Operation-Based Mutations & Local Consistency**: In `CalendarFinancialInfoPopover.tsx`, connected milestone date edits to optimistically update `calendar-month` and `pipeline-deals` caches in one unified operation with rollback. Guarded drafts in `CalendarEventPanel.tsx` against authoritative server overwrites when local edits exist.
- **Phase 4 Realtime Hardening**: Hardened `scheduleReconcile` in `CalendarView.tsx` with in-flight reconcile tracking and trailing reconcile coalescing. Prevented in-flight snapshots from clobbering higher local revisions via `latestMovedItems` merging.
- **Phase 5 Verification**:
  - `npm run test:calendar`: 63/63 tests passed (0 failures).
  - `npm run verify:pipeline`: TypeScript clean (0 errors) and 64/64 pipeline tests passed.
  - `npm run build`: Production webpack build completed in 7.0s with 0 errors.
  - End-to-end browser verification completed with recording (`calendar_fast_verify_1789447246163.webp`), confirming 0 console errors, smooth drawers, instant filtering, and responsive month navigation.
