# Contact Action Performance and Product Workspace Template Plan

> Status: READY FOR EXECUTION — this document does not implement application changes.
>
> Scope: `/contact` initial loading, list/search/filter actions, account-card actions, EditAccountPanel and all visible tabs/actions, cache/realtime recovery, and the reusable workspace contract intended for the future `/product` page.
>
> Evidence date: 2026-10-07 (Asia/Bangkok). The local UI at `http://localhost:3003/contact` was inspected non-destructively. Localhost is a development/lab environment, not production evidence; final performance claims require a production build and then the deployed revision.
>
> Required instructions during implementation: repository `AGENTS.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/trace-performance-bottleneck/SKILL.md`, `.agents/skills/fable-5/SKILL.md`, and `.agents/skills/crm-feature-architecture/SKILL.md`. Read `.agents/skills/pusher-management/SKILL.md` before changing realtime, notification, polling, or recovery behavior.

## 1. Objective

Make Contact feel immediate and remain correct under rapid input, concurrent users, large account populations, different permissions, slow networks, and failed realtime delivery. Convert only the proven presentation/data-boundary patterns into a reusable workspace contract for Product; do not copy Contact business rules, permissions, cache keys, or oversized components into Product.

Every optimization must follow:

```text
reproduce -> correlate -> locate dominant layer -> change one boundary -> verify correctness -> compare equivalent measurements
```

The layers to distinguish are:

```text
user input
  -> React scheduling/render/DOM
  -> Server Action transport (serialized per browser client)
  -> session + permission resolution
  -> database query/transaction
  -> serialization + response transfer
  -> local/SWR cache commit
  -> Pusher convergence/recovery
```

## 2. Current implementation evidence

### 2.1 Confirmed from source and local UI

- `/contact` is `force-dynamic`, resolves the session, then loads actor, types, countries, and the first 20 qualified accounts. Account list loading includes account rows, a status aggregation when its memory cache is cold, opportunity metrics, and AI-summary lookup.
- the local dataset displayed 437 qualified accounts, 0 unqualified accounts, 4 account types, and roughly 60 country filter buttons. Both desktop sidebar and Manage & Filters render country choices.
- account list pages use offset pagination (`skip`) ordered by `starRating DESC, createdAt DESC`; concurrent rating changes/inserts can therefore change page boundaries.
- ContactView maintains server/SWR filter data, local `accounts`, a persistent known-account map, page refs, selection state, and URL state. This improves perceived filtering but creates multiple synchronization boundaries that need race and correctness tests.
- search is debounced by 280 ms and the server search spans company display/name/country/address and related contact name/email/phone.
- the first 20 cards are leaner than full account details, but each page also performs grouped opportunity metrics and AI config reads.
- card intent preloads account overview; EditAccountPanel is dynamically imported. CreateAccountPanel is also dynamically imported.
- EditAccountPanel exposes tabs: Account, Contact, Projects, Sale Target, Email, Account AI, and Shared Media, filtered by right-menu permissions.
- Account contains Details and System Log subtabs. The panel provides Save Account, Add Address, status toggle, add/edit/delete/set-default address, add/edit/delete person, searches, and View in Pipeline.
- Projects and Email are statically imported into the EditAccountPanel chunk. Account AI, Shared Media, and Sale Target are dynamic imports.
- after the overview finishes loading, the panel starts a fixed 800 ms preload for Account AI and Shared Media chunks/data, regardless of whether the user intends to open those tabs.
- the account overview query is the common panel payload and includes account, addresses, contacts/log-related/project-related data according to its server contract. Its encoded size and per-relation cost are not currently guarded by a budget.
- several contact/company/address mutations call `revalidatePath('/contact')`. With the installed Next.js behavior, an action that revalidates the current path can include a rerendered RSC payload in the same response; this may make a small button action wait on page work.
- star rating already uses optimistic paint, mutation IDs, sequence rollback, revisions, and Pusher echo suppression. Its server path still reads the prior company, performs a transaction with an audit log, and publishes realtime.
- Contact recovery can refetch `max(20, loadedPages * 20)` rows, so recovery cost grows with session scroll depth.
- Product currently contains only an authorization gate and an Under Construction screen; it is not yet a second proven consumer of a shared resource-workspace implementation.
- the existing Contact automated suite is primarily DTO/filter/helper coverage. It does not yet provide action-level production-path timing, panel contract, response-race, pagination-concurrency, or mutation/cache/realtime convergence coverage.

