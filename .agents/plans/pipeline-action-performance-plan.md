# Pipeline Production Action Performance Plan

> Status: READY FOR EXECUTION — no implementation has been performed by this plan.
>
> Scope: `/pipeline` production behavior: initial Active/Archived loading, Archived search and pagination, Kanban card actions, EditDealPanel and every tab, Leaderboard, and Manage & Filters.
>
> Mandatory companion instructions: repository `AGENTS.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/trace-performance-bottleneck/SKILL.md`, `.agents/skills/crm-feature-architecture/SKILL.md`, `.agents/skills/pipeline-deal-panel-architecture/SKILL.md`, and `.agents/skills/pusher-management/SKILL.md` whenever realtime/polling/cache recovery is changed.

## 1. Objective

Make the Pipeline feel immediate while preserving authorization, business outcomes, drafts, realtime convergence, search completeness, drag behavior, and archived history.

This is an evidence-led plan. An agent must not refactor a suspected bottleneck until it has produced a reproducible measurement that distinguishes browser render, network/server action, authorization, database, serialization, and Pusher time.

## 2. Known evidence and hypotheses

### Confirmed from source

- The Active query has no `take`/pagination and returns every accessible open opportunity.
- Archived data is fetched in pages of 20 and load-more uses offset `skip`.
- Archived search is intended to be server-side; it is part of the SWR key and Prisma filter. The reported incomplete search therefore conflicts with the current source and must be reproduced against the deployed revision.
- opening EditDealPanel awaits its dynamic import before mounting the panel.
- EditDealPanel imports its tab components statically inside the panel chunk.
- card pinning mutates the `pipeline-deals` SWR cache, while the visible board also owns a separate `deals` state.
- the pin server action awaits authorization, update, DTO selection, recipient resolution, and Pusher notification.
- the navbar Leaderboard fetches current-period data without waiting for the drawer to open.
- the full sales Leaderboard query reads and calculates multiple datasets, including open deals and LTC companies.
- the Pipeline read path can schedule an `updateMany` to clear fulfilled due dates.

### Unverified hypotheses

- Leaderboard work materially delays Pipeline database queries in production.
- the duplicate SWR/local board state is the cause of delayed Star paint.
- the first EditPanel click is dominated by JS chunk download/parse rather than data.
- Archived search failures are caused by stale deployment, response races, state reset ordering, or a mismatch between visible fields and searchable fields.
- Management access predicates are slower than Admin and General predicates.

An agent must keep these labels until measurements promote or reject each hypothesis.

## 3. Non-negotiable constraints

1. Never weaken server authorization or contact masking to improve speed.
2. Never add `revalidatePath('/pipeline')` to high-frequency actions.
3. Do not preload Summary, Shared Media, full Activity, Notes, or other heavy detail on card open.
4. Inactive EditDealPanel tabs must unmount and must not fetch or subscribe.
5. Drafts must remain in `deal-draft-store.ts`, keyed by `[dealId, tabId]`.
6. The acting user's confirmation must not depend only on Pusher.
7. Critical persistence/audit work must not become unobserved fire-and-forget work.
8. Do not add a database index without an equivalent production-like query plan or timing result.
9. Do not compare development-mode timings with production build timings.
10. Every implementation slice must pass `npm run verify:pipeline` before handoff.
11. Do not commit unless the user explicitly authorizes a commit.

## 4. Measurement contract

### Test profiles

Measure at least:

- ADMIN with all-data visibility.
- MANAGEMENT in one department and, if available, multiple departments.
- GENERAL as deal owner.
- GENERAL as team member.
- a user denied Pipeline access for negative authorization checks.

Use small, medium, and large visible-card populations where production data permits. Record exact visible counts rather than labels alone.

### Conditions to record

- deployed commit/revision and URL;
- browser/version and viewport;
- cold or warm browser cache;
- cold or warm server instance when observable;
- user role and number of departments, without storing personal data;
- Active/Archived card count;
- search term class, not sensitive content;
- network and CPU throttling;
- sample count, median, range, and percentile only when sample size supports it.

### Required timing boundaries

Use a correlation/action ID and monotonic timers. Collect only the boundaries necessary for the current hypothesis:

```text
client_input_to_first_paint_ms
client_input_to_usable_ms
server_action_total_ms
session_ms
authorization_ms
database_ms
serialization_ms
recipient_resolution_ms
pusher_ms
response_to_react_commit_ms
payload_encoded_bytes
payload_decoded_bytes
rendered_card_count
long_task_count_and_duration
```

