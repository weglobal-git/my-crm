# Role, Department, Permission, and Data-Scope Architecture Plan

> Status: READY FOR EXECUTION — architecture migration plan only; no implementation has been performed.
>
> Scope: CRM authorization foundations with Pipeline as the first vertical slice. This plan separates Role, Department membership, capability, menu visibility, resource relationship, data scope, and realtime audience while preserving immediate access revocation.
>
> Mandatory companion instructions: repository `AGENTS.md`, `.agents/skills/crm-feature-architecture/SKILL.md`, `.agents/skills/menu-permissions/SKILL.md`, `.agents/skills/pipeline-deal-panel-architecture/SKILL.md`; also read `.agents/skills/pusher-management/SKILL.md` before changing channel/audience behavior and the installed Next.js authentication/caching guides before framework-dependent code.

## 1. Objective

Create a durable authorization architecture that is:

- secure by default and enforced on the server;
- fast enough that authorization is not the dominant cost of ordinary actions;
- consistent across pages, server actions, menus, filters, and realtime delivery;
- explicit about what a user may do and which records they may see;
- invalidatable when roles, departments, or permissions change;
- testable as policy without requiring a browser;
- adoptable incrementally without a big-bang migration.

## 2. Current model and verified pressure points

### Current behavior

- A user has one coarse `Role` and can belong to many Departments.
- Department menu permissions are unioned: permission from any assigned department makes the menu visible.
- ADMIN bypasses ordinary menu and data-scope restrictions.
- MANAGEMENT reads opportunities owned by, or shared with, users in any of the manager's departments.
- GENERAL reads opportunities they own or where they are a team member.
- JWT/session resolution queries User plus Departments on every request to keep identity state fresh.
- Pipeline access performs a separate department-menu permission lookup, cached in a process-local `Map` for 30 seconds.
- opportunity mutations commonly perform another scoped opportunity lookup.
- realtime recipient resolution traverses opportunity owner/member departments and selects users before triggering per-user channels.
- client menu permissions are fetched after session through `getDbMenus()` and `getUserVisibleMenuKeys()`.

### Architectural problems to solve

1. Identity freshness is purchased with a database read on every request.
2. Actor/permission/resource checks can repeat within one action.
3. process-local caches are not reliable shared caches on serverless infrastructure.
4. Department names, rather than immutable IDs, are carried in the authorization actor.
5. Menu visibility, feature permission, data scope, and realtime audience are related but insufficiently separated.
6. MANAGEMENT scope uses nested many-to-many `OR` predicates that may be expensive at scale.
7. the same policy can drift when reimplemented by different server actions.
8. client permission fetch adds post-session requests and can delay stable navigation/UI.
9. per-mutation recipient expansion can add database and Pusher latency.

## 3. Target authorization model

### Separate concepts

| Concept | Answers | Example |
|---|---|---|
| Identity | Who is acting? | user ID |
| Role | What responsibility template applies? | ADMIN, MANAGEMENT, GENERAL |
| Department membership | Which organizational groups apply? | immutable department IDs |
| Capability | Which operation is allowed? | `pipeline.deal.update` |
| Resource relationship | How is the actor related to this record? | owner, team member |
| Data scope | Which records can be queried? | own, team, department, all |
| Menu visibility | Which navigation is displayed? | `pipeline`, `pipeline.notes` |
| Realtime audience | Which authorized clients receive an event? | user/department channels |

Menu visibility must never be the only server authorization for a business operation.

### Target request context

```ts
type AccessContext = {
  userId: string;
  role: Role;
  departmentIds: string[];
  capabilities: ReadonlySet<Capability>;
  permissionVersion: number;
};
```

The exact type/API must be validated against current callers before implementation. It must not include names as authorization identifiers.

### Target request flow

```text
resolveAccessContext once per request/action
  → requireCapability(context, operation)
  → buildResourceScope(context, operation)
  → query/mutate authoritative data
  → return authoritative revision/result
  → publish authorized realtime event via governed delivery path
```

## 4. Security and migration invariants

1. Client `canSee()` is presentation only; it never authorizes a server operation.
2. Default is deny when identity, capability, or scope cannot be resolved.
3. No phase may widen a user's accessible record set unintentionally.
4. Access revocation latency must be explicitly defined, measured, and tested.
5. Do not cache full sensitive record results as an authorization shortcut.
6. Cache keys must include user/tenant/scope/version where applicable.
7. Role/department change invalidation must not depend on one server instance's memory.
8. Department rename must not alter authorization identity.
9. ADMIN bypass behavior must remain explicit, not emerge accidentally from empty filters.
10. Pusher events must be authorized and must not become the acting user's only confirmation.
11. Migration must remain reversible until parity tests pass.
12. No schema migration or commit without explicit user authorization and the repository's normal migration workflow.

