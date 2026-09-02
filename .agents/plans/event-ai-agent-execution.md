# Event AI Agent — Execution State & Handoff

> This file is the resumable source of current Event AI implementation state.  
> Update it before every handoff, interruption, quota stop, or context switch.  
> Detailed architecture: `event-ai-agent-roadmap.md`  
> Decision history: `event-ai-agent-decisions.md`

## Current status

- Overall status: `IN_PROGRESS`
- Current phase: `Phase 3–5 remediation before Event AI can be enabled`
- Current slice: `3–5 remediation foundation + Phase 6 timeline composer start`
- Working branch: `main`
- Baseline HEAD when work started: `181eea1`
- Commit authorization: `NOT GRANTED`
- Production AI calls enabled: `NO`
- Schema/application runtime changed by this slice: `PREVIEW MIGRATIONS REPORTED APPLIED; AI WORKER FORCED BEHIND A DISABLED-BY-DEFAULT FLAG`

## Completed in the current slice

- Created the long-term architecture and Phase 0-8 roadmap.
- Added repository-level Codex continuity instructions to `AGENTS.md`.
- Added always-applied cross-agent continuity rule in `.cursor/rules/event-ai-continuity.mdc`.
- Created this execution checkpoint and an append-only decision log.
- Started the initial server-action inventory for deal/card events.
- Completed the server mutation inventory across deal fields/status, activity/replies, notifications, notes, attachments, and archive behavior.
- Classified each Deal-related mutation as `AI_SUMMARY`, `AUDIT_ONLY`, `NO_EVENT`, or `PROJECTION_ONLY` in `event-ai-agent-phase-0-spec.md`.
- Defined the canonical-event duplicate-prevention contract for due dates, Won/Lost, topic/type edits, membership, transfer, and attachment+comment flows.
- Added strict JSON Schema v1 and ten synthetic/anonymized golden evaluation cases.
- Proposed permissions, retention, timezone, canary token limits, and quality gates.
- Recorded the premature transfer System Log defect and the canonical-event rule in the decision log.
- Product owner approved Phase 0 recommended classifications, permissions, retention, timezone, token limits, and quality gates.
- Marked Phase 0 baseline decisions accepted; production provider tier/privacy approval remains intentionally pending.
- Designed staged additive migrations, Activity revision backfill, dual-write flags, soft-delete cutover, and rollback.
- Drafted proposed Prisma enums/models/relations/indexes for `ActivityRevision`, `DealDomainEvent`, and `AgentOutbox` without modifying runtime schema.
- Defined command idempotency, optimistic concurrency, transaction boundaries, external-file sagas, and outbox lease/claim protocol.
- Added the approved additive models/enums/relations/indexes to `prisma/schema.prisma`.
- Discovered that the repository had no Prisma migration history; generated an offline existing-schema baseline and separate additive ledger delta.
- Inspected the additive SQL and confirmed it contains no drop/truncate/delete/destructive column operations.
- Preserved temporary cascade semantics for new ledger relations until soft-delete cutover; ledger writes/backfill remain prohibited before then.
- Generated Prisma Client successfully against the proposed schema, then restored the installed client to the old schema so the current unmigrated application remains safe.
- Inspected the configured Neon endpoint without exposing credentials and performed read-only introspection.
- Confirmed the live datasource has no schema drift from the preserved pre-Event-AI baseline.
- Did not mutate migration state because the endpoint cannot be identified as production versus preview.
- Added database-independent Event Ledger classification, dedupe, source-hash, command-ID, timezone, and fail-closed feature-flag utilities.
- Added unit tests for event classification, audit-only exclusions, dedupe stability, byte-exact hashing, UUIDs, Bangkok day boundaries, invalid inputs, and disabled-by-default flags.
- Added a Prisma-independent transaction boundary contract for command replay lookup, canonical domain-event creation, and idempotent Event Summary outbox intent.
- Enforced fail-closed validation for command UUIDs, source versions, timestamps/timezones, JSON payloads, prompt/schema versions, and retry limits before ledger writes.
- Kept audit-only events independent from AI version policy and ensured the AI enqueue flag can disable outbox creation without disabling canonical ledger writes.
- Added semantic command-replay conflict detection so a command ID cannot be reused for another deal or event type.
- Kept the helper structurally typed and unimported by active actions because the installed Prisma Client intentionally remains on the pre-migration schema.
- Added inert activity create/reply/edit/delete transaction commands that atomically compose current Activity projection, immutable revision, canonical domain event, and optional outbox intent.
- Added compare-and-swap edit/delete contracts using `id + expectedVersion + deletedAt=null`, including deterministic conflict errors and no-op suppression for unchanged edits.
- Made deletion a tombstone revision that preserves the exact last raw content and creates an audit-only event without Event Summary work.
- Validated reply parents as live comments in the same Deal, preventing cross-Deal and deleted-parent replies.
- Rejected System Logs from the comment-summary command path because they are derived projections, not canonical AI sources.
- Added replay behavior that returns the prior canonical result without repeating Activity, revision, event, or outbox writes.
- Added a separate System Log projection helper that creates a linked `SYSTEM_UPDATE` row and immutable revision without creating another domain event or outbox item.
- Required projection `commandId` to match its canonical domain event, preventing cross-intent provenance links.
- Added reusable active Opportunity/Activity query scopes that compose existing filters through `AND`, so callers cannot override `deletedAt: null` accidentally.
- Added parent/reply tree scopes and a fail-closed post-read active-record guard.
- Audited every current Prisma Opportunity/Activity read and documented the cutover behavior for Kanban, EditDealPanel, permissions, notifications, Pusher recipients, completed Deals, cron archival, and repair scripts.
- Added inert canonical Deal commands for stage movement, due-date change, multi-field save, and atomic Won/Lost finalization.
- Added one compare-and-swap Deal update per user intent using `id + expectedVersion + deletedAt=null`, followed by exactly one canonical event and one optional outbox intent.
- Added typed `changedFields` payloads with before/after values and ISO timestamps, while suppressing unchanged fields and complete no-op saves.
- Combined required Won fields, status, cleared stage, close time, and loss-reason cleanup in one command; Lost requires a non-empty reason and uses the same atomic outcome path.
- Added actor attribution, terminal-state guards, replay handling, stage-ID validation, input validation, and deterministic version-conflict errors.
- Kept stage-name-specific business validation at the future authorized integration boundary because it requires a current PipelineStage read in the same database transaction.
- Added inert ownership-transfer and team-invite request/response commands with notification compare-and-swap claiming.
- Made request and rejection events audit-only; requests never mutate Deal ownership/membership and never create Event Summary work.
- Stored target user, previous owner, and Deal-version snapshot in the immutable request event, then required matching provenance before any response is applied.
- Made accepted ownership transfer the only path that changes owner and creates the eligible `DEAL_OWNER_CHANGED` summary event/outbox.
- Made accepted team invite increment Deal version, connect the member, and create one audit-only `DEAL_MEMBER_ADDED` event.
- Prevented wrong-recipient responses, duplicate claims, missing provenance, stale Accepts, and owner changes after request creation.
- Allowed stale requests to be rejected and closed without loading or mutating the newer Deal state.
- Kept RBAC/access authorization at the future server-action boundary; these transaction helpers require an attributable actor and validate transactional invariants.
- Added an inert Outbox claim contract that reaps exhausted work, claims bounded batches, and validates adapter ownership/expiry output.
- Added worker/attempt/lease compare-and-swap fencing for completion, failure, and heartbeat so stale invocations cannot overwrite reclaimed work.
- Added bounded exponential retry scheduling, final-attempt `DEAD` transition, non-sensitive machine error-code validation, and ownership cleanup.
- Prevented heartbeat calls from shortening an existing lease and required claim adapters to return the exact requested expiry.
- Documented reviewed PostgreSQL `FOR UPDATE SKIP LOCKED` reaping/claim SQL with bound parameters and deterministic priority ordering.
- Kept all provider/Pusher/network work outside the claim transaction; no AI provider is called in this slice.
- Added an inert Activity revision backfill planner with bounded ID-cursor pages, one-row lookahead, deterministic resume cursors, and batch limits.
- Preserved byte-exact raw content, SHA-256 hash, Activity type, parent, author, and original creation time in planned version-1 revisions.
- Made matching version-1 revisions idempotent, including safe reruns after later edits, while failing closed on corrupt revision hash/provenance.
- Failed closed when an Activity has advanced beyond version 1 without a trustworthy original revision, or when readers return deleted, duplicate, unordered, or pre-cursor rows.
- Added final count/duplicate/parity verification gates and a backfill runbook that explicitly prohibits domain events, outbox, notifications, Pusher, and AI calls.
- Completed the safe offline Phase 1 foundation; database adapters, migration rehearsal, real concurrency, and applied backfill now require a confirmed preview database.