### 2.2 Hypotheses that must not be presented as conclusions

| ID | Hypothesis | Evidence needed to promote/reject it |
|---|---|---|
| H1 | initial load is database-bound | correlated timings for session, actor, types, countries, list base query, stats, opportunity aggregation, AI lookup, serialization |
| H2 | the country/type menus create meaningful hydration or update cost | React commit/long-task evidence with current menu, a diagnostic reduced menu, and equivalent data |
| H3 | filter lag/races come from duplicated SWR/local/map state | rapid-transition tests plus React/network traces identifying stale apply, extra commits, or response inversion |
| H4 | offset pagination causes skipped/duplicate accounts after rating changes or inserts | deterministic multi-page concurrency test against production ordering |
| H5 | first panel open is bundle-bound | cold/warm chunk transfer, parse/evaluate, shell paint, and overview timing |
| H6 | panel open is overview-query/payload-bound | per-relation query timing, encoded bytes, contact/address/log/project counts |
| H7 | the 800 ms preload competes with the user's next action | equivalent panel runs with diagnostic preload disabled, observing main thread, action queue, DB, and network |
| H8 | `revalidatePath('/contact')` dominates mutation confirmation | equivalent mutation trace with response/RSC bytes and diagnostic targeted-cache path |
| H9 | permissions add material repeated latency | role-specific session/policy/query timings and caller audit |
| H10 | realtime/recovery work creates unexpected refetch storms | channel lifecycle, reconnect, focus/recovery, and request-count traces |

## 3. Non-negotiable correctness and architecture constraints

1. Never weaken authentication, menu/right-menu authorization, department masking, or mutation authorization to improve speed.
2. Treat every exported Server Action as an untrusted HTTP entry point. Derive actor/session on the server and validate IDs/input there.
3. List payloads must be list DTOs. Detail/tab payloads must load only when the corresponding surface needs them.
4. A panel shell may open before data is ready. Heavy tabs must not delay shell visibility.
5. Inactive heavy tabs must unmount and must not fetch, subscribe, or run background computation unless measured intent-based prefetch is justified.
6. Do not make successful persistence depend on Pusher. The acting browser needs an immediate deterministic cache/state commit; Pusher converges other sessions.
7. Do not use whole-page revalidation for a high-frequency action unless measurements and correctness requirements prove it necessary.
8. Preserve audit logs and critical writes inside the appropriate transaction. Do not make them unobserved fire-and-forget work.
9. Do not add an index until a representative query plan/timing proves the access path needs it.
10. Do not call localhost development timings “production performance.” Use production build and deployed measurements for acceptance.
11. Do not build a generic Product/Contact framework before Contact has at least two verified vertical slices and Product supplies a concrete second use case.
12. Do not copy Contact permissions, cache keys, Server Actions, form schema, or account concepts into Product abstractions.
13. No implementation phase is complete without its stated correctness tests and equivalent before/after evidence.
14. Do not commit unless the user explicitly authorizes a commit.

## 4. Measurement contract

### 4.1 Required environments

Measure separately and label every result:

1. `DEV_LOCAL`: useful only for reproduction and correctness.
2. `PROD_BUILD_LOCAL`: built application with representative database/network conditions; useful for bundle/render comparison.
3. `DEPLOYED_PRODUCTION`: exact deployed revision on Vercel; required for final acceptance, cold-instance behavior, regional latency, and real-user validation.