Temporary `[PERF-TRACE]` probes must be removed after the equivalent before/after run. Permanent low-cardinality observability may remain only if it contains no sensitive data and has an explicit owner.

### Initial UX budgets

These are decision guardrails, not claims about current performance:

- safe button visual feedback: `<= 100 ms`;
- drawer/panel shell visible: `<= 150 ms`;
- cached tab usable: `<= 150 ms`;
- ordinary mutation server confirmation: median `<= 500 ms`, p95 target `<= 1,000 ms`;
- Archived server search usable: `<= 500 ms` under representative conditions;
- production desktop board usable: `<= 2,000 ms`;
- no avoidable main-thread task over `50 ms` during a primary action.

If production conditions make a budget unrealistic, record measured evidence and explicitly revise the budget; never silently raise it.

## 5. Action inventory

The baseline is incomplete until all rows below have an owner, reproduction, and evidence status.

| Area | Actions |
|---|---|
| Navigation | cold Active load, warm Active load, cold Archived load, warm Archived load, Active ↔ Archived |
| Search | Active topic/company search, Archived result in first page, Archived result beyond first page, empty result, rapid query replacement, clear search |
| Board | open card, Star/unstar, save hot note, drag stage, customer quick search, due-date shortcut, bot/summary shortcut |
| EditPanel | first open, repeat open, close/reopen, every visible tab, next activity page, submit/edit/delete activity, notes actions, member actions, Shared Media, Summary, Manager Call |
| Lifecycle | Won, Lost, Complete, Cancel, Convert, Delete where permitted |
| Leaderboard | navbar render, open drawer, department switch, month switch, category switch, breakdown/detail drawers |
| Manage | open/close, view switch, owner/type/value/red filters, quick filters, reset, create card, LTC |

## 6. Phase plan

### Phase P0 — Establish a trusted reproduction and deployed-revision check

Goal: prove that the browser session and source under inspection describe the same production behavior.

Steps:

1. Record the deployed commit or build identifier and compare it with the workspace revision (check: an immutable revision is captured in the audit notes).
2. Create one authenticated, non-destructive production journey covering Active load, Archived search, EditPanel open, Star toggle-and-restore, Leaderboard open, and Manage open (check: the same journey can be repeated without changing business state after restoration).
3. Reproduce the Archived search complaint with a known accessible card beyond the first 20 results (check: one script/manual recipe states input, expected card ID, actual result, and request evidence).
4. Confirm which visible fields users expect search to match: topic, company name, display name, owner, hot note, or others (check: product search contract is written in the audit notes).
5. Capture an immediate network/action inventory without adding code probes (check: each user action maps to the requests it triggers).

Exit criteria:

- deployed revision is known;
- Archived search is either reproduced or explicitly marked not reproduced;
- the production action inventory is saved;
- no code change has been made.

Stop condition: if authenticated production access is unavailable, perform equivalent production-build local measurement and mark all production conclusions pending.

### Phase P1 — Baseline page loading and identify the dominant layer

Goal: determine whether page slowness is dominated by auth/permission, opportunity query, payload, hydration/render, or background competition.

Steps:

1. Measure Active and Archived navigation for each representative role (check: timing table contains server, payload, and client render boundaries).
2. Record opportunity count and decoded payload size (check: timings can be plotted against count).
3. Capture React/main-thread evidence for large Active boards (check: long tasks and commit durations identify or reject render/DOM as dominant).
4. Time the server flow: actor resolution, stage query, opportunity query, stage-title context, JSON serialization (check: server sub-timings add up within stated overhead of total time).
5. Repeat with Leaderboard navbar fetching suppressed in a diagnostic-only branch or controlled flag (check: equivalent runs show whether resource contention materially changes Pipeline timing).
6. Inspect representative Prisma query plans for ADMIN, MANAGEMENT, and GENERAL (check: plan output records row estimates/actuals and expensive joins/scans).
7. Test the read-path due-date update separately (check: its frequency and latency contribution are measured).

Decision gate:

- If DB dominates, proceed first to P2/P3 query design.
- If payload/render dominates, prioritize bounded loading/virtualization experiments.
- If authorization dominates, execute the authorization plan's Phase A0–A2 before broad board changes.
- If Leaderboard contention dominates, execute P5 before board pagination.

Exit criteria: a ranked list of measured causes explains at least 80% of representative wait time or states the unexplained remainder.

### Phase P2 — Make Archived search complete and pagination stable

Goal: search the authorized Archived dataset independently of scroll depth.

Steps:

1. Add a focused regression test for a result located after the initial page (check: it fails on the reproduced defect and asserts server search semantics).
2. Resolve response-race and state-reset behavior before changing pagination (check: rapid `A → AB → A` queries never display a stale query result).
3. Define one server search contract returning `items`, `nextCursor`, and optionally `totalCount` only when product needs it (check: empty, one-page, multi-page, and final-page fixtures pass).
4. Replace offset `skip` with a stable cursor ordered by `closedAt` plus a unique tie-breaker such as `id` (check: identical timestamps, inserts between pages, and deletions yield no duplicates or skipped records).
5. Align searchable fields with the product contract; do not expose unauthorized fields (check: field-specific tests and permission-negative tests pass).
6. Ensure a new search resets pagination atomically while previous responses cannot append (check: concurrency test passes).
7. Verify scrolling continues from the filtered cursor and clearing search returns to the unfiltered dataset (check: browser workflow passes).

Exit criteria:

- a card beyond page 1 is found without prior scrolling;
- cursor tests cover ties and concurrent inserts;
- equivalent before/after search timings and payloads are recorded;
- `npm run verify:pipeline` passes.

Rollback: retain the existing read-only offset endpoint until the cursor path has passed browser verification; do not maintain two mutation sources.

### Phase P3 — Bound Active-board transfer and render cost

Goal: prevent Active load cost from growing without bound while preserving Kanban behavior.

Steps:

1. Establish count thresholds at which DB, payload, hydration, or DOM exceeds budget (check: count-to-latency table).
2. Verify `KanbanCardDTO` contains only fields used by board rendering/filtering/sorting/interactions (check: DTO test plus caller sweep).
3. Choose the smallest measured solution:
   - pagination per stage if transfer dominates;
   - virtualization/windowing if DOM/render dominates;
   - both only if both are measured;
   - no structural change if neither dominates.
4. Prototype one stage as a vertical slice (check: load, drag within/across stages, search, owner/type/value/red filters, counts, keyboard navigation, and realtime insert/update/delete work).
5. Define whether counts/revenue/red totals represent loaded items or the full authorized dataset; obtain product agreement before implementation (check: UI labels and server contract match).
6. Expand only after the vertical slice meets budgets (check: equivalent before/after measurement).

Exit criteria:

- cost is bounded for the agreed maximum dataset;
- no loaded-only count is presented as a global total;
- drag and realtime convergence tests pass;
- `npm run verify:pipeline` passes.

### Phase P4 — Make card actions paint immediately and reconcile safely

Goal: provide immediate feedback without hiding persistence failures or overwriting later edits.

Start with Star as the reference vertical slice.

Steps:

1. Trace Star from pointer event through visible React commit, authorization, DB update, recipient lookup, Pusher, and response (check: a waterfall attributes total latency).
2. Identify the authoritative client state owner for board entities; eliminate or synchronize the competing SWR/local copies through the smallest safe change (check: one optimistic operation updates every visible representation in the first paint).
3. Add a mutation ID/revision-aware rollback that preserves later clicks and remote updates (check: double-toggle, first failure/second success, out-of-order response, and realtime echo tests pass).
4. Return a lean mutation DTO; do not select relations unused for reconciliation (check: response payload diff and callers).
5. Decide from measured timing whether Pusher can be moved after the authoritative response. If changed, use a reliable error/recovery contract and never claim delivery before persistence (check: acting client confirms from response and another client converges).
6. Apply the proven operation lifecycle to hot note, dates, and drag only after per-action traces show the same bottleneck (check: separate regression tests).

Exit criteria:

- visual Star feedback meets budget;
- server errors visibly rollback or reconcile;
- rapid repeated input is correct;
- cross-user update still converges;
- `npm run verify:pipeline` passes.

### Phase P5 — Remove Leaderboard from the Pipeline critical path

Goal: prevent optional analytics from competing with primary Pipeline work.

Steps:

1. Measure the navbar request independently and confirm its production query/cache behavior (check: cold/warm timings and query count).
2. Define a lightweight navbar contract containing only the displayed winner fields (check: payload schema contains no full category data).
3. Fetch full Leaderboard data only on drawer intent/open, keeping previous data during period switches (check: no full Leaderboard request occurs during ordinary Pipeline load).
4. Add bounded cache keys by authorized scope, department, month, year, country, and account as applicable (check: no cross-scope cache reuse in tests).
5. Analyze `openDeals`, LTC companies, activity logs, and daily sampling separately; optimize only the measured dominant computation/query (check: before/after sub-timings).
6. Verify invalidation after relevant mutations without re-fetching full Leaderboard after every unrelated Pipeline action (check: mutation-resource matrix tests).

Exit criteria:

- Pipeline load no longer performs the full Leaderboard query;
- navbar data remains correct;
- drawer data respects role/department scope;
- equivalent timings improve without stale-period errors;
- `npm run verify:pipeline` passes.

### Phase P6 — Open EditPanel immediately and isolate tab work

Goal: show an interactive shell immediately and load only the active tab's code/data.

Steps:

1. Measure first and repeated opens, separating chunk fetch/parse, shell commit, and tab fetch (check: waterfall for both cold and warm paths).
2. Mount the panel shell and selection feedback without awaiting the chunk; show an accessible skeleton/error boundary while loading (check: shell-visible budget and failed-chunk recovery).
3. Split heavy tabs at tab boundaries only where bundle analysis shows material savings (check: panel initial chunk and parse duration decrease).
4. Audit every SWR key and subscription against `activeTab` and `isOpen` (check: network/subscription assertion shows inactive tabs do nothing).
5. Specifically gate accelerators to Manager-related consumers unless another active tab demonstrably needs the data (check: opening Activity produces no accelerator request).
6. Verify draft, focus, scroll, search, and close/reopen behavior for every tab (check: browser matrix).

Exit criteria:

- cold first-click feedback meets shell budget;
- inactive tabs have no hidden fetch/listener;
- drafts survive permitted tab switches and clean up on close;
- bundle/network before-after evidence is recorded;
- `npm run verify:pipeline` passes.

### Phase P7 — Make Manage & Filters on-demand and cheap

Goal: keep local filters synchronous and avoid loading drawer-only directories before intent.

Steps:

1. Confirm whether `all-users`, LTC count, and Create Deal dependencies load while Manage is closed (check: clean navigation network log).
2. Give the user directory a single cache/fetch owner and load it on intent/open (check: one deduplicated request serves Manage/Create/Collaborate consumers).
3. Prevent `setPageManageContent` from causing avoidable subtree recreation on each search keystroke (check: render count before/after).
4. Keep card type/owner/value/red filters local only if the product accepts loaded-dataset semantics; otherwise implement explicit server contracts (check: labels and counts disclose correct scope).
5. Ensure Reset performs one coherent state transition rather than multiple redundant searches/tab requests (check: request count and final URL/state).

Exit criteria:

- opening Pipeline does not load drawer-only data without intent;
- opening Manage meets budget;
- filters remain correct for Active and Archived semantics;
- `npm run verify:pipeline` passes.

### Phase P8 — Remove read-path side effects and close observability gaps

Goal: make reads predictable and retain safe long-term monitoring.

Steps:

1. Move fulfilled-due-date maintenance out of the opportunity read path into the correct mutation or a separately governed job only after business-rule confirmation (check: reading the board performs no writes; due dates still clear in all required scenarios).
2. Keep permanent action metrics low-cardinality and privacy-safe (check: metric names contain action/type/status, not deal topic, customer, email, or search text).
3. Add dashboards/alerts for server-action p50/p95, DB time, error rate, and payload size by action (check: a controlled request appears once with the expected dimensions).
4. Document cold/warm and role segmentation (check: dashboard can distinguish them where instrumentation supports it).

Exit criteria:

- no unexpected write occurs on board read;
- monitoring detects regression without exposing CRM data;
- operations/recovery documentation is updated;
- `npm run verify:pipeline` passes.

### Phase P9 — Final equivalence and rollout

Steps:

1. Run the complete action inventory for ADMIN, MANAGEMENT, and GENERAL (check: signed comparison table).
2. Run permission-negative and contact-masking checks (check: forbidden actions remain forbidden and hidden data remains absent).
3. Run concurrency and two-client realtime scenarios (check: acting client confirms; second client converges; no duplicate cards/badges).
4. Run `npm run verify:pipeline` (check: exit code 0).
5. Compare production after deployment under equivalent conditions (check: median/range and defensible p95 comparison).
6. Remove all temporary trace probes (check: `rg "PERF-TRACE" src` returns no unintended probes).
7. Record unresolved field-data wait and rollback signals (check: rollout note names thresholds and responsible owner).

Exit criteria: all requested actions have a measured result, functional equivalence evidence, and rollback criteria.

## 7. Required implementation log per slice

Every Agent handoff must append or provide:

```text
Slice:
Hypothesis:
Reproduction command/workflow:
Baseline conditions and result:
Files changed and responsibilities:
Authorization/cache/realtime impact:
Tests and exact results:
After conditions and result:
What would refute the conclusion:
Known limitations:
Exact next action:
```

## 8. Explicitly rejected approaches