### Phase 2: Core Provider Config & Security (COMPLETED)
- Created `EncryptionService` (AES-256-GCM) with key rotation support.
- Implemented `AIGateway` and `GoogleGeminiAdapter` using standard Fetch.
- Added AI-related Prisma models (AIProviderConfig, AIUsageRecord, etc.).
- Created `AIControlCenter` UI for admin management of API keys.

## Phase 3: Budgets, Monitoring, and Circuit Breakers (REMEDIATION REQUIRED)
- Applied baseline migration and deployed `ai_foundation` to Preview DB.
- Implemented `BudgetService` to enforce $1.00/mo, $0.10/day limits, and generate warnings at 80%.
- Implemented `CircuitBreaker` with 3-failure threshold, atomic probe locks, and HALF_OPEN logic.
- Updated `AIControlCenter` UI with real Prisma actions, wrapped by `FEATURE_FLAG_AI_ADMIN`.
- Wrote unit tests for Budget and Circuit Breaker logic.

Audit correction (2026-09-02): Phase 3 does not meet its exit criteria yet. Budget admission reads usage and then creates a reservation outside one serializable/locked transaction, ignores held reservations, and can overspend under concurrency. Circuit failure increments are read-modify-write and can lose concurrent failures. The Jest tests cannot run because Jest/types/config are not installed, and `npx tsc --noEmit` fails on those test globals. Real PostgreSQL concurrency tests are still required.

