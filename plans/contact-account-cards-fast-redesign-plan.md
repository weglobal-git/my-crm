# Account Cards — Fast Redesign Implementation Plan

Mode: **Fast** (`Locate → Optimize → Confirm`)

## Scope decision based on the repository

The requested UI and every cited component belong to the Account & Person page implemented by `src/app/contact/page.tsx` and `src/components/contact/ContactView.tsx`, not to the Sales Dashboard at `/dashboard/overview`.

Therefore this plan treats `/dashboard/overview` and Pipeline as **layout/toolbar references** and redesigns the Account experience at `/contact`. It deliberately preserves the existing World Map, Sale Summary, annual report, print flow, and leaderboard on `/dashboard/overview`.

This is the first acceptance gate for the implementing AI: confirm the target route with the product owner before editing. If the product owner truly wants to replace `/dashboard/overview`, stop and revise route permissions, navigation, and ownership first; do not silently delete the Sales Dashboard. (check: approved route is recorded in the implementation checkpoint)

## Desired result

Replace the current desktop master-detail split with one full-width Account card list beneath a compact page toolbar. Remove the large inline analytics and person table from the page; opening an Account card launches the existing `EditAccountPanel`, where detailed account/person data remains available.

The card columns are:

1. Success Rate (%)
2. Account Display Name with Account Name as secondary text
3. Company Name
4. Editable Star Rating
5. Account Type
6. Country

The current schema has only `Company.displayName` and `Company.name`; it has no third independent “Company Name” field. Use this mapping unless the product owner requests a schema change:

- Account Display Name = `Company.displayName || Company.name`
- Account Name = `Company.name`
- Company Name = do not render a duplicate column; label the combined name column “Account / Company”.

Do not invent or denormalize another name field solely to fill the mockup. (check: accepted field mapping is documented before DTO implementation)

## Visual and interaction specification

### Page structure

- Keep `WorkspaceLayout`; use `scrollMode="hidden"` with a fixed toolbar and internally scrolling body, matching Pipeline’s toolbar/body rhythm.
- Desktop toolbar: Qualified/Unqualified tabs on the left; expanding Search, result count, centralized Filters, and Add Account on the right.
- Body: one full-width virtualizable/paginated list with a compact column header and rows shaped like the supplied mockup.
- Flat dark theme only: page `#252728`, rows/panels `#3A3B3C`, hover `#4E4F50`, active/selected `#C7F33C`, subtle borders, generous rounding, **no shadows and no gradients**.
- Selected/keyboard-focused card may use lime border/background tint. Do not keep a persistent right-hand detail column.
- Mobile: stack Success Rate + names on the first line and Rating + Type + Country below; toolbar tools move into the existing mobile manage surface. Do not force the six-column desktop grid into horizontal overflow.
- Skeleton rows reserve the final row height and column widths to avoid CLS.

### Card actions and event priority

- Normal click on the row opens `EditAccountPanel` for that company.
- Star click edits rating only and must not open the panel (`stopPropagation`). Each star is a real button with an accessible label.
- On macOS, `Meta + primary click` on Account Type or Country applies that exact filter; on Windows/Linux, `Ctrl + primary click` does the same.
- Plain click on Type/Country follows the row action and opens the panel. Modifier click must prevent row opening and browser navigation.
- Modifier filtering is additive: Type click preserves status/country/search and replaces type; Country click preserves status/type/search and replaces country.
- `Escape` priority: close an open dropdown/drawer first; otherwise clear Search and all applied filters; otherwise close the edit/create panel. It must not erase an unsaved panel draft without the panel’s existing confirmation policy.
- Filters applied by modifier click must show an active chip/count in the toolbar so the state is never hidden.
- Keyboard users get equivalent filtering through the Filters drawer; Enter/Space on a focused row opens edit. Do not require a modifier-click-only path.

## Current flow and observed risks