## 5. Capability and scope proposal

Start with Pipeline capabilities; do not invent a universal CRM matrix before validating the vertical slice.

Suggested initial capabilities:

```text
pipeline.access
pipeline.deal.read
pipeline.deal.create
pipeline.deal.update
pipeline.deal.move
pipeline.deal.pin
pipeline.deal.close
pipeline.deal.delete
pipeline.deal.members.manage
pipeline.sales_fields.read
pipeline.sales_fields.update
pipeline.activity.read
pipeline.activity.write
pipeline.notes.read
pipeline.notes.write
pipeline.shared_media.read
pipeline.shared_media.write
pipeline.summary.read
pipeline.summary.generate
pipeline.manager_call.use
pipeline.stage_titles.update
```

Do not add all capabilities immediately. Map only existing distinct server policies; merge names that have identical policy and are unlikely to diverge.

Suggested data scopes:

```text
NONE
OWNED
OWNED_OR_MEMBER
DEPARTMENT
ALL
```

Capabilities answer “may perform”; scope answers “on which records.” Both must pass.

## 6. Phase plan

### Phase A0 — Freeze the current authorization contract in tests

Goal: prevent the migration from silently changing who can see or mutate what.

Steps:

1. Inventory every server-side Pipeline authorization entry point and its callers (check: grep-generated matrix covers all `requirePipelineActor`, `requireOpportunityAccess`, permission action, and direct role checks).
2. Inventory client-only guards separately and identify actions lacking an equivalent server guard (check: every interactive control maps to its server enforcement or is flagged).
3. Build a policy matrix for ADMIN, MANAGEMENT single/multi-department, GENERAL owner/member/unrelated, and no-department users (check: product owner signs off ambiguous rows).
4. Add pure tests for current opportunity read scope and representative mutations (check: tests encode current allow/deny outcomes before refactor).
5. Add cross-department boundary fixtures: owner in A, member in B, manager in A/B, unrelated C (check: union semantics are explicit).
6. Document current access-revocation behavior and acceptable maximum delay (check: measurable requirement exists).

Exit criteria:

- server policy matrix is complete for Pipeline;
- ambiguous business decisions are resolved or block only the affected capability;
- tests fail if a known allowed/denied path is inverted;
- no production behavior changed.

### Phase A1 — Measure authorization cost before redesign

Goal: quantify the performance contribution and choose the smallest architecture needed.

Steps:

1. Add temporary correlated timings for session/JWT DB read, Pipeline permission, resource scope lookup, recipient resolution, and Pusher (check: timings reconcile with total action latency).
2. Measure representative read and mutation actions for each role profile (check: comparison table by role and department count).
3. Capture query plans for MANAGEMENT nested department predicates, GENERAL owner/member predicates, visible-menu resolution, and recipient lookup (check: actual rows and expensive scans/joins recorded).
4. Count duplicate identity/access reads inside one request/action (check: trace identifies exact duplicate callers).
5. Measure cold and warm server instances to expose process-local cache behavior (check: results are labeled and compared).

Decision gate:

- If authorization is a minor fraction, implement consistency phases but do not introduce a complex shared cache.
- If repeated resolution dominates, prioritize A2.
- If nested scope queries dominate, prioritize A4 after A2.
- If recipient resolution/Pusher dominates mutations, prioritize A6 after policy parity.

Exit criteria: each proposed optimization is tied to measured cost or a security/consistency defect.

### Phase A2 — Introduce request-scoped Access Context without policy changes

Goal: resolve identity once and reuse it while producing identical decisions.

Steps:

1. Define a server-only `AccessContext` using current role and department semantics (check: type cannot be imported into a client bundle through value imports).
2. Implement one resolver with request-scoped memoization supported by the installed Next.js version; read relevant local Next.js docs first (check: two resolver calls in one request perform one underlying identity read).
3. Allow existing authorization helpers to accept an explicit context while retaining current fallback during migration (check: old and new call paths return identical decisions).
4. Convert one low-risk vertical slice, recommended Star/pin, through context → capability-equivalent current check → scoped update → response (check: allow/deny parity and performance measurement).
5. Sweep all sibling callers before changing helper defaults (check: caller inventory updated).
6. Expand to hot note and one read path only after the slice passes (check: no duplicate actor resolution within migrated actions).