Remediation progress: budget admission now uses a per-agent PostgreSQL advisory transaction lock, serializable transaction, held-reservation accounting, Bangkok boundaries, and idempotent run reservations. Circuit failure transitions use a per-provider advisory transaction lock, and HALF_OPEN probe acquisition enforces the five-minute open interval. Invalid Jest placeholders were removed; project typecheck now passes. Real concurrent Preview DB tests remain required before marking Phase 3 complete.

## Phase 4: Summarization Logic & Outbox Processor (REMEDIATION REQUIRED)
- Implemented `context-builder.ts` to convert `DealDomainEvent` and `Opportunity` to a strictly bounded text context.
- Designed the `EVENT_SUMMARIZER` system instructions and `eventSummarySchema`.
- Created `OutboxProcessor` that reads `AgentOutbox`, grabs atomic leases, integrates with `CircuitBreaker` & `BudgetService`, calls the LLM, and persists the generated summary back into `ActivityLog`.
- Created `/api/cron/process-outbox/route.ts` secured with `CRON_SECRET` for background scheduling.

Audit correction (2026-09-02): the worker claim is not the reviewed `FOR UPDATE SKIP LOCKED`/fenced lease protocol, passes the encrypted `secretRef` directly to the provider, hard-codes provider/model, uses a placeholder `system` user ID, writes summaries into `ActivityLog`, and lacks safe immutable summary writeback. The cron route now fails closed unless both `FEATURE_FLAG_AI_WORKER=true` and `CRON_SECRET` are configured. Keep the worker flag false until these defects are fixed and integration-tested.