- `ContactView` currently owns filters, SWR list data, infinite scrolling, selected account, rating mutation, private-contact subscription, the two-column UI, inline `AccountAnalyticsCard`, and `PersonTable`.
- `getCompaniesWithContacts` already returns a lean 20-row list with display/name/country/status/type/star/counts, but it does not return Success Rate. Fetching `getAccountOverview` once per card would create an N+1 and transfer contacts/deals/details that the list does not need.
- Existing Success Rate is calculated in `getAccountOverview` as `won opportunities / all opportunities`, including open opportunities in the denominator. Preserve this formula initially for parity; changing it to won/(won+lost) is a separate business decision.
- The page preloads five heavy account-overview records after 200 ms and preloads adjacent filter sets after 800 ms. Once details are drawer-only, the eager overview preloads are likely wasted transfer and must be measured/removed or replaced with intent-based preload.
- Rating already paints optimistically and uses a per-company sequence guard. Its server action writes the Company and audit log transactionally, then emits `account-updated`, but it also calls `revalidatePath('/contact')` and uses a shared `private-contacts` event. The implementation must preserve server authorization/audit and reconcile other viewers without refreshing the whole route.
- `ContactView` patches several independent local/SWR copies. The redesign should make the paginated Account list cache the single authoritative client owner to prevent stale copies and whole-filter refetches.
- `PipelineSearch` contains shadow classes that conflict with this CRM design system. Reuse its expanding behavior, not its styling verbatim.
- The Pusher guide’s `/contact` row still describes “public events” although current code subscribes to `private-contacts`. Treat this as documentation drift and update the canonical guide if the implementation changes or confirms the contract.

## Data contract

Create a dedicated list DTO rather than returning `AccountOverviewResult`:

```ts
type AccountCardDTO = {
  id: string;
  displayName: string | null;
  name: string;
  status: ContactStatus;
  type: ContactType;
  country: string | null;
  starRating: number;
  successRate: number;
  wonDealsCount: number;
  totalDealsCount: number;
  revision: string; // server-issued ordering token, preferably updatedAt ISO
};
```

- Compute deal counts for the page in one database operation or bounded aggregate query, not one query per Account. Select only IDs/status fields needed by the aggregation.
- Return cursor/page metadata, total for the active filter, and filter option counts separately from card rows when their invalidation cadence differs.
- Search only fields needed by this screen: display name, account/company name, country, and optionally explicitly approved contact identifiers. Preserve contact masking/permission rules; do not expose person data in card results.
- Add an index only after an `EXPLAIN`/query timing proves the current composite indexes do not serve the chosen filter/order/search path. Do not run `prisma db push`; use an additive migration when a schema change is justified.
- Scope cache keys by authenticated actor/access scope plus `{status,type,country,search,cursor}`. Never share permission-sensitive list results across users.

## Fast implementation sequence

Every task ends with an observable check so another AI can implement one verified slice at a time.

### 0. Locate with one controlled baseline

1. Confirm `/contact` as the functional target and `/dashboard/overview` as the visual reference. (check: route decision recorded; Sales Dashboard preservation test identified)
2. In a production build, record one cold load and one warm load for the default Qualified/Customer view: document/RSC bytes, initial JS, list action time/query count, first usable row, and requests caused during the first two seconds. (check: trace shows whether five overview and adjacent-filter preloads fire)
3. Record single flows for Search, Country filter, Account Type filter, card open, rating 1→5→2, Edit save, and a second authorized browser receiving the update. (check: each flow has request count and click-to-paint/server/observer timestamps)

### 1. Build the lean Account-card resource

1. Extract an `AccountCardDTO` query/action from `getCompaniesWithContacts` or add a focused card-list action; keep auth and department/contact masking at the server boundary. Aggregate Success Rate for the returned page in bulk and preserve the current formula. (check: one page load has no per-card query and DTO snapshot contains no contacts, addresses, logs, opportunity objects, or AI data)
2. Add a typed, actor-scoped cache-key factory and one SWR Infinite/paginated owner for list rows. Derive rendered rows, counts, filtering membership, and sort order from that cache instead of mirroring it into a second `companies` state array. (check: key tests prevent cross-user/filter collision and load-more deduplicates IDs)
3. Keep the first page as a lean authorized SSR fallback if its measured payload improves first usable content; do not move it to CSR merely to shrink HTML. If the DTO is still heavy, compare SSR-first-row versus shell-first before changing architecture. (check: controlled before/after shows the chosen path improves first usable row and total workflow transfer)
4. Remove idle preload of the top five `AccountOverviewResult`s. Preload the edit-panel chunk and selected Account detail only on card pointer/focus intent, with one canonical detail key and data-saver/hidden-tab guards. (check: cold idle causes zero account-detail requests; hovered card opens with at most one detail request)

### 2. Replace the two-column UI