Exit criteria:

- no authorization behavior change in parity tests;
- migrated actions resolve identity once per request;
- measured duplicate-query reduction is recorded;
- `npm run verify:pipeline` passes.

Rollback: migrated helpers retain a compatibility wrapper until all callers and parity tests pass.

### Phase A3 — Migrate authorization identity from Department names to IDs

Goal: make department identity immutable and rename-safe.

Steps:

1. Audit every consumer of `session.user.departments` and classify display vs authorization usage (check: complete caller list).
2. Add `departmentIds` alongside existing names in session/token contracts; do not remove names yet (check: old UI continues to display labels).
3. Update `AccessContext` and new scope builders to use IDs (check: department rename leaves authorization outcomes unchanged).
4. Add compatibility translation only at the session boundary, not throughout business code (check: authorization modules contain no name-based department filters after migration).
5. Migrate page/action callers in small slices with parity tests (check: each slice passes the A0 matrix).
6. Remove name-based authorization fields only after production telemetry shows no legacy use (check: repository search and logged compatibility counter are zero).

Exit criteria:

- department names are display data only;
- authorization uses IDs;
- rename, multi-department, and removed-department tests pass;
- `npm run verify:pipeline` passes.

### Phase A4 — Centralize capability and resource-scope policy

Goal: replace scattered role/menu checks with one server policy vocabulary.

Steps:

1. Derive the minimal capability set from the A0 inventory (check: every capability has at least one real server consumer).
2. Implement pure role/department/menu-to-capability resolution with deny-by-default behavior (check: table-driven tests).
3. Implement one opportunity scope builder for list operations and one entity authorization helper for mutations (check: both use the same policy primitives).
4. Keep UI menu visibility mapping separate, deriving presentation from capabilities only where explicitly intended (check: hiding/showing a menu cannot by itself grant server access).
5. Convert one full vertical feature, recommended pin plus hot note, then Activity, before broader adoption (check: end-to-end allow/deny and performance tests).
6. Remove direct role comparisons only when no caller remains for that policy; retain business-specific checks such as owner-only rules where required (check: repository search plus policy matrix).

Exit criteria:

- policy lives in a small server-owned module;
- list and mutation authorization agree;
- no client guard is treated as authoritative;
- A0 policy matrix remains green;
- `npm run verify:pipeline` passes.

### Phase A5 — Add safe cross-request permission freshness only if evidence requires it

Goal: reduce repeated identity/permission reads without extending access beyond the agreed revocation window.

Prerequisite: A1 proves cross-request reads are material. Otherwise skip this phase.

Steps:

1. Define a monotonic `permissionVersion` source changed by role, department membership, or capability/menu permission mutations (check: every administrative mutation increments or invalidates it transactionally).
2. Put only minimal claims and version in the session/token (check: token does not contain the full menu registry or sensitive records).
3. Design shared cache keys by user ID + permission version; never rely on module-level `Map` as the authority (check: two instances observe invalidation within the agreed window).
4. Preserve immediate/near-immediate denial for user deletion and high-risk access loss (check: revocation integration test).
5. Use shorter TTL or direct checks for high-risk operations if required by the threat model (check: documented operation classes).
6. Roll out read-only capability caching before mutation authorization caching (check: cache-hit telemetry and denial tests).

Exit criteria:

- revocation meets the agreed maximum delay;
- no stale cache can widen access after version change;
- cache hit/miss and latency benefit are measured;
- safe fallback denies or directly resolves on cache failure.

Rejected shortcut: simply stop the per-request user read and trust a long-lived JWT with no revocation/version contract.

### Phase A6 — Redesign realtime audience calculation

Goal: remove unnecessary recipient expansion from mutation latency while preserving authorized delivery and recovery.

Before implementation, read the Pusher management skill and update its guide/policy matrix as required.

Steps:

1. Inventory Pipeline channels, events, authorization, event payloads, and cache consumers (check: current behavior is documented, not inferred).
2. Measure recipient-resolution and Pusher time by recipient count (check: latency curve).
3. Choose channel ownership deliberately:
   - user channels for private/user-specific events;
   - department channels only when every subscriber is authorized for that event shape;
   - entity channels only with server authorization and lifecycle governance.