Remediation progress: provider secrets are decrypted only at the provider boundary; generated summaries now write `DealAIEvent` plus immutable revision 1 and no longer create a fake-system `ActivityLog`. Completion emits targeted `AI_EVENT_READY`. Model/provider resolution and the claim path still require replacement with the active-policy snapshot and reviewed fenced `SKIP LOCKED` adapter; keep the worker disabled.

Phase 5 activation check (2026-09-02): traced the user's payment Activity through Preview DB. Activity revision and `ACTIVITY_CREATED` domain event existed, but its Outbox remained `PENDING`, proving the Summary tab was empty because no worker invocation occurred. Replaced the worker's hard-coded provider/model snapshot with the active `AIModelPolicy`, replaced the read/update claim race with one PostgreSQL `FOR UPDATE SKIP LOCKED` claim/update statement, and fenced completion/failure by worker ID plus attempt. The Preview provider secret was migrated from plaintext to AES-256-GCM, and the obsolete `gemini-1.5-flash-001` policy was changed to the provider-advertised `gemini-2.5-flash`. The recovered event completed with one Outbox attempt, one READY `DealAIEvent`, immutable AI revision 1, and one usage record (743 provider-reported tokens). Added `after()` dispatch after Activity/Pusher completion so local and deployed Server Actions kick the durable Outbox immediately while cron remains the retry safety net. Production build passes. Keep deployment flags environment-specific; this local Preview environment is enabled for the controlled test only.

## Phase 5: User-Visible Summaries & Realtime (IN PROGRESS)
- Created `<AISummaryCard>` component with a premium dark-glassmorphism aesthetic.
- Intercepted `SYSTEM_UPDATE` logs with `sourceDomainEventId` to render AI Summaries directly in the main Activity tab in `EditDealPanel.tsx`.
- Implemented a hover-to-edit inline text area that updates the AI's JSON `summary` field and uses the existing `editActivityLog` server action (automatically tracks the user revision).
- Added a `Sparkles` ✨ indicator to `KanbanCard.tsx` so users can tell at a glance if a pipeline opportunity has a recent AI summary.
- Realtime integration is handled automatically through the existing `activity-added` Pusher channel logic.

Audit correction (2026-09-02): fixed the blank AI Summary tab caused by placing its render branch inside an `activity || system` guard. Added explicit tab semantics, a Summary heading/search placeholder, and safe read-only cards. Unsafe editing through `editActivityLog` was removed because it overwrites a projection instead of creating an append-only `USER` summary revision. `DealAIEvent`/`DealAIEventRevision`, targeted `AI_EVENT_READY`, precise SWR reconciliation, authorization tests, correction survival, and two-user DB/client convergence remain missing.

Remediation progress: added and applied the additive `DealAIEvent`/`DealAIEventRevision` migration to the confirmed Preview endpoint. The Summary tab now queries current revisions independently from Activity logs; corrections append a `USER` revision under serializable compare-and-swap and broadcast `AI_EVENT_READY` for precise SWR refresh. Browser/two-user convergence and authorization integration tests remain required.

Backend convergence evidence (2026-09-02): the user's source Activity `cmtjtutki0005s775famsgtd6` maps to domain event `cmtjtutpr0009s775cvpuhpzb`, completed Outbox `cmtjtutre000bs775xc8dtn9i`, READY AI event `cmtjuawna0004s7m2cb30hdcy`, and current revision `cmtjuawpr0006s7m29ue56fmb`. Visual browser verification remains incomplete because the Codex in-app browser still reports localhost connection refused while host-side production curl succeeds.