1. Extract a presentation-only `AccountCardList` and memoized `AccountCardRow`; keep fetch/mutation/realtime ownership in the page-level Account view/hook. (check: changing one row’s rating does not rerender every unchanged row in React Profiler)
2. Replace the master-detail DOM in `ContactView` with `AccountToolbar` + full-width list. Keep infinite scroll or cursor pagination and preserve scroll position when a drawer opens/closes. (check: 20, 200, and empty-result fixtures render with stable toolbar and no horizontal desktop split)
3. Remove the `AccountAnalyticsCard` and `PersonTable` imports/renders from `ContactView`. Confirm all needed detail/person functions are reachable in `EditAccountPanel`; delete the component files only if an `rg` caller sweep proves they are orphaned. (check: no runtime import/caller remains and edit panel still exposes person management)
4. Implement desktop grid columns and responsive stacked mobile cards from the visual specification. Use CSS grid with one shared template for header/rows; truncate names with accessible full-value titles. (check: visual QA at 375, 768, 1280, and 1440 px; no overlap or layout shift)
5. Dynamically mount `EditAccountPanel`, `CreateAccountPanel`, and the Filters drawer only while open/transitioning. Use pointer/focus intent to warm their chunks. (check: initial network contains none of the inactive panel/drawer chunks and first open remains responsive)

### 3. Centralize Search and Filters

1. Create an Account-specific expanding search component using PipelineSearch behavior: collapsed icon, click/S shortcut to expand, 250–300 ms debounce, Escape clear/collapse, latest-request guard, and no shadows. Do not import Pipeline-specific panel checks or text. (check: typing ten characters quickly produces one final request and an older response cannot replace it)
2. Create one dynamic `AccountFiltersDrawer` containing Status, Account Type, Country, rating range if retained, and any currently supported filters. Apply as one atomic draft; show active count and Reset. (check: Apply causes one key transition/request; Cancel causes none; Reset restores defaults)
3. Implement modifier-click through a pure helper such as `getAccountQuickFilterIntent(event, field, value)`. Accept primary-button Meta on macOS and Ctrl elsewhere, preserve other filters, and prevent the row-open action. (check: unit tests cover Meta, Ctrl, plain click, middle click, missing country, and repeated same value)
4. Add one document-level Escape owner with explicit priority. Do not register competing handlers in every row. Synchronize filter/search state to URL using `history.pushState/replaceState`, and restore it on `popstate` without a full navigation. (check: Escape, Back, and Forward produce the expected UI with no document/RSC request)
5. Filter/search server-side across the full dataset; never filter only loaded pages. Keep previous results visible with a subtle pending indicator during key transitions. (check: an item beyond page one is discoverable and no empty-list flash occurs)

### 4. Make rating and edit actions instant and race-safe

1. Move rating logic into a focused mutation owner that applies an operation-scoped patch across only matching Account list/detail keys. Track `{companyId, mutationId, sequence, before, optimisticAfter}` and retain the existing server transaction/audit. (check: rapid 1→5→2 with response order 5→1→2 ends at 2)
2. Return the authoritative rating and revision from the action. Ignore the actor’s own Pusher echo by mutation ID; apply newer observer updates by revision. Roll back only if the failed optimistic value is still current. (check: one failed middle request never undoes a later successful rating)
3. For Edit Account save, optimistically patch safe card fields (display/name/type/country/rating/status), then merge the authoritative DTO. Recalculate membership: a Type/Country/Status edit may remove the card from the active filtered list and adjust counts. Preserve dirty panel drafts when a remote event arrives. (check: two-user edit/conflict tests preserve the latest authoritative value and the local unsaved draft)
4. Remove route-wide refresh/revalidation from high-frequency rating/edit paths once all sibling consumers have targeted reconciliation. Use exact SWR list/detail keys; never `mutate(() => true)`. (check: rating produces one mutation request, zero page/RSC refresh, and no unrelated dashboard fetch)
5. Critical Company persistence and audit logs remain awaited/transactional. Realtime publish may fail without losing the write; surface self success from the mutation response and let observer recovery reconcile from Neon. (check: simulated Pusher failure keeps the saved rating and observer catches up on recovery)

### 5. Realtime, notification, and recovery contract