Record revision/build ID, URL, browser/version, viewport, role, department count, account/contact/address/project counts, cold/warm browser cache, cold/warm server state when observable, network/CPU throttle, and sample count.

### 4.2 Correlation and boundaries

Generate one low-cardinality-safe `traceId` per measured action. Pass it only where needed for diagnostic correlation. Never log contact names, emails, phones, notes, addresses, search text, or form bodies.

```text
input_to_feedback_ms
input_to_panel_shell_ms
input_to_usable_ms
react_commit_ms
long_task_count_and_max_ms
request_count
request_queue_ms
server_action_total_ms
session_ms
authorization_ms
db_total_ms
db_query_count
serialization_ms
response_encoded_bytes
response_to_commit_ms
pusher_publish_ms
remote_convergence_ms
recovery_request_count_and_bytes
rendered_row_count
rendered_filter_option_count
```

For each database candidate, record query shape, rows scanned/returned, query plan where safe, and data cardinality. For bundles, record transferred, decoded, parse/evaluate time, and whether the chunk was already cached.

### 4.3 Initial decision budgets

These are targets, not claims about current behavior:

- safe interaction feedback: `<= 100 ms`;
- list/filter provisional paint: `<= 100 ms`;
- EditPanel shell visible: `<= 150 ms`;
- cached/light tab usable: `<= 150 ms`;
- ordinary mutation confirmed: median `<= 500 ms`, p95 `<= 1,000 ms` under agreed production conditions;
- first server-backed filter/search usable: median `<= 500 ms`;
- production desktop Contact usable: `<= 2,000 ms` for the agreed representative profile;
- no avoidable main-thread task over `50 ms` during a primary action;
- no duplicate request for the same resource key caused by a single user action;
- list/detail response budget must be established from measured minimum contracts in Phase C1/C3; do not invent a byte cap before measuring.

If a budget is unrealistic, document evidence, product impact, and the approved replacement. Never silently loosen it.

## 5. Complete action inventory to baseline

The executor must turn this into a living matrix with: component, handler, server entry point, authorization, DB operations, immediate client commit, cache keys, realtime event, recovery path, expected result, trace ID, baseline, and verdict.

| Surface | Actions |
|---|---|
| Initial/navigation | cold navigation, warm navigation, session redirect, loading skeleton, first 20 rows, desktop/mobile, cold/warm filter metadata |
| Account list | select/open row, intent hover/focus/touch preload, load more, keyboard open, AI-summary shortcut, quick type/country filter, Star 0–5 and rapid Star changes |
| Header/filter | Qualified, Unqualified, search type/debounce/clear/rapid replacement, type, country search, country choice, combined filters, reset, URL state/back-forward, Manage open/close, Add Account |
| Create Account | open/close, account fields, email/phone add/remove, address add/remove/default/autocomplete, submit, validation and retry |
| Panel lifecycle | first cold open, warm open, rapid account A→B, close during fetch, reopen, denied/no-tab role, direct initial tab, stale-cache refresh |
| Account/Details | status toggle, Save Account, add/remove email/phone field, Add Address, autocomplete, expand/collapse, edit, set default, delete/cancel |
| Account/System Log | enter tab, search, clear, large log history behavior |
| Contact tab | search/clear, Add Person, cancel, add/remove email/phone field, submit, expand/collapse, subtab switch, save person, delete person |
| Projects | enter tab, render allowed projects, masked count, View in Pipeline |
| Sale Target | enter, year switch if present, add/cancel/save, edit/cancel/save, delete, concurrent update/error retry |
| Email | enter, choose recipient, compose/cancel/send, missing-email/validation/error path; explicitly identify simulation versus real delivery |
| Account AI | enter, cached/cold analysis, web intelligence, run analysis, edit/save profile, copy, prompt load/save/reset, error/retry |
| Shared Media | enter, initial fetch, upload/download/open/delete where exposed, permission/error/retry |
| Realtime/recovery | local mutation confirmation, self echo, remote update, stale revision, disconnect/reconnect, recovery after 1 and many loaded pages |

