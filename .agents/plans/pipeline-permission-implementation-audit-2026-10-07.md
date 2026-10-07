# Pipeline Performance and Permission Architecture Implementation Audit

> Audit date: 2026-10-07 (Asia/Bangkok)
>
> Scope: implementation parity against `pipeline-action-performance-plan.md` and `role-department-permission-architecture-plan.md`.
>
> Audit mode: read-only source review, current automated verification, and non-destructive production UI observation. No business data or application code was changed by this audit.

## 1. Executive verdict

Neither plan is complete according to its own exit criteria.

- Pipeline performance: P2 is the strongest completed slice at source/test level. P4, P5, P6, P7, and P8 contain useful implementation but are only partial. P3 is not implemented and is missing from the plan's completion table. P9 is not complete.
- Permission architecture: A0 and A4 have useful foundations but are partial. A2 and A3 are partial migrations. A1, A5, A6, A7, A8, and A9 do not have enough implementation/evidence to be called complete.
- Current automated suites are green, but several tests validate copied simulations rather than the real UI/service path required by the plans.
- The production URL is reachable with an authenticated session, but it cannot be proven to run the uncommitted workspace revision. A non-destructive observation showed Archived selected while Active columns/cards remained visible after waiting. Production equivalence therefore remains unverified.

## 2. High-priority findings

### [P0] The workspace and production revision are not proven equivalent

Evidence:

- The working tree contains many modified and untracked implementation files.
- No immutable build identifier was found in the inspected production UI.
- On `https://my-crm-tau-seven.vercel.app/pipeline`, clicking Archived changed the selected tab but Active stage columns and Active cards remained visible after an additional wait.

Impact:

- Local tests cannot prove the reported production behavior is fixed.
- P0 and P9 exit criteria are not met until the exact audited revision is deployed and exercised.

Required closure:

1. Expose/capture an immutable deployment revision.
2. Deploy one reviewed revision.
3. Repeat the production action inventory against that revision.

### [P1] Phase P3 is not implemented; Active board cost remains unbounded

Evidence:

- `getPipelineOpportunitiesForActor()` intentionally has no default limit for Active cards.
- There is no stage pagination or virtualization implementation.
- There is no count-to-latency threshold table or one-stage vertical-slice browser verification.
- The telemetry test only records a supplied byte value; it does not establish bounded transfer/render behavior.
- Phase P3 is absent from Section 9.8's completion table.

Impact:

- Payload, hydration, sorting, DOM, and realtime patch costs still grow with every accessible Active card.
- The current 52-card production view is not evidence that the design remains responsive at larger datasets.

Required closure:

1. Measure representative card counts and main-thread/DOM cost.
2. Choose pagination, virtualization, both, or no structural change from those measurements.
3. Preserve full-dataset counts/revenue/search semantics explicitly.

### [P1] The plan's claim of zero `revalidatePath('/pipeline')` usage is false

Evidence:

- `src/lib/actions/opportunity.ts` calls `revalidatePath('/pipeline')` after `addTeamMember()`.
- The same file calls it after `deleteOpportunity()`.

Impact:

- These actions can trigger an RSC route re-render in the same Server Action response under the installed Next.js behavior.
- The P9 completion statement and the high-frequency mutation invariant are not mechanically true.

Required closure:

- Replace broad route revalidation only after confirming the existing SWR/realtime rollback and delete/member cache paths cover every consumer.

### [P1] Permission migration has two authorities and still permits name-based authorization

Evidence:

- `access-context.ts` and `pipeline-security.ts` both contain actor/session resolution and opportunity access helpers.
- `requireOpportunityAccessWithContext()` duplicates the query/capability flow and currently has no production caller.
- `buildOpportunityAccessWhere()` falls back to Department names when IDs are absent.
- `evaluateOpportunityAccess()` also accepts a name match even when an ID-based actor exists.
- Tests explicitly preserve the legacy name fallback.

Impact:

- A2's single resolver and A3's ID-only authorization exit criteria are not met.
- Policy behavior can drift between duplicate helpers.

Required closure:

1. Make one request context and one entity authorization helper authoritative.
2. Complete caller migration.
3. Remove name fallback only after parity and compatibility telemetry are zero.

### [P1] Cross-request permission freshness is still process-local and has no revocation contract

Evidence:

- `pipelinePermissionCache` is a module-level `Map` with a 30-second TTL.
- `pipelineRecipientCache`, Leaderboard caches, and the metrics buffer are also process-local.
- There is no `permissionVersion`, shared invalidation mechanism, two-instance test, or documented maximum revocation delay.