4. Make mutation response the acting user's authoritative confirmation; use realtime for other clients and recovery (check: acting client succeeds when Pusher is delayed, without claiming unpersisted success).
5. Emit lightweight operation/entity/revision events rather than full sensitive DTOs when clients can safely patch/refetch (check: payload audit and permission test).
6. Add reconnect/missed-event recovery and access-loss unsubscribe/eviction behavior (check: two-client disconnect/reconnect scenario).
7. Remove per-action recipient queries only after the replacement passes delivery and authorization tests (check: no unauthorized subscriber receives the event).

Exit criteria:

- mutation latency is not dominated by recipient expansion/Pusher;
- cross-user convergence remains correct;
- channel permission and recovery documentation is current;
- `npm run verify:pipeline` passes.

### Phase A7 — Optimize data-scope queries from query-plan evidence

Goal: make Department and team visibility scale without changing policy.

Steps:

1. Re-run query plans after ID migration and context centralization (check: current bottleneck confirmed).
2. Verify indexes on implicit many-to-many join tables and Opportunity filters using database metadata/plan evidence (check: plan identifies index use or justified migration).
3. Prefer simpler equivalent predicates and selected IDs over deep relation payloads (check: parity tests and query-plan improvement).
4. If nested predicates still fail budgets, prototype a maintained visibility projection only for Pipeline:
   - define source-of-truth relationships;
   - define transactional/eventual update semantics;
   - define rebuild and drift detection;
   - define revocation behavior.
5. Do not deploy a denormalized visibility table without parity comparison against authoritative policy (check: randomized/representative dataset comparison returns zero differences).

Exit criteria:

- query plans meet agreed budgets or a measured projection design is approved;
- every optimization preserves the A0 access set exactly;
- migrations have rollback/rebuild procedures;
- `npm run verify:pipeline` passes.

### Phase A8 — Consolidate menu delivery and client permission UX

Goal: avoid redundant post-session permission requests while keeping server authority intact.

Steps:

1. Measure `getDbMenus` and `getUserVisibleMenuKeys` request timing and render impact (check: initial shell request waterfall).
2. Cache slow-changing menu metadata separately from user capability resolution (check: menu edits invalidate metadata without flushing unrelated record data).
3. Deliver initial visible navigation from an authorized server boundary where compatible with the installed Next.js architecture (check: no client flash of unauthorized menus and no duplicate initial fetch).
4. Retain client hooks for presentation only and update them from authoritative permission changes (check: client cannot call a forbidden server action successfully).
5. Verify multi-department union and locked-child menu behavior (check: existing menu-permission tests plus browser matrix).

Exit criteria:

- initial navigation is stable and does not require redundant permission round trips;
- server actions remain independently authorized;
- admin menu changes propagate within the documented window.

### Phase A9 — Rollout, refutation, and deprecation cleanup

Steps:

1. Run old-vs-new policy in shadow comparison for representative reads where safe; do not return shadow results (check: difference counter is zero or every difference is explained).
2. Run the full A0 policy matrix and Pipeline functional suite (check: exact results recorded).
3. Attack boundaries: no departments, multiple departments, renamed department, removed membership, deleted user, role downgrade, simultaneous permission change and mutation, stale client session, reconnect (check: all expected denies/allows recorded).
4. Run `npm run verify:pipeline` (check: exit code 0).
5. Deploy in reversible slices with failure-rate, deny-rate, auth-time, and query-time monitoring (check: rollback thresholds documented).
6. Remove compatibility paths, name-based authorization, and process-local permission caches only after telemetry proves no use (check: repository search and production counters).
7. Update architecture and Pusher documentation to describe implemented behavior only (check: docs match code and tests).

Exit criteria:

- no unexplained old/new policy difference;
- revocation and cross-department boundaries pass;
- authorization is no longer a dominant measured action cost, or remaining cost is justified by the security contract;
- legacy paths are removed safely.

## 7. Recommended file ownership boundaries

Exact filenames may change after the Phase A0 caller trace; do not create abstractions before confirming consumers.

```text
src/lib/auth.ts
  Session/JWT lifecycle only.

src/lib/access/access-context.ts
  Server-only request context resolution and request memoization.

src/lib/access/capabilities.ts
  Capability identifiers and pure resolution rules.

src/lib/access/opportunity-policy.ts
  Opportunity list scope and entity authorization.

src/lib/access/permission-version.ts
  Version/invalidation contract, only if Phase A5 is justified.

src/lib/pipeline-security.ts
  Temporary compatibility facade during migration; eventually thin wrappers or retired.

src/providers/PermissionProvider.tsx
  Client presentation state only; no security authority.
```