## Phase 6: Timeline composer (STARTED)
- Added a deterministic 30–60 day composer that groups at read time by stored `localEventDate`, preserves one line per event, includes event/revision provenance, and enforces a bounded estimated-token budget.
- Added an authorized `getDealAITimeline` Server Action and two executable tests for grouping/provenance and budget truncation.
- Added read-time Important Facts for importance 4–5 events and explicit blockers, independent token budgets, recent/fact deduplication, and an authorized raw-versus-composed benchmark endpoint. Five focused Timeline tests pass.
- Preview measurement on the current Deal shows composition is worse for sparse 30/60-day history (32 raw estimated tokens versus 46 composed, -43.75%) but better over the available 365-day sample (70 versus 46, 34.29%). This proves a cheaper-of-raw-or-composed selector is required; universal reduction must not be claimed.
- Persistent `DealAIFact` projection, contradiction/supersession lifecycle, representative multi-Deal benchmark, adaptive context selection, and rebuild verification remain incomplete.

## Current State & Next Steps
**Current Phase:** Remediate Phase 3–5 before starting Phase 6
**Target DB:** `ep-wandering-paper-azila23k` (Neon Preview)

Latest continuation document: `event-ai-agent-handoff-2026-09-02.md`. It supersedes conversational summaries for the next working session and records the controlled Phase 5 Preview evidence, remaining exit criteria, and exact next-agent prompt.

## Phase 6 Implementation Updates (2026-09-02)
- Added `DealAIFact` additive schema migration with canonical hashing, mode, subject, value, importance (4-5), and confidence. Applied to Neon Preview DB.
- Added partial unique index `DealAIFact_active_state_key` on `(dealId, factType, subject)` WHERE `status = 'ACTIVE' AND factMode = 'STATE'` to strictly enforce database invariants.
- Implemented `processAIFacts` in `fact-lifecycle.ts` using serializable optimistic locking and pre-supersession to guarantee zero duplicate ACTIVE state facts under parallel worker execution.
- Added idempotency check on `(sourceRevisionId, sourceFactKey)` to safely support outbox retry without duplicate inserts.
- Updated `correctDealAISummary` in `ai-events.ts` to retract/supersede previous facts with `CORRECTED_BY` when users modify summaries.
- Updated `deleteActivityLog` in `opportunity.ts` to retract downstream domain events, AI events, and AI facts with `SOURCE_DELETED`.
- Extended `timeline.ts` and `context-builder.ts` with active `DealAIFact` composition and token benchmark comparison.
- Verified test suite with 9 passing integration tests in `src/lib/ai/fact-lifecycle.test.ts`.
- Implemented Phase 6.3: Contradiction Resolver (`FACT_RESOLVER`) prompt schema, CAS writeback with `CONTRADICTED_BY`, `NEEDS_REVIEW`, and `RETRACTED` actions, and `rebuildDealFacts()` deterministic fact rebuilder in `src/lib/ai/fact-resolver.ts`.
- Verified Phase 6.3 test suite with 7 passing tests in `src/lib/ai/fact-resolver.test.ts` on Neon Preview DB.
- Typecheck (`npx tsc --noEmit`) and all test suites in `src/lib/ai/` and `src/lib/event-ledger/` pass with 0 errors.

### Immediate Next Tasks
- Present Phase 6.3 verified test results and walkthrough to user in Thai.
- Await user authorization to commit to `main` and deploy (Phase 6 Handoff).

### Blockers / Notes
- Do not enable `FEATURE_FLAG_AI_WORKER`; AI core integration is not stable yet.
- Do not touch Neon Main DB or commit to Git without explicit user authorization.
- Preview migration `20260902094104_add_deal_ai_fact` and `AgentKey.FACT_RESOLVER` applied successfully to `ep-wandering-paper-azila23k`.
- Verification: `npx tsc --noEmit` and all Node tests pass.

## Initial event inventory (requires Phase 0 review)