Impact:

- Different serverless instances may observe different permission/cache state.
- A5 is not implemented and access revocation behavior is not proven.

### [P1] EditPanel still loads inactive code and directory data

Evidence:

- `EditDealPanel.tsx` statically imports all tab components.
- It calls `useSWR("all-users", getAllUsers, ...)` whenever the panel mounts, regardless of active tab.
- Kanban card intent preloads both the panel chunk and `all-users`.

Impact:

- P6's tab-code splitting and inactive-tab network isolation criteria are not met.
- Immediate shell mounting is improved, but the initial panel chunk and request behavior remain broader than necessary.

### [P1] Star/hot-note concurrency tests do not prove the production handler contract

Evidence:

- `pipeline-card-action.test.ts` recreates mutation-ID behavior in local variables instead of invoking the production component hook/handler.
- Star writes accept only the desired boolean and have no expected revision/idempotency key at the database boundary.
- The client guard protects local rollback/paint, but does not prove final database order under requests from separate clients.

Impact:

- P4's rapid repeated input and cross-user convergence exit criteria remain partially verified.

Required closure:

- Add a production-path test for the mutation owner and a two-client/out-of-order database scenario, or serialize/version the operation where product semantics require last-intent-wins.

### [P2] Leaderboard is deferred, but the cold winner path still computes the full leaderboard

Evidence:

- The navbar fetch is scheduled with `requestIdleCallback`, so it is removed from the initial critical path.
- `getDepartmentLeaderboardWinnerSummary()` falls back to `getDepartmentLeaderboardData()` on a cold cache.
- The fallback still performs the full leaderboard computation rather than a dedicated lightweight winner query.
- Caches are process-local.

Impact:

- P5's critical-path goal is partially achieved, but the lightweight server query and reliable invalidation/cache claims are not fully met.

### [P2] Telemetry does not satisfy P8 observability exit criteria

Evidence:

- Metrics are stored in a module-level ring buffer only.
- There is no durable exporter, dashboard, alert integration, or controlled-request verification.
- `isCold` means the first three metrics in a process, not an observed cold server instance.
- Error metrics are not consistently recorded around production actions.

Impact:

- Metrics disappear on process replacement and cannot support production p50/p95 or regression alerts.

### [P2] Realtime audience work remains incomplete

Evidence:

- Every opportunity event can still expand recipients via DB queries and user-specific Pusher channels.
- The recipient result uses a process-local TTL cache.
- There is no recipient-count latency curve, governed replacement channel model, or complete reconnect/access-loss eviction evidence for the plan's A6 exit criteria.

## 3. Pipeline performance phase matrix

| Phase | Audit status | Evidence and gap |
|---|---|---|
| P0 | Partial / stale | Historical baseline exists, but current production revision is not tied to the workspace and Archived currently showed stale Active content. |
| P1 | Historical evidence only | Prior DB/action measurements are useful, but there is no equivalent current-revision browser baseline or post-change comparison. |
| P2 | Substantially implemented | Server search fields, versioned keyset cursor, `NULLS LAST`, deletion resilience, and stale-response guards have focused tests. Browser verification on the deployed audited revision remains pending. |
| P3 | Not complete | Active remains unbounded; no virtualization/pagination or measured decision proving neither is required. Missing from the plan's status table. |
| P4 | Partial | Immediate local pin paint and lean mutation DTO exist. Production handler concurrency, two-client convergence, and equivalent before/after action timing are not proven. |
| P5 | Partial | Navbar work is deferred and payload is lean. Cold winner resolution still computes the full leaderboard; cache is per instance; current before/after production evidence is missing. |
| P6 | Partial | Panel shell no longer awaits the chunk and data keys gate several tabs. All tab code is still statically imported and `all-users` is fetched/preloaded outside tab intent. Full tab browser matrix is missing. |
| P7 | Partial | Mobile Manage subtree is gated and shared user cache exists. No render-count/request-count evidence, full reset verification, or explicit loaded/global filter semantics evidence. |
| P8 | Partial | Board read no longer clears due dates and mutation-time maintenance exists. Telemetry is ephemeral and lacks dashboards/alerts; maintenance-job scheduling/ownership is not established. |
| P9 | Not complete | Production equivalence, full role/action matrix, two-client scenarios, post-deploy measurements, and rollback thresholds are missing. The plan's zero-`revalidatePath` claim is contradicted by source. |

## 4. Permission architecture phase matrix