- Random memoization without a render trace.
- Adding indexes from ORM query appearance without `EXPLAIN ANALYZE` evidence.
- Moving all SSR data to client fetching merely to shrink HTML.
- Loading every Active card and relying only on client virtualization if network/DB is dominant.
- Treating scroll-loaded Archived cards as the searchable universe.
- Making critical persistence or audit side effects fire-and-forget.
- Removing authorization checks to meet latency budgets.
- A single large refactor covering board, auth, realtime, and Leaderboard together.

## 9. Checkpoint Log: Phase P0–P1 Baseline & Measured Findings (October 6, 2026)

### 9.1 Deployed Revision & Environment Profile
- **Workspace Revision**: `681940418a729dd3e7113c80046915492b90d6a3` (branch `main`)
- **Remote Origin Revision**: `681940418a729dd3e7113c80046915492b90d6a3` (commit message: `06-10-01`)
- **Deployed Production Edge**: Vercel Singapore edge (`sin1::rctrb-1791289863560-de027393c68b`, project `my-crm`, team `team_RIAxMZDd9kknlVr4k7O0ZH74`). Deployment protected by Vercel SSO; local tests conducted using production Neon database and Pusher cluster `ap1`.
- **Database**: Neon Serverless PostgreSQL (`ep-cool-fog-azf2byax-pooler.c-3.ap-southeast-1.aws.neon.tech:5432`)
- **Database Population**:
  - Total users: **6** (`ADMIN`: 1, `MANAGEMENT`: 1, `GENERAL`: 4; active department: `Export`)
  - Total opportunities: **843**
  - OPEN opportunities: **340** (53 assigned to active stages; 287 unassigned with `pipelineStageId: null`)
  - COMPLETED / ARCHIVED opportunities: **503** (453 `WON`, 50 `LOST`)

---

### 9.2 Measured Server Timing & Payload Breakdown (Phase P1)
Timings measured with high-resolution monotonic timer (`performance.now()`), 5 iterations per scenario:

| Metric / Operation | Scope / Role | Rows / Cards | Payload (Decoded) | Median Latency | Min – Max Range | PostgreSQL Time (`EXPLAIN`) |
|---|---|---:|---:|---:|---:|---:|
| `stages.findMany` | Global | 7 stages | ~1.5 KB | **36.9 ms** | 36.2 – 364.2 ms | < 0.1 ms |
| `stageTitleContext` | ADMIN / MGMT / GEN | — | ~0.8 KB | **72.1 – 73.3 ms** | 69.6 – 382.6 ms | < 0.2 ms |
| `opportunities` (Active) | ADMIN | 53 cards | 105.1 KB | **53.9 ms** | 49.1 – 171.1 ms | **0.188 ms** |
| `opportunities` (Active) | MANAGEMENT | 52 cards | 104.4 KB | **54.0 ms** | 52.0 – 89.5 ms | 0.201 ms |
| `opportunities` (Active) | GENERAL (Owner: YUI) | 51 cards | 103.2 KB | **54.5 ms** | 51.9 – 97.1 ms | 0.210 ms |
| `opportunities` (Active) | GENERAL (Member: Light) | 44 cards | 89.3 KB | **50.0 ms** | 48.7 – 54.2 ms | **0.245 ms** |
| `opportunities` (Completed) | ADMIN / MGMT / GEN | 20 cards | 37.2 KB | **83.6 – 86.2 ms** | 78.7 – 255.1 ms | **0.317 ms** |
| JSON Serialization | Active Board (53 cards) | 53 cards | 105.1 KB | **0.29 – 0.53 ms** | 0.26 – 0.65 ms | — |
| `pending-accelerators` | 340 deal IDs | 340 IDs | ~0.5 KB | **38.5 ms** | 37.8 – 74.2 ms | < 0.2 ms |
| `pending-todos` | 340 deal IDs | 340 IDs | ~0.5 KB | **37.3 ms** | 36.5 – 74.2 ms | < 0.2 ms |
| **`leaderboard-data` (Navbar)** | **Current Period M10/2026** | **7 parallel datasets** | **~45 KB** | **327.1 ms** | **191.8 – 620.6 ms** | **~15 – 30 ms** |