## 6. Phase plan

### Phase C0 — Freeze scope, revision, journeys, and baseline harness

Goal: create a trusted, repeatable investigation before optimizing.

Steps:

1. Record workspace revision, dirty state, deployed revision, schema migration level, and feature flags. Check: audit notes can prove which code produced every measurement.
2. Expand the action inventory above into a source map. Check: every visible button/tab maps to a handler and server/cache/realtime path or is explicitly client-only.
3. Define non-destructive journeys and reversible test records for mutation paths. Check: no production business record is modified without a restore procedure and approved test identity.
4. Create representative profiles: ADMIN; MANAGEMENT with one and multiple departments if applicable; GENERAL with allowed and denied right menus. Check: sensitive identities are not recorded.
5. Define small/medium/large account profiles using exact counts; include accounts with 0 and many contacts, addresses, projects, and logs. Check: panel cardinality is captured with each timing.
6. Add temporary measurement hooks behind an environment flag or test-only wrapper. Check: disabled mode adds no external logs or sensitive data.
7. Run at least 5 cold and 10 warm samples for stable primary paths; use medians and ranges, p95 only with adequate samples. Check: outliers are retained and explained, not silently deleted.

Exit criteria:

- complete source/action matrix;
- production/development labels are unambiguous;
- repeatable baseline journeys and measurement output exist;
- no optimization has been merged.

### Phase C1 — Initial page loading: locate the dominant layer

Goal: explain page wait across session, metadata, list queries, payload, hydration, and rendering.

Steps:

1. Trace `ContactPage` boundaries: session, actor, type aggregation, country aggregation, account query, status stats, opportunity aggregation, AI config lookup, serialization, and client commit. Check: sub-timings reconcile with total within stated overhead.
2. Compare cold/warm server memory cache runs. Check: type/country/status cache effects are separated from DB improvements and multi-instance limitations are documented.
3. Measure response bytes and client work for 20 cards plus current country/type options. Check: encoded bytes, rendered nodes/options, commits, and long tasks are correlated.
4. Diagnose duplicate authorization/session resolution between page and Server Actions. Check: call graph and timings show whether actor reuse is safe and meaningful; never accept a client-supplied actor.
5. Inspect representative database plans for default list, type, country, and search. Check: an index proposal must cite the exact slow plan and expected selectivity.
6. Compare a diagnostic lazy/collapsed country list without committing UI behavior. Check: accept only if main-thread/DOM cost materially improves and UX/accessibility remain sound.
7. Confirm initial results, stats, type counts, and country counts use clearly defined scopes. Check: counts are not accidentally global when policy requires scoped values.
8. Rank causes by measured contribution. Check: the ranked list explains at least 80% of representative wait or labels the unexplained remainder.

Decision gate:

- DB dominant → optimize the measured query/aggregation only.
- transfer dominant → reduce DTO/metadata response shape.
- hydration/render dominant → isolate list/filter rendering and virtualization only if counts justify it.
- session/permission dominant → execute C6 before query micro-optimization.

Exit criteria: initial load has equivalent before/after evidence, correct counts, and no permission regression.

### Phase C2 — Search, filter tabs, URL state, and pagination correctness

Goal: instant feedback with one authoritative result contract and stable pages.

Steps:

1. Write response-race tests for `A → AB → A`, Qualified↔Unqualified, combined type/country/search, clear/reset, close/open Manage, and back/forward navigation. Check: stale responses never replace the latest intent.
2. Define provisional local filtering versus authoritative server results. Check: UI labels provisional results as loading when the known-account map is incomplete; it never presents partial known data as complete.
3. Audit state ownership among SWR, `accounts`, known map, refs, selection, and URL. Check: each value has one authoritative owner and derived state is not set during render.
4. Verify filter cache key canonicalization for country aliases, whitespace, case, actor scope, status, and search. Check: equivalent filters reuse safely; different authorization scopes cannot share results.
5. Establish the search contract (fields, masking, minimum input if any, empty query, result order). Check: server and local matcher intentionally agree or documented differences are visible to users.
6. Test offset pagination under a Star reorder, insert, deletion, and status change between pages. Check: promote H4 only when a deterministic duplicate/skip is reproduced.
7. If H4 is confirmed, replace offset with versioned keyset pagination using the full stable order and unique `id` tie-breaker. Check: ties, deleted cursor row, reorder, end page, and filter change produce 0 duplicate/skip within the defined snapshot semantics.
8. Bound or virtualize filter option rendering only if C1 proves it material. Check: keyboard navigation, screen readers, search, counts, and mobile Manage remain equivalent.
9. Test load-more and recovery after filter changes. Check: a response from a previous filter cannot append to the current list.

Exit criteria:

- filter feedback meets budget;
- authoritative results are complete for the defined dataset;
- pagination behavior is stable under tested concurrency;
- URL reload/back-forward restores documented state;
- regression tests fail on the original defect mechanism.

### Phase C3 — EditPanel shell, bundle, and data boundaries

Goal: show the panel immediately and make each tab pay only for what it uses.

Steps:

1. Measure cold/warm row click into: intent preload, panel chunk download/parse, shell paint, overview request, server query, bytes, React commit, usable form. Check: H5 and H6 receive separate verdicts.
2. Make panel lifecycle race tests: A→B, close during fetch, reopen A, initial tab, permission changes. Check: no A data/draft appears under B and no closed panel commits disruptive state.
3. Inventory the common overview fields and actual consumers by tab. Check: each field has a consumer; unused relations are removed from common DTO candidates.
4. Design contracts:
   - `AccountListItemDTO` for list only;
   - `AccountCoreDTO` for panel header/Account essentials;
   - `AccountContactsPageDTO` for Contact tab;
   - `AccountProjectsPageDTO` for Projects tab;
   - separate log, sale target, AI, and shared-media resources.
   Check: masking/authorization is enforced independently on each server read.
5. Open shell and header without waiting for heavy tab data. Check: `input_to_panel_shell_ms <= 150 ms` in agreed conditions.
6. Dynamically split tabs when bundle evidence warrants it. Projects/Email are explicit candidates because they are currently static in the panel chunk; verify actual bundle savings before accepting.
7. Replace fixed 800 ms heavy preload with no preload, browser-idle preload, or intent preload based on C3 evidence. Check: no competition with an immediate save/tab action and no unauthorized data prefetch.
8. Preserve drafts per `[companyId, tabId]` before allowing tab unmounting. Introduce a Contact-owned draft store only if current state loss is reproduced or unmounting requires it. Check: switch tabs/accounts, close/reopen, save/cancel, and cleanup semantics.
9. Split the current large EditAccountPanel into an orchestrator plus tab-owned components as implementation slices, without changing behavior in the same step. Check: orchestrator owns shell/tab/identity only; each tab owns state/data/actions.

Exit criteria:

- shell budget met;
- common payload has an enforced measured byte/query budget;
- inactive heavy tabs do not fetch/subscribe/render;
- panel race and draft tests pass;
- cold and warm comparisons are recorded.

### Phase C4 — Account and Contact mutation paths

Goal: every edit button gives immediate feedback and converges without whole-page work.

Execute one vertical slice at a time in this order: Star → qualification toggle → Save Account → address actions → person actions → Create Account.

For every slice:

1. Trace input→optimistic commit→Server Action→session/auth→DB transaction→response→cache commit→Pusher→remote commit. Check: timing waterfall and request/RSC bytes exist.
2. Audit authorization and input validation at the exported action. Check: direct unauthorized action test fails closed.
3. Decide optimistic, pending, or pessimistic behavior based on reversibility. Check: delete and externally consequential actions require confirmation appropriate to risk.
4. Use operation-based cache updates with revision/mutation ID where concurrency matters. Check: no full-cache wipe; rollback changes only the attempted operation.
5. Audit each `revalidatePath('/contact')`. Remove it only after the action has deterministic local commit, targeted cache updates, remote event, and recovery. Check: the response no longer carries avoidable route work and all consumers converge.
6. Keep primary write and its audit log atomic. Check: induced audit failure rolls back the business change where required.
7. Make side effects after commit observable and retry-safe. Check: persistence does not roll back because Pusher is unavailable, and recovery repairs other clients.
8. Test double click, rapid opposing actions, timeout after commit, stale revision, and retry. Check: no duplicate entity/log or incorrect rollback.

Additional required checks:

- Star ordering changes must not corrupt page continuity.
- status toggle must immediately remove/move an account according to the active filter and update counts once.
- Save Account must update list DTO fields and filter membership atomically from the user's perspective.
- address default selection must preserve exactly one default under concurrency.
- person mutations must invalidate only relevant account/contact resources.
- Create Account must establish list membership/counts and detail cache without a route refresh.

Exit criteria: every listed mutation has service-level production-path tests, UI failure tests, and before/after confirmation evidence.

### Phase C5 — Remaining tabs and expensive actions

Goal: isolate tab-specific cost and prevent hidden work.

#### C5.1 System Log

- paginate or cursor-load if cardinality proves material;
- search contract must specify client-loaded versus server-complete scope;
- logs are server-authored evidence, not client-supplied free text.

#### C5.2 Projects

- do not include all project relations in the common overview unless measured essential;
- enforce permission/masking in the query, not by fetching all rows and relying only on client hiding;
- paginate when account project cardinality crosses the measured threshold;
- preserve View in Pipeline semantics and safe URL encoding.

#### C5.3 Sale Target

- trace list/add/edit/delete separately;
- use operation-based optimistic updates where reversible;
- test unique `(companyId, year, currency)` conflicts and concurrent edits.

#### C5.4 Email

- explicitly mark the current simulated queue behavior; do not benchmark the 600 ms timer as backend performance;
- before real email integration, specify idempotency key, durable queue, delivery status, retry, authorization, and audit contract;
- preserve drafts when switching tabs.

#### C5.5 Account AI

- separate cached read, web intelligence, model execution, profile save, and prompt administration timings;
- never place model execution on panel-open critical path;
- stream/progress only if supported by the actual execution contract;
- restrict prompt management and prevent cached cross-account/department leakage.

#### C5.6 Shared Media

- fetch only on active tab or proven intent;
- measure metadata separately from binary transfer;
- use bounded pages and signed/direct transfer where architecture supports it;
- test upload/delete authorization, progress, retry, and stale cache recovery.

Exit criteria: each tab has an independent resource key/DTO, permission tests, loading/error/empty state, and measured cold/warm behavior.

### Phase C6 — Permission and department cost/parity audit

Goal: make authorization fast without allowing policy drift.

Steps:

1. Inventory page menu access, right-menu tab visibility, list scope, field masking, and every mutation policy. Check: one capability matrix covers ADMIN/MANAGEMENT/GENERAL and department relationships.
2. Compare rendered visibility with server enforcement. Check: hidden UI is never the only guard.
3. Measure repeated session/permission reads in page, list, overview, and mutation paths. Check: optimization candidates retain server-owned actor resolution.
4. Centralize pure policy primitives only where list/read/mutation need the same rule. Check: query scope and capability tests demonstrate parity.
5. Separate policy decision from database evidence acquisition. Check: reusable request-scoped context prevents duplicate reads without global authorization leakage.
6. Audit serverless caches. In-memory cache may improve warm instances but cannot promise instant cross-instance revocation. Check: revocation SLA and invalidation design are explicit.
7. Benchmark representative roles and department counts. Check: query plans do not degrade unexpectedly for multi-department MANAGEMENT.