| Phase | Audit status | Evidence and gap |
|---|---|---|
| A0 | Partial | Pure role/relationship matrices exist, including cross-department fixtures. The full server-action/control inventory, product-owner decisions, and revocation requirement are not recorded. |
| A1 | Partial historical evidence | Some auth timings and query plans exist in the performance plan. Duplicate reads, menu delivery, recipient curves, and current cold/warm measurements are incomplete. |
| A2 | Partial | `AccessContext` and React request memoization exist; pin/hot note pass context. A duplicate resolver/helper remains, and the required underlying-read deduplication test/performance delta is absent. |
| A3 | Partial | Session carries `departmentIds` and Pipeline prefers them. Name fallback remains in authorization policy and tests; compatibility usage is not zero. |
| A4 | Partial | A server-only capability vocabulary, pure policy, and scoped query builder exist. Vocabulary is coarse (`deal:interact`), several Pipeline actions retain direct role/menu checks, and full action-to-capability/end-to-end parity is incomplete. |
| A5 | Not implemented | No permission version, shared cache, two-instance invalidation, or revocation-window contract. Existing module cache is specifically the rejected shortcut for authority. |
| A6 | Not complete | Acting clients often receive authoritative responses, but recipient expansion, per-user channel fan-out, durable recovery, latency curve, and current policy documentation are incomplete. |
| A7 | Not required by current historical DB evidence / not executed | Historical query plans are sub-millisecond. No new index/projection is justified; keep this phase skipped unless scale evidence changes. |
| A8 | Not implemented | No measured consolidation of `getDbMenus`/visible keys or server-delivered initial navigation contract. Client provider remains presentation logic. |
| A9 | Not complete | No shadow comparison, full boundary matrix, deployed monitoring, rollback thresholds, or legacy cleanup. |

## 5. What is genuinely verified

Observed in this audit session:

- `npm run verify:pipeline`: 128/128 tests passed and TypeScript passed.
- `npm run test:calendar`: 66/66 passed.
- `npm run test:contact`: 20/20 passed.
- Total: 214/214 automated tests passed.
- `git diff --check` completed before the final preflight step and reported no diff error.
- The full command returned exit code 1 only because the Fable preflight reported debug/unfinished markers.
- No `actorOverride` parameter was found in exported actions under the audited action/API paths.
- Current source contains stable Archive cursor ordering with explicit `NULLS LAST`.
- Production is authenticated and displays 52 Active cards for the observed user.

Not verified:

- Current workspace equals current production deployment.
- Production before/after performance of the new implementation.
- Browser trace, React commit duration, bundle split, network isolation for every tab, or defensible p95.
- Live concurrent Neon behavior for rapid pin/hot-note operations or permission changes.
- Multi-instance permission/recipient/Leaderboard cache invalidation.

## 6. Recommended execution order

1. **Restore truthfulness of the release boundary:** identify deployment revision, remove false completion claims, and deploy one reviewed revision.
2. **Close correctness/security gaps before further optimization:** consolidate AccessContext/policy authority, define revocation behavior, and remove remaining broad route revalidation only with cache/realtime parity tests.
3. **Finish P3 with measurements:** establish Active-board scale thresholds, then implement stage pagination/virtualization only as evidence requires.
4. **Finish P4/P6 production paths:** test real handlers and split/gate panel tab code/data; verify rapid mutations and all tab opens in browser.
5. **Replace ephemeral observability:** send low-cardinality metrics to an owned production sink and create actionable dashboards/alerts.
6. **Complete deployed P9/A9 verification:** role matrix, permission-negative checks, two-client realtime/reconnect, equivalent production measurements, and rollback thresholds.

## 7. Acceptance gate before calling both plans complete

Both plans may be marked complete only when all of the following are recorded against one immutable deployed revision:

- Phase tables contain every phase, including P3.
- No source claim is contradicted by repository search.
- Active and Archived browser journeys pass for representative roles.
- Search beyond page 1, clearing search, ties, deletion, and rapid query replacement pass in production.
- Star/hot-note/drag and EditPanel tabs meet the agreed UX budgets with failure/retry behavior verified.
- Permission list and mutation decisions match for ADMIN, MANAGEMENT single/multi-department, GENERAL owner/member/unrelated, and denied/no-department users.
- Department rename/removal and role/menu revocation meet a documented maximum delay across more than one server instance.
- Realtime acting-client confirmation, second-client convergence, reconnect recovery, and access-loss behavior pass.
- Persistent production metrics show action p50/p95, DB contribution, error rate, and payload size without CRM PII.
- `npm run verify:pipeline`, Calendar, Contact, and formatting checks pass on the final revision.