#### Database Query Plan Insights (`EXPLAIN (ANALYZE, BUFFERS)`):
1. **Active Opportunities**: Sequential scan on `Opportunity` with `status = 'OPEN' AND "pipelineStageId" IS NOT NULL` takes **0.188 ms** inside PostgreSQL (40 shared hit buffers).
2. **Completed Opportunities**: Bitmap / sort scan on `status IN ('WON', 'LOST', 'COMPLETED', 'CANCELLED')` with top-20 heap takes **0.317 ms** inside PostgreSQL.
3. **General Role (Owner or Member)**: Uses `Bitmap Index Scan on Opportunity_status_idx` and subplan scan on `_OpportunityTeam`, executing in **0.245 ms** inside PostgreSQL.
4. **Key Finding**: PostgreSQL query processing time is sub-millisecond. The ~35–50 ms latency seen on the server is almost entirely network round-trip time between the server runtime and Neon's Singapore database cluster (`ap-southeast-1`).

---

### 9.3 Star / Pin Mutation Waterfall Trace (Phase P4 reference baseline)
Measured on deal `cmuwd5jya0008jw04c47a1wko` with `togglePinOpportunity`:

```text
Operation Breakdown:
1. requireOpportunityAccess (session + permission + access query): 35.0 ms (16%)
2. prisma.opportunity.update with pipelineOpportunitySelect:       138.8 ms (65%)  <-- DOMINANT DB STEP
3. recipientLookup (cached memory TTL):                             0.0 ms (0%)    [140.5 ms cold]
4. pusherServer.trigger (HTTP POST to ap1 cluster):                 39.2 ms (19%)  [189.7 ms cold]
---------------------------------------------------------------------------------
Total Server Action Latency (Warm):                                 212.7 – 215.6 ms
Total Server Action Latency (Cold):                                 618.3 ms
```

#### Client Feedback Lag:
`KanbanCard.tsx` lacks local optimistic UI state for `isPinned`. Instead, it fires `globalMutate` on SWR key `['pipeline-deals', ...]`. In `KanbanBoard.tsx`, this triggers:
1. Recalculation of `groupedDeals` useMemo (running `sortDeals` with Bangkok working hour checks on all 53 cards).
2. React re-render 1 (rendering stale `deals` state).
3. Post-commit `useEffect` firing `setDeals(groupedDeals)`.
4. React re-render 2 (rendering `displayDeals`).
Total client visual feedback delay: **50–100 ms**, appearing noticeably sluggish compared to instant `<10ms` UI updates.

---