Exit criteria: deny-by-default tests, list/mutation parity tests, field-masking tests, and role-specific performance evidence pass.

### Phase C7 — Realtime, cache convergence, and recovery

Goal: local immediacy plus eventual cross-user correctness with bounded recovery cost.

Steps:

1. Document resource ownership and keys for list filters, list entity patches, core account, contacts, logs, projects, sale targets, AI, and media.
2. Specify an event envelope with entity ID, action, revision, mutation ID, and only safe delta fields. Check: event contains no unnecessary PII.
3. Verify one shared channel lifecycle rather than per-row subscriptions. Check: open/close/filter/tab cycles do not accumulate handlers.
4. Test self-echo suppression and monotonic revisions. Check: stale remote events cannot overwrite newer local/server state.
5. Replace recovery proportional to scroll depth only if measured excessive. Candidates: invalidate active filter pages, refetch visible IDs/pages, or version-check resources. Check: request bytes stay bounded while loaded list becomes correct.
6. Define recovery triggers for disconnect/reconnect and missed events; avoid duplicate focus/poll/realtime recovery. Check: one reconnect produces the expected bounded request set.
7. Update the Pusher management guide/page matrix in the same implementation task when channel/event/recovery policy changes.

Exit criteria: two-browser tests cover create/update/rating/status/delete, disconnect/reconnect, stale revision, and bounded recovery.

### Phase C8 — Extract a reusable Resource Workspace contract

Goal: reuse proven structure for Product without creating a coupled generic monolith.

Extraction is allowed only after C2 and two C3/C4 vertical slices meet budgets and correctness criteria.

Reusable presentation contracts may include:

```text
ResourceWorkspaceShell
  side/filter slot
  toolbar/search/manage slot
  paged/windowed list slot
  selection contract
  panel host/shell
  loading/empty/error boundaries
```

Reusable behavior primitives may include:

- typed filter/query serialization;
- abort/race-safe paged resource controller;
- intent-based chunk/data preloading policy;
- operation-based entity patch helpers with revisions;
- panel identity and draft-key conventions;
- measurement markers and payload-budget assertions.

Must remain feature-owned:

- Contact/Product DTOs and database queries;
- capability/department rules;
- cache keys and realtime event adapters;
- forms, validation, business transactions, audit text;
- tab registry/content when semantics differ;
- list ranking and aggregate/count definitions.

Steps:

1. Write Contact's verified contract before extracting code. Check: identity, list, detail, filters, mutations, cache, realtime, draft, and permission owners are named.
2. Write Product's minimum real vertical slice: menu authorization, product list DTO/query, one filter, selection, panel shell, core details read, and one safe mutation. Check: requirements come from Product, not assumptions copied from Contact.
3. Compare both consumers and extract only identical stable mechanics. Check: shared code contains no `company`, `contact`, `product`, department-policy, or domain-action branching.
4. Adopt with a strangler sequence: Product first consumer/proof, then migrate one Contact slice if beneficial. Check: Contact behavior and budgets remain unchanged.
5. Keep composition slots narrow and typed. Check: adding a feature does not require editing a central switch for unrelated resources.

Exit criteria:

- Product uses the shared shell/controller for one end-to-end vertical slice;
- Contact continues to pass its action/performance suites;
- domain ownership remains separate;
- duplication removed is measured and maintainability benefit documented.

### Phase C9 — Production rollout and durable observability

Goal: prove improvement on the deployed revision and catch regressions.

Steps:

1. Run typecheck, Contact unit/service/integration tests, affected calendar/pipeline suites, build, and production-build browser journeys. Check: exact commands and results are recorded.
2. Deploy behind a reversible flag when changing pagination, panel DTOs, or cache/realtime ownership. Check: old read path remains usable during the verification window without two mutation sources.
3. Validate deployed revision with the same profiles and samples used for baseline. Check: equivalent conditions and raw summaries are attached.
4. Add durable low-cardinality telemetry only for boundaries that proved operationally important. Check: owner, retention, sampling, alert threshold, and privacy review exist.
5. Monitor errors, action latency, DB time, response bytes, stale/race reports, and recovery volume. Check: rollback thresholds are defined before rollout.
6. Remove temporary probes and flags after acceptance. Check: source scan and clean build confirm removal.

Exit criteria: deployed evidence meets agreed budgets or explicitly accepted trade-offs, with zero security/correctness regression and a tested rollback path.

## 7. Suggested implementation order

Do not begin by extracting a Product framework. Execute:

1. C0 trusted baseline.
2. C1 initial-load dominant cause.
3. C2 filter/search/pagination correctness.
4. C3 panel shell/data boundary.
5. C4 one action at a time, starting with Star and status toggle.
6. C6 authorization parity when any measured path touches policy/query scope.
7. C5 tab-specific slices.
8. C7 realtime/recovery after mutation ownership is stable.
9. C8 Product template extraction.
10. C9 production rollout.

This order fixes real Contact bottlenecks first and allows Product to inherit verified boundaries rather than current incidental complexity.

## 8. Verification matrix

| Concern | Required evidence |
|---|---|
| Initial load | cold/warm deployed timing; query breakdown; payload; React/main-thread profile |
| Filters/search | race tests; completeness contract; server/local semantic parity; URL behavior |
| Pagination | ties/reorder/insert/delete tests; no duplicate/skip under defined semantics |
| Panel | cold/warm bundle and data trace; A→B/close race tests; per-tab request inventory |
| Mutations | direct auth test; transaction test; optimistic rollback; duplicate/retry; response bytes |
| Permissions | role/department matrix; query-policy parity; masking; denied direct action |
| Realtime | two-browser convergence; self echo; stale revision; reconnect/recovery budget |
| Product reuse | one real vertical slice; no domain leakage; Contact regression evidence |

Minimum repository commands must be discovered from current `package.json`; do not invent script names. At the time of this plan, `npm run test:contact` exists, but the executor must add broader production-path tests and run proportionate affected suites. If Pipeline components/shared media or shared workspace infrastructure is changed, run `npm run verify:pipeline` as required by repository instructions.

## 9. Per-slice execution record

Append this for every implemented slice:

```md
### Slice: <action/resource>
- Revision/environment:
- User/data profile:
- Reproduction:
- Hypothesis:
- Baseline (median/range/sample count):
- Dominant layer and evidence:
- Files changed:
- Contract/correctness impact:
- Authorization impact:
- Cache/realtime impact:
- After measurement under equivalent conditions:
- Automated verification:
- Browser verification:
- Remaining risks:
- Rollback:
- Exact next action:
```

## 10. Stop conditions

Stop and request direction when:

- the deployed revision cannot be identified;
- a proposed optimization changes list/count/search semantics without product approval;
- correct Product requirements are unavailable and extraction would require guessing domain behavior;
- production testing would alter real customer data without a safe test identity/restore path;
- authorization or masking parity cannot be proven;
- a database migration/index is proposed without representative plan evidence;
- a phase fails its correctness tests even if its latency improves.

## 11. Definition of done

Contact optimization is complete only when:

- every action in Section 5 has a measured and verified path;
- initial load, filter/search, panel open, and primary mutations meet agreed deployed budgets;
- no partial result is presented as complete;
- list/detail DTOs and tab fetches are bounded and authorized;
- local cache, Pusher, and recovery converge under failure tests;
- role/department behavior is deny-by-default and query-policy consistent;
- Product has adopted a proven shared workspace slice without domain coupling;
- deployed revision evidence, rollback, and durable monitoring are recorded;
- all temporary instrumentation is removed and required suites pass.