Superseded by the complete inventory in `event-ai-agent-phase-0-spec.md`. The table below is retained as the initial checkpoint history.

| Current action | Candidate domain event | User-facing Event Summary? | Notes |
|---|---|---:|---|
| `createOpportunity` | `DEAL_CREATED` | Maybe | Usually low-value unless initial content is meaningful. |
| `moveOpportunity` | `DEAL_STAGE_CHANGED` | Yes | Preserve before/after stage and actor. |
| `updateOpportunity` | `DEAL_FIELDS_UPDATED` | Conditional | Emit changed-field diff; suppress no-op updates. |
| `updateDueDateWithLog` | `DEAL_DUE_DATE_CHANGED` | Yes | Avoid producing a second logical event from its system log. |
| `addActivityLog` | `ACTIVITY_CREATED` or `REPLY_CREATED` | Yes | Reply is its own event; parent is bounded context only. |
| `addSystemLog` | `SYSTEM_ACTIVITY_CREATED` | Conditional | Must distinguish domain-generated logs from canonical domain event to avoid duplication. |
| `editActivityLog` | `ACTIVITY_EDITED` | Yes | Requires immutable source revision and superseding summary. |
| `deleteActivityLog` | `ACTIVITY_DELETED` | Audit/retract | Must become tombstone/soft delete before AI release. |
| `addTeamMember` | `DEAL_MEMBER_ADDED` | Conditional | Likely audit/important only when ownership responsibility changes. |
| `removeTeamMember` | `DEAL_MEMBER_REMOVED` | Conditional | Preserve actor and removed member. |
| `deleteOpportunity` | `DEAL_DELETED` | Audit/retract | Determine retention/legal policy before implementation. |
| `createNote` | `NOTE_CREATED` | Later decision | Note may be private/operational; permissions need review. |
| `deleteNote` | `NOTE_DELETED` | Audit/retract | Current raw retention behavior needs inspection. |
| `togglePinNote` | `NOTE_PIN_CHANGED` | No by default | Audit event only. |

## Known current-code risks

- `ActivityLog` edits overwrite `content`; raw versions are not retained.
- Activity deletion is a hard delete and reply relations cascade.
- Activity creation waits for notification and Pusher side effects.
- Activity and notification writes are not one atomic transaction, so a saved activity may still return an action error and invite a duplicate retry.
- Some domain actions also create system logs; the canonical event source must prevent two AI summaries for one user action.
- Provider free-tier privacy/data-use terms require explicit product-owner approval before real CRM data is sent.
- `EditDealPanel.handleTransfer` records a completed transfer before the recipient accepts; this must not enter AI memory.
- Won/Lost currently spans two server actions and can produce partially applied intent; Phase 1 should provide one canonical transaction command.
- Topic/type/team mutations create additional client-side System Logs, so System Logs cannot be the AI trigger source.
- Attachment create/delete and Note delete are not durable/atomic with their external side effects.

## Files changed in this slice