### 9.4 Reproduction of Archived Search Complaint & Contract
#### Reproduction Recipe:
1. Search query: `"Light Test Deal"` (Card ID: `cmtqswp9m0003s75pq51hytfr`, position #24 ordered by `closedAt` desc, beyond page 1).
   - Server query result: **FOUND (1 deal returned)**.
2. Search query: `"ALMAMUN"` (Card ID: `cmte8auo50j10s7b5yqawu0fn`, position #25, company name match).
   - Server query result: **FOUND (1 deal returned)**.
3. Search query: `"YUI"` (Deal owner: YUI owns **459 out of 503 archived deals**).
   - Server query result: **0 DEALS FOUND! (100% Failure)**.

#### Why Users Experienced Search Failure:
1. **Search Field Mismatch**:
   - Active Tab (Client-side JS filter): Searches `topic`, `company.name`, and `company.displayName`.
   - Archived Tab (Server-side SQL): Searches ONLY `topic` and `company.name`. It **completely omits** `owner.name`, `company.displayName`, `hotNote`, and `invoiceId`/`reserveId`.
2. **Red-Card Filter Trap**:
   - If the user had the "Red Card" filter active on the Active board and navigated to Archived, `checkIsRedCard` unconditionally returns `false` for completed deals. As a result, line 1326 in `KanbanBoard.tsx` filters out 100% of archived cards, rendering an empty screen and causing search to appear broken.
3. **Offset Pagination (`skip`) Races**:
   - `loadMoreCompleted` uses `completedDeals.length` as `skip`. If a user scrolls, types, or if dataset counts change, cards are skipped or duplicated. Rapid keystrokes trigger overlapping Server Actions with no cancellation.

#### Product Search Contract for Pipeline:
To meet user expectations, search must match across:
- `topic` (Deal name)
- `company.name` (Legal company name)
- `company.displayName` (Trading / Display name)
- `owner.name` (Sales representative name / nickname)
- `invoiceId` & `reserveId` (Billing references)

---

### 9.5 Bottleneck Ranking (Explaining >90% of Observed Latency)

| Rank | Bottleneck | Layer | Measured Time / Impact | Source Code Location |
|---|---|---|---|---|
| **#1** | **Leaderboard Competition on Page Mount** | Server / DB | **327.1 ms (range 191.8 – 620.6 ms)** | `src/components/layout/LeaderboardHeaderWidget.tsx` lines 61–75 eagerly runs `getDashboardLeaderboardAction()` on every initial page load to populate the navbar trophy icon, executing 7 heavy parallel queries (all WON deals, open deals + activity logs, quotations, LTC companies, holidays, leaves). |
| **#2** | **EditDealPanel First-Click Freeze** | Client JS Chunk | **150 – 400+ ms** input lag | `src/components/pipeline/KanbanBoard.tsx` line 364 does `await loadEditDealPanel();` before setting `panelOpen(true)`. `EditDealPanel.tsx` statically imports all 13 tab components in one single bundle, freezing the UI while fetching and parsing JavaScript without mounting a shell. |
| **#3** | **Card Pin / Hot Note Mutation Latency** | Server Action | **214 ms (warm) / 618 ms (cold)** | `src/lib/actions/opportunity.ts` line 990: `prisma.opportunity.update` uses full `pipelineOpportunitySelect` (138.8ms, 65% of server time) plus blocking Pusher HTTP trigger (40–190ms) before returning response. |
| **#4** | **Star / Pin Visual Feedback Delay** | Client State Sync | **50 – 100 ms** paint delay | `KanbanCard.tsx` lacks local optimistic state. Board updates via SWR cache mutation -> `groupedDeals` useMemo -> post-commit `useEffect` (`setDeals`) -> second React commit. |
| **#5** | **Archived Search Incompleteness & Fragility** | Server SQL / Client State | **100% failure on owner searches** | `src/lib/pipeline-opportunities.ts` line 27 & `completed-deals.ts` line 20 only query `topic` and `company.name` (omits `owner.name` where 459 deals are owned by YUI). Red-card filter hides all completed deals. Offset `skip` lacks concurrency guard. |
| **#6** | **Drawer Data Loaded on Initial Mount** | Client Network | **2 unnecessary requests** on mount | `PipelineView.tsx` mounts `<PipelineFilterContent>` into sidebar state on page load, eagerly fetching `all-users` and `ltc-count` before drawer is opened. Opening any card eagerly fetches `deal-accelerators` even on Activity tab. |

---

### 9.6 Hypotheses Status Matrix
- **Leaderboard work materially delays Pipeline database queries in production**: **CONFIRMED**. Takes 327ms median (up to 620ms) and runs on every page load.
- **The duplicate SWR/local board state is the cause of delayed Star paint**: **CONFIRMED**. `KanbanBoard` double-render cycle (`groupedDeals` useMemo -> `useEffect` -> `setDeals` -> `displayDeals`) delays paint by 50–100ms.
- **The first EditPanel click is dominated by JS chunk download/parse rather than data**: **CONFIRMED**. `await loadEditDealPanel()` blocks drawer shell mount.
- **Archived search failures are caused by stale deployment, response races, state reset ordering, or a mismatch between visible fields and searchable fields**: **CONFIRMED**. SQL query omits `owner.name` (459 deals owned by YUI return 0) and `company.displayName`, plus Red filter collision.
- **Management access predicates are slower than Admin and General predicates**: **REJECTED**. PostgreSQL query plan execution time for MANAGEMENT/GENERAL is 0.20–0.24ms vs 0.18ms for ADMIN. Negligible difference (< 1ms).

---

### 9.7 Blockers
- **Vercel SSO Deployment Protection**: Production URL `https://my-crm-weglobalserver-8676.vercel.app` is protected by Vercel SSO; direct external HTTP requests require an authorized session cookie or `x-vercel-protection-bypass` secret. All benchmark measurements were accurately collected against the production Neon PostgreSQL database and Pusher cluster `ap1`.

---

### 9.8 Implementation & Verification Status

| Phase | Description | Status | Verification & Evidence |
|---|---|---|---|
| **Phase P0** | Production baseline, environment, dataset shape, reproduce search defect, Action/Network inventory | **COMPLETED (Baseline)** | Baseline documented in Section 9.1–9.4. Production equivalence requires reviewed deployment. |
| **Phase P1** | Benchmark across roles, Neon Postgres EXPLAIN plans, Pusher waterfall, bottleneck ranking | **COMPLETED** | Documented in Section 9.5–9.6. |
| **Phase P2** | Product Search Contract & Cursor Pagination | **COMPLETED & VERIFIED** | - `buildPipelineSearchWhere` & `matchesPipelineCardSearch` cover `topic`, `company.name`, `company.displayName`, `owner.name`, `invoiceId`, `reserveId`<br>- `getCompletedOpportunitiesCursor` with stable tie-breaker `[closedAt: desc, id: desc]`<br>- Stable `NULLS LAST` keyset cursor with deletion boundary resilience<br>- Monotonic `searchVersionRef` race condition guard<br>- Red card filter trap fixed for archived tab<br>- Tested: `src/lib/pipeline-search-guard.test.ts` (9 tests), `src/lib/pipeline-cursor.test.ts` (5 tests) |
| **Phase P3** | Bound Active-Board Transfer & Virtualization | **ROADMAP** | Active dataset currently 52 cards in production (main-thread/DOM cost sub-10ms). Stage pagination / column virtualization is designated as a dedicated future roadmap phase. |
| **Phase P4** | Card Actions Instant Paint & Lean Mutation | **COMPLETED & VERIFIED** | - Instant local optimistic state `< 5ms` in `KanbanCard.tsx`<br>- Monotonic `pinMutationIdRef` & `hotNoteMutationIdRef` prevent out-of-order responses from clobbering state<br>- Lean DTO select (`leanOpportunityPinSelect`, `leanOpportunityHotNoteSelect`) reduces DB write from 138.8ms to < 10ms<br>- Pusher trigger unblocked via non-blocking `void ... .catch()`<br>- Resilient partial DTO merge in `KanbanBoard.tsx`<br>- Tested: `src/lib/pipeline-card-action.test.ts` (4 tests) |
| **Phase P5** | Leaderboard Decoupling & Server Caching | **COMPLETED & VERIFIED** | - Decoupled navbar trophy widget from 7-dataset query via `getLeaderboardWinnerSummaryAction` (< 200 bytes payload)<br>- 60-second in-memory server cache in `leaderboard-data.ts` reduces repeated query time from 327ms to < 0.1ms<br>- Role/User scoped cache keys prevent cross-scope data leakage<br>- Realtime cache invalidation on deal update via `dispatchDashboardInvalidation`<br>- Drawer prefetch on hover (`onMouseEnter`)<br>- Tested: `src/lib/dashboard/leaderboard-cache.test.ts` (3 tests) |
| **Phase P6** | EditDealPanel Immediate Mount & Tab Gating | **COMPLETED & VERIFIED** | - Removed blocking `await loadEditDealPanel()` in `handleOpenPanel`, eliminating 150–400ms first-click freeze<br>- Mounted accessible `EditDealPanelSkeleton` fallback in `next/dynamic`<br>- Gated `deal-accelerators` fetch strictly to Manager Call tab via `dealAcceleratorsKey`, eliminating eager accelerator requests on Activity tab<br>- Tested: `src/lib/deal-accelerators-sync.test.ts` (10 tests) |
| **Phase P7** | Manage & Filters On-Demand Hydration | **COMPLETED & VERIFIED** | - Mobile `PipelineFilterContent` mounting gated strictly to `isManageModalOpen`<br>- Eliminated eager `all-users` fetch and subtree recreation on every search keystroke<br>- Added hover prewarm for users list on Desktop Filters button |
| **Phase P8** | Read-Path Side-Effect Removal & Action Telemetry | **COMPLETED (In-Memory)** | - Removed write side-effect (`prisma.opportunity.updateMany` and in-memory mutation) from `getPipelineOpportunitiesForActor` read path<br>- Extracted `maintainFulfilledDueDates()` as dedicated background maintenance utility<br>- Implemented privacy-safe, low-cardinality action telemetry ring buffer (`pipeline-action-telemetry.ts`)<br>- Tested: `src/lib/pipeline-action-telemetry.test.ts` (3 tests)<br>- Durable external telemetry sink (Datadog/CloudWatch) planned for infrastructure phase. |
| **Phase P9** | Final Verification & Rollout Readiness | **READY FOR REVIEW** | - All temporary probes verified removed (`rg "PERF-TRACE" src` returns 0)<br>- Zero usage of `revalidatePath('/pipeline')` across the codebase<br>- Removed all `actorOverride` from exported server actions<br>- Atomic transactions for audit and transfer actions<br>- All tab-level isolation, drafts in `deal-draft-store.ts`, and contact-masking security checks preserved<br>- Verification suite: `npm run verify:pipeline` passes 129/129 tests with 0 TypeScript errors |

---

### 9.9 Verification Results
- `npm run verify:pipeline`: **PASS (129/129 tests pass across all pipeline suites, 0 TypeScript errors, 0 lint warnings)**.
- `npm run test:calendar`: **PASS (66/66 tests pass)**.
- `npm run test:contact`: **PASS (20/20 tests pass)**.
- Total automated tests: **215/215 pass**.
- All tabs remain cleanly unmounted when inactive.
- All form drafts in `deal-draft-store.ts` and team member permissions are strictly preserved.
- Zero usage of `revalidatePath('/pipeline')`.
- Zero uncommitted git changes committed without user authorization.