Avoid a single giant authorization module and avoid a generic framework without two real consumers.

## 8. Test requirements

### Pure policy tests

- every role × capability × scope combination;
- multi-department union;
- owner/member/unrelated relationships;
- ADMIN explicit bypass;
- default deny;
- department rename and removal;
- capability revocation/version change.

### Integration tests

- list scope equals mutation authorization for the same user/deal;
- session/context resolves once per request;
- permission change invalidates within the promised window;
- stale token cannot override a newer denial;
- menu visibility does not grant an unauthorized mutation;
- realtime subscription and event payload respect scope.

### Performance checks

- DB query count per representative action;
- session/authorization p50 and p95 with defensible sample size;
- MANAGEMENT one vs multiple departments;
- cold/warm instance behavior;
- recipient count vs mutation latency.

## 9. Required migration log per slice

```text
Slice:
Current policy being preserved:
Users/resources affected:
Baseline query count and latency:
Files/callers traced:
Files changed:
Old/new decision parity result:
Revocation result:
Performance result:
Tests and exact output:
Rollback path:
Known limitations:
Exact next action:
```

## 10. Explicitly rejected approaches

- Trusting client-hidden buttons as authorization.
- Treating a visible menu as permission to perform every action under it.
- Replacing fresh authorization with a long-lived JWT and no revocation mechanism.
- Using Department names as permanent authorization keys.
- Depending on one server instance's in-memory cache for security correctness.
- Adding database row-level security in the first slice without proving that application-policy parity and operational tooling are ready.
- Building a global ABAC engine before the Pipeline vertical slice proves the capability vocabulary.
- Denormalizing opportunity visibility without rebuild, drift detection, and revocation semantics.
- Refactoring all CRM pages in one release.

## 11. Relationship to the performance plan

This plan supplies authorization improvements to the Pipeline performance plan but must not run as an uncontrolled parallel rewrite.

Recommended coordination:

1. Execute Pipeline Performance Phase P0 and P1.
2. Execute Authorization Phase A0 and A1 using the same trace IDs and role profiles.
3. If repeated authorization work is material, implement A2 as the first architecture slice.
4. Resume the highest measured Pipeline bottleneck.
5. Continue A3–A9 incrementally after the immediate P0/P1 bottlenecks are stabilized.

This order produces real performance evidence before committing to architecture while establishing policy tests before shared authorization code changes.

## 12. Implementation & Parity Status (October 7, 2026)

| Phase | Description | Status | Verification & Evidence |
|---|---|---|---|
| **Phase A0** | Baseline Policy & Relationship Matrix Tests | **COMPLETED & VERIFIED** | Pure unit policy matrix in `pipeline-policy.test.ts` (18 tests) and `pipeline-capabilities.test.ts` (19 tests) covering ADMIN bypass, MANAGEMENT department isolation, GENERAL owner/member/unrelated, and default deny. |
| **Phase A1** | Authorization Latency & Query Trace | **COMPLETED** | Sub-millisecond EXPLAIN query plans and action baseline documented in companion performance plan. |
| **Phase A2** | Request-Scoped Access Context | **COMPLETED & CONSOLIDATED** | Server session resolved once per request via `resolveAccessContext()` wrapped in `React.cache()`. Single authoritative entity checker `requireOpportunityAccess` in `pipeline-security.ts`. Redundant helpers purged. Tested in `access-context.test.ts`. |
| **Phase A3** | Immutable Department IDs | **PARTIALLY ADOPTED** | Session carries `departmentIds`. Policy prefers IDs with legacy name fallback retained for backward compatibility during transition. |
| **Phase A4** | Capability Vocabulary & Pure Evaluator | **COMPLETED & VERIFIED** | Server-only capability vocabulary (`deal:view`, `deal:edit_card`, `deal:edit_dates`, `deal:manage_members`, `deal:interact`) in `pipeline-capabilities.ts`. Exported actions enforce capabilities on server. |
| **Phase A5** | Revocation & Shared Invalidation | **ROADMAP** | In-memory 30s TTL currently used in serverless instance. Distributed shared invalidation (Redis/Upstash) designated for future multi-instance infrastructure phase. |
| **Phase A6** | Governed Realtime Audience | **ROADMAP** | Channel fan-out and per-user recipient optimization designated for future phase. |
| **Phase A7–A9** | DB Projections, Menu Delivery & Global Rollout | **ROADMAP** | Deferred until multi-page rollout phase. |