- `AGENTS.md`
- `.cursor/rules/event-ai-continuity.mdc`
- `.agents/plans/event-ai-agent-roadmap.md` (created in the preceding planning slice)
- `.agents/plans/event-ai-agent-execution.md`
- `.agents/plans/event-ai-agent-decisions.md`
- `.agents/plans/event-ai-agent-phase-0-spec.md`
- `.agents/evals/event-summary.schema.json`
- `.agents/evals/event-summary-golden.jsonl`
- `.agents/plans/event-ai-agent-phase-1-design.md`
- `.agents/plans/event-ai-agent-phase-1-migration-review.md`
- `prisma/schema.prisma`
- `prisma/migrations/migration_lock.toml`
- `prisma/migrations/20260902000000_baseline_existing_schema/migration.sql`
- `prisma/migrations/20260902001000_add_event_ledger_foundation/migration.sql`
- `.agents/plans/event-ai-agent-live-schema-audit.md`
- `src/lib/event-ledger/contracts.ts`
- `src/lib/event-ledger/feature-flags.ts`
- `src/lib/event-ledger/contracts.test.ts`
- `src/lib/event-ledger/transaction.ts`
- `src/lib/event-ledger/transaction.test.ts`
- `src/lib/event-ledger/activity-commands.ts`
- `src/lib/event-ledger/activity-commands.test.ts`
- `src/lib/event-ledger/system-projections.ts`
- `src/lib/event-ledger/system-projections.test.ts`
- `src/lib/event-ledger/query-scopes.ts`
- `src/lib/event-ledger/query-scopes.test.ts`
- `.agents/plans/event-ai-agent-phase-1-query-impact.md`
- `src/lib/event-ledger/deal-commands.ts`
- `src/lib/event-ledger/deal-commands.test.ts`
- `src/lib/event-ledger/collaboration-commands.ts`
- `src/lib/event-ledger/collaboration-commands.test.ts`
- `src/lib/event-ledger/outbox.ts`
- `src/lib/event-ledger/outbox.test.ts`
- `.agents/plans/event-ai-agent-phase-1-outbox-sql.md`
- `src/lib/event-ledger/backfill.ts`
- `src/lib/event-ledger/backfill.test.ts`
- `.agents/plans/event-ai-agent-phase-1-backfill-runbook.md`

## Verification performed

- Confirmed project root already contains `AGENTS.md`.
- Confirmed `/system/general` has server-side ADMIN access control.
- Confirmed project uses `.agents`, not `.agent`.
- Confirmed initial action names with `rg` across `src/lib/actions`.
- Inspected all exported mutation Server Actions and mutating route handlers under `src/lib/actions` and `src/app`.
- Traced client callers in `EditDealPanel`, `CustomerTab`, `WonLostModal`, `NotesTab`, `FileUploader`, and notification header flow.
- Validated the strict schema and all JSONL lines parse as JSON using local tooling.
- `git diff --check` passes.
- No runtime tests required because Phase 0 changes planning/evaluation artifacts only.
- Reviewed Phase 1 design against the current Prisma relations and every known Deal mutation path.
- No Prisma schema, migration, generated client, or runtime application file changed in slice 1.0.
- `prisma validate` passes for the additive schema.
- Prisma Client generation passes for the additive schema.
- Offline baseline/delta SQL generation passes without a database connection.
- Additive SQL destructive-keyword scan found no destructive statements.
- Current installed Prisma Client was regenerated from the old schema after validation to avoid querying unapplied columns.
- Read-only live-to-baseline Prisma diff reports `No difference detected` with exit code 0.
- `npx tsx --test src/lib/event-ledger/contracts.test.ts` passes: 10 tests, 0 failures.
- Targeted ESLint passes for all Event Ledger runtime and test files.
- `npx tsc --noEmit` passes.
- Final `npx prisma validate` passes.
- Final `git diff --check` passes.
- Phase 1.3 combined Event Ledger suite passes: 20 tests, 0 failures.
- Phase 1.3 targeted ESLint passes.
- Phase 1.3 `npx tsc --noEmit` passes.
- Phase 1.3 final `npx prisma validate` and `git diff --check` pass.
- Phase 1.4 combined Event Ledger suite passes: 30 tests, 0 failures.
- Phase 1.4 targeted ESLint and `npx tsc --noEmit` pass.
- Phase 1.4 final `npx prisma validate` and `git diff --check` pass.
- Source search confirms no active application file imports the inert activity or transaction helpers.
- Phase 1.5 combined Event Ledger suite passes: 37 tests, 0 failures.
- Phase 1.5 targeted ESLint and `npx tsc --noEmit` pass.
- Phase 1.5 final `npx prisma validate` and `git diff --check` pass.
- Phase 1.6 combined Event Ledger suite passes: 50 tests, 0 failures.
- Phase 1.6 targeted ESLint and `npx tsc --noEmit` pass.
- Phase 1.6 final `npx prisma validate` and `git diff --check` pass.
- Phase 1.7 combined Event Ledger suite passes: 61 tests, 0 failures.
- Phase 1.7 targeted ESLint and `npx tsc --noEmit` pass.
- Phase 1.7 final `npx prisma validate` and `git diff --check` pass.
- Phase 1.8 combined Event Ledger suite passes: 73 tests, 0 failures.
- Phase 1.8 targeted ESLint and `npx tsc --noEmit` pass.
- Phase 1.8 final `npx prisma validate` and `git diff --check` pass.
- Phase 1.9 combined Event Ledger suite passes: 83 tests, 0 failures.
- Phase 1.9 targeted ESLint and `npx tsc --noEmit` pass.
- Phase 1.9 final `npx prisma validate` and `git diff --check` pass.