1. Reuse the shared lazy Pusher client and reference-counted subscription manager; do not create another connection for Dashboard/Contact cards. Confirm `private-contacts` authorization and recipient scope before relying on it. (check: one authenticated tab with Header + Account page still has one socket)
2. Replace ad-hoc event shapes only if necessary with a versioned minimal Account envelope: `eventId`, `mutationId`, `companyId`, `action`, `revision`, changed safe fields, and old/new filter membership hints. Never send contacts, notes, addresses, AI content, or raw Prisma rows. (check: payload is authorized and below the guide’s 5 KB internal budget)
3. Consumer logic must patch a row when safe and target-revalidate active list/detail keys when membership/count/order cannot be derived. Coalesce bursts; subscription success, focus, online, and pageshow trigger one scoped recovery. Hidden/offline tabs do not poll. (check: reconnect and 20-event burst converge with bounded request count)
4. Routine rating/edit/status changes use local feedback plus realtime data events, not persistent inbox notifications. Create a bell notification only for an existing business workflow requiring another person to act. (check: rating/edit creates zero Notification rows)
5. Update `.agents/skills/pusher-management/references/pusher-management.md` in the same change to correct the `/contact` channel/current-state row and document any new event/recovery contract. (check: guide, auth route, producer, consumer, and tests name the same private channel/event)

### 6. Confirm and release

1. Add focused tests for Account card projection/success rate, cache keys, pagination dedupe, quick-filter intent, Escape priority, rating race rollback, realtime revision/membership, and permission-safe DTOs. (check: each test fails against the removed/old behavior and passes after the slice)
2. Run `npx tsc --noEmit` and the relevant contact/Pusher suites discovered from `package.json`; if shared Pusher lifecycle/security code changes, also run `npm run test:pipeline`. Run a production `npm run build` after reading the relevant Next 16 guide under `node_modules/next/dist/docs/`. (check: all commands exit 0; unrelated failures are recorded verbatim)
3. Repeat the exact Fast baseline and report observed values, not estimated percentages. Confirm initial transfer, detail preload removal, search/filter request count, card-open latency, rating self paint, observer convergence, INP <= 200 ms, LCP <= 2.5 s, and CLS <= 0.1. (check: before/after artifact uses the same build/data/account/network profile)
4. Run accessibility and interaction QA: keyboard row open, star labels/focus, Meta/Ctrl modifier clicks, Escape priority, reduced motion, mobile Filters, empty/error/loading/stale states, and focus return after drawer close. (check: scripted/manual matrix is attached to the handoff)
5. Regression-check `/dashboard/overview` World Map, Sale Summary, annual report, leaderboard, print, and filters remain unchanged. (check: existing dashboard tests and a smoke trace pass)

## Expected files

Primary changes:

- `src/components/contact/ContactView.tsx` — becomes orchestration shell; removes master-detail and duplicate list state.
- New focused Account card list/row, toolbar/search, filters drawer, and data/mutation hook modules under `src/components/contact/`.
- `src/lib/actions/contact.ts` — lean card query/projection and authoritative mutation response; preserve authorization/audit.
- New `src/lib/contact/` modules for DTO, cache keys, pure filter intent, cache operations, and realtime decisions where justified.
- `src/components/contact/EditAccountPanel.tsx` — only targeted cache integration/draft-safe realtime reconciliation, not a redesign.
- `src/app/contact/page.tsx` — lean initial Account-card page fallback.
- Contact-focused tests and canonical Pusher guide update.

Remove after caller sweep:

- `AccountAnalyticsCard` render/import and possibly the now-orphaned file.
- `PersonTable` render/import and possibly the now-orphaned file.

Must remain unchanged unless route scope is explicitly revised:

- `src/app/dashboard/overview/page.tsx`
- `src/components/dashboard/*`
- Dashboard sales query/realtime modules

## Non-goals

- Do not delete or repurpose the Sales Dashboard based only on the URL in the request.
- Do not fetch `getAccountOverview` per card, preload every drawer detail, or place person data in the list DTO.
- Do not add virtualization until profiling shows DOM cost; pagination/infinite loading is adequate by default.
- Do not copy Pipeline-specific deal state, permissions, or shadow styling into Contact.
- Do not create a new Company-name column in the database without an explicit semantic requirement.
- Do not weaken contact masking/RBAC, add public CRM channels, add polling while realtime is healthy, or notify everyone for routine edits.

## Definition of done

The redesign is done only when the approved route shows one full-width Account card list with the specified data and responsive toolbar/body layout; AccountAnalyticsCard and PersonTable are absent from the page; row open, expanding search, centralized filters, modifier quick-filter, Escape reset, rating, edit, pagination, and mobile/keyboard flows pass; self changes paint optimistically and authorized observers converge through private realtime or scoped recovery; ordinary edits create no bell spam; initial/detail transfer and interaction results are measured; permissions remain intact; production build and relevant tests pass; and the existing Sales Dashboard is unchanged unless the owner explicitly approved replacing it.