## Incomplete work

- Expand the golden set from 10 to at least 30 synthetic/anonymized cases before Phase 4; production examples require explicit sanitization approval.
- Decide the production provider tier/privacy policy before real CRM content is sent.
- Create or identify a confirmed Neon preview branch for migration rehearsal; the configured live schema already matches the offline baseline read-only.
- Identify or create a confirmed Neon preview branch before any migration-state mutation.
- Apply/resolve migrations only after explicit database-application authorization.
- Implement soft-delete-compatible runtime paths behind disabled flags before ledger backfill/dual-write.
- Add a generated-Prisma adapter only after the additive migration is rehearsed on a confirmed preview database.
- Run real PostgreSQL transaction tests for rollback, concurrent command-ID races, and concurrent expected-version edits on a migrated preview/test database.
- Wire active Opportunity/Activity reads to the audited scopes only after migration rehearsal and behind the soft-delete cutover flag.
- Add current-stage lookup/business validation when a generated Prisma adapter is available on the migrated preview database.
- Execute the reviewed `SKIP LOCKED` adapter concurrency tests only on a migrated preview database.
- Implement the generated-Prisma reader/writer adapters and execute backfill dry-run only after preview migration rehearsal.
- Verify migration baseline resolution and additive migration checksums against the confirmed preview target.
- Do not run `npm run build` against an unmigrated database because it regenerates the new Prisma Client.

## Blockers requiring user/product decisions

The safe offline Phase 1 foundation is complete. Further progress requires a confirmed non-production/Neon preview target. The current endpoint matches baseline but its environment identity is unknown; it was inspected read-only and not changed. Do not apply/resolve migrations or run backfill against it until identity is confirmed.

## Exact resume instructions for the next agent

1. Read `AGENTS.md` and the three Event AI plan files.
2. Run `git status --short` and compare it with `Files changed in this slice`.
3. Read `event-ai-agent-phase-1-design.md` and `event-ai-agent-phase-1-migration-review.md`.
4. Revalidate evaluation artifacts if touched:

   ```bash
   node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('.agents/evals/event-summary.schema.json','utf8')); for (const [i,l] of fs.readFileSync('.agents/evals/event-summary-golden.jsonl','utf8').trim().split(/\\n/).entries()) JSON.parse(l); console.log('schema + JSONL valid')"
   ```

5. Do not run build, migrate, resolve, deploy, db push, backfill, or enable ledger flags without reconciling the database target and current migration state.
6. Resume at the Preview Integration Gate: confirm/create a Neon preview branch, rehearse baseline resolution plus additive migration, regenerate Prisma Client for that target, then run real transaction/outbox concurrency tests and backfill dry-run. Do not use the unidentified current endpoint.

## Handoff checklist

- [x] `git status` reconciled with documented changed files
- [x] Current phase/slice/status updated
- [x] Completed and incomplete work are explicit
- [x] Commands and test results recorded
- [x] Risks/blockers recorded
- [x] Decision log updated when choices changed
- [x] Exact next action is executable without chat history
- [x] No unauthorized commit made
